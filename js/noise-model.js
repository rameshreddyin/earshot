// Noise model: turns OpenStreetMap features into estimated sound levels, dB(A).
// Each source has a peak level at 10 m and an hourly activity profile (0..1).
// Levels drop with distance, then all sources are summed energetically.
// This is a screening estimate in the spirit of CNOSSOS-EU, not a measurement.

export const DAY_HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
export const NIGHT_HOURS = [22, 23, 0, 1, 2, 3, 4, 5, 6];

export const PROFILES = {
  traffic:      [.16,.11,.09,.09,.12,.25,.55,.85,1,.95,.85,.8,.8,.8,.8,.85,.95,1,1,.9,.75,.55,.38,.24],
  local:        [.08,.05,.04,.04,.06,.15,.45,.8,1,.9,.8,.75,.75,.75,.75,.8,.9,1,1,.85,.65,.4,.22,.12],
  highway:      [.35,.3,.28,.28,.32,.45,.7,.9,1,.95,.9,.85,.85,.85,.85,.9,.95,1,1,.95,.85,.7,.55,.42],
  rail:         [.4,.35,.35,.35,.45,.65,.9,1,1,.9,.8,.8,.8,.8,.8,.85,.9,1,1,.9,.8,.7,.6,.5],
  nightlife:    [.85,.6,.3,.1,.03,.02,.02,.02,.02,.02,.03,.06,.12,.12,.1,.1,.14,.25,.4,.6,.8,.95,1,.95],
  dining:       [.15,.05,.02,.02,.02,.03,.1,.3,.5,.45,.4,.55,.9,1,.7,.45,.45,.6,.8,.95,1,.9,.6,.3],
  school:       [.01,.01,.01,.01,.01,.01,.02,.4,1,.6,.5,.6,.7,.6,.6,1,.4,.1,.02,.01,.01,.01,.01,.01],
  worship:      [.05,.03,.03,.05,.6,1,.6,.25,.2,.2,.2,.2,.5,.3,.2,.2,.2,.4,1,.6,.3,.15,.08,.05],
  medical:      [.5,.45,.45,.45,.5,.6,.8,.9,1,1,1,1,1,1,1,1,1,1,.95,.9,.8,.7,.6,.55],
  market:       [.02,.01,.01,.01,.03,.1,.4,.7,.85,.95,1,1,1,1,.95,.95,1,1,1,.9,.7,.4,.1,.04],
  industry:     [.35,.35,.35,.35,.35,.4,.7,1,1,1,1,1,.9,1,1,1,1,.9,.6,.45,.4,.35,.35,.35],
  construction: [.02,.02,.02,.02,.02,.02,.1,.6,1,1,1,1,.6,1,1,1,1,.8,.3,.08,.04,.02,.02,.02],
  aviation:     [.3,.2,.15,.15,.25,.6,.9,1,1,1,.95,.95,.95,.95,.95,.95,1,1,1,1,.95,.85,.7,.5],
  events:       [.2,.05,.02,.02,.02,.02,.02,.03,.05,.1,.15,.2,.2,.2,.25,.3,.4,.6,.9,1,1,.9,.6,.4],
  transit:      [.15,.08,.06,.06,.15,.5,.85,1,1,.9,.8,.8,.8,.8,.8,.85,.95,1,1,.9,.8,.6,.4,.25],
};

