// Ekstraklasa 4.2.10: rozwijane kolejki i delikatne wyróżnienie Górnika Zabrze bez gwiazdek.
// Dane wciąż pochodzą z tego samego site/data.json. Nie potrzebujemy klucza API w przeglądarce.
const content = document.querySelector('#content');
const seasonEl = document.querySelector('#season');
const updatedEl = document.querySelector('#updated');
const refreshBtn = document.querySelector('#refresh');
let data = null;
let tab = 'results';
let competition = 'ekstraklasa';
const competitionButtons = [...document.querySelectorAll('.competition-choice')];
const pageTitle = document.querySelector('h1');
const tableTab = document.querySelector('.tab[data-tab="table"]');

const el = (tag, cls, txt) => {
  const x = document.createElement(tag);
  if (cls) x.className = cls;
  if (txt !== undefined) x.textContent = txt;
  return x;
};
const val = (v, fallback = '—') =>
  v === null || v === undefined || v === '' ? fallback : String(v);

function dateText(v) {
  if (!v) return 'Termin nieustalony';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) :
    new Intl.DateTimeFormat('pl-PL', {
      weekday: 'long', day: 'numeric', month: 'long',
      hour: '2-digit', minute: '2-digit'
    }).format(d);
}

function normalizeTeam(v) {
  return String(v || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function isGornik(m) {
  return [m.home, m.away].some(name =>
    /\bgornik\s+zabrze\b/.test(normalizeTeam(name)));
}

// Gdy API podaje prawdziwy numer kolejki, zachowujemy go.
// Wartości typu „Nadchodzące” to etykiety statusu, a nie numery kolejek.
function roundInfo(raw) {
  if (raw && typeof raw === 'object') {
    raw = raw.number ?? raw.round_number ?? raw.matchday ?? raw.round ?? raw.name ?? null;
  }
  if (raw === null || raw === undefined || raw === '') return null;
  const str = String(raw).trim();
  const match = str.match(/^(\d{1,2})$/)
    || str.match(/^(?:kolejka|round|matchday|gameweek|runda)\s*[#:.\- ]*\s*(\d{1,2})$/i)
    || str.match(/^(\d{1,2})\.?\s*(?:kolejka|round|matchday|gameweek|runda)$/i);
  if (!match) return null;
  const n = Number(match[1]);
  return n >= 1 && n <= 40 ? { key: `r-${n}`, label: `Kolejka ${n}` } : null;
}

function kickoffMillis(m) {
  const n = Date.parse(m.date);
  return Number.isFinite(n) ? n : null;
}

// Oficjalne numery z Bzzoiro mają pierwszeństwo nawet wtedy,
// gdy pojedynczy mecz nie ma przypisanego numeru.
function groupUpcomingMatches(list) {
  const matches = [...list].sort((a, b) =>
    (kickoffMillis(a) ?? Infinity) - (kickoffMillis(b) ?? Infinity));
  const official = new Map();
  const withoutNumber = [];
  for (const m of matches) {
    const info = roundInfo(m.round_number ?? m.round ?? m.round_label);
    if (!info) {
      withoutNumber.push(m);
      continue;
    }
    if (!official.has(info.key)) official.set(info.key, { ...info, matches: [] });
    official.get(info.key).matches.push(m);
  }

  // Dla meczów bez numeru grupujemy daty, ale NIE nadajemy
  // im zmyślonego numeru kolejki.
  const unknownGroups = [];
  let current = null;
  let usedTeams = new Set();
  let lastKickoff = null;
  const DAY = 24 * 60 * 60 * 1000;
  for (const m of withoutNumber) {
    const t = kickoffMillis(m);
    const teams = [m.home, m.away]
      .map(normalizeTeam)
      .filter(n => n && !n.includes('nieznana druzyna'));
    const repeatsTeam = teams.some(n => usedTeams.has(n));
    const longBreak = lastKickoff !== null && t !== null &&
      t - lastKickoff >= 3.5 * DAY;
    if (!current || current.matches.length >= 9 || repeatsTeam || longBreak ||
        (t === null && current.matches.some(x => kickoffMillis(x) !== null))) {
      current = {
        key: `unknown-${unknownGroups.length + 1}`,
        label: 'Terminy bez numeru kolejki',
        matches: []
      };
      unknownGroups.push(current);
      usedTeams = new Set();
      lastKickoff = null;
    }
    current.matches.push(m);
    teams.forEach(name => usedTeams.add(name));
    if (t !== null) lastKickoff = t;
  }

  return [...official.values(), ...unknownGroups]
    .sort((a, b) =>
      (kickoffMillis(a.matches[0]) ?? Infinity) -
      (kickoffMillis(b.matches[0]) ?? Infinity))
    .slice(0, 5);
}

function roundDates(matches) {
  const dates = matches.filter(m => m.date != null && m.date !== '').map(m => new Date(m.date))
    .filter(d => !Number.isNaN(d.getTime()))
    .sort((a, b) => a - b);
  if (!dates.length) return 'Termin nieustalony';
  const day = d => new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long' }).format(d);
  const first = day(dates[0]);
  const last = day(dates[dates.length - 1]);
  return first === last ? first : `${first} – ${last}`;
}

function isLive(m) {
  return ['live', 'in_progress', 'inprogress', 'playing', '1h', '2h', 'ht',
    'halftime', 'half_time', 'extra_time', 'et'].includes(String(m.status || '').toLowerCase());
}
function isAfterKickoffUnconfirmed(m) {
  if (isLive(m) || ['finished','ft','full_time','completed','ended',
    'cancelled','canceled','postponed','abandoned'].includes(String(m.status || '').toLowerCase())) return false;
  const t = kickoffMillis(m);
  if (t === null) return false;
  const elapsed = Date.now() - t;
  return elapsed >= 60 * 1000 && elapsed <= 4 * 60 * 60 * 1000;
}
function uniqueMatches(matches) {
  const seen = new Set();
  return matches.filter(m => {
    const key = m.id != null ? String(m.id) : `${m.home}|${m.away}|${m.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function matchMinute(m) {
  const raw = m.minute;
  if (raw === null || raw === undefined) return '';
  if (['ht', 'halftime', 'half_time', 'half-time', 'half time'].includes(String(m.period || '').toLowerCase().trim())) return 'PRZERWA';
  const value = String(raw).trim().replace(/'$/, '');
  return /^\d{1,3}(\+\d{1,2})?$/.test(value) ? `${value}′` : '';
}

function cupScorePair(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const h = raw.home ?? raw.home_score ?? raw.home_goals;
    const a = raw.away ?? raw.away_score ?? raw.away_goals;
    if (h == null || a == null) return null;
    const home = Number(h), away = Number(a);
    if (Number.isInteger(home) && Number.isInteger(away) && home >= 0 && away >= 0) {
      return { home, away };
    }
    return null;
  }
  if (Array.isArray(raw) && raw.length >= 2) {
    const home = Number(raw[0]), away = Number(raw[1]);
    if (Number.isInteger(home) && Number.isInteger(away) && home >= 0 && away >= 0) {
      return { home, away };
    }
  }
  if (typeof raw === 'string') {
    const match = raw.match(/^\s*(\d{1,2})\s*[-:]\s*(\d{1,2})\s*$/);
    if (match) return { home: Number(match[1]), away: Number(match[2]) };
  }
  return null;
}
function cupMatchScore(m) {
  const regulationHome = Number(m.home_score), regulationAway = Number(m.away_score);
  const hasRegulation = m.home_score != null && m.away_score != null &&
    Number.isFinite(regulationHome) && Number.isFinite(regulationAway);
  const extra = cupScorePair(m.extra_time_score);
  const penalties = cupScorePair(m.penalty_shootout);
  // API Bzzoiro extra_time_score contains GOALS IN EXTRA TIME, not a cumulative score.
  const home = hasRegulation ? regulationHome + (extra?.home || 0) : m.home_score;
  const away = hasRegulation ? regulationAway + (extra?.away || 0) : m.away_score;
  return {
    home, away,
    details: penalties ? ('KARNE: ' + penalties.home + ':' + penalties.away +
      (extra && hasRegulation ? ' · PO 90 MIN: ' + regulationHome + ':' + regulationAway : '')) :
      extra && hasRegulation ? ('PO DOGRYWCE · PO 90 MIN: ' + regulationHome + ':' + regulationAway) :
      ''
  };
}

function makeMatchCard(m, kind = 'upcoming') {
  const favorite = isGornik(m);
  const isPlaying = kind === 'live';
  const unconfirmed = kind === 'pending';
  const cardClasses = ['match'];
  if (favorite) cardClasses.push('favorite-match');
  if (isPlaying) cardClasses.push('live-match');
  if (unconfirmed) cardClasses.push('pending-match');
  const card = el('article', cardClasses.join(' '));
  const meta = el('div', 'match-meta');
  meta.append(el('div', 'date', dateText(m.date)));
  if (isPlaying) {
    const minute = matchMinute(m);
    const liveBadge = el('span', 'live-badge', minute ? `NA ŻYWO · ${minute}` : 'NA ŻYWO');
    meta.append(liveBadge);
  }
  card.append(meta);
  const teams = el('div', 'teams');
  const showScores = kind !== 'upcoming';
  const cupScore = competition === 'cup' && showScores ? cupMatchScore(m) : null;
  for (const [name, scoreValue] of [
    [val(m.home, 'Gospodarze'), cupScore ? cupScore.home : m.home_score],
    [val(m.away, 'Goście'), cupScore ? cupScore.away : m.away_score]
  ]) {
    const row = el('div', 'team-row');
    row.append(el('div', 'team', name));
    if (showScores) row.append(el('div', 'team-score', scoreValue == null ? '—' : String(scoreValue)));
    teams.append(row);
  }
  card.append(teams);
  if (cupScore?.details) card.append(el('div', 'cup-score-details', cupScore.details));
  if (isPlaying && m.live_data_delayed) {
    card.append(el('div', 'live-stale',
      'Uwaga: źródło wyników może być opóźnione. Sprawdź godzinę aktualizacji poniżej.'));
  }
  if (isPlaying && (m.home_score == null || m.away_score == null)) {
    card.append(el('div', 'live-availability', 'Wynik nie jest jeszcze dostępny w API.'));
  }
  if (unconfirmed) {
    card.append(el('div', 'pending-label', 'Minęła godzina rozpoczęcia. Czekamy na potwierdzenie wyniku.'));
  }
  // Zakończone mecze: bez zbędnego dopisku statusu i numeru kolejki.
  return card;
}

function upcoming(list) {
  content.replaceChildren(el('h2', 'section-title', 'Najbliższe mecze'));
  list = (Array.isArray(list) ? list : []).filter(m => !isLive(m) && !isAfterKickoffUnconfirmed(m));
  if (!list.length) {
    content.append(el('p', 'empty', 'Brak meczów do wyświetlenia.'));
    return;
  }
  const blocks = groupUpcomingMatches(list);
  // Pierwsza kolejka jest rozwinięta, pozostałe można otwierać niezależnie.
  blocks.forEach((group, idx) => {
    const details = el('details', 'round-block');
    if (idx === 0) details.open = true;
    const summary = el('summary', 'round-toggle');
    const title = el('div', 'round-title');
    title.append(el('span', 'round-name', group.label));
    title.append(el('span', 'round-dates', roundDates(group.matches)));
    const right = el('div', 'round-right');
    right.append(el('span', 'round-chevron', ''));
    summary.append(title, right);
    details.append(summary);
    const panel = el('div', 'round-panel');
    for (const m of group.matches) panel.append(makeMatchCard(m, 'upcoming'));
    details.append(panel);
    content.append(details);
  });
}

function results(list, liveFromApi = [], pendingFromApi = [], upcomingList = []) {
  content.replaceChildren();
  const previousUpcoming = Array.isArray(upcomingList) ? upcomingList : [];
  // Dodatkowa zgodność: nawet jeśli plik data.json pochodzi jeszcze ze starej wersji,
  // spotkania ze statusem live nie będą tkwiły w zakładce Nadchodzące.
  const liveMatches = uniqueMatches([
    ...(Array.isArray(liveFromApi) ? liveFromApi : []),
    ...previousUpcoming.filter(isLive)
  ]).sort((a, b) => (kickoffMillis(a) ?? 0) - (kickoffMillis(b) ?? 0));
  const pendingMatches = uniqueMatches([
    ...(Array.isArray(pendingFromApi) ? pendingFromApi : []),
    ...previousUpcoming.filter(isAfterKickoffUnconfirmed)
  ]).filter(m => !isLive(m));
  const finishedMatches = (Array.isArray(list) ? list : []).filter(m => !isLive(m));
  if (!liveMatches.length && !pendingMatches.length && !finishedMatches.length) {
    content.append(el('h2', 'section-title', 'Wyniki'));
    content.append(el('p', 'empty', 'Brak meczów do wyświetlenia.'));
    return;
  }
  if (liveMatches.length) {
    content.append(el('h2', 'section-title live-heading', 'Mecze na żywo'));
    for (const m of liveMatches) content.append(makeMatchCard(m, 'live'));
  }
  if (pendingMatches.length) {
    content.append(el('h2', 'section-title', 'Oczekiwanie na wynik'));
    for (const m of pendingMatches) content.append(makeMatchCard(m, 'pending'));
  }
  if (finishedMatches.length) {
    content.append(el('h2', 'section-title', 'Ostatnie wyniki'));
    for (const m of finishedMatches) content.append(makeMatchCard(m, 'finished'));
  }
}

// Tabela pozostaje taka sama jak w poprzedniej wersji.
function table(rows) {
  content.replaceChildren(el('h2', 'section-title', 'Tabela ligowa'));
  if (!rows?.length) {
    content.append(el('p', 'empty', 'Tabela nie jest jeszcze dostępna.'));
    return;
  }
  const wrap = el('div', 'table-wrap');
  const t = document.createElement('table');
  const h = document.createElement('tr');
  ['M.', 'Drużyna', 'M', 'W', 'R', 'P', 'Bramki', 'Pkt']
    .forEach(x => h.append(el('th', '', x)));
  const thead = document.createElement('thead');
  thead.append(h);
  t.append(thead);
  const body = document.createElement('tbody');
  rows.forEach((r, i) => {
    const tr = document.createElement('tr');
    [
      [val(r.position, i + 1), 'pos'], [val(r.team, 'Nieznana drużyna'), 'club'],
      [val(r.played), ''], [val(r.won), ''], [val(r.drawn), ''],
      [val(r.lost), ''],
      [r.gf != null ? `${r.gf}:${val(r.ga)}` : '—', ''],
      [val(r.points), 'points']
    ].forEach(([v, c]) => tr.append(el('td', c, v)));
    body.append(tr);
  });
  t.append(body);
  wrap.append(t);
  content.append(wrap);
  content.append(el('p', 'notice', 'Przesuń tabelę w bok, aby zobaczyć wszystkie kolumny.'));
}


const CUP_STAGES = {
  'preliminary': 'RUNDA WSTĘPNA', 'preliminary-round': 'RUNDA WSTĘPNA',
  'round-of-64': '1/32 FINAŁU', 'round-of-32': '1/16 FINAŁU',
  'round-of-16': '1/8 FINAŁU', 'quarterfinal': 'ĆWIERĆFINAŁ',
  'quarterfinals': 'ĆWIERĆFINAŁ', 'semifinal': 'PÓŁFINAŁ',
  'semifinals': 'PÓŁFINAŁ', 'final': 'FINAŁ'
};
function cupRoundInfo(m) {
  const stage = String(m.stage || '').toLowerCase().trim();
  const raw = String(m.round_label || m.stage_name || m.round_name || '').trim();
  let label = CUP_STAGES[stage];
  if (!label) {
    const numberMatch = raw.match(/^round\s*(\d+)$/i);
    if (numberMatch) label = numberMatch[1] + '. RUNDA';
    else if (/preliminary/i.test(raw)) label = 'RUNDA WSTĘPNA';
    else if (/quarter.?final/i.test(raw)) label = 'ĆWIERĆFINAŁ';
    else if (/semi.?final/i.test(raw)) label = 'PÓŁFINAŁ';
    else if (/^final$/i.test(raw)) label = 'FINAŁ';
    else label = raw || 'POZOSTAŁE TERMINY';
  }
  const key = stage || label;
  return {key, label};
}
function cupGroups(matches) {
  const groups = new Map();
  for (const m of matches) {
    const info = cupRoundInfo(m);
    if (!groups.has(info.key)) groups.set(info.key, {...info,matches:[]});
    groups.get(info.key).matches.push(m);
  }
  return [...groups.values()];
}
function appendCupGroups(matches, kind) {
  cupGroups(matches).forEach((group, index) => {
    const details = el('details', 'round-block');
    if (index === 0) details.open = true;
    const summary = el('summary', 'round-toggle');
    const title = el('div', 'round-title');
    title.append(el('span', 'round-name', group.label));
    title.append(el('span', 'round-dates', roundDates(group.matches)));
    const right = el('div', 'round-right');
    right.append(el('span', 'round-chevron', ''));
    summary.append(title, right);
    details.append(summary);
    const panel = el('div', 'round-panel');
    for (const m of group.matches) panel.append(makeMatchCard(m, kind));
    details.append(panel);
    content.append(details);
  });
}
function cupUpcoming(list) {
  content.replaceChildren(el('h2', 'section-title', 'Nadchodzące mecze Pucharu Polski'));
  const matches = (Array.isArray(list) ? list : [])
    .filter(m => !isLive(m) && !isAfterKickoffUnconfirmed(m))
    .sort((a,b) => (kickoffMillis(a) ?? Infinity) - (kickoffMillis(b) ?? Infinity));
  if (!matches.length) {
    content.append(el('p','empty','Brak zaplanowanych meczów. Kolejna runda może nie mieć jeszcze terminarza.'));
    return;
  }
  appendCupGroups(matches, 'upcoming');
}
function cupResults(list, liveFromApi, pendingFromApi, upcomingList) {
  content.replaceChildren();
  const upcomingSource = Array.isArray(upcomingList) ? upcomingList : [];
  const live = uniqueMatches([
    ...(Array.isArray(liveFromApi) ? liveFromApi : []),
    ...upcomingSource.filter(isLive)
  ]);
  const pending = uniqueMatches([
    ...(Array.isArray(pendingFromApi) ? pendingFromApi : []),
    ...upcomingSource.filter(isAfterKickoffUnconfirmed)
  ]).filter(m => !isLive(m));
  const finished = (Array.isArray(list) ? list : []).filter(m => !isLive(m)).slice(0,60);
  if (!live.length && !pending.length && !finished.length) {
    content.append(el('p','empty','Brak wyników Pucharu Polski.'));
    return;
  }
  if (live.length) {
    content.append(el('h2','section-title live-heading','Mecze na żywo'));
    for (const m of live) content.append(makeMatchCard(m,'live'));
  }
  if (pending.length) {
    content.append(el('h2','section-title','Oczekiwanie na wynik'));
    for (const m of pending) content.append(makeMatchCard(m,'pending'));
  }
  if (finished.length) {
    content.append(el('h2','section-title','Ostatnie wyniki Pucharu Polski'));
    appendCupGroups(finished,'finished');
  }
}

function render() {
  const isCup = competition === 'cup';
  document.body.dataset.competition = competition;
  if (pageTitle) pageTitle.textContent = isCup ? 'PUCHAR POLSKI' : 'EKSTRAKLASA';
  if (tableTab) tableTab.hidden = isCup;
  if (isCup && tab === 'table') tab = 'results';
  competitionButtons.forEach(b => b.setAttribute('aria-pressed',
    String(b.dataset.competition === competition)));
  document.querySelectorAll('.tab').forEach(b => {
    const active = b.dataset.tab === tab;
    b.classList.toggle('active',active);
    b.setAttribute('aria-selected',String(active));
  });
  if (!data?.ok) {
    content.replaceChildren(el('p','empty','Brak danych. Administrator musi uruchomić aktualizację w GitHub Actions.'));
    return;
  }
  if (data.updated_at) {
    const mins = (Date.now() - Date.parse(data.updated_at)) / 60000;
    const stale = Number.isFinite(mins) && mins > 40;
    updatedEl.textContent = (stale ? '⚠ Dane strony mogą być nieaktualne. ' : '') +
      'Ostatnia aktualizacja: ' + dateText(data.updated_at) + ' · Źródło: Bzzoiro Sports Data';
  }
  const current = isCup ? data.competitions?.cup : data;
  if (!current?.ok) {
    content.replaceChildren(el('p','notice',
      current?.error || 'Puchar Polski: dane pojawią się po pierwszej aktualizacji projektu.'));
    return;
  }
  if (isCup) {
    if (tab === 'upcoming') cupUpcoming(current.upcoming);
    else cupResults(current.results,current.live,current.pending,current.upcoming);
    return;
  }
  if (tab === 'upcoming') upcoming(current.upcoming);
  if (tab === 'results') results(current.results,current.live,current.pending,current.upcoming);
  if (tab === 'table') table(current.standings);
}

async function load(force = false) {
  refreshBtn.disabled = true;
  refreshBtn.textContent = '↻ Pobieram…';
  try {
    // Za każdym razem sprawdź najnowszą publikację GitHub Pages.
    const r = await fetch('data.json', { cache: 'no-store' });
    if (!r.ok) throw Error('HTTP ' + r.status);
    const d = await r.json();
    if (!d.ok) throw Error('Brak danych');
    data = d;
    try { localStorage.setItem('ekstraklasa-cache', JSON.stringify(d)); } catch {}
    render();
  } catch (e) {
    if (!data) {
      try { data = JSON.parse(localStorage.getItem('ekstraklasa-cache')); } catch {}
    }
    if (data?.ok) {
      render();
      content.append(el('p', 'notice',
        'Nie udało się pobrać najnowszych danych. Wyświetlam ostatnio zapisane.'));
    } else {
      content.replaceChildren(el('p', 'error',
        'Nie można pobrać danych. Sprawdź połączenie lub konfigurację API w GitHub.'));
      // Nazwa sezonu nie jest wyświetlana w interfejsie.
    }
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = '↻ Odśwież';
  }
}

document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => {
  tab = b.dataset.tab;
  document.querySelectorAll('.tab').forEach(x => {
    x.classList.toggle('active', x === b);
    x.setAttribute('aria-selected', x === b ? 'true' : 'false');
  });
  render();
}));
competitionButtons.forEach(button => button.addEventListener('click', () => {
  competition = button.dataset.competition === 'cup' ? 'cup' : 'ekstraklasa';
  tab = 'results';
  render();
  window.scrollTo(0,0);
}));
refreshBtn.addEventListener('click', () => load(true));
// Powrót do aplikacji z innej karty nie może zostawiać starego wyniku.
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(true); });
window.addEventListener('pageshow', e => { if (e.persisted) load(true); });
// Sprawdzaj publikowane dane co 5 minut, bez dodatkowych wywołań Bzzoiro.
setInterval(() => { if (!document.hidden) load(true); }, 5 * 60 * 1000);
if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker
    .register('sw.js', { updateViaCache: 'none' })
    .then(reg => reg.update())
    .catch(() => {}));
}
load();

// Trzy oddzielne przyciski motywów: jasny, ciemny, kontrast.
// Zapamiętujemy wybór lokalnie i zaznaczamy aktualny przycisk.
const themeButtons = [...document.querySelectorAll('.theme-choice')];
const validThemes = new Set(['light', 'dark', 'contrast']);
function applyTheme(mode) {
  const chosen = validThemes.has(mode) ? mode : 'light';
  document.documentElement.dataset.theme = chosen;
  themeButtons.forEach(button => button.setAttribute('aria-pressed',
    String(button.dataset.themeChoice === chosen)));
  const colors = { light: '#12324c', dark: '#101a25', contrast: '#000000' };
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors[chosen]);
  try { localStorage.setItem('ekstraklasa-theme', chosen); } catch {}
}
let savedTheme = 'light';
try { savedTheme = localStorage.getItem('ekstraklasa-theme') || 'light'; } catch {}
applyTheme(savedTheme);
themeButtons.forEach(button => button.addEventListener('click',
  () => applyTheme(button.dataset.themeChoice)));

// Rozmiar czcionki: duża (domyślna), większa, największa.
const fontButtons = [...document.querySelectorAll('.font-choice')];
function applyFontSize(size) {
  const chosen = ['base', 'larger', 'largest'].includes(size) ? size : 'base';
  document.documentElement.dataset.font = chosen;
  fontButtons.forEach(b => b.setAttribute('aria-pressed',
    String(b.dataset.font === chosen)));
  try { localStorage.setItem('ekstraklasa-font-size', chosen); } catch {}
}
let savedFont = 'base';
try { savedFont = localStorage.getItem('ekstraklasa-font-size') || 'base'; } catch {}
applyFontSize(savedFont);
fontButtons.forEach(b => b.addEventListener('click', () => applyFontSize(b.dataset.font)));
