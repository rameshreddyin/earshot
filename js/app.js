import { CONFIG } from './config.js';
import { OsmTiles, tileKey, tileOf } from './osm-data.js';
import { NoiseLayer } from './noise-layer.js';
import { levelLabel, comparison } from './noise-model.js';
import { scaleHTML, barsSVG, bindBars, hourLabel } from './charts.js';
import { REPORT_TYPES, TIME_SLOTS, LOUDNESS, fetchReports, addReport, storeMode } from './store.js';
import { measure } from './meter.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icons = () => window.lucide?.createIcons({ attrs: { 'stroke-width': 1.7 } });
const round = Math.round;

// ---------- state ----------

const params = new URLSearchParams(location.search);
const state = {
  mode: 'browse', // browse | spot | report
  period: params.get('t') === 'night' ? 'night' : 'day',
  selected: null,
  place: null,
  analysis: null,
  reports: [],
  token: 0,
};

// ---------- map ----------

const map = new maplibregl.Map({
  container: 'map',
  style: CONFIG.mapStyles.day,
  center: CONFIG.defaultView.center,
  zoom: CONFIG.defaultView.zoom,
  hash: 'map',
  dragRotate: false,
  pitchWithRotate: false,
  fadeDuration: 0,
  attributionControl: { compact: true },
});
map.touchZoomRotate.disableRotation();

const tiles = new OsmTiles();
const layer = new NoiseLayer(map, tiles);
layer.period = state.period;
window.earshot = { map, tiles, layer, state }; // handy for debugging in the console

map.on('style.load', () => {
  layer.install();
  refreshViewport(); // start fetching OSM data while basemap tiles still render
});
map.on('load', () => {
  loadReports();
  const at = params.get('at');
  if (at) {
    const [lat, lon] = at.split(',').map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lon)) select(lat, lon);
  }
});
map.on('moveend', () => {
  refreshViewport();
  clearTimeout(refreshViewport.r);
  refreshViewport.r = setTimeout(loadReports, 400);
});

function refreshViewport() {
  if (map.getZoom() < CONFIG.minLayerZoom) {
    setStatus('Zoom in to see street noise');
    return;
  }
  const b = map.getBounds();
  const c = map.getCenter();
  const [i0, j0] = tileOf(b.getSouth(), b.getWest());
  const [i1, j1] = tileOf(b.getNorth(), b.getEast());
  const [ci, cj] = tileOf(c.lat, c.lng);
  let keys = [];
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) keys.push([i, j]);
  keys.sort((a, b2) => Math.hypot(a[0] - ci, a[1] - cj) - Math.hypot(b2[0] - ci, b2[1] - cj));
  keys = keys.slice(0, CONFIG.maxTilesPerView).map(([i, j]) => tileKey(i, j));
  tiles.want(keys, [c.lat, c.lng], true);
  updateStatus();
}

// ---------- status + toast ----------

let pending = 0;
function setStatus(text) {
  const el = $('#status');
  el.hidden = !text;
  el.textContent = text || '';
}
function updateStatus() {
  if (map.getZoom() < CONFIG.minLayerZoom) return setStatus('Zoom in to see street noise');
  setStatus(pending > 0 ? `Loading street data · ${pending} area${pending > 1 ? 's' : ''} left` : null);
}
tiles.addEventListener('progress', (e) => {
  pending = e.detail.pending;
  updateStatus();
});

let lastTileError = 0;
tiles.addEventListener('tileerror', () => {
  if (Date.now() - lastTileError < 15000) return;
  lastTileError = Date.now();
  toast('The OpenStreetMap servers are busy. Move the map to try again.');
});

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), 4000);
}

// ---------- hover readout ----------

