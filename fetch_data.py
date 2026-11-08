import json, os, sys, re
from pathlib import Path
from datetime import datetime, timezone, timedelta
import requests

BASE = 'https://sports.bzzoiro.com/api/v2'
KEY = os.getenv('BSD_API_KEY', '').strip()
S = requests.Session()
S.headers.update({'Authorization': f'Token {KEY}', 'Accept': 'application/json'})
OUT = Path('site/data.json')


def get(path, params=None):
    r = S.get(BASE + path, params=params, timeout=25)
    if r.status_code == 401:
        raise RuntimeError('401: nieprawidłowy klucz API lub nieaktywne konto.')
    if r.status_code == 402:
        raise RuntimeError('402: ten zasób wymaga płatnego planu.')
    if r.status_code == 429:
        raise RuntimeError('429: limit zapytań API został przekroczony.')
    r.raise_for_status()
    return r.json()


def rows(x):
    if isinstance(x, list):
        return x
    if isinstance(x, dict):
        for k in ('results', 'leagues', 'events', 'standings', 'seasons', 'data'):
            if isinstance(x.get(k), list):
                return x[k]
    return []


def paged(path, params):
    out = []
    params = dict(params, limit=200, offset=0)
    for _ in range(12):
        x = get(path, params)
        batch = rows(x)
        out += batch
        if isinstance(x, dict) and x.get('next'):
            u = x['next']
            r = S.get(u, timeout=25)
            r.raise_for_status()
            x = r.json()
            out += rows(x)
            while isinstance(x, dict) and x.get('next') and len(out) < 2400:
                r = S.get(x['next'], timeout=25)
                r.raise_for_status()
                x = r.json()
                out += rows(x)
            break
        if len(batch) < 200:
            break
        params['offset'] += len(batch)
    return out


def first(d, *keys):
    for k in keys:
        v = d.get(k)
        if v is not None and v != '':
            return v
    return None


def team(e, side):
    v = first(e, f'{side}_team', f'{side}_team_name', f'{side}_name')
    if isinstance(v, dict):
        return first(v, 'name', 'team_name') or 'Nieznana drużyna'
    if v:
        return str(v)
    v = e.get(side)
    if isinstance(v, dict):
        return first(v, 'name', 'team_name') or 'Nieznana drużyna'
    return str(v or 'Nieznana drużyna')


def score(e, side):
    v = first(e, f'{side}_score', f'{side}_goals')
    if v is not None:
        return v
    for k in ('score', 'scores'):
        d = e.get(k)
        if isinstance(d, dict):
            d = d.get('fulltime') or d.get('full_time') or d
            if isinstance(d, dict) and d.get(side) is not None:
                return d[side]
    return None


def match_datetime(value):
    """Parse an API kickoff timestamp as a timezone-aware datetime."""
    if value is None:
        return None
    try:
        if isinstance(value, (int, float)):
            return datetime.fromtimestamp(value, tz=timezone.utc)
        raw = str(value).strip().replace('Z', '+00:00')
        dt = datetime.fromisoformat(raw)
        return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
    except (ValueError, TypeError, OverflowError):
        return None


def parse_round_number(raw):
    """Parse the official matchday from Bzzoiro, ignoring general labels."""
    if isinstance(raw, dict):
        for key in ('round_number', 'number', 'matchday', 'round', 'round_label'):
            found = parse_round_number(raw.get(key))
            if found is not None:
                return found
        return None
    if isinstance(raw, bool) or raw is None:
        return None
    if isinstance(raw, (int, float)):
        n = int(raw)
        return n if n == raw and 1 <= n <= 38 else None
    label = str(raw).strip()
    match = (re.fullmatch(r'(\d{1,2})', label)
             or re.search(r'(?:kolejka|matchday|round|gameweek|runda)\s*[#:.-]*\s*(\d{1,2})\s*$', label, flags=re.I))
    if not match:
        return None
    n = int(match.group(1))
    return n if 1 <= n <= 38 else None


def event_round_number(event):
    # BSD documents round_number as the official matchday.
    for key in ('round_number', 'matchday', 'round', 'round_label', 'round_name'):
        found = parse_round_number(event.get(key))
        if found is not None:
            return found
    return None


# Wartości statusów mogą się różnić zależnie od źródła meczu.
LIVE_STATUSES = {'live', 'in_progress', 'inprogress', 'playing', '1h', '2h', 'ht',
                 'halftime', 'half_time', 'extra_time', 'et'}
