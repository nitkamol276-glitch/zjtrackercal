/* กราฟ SVG เขียนเอง (ไม่มี library ภายนอก ใช้ออฟไลน์ได้)
   สีมาจาก CSS variables: --c-food (ชมพู = อาหาร), --c-activity (ฟ้า = กิจกรรม), --c-weight, --c-over
   ทุกกราฟแตะเพื่อดูค่าได้ และมีตารางให้ดูแทนกราฟ */

import { html, raw, fmt, esc } from './ui.js';

/* ---------- วงแหวนแคลอรี่ (Dashboard) ---------- */

export function ring({ food, goal, size = 148, stroke = 12 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const over = food > goal;
  const frac = goal > 0 ? Math.min(food / goal, 1) : 0;
  const dash = frac * c;
  return raw(`
    <svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--c-food-track)" stroke-width="${stroke}"/>
      ${frac > 0 ? `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none"
        stroke="${over ? 'var(--c-over)' : 'var(--c-food)'}" stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${dash} ${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/>` : ''}
    </svg>`);
}

/* ---------- แถบความคืบหน้า (สารอาหาร) ---------- */

export function meter(value, max, kind = 'food') {
  const over = value > max;
  const pct = max > 0 ? Math.min(value / max, 1) * 100 : 0;
  return html`<div class="meter meter-${kind}${over ? ' is-over' : ''}" aria-hidden="true"><div style="width:${pct.toFixed(1)}%"></div></div>`;
}

/* ---------- ตัวช่วยแกน ---------- */

function niceStep(range, ticks) {
  const raw = range / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}

function niceScale(min, max, ticks = 3) {
  if (max === min) { max += 1; min = Math.max(0, min - 1); }
  const step = niceStep(max - min, ticks);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 100) / 100);
  return { lo, hi, ticks: out };
}

/* แท่งปลายมน 4px ฐานเหลี่ยม */
function barPath(x, y, w, h) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/* tooltip ลอยเหนือจุดที่แตะ */
function attachTooltip(wrap, points, fmtTip, onActive) {
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;
  wrap.append(tip);
  const svg = wrap.querySelector('svg');
  const show = i => {
    const p = points[i];
    if (!p) return hide();
    tip.innerHTML = fmtTip(p);
    tip.hidden = false;
    const w = wrap.clientWidth;
    const tw = tip.offsetWidth;
    tip.style.left = Math.max(0, Math.min(w - tw, p.x - tw / 2)) + 'px';
    tip.style.top = Math.max(0, p.y - tip.offsetHeight - 10) + 'px';
    onActive(i);
  };
  const hide = () => { tip.hidden = true; onActive(-1); };
  const nearest = e => {
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let best = -1, bestD = Infinity;
    points.forEach((p, i) => { if (p && Math.abs(p.x - x) < bestD) { bestD = Math.abs(p.x - x); best = i; } });
    return best;
  };
  svg.addEventListener('pointerdown', e => show(nearest(e)));
  svg.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' || e.buttons) show(nearest(e)); });
  svg.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hide(); });
  svg.addEventListener('keydown', e => {
    const cur = points.findIndex((p, i) => p && svg.dataset.active == i);
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    let i = cur < 0 ? (step > 0 ? -1 : points.length) : cur;
    do { i += step; } while (i >= 0 && i < points.length && !points[i]);
    if (points[i]) show(i);
  });
  svg.addEventListener('blur', hide);
}

/* ตารางแทนกราฟ */
function tableView(data, unit, valueHead) {
  return html`
    <table class="chart-table">
      <thead><tr><th scope="col">ช่วงเวลา</th><th scope="col" class="num">${valueHead}</th></tr></thead>
      <tbody>${data.map(d => html`<tr><th scope="row">${d.long}</th><td class="num">${d.value == null ? '–' : `${fmt(d.value, 1)} ${unit}`}</td></tr>`)}</tbody>
    </table>`;
}

const H = 168;          // ความสูงพื้นที่กราฟ
const AXIS = 22;        // แถบ label แกน x
const PAD = { l: 40, r: 10, t: 14 };

/* label แกน x: เว้นระยะให้ไม่ชนกัน และให้ label สุดท้าย (วันนี้/เดือนนี้) แสดงเสมอ */
function xAxisLabels(data, xAt, band) {
  const n = data.length;
  const minGap = 30;
  const every = Math.max(1, Math.ceil(minGap / band));
  return data.map((d, i) => {
    const last = i === n - 1;
    const show = last || (i % every === 0 && (n - 1 - i) * band >= minGap);
    return show ? `<text x="${xAt(i)}" y="${PAD.t + H + 16}" class="tick" text-anchor="middle">${esc(d.label)}</text>` : '';
  }).join('');
}

/* ---------- กราฟแท่ง ---------- */