// kind: line and runway (distance to polyline), point, area (distance to edge)
export const CATS = {
  motorway:     { label: 'Motorway',            icon: 'car',          kind: 'line',  peak: 80, range: 900, profile: 'highway' },
  trunk:        { label: 'Highway',             icon: 'car',          kind: 'line',  peak: 77, range: 800, profile: 'highway' },
  primary:      { label: 'Main road',           icon: 'car',          kind: 'line',  peak: 74, range: 600, profile: 'traffic' },
  secondary:    { label: 'Secondary road',      icon: 'car',          kind: 'line',  peak: 70, range: 450, profile: 'traffic' },
  tertiary:     { label: 'Local through road',  icon: 'car',          kind: 'line',  peak: 64, range: 300, profile: 'traffic' },
  minor:        { label: 'Minor road',          icon: 'car',          kind: 'line',  peak: 58, range: 150, profile: 'local' },
  residential:  { label: 'Residential street',  icon: 'house',        kind: 'line',  peak: 52, range: 100, profile: 'local' },
  rail:         { label: 'Railway',             icon: 'train-front',  kind: 'line',  peak: 76, range: 700, profile: 'rail' },
  metro:        { label: 'Metro line',          icon: 'train-front',  kind: 'line',  peak: 70, range: 400, profile: 'rail' },
  tram:         { label: 'Tram line',           icon: 'train-front',  kind: 'line',  peak: 67, range: 250, profile: 'rail' },
  nightclub:    { label: 'Nightclub',           icon: 'music',        kind: 'point', peak: 74, range: 350, profile: 'nightlife' },
  bar:          { label: 'Bar or pub',          icon: 'beer',         kind: 'point', peak: 67, range: 250, profile: 'nightlife' },
  dining:       { label: 'Restaurant or café',  icon: 'utensils',     kind: 'point', peak: 56, range: 80,  profile: 'dining' },
  school:       { label: 'School',              icon: 'school',       kind: 'point', peak: 66, range: 250, profile: 'school' },
  worship:      { label: 'Place of worship',    icon: 'landmark',     kind: 'point', peak: 66, range: 300, profile: 'worship' },
  hospital:     { label: 'Hospital sirens',     icon: 'siren',        kind: 'point', peak: 62, range: 300, profile: 'medical' },
  fire:         { label: 'Fire station',        icon: 'siren',        kind: 'point', peak: 64, range: 350, profile: 'medical' },
  bus:          { label: 'Bus station',         icon: 'bus',          kind: 'point', peak: 70, range: 300, profile: 'transit' },
  market:       { label: 'Market',              icon: 'store',        kind: 'point', peak: 68, range: 250, profile: 'market' },
  mall:         { label: 'Shopping mall',       icon: 'store',        kind: 'point', peak: 62, range: 200, profile: 'market' },
  venue:        { label: 'Event venue',         icon: 'music',        kind: 'point', peak: 66, range: 250, profile: 'events' },
  stadium:      { label: 'Stadium',             icon: 'music',        kind: 'point', peak: 72, range: 600, profile: 'events' },
  fuel:         { label: 'Fuel station',        icon: 'fuel',         kind: 'point', peak: 58, range: 100, profile: 'transit' },
  industrial:   { label: 'Industrial area',     icon: 'factory',      kind: 'area',  peak: 58, range: 300, profile: 'industry' },
  construction: { label: 'Construction site',   icon: 'construction', kind: 'area',  peak: 64, range: 250, profile: 'construction' },
  railyard:     { label: 'Rail yard',           icon: 'train-front',  kind: 'area',  peak: 62, range: 350, profile: 'rail' },
  // runway level is given at 1 km rather than 10 m
  runway:       { label: 'Airport runway',      icon: 'plane',        kind: 'runway', peak: 55, range: 5000, profile: 'aviation' },
};

const BACKGROUND = { peak: 46, profile: 'traffic' };

// drawing weight of each line class on the map
const RANK = { motorway: 4, trunk: 4, primary: 3, secondary: 3, tertiary: 2, minor: 1, residential: 1, rail: 3, metro: 3, tram: 2 };

const mean = (arr, hours) => hours.reduce((s, h) => s + arr[h], 0) / hours.length;
const OFFSETS = {};
for (const [name, p] of Object.entries(PROFILES)) {
  OFFSETS[name] = {
    hourly: p.map((a) => 10 * Math.log10(Math.max(a, 0.005))),
    day: 10 * Math.log10(mean(p, DAY_HOURS)),
    night: 10 * Math.log10(mean(p, NIGHT_HOURS)),
  };
}

// ---------- classification of OSM elements ----------

const ROAD_CLASS = {
  motorway: 'motorway', trunk: 'trunk', primary: 'primary', secondary: 'secondary', tertiary: 'tertiary',
  motorway_link: 'primary', trunk_link: 'secondary', primary_link: 'tertiary', secondary_link: 'tertiary',
  unclassified: 'minor', residential: 'residential', living_street: 'residential',
};

