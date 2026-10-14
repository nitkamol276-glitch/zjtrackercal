/* Dashboard — แคลอรี่วันนี้ (วงแหวน + Base Goal / Food / Activity) และสารอาหาร */

import { html, fmt, fmtG, fmtDate, icon } from '../ui.js';
import { dailySummary, ymd } from '../calc.js';
import * as db from '../db.js';
import { state, targets } from '../state.js';
import { ring, meter } from '../charts.js';
import { openAdd } from './add.js';

const MACRO_LABEL = { carbs: 'Carbs', protein: 'Protein', fat: 'Fat' };

export async function renderDashboard(root) {
  const today = ymd();
  const [meals, activities] = await Promise.all([db.byDate('meals', today), db.byDate('activities', today)]);
  const t = targets();
  const s = dailySummary({ goalKcal: t.kcal, macroGoals: t.macros, meals, activities });
  const over = s.remaining < 0;
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  root.innerHTML = html`
    <header class="page-head">
      <p class="eyebrow">${fmtDate(today, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      <h1>${hello}${state.profile.name ? html`, ${state.profile.name}` : ''}</h1>
    </header>

    <section class="panel" aria-labelledby="cal-h">
      <h2 id="cal-h" class="panel-title">Today’s calories</h2>
      <div class="cal-row">
        <div class="ring-box">
          ${ring({ food: s.food, goal: s.goal })}
          <div class="ring-center">
            <strong>${fmt(Math.abs(s.remaining))}</strong>
            <span>${over ? 'Over' : 'Remaining'}</span>
          </div>
        </div>
        <dl class="cal-legend">
          <div><dt>${icon('flag', 18)} Base Goal</dt><dd>${fmt(s.goal)}</dd></div>
          <div><dt>${icon('fork', 18)} Food</dt><dd>${fmt(s.food)}</dd></div>
          <div><dt>${icon('flame', 18)} Activity</dt><dd>${fmt(s.activity)}</dd></div>
        </dl>
      </div>
      <p class="fine">Remaining = Base Goal − Food · แคลอรี่จาก Activity แสดงไว้ดูเฉยๆ ไม่นำมาบวกเพิ่ม</p>
      ${meals.length === 0 ? html`
        <div class="empty-row">
          <p>No meals logged yet. Tap + to add your first meal.</p>
          <button type="button" class="btn btn-primary btn-small" data-add>${icon('plus', 16)} Add meal</button>
        </div>` : ''}
    </section>

    <section class="panel" aria-labelledby="nut-h">
      <h2 id="nut-h" class="panel-title">Nutrition</h2>
      <ul class="macros">
        ${s.macros.map(m => html`
          <li>
            <div class="macro-line">
              <span class="macro-name">${MACRO_LABEL[m.key]}</span>
              <span class="macro-val"><strong>${fmtG(m.eaten)}</strong> / ${fmt(m.goal)} g</span>
            </div>
            ${meter(m.eaten, m.goal)}
            <span class="macro-left ${m.remaining < 0 ? 'is-over' : ''}">${m.remaining < 0 ? `${fmtG(-m.remaining)} g over` : `${fmtG(m.remaining)} g left`}</span>
          </li>`)}
      </ul>
    </section>

    ${meals.length ? html`
      <a class="link-row" href="#/diary">${meals.length} ${meals.length === 1 ? 'item' : 'items'} logged today <span>Open diary ${icon('right', 16)}</span></a>` : ''}
  `.s;

  const add = root.querySelector('[data-add]');
  if (add) add.onclick = () => openAdd({ date: today });
  const diaryLink = root.querySelector('.link-row');
  if (diaryLink) diaryLink.onclick = () => { state.diaryDate = today; };
}