const tip = $('#hoverTip');
map.on('mousemove', (e) => {
  const { lat, lng } = e.lngLat;
  const [i, j] = tileOf(lat, lng);
  if (state.mode === 'report' || map.getZoom() < CONFIG.minLayerZoom || !tiles.isReady(tileKey(i, j))) {
    tip.hidden = true;
    return;
  }
  const [d, n] = tiles.index.dayNight(lat, lng);
  const db = state.period === 'day' ? d : n;
  tip.innerHTML = `${round(db)} dB<span>${levelLabel(db).text}</span>`;
  tip.style.transform = `translate(${e.point.x + 14}px, ${e.point.y + 14}px)`;
  tip.hidden = false;
});
map.on('mouseout', () => (tip.hidden = true));

// ---------- pins ----------

function pinElement(colour, size) {
  const el = document.createElement('div');
  el.className = 'pin';
  el.innerHTML = `<svg width="${size}" height="${round(size * 1.3)}" viewBox="0 0 24 31"><path d="M12 30s10-10 10-18C22 6.5 17.5 2 12 2S2 6.5 2 12c0 8 10 18 10 18z" fill="${colour}" stroke="#fff" stroke-width="2"/></svg>`;
  return el;
}

// ---------- selection ----------

let spotPin = null;

map.on('click', (e) => {
  const { lat, lng } = e.lngLat;
  if (state.mode === 'report') {
    setReportPin(lat, lng);
    return;
  }
  select(lat, lng);
});

async function select(lat, lon, place = null) {
  const token = ++state.token;
  state.mode = 'spot';
  state.selected = { lat, lon };
  state.place = place;
  state.analysis = null;

  if (!spotPin) spotPin = new maplibregl.Marker({ element: pinElement('#0071e3', 26), anchor: 'bottom' });
  spotPin.setLngLat([lon, lat]).addTo(map);
  updateUrl();
  render();

  if (!place) {
    reverseGeocode(lat, lon).then((p) => {
      if (token !== state.token) return;
      state.place = p;
      render();
    });
  }

  try {
    await tiles.ensureAround(lat, lon);
  } catch {
    if (token !== state.token) return;
    state.analysis = 'error';
    render();
    return;
  }
  if (token !== state.token) return;
  state.analysis = tiles.index.analyse(lat, lon);
  render();
}

function backToMap() {
  state.token++;
  state.mode = 'browse';
  state.selected = null;
  state.analysis = null;
  state.place = null;
  spotPin?.remove();
  updateUrl();
  render();
}

function updateUrl() {
  const p = new URLSearchParams();
  if (state.selected) p.set('at', `${state.selected.lat.toFixed(5)},${state.selected.lon.toFixed(5)}`);
  if (state.period === 'night') p.set('t', 'night');
  const qs = p.toString();
  history.replaceState(null, '', `${location.pathname}${qs ? '?' + qs : ''}${location.hash}`);
}

// ---------- geocoding (Photon, built on OpenStreetMap) ----------

function formatPlace(props = {}) {
  const street = [props.housenumber, props.street].filter(Boolean).join(' ');
  const title = props.name || street || props.district || props.locality || props.city || 'Selected spot';
  const sub = [props.name && street ? street : null, props.district || props.locality, props.city || props.county]
    .filter((v, i, arr) => v && v !== title && arr.indexOf(v) === i).slice(0, 3).join(', ');
  return { title, sub };
}

async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(`${CONFIG.geocoder}/reverse?lat=${lat}&lon=${lon}&limit=1&lang=en`);
    const json = await res.json();
    const f = json.features?.[0];
    if (f) return formatPlace(f.properties);
  } catch { /* offline or rate limited */ }
  return { title: 'Selected spot', sub: `${lat.toFixed(4)}, ${lon.toFixed(4)}` };
}

const searchInput = $('#search');
const results = $('#results');
let searchItems = [];
let activeIdx = -1;

searchInput.addEventListener('input', () => {
  clearTimeout(searchInput.t);
  const q = searchInput.value.trim();
  if (q.length < 3) { hideResults(); return; }
  searchInput.t = setTimeout(() => runSearch(q), 280);
});

