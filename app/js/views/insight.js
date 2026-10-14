/* Insight — กราฟแคลอรี่ที่กิน / เผาผลาญ / น้ำหนัก (สัปดาห์ · เดือน · ปี) และ BMI ปัจจุบัน */

import { html, icon, fmt, fmtDate, segmented } from '../ui.js';
import { buildBuckets, aggregate, weightSeries, bmi, bmiCategory, BMI_BANDS, ymd } from '../calc.js';
import * as db from '../db.js';
import { state, targets } from '../state.js';
import { columnChart, lineChart, chartWithTable } from '../charts.js';
import { openWeight } from './add.js';

const PERIODS = [{ id: 'week', label: 'Week' }, { id: 'month', label: 'Month' }, { id: 'year', label: 'Year' }];
let period = 'week';

function chartPanel(id, title, sub, stat) {
  return html`
    <section class="panel chart-panel" id="${id}" aria-labelledby="${id}-h">
      <header class="chart-head">
        <div>
          <h2 id="${id}-h" class="panel-title">${title}</h2>
          <p class="chart-sub">${sub}</p>
        </div>
        <button type="button" class="link-btn" data-toggle-table aria-pressed="false">Table</button>
      </header>
      ${stat ? html`<p class="chart-stat">${stat}</p>` : ''}
      <div data-chart-body></div>
    </section>`;
}

function bmiScale(value) {
  const lo = 15, hi = 35;
  const pos = Math.max(0, Math.min(1, (value - lo) / (hi - lo))) * 100;
  let prev = lo;
  const segs = BMI_BANDS.map(b => {
    const to = Math.min(b.max, hi);
    const seg = { label: b.label, from: prev, w: ((to - prev) / (hi - lo)) * 100, on: value >= prev && value < b.max };
    prev = to;
    return seg;
  });
  return html`
    <div class="bmi-scale" aria-hidden="true">
      <div class="bmi-track">${segs.map(s => html`<span class="${s.on ? 'on' : ''}" style="width:${s.w.toFixed(2)}%"></span>`)}</div>
      <span class="bmi-marker" style="left:${pos.toFixed(2)}%"></span>
      <div class="bmi-ticks"><span style="left:${((18.5 - lo) / (hi - lo) * 100).toFixed(2)}%">18.5</span><span style="left:${((23 - lo) / (hi - lo) * 100).toFixed(2)}%">23</span><span style="left:${((25 - lo) / (hi - lo) * 100).toFixed(2)}%">25</span><span style="left:${((30 - lo) / (hi - lo) * 100).toFixed(2)}%">30</span></div>
    </div>`;
}

