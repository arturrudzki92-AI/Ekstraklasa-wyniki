import json, os, sys
from pathlib import Path
from datetime import datetime, timezone
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


def next_three_rounds(matches):
    """Return fixtures from the next three matchdays, not just today."""
    now = datetime.now(timezone.utc)
    finished = {'finished', 'ft', 'full_time', 'completed', 'ended',
                'cancelled', 'canceled', 'postponed', 'abandoned'}
    live = {'live', 'in_progress', 'playing', '1h', '2h', 'ht'}
    scheduled = {'scheduled', 'upcoming', 'not_started', 'notstarted',
                 'ns', 'pending', 'fixture', 'tbd', 'timed', 'planned'}
    upcoming = []
    for m in matches:
        status = str(m.get('status') or '').lower().strip()
        dt = match_datetime(m.get('date'))
        if status in finished:
            continue
        # Include future matches even when the API calls them "scheduled".
        # Also include scheduled matches whose kickoff is not yet published.
        if status in live or (dt is not None and dt >= now) or (dt is None and status in scheduled):
            upcoming.append(m)

    upcoming.sort(key=lambda m: (match_datetime(m.get('date')) is None,
                                 match_datetime(m.get('date')) or now))
    if not upcoming:
        from collections import Counter
        statuses = Counter(m.get('status') for m in matches)
        print('DIAGNOSTYKA: brak przyszłych meczów; statusy API:', dict(statuses),
              '; przykładowe daty:', [m.get('date') for m in matches[:5]])
        return []

    def round_number(m):
        r = m.get('round')
        if isinstance(r, int):
            return r
        if isinstance(r, str):
            import re
            match = re.search(r'\d+', r)
            return int(match.group()) if match else None
        return None

    # Select the first three rounds in chronological order, including all
    # remaining fixtures from the current round.
    rounds = []
    for m in upcoming:
        n = round_number(m)
        if n is not None and n not in rounds:
            rounds.append(n)
        if len(rounds) == 3:
            break
    if rounds and all(round_number(m) is not None for m in upcoming):
        return [m for m in upcoming if round_number(m) in rounds]
    return upcoming[:27]


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
    matches = []
    for e in events:
        matches.append({
            'id': e.get('id'),
            'date': first(e, 'event_date', 'date', 'kickoff', 'start_time'),
            'status': str(first(e, 'status', 'match_status') or 'unknown').lower(),
            'home': team(e, 'home'),
            'away': team(e, 'away'),
            'home_score': score(e, 'home'),
            'away_score': score(e, 'away'),
            'round': first(e, 'round', 'matchday', 'round_name')
        })
    matches.sort(key=lambda x: str(x.get('date') or ''))
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
        'upcoming': next_three_rounds(matches),
        'results': [m for m in matches if m['status'] == 'finished'][::-1],
        'standings': table
    }
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"OK: {data['league']} / {data['season']}; meczów {len(matches)}, nadchodzących {len(data['upcoming'])}, tabela {len(table)}")


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print('BLAD:', e, file=sys.stderr)
        sys.exit(1)
