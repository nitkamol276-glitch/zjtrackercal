/* ฟอร์มข้อมูลส่วนตัว / activity level / เป้าหมาย — ใช้ทั้งตอน Setup ครั้งแรกและหน้า Profile */

import { html, raw, numField, segmented, fmt } from '../ui.js';
import { ACTIVITY_LEVELS, GOALS, RATES, num, goalAdjustment } from '../calc.js';

const SEX = [{ id: 'female', label: 'Female' }, { id: 'male', label: 'Male' }];

export function personalFields(p) {
  return html`
    <label class="field">
      <span class="field-label">Name</span>
      <input name="name" type="text" autocomplete="given-name" maxlength="40" value="${p.name || ''}" placeholder="Your name">
    </label>
    <div class="field">
      <span class="field-label">Sex <span class="field-aside">ใช้ในสูตร BMR</span></span>
      ${segmented('sex', SEX, p.sex || 'female')}
    </div>
    <div class="field-row">
      ${numField({ name: 'age', label: 'Age', value: p.age, unit: 'years', required: true })}
      ${numField({ name: 'heightCm', label: 'Height', value: p.heightCm, unit: 'cm', required: true })}
    </div>
    ${numField({ name: 'weightKg', label: 'Current weight', value: p.weightKg, unit: 'kg', required: true })}`;
}

export function activityFields(p) {
  return html`
    <div class="choice-list" role="radiogroup" aria-label="Activity level">
      ${ACTIVITY_LEVELS.map(l => html`
        <label class="choice">
          <input type="radio" name="activityLevel" value="${l.id}" ${l.id === (p.activityLevel || 'light') ? raw('checked') : ''}>
          <span class="choice-body">
            <span class="choice-title">${l.label}</span>
            <span class="choice-hint">${l.hint}</span>
          </span>
          <span class="choice-aside">×${l.factor}</span>
        </label>`)}
    </div>`;
}

function rateOptions(goal, current) {
  const list = RATES[goal] || [];
  return html`
    <div class="field" data-rate ${goal === 'maintain' ? raw('hidden') : ''}>
      <span class="field-label">Pace <span class="field-aside">ต่อสัปดาห์</span></span>
      <div class="segmented">
        ${list.map(r => html`
          <label class="seg">
            <input type="radio" name="rateKgPerWeek" value="${r}" ${Number(current) === r ? raw('checked') : ''}>
            <span>${r} kg</span>
          </label>`)}
      </div>
      <span class="field-hint" data-rate-hint></span>
    </div>`;
}

export function goalFields(p) {
  const goal = p.goal || 'lose';
  return html`
    <div class="field">
      <span class="field-label">Goal</span>
      ${segmented('goal', GOALS.map(g => ({ id: g.id, label: g.short })), goal)}
    </div>
    <div data-rate-slot>${rateOptions(goal, p.rateKgPerWeek ?? 0.5)}</div>
    ${numField({ name: 'targetWeightKg', label: 'Target weight', value: p.targetWeightKg, unit: 'kg', hint: 'ไม่บังคับ — แสดงคู่กับกราฟน้ำหนัก' })}`;
}

/* สลับตัวเลือก pace ตามเป้า + บอกว่า pace นี้คือกี่ kcal ต่อวัน */
export function wireGoalFields(form) {
  const update = () => {
    const goal = form.elements.goal.value;
    const slot = form.querySelector('[data-rate-slot]');
    const cur = form.elements.rateKgPerWeek ? form.querySelector('[name=rateKgPerWeek]:checked')?.value : 0.5;
    const list = RATES[goal] || [];
    const keep = list.includes(Number(cur)) ? Number(cur) : (list.includes(0.5) ? 0.5 : list[0]);
    slot.innerHTML = rateOptions(goal, keep).s;
    hint();
    slot.querySelectorAll('[name=rateKgPerWeek]').forEach(r => r.onchange = hint);
  };
  const hint = () => {
    const el = form.querySelector('[data-rate-hint]');
    if (!el) return;
    const goal = form.elements.goal.value;
    const r = Number(form.querySelector('[name=rateKgPerWeek]:checked')?.value || 0);
    const adj = goalAdjustment(goal, r);
    el.textContent = adj ? `≈ ${adj < 0 ? 'น้อยกว่า' : 'มากกว่า'} TDEE วันละ ${fmt(Math.abs(adj))} kcal` : '';
  };
  form.querySelectorAll('[name=goal]').forEach(r => r.onchange = update);
  form.querySelectorAll('[name=rateKgPerWeek]').forEach(r => r.onchange = hint);
  hint();
}

/* ---------- อ่าน + ตรวจค่า ---------- */

function inRange(form, name, label, min, max, { optional = false, unit = '' } = {}) {
  const raw = form.elements[name] ? form.elements[name].value : '';
  if (optional && String(raw).trim() === '') return { value: null };
  const v = num(raw);
  if (!Number.isFinite(v)) return { error: `กรอก${label}`, name };
  if (v < min || v > max) return { error: `${label}ต้องอยู่ระหว่าง ${min}–${max}${unit ? ' ' + unit : ''}`, name };
  return { value: v };
}

export function readPersonal(form) {
  const out = { name: form.elements.name.value.trim(), sex: form.querySelector('[name=sex]:checked').value };
  const checks = [
    ['age', 'อายุ', 13, 100, 'ปี'],
    ['heightCm', 'ส่วนสูง', 100, 250, 'cm'],
    ['weightKg', 'น้ำหนัก', 25, 350, 'kg'],
  ];
  for (const [name, label, min, max, unit] of checks) {
    const r = inRange(form, name, label, min, max, { unit });
    if (r.error) return r;
    out[name] = name === 'age' ? Math.round(r.value) : Math.round(r.value * 10) / 10;
  }
  return { value: out };
}

export function readActivity(form) {
  return { value: { activityLevel: form.querySelector('[name=activityLevel]:checked').value } };
}

export function readGoal(form) {
  const goal = form.querySelector('[name=goal]:checked').value;
  const rate = goal === 'maintain' ? 0 : Number(form.querySelector('[name=rateKgPerWeek]:checked')?.value || 0.5);
  const t = inRange(form, 'targetWeightKg', 'น้ำหนักเป้าหมาย', 25, 350, { optional: true, unit: 'kg' });
  if (t.error) return t;
  return { value: { goal, rateKgPerWeek: rate, targetWeightKg: t.value == null ? null : Math.round(t.value * 10) / 10 } };
}