FINISHED_STATUSES = {'finished', 'ft', 'full_time', 'completed', 'ended'}
STOPPED_STATUSES = {'cancelled', 'canceled', 'postponed', 'abandoned'}


def is_live_match(m):
    return str(m.get('status') or '').lower().strip() in LIVE_STATUSES


def is_finished_match(m):
    return str(m.get('status') or '').lower().strip() in FINISHED_STATUSES


def normalize_event(e):
    """Ujednolicona forma potrzebna aplikacji. Zachowuje wynik 0:0!"""
    return {
        'id': first(e, 'id', 'event_id'),
        'date': first(e, 'event_date', 'date', 'kickoff', 'start_time'),
        'status': str(first(e, 'status', 'match_status') or 'unknown').lower().strip(),
        'home': team(e, 'home'),
        'away': team(e, 'away'),
        'home_score': score(e, 'home'),
        'away_score': score(e, 'away'),
        'round': event_round_number(e),
        'minute': first(e, 'current_minute', 'minute') if first(e, 'current_minute', 'minute') is not None else (e.get('time') or {}).get('minute') if isinstance(e.get('time'), dict) else None,
        'period': first(e, 'period', 'match_period') if first(e, 'period', 'match_period') is not None else (e.get('time') or {}).get('period') if isinstance(e.get('time'), dict) else None,
        'provider_updated_at': first(e, 'last_updated_at', 'last_update_at', 'updated_at', 'last_update')
    }


def minute_number(raw):
    """Approximate match minute only for comparing API snapshots (never guessing it)."""
    if isinstance(raw, bool) or raw is None:
        return None
    try:
        text = str(raw).strip().replace('′', '').replace("'", '')
        match = re.fullmatch(r'(\d{1,3})(?:\+(\d{1,2}))?', text)
        if match:
            return int(match.group(1)) + int(match.group(2) or 0)
    except (TypeError, ValueError):
        pass
    return None


def updated_time(raw):
    if raw is None:
        return None
    try:
        dt = match_datetime(raw)
        return dt.timestamp() if dt else None
    except (OverflowError, TypeError, ValueError):
        return None


def merge_live_snapshot(existing, candidate, origin):
    """Never overwrite a newer clock with a clearly older source snapshot."""
    previous_minute = minute_number(existing.get('minute'))
    candidate_minute = minute_number(candidate.get('minute'))
    previous_stamp = updated_time(existing.get('provider_updated_at'))
    candidate_stamp = updated_time(candidate.get('provider_updated_at'))
    older_clock = (previous_minute is not None and candidate_minute is not None
                   and candidate_minute < previous_minute)
    has_fresher_stamp = (candidate_stamp is not None and
                         (previous_stamp is None or candidate_stamp > previous_stamp))
    if older_clock and not has_fresher_stamp:
        print(f'DIAGNOSTYKA LIVE: odrzucono starszy odczyt {origin} '
              f'ID={existing.get("id")} minuta={candidate_minute} zamiast {previous_minute}')
        return

    new_status = candidate.get('status')
    if new_status in FINISHED_STATUSES:
        existing['status'] = 'finished'
    elif new_status in STOPPED_STATUSES:
        existing['status'] = new_status
    else:
        existing['status'] = 'live'

    for field in ('home_score', 'away_score', 'minute', 'period', 'provider_updated_at'):
        if candidate.get(field) is not None:
            existing[field] = candidate[field]
    if not existing.get('date') and candidate.get('date'):
        existing['date'] = candidate['date']
    if existing.get('round') is None and candidate.get('round') is not None:
        existing['round'] = candidate['round']
    existing['live_source'] = origin


def unpack_event(raw):
    if not isinstance(raw, dict):
        return {}
    for key in ('event', 'match', 'data'):
        if isinstance(raw.get(key), dict) and (
            'id' in raw[key] or 'event_id' in raw[key]
        ):
            return raw[key]
    return raw