export function classify(tags = {}) {
  if (tags.highway && ROAD_CLASS[tags.highway]) return ROAD_CLASS[tags.highway];
  const r = tags.railway;
  if (r === 'rail') return 'rail';
  if (r === 'light_rail' || r === 'subway' || r === 'monorail') return 'metro';
  if (r === 'tram') return 'tram';
  const a = tags.amenity;
  if (a === 'nightclub') return 'nightclub';
  if (a === 'bar' || a === 'pub' || a === 'biergarten') return 'bar';
  if (a === 'restaurant' || a === 'fast_food' || a === 'cafe' || a === 'food_court') return 'dining';
  if (a === 'school' || a === 'college' || a === 'kindergarten' || a === 'university') return 'school';
  if (a === 'place_of_worship') return 'worship';
  if (a === 'hospital') return 'hospital';
  if (a === 'fire_station') return 'fire';
  if (a === 'bus_station') return 'bus';
  if (a === 'marketplace') return 'market';
  if (a === 'events_venue') return 'venue';
  if (a === 'fuel') return 'fuel';
  if (tags.shop === 'mall') return 'mall';
  const l = tags.leisure;
  if (l === 'stadium') return 'stadium';
  if (l === 'park' || l === 'garden' || l === 'nature_reserve') return 'green';
  const lu = tags.landuse;
  if (lu === 'industrial') return 'industrial';
  if (lu === 'construction') return 'construction';
  if (lu === 'railway') return 'railyard';
  if (lu === 'forest' || lu === 'recreation_ground' || lu === 'cemetery') return 'green';
  if (tags.aeroway === 'runway') return 'runway';
  return null;
}

// ---------- spatial index ----------

const CELL = 0.004; // degrees, about 440 m
const KY = 110574;
const cellKey = (lat, lon) => `${Math.floor(lat / CELL)}|${Math.floor(lon / CELL)}`;

export class NoiseIndex {
  constructor() {
    this.cells = new Map();   // cellKey -> [{g, a, b, c, d}] segments or {g, lat, lon} points
    this.groups = [];         // {cat, name, kind, boost}
    this.groupByKey = new Map();
    this.areas = [];          // {g, lat, lon, r}
    this.greens = [];         // {lat, lon, r, name}
    this.runways = [];        // {g, a, b, c, d} segments
    this.lines = [];          // full street and rail geometry, for drawing
    this.seen = new Set();
  }

  group(key, cat, name, boost = 0) {
    let g = this.groupByKey.get(key);
    if (g === undefined) {
      g = this.groups.length;
      this.groups.push({ cat, name, boost });
      this.groupByKey.set(key, g);
    }
    return g;
  }

  push(lat, lon, item) {
    const k = cellKey(lat, lon);
    let list = this.cells.get(k);
    if (!list) this.cells.set(k, (list = []));
    list.push(item);
  }

  addElement(el) {
    const uid = el.type[0] + el.id;
    if (this.seen.has(uid)) return;
    this.seen.add(uid);
    const tags = el.tags || {};
    const cat = classify(tags);
    if (!cat) return;
    const name = tags.name || tags['name:en'] || tags.ref || '';

    if (cat === 'green') {
      const box = boundsOf(el);
      if (box && box.r > 40) this.greens.push({ ...box, name });
      return;
    }

    const def = CATS[cat];
    if (def.kind === 'line' || def.kind === 'runway') {
      if (!el.geometry || el.geometry.length < 2) return;
      const lanes = parseInt(tags.lanes, 10);
      const boost = lanes >= 4 ? 1.5 : 0;
      const g = this.group(name ? `${cat}:${name}` : uid, cat, name, boost);
      const geo = el.geometry;
      if (def.kind === 'line') this.lines.push({ cat, name, boost, coords: geo.filter(Boolean).map((p) => [p.lon, p.lat]) });
      for (let i = 1; i < geo.length; i++) {
        const p = geo[i - 1], q = geo[i];
        if (!p || !q) continue;
        const seg = { g, a: p.lat, b: p.lon, c: q.lat, d: q.lon };
        if (def.kind === 'runway') { this.runways.push(seg); continue; }
        const k0 = Math.floor(Math.min(p.lat, q.lat) / CELL), k1 = Math.floor(Math.max(p.lat, q.lat) / CELL);
        const j0 = Math.floor(Math.min(p.lon, q.lon) / CELL), j1 = Math.floor(Math.max(p.lon, q.lon) / CELL);
        for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) {
          const key = `${k}|${j}`;
          let list = this.cells.get(key);
          if (!list) this.cells.set(key, (list = []));
          list.push(seg);
        }
      }
      return;
    }

