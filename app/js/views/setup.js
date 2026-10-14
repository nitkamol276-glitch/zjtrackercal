/* ตั้งค่าครั้งแรก: ข้อมูลตัวเอง → activity level → เป้าหมาย → ดูเป้าที่คำนวณได้ → Dashboard */

import { html, fmt, icon, showFormError } from '../ui.js';
import { calorieGoal, macroTargets, ymd } from '../calc.js';
import * as db from '../db.js';
import { state, saveProfile } from '../state.js';
import { personalFields, activityFields, goalFields, wireGoalFields, readPersonal, readActivity, readGoal } from './profile-forms.js';

const STEPS = [
  { title: 'About you', lead: 'ใช้คำนวณว่าร่างกายต้องการพลังงานวันละเท่าไหร่' },
  { title: 'How active are you?', lead: 'เลือกแบบที่ใกล้กับสัปดาห์ปกติของคุณที่สุด (การออกกำลังกายที่บันทึกในแอปจะนับแยก)' },
  { title: 'What’s your goal?', lead: 'เปลี่ยนได้ตลอดที่หน้า Profile' },
];

/* แสดงที่มาของเป้าแคลอรี่: BMR → TDEE → ปรับตามเป้า → Daily Goal */
export function goalBreakdown(calc, goal) {
  if (!calc) return '';
  const adjLabel = calc.adjust < 0 ? 'Deficit to lose weight' : calc.adjust > 0 ? 'Surplus to gain weight' : 'No adjustment (maintain)';
  return html`
    <ol class="breakdown">
      <li><span>BMR <small>Mifflin-St Jeor</small></span><span>${fmt(calc.bmr)}</span></li>
      <li><span>TDEE <small>BMR × ${calc.factor}</small></span><span>${fmt(calc.tdee)}</span></li>
      <li><span>${adjLabel}</span><span>${calc.adjust > 0 ? '+' : calc.adjust < 0 ? '−' : ''}${fmt(Math.abs(calc.adjust))}</span></li>
      <li class="total"><span>Daily calorie goal</span><span>${fmt(calc.goal)} kcal</span></li>
    </ol>
    ${calc.clamped ? html`<p class="note">ปรับขึ้นเป็น ${fmt(calc.floor)} kcal — ไม่แนะนำให้กินน้อยกว่านี้ถ้าไม่ได้อยู่ในการดูแลของแพทย์</p>` : ''}`;
}

export function renderSetup(root, onDone) {
  const draft = { sex: 'female', activityLevel: 'light', goal: 'lose', rateKgPerWeek: 0.5 };
  let step = 0;

  const render = () => {
    if (step === STEPS.length) return renderResult();
    const s = STEPS[step];
    const fields = step === 0 ? personalFields(draft) : step === 1 ? activityFields(draft) : goalFields(draft);
    root.innerHTML = html`
      <main class="setup">
        <header class="setup-head">
          ${step > 0 ? html`<button type="button" class="icon-btn" data-back aria-label="Back">${icon('back')}</button>` : html`<span class="brand">ZJTrackerCal</span>`}
          <p class="sheet-step">Step ${step + 1} of ${STEPS.length}</p>
        </header>
        <div class="progress" aria-hidden="true">${STEPS.map((_, i) => html`<span class="${i <= step ? 'on' : ''}"></span>`)}</div>
        <form class="setup-form" novalidate>
          <h1>${s.title}</h1>
          <p class="lead">${s.lead}</p>
          ${fields}
          <div class="setup-actions">
            <button type="submit" class="btn btn-primary btn-block">${step === STEPS.length - 1 ? 'Calculate my goals' : 'Continue'}</button>
          </div>
        </form>
      </main>`.s;
    const form = root.querySelector('form');
    if (step === 2) wireGoalFields(form);
    const back = root.querySelector('[data-back]');
    if (back) back.onclick = () => { step--; render(); };
    form.onsubmit = e => {
      e.preventDefault();
      const r = step === 0 ? readPersonal(form) : step === 1 ? readActivity(form) : readGoal(form);
      if (r.error) {
        showFormError(form, r.error);
        if (r.name && form.elements[r.name]) form.elements[r.name].focus();
        return;
      }
      Object.assign(draft, r.value);
      step++;
      render();
      window.scrollTo(0, 0);
    };
  };

  const renderResult = () => {
    const calc = calorieGoal(draft);
    const m = macroTargets(calc.goal);
    root.innerHTML = html`
      <main class="setup">
        <header class="setup-head">
          <button type="button" class="icon-btn" data-back aria-label="Back">${icon('back')}</button>
          <p class="sheet-step">Your plan</p>
        </header>
        <div class="setup-form">
          <h1>Your daily goal${draft.name ? html`, ${draft.name}` : ''}</h1>
          <p class="hero-figure">${fmt(calc.goal)}<span>kcal / day</span></p>
          ${goalBreakdown(calc, draft.goal)}
          <h2 class="subhead">Daily nutrition</h2>
          <ul class="macro-summary">
            <li><span>Carbs</span><strong>${m.carbs} g</strong></li>
            <li><span>Protein</span><strong>${m.protein} g</strong></li>
            <li><span>Fat</span><strong>${m.fat} g</strong></li>
          </ul>
          <p class="note">แบ่งเป็น Carbs 50% · Protein 20% · Fat 30% — ปรับเป้าแคลอรี่และสารอาหารเองได้ที่หน้า Profile</p>
          <div class="setup-actions">
            <button type="button" class="btn btn-primary btn-block" data-start>Start tracking</button>
          </div>
        </div>
      </main>`.s;
    root.querySelector('[data-back]').onclick = () => { step--; render(); };
    root.querySelector('[data-start]').onclick = async e => {
      e.currentTarget.disabled = true;
      await db.put('weights', { date: ymd(), kg: draft.weightKg });
      await db.setKV('goals', {});
      state.goals = {};
      await saveProfile({ ...draft, createdAt: Date.now() });
      db.requestPersist();
      onDone();
    };
  };

  render();
}