export async function renderInsight(root) {
  const today = ymd();
  const buckets = buildBuckets(period, today);
  const from = buckets[0].from, to = buckets[buckets.length - 1].to;
  const [meals, acts, weights, allWeights] = await Promise.all([
    db.byDateRange('meals', from, to),
    db.byDateRange('activities', from, to),
    db.byDateRange('weights', from, to),
    db.all('weights'),
  ]);
  const t = targets();
  const year = period === 'year';

  const intake = aggregate(buckets, meals, year ? 'avgLogged' : 'sum').map(b => (!year && b.days === 0 ? { ...b, value: null } : b));
  const burned = aggregate(buckets, acts, 'sum');
  const wSeries = weightSeries(buckets, weights);

  const loggedDays = new Set(meals.map(m => m.date)).size;
  const intakeTotal = meals.reduce((s, m) => s + (m.kcal || 0), 0);
  const avgIntake = loggedDays ? Math.round(intakeTotal / loggedDays) : null;
  const burnedTotal = Math.round(acts.reduce((s, a) => s + (a.kcal || 0), 0));

  const p = state.profile;
  const currentBmi = bmi(p.weightKg, p.heightCm);
  const wVals = wSeries.filter(w => w.value != null);
  const wChange = wVals.length > 1 ? Math.round((wVals[wVals.length - 1].value - wVals[0].value) * 10) / 10 : null;
  const periodWord = { week: '7 วันล่าสุด', month: '30 วันล่าสุด', year: '12 เดือนล่าสุด' }[period];   // คำอธิบายใต้กราฟ (ไทย)
  const periodEn = { week: 'last 7 days', month: 'last 30 days', year: 'last 12 months' }[period];      // ข้อความ empty state

  root.innerHTML = html`
    <header class="page-head">
      <h1>Insight</h1>
    </header>
    <div class="filter-row">${segmented('period', PERIODS, period)}</div>

    ${meals.length ? chartPanel('ins-intake', 'Calories intake',
        year ? 'เฉลี่ยต่อวันในแต่ละเดือน (นับเฉพาะวันที่มีบันทึก)' : `แคลอรี่ที่กินต่อวัน · ${periodWord}`,
        html`<strong>${fmt(avgIntake)}</strong> kcal/day on average · goal ${fmt(t.kcal)}`)
      : html`<section class="panel"><h2 class="panel-title">Calories intake</h2><p class="empty-inline">No meals logged in the ${periodEn}. Tap + to add your first meal.</p></section>`}

    ${acts.length ? chartPanel('ins-burned', 'Calories burned',
        year ? 'รวมต่อเดือนจากกิจกรรมที่บันทึก' : `แคลอรี่ที่เผาผลาญต่อวัน · ${periodWord}`,
        html`<strong>${fmt(burnedTotal)}</strong> kcal burned in total`)
      : html`<section class="panel"><h2 class="panel-title">Calories burned</h2><p class="empty-inline">No activities logged in the ${periodEn}.</p></section>`}

    ${wVals.length ? chartPanel('ins-weight', 'Weight',
        year ? 'ค่าล่าสุดของแต่ละเดือน (kg)' : `น้ำหนักที่บันทึก · ${periodWord}`,
        html`<strong>${fmt(p.weightKg, 1)} kg</strong> now${wChange != null ? html` · ${wChange > 0 ? '+' : wChange < 0 ? '−' : '±'}${fmt(Math.abs(wChange), 1)} kg in this period` : ''}${p.targetWeightKg ? ` · target ${fmt(p.targetWeightKg, 1)} kg` : ''}`)
      : html`
        <section class="panel">
          <h2 class="panel-title">Weight</h2>
          <div class="empty in-panel">
            <p>${allWeights.length ? `No weight entries in the ${periodEn}.` : 'No weight data yet. Add your first weight entry.'}</p>
            <button type="button" class="btn btn-quiet" data-add-weight>${icon('scale', 18)} Add weight</button>
          </div>
        </section>`}

    <section class="panel" aria-labelledby="bmi-h">
      <h2 id="bmi-h" class="panel-title">BMI</h2>
      ${currentBmi ? html`
        <p class="bmi-value"><strong>${currentBmi.toFixed(1)}</strong><span class="bmi-cat">${bmiCategory(currentBmi)}</span></p>
        ${bmiScale(currentBmi)}
        <p class="fine">คำนวณจาก ${fmt(p.weightKg, 1)} kg และ ${fmt(p.heightCm)} cm · เกณฑ์ WHO สำหรับคนเอเชีย (ที่กรมอนามัยใช้) · BMI แยกกล้ามเนื้อกับไขมันไม่ได้</p>`
      : html`<p class="empty-inline">Add your height and weight in Profile to see your BMI.</p>`}
    </section>
  `.s;

  root.querySelectorAll('[name=period]').forEach(r => r.onchange = () => { period = r.value; renderInsight(root); });
  const addW = root.querySelector('[data-add-weight]');
  if (addW) addW.onclick = () => openWeight({ date: today });

  /* วาดกราฟหลัง layout เสร็จ เพื่อรู้ความกว้างจริง */
  requestAnimationFrame(() => {
    const el = id => root.querySelector('#' + id);
    if (el('ins-intake')) chartWithTable(el('ins-intake'),
      body => columnChart(body, { data: intake, goal: t.kcal, unit: 'kcal', colorVar: '--c-food', label: 'Calories intake chart' }),
      intake, 'kcal', year ? 'Avg kcal/day' : 'kcal');
    if (el('ins-burned')) chartWithTable(el('ins-burned'),
      body => columnChart(body, { data: burned, unit: 'kcal', colorVar: '--c-activity', label: 'Calories burned chart' }),
      burned, 'kcal', 'kcal');
    if (el('ins-weight')) chartWithTable(el('ins-weight'),
      body => lineChart(body, { data: wSeries, unit: 'kg', label: 'Weight chart' }),
      wSeries, 'kg', 'kg');
  });
}
