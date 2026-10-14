/* Dashboard — แคลอรี่วันนี้ (วงแหวน + Base Goal / Food / Activity) และสารอาหาร */

import { html, fmt, fmtG, fmtDate, icon } from '../ui.js';
import { dailySummary, ymd } from '../calc.js';
import * as db from '../db.js';
import { state, targets } from '../state.js';
import { ring, meter } from '../charts.js';
import { openAdd } from './add.js';

const MACRO_LABEL = { carbs: 'คาร์โบไฮเดรต', protein: 'โปรตีน', fat: 'ไขมัน' };

export async function renderDashboard(root) {
  const today = ymd();
  const [meals, activities] = await Promise.all([db.byDate('meals', today), db.byDate('activities', today)]);
  const t = targets();
  const s = dailySummary({ goalKcal: t.kcal, macroGoals: t.macros, meals, activities });
  const over = s.remaining < 0;
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'อรุณสวัสดิ์' : hour < 18 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น';

  root.innerHTML = html`
    <header class="page-head">
      <p class="eyebrow">${fmtDate(today, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      <h1>${hello}${state.profile.name ? html` ${state.profile.name}` : ''}</h1>
    </header>

    <section class="panel" aria-labelledby="cal-h">
      <h2 id="cal-h" class="panel-title">แคลอรี่วันนี้</h2>
      <div class="cal-row">
        <div class="ring-box">
          ${ring({ food: s.food, goal: s.goal })}
          <div class="ring-center">
            <strong>${fmt(Math.abs(s.remaining))}</strong>
            <span>${over ? 'เกินเป้า' : 'เหลือ'}</span>
          </div>
        </div>
        <dl class="cal-legend">
          <div><dt>${icon('flag', 18)} เป้าหมาย</dt><dd>${fmt(s.goal)}</dd></div>
          <div><dt>${icon('fork', 18)} อาหาร</dt><dd>${fmt(s.food)}</dd></div>
          <div><dt>${icon('flame', 18)} กิจกรรม</dt><dd>${fmt(s.activity)}</dd></div>
        </dl>
      </div>
      <p class="fine">เหลือ = เป้าหมาย − อาหาร · แคลอรี่จากกิจกรรมแสดงไว้ดูเฉยๆ ไม่นำมาบวกเพิ่ม</p>
      ${meals.length === 0 ? html`
        <div class="empty-row">
          <p>ยังไม่มีบันทึกอาหาร แตะ + เพื่อเพิ่มมื้อแรก</p>
          <button type="button" class="btn btn-primary btn-small" data-add>${icon('plus', 16)} เพิ่มอาหาร</button>
        </div>` : ''}
    </section>

    <section class="panel" aria-labelledby="nut-h">
      <h2 id="nut-h" class="panel-title">สารอาหาร</h2>
      <ul class="macros">
        ${s.macros.map(m => html`
          <li>
            <div class="macro-line">
              <span class="macro-name">${MACRO_LABEL[m.key]}</span>
              <span class="macro-val"><strong>${fmtG(m.eaten)}</strong> / ${fmt(m.goal)} g</span>
            </div>
            ${meter(m.eaten, m.goal)}
            <span class="macro-left ${m.remaining < 0 ? 'is-over' : ''}">${m.remaining < 0 ? `เกิน ${fmtG(-m.remaining)} g` : `เหลือ ${fmtG(m.remaining)} g`}</span>
          </li>`)}
      </ul>
    </section>

    ${meals.length ? html`
      <a class="link-row" href="#/diary">วันนี้บันทึกแล้ว ${meals.length} รายการ <span>ดูไดอารี่ ${icon('right', 16)}</span></a>` : ''}
  `.s;

  const add = root.querySelector('[data-add]');
  if (add) add.onclick = () => openAdd({ date: today });
  const diaryLink = root.querySelector('.link-row');
  if (diaryLink) diaryLink.onclick = () => { state.diaryDate = today; };
}