    const box = boundsOf(el);
    if (!box) return;
    if (def.kind === 'area') {
      // a bounding box overstates irregular sites, so shrink the radius
      this.areas.push({ g: this.group(uid, cat, name), ...box, r: box.r * 0.6 });
    } else {
      this.push(box.lat, box.lon, { g: this.group(uid, cat, name), lat: box.lat, lon: box.lon });
    }
  }

  // Nearest distance to every source group that can be heard from (lat, lon).
  nearby(lat, lon) {
    const kx = 111320 * Math.cos((lat * Math.PI) / 180);
    const best = new Map();
    const ci = Math.floor(lat / CELL), cj = Math.floor(lon / CELL);
    const R = 2; // +/- 2 cells, about 900 m
    for (let k = ci - R; k <= ci + R; k++) {
      for (let j = cj - R; j <= cj + R; j++) {
        const list = this.cells.get(`${k}|${j}`);
        if (!list) continue;
        for (let n = 0; n < list.length; n++) {
          const it = list[n];
          let d;
          if (it.c !== undefined) {
            d = segDist((it.b - lon) * kx, (it.a - lat) * KY, (it.d - lon) * kx, (it.c - lat) * KY);
          } else {
            const dx = (it.lon - lon) * kx, dy = (it.lat - lat) * KY;
            d = Math.sqrt(dx * dx + dy * dy);
          }
          const prev = best.get(it.g);
          if (prev === undefined || d < prev) best.set(it.g, d);
        }
      }
    }
    for (const a of this.areas) {
      const dx = (a.lon - lon) * kx, dy = (a.lat - lat) * KY;
      const d = Math.max(Math.sqrt(dx * dx + dy * dy) - a.r, 0);
      const prev = best.get(a.g);
      if (prev === undefined || d < prev) best.set(a.g, d);
    }
    // runways are few and heard from far away, so check them directly
    for (const r of this.runways) {
      const d = segDist((r.b - lon) * kx, (r.a - lat) * KY, (r.d - lon) * kx, (r.c - lat) * KY);
      const prev = best.get(r.g);
      if (prev === undefined || d < prev) best.set(r.g, d);
    }
    let green = null;
    for (const gs of this.greens) {
      const dx = (gs.lon - lon) * kx, dy = (gs.lat - lat) * KY;
      if (Math.sqrt(dx * dx + dy * dy) < gs.r * 0.8) { green = gs; break; }
    }
    return { best, green };
  }

  // Sound level at the receiver from each source, before time-of-day scaling.
  contributions(lat, lon) {
    const { best, green } = this.nearby(lat, lon);
    const out = [];
    for (const [g, dist] of best) {
      const grp = this.groups[g];
      const def = CATS[grp.cat];
      if (dist > def.range) continue;
      out.push({ g, cat: grp.cat, name: grp.name, dist, base: attenuate(def, dist) + grp.boost });
    }
    return { list: out, green };
  }

  // Streets and rail as GeoJSON, each with its kerbside day and night level.
  lineFeatures() {
    return this.lines.map((l) => {
      const def = CATS[l.cat];
      const o = OFFSETS[def.profile];
      const base = attenuate(def, 12) + l.boost;
      return {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: l.coords },
        properties: { day: +(base + o.day).toFixed(1), night: +(base + o.night).toFixed(1), rank: RANK[l.cat] || 1 },
      };
    });
  }

  // Day and night levels at any point, used by the hover readout.
  // Fast path for the map layer: day and night levels only.
  dayNight(lat, lon) {
    const { list, green } = this.contributions(lat, lon);
    let eDay = 10 ** ((BACKGROUND.peak + OFFSETS[BACKGROUND.profile].day) / 10);
    let eNight = 10 ** ((BACKGROUND.peak + OFFSETS[BACKGROUND.profile].night) / 10);
    for (const c of list) {
      const o = OFFSETS[CATS[c.cat].profile];
      eDay += 10 ** ((c.base + o.day) / 10);
      eNight += 10 ** ((c.base + o.night) / 10);
    }
    const shade = green ? 2 : 0;
    return [10 * Math.log10(eDay) - shade, 10 * Math.log10(eNight) - shade];
  }

  // Full analysis for one spot: hourly curve, day/night levels and top sources.
  analyse(lat, lon) {
    const { list, green } = this.contributions(lat, lon);
    const shade = green ? 2 : 0;
    const bg = OFFSETS[BACKGROUND.profile];
    const hourly = [];
    for (let h = 0; h < 24; h++) {
      let e = 10 ** ((BACKGROUND.peak + bg.hourly[h]) / 10);
      for (const c of list) e += 10 ** ((c.base + OFFSETS[CATS[c.cat].profile].hourly[h]) / 10);
      hourly.push(10 * Math.log10(e) - shade);
    }
    const period = (hours) => 10 * Math.log10(hours.reduce((s, h) => s + 10 ** (hourly[h] / 10), 0) / hours.length);

    const sources = list.map((c) => {
      const o = OFFSETS[CATS[c.cat].profile];
      return { ...c, day: c.base + o.day, night: c.base + o.night, label: CATS[c.cat].label, icon: CATS[c.cat].icon };
    });
    const loudestHour = hourly.indexOf(Math.max(...hourly));
    const quietestHour = hourly.indexOf(Math.min(...hourly));
    return {
      hourly,
      day: period(DAY_HOURS),
      night: period(NIGHT_HOURS),
      sources,
      green,
      loudestHour,
      quietestHour,
      sourceCount: list.length,
    };
  }
}