async function runSearch(q) {
  const c = map.getCenter();
  try {
    const res = await fetch(`${CONFIG.geocoder}/api/?q=${encodeURIComponent(q)}&limit=6&lang=en&lat=${c.lat}&lon=${c.lng}`);
    const json = await res.json();
    if (searchInput.value.trim() !== q) return;
    searchItems = (json.features || []).map((f) => ({
      ...formatPlace(f.properties),
      lon: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
    }));
    activeIdx = -1;
    renderResults();
  } catch {
    searchItems = [];
    results.innerHTML = '<li class="empty">Search is unavailable right now.</li>';
    results.hidden = false;
  }
}

function renderResults() {
  results.innerHTML = searchItems.length
    ? searchItems.map((r, i) => `<li role="option" data-i="${i}" class="${i === activeIdx ? 'active' : ''}"><span class="res-title">${esc(r.title)}</span><span class="res-sub">${esc(r.sub)}</span></li>`).join('')
    : '<li class="empty">No places found. Try a nearby landmark.</li>';
  results.hidden = false;
}

function hideResults() {
  results.hidden = true;
  searchItems = [];
}

function pickResult(i) {
  const r = searchItems[i];
  if (!r) return;
  hideResults();
  searchInput.value = '';
  searchInput.blur();
  map.jumpTo({ center: [r.lon, r.lat], zoom: Math.max(map.getZoom(), 16) });
  select(r.lat, r.lon, { title: r.title, sub: r.sub });
}

results.addEventListener('mousedown', (e) => {
  const li = e.target.closest('li[data-i]');
  if (li) { e.preventDefault(); pickResult(+li.dataset.i); }
});
searchInput.addEventListener('keydown', (e) => {
  if (results.hidden) return;
  if (e.key === 'ArrowDown') { activeIdx = Math.min(activeIdx + 1, searchItems.length - 1); renderResults(); e.preventDefault(); }
  if (e.key === 'ArrowUp') { activeIdx = Math.max(activeIdx - 1, 0); renderResults(); e.preventDefault(); }
  if (e.key === 'Enter') pickResult(activeIdx < 0 ? 0 : activeIdx);
  if (e.key === 'Escape') hideResults();
});
searchInput.addEventListener('blur', () => setTimeout(hideResults, 150));

document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
    e.preventDefault();
    searchInput.focus();
  }
  if (e.key === 'Escape' && state.mode === 'report') closeReport();
});

// ---------- day / night ----------

function setPeriod(p) {
  if (p === state.period) return;
  state.period = p;
  layer.setPeriod(p);
  syncPeriodButtons();
  updateUrl();
  renderReportPins();
  render();
}

