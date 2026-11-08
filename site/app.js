// Ekstraklasa 4.2.1: rozwijane kolejki i delikatne wyróżnienie Górnika Zabrze bez gwiazdek.
// Dane wciąż pochodzą z tego samego site/data.json. Nie potrzebujemy klucza API w przeglądarce.
const content = document.querySelector('#content');
const seasonEl = document.querySelector('#season');
const updatedEl = document.querySelector('#updated');
const refreshBtn = document.querySelector('#refresh');
let data = null;
let tab = 'upcoming';

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

// Numery kolejek są pobierane z pola "round". Nie wymyślamy numerów,
// jeżeli API nie zwróciło ich dla danego spotkania.
function roundInfo(raw) {
  if (raw === null || raw === undefined || raw === '') {
    return { key: 'unassigned', label: 'Pozostałe terminy' };
  }
  const str = String(raw).trim();
  const match = str.match(/^(\d{1,2})\.?\s*(?:kolejka|round|matchday|week)/i)
    || str.match(/(?:kolejka|round|matchday|week)\s*[#:.-]?\s*(\d{1,2})/i)
    || str.match(/(?:^|[-–])\s*(\d{1,2})\s*$/)
    || str.match(/^(\d{1,2})$/);
  if (match) {
    const n = Number(match[1]);
    if (n >= 1 && n <= 40) return { key: `r-${n}`, label: `Kolejka ${n}` };
  }
  return { key: `raw-${str}`, label: str };
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

function makeMatchCard(m, result) {
  const favorite = isGornik(m);
  const card = el('article', favorite ? 'match favorite-match' : 'match');
  const meta = el('div', 'match-meta');
  meta.append(el('div', 'date', dateText(m.date)));
  card.append(meta);

  const teams = el('div', 'teams');
  const scored = m.home_score != null || m.away_score != null;
  for (const [name, score] of [
    [val(m.home, 'Gospodarze'), m.home_score],
    [val(m.away, 'Goście'), m.away_score]
  ]) {
    const row = el('div', 'team-row');
    row.append(el('div', 'team', name));
    if (result || scored) {
      row.append(el('div', 'team-score', score == null ? '—' : String(score)));
    }
    teams.append(row);
  }
  card.append(teams);

  // Celowo nie pokazujemy "Przed meczem" ani "Status nieznany"
  // w zakładce Nadchodzące. Taki opis nie wnosi nowej informacji.
  if (result) {
    const known = {
      finished: 'Koniec meczu', ft: 'Koniec meczu',
      full_time: 'Koniec meczu', completed: 'Koniec meczu',
      postponed: 'Mecz przełożony', cancelled: 'Mecz odwołany'
    };
    const status = known[String(m.status || '').toLowerCase()] || '';
    const round = roundInfo(m.round);
    const label = [status, round.key !== 'unassigned' ? round.label : ''].filter(Boolean).join(' · ');
    if (label) card.append(el('div', 'status', label));
  }
  return card;
}

function upcoming(list) {
  content.replaceChildren(el('h2', 'section-title', 'Najbliższe mecze'));
  if (!Array.isArray(list) || !list.length) {
    content.append(el('p', 'empty', 'Brak meczów do wyświetlenia.'));
    return;
  }
  const groups = new Map();
  const sorted = [...list].sort((a, b) => {
    const x = Date.parse(a.date), y = Date.parse(b.date);
    return (Number.isNaN(x) ? Infinity : x) - (Number.isNaN(y) ? Infinity : y);
  });
  for (const m of sorted) {
    const info = roundInfo(m.round);
    if (!groups.has(info.key)) groups.set(info.key, { ...info, matches: [] });
    groups.get(info.key).matches.push(m);
  }
  const blocks = [...groups.values()];
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
    for (const m of group.matches) panel.append(makeMatchCard(m, false));
    details.append(panel);
    content.append(details);
  });
}

function results(list) {
  content.replaceChildren(el('h2', 'section-title', 'Ostatnie wyniki'));
  if (!Array.isArray(list) || !list.length) {
    content.append(el('p', 'empty', 'Brak meczów do wyświetlenia.'));
    return;
  }
  for (const m of list) content.append(makeMatchCard(m, true));
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
  seasonEl.textContent = `${val(data.league, 'Ekstraklasa')} · ${val(data.season, 'bieżący sezon')}`;
  if (data.updated_at) updatedEl.textContent =
    `Ostatnia aktualizacja: ${dateText(data.updated_at)} · Źródło: Bzzoiro Sports Data`;
  if (tab === 'upcoming') upcoming(data.upcoming);
  if (tab === 'results') results(data.results);
  if (tab === 'table') table(data.standings);
}

async function load(force = false) {
  refreshBtn.disabled = true;
  refreshBtn.textContent = '↻ Pobieram…';
  try {
    const r = await fetch('data.json' + (force ? '?t=' + Date.now() : ''),
      { cache: force ? 'no-store' : 'default' });
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
      seasonEl.textContent = 'Dane chwilowo niedostępne';
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