def enrich_with_live_feed(matches, league_id, season_id):
    """Cross-check live list with individual match detail for halftime/second half.

    An API provider can return an outdated feed even when our site rebuild succeeds.
    Diagnostics never include the API key or full private response.
    """
    by_id = {str(m['id']): m for m in matches if m.get('id') is not None}
    live_items = []
    try:
        live_items = rows(get('/events/live/', {
            'league_id': league_id, 'season_id': season_id
        }))
    except (requests.RequestException, ValueError) as error:
        print('OSTRZEZENIE: endpoint live niedostepny:', type(error).__name__)

    for raw in live_items:
        e = unpack_event(raw)
        if not e:
            continue
        candidate = normalize_event(e)
        event_id = candidate.get('id')
        if event_id is None:
            continue
        existing = by_id.get(str(event_id))
        if existing is None:
            if candidate['home'] == 'Nieznana drużyna' or candidate['away'] == 'Nieznana drużyna':
                continue
            candidate['status'] = 'live'
            candidate['live_source'] = 'events/live'
            matches.append(candidate)
            by_id[str(event_id)] = candidate
        else:
            merge_live_snapshot(existing, candidate, 'events/live')

    # This adds at most one detail request per live match (up to 8), keeping
    # 15-minute GitHub Actions scheduling comfortably within ordinary API limits.
    live_candidates = [m for m in matches if is_live_match(m) and m.get('id') is not None]
    for m in live_candidates[:8]:
        event_id = m['id']
        if not re.fullmatch(r'\d+', str(event_id)):
            continue
        try:
            raw = get(f'/events/{event_id}/')
            e = unpack_event(raw)
            if e:
                detail = normalize_event(e)
                merge_live_snapshot(m, detail, 'events/detail')
        except (requests.RequestException, ValueError) as error:
            print(f'OSTRZEZENIE: detal live ID={event_id}: {type(error).__name__}')

    now = datetime.now(timezone.utc)
    for m in matches:
        if not is_live_match(m):
            continue
        dt = match_datetime(m.get('date'))
        minute = minute_number(m.get('minute'))
        provider_dt = match_datetime(m.get('provider_updated_at'))
        # Warn only, NEVER fabricate a clock or a score. Delays can originate
        # at Bzzoiro or an upstream feed. 90 min since kickoff with 45' data
        # is suspicious even after allowing for the interval.
        stale_clock = dt is not None and (now - dt) > timedelta(minutes=90) and minute is not None and minute <= 45
        stale_provider = provider_dt is not None and (now - provider_dt) > timedelta(minutes=25)
        m['live_data_delayed'] = bool(stale_clock or stale_provider)
        print('DIAGNOSTYKA LIVE:', f'ID={m.get("id")}', f'status={m.get("status")}',
              f'minuta={m.get("minute")}',
              f'wynik={m.get("home_score")}:{m.get("away_score")}',
              f'zrodlo={m.get("live_source", "events/list")}',
              f'opoznione={m["live_data_delayed"]}')
    print('DIAGNOSTYKA: liczba spotkań /events/live/:', len(live_items),
          '; liczba sprawdzonych szczegółów:', min(len(live_candidates), 8))
    return matches


def needs_status_confirmation(m, now):
    """Planowany początek już minął, ale API nie potwierdziło jeszcze live/FT."""
    if is_live_match(m) or is_finished_match(m):
        return False
    status = str(m.get('status') or '').lower().strip()
    if status in STOPPED_STATUSES:
        return False
    dt = match_datetime(m.get('date'))
    return dt is not None and timedelta(minutes=1) <= now - dt <= timedelta(hours=4)


def next_five_rounds(matches):
    """Pięć najbliższych kolejek, bez spotkań już rozpoczętych."""
    now = datetime.now(timezone.utc)
    scheduled = {'scheduled', 'upcoming', 'not_started', 'notstarted',
                 'ns', 'pending', 'fixture', 'tbd', 'timed', 'planned', 'unknown'}
    upcoming = []
    for m in matches:
        status = str(m.get('status') or '').lower().strip()
        if status in LIVE_STATUSES | FINISHED_STATUSES | STOPPED_STATUSES:
            continue
        dt = match_datetime(m.get('date'))
        if (dt is not None and dt > now) or (dt is None and status in scheduled):
            upcoming.append(m)

    upcoming.sort(key=lambda m: (match_datetime(m.get('date')) is None,
                                 match_datetime(m.get('date')) or now))
    rounds = []
    for m in upcoming:
        n = parse_round_number(m.get('round'))
        if n is not None and n not in rounds:
            rounds.append(n)
        if len(rounds) == 5:
            break
    if rounds and all(parse_round_number(m.get('round')) is not None for m in upcoming):
        return [m for m in upcoming if parse_round_number(m.get('round')) in rounds]
    return upcoming[:45]


