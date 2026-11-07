const content=document.querySelector('#content'),seasonEl=document.querySelector('#season'),updatedEl=document.querySelector('#updated'),refreshBtn=document.querySelector('#refresh');let data=null,tab='upcoming';
const el=(tag,cls,txt)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(txt!==undefined)x.textContent=txt;return x};
const val=(v,f='—')=>v===null||v===undefined||v===''?f:String(v);
function dateText(v){if(!v)return'Termin nieustalony';const d=new Date(v);return isNaN(d)?String(v):new Intl.DateTimeFormat('pl-PL',{weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}).format(d)}
function statusText(s){return({upcoming:'Nadchodzący mecz',live:'Mecz w trakcie',finished:'Koniec meczu',postponed:'Mecz przełożony',cancelled:'Mecz odwołany',unresolved:'Brak potwierdzonego wyniku'})[String(s||'').toLowerCase()]||'Status nieznany'}
function matches(list,title,result){content.replaceChildren(el('h2','section-title',title));if(!list?.length){content.append(el('p','empty','Brak meczów do wyświetlenia.'));return}for(const m of list){const c=el('article','match');c.append(el('div','date',dateText(m.date)));const t=el('div','teams');t.append(el('div','team',val(m.home,'Gospodarze')));const score=m.home_score!=null&&m.away_score!=null?`${m.home_score} : ${m.away_score}`:(result?'— : —':'VS');t.append(el('div','score',score));t.append(el('div','team away',val(m.away,'Goście')));c.append(t);c.append(el('div','status',statusText(m.status)+(m.round?' · '+m.round:'')));content.append(c)}}
function table(rows){content.replaceChildren(el('h2','section-title','Tabela ligowa'));if(!rows?.length){content.append(el('p','empty','Tabela nie jest jeszcze dostępna.'));return}const wrap=el('div','table-wrap'),t=document.createElement('table'),h=document.createElement('tr');['M.','Drużyna','M','W','R','P','Bramki','Pkt'].forEach(x=>h.append(el('th','',x)));const thead=document.createElement('thead');thead.append(h);t.append(thead);const body=document.createElement('tbody');rows.forEach((r,i)=>{const tr=document.createElement('tr');[[val(r.position,i+1),'pos'],[val(r.team,'Nieznana drużyna'),'club'],[val(r.played),''],[val(r.won),''],[val(r.drawn),''],[val(r.lost),''],[r.gf!=null?`${r.gf}:${val(r.ga)}`:'—',''],[val(r.points),'points']].forEach(([v,c])=>tr.append(el('td',c,v)));body.append(tr)});t.append(body);wrap.append(t);content.append(wrap);content.append(el('p','notice','Przesuń tabelę w bok, aby zobaczyć wszystkie kolumny.'))}
function render(){if(!data?.ok){content.replaceChildren(el('p','empty','Brak danych. Administrator musi dodać klucz API Bzzoiro i uruchomić aktualizację w GitHub Actions.'));return}seasonEl.textContent=`${val(data.league,'Ekstraklasa')} · ${val(data.season,'bieżący sezon')}`;if(data.updated_at)updatedEl.textContent=`Ostatnia aktualizacja: ${dateText(data.updated_at)} · Źródło: Bzzoiro Sports Data`;if(tab==='upcoming')matches(data.upcoming,'Najbliższe mecze',false);if(tab==='results')matches(data.results,'Ostatnie wyniki',true);if(tab==='table')table(data.standings)}
async function load(force=false){refreshBtn.disabled=true;refreshBtn.textContent='↻ Pobieram…';try{const r=await fetch('data.json'+(force?'?t='+Date.now():''),{cache:force?'no-store':'default'});if(!r.ok)throw Error('HTTP '+r.status);const d=await r.json();if(!d.ok)throw Error('Brak danych');data=d;try{localStorage.setItem('ekstraklasa-cache',JSON.stringify(d))}catch{}render()}catch(e){if(!data){try{data=JSON.parse(localStorage.getItem('ekstraklasa-cache'))}catch{}}if(data?.ok){render();content.append(el('p','notice','Nie udało się pobrać najnowszych danych. Wyświetlam ostatnio zapisane.'))}else{content.replaceChildren(el('p','error','Nie można pobrać danych. Sprawdź połączenie lub konfigurację API w GitHub.'));seasonEl.textContent='Dane chwilowo niedostępne'}}finally{refreshBtn.disabled=false;refreshBtn.textContent='↻ Odśwież'}}
document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>{tab=b.dataset.tab;document.querySelectorAll('.tab').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-selected',x===b?'true':'false')});render()}));refreshBtn.addEventListener('click',()=>load(true));if('serviceWorker'in navigator)addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));load();

// Zapamiętanie motywu na tym urządzeniu.
const themeBtn=document.querySelector('#themeToggle');
function applyTheme(mode){
 const dark=mode==='dark';document.documentElement.dataset.theme=dark?'dark':'light';
 themeBtn.textContent=dark?'☀ Jasny':'☾ Ciemny';themeBtn.setAttribute('aria-pressed',String(dark));
 themeBtn.setAttribute('aria-label',dark?'Włącz jasny motyw':'Włącz ciemny motyw');
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#101a25':'#12324c');
 try{localStorage.setItem('ekstraklasa-theme',mode)}catch{}
}
let savedTheme='light';try{savedTheme=localStorage.getItem('ekstraklasa-theme')||'light'}catch{}
applyTheme(savedTheme);
themeBtn.addEventListener('click',()=>applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark'));

// Rozmiar czcionki: duża (domyślna), większa, największa.
const fontButtons=[...document.querySelectorAll('.font-choice')];
function applyFontSize(size){
 const chosen=['base','larger','largest'].includes(size)?size:'base';
 document.documentElement.dataset.font=chosen;
 fontButtons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.font===chosen)));
 try{localStorage.setItem('ekstraklasa-font-size',chosen)}catch{}
}
let savedFont='base';try{savedFont=localStorage.getItem('ekstraklasa-font-size')||'base'}catch{}
applyFontSize(savedFont);
fontButtons.forEach(b=>b.addEventListener('click',()=>applyFontSize(b.dataset.font)));