// Beyond the first row of buildings, walls block much of the sound
const screening = (d) => Math.min(14, Math.max(0, (d - 25) * 0.08));

function attenuate(def, d) {
  if (def.kind === 'runway') return def.peak - 25 * Math.log10(Math.max(d, 400) / 1000);
  const dd = Math.max(d, 8);
  if (def.kind === 'line') return def.peak - 10 * Math.log10(dd / 10) - screening(dd);
  if (def.kind === 'area') return def.peak - 15 * Math.log10(dd / 10) - screening(dd);
  return def.peak - 20 * Math.log10(dd / 10) - screening(dd);
}

function segDist(ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const len2 = vx * vx + vy * vy;
  let t = len2 ? -(ax * vx + ay * vy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = ax + t * vx, y = ay + t * vy;
  return Math.sqrt(x * x + y * y);
}

function boundsOf(el) {
  if (el.lat !== undefined) return { lat: el.lat, lon: el.lon, r: 0 };
  const b = el.bounds;
  if (!b) return null;
  const lat = (b.minlat + b.maxlat) / 2, lon = (b.minlon + b.maxlon) / 2;
  const kx = 111320 * Math.cos((lat * Math.PI) / 180);
  const w = (b.maxlon - b.minlon) * kx, h = (b.maxlat - b.minlat) * KY;
  return { lat, lon, r: Math.sqrt(w * w + h * h) / 2 };
}

// ---------- shared scale ----------

// Apple system colours: green, yellow, orange, red, purple
export const RAMP = [
  [46, [52, 199, 89]],
  [55, [255, 204, 0]],
  [62, [255, 149, 0]],
  [68, [255, 59, 48]],
  [75, [175, 82, 222]],
];

export function rampColor(db) {
  if (db <= RAMP[0][0]) return RAMP[0][1];
  for (let i = 1; i < RAMP.length; i++) {
    const [d1, c1] = RAMP[i];
    if (db <= d1) {
      const [d0, c0] = RAMP[i - 1];
      const t = (db - d0) / (d1 - d0);
      return [0, 1, 2].map((k) => Math.round(c0[k] + (c1[k] - c0[k]) * t));
    }
  }
  return RAMP[RAMP.length - 1][1];
}

export const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

export function levelLabel(db) {
  if (db < 45) return { key: 'quiet', text: 'Quiet' };
  if (db < 55) return { key: 'moderate', text: 'Moderate' };
  if (db < 65) return { key: 'noisy', text: 'Noisy' };
  if (db < 72) return { key: 'loud', text: 'Loud' };
  return { key: 'vloud', text: 'Very loud' };
}

// Everyday comparisons make dB readable for non-experts
export function comparison(db) {
  if (db < 38) return 'like a quiet library';
  if (db < 45) return 'like a calm living room';
  if (db < 52) return 'like a quiet office';
  if (db < 58) return 'like normal conversation';
  if (db < 64) return 'like a busy restaurant';
  if (db < 70) return 'like a running vacuum cleaner';
  if (db < 76) return 'like standing beside busy traffic';
  return 'like a passing truck, constantly';
}
