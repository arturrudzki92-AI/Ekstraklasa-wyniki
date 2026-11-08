// Ekstraklasa 4.2.4: rozwijane kolejki i delikatne wyróżnienie Górnika Zabrze bez gwiazdek.
// Dane wciąż pochodzą z tego samego site/data.json. Nie potrzebujemy klucza API w przeglądarce.
const content = document.querySelector('#content');
const seasonEl = document.querySelector('#season');
const updatedEl = document.querySelector('#updated');
const refreshBtn = document.querySelector('#refresh');
let data = null;
let tab = 'results';

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
  const value = String(raw).trim().replace(/'$/, '');
  return /^\d{1,3}(\+\d{1,2})?$/.test(value) ? `${value}′` : '';
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
  for (const [name, scoreValue] of [
    [val(m.home, 'Gospodarze'), m.home_score],
    [val(m.away, 'Goście'), m.away_score]
  ]) {
    const row = el('div', 'team-row');
    row.append(el('div', 'team', name));
    if (showScores) row.append(el('div', 'team-score', scoreValue == null ? '—' : String(scoreValue)));
    teams.append(row);
  }
  card.append(teams);
  if (isPlaying && (m.home_score == null || m.away_score == null)) {
    card.append(el('div', 'live-availability', 'Wynik nie jest jeszcze dostępny w API.'));
  }
  if (unconfirmed) {
    card.append(el('div', 'pending-label', 'Minęła godzina rozpoczęcia. Czekamy na potwierdzenie wyniku.'));
  }
  if (kind === 'finished') {
    const known = {
      finished: 'Koniec meczu', ft: 'Koniec meczu',
      full_time: 'Koniec meczu', completed: 'Koniec meczu', ended: 'Koniec meczu',
      postponed: 'Mecz przełożony', cancelled: 'Mecz odwołany'
    };
    const status = known[String(m.status || '').toLowerCase()] || '';
    const round = roundInfo(m.round);
    const label = [status, round?.label || ''].filter(Boolean).join(' · ');
    if (label) card.append(el('div', 'status', label));
  }
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

function render() {
  if (!data?.ok) {
    content.replaceChildren(el('p', 'empty',
      'Brak danych. Administrator musi uruchomić aktualizację w GitHub Actions.'));
    return;
  }
  // Celowo nie wyświetlamy nazwy sezonu pod przyciskami nagłówka.
  if (data.updated_at) updatedEl.textContent =
    `Ostatnia aktualizacja: ${dateText(data.updated_at)} · Źródło: Bzzoiro Sports Data`;
  if (tab === 'upcoming') upcoming(data.upcoming);
  if (tab === 'results') results(data.results, data.live, data.pending, data.upcoming);
  if (tab === 'table') table(data.standings);
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
refreshBtn.addEventListener('click', () => load(true));
// Odśwież otwartą aplikację co kwadrans, bez dodatkowych wywołań Bzzoiro.
setInterval(() => { if (!document.hidden) load(true); }, 15 * 60 * 1000);
if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker
    .register('sw.js', { updateViaCache: 'none' })
    .then(reg => reg.update())
    .catch(() => {}));
}
load();

// Zapamiętanie motywu na tym urządzeniu.
const themeBtn = document.querySelector('#themeToggle');
function applyTheme(mode) {
  const dark = mode === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  themeBtn.textContent = dark ? '☀ Jasny' : '☾ Ciemny';
  themeBtn.setAttribute('aria-pressed', String(dark));
  themeBtn.setAttribute('aria-label', dark ? 'Włącz jasny motyw' : 'Włącz ciemny motyw');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',
    dark ? '#101a25' : '#12324c');
  try { localStorage.setItem('ekstraklasa-theme', mode); } catch {}
}
let savedTheme = 'light';
try { savedTheme = localStorage.getItem('ekstraklasa-theme') || 'light'; } catch {}
applyTheme(savedTheme);
themeBtn.addEventListener('click', () =>
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));

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