function syncPeriodButtons() {
  $$('.segmented button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.period === state.period)));
}
$$('.segmented button').forEach((b) => b.addEventListener('click', () => setPeriod(b.dataset.period)));
syncPeriodButtons();

// ---------- map controls ----------

$('#zoomIn').addEventListener('click', () => map.zoomIn({ animate: false }));
$('#zoomOut').addEventListener('click', () => map.zoomOut({ animate: false }));
$('#locate').addEventListener('click', () => {
  if (!navigator.geolocation) { toast('Location is not available in this browser.'); return; }
  const btn = $('#locate');
  btn.disabled = true;
  navigator.geolocation.getCurrentPosition((pos) => {
    btn.disabled = false;
    const { latitude: lat, longitude: lon } = pos.coords;
    map.jumpTo({ center: [lon, lat], zoom: 16 });
    select(lat, lon);
  }, () => {
    btn.disabled = false;
    toast('Could not get your location.');
  }, { enableHighAccuracy: true, timeout: 10000 });
});
$('#toggleLayer').addEventListener('change', (e) => layer.setVisible(e.target.checked));

const methodDialog = $('#methodDialog');
$$('[data-open-method]').forEach((b) => b.addEventListener('click', () => methodDialog.showModal()));
$('[data-close-method]').addEventListener('click', () => methodDialog.close());
methodDialog.addEventListener('click', (e) => { if (e.target === methodDialog) methodDialog.close(); });

// ---------- side panel ----------

const sideHead = $('#sideHead');
const sideBody = $('#sideBody');

function render() {
  $('#controls').hidden = state.mode === 'report';
  if (state.mode === 'browse') renderBrowse();
  else if (state.mode === 'spot') renderSpot();
  icons();
}

function renderBrowse() {
  sideHead.innerHTML = `
    <h1>Noise Map.</h1>
    <p class="sub">See how loud any street gets, by day and at night, before you sign a lease.</p>`;
  const inView = periodReports();
  sideBody.innerHTML = `
    <section class="section">
      <div class="section-title">Pick a spot.</div>
      <p class="copy" style="margin-top:8px">Click anywhere on the map or search an address. You will see its daytime and night levels, what makes the noise, and what neighbours report.</p>
    </section>
    <section class="section">
      <div class="section-head">
        <div class="section-title">Reports in this area.</div>
        <div class="section-aside">${inView.length} ${state.period === 'day' ? 'daytime' : 'night'}</div>
      </div>
      ${inView.length ? `<div class="tiles">${inView.slice(0, 6).map(reportTile).join('')}</div>` : `
        <div class="empty">
          <p>No one has reported ${state.period === 'day' ? 'daytime' : 'night'} noise here yet. If you live nearby, you can be the first.</p>
          <button class="btn-plain" data-report>Report noise</button>
        </div>`}
    </section>
    <p class="fine">Street colours are estimates built from OpenStreetMap data. <button class="link" data-open-method-inline>How it works</button></p>`;
  $('[data-report]', sideBody)?.addEventListener('click', () => openReport());
  $('[data-open-method-inline]', sideBody).addEventListener('click', () => methodDialog.showModal());
}

function spotHead() {
  const p = state.place;
  sideHead.innerHTML = `
    <button class="back" id="back"><i data-lucide="chevron-left"></i>Noise Map</button>
    <h1>${p ? esc(p.title) : 'Selected spot'}</h1>
    <p class="sub">${p ? esc(p.sub) : ''}</p>`;
  $('#back').addEventListener('click', backToMap);
}

function verdicts(a) {
  const n = a.night, d = a.day;
  const sleep =
    n < 40 ? 'Great for light sleepers.' :
    n < 45 ? 'Fine for most sleepers.' :
    n < 52 ? 'Light sleepers should choose a bedroom away from the street.' :
    n < 60 ? 'Expect disturbed sleep with the windows open.' :
             'Hard to sleep here without double glazing.';
  const work =
    d < 50 ? 'Calm enough for calls and focused work.' :
    d < 58 ? 'Fine for work, with a light background hum.' :
    d < 65 ? 'Video calls may pick up street noise.' :
             'You will want noise-cancelling headphones.';
  return { sleep, work };
}

const TIPS = {
  line: (s) => `Ask for a flat facing away from ${s.name || 'the ' + s.label.toLowerCase()}.`,
  rail: () => 'Ask the landlord about early morning and night trains.',
  metro: () => 'Check how close the bedroom is to the elevated track.',
  nightclub: () => 'Visit on a Friday or Saturday night before you sign.',
  bar: () => 'Walk past after 10 PM on a weekend to hear the bars.',
  worship: () => 'Visit around 5 to 6 AM and 6 to 7 PM, when loudspeakers peak.',
  school: () => 'Weekday mornings and the 3 PM pickup are the loudest stretches.',
  construction: () => 'Ask how long the nearby construction will run.',
  runway: () => 'Check the flight paths. Aircraft noise shifts with the wind.',
  stadium: () => 'Check the match and concert calendar.',
  hospital: () => 'Ambulance sirens can come at any hour.',
  market: () => 'Expect crowds through the day and quiet after 9 PM.',
  industrial: () => 'Ask whether nearby units run night shifts.',
  venue: () => 'Check the event calendar for late shows.',
  bus: () => 'Buses start early. Check the first departure time.',
};

function tipsFor(sources) {
  const out = [];
  const seen = new Set();
  for (const s of sources) {
    const kind = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'].includes(s.cat) ? 'line' : s.cat;
    if (seen.has(kind) || !TIPS[kind]) continue;
    if (kind === 'line' && s.dist > 150) continue;
    if (kind === 'runway' && s.dist > 2000) continue;
    seen.add(kind);
    out.push(TIPS[kind](s));
    if (out.length === 3) break;
  }
  if (!out.length) out.push('Visit once in the evening and once on a weekday morning.');
  return out;
}

function renderSpot() {
  spotHead();
  const a = state.analysis;
  if (a === 'error') {
    sideBody.innerHTML = `
      <section class="section">
        <div class="section-title">Couldn't load this area.</div>
        <p class="copy" style="margin:8px 0 20px">The free OpenStreetMap servers are busy. Try again in a few seconds.</p>
        <button class="btn-blue" id="retry">Try again</button>
      </section>`;
    $('#retry').addEventListener('click', () => select(state.selected.lat, state.selected.lon, state.place));
    return;
  }
  if (!a) {
    sideBody.innerHTML = `
      <section class="section">
        <p class="loading-text">Reading the streets around this spot.</p>
        <p class="fine" style="margin-top:6px">The first look at a new area can take up to 30 seconds.</p>
      </section>`;
    return;
  }

  const p = state.period;
  const db = p === 'day' ? a.day : a.night;
  const lvl = levelLabel(db);
  const guide = p === 'day' ? 53 : 45;
  const diff = round(db - guide);
  const v = verdicts(a);
  const sources = [...a.sources].sort((x, y) => y[p] - x[p]);
  const top = sources.slice(0, 6);
  const tips = tipsFor(sources);
  const near = nearbyReports(state.selected.lat, state.selected.lon);
  const nowHour = new Date().getHours();
  const readout = `Loudest at ${hourLabel(a.loudestHour)}`;

  sideBody.innerHTML = `
    <section class="section">
      <div class="eyebrow">${p === 'day' ? 'Daytime average, 7 AM to 10 PM' : 'Night average, 10 PM to 7 AM'}</div>
      <div class="reading"><span class="reading-num">${round(db)}</span><span class="reading-unit">dB</span></div>
      <div class="reading-level">${lvl.text}.</div>
      <p class="reading-note">${capitalise(comparison(db))}. ${diff > 0
        ? `${diff} dB above the WHO ${p === 'day' ? 'daytime' : 'night'} limit of ${guide} dB.`
        : `Within the WHO ${p === 'day' ? 'daytime' : 'night'} limit of ${guide} dB.`}${a.green ? ` Next to ${esc(a.green.name || 'a park')}, which helps a little.` : ''}</p>
      ${scaleHTML(db)}
      <div class="compare">
        <button class="compare-tile" data-period="day" aria-pressed="${p === 'day'}">
          <div class="compare-label">Day</div>
          <div class="compare-num">${round(a.day)}<small> dB</small></div>
          <div class="compare-level">${levelLabel(a.day).text}</div>
        </button>
        <button class="compare-tile" data-period="night" aria-pressed="${p === 'night'}">
          <div class="compare-label">Night</div>
          <div class="compare-num">${round(a.night)}<small> dB</small></div>
          <div class="compare-level">${levelLabel(a.night).text}</div>
        </button>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><div class="section-title">For renters.</div></div>
      <dl class="rows">
        <div><dt>Sleep</dt><dd>${v.sleep}</dd></div>
        <div><dt>Work from home</dt><dd>${v.work}</dd></div>
      </dl>
    </section>

    <section class="section">
      <div class="section-head"><div class="section-title">Through the day.</div><div class="section-aside" id="hourRead">${readout}</div></div>
      <div id="barsBox">${barsSVG(a.hourly, p, nowHour)}</div>
      <div class="bars-key">
        <span><i style="background:#1d1d1f"></i>${p === 'day' ? 'Daytime hours' : 'Night hours'}</span>
        <span><i style="background:#0071e3"></i>Now</span>
        <span><i style="height:0;border-top:1px dashed #86868b;border-radius:0"></i>WHO limit, ${guide} dB</span>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><div class="section-title">What you'll hear.</div></div>
      ${top.length ? `<ul class="list">${top.map((s) => `
        <li>
          <div class="list-main">
            <div class="list-title">${esc(s.name || s.label)}</div>
            <div class="list-meta">${esc(s.name ? s.label : 'Unnamed')}, ${s.dist < 15 ? 'right here' : `${round(s.dist / 5) * 5} m away`}</div>
          </div>
          <div class="list-val">${round(s[p])} dB</div>
        </li>`).join('')}</ul>` : '<p class="copy">No major noise sources are mapped nearby. Expect a steady background hum.</p>'}
    </section>

    <section class="section">
      <div class="section-head"><div class="section-title">Before you sign.</div></div>
      <ol class="steps">${tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>
    </section>

    <section class="section">
      <div class="section-head"><div class="section-title">Neighbours say.</div><div class="section-aside">Within 400 m</div></div>
      ${near.length ? `<div class="tiles">${near.slice(0, 4).map(reportTile).join('')}</div>` : '<p class="copy">No reports here yet.</p>'}
      <button class="btn-plain" id="reportHere" style="margin-top:20px">Report noise here</button>
    </section>

    <p class="fine">Estimated from ${a.sourceCount} mapped sources within about 900 m, using OpenStreetMap data. Real levels vary with traffic, building layout and events. <button class="link" data-open-method-inline>How it works</button></p>`;

  $$('.compare-tile', sideBody).forEach((b) => b.addEventListener('click', () => setPeriod(b.dataset.period)));
  $('#reportHere').addEventListener('click', () => openReport(state.selected));
  $('[data-open-method-inline]', sideBody).addEventListener('click', () => methodDialog.showModal());
  bindBars($('#barsBox'), (h) => {
    $('#hourRead').textContent = h === null ? readout : `${hourLabel(h)}, ${round(a.hourly[h])} dB`;
  });
}

const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- community reports ----------

let reportPins = [];

function timeAgo(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'Just now';
  if (s < 3600) return `${round(s / 60)} min ago`;
  if (s < 86400) return `${round(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${round(s / 86400)} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

function reportTile(r) {
  const t = REPORT_TYPES[r.type] || REPORT_TYPES.other;
  return `<div class="tile">
    <div class="tile-kicker">${timeAgo(r.created_at)}</div>
    <div class="tile-title">${esc(t.label)}</div>
    <div class="tile-meta">${esc(LOUDNESS[r.loudness - 1] || '')}, ${esc((TIME_SLOTS[r.slot]?.label || '').toLowerCase())}${r.measured_db ? `, ${r.measured_db} dB` : ''}</div>
    ${r.note ? `<div class="tile-note">${esc(r.note)}</div>` : ''}
  </div>`;
}

function nearbyReports(lat, lon, radius = 400) {
  const kx = 111320 * Math.cos((lat * Math.PI) / 180);
  return state.reports
    .map((r) => ({ ...r, dist: Math.hypot((r.lon - lon) * kx, (r.lat - lat) * 110574) }))
    .filter((r) => r.dist <= radius)
    .sort((a, b) => a.dist - b.dist);
}

function periodReports() {
  const night = state.period === 'night';
  return state.reports.filter((r) => (TIME_SLOTS[r.slot]?.night ?? false) === night);
}

async function loadReports() {
  const b = map.getBounds();
  const pad = 0.01;
  try {
    state.reports = await fetchReports({ s: b.getSouth() - pad, w: b.getWest() - pad, n: b.getNorth() + pad, e: b.getEast() + pad });
  } catch {
    state.reports = [];
  }
  renderReportPins();
  if (state.mode === 'browse') render();
}

function renderReportPins() {
  reportPins.forEach((m) => m.remove());
  reportPins = [];
  for (const r of periodReports()) {
    const t = REPORT_TYPES[r.type] || REPORT_TYPES.other;
    const el = pinElement('#1d1d1f', 20);
    el.setAttribute('aria-label', `${t.label} report`);
    el.addEventListener('click', (e) => e.stopPropagation());
    const popup = new maplibregl.Popup({ offset: 24, closeButton: false, maxWidth: '260px' }).setHTML(`
      <div class="pop-kicker">${timeAgo(r.created_at)}</div>
      <div class="pop-title">${esc(t.label)}</div>
      <div class="pop-meta">${esc(LOUDNESS[r.loudness - 1] || '')}, ${esc((TIME_SLOTS[r.slot]?.label || '').toLowerCase())}${r.measured_db ? `, ${r.measured_db} dB` : ''}</div>
      ${r.note ? `<div class="pop-note">${esc(r.note)}</div>` : ''}`);
    reportPins.push(new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([r.lon, r.lat]).setPopup(popup).addTo(map));
  }
}

// ---------- report flow (shown in the side panel) ----------

let reportPin = null;
let reportLoc = null;
let measuredDb = null;
let previous = null;

function currentSlot() {
  const h = new Date().getHours();
  if (h >= 6 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 22) return 'evening';
  return 'night';
}

function choices(obj, name, checked, withHint = false) {
  return Object.entries(obj).map(([k, v]) => `
    <label class="choice">
      <input type="radio" name="${name}" value="${k}" ${k === checked ? 'checked' : ''}>
      <span>${esc(v.label)}${withHint ? `<small>${esc(v.hint)}</small>` : ''}</span>
    </label>`).join('');
}

function openReport(at) {
  const c = map.getCenter();
  const loc = at || state.selected || { lat: c.lat, lon: c.lng };
  previous = state.mode === 'report' ? previous : state.mode;
  state.mode = 'report';
  measuredDb = null;
  tip.hidden = true;
  spotPin?.remove();
  $('#controls').hidden = true;

  sideHead.innerHTML = `
    <button class="back" id="cancelTop"><i data-lucide="chevron-left"></i>Cancel</button>
    <h1>Report noise.</h1>
    <p class="sub">Tell future renters what this place really sounds like.</p>`;
  sideBody.innerHTML = `
    <form id="reportForm" class="form">
      <div class="field">
        <div class="field-label">Location.</div>
        <div class="field-hint">Click the map or drag the pin to move it.</div>
        <div class="where" id="reportPlace">Finding address</div>
      </div>
      <div class="field">
        <div class="field-label">What do you hear?</div>
        <div class="field-hint">Choose the main source.</div>
        <div class="choices">${choices(REPORT_TYPES, 'type', null)}</div>
      </div>
      <div class="field">
        <div class="field-label">When is it worst?</div>
        <div class="field-hint">Late night reports show on the Night map.</div>
        <div class="choices">${choices(TIME_SLOTS, 'slot', currentSlot(), true)}</div>
      </div>
      <div class="field">
        <div class="field-label">How loud does it feel?</div>
        <input type="range" id="loudness" min="1" max="5" step="1" value="3" aria-label="Loudness" />
        <div class="range-foot"><span>Barely noticeable</span><span>Unbearable</span></div>
        <div class="range-value" id="loudLabel">${LOUDNESS[2]}</div>
      </div>
      <div class="field">
        <div class="field-label">Measure it. <span class="muted" style="font-weight:400;font-size:17px;color:var(--grey)">Optional</span></div>
        <div class="field-hint">Uses your microphone for 10 seconds. Phone mics are not calibrated, so treat it as a rough guide.</div>
        <div class="meter-row">
          <button type="button" class="btn-plain" id="measureBtn">Start measuring</button>
          <div id="meterRead"></div>
        </div>
      </div>
      <div class="field">
        <div class="field-label">Anything renters should know? <span style="font-weight:400;font-size:17px;color:var(--grey)">Optional</span></div>
        <textarea id="note" rows="3" maxlength="240" placeholder="For example, delivery trucks unload behind the building around 5 AM."></textarea>
      </div>
      <div class="form-foot">
        <button class="btn-blue wide" type="submit" id="submitReport">Submit report</button>
        <div class="note">${storeMode === 'shared' ? 'Reports are public and anonymous.' : 'Saved in this browser until a shared database is connected.'}</div>
      </div>
    </form>`;

  const loud = $('#loudness');
  loud.addEventListener('input', () => ($('#loudLabel').textContent = LOUDNESS[loud.value - 1]));
  $('#cancelTop').addEventListener('click', closeReport);
  $('#measureBtn').addEventListener('click', runMeasure);
  $('#reportForm').addEventListener('submit', submitReport);
  setReportPin(loc.lat, loc.lon);
  icons();
  $('#side').scrollTop = 0;
}

function closeReport() {
  reportPin?.remove();
  reportPin = null;
  if (previous === 'spot' && state.selected) {
    state.mode = 'spot';
    spotPin?.addTo(map);
  } else {
    state.mode = 'browse';
  }
  render();
}

function setReportPin(lat, lon) {
  reportLoc = { lat, lon };
  if (!reportPin) {
    reportPin = new maplibregl.Marker({ element: pinElement('#0071e3', 30), draggable: true, anchor: 'bottom' })
      .setLngLat([lon, lat]).addTo(map);
    reportPin.on('dragend', () => {
      const ll = reportPin.getLngLat();
      setReportPin(ll.lat, ll.lng);
    });
  } else {
    reportPin.setLngLat([lon, lat]);
  }
  const el = $('#reportPlace');
  if (el) el.textContent = 'Finding address';
  reverseGeocode(lat, lon).then((p) => {
    const box = $('#reportPlace');
    if (box && reportLoc && reportLoc.lat === lat) box.textContent = p.sub ? `${p.title}, ${p.sub.split(',')[0]}` : p.title;
  });
}

async function runMeasure() {
  const btn = $('#measureBtn');
  const out = $('#meterRead');
  btn.disabled = true;
  btn.textContent = 'Measuring';
  try {
    const db = await measure(10, (now, t) => {
      out.innerHTML = `<span class="meter-val">${round(now)}<small>dB, ${Math.ceil(10 - t * 10)} s left</small></span>`;
    });
    measuredDb = db;
    out.innerHTML = `<span class="meter-val">${db}<small>dB average</small></span>`;
    btn.textContent = 'Measure again';
  } catch {
    out.innerHTML = '<span class="field-hint" style="margin:0">Microphone not available. You can still submit.</span>';
    btn.textContent = 'Start measuring';
  } finally {
    btn.disabled = false;
  }
}

async function submitReport(e) {
  e.preventDefault();
  const type = $('input[name=type]:checked')?.value;
  const slot = $('input[name=slot]:checked')?.value;
  if (!type) { toast('Choose what kind of noise you hear.'); return; }
  if (!reportLoc) { toast('Click the map to place your report.'); return; }
  const btn = $('#submitReport');
  btn.disabled = true;
  try {
    const saved = await addReport({
      lat: reportLoc.lat,
      lon: reportLoc.lon,
      type,
      slot,
      loudness: +$('#loudness').value,
      measured_db: measuredDb,
      note: $('#note').value.trim(),
    });
    state.reports.unshift(saved);
    const night = TIME_SLOTS[slot].night;
    closeReport();
    if (night !== (state.period === 'night')) setPeriod(night ? 'night' : 'day');
    else { renderReportPins(); render(); }
    toast(storeMode === 'shared' ? 'Thank you. Your report is now on the map.' : 'Thank you. Your report is saved on this device.');
  } catch {
    btn.disabled = false;
    toast('Could not save the report. Please try again.');
  }
}

$('#reportBtn').addEventListener('click', () => (state.mode === 'report' ? closeReport() : openReport()));

render();
icons();
