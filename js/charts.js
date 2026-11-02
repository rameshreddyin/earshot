// Level scale and 24 hour bar chart.
import { RAMP, rgb, DAY_HOURS } from './noise-model.js?v=4';

const MIN = 30, MAX = 80;
const pct = (db) => Math.min(Math.max((db - MIN) / (MAX - MIN), 0), 1) * 100;

export const hourLabel = (h) => `${((h + 11) % 12) + 1} ${h < 12 ? 'AM' : 'PM'}`;

// A horizontal scale in the Apple system colours with a marker at the reading
export function scaleHTML(db) {
  const segs = [[MIN, 45], [45, 55], [55, 65], [65, 72], [72, MAX]];
  return `<div class="scale">
    <div class="scale-bar">${segs.map(([a, b], i) => `<span style="flex:${b - a};background:${rgb(RAMP[i][1])}"></span>`).join('')}</div>
    <div class="scale-marker" style="left:${pct(db).toFixed(1)}%"></div>
    <div class="scale-labels"><span>Quiet</span><span>Moderate</span><span>Noisy</span><span>Loud</span><span>Very loud</span></div>
  </div>`;
}

const W = 360, H = 132, T = 8, B = 22;

export function barsSVG(hourly, period, nowHour) {
  const guide = period === 'day' ? 53 : 45;
  // fit the scale to the data so the daily rhythm is visible
  const lo = Math.floor(Math.min(...hourly, guide) / 5) * 5 - 5;
  const hi = Math.ceil(Math.max(...hourly, guide) / 5) * 5 + 2;
  const y = (db) => T + (H - T - B) * (1 - (Math.max(db, lo) - lo) / (hi - lo));
  const bw = W / 24;
  const inPeriod = (h) => (period === 'day' ? DAY_HOURS.includes(h) : !DAY_HOURS.includes(h));
  const bars = hourly.map((db, h) => {
    const cls = h === nowHour ? 'b now' : inPeriod(h) ? 'b on' : 'b';
    return `<rect class="${cls}" data-h="${h}" x="${(h * bw + 1.5).toFixed(1)}" y="${y(db).toFixed(1)}" width="${(bw - 3).toFixed(1)}" height="${(H - B - y(db)).toFixed(1)}" rx="2" />`;
  }).join('');
  const labels = [0, 6, 12, 18].map((h) => `<text x="${h * bw + 1.5}" y="${H - 6}">${hourLabel(h)}</text>`).join('');
  return `<svg class="bars" viewBox="0 0 ${W} ${H}" role="img" aria-label="Estimated level for each hour">
    ${bars}
    <line class="guide" x1="0" x2="${W}" y1="${y(guide)}" y2="${y(guide)}" />
    ${labels}
  </svg>`;
}

export function bindBars(box, onHover) {
  const svg = box.querySelector('svg.bars');
  if (!svg) return;
  let last = null;
  const set = (h) => {
    if (h === last) return;
    svg.querySelectorAll('.b.hover').forEach((r) => r.classList.remove('hover'));
    if (h !== null) svg.querySelector(`.b[data-h="${h}"]`)?.classList.add('hover');
    last = h;
    onHover(h);
  };
  const move = (ev) => {
    const r = svg.getBoundingClientRect();
    set(Math.min(23, Math.max(0, Math.floor(((ev.clientX - r.left) / r.width) * 24))));
  };
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerdown', move);
  svg.addEventListener('pointerleave', () => set(null));
}
