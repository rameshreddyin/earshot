// Loads noise sources from OpenStreetMap (Overpass API) in fixed tiles,
// caches them in the browser and feeds them into the noise index.
import { CONFIG } from './config.js';
import { NoiseIndex } from './noise-model.js';

export const TILE = 0.02; // degrees, roughly 2 km
const CACHE_NAME = 'earshot-osm-v2';
const CACHE_DAYS = 14;

export const tileKey = (i, j) => `${i}_${j}`;
export const tileOf = (lat, lon) => [Math.floor(lat / TILE), Math.floor(lon / TILE)];
export const tileBounds = (i, j) => ({ s: i * TILE, w: j * TILE, n: (i + 1) * TILE, e: (j + 1) * TILE });

function buildQuery({ s, w, n, e }) {
  const bb = `${s},${w},${n},${e}`;
  const pad = 0.06;
  const big = `${s - pad},${w - pad},${n + pad},${e + pad}`;
  return `[out:json][timeout:40];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|motorway_link|trunk_link|primary_link|secondary_link)$"]["tunnel"!="yes"](${bb});
  way["railway"~"^(rail|light_rail|tram|subway|monorail)$"]["tunnel"!="yes"](${bb});
  way["aeroway"="runway"](${big});
);
out tags geom qt;
(
  nwr["amenity"~"^(bar|pub|biergarten|nightclub|restaurant|fast_food|cafe|food_court|school|college|kindergarten|university|place_of_worship|hospital|fire_station|bus_station|marketplace|events_venue|fuel)$"](${bb});
  nwr["leisure"~"^(park|garden|nature_reserve|stadium)$"](${bb});
  nwr["landuse"~"^(industrial|construction|railway|forest|recreation_ground|cemetery)$"](${bb});
  nwr["shop"="mall"](${bb});
);
out tags bb qt;`;
}

// Keep only what the model needs so the cache stays small
function compact(json) {
  return json.elements.map((el) => {
    const t = el.tags || {};
    const tags = {};
    for (const k of ['highway', 'railway', 'amenity', 'leisure', 'landuse', 'shop', 'aeroway', 'name', 'name:en', 'ref', 'lanes', 'iata', 'icao']) {
      if (t[k] !== undefined) tags[k] = t[k];
    }
    const out = { type: el.type, id: el.id, tags };
    if (el.lat !== undefined) { out.lat = el.lat; out.lon = el.lon; }
    if (el.bounds) out.bounds = el.bounds;
    if (el.geometry) out.geometry = el.geometry.map((p) => p && { lat: +p.lat.toFixed(6), lon: +p.lon.toFixed(6) });
    return out;
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchOverpass(query) {
  let lastErr;
  for (let round = 0; round < 3; round++) {
    for (const url of CONFIG.overpassEndpoints) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(query),
          // a busy server can hold the request for minutes; move on to the next one
          signal: AbortSignal.timeout(45000),
        });
        if (!res.ok) throw new Error(`Overpass ${res.status}`);
        const json = await res.json();
        if (!json.elements) throw new Error('Overpass returned no data');
        return json;
      } catch (err) {
        lastErr = err;
      }
    }
    await sleep(2500 * (round + 1));
  }
  throw lastErr;
}

async function cacheGet(key) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const res = await cache.match(`/osm-tile/${key}`);
    if (!res) return null;
    const saved = Number(res.headers.get('x-saved') || 0);
    if (Date.now() - saved > CACHE_DAYS * 864e5) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function cachePut(key, data) {
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(`/osm-tile/${key}`, new Response(JSON.stringify(data), {
      headers: { 'content-type': 'application/json', 'x-saved': String(Date.now()) },
    }));
  } catch {
    /* private mode or storage full: just skip caching */
  }
}

export class OsmTiles extends EventTarget {
  constructor() {
    super();
    this.index = new NoiseIndex();
    this.state = new Map(); // key -> 'queued' | 'loading' | 'ready' | 'error'
    this.waiters = new Map();
    this.queue = [];
    this.active = 0;
    this.concurrency = 2;
    this.focus = [0, 0];
  }

  isReady(key) { return this.state.get(key) === 'ready'; }

  // Request tiles; closest to the focus point load first.
  want(keys, focus, prune = false) {
    if (focus) this.focus = focus;
    if (prune) {
      // drop queued tiles the user has panned away from
      const keep = new Set(keys);
      this.queue = this.queue.filter((k) => {
        if (keep.has(k) || this.waiters.has(k)) return true;
        this.state.delete(k);
        return false;
      });
    }
    for (const k of keys) {
      if (!this.state.has(k) || this.state.get(k) === 'error') {
        this.state.set(k, 'queued');
        this.queue.push(k);
      }
    }
    const [fi, fj] = tileOf(...this.focus);
    this.queue.sort((a, b) => {
      const [ai, aj] = a.split('_').map(Number), [bi, bj] = b.split('_').map(Number);
      return Math.hypot(ai - fi, aj - fj) - Math.hypot(bi - fi, bj - fj);
    });
    this.pump();
    this.emitProgress();
  }

  // Resolves once every tile needed to analyse this spot is loaded.
  async ensureAround(lat, lon, radiusDeg = 0.009) {
    const keys = new Set();
    for (const dl of [-radiusDeg, 0, radiusDeg]) for (const dn of [-radiusDeg, 0, radiusDeg]) {
      const [i, j] = tileOf(lat + dl, lon + dn);
      keys.add(tileKey(i, j));
    }
    const list = [...keys];
    this.want(list, [lat, lon]);
    await Promise.all(list.map((k) => this.whenReady(k)));
  }

  whenReady(key) {
    if (this.isReady(key)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      if (!this.waiters.has(key)) this.waiters.set(key, []);
      this.waiters.get(key).push({ resolve, reject });
    });
  }

  pump() {
    while (this.active < this.concurrency && this.queue.length) {
      const key = this.queue.shift();
      if (this.state.get(key) !== 'queued') continue;
      this.active++;
      this.load(key).finally(() => {
        this.active--;
        this.pump();
        this.emitProgress();
      });
    }
  }

  async load(key) {
    this.state.set(key, 'loading');
    const [i, j] = key.split('_').map(Number);
    try {
      let data = await cacheGet(key);
      if (!data) {
        const json = await fetchOverpass(buildQuery(tileBounds(i, j)));
        data = compact(json);
        cachePut(key, data);
      }
      for (const el of data) this.index.addElement(el);
      this.state.set(key, 'ready');
      (this.waiters.get(key) || []).forEach((w) => w.resolve());
      this.waiters.delete(key);
      this.dispatchEvent(new CustomEvent('tile', { detail: { key, i, j } }));
    } catch (err) {
      console.warn('Tile failed', key, err);
      this.state.set(key, 'error');
      (this.waiters.get(key) || []).forEach((w) => w.reject(err));
      this.waiters.delete(key);
      this.dispatchEvent(new CustomEvent('tileerror', { detail: { key, err } }));
    }
  }

  emitProgress() {
    let pending = 0;
    for (const s of this.state.values()) if (s === 'queued' || s === 'loading') pending++;
    this.dispatchEvent(new CustomEvent('progress', { detail: { pending } }));
  }
}