export function columnChart(el, { data, goal = null, unit = 'kcal', colorVar = '--c-food', label, valueHead = 'kcal' }) {
  const W = Math.max(280, el.clientWidth || 320);
  const n = data.length;
  const plotW = W - PAD.l - PAD.r;
  const band = plotW / n;
  const barW = Math.max(3, Math.min(24, band * 0.62));
  const max = Math.max(1, ...data.map(d => d.value || 0), goal || 0);
  const { hi, ticks } = niceScale(0, max * 1.05, 3);
  const y = v => PAD.t + H - (v / hi) * H;
  const points = [];
  let bars = '';
  data.forEach((d, i) => {
    const cx = PAD.l + band * i + band / 2;
    if (d.value > 0) {
      const top = y(d.value);
      bars += `<path class="bar" data-i="${i}" d="${barPath(cx - barW / 2, top, barW, PAD.t + H - top)}" fill="var(${colorVar})"/>`;
      points.push({ x: cx, y: top, d });
    } else {
      points.push(d.value === 0 ? { x: cx, y: PAD.t + H, d } : null);
    }
  });

  const grid = ticks.map(t => `
    <line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(t)}" y2="${y(t)}" class="grid"/>
    <text x="${PAD.l - 6}" y="${y(t) + 4}" class="tick" text-anchor="end">${fmt(t)}</text>`).join('');

  const xl = xAxisLabels(data, i => PAD.l + band * i + band / 2, band);

  const goalLine = goal ? `
    <line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(goal)}" y2="${y(goal)}" class="goal-line"/>
    <text x="${W - PAD.r}" y="${y(goal) - 5}" class="goal-label" text-anchor="end">เป้า ${fmt(goal)}</text>` : '';

  el.innerHTML = `
    <div class="chart-wrap">
      <svg width="${W}" height="${PAD.t + H + AXIS}" viewBox="0 0 ${W} ${PAD.t + H + AXIS}" role="img" tabindex="0"
        aria-label="${esc(label)}">
        ${grid}
        <line x1="${PAD.l}" x2="${W - PAD.r}" y1="${PAD.t + H}" y2="${PAD.t + H}" class="axis"/>
        ${bars}${goalLine}${xl}
      </svg>
    </div>`;

  const wrap = el.querySelector('.chart-wrap');
  attachTooltip(wrap, points, p => `<strong>${fmt(p.d.value)} ${unit}</strong><span>${esc(p.d.long)}</span>`, i => {
    wrap.querySelector('svg').dataset.active = i;
    wrap.querySelectorAll('.bar').forEach(b => b.classList.toggle('dim', i >= 0 && Number(b.dataset.i) !== i));
  });
}

/* ---------- กราฟเส้น (น้ำหนัก) ---------- */

export function lineChart(el, { data, unit = 'kg', label, colorVar = '--c-weight' }) {
  const W = Math.max(280, el.clientWidth || 320);
  const n = data.length;
  const plotW = W - PAD.l - PAD.r;
  const step = n > 1 ? plotW / (n - 1) : 0;
  const vals = data.map(d => d.value).filter(v => v != null);
  const { lo, hi, ticks } = niceScale(Math.min(...vals) - 0.5, Math.max(...vals) + 0.5, 3);
  const y = v => PAD.t + H - ((v - lo) / (hi - lo)) * H;
  const x = i => n > 1 ? PAD.l + step * i : PAD.l + plotW / 2;

  const points = data.map((d, i) => d.value == null ? null : { x: x(i), y: y(d.value), d });
  const real = points.filter(Boolean);
  const path = real.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('');
  const last = real[real.length - 1];

  const grid = ticks.map(t => `
    <line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(t)}" y2="${y(t)}" class="grid"/>
    <text x="${PAD.l - 6}" y="${y(t) + 4}" class="tick" text-anchor="end">${fmt(t, 1)}</text>`).join('');
  const xl = xAxisLabels(data, x, n > 1 ? step : plotW);
  const dots = real.length <= 31
    ? real.map(p => `<circle cx="${p.x}" cy="${p.y}" r="4" class="dot" fill="var(${colorVar})"/>`).join('') : '';

  el.innerHTML = `
    <div class="chart-wrap">
      <svg width="${W}" height="${PAD.t + H + AXIS}" viewBox="0 0 ${W} ${PAD.t + H + AXIS}" role="img" tabindex="0" aria-label="${esc(label)}">
        ${grid}
        <line x1="${PAD.l}" x2="${W - PAD.r}" y1="${PAD.t + H}" y2="${PAD.t + H}" class="axis"/>
        <line class="crosshair" y1="${PAD.t}" y2="${PAD.t + H}" x1="0" x2="0" visibility="hidden"/>
        ${real.length > 1 ? `<path d="${path}" fill="none" stroke="var(${colorVar})" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
        ${dots}
        ${last ? `<circle cx="${last.x}" cy="${last.y}" r="5" class="dot" fill="var(${colorVar})"/>` : ''}
        ${xl}
      </svg>
    </div>`;

  const wrap = el.querySelector('.chart-wrap');
  const cross = wrap.querySelector('.crosshair');
  attachTooltip(wrap, points, p => `<strong>${fmt(p.d.value, 1)} ${unit}</strong><span>${esc(p.d.long)}</span>`, i => {
    wrap.querySelector('svg').dataset.active = i;
    const p = points[i];
    cross.setAttribute('visibility', p ? 'visible' : 'hidden');
    if (p) { cross.setAttribute('x1', p.x); cross.setAttribute('x2', p.x); }
  });
}

/* กล่องกราฟที่สลับเป็นตารางได้ */
export function chartWithTable(el, draw, data, unit, valueHead) {
  let asTable = false;
  const body = el.querySelector('[data-chart-body]');
  const btn = el.querySelector('[data-toggle-table]');
  const render = () => {
    if (asTable) body.innerHTML = tableView(data, unit, valueHead).s;
    else draw(body);
    btn.setAttribute('aria-pressed', String(asTable));
    btn.textContent = asTable ? 'กราฟ' : 'ตาราง';
  };
  btn.onclick = () => { asTable = !asTable; render(); };
  render();
}
