/* Diary — เลือกวัน (ก่อนหน้า / ถัดไป / Today / ปฏิทิน) แล้วดู/แก้/ลบ รายการอาหารแต่ละมื้อและกิจกรรม */

import { html, icon, fmt, fmtG, fmtDate, MEALS } from '../ui.js';
import { addDays, ymd, sumEntries } from '../calc.js';
import * as db from '../db.js';
import { state, targets } from '../state.js';
import { openAdd, openActivity, editMeal, editActivity, deleteEntry } from './add.js';
import { activityLabel } from '../data/met.js';

function dateTitle(d) {
  const today = ymd();
  if (d === today) return 'Today';
  if (d === addDays(today, -1)) return 'Yesterday';
  if (d === addDays(today, 1)) return 'Tomorrow';
  return fmtDate(d, { weekday: 'long', day: 'numeric', month: 'short' });
}

/* แสดงเฉพาะค่าที่มีจริง (Quick Add แบบใส่แค่ kcal จะไม่มีกรัม/สารอาหาร) */
function macroText(e) {
  const parts = [];
  if (e.grams > 0) parts.push(`${fmt(e.grams)} g`);
  if (e.carbs > 0 || e.protein > 0 || e.fat > 0) parts.push(`C ${fmtG(e.carbs)} · P ${fmtG(e.protein)} · F ${fmtG(e.fat)}`);
  return parts.join(' · ') || 'Calories only';
}

function rowActions(kind, id, name) {
  return html`
    <div class="row-actions">
      <button type="button" class="icon-btn small" data-edit="${kind}:${id}" aria-label="Edit ${name}">${icon('pencil', 18)}</button>
      <button type="button" class="icon-btn small" data-del="${kind}:${id}" aria-label="Delete ${name}">${icon('trash', 18)}</button>
    </div>`;
}

export async function renderDiary(root) {
  const date = state.diaryDate;
  const today = ymd();
  const [meals, activities] = await Promise.all([db.byDate('meals', date), db.byDate('activities', date)]);
  const t = targets();
  const food = sumEntries(meals).kcal;
  const burned = activities.reduce((s, a) => s + (a.kcal || 0), 0);
  const remaining = t.kcal - food;
  const byId = new Map([...meals.map(m => ['meal:' + m.id, m]), ...activities.map(a => ['act:' + a.id, a])]);

  root.innerHTML = html`
    <header class="date-bar">
      <button type="button" class="icon-btn" data-day="-1" aria-label="Previous day">${icon('left')}</button>
      <label class="date-pick">
        <span class="date-title">${dateTitle(date)}</span>
        <span class="date-sub">${icon('calendar', 14)} ${fmtDate(date, { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        <input type="date" value="${date}" aria-label="Pick a date" data-pick>
      </label>
      <button type="button" class="icon-btn" data-day="1" aria-label="Next day">${icon('right')}</button>
    </header>
    <div class="today-row">
      <button type="button" class="btn btn-quiet btn-small" data-today ${date === today ? 'disabled' : ''}>Today</button>
    </div>

    <section class="equation" aria-label="Calories for this day">
      <div><strong>${fmt(t.kcal)}</strong><span>Goal</span></div>
      <span class="op">−</span>
      <div><strong>${fmt(food)}</strong><span>Food</span></div>
      <span class="op">=</span>
      <div class="${remaining < 0 ? 'is-over' : ''}"><strong>${fmt(Math.abs(remaining))}</strong><span>${remaining < 0 ? 'Over' : 'Remaining'}</span></div>
    </section>

    ${MEALS.map(m => {
      const items = meals.filter(e => e.meal === m.id);
      const kcal = sumEntries(items).kcal;
      return html`
        <section class="diary-group" aria-labelledby="g-${m.id}">
          <header class="group-head">
            <h2 id="g-${m.id}">${m.label}</h2>
            <span class="group-kcal">${items.length ? `${fmt(kcal)} kcal` : ''}</span>
          </header>
          ${items.length ? html`
            <ul class="entry-list">
              ${items.map(e => html`
                <li class="entry">
                  <button type="button" class="entry-main" data-edit="meal:${e.id}">
                    <span class="entry-name">${e.name}</span>
                    <span class="entry-sub">${macroText(e)}</span>
                  </button>
                  <span class="entry-kcal">${fmt(e.kcal)}</span>
                  ${rowActions('meal', e.id, e.name)}
                </li>`)}
            </ul>` : ''}
          <button type="button" class="add-line" data-add-meal="${m.id}">${icon('plus', 16)} Add food</button>
        </section>`;
    })}

    <section class="diary-group" aria-labelledby="g-act">
      <header class="group-head">
        <h2 id="g-act">Activities</h2>
        <span class="group-kcal is-blue">${activities.length ? `${fmt(burned)} kcal burned` : ''}</span>
      </header>
      ${activities.length ? html`
        <ul class="entry-list">
          ${activities.map(a => html`
            <li class="entry">
              <button type="button" class="entry-main" data-edit="act:${a.id}">
                <span class="entry-name">${activityLabel(a)}</span>
                <span class="entry-sub">${fmt(a.minutes)} min${a.distanceKm ? ` · ${fmt(a.distanceKm, 1)} km` : ''} · MET ${a.met}</span>
              </button>
              <span class="entry-kcal">${fmt(a.kcal)}</span>
              ${rowActions('act', a.id, activityLabel(a))}
            </li>`)}
        </ul>` : ''}
      <button type="button" class="add-line" data-add-act>${icon('plus', 16)} Add activity</button>
    </section>

    ${meals.length === 0 ? html`<p class="empty-inline">No meals logged yet. Tap + to add your first meal.</p>` : ''}
  `.s;

  const go = d => { state.diaryDate = d; renderDiary(root); };
  root.querySelectorAll('[data-day]').forEach(b => b.onclick = () => go(addDays(date, Number(b.dataset.day))));
  root.querySelector('[data-today]').onclick = () => go(today);
  root.querySelector('[data-pick]').onchange = e => { if (e.target.value) go(e.target.value); };
  root.querySelectorAll('[data-add-meal]').forEach(b => b.onclick = () => openAdd({ date, meal: b.dataset.addMeal }));
  root.querySelector('[data-add-act]').onclick = () => openActivity({ date });
  root.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => {
    const e = byId.get(b.dataset.edit);
    if (b.dataset.edit.startsWith('meal:')) editMeal(e); else editActivity(e);
  });
  root.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    const e = byId.get(b.dataset.del);
    deleteEntry(b.dataset.del.startsWith('meal:') ? 'meals' : 'activities', e);
  });
}