def main():
    if not KEY:
        raise RuntimeError('Brak sekretu BSD_API_KEY w ustawieniach GitHub Actions.')

    leagues = paged('/leagues/', {'country': 'Poland'})
    found = [x for x in leagues if 'ekstraklasa' in str(first(x, 'name', 'league_name') or '').lower()]
    if not found:
        names = ', '.join(str(first(x, 'name', 'league_name') or '?') for x in leagues[:30])
        raise RuntimeError('Nie znaleziono Ekstraklasy. Polskie ligi w API: ' + (names or 'brak'))

    found.sort(key=lambda x: (
        0 if str(x.get('name', '')).strip().lower() == 'ekstraklasa' else 1,
        0 if x.get('is_active') else 1
    ))
    league = found[0]
    lid = league.get('id')

    try:
        season = get(f'/leagues/{lid}/season/')
    except requests.RequestException:
        season = {}

    if not isinstance(season, dict) or not season.get('id'):
        season_response = get(f'/leagues/{lid}/seasons/')
        seasons = rows(season_response)
        if not seasons:
            # Show response structure without exposing the API key or full data.
            if isinstance(season_response, dict):
                details = 'klucze odpowiedzi: ' + ', '.join(map(str, season_response.keys()))
                details += '; fragment: ' + str(season_response)[:500]
            else:
                details = 'typ: ' + type(season_response).__name__ + '; fragment: ' + str(season_response)[:500]
            raise RuntimeError(f'API nie zwróciło sezonów Ekstraklasy (liga ID: {lid}); {details}')
        seasons.sort(key=lambda x: (bool(x.get('is_current')), int(x.get('year') or 0)), reverse=True)
        season = seasons[0]

    sid = season.get('id')
    events = paged('/events/', {'league_id': lid, 'season_id': sid})
    matches = [normalize_event(e) for e in events if isinstance(e, dict)]
    # Nawet przy wyniku 0:0 są zachowywane obie liczby zero.
    enrich_with_live_feed(matches, lid, sid)
    matches.sort(key=lambda x: str(x.get('date') or ''))
    rounds_present = sorted({m['round'] for m in matches if m['round'] is not None})
    print(f"DIAGNOSTYKA: oficjalne numery kolejek z API: {rounds_present}")
    print(f"DIAGNOSTYKA: API zwróciło {len(matches)} meczów")

    st = get(f'/leagues/{lid}/standings/', {'season_id': sid})
    table = rows(st)
    if isinstance(st, dict) and not table:
        groups = st.get('groups')
        if isinstance(groups, dict):
            for gn, gr in groups.items():
                for r in (gr if isinstance(gr, list) else []):
                    table.append(dict(r, group_name=gn))
        elif isinstance(groups, list):
            for g in groups:
                for r in (g.get('standings') or g.get('rows') or []):
                    table.append(dict(r, group_name=g.get('name')))

    table = [{
        'position': first(r, 'position', 'rank', 'place'),
        'team': first(r, 'team_name', 'team', 'name') or 'Nieznana drużyna',
        'played': first(r, 'played', 'matches_played', 'pld'),
        'won': first(r, 'won', 'wins', 'w'),
        'drawn': first(r, 'drawn', 'draws', 'd'),
        'lost': first(r, 'lost', 'losses', 'l'),
        'gf': first(r, 'gf', 'goals_for'),
        'ga': first(r, 'ga', 'goals_against'),
        'points': first(r, 'pts', 'points')
    } for r in table]

    data = {
        'ok': True,
        'updated_at': datetime.now(timezone.utc).isoformat(),
        'source': 'Bzzoiro Sports Data',
        'league': first(league, 'name', 'league_name') or 'Ekstraklasa',
        'season': first(season, 'name') or str(season.get('year') or 'Bieżący sezon'),
        'upcoming': next_five_rounds(matches),
        'live': [m for m in matches if is_live_match(m)],
        'pending': [m for m in matches if needs_status_confirmation(m, datetime.now(timezone.utc))],
        'results': [m for m in matches if is_finished_match(m)][::-1],
        'standings': table
    }
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"OK: {data['league']} / {data['season']}; meczów {len(matches)}, na żywo {len(data['live'])}, nadchodzących {len(data['upcoming'])}, tabela {len(table)}")


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print('BLAD:', e, file=sys.stderr)
        sys.exit(1)
