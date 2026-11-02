// Community reports. Uses Supabase when configured, otherwise this browser only.
import { CONFIG } from './config.js?v=4';

export const REPORT_TYPES = {
  traffic:      { label: 'Traffic',        icon: 'car' },
  honking:      { label: 'Honking',        icon: 'megaphone' },
  nightlife:    { label: 'Music, nightlife', icon: 'music' },
  construction: { label: 'Construction',   icon: 'construction' },
  neighbours:   { label: 'Neighbours',     icon: 'users' },
  dogs:         { label: 'Dogs',           icon: 'dog' },
  loudspeaker:  { label: 'Loudspeakers',   icon: 'volume-2' },
  trains:       { label: 'Trains, metro',  icon: 'train-front' },
  aircraft:     { label: 'Aircraft',       icon: 'plane' },
  industry:     { label: 'Industry',       icon: 'factory' },
  other:        { label: 'Something else', icon: 'audio-lines' },
};

export const TIME_SLOTS = {
  morning:   { label: 'Morning',   hint: '6 to 12',  hours: [6, 12], night: false },
  afternoon: { label: 'Afternoon', hint: '12 to 5',  hours: [12, 17], night: false },
  evening:   { label: 'Evening',   hint: '5 to 10',  hours: [17, 22], night: false },
  night:     { label: 'Late night', hint: '10 to 6', hours: [22, 6], night: true },
};

export const LOUDNESS = ['Barely noticeable', 'Noticeable', 'Annoying', 'Very disruptive', 'Unbearable'];

const LOCAL_KEY = 'earshot.reports.v1';
const useSupabase = Boolean(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey);

export const storeMode = useSupabase ? 'shared' : 'local';

function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeLocal(list) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable */
  }
}

function sbHeaders(extra = {}) {
  return {
    apikey: CONFIG.supabaseAnonKey,
    Authorization: `Bearer ${CONFIG.supabaseAnonKey}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

export async function fetchReports({ s, w, n, e }) {
  if (!useSupabase) {
    return readLocal().filter((r) => r.lat >= s && r.lat <= n && r.lon >= w && r.lon <= e);
  }
  const q = new URLSearchParams();
  q.append('select', '*');
  q.append('lat', `gte.${s}`);
  q.append('lat', `lte.${n}`);
  q.append('lon', `gte.${w}`);
  q.append('lon', `lte.${e}`);
  q.append('order', 'created_at.desc');
  q.append('limit', '500');
  const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/reports?${q}`, { headers: sbHeaders() });
  if (!res.ok) throw new Error('Could not load reports');
  return res.json();
}

export async function addReport(report) {
  const clean = {
    lat: +report.lat.toFixed(5),
    lon: +report.lon.toFixed(5),
    type: report.type,
    slot: report.slot,
    loudness: report.loudness,
    measured_db: report.measured_db ?? null,
    note: (report.note || '').slice(0, 240),
  };
  if (!useSupabase) {
    const saved = { ...clean, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    const list = readLocal();
    list.unshift(saved);
    writeLocal(list);
    return saved;
  }
  const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/reports`, {
    method: 'POST',
    headers: sbHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(clean),
  });
  if (!res.ok) throw new Error('Could not save your report');
  return (await res.json())[0];
}
