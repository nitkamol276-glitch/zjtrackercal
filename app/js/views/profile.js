/* โปรไฟล์ — ข้อมูลส่วนตัว, ปรับเป้าหมาย, เป้าสารอาหาร, การเชื่อมต่อ AI, ส่งออก/นำเข้า/ล้างข้อมูล */

import { html, raw, icon, fmt, openSheet, toast, numField, showFormError, confirmDialog, fmtDate } from '../ui.js';
import { ACTIVITY_LEVELS, GOALS, bmi, bmiCategory, calorieGoal, macroTargets, kcalFromMacros, num, ymd } from '../calc.js';
import * as db from '../db.js';
import * as ai from '../ai.js';
import { CONFIG } from '../../config.js';
import { state, targets, saveProfile, saveGoals, logWeight, changed } from '../state.js';
import { personalFields, activityFields, goalFields, wireGoalFields, readPersonal, readActivity, readGoal } from './profile-forms.js';
import { goalBreakdown } from './setup.js';

export async function renderProfile(root) {
  const p = state.profile;
  const t = targets();
  const level = ACTIVITY_LEVELS.find(l => l.id === p.activityLevel);
  const goal = GOALS.find(g => g.id === p.goal);
  const b = bmi(p.weightKg, p.heightCm);
  const aiReady = await ai.isConfigured();
  const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted().catch(() => false) : false;

  root.innerHTML = html`
    <header class="page-head">
      <h1>Profile</h1>
    </header>

    <section class="panel" aria-labelledby="pd-h">
      <header class="panel-head">
        <h2 id="pd-h" class="panel-title">Personal details</h2>
        <button type="button" class="link-btn" data-edit-personal>Edit</button>
      </header>
      <dl class="kv">
        <div><dt>Name</dt><dd>${p.name || '–'}</dd></div>
        <div><dt>Age</dt><dd>${p.age} years</dd></div>
        <div><dt>Sex</dt><dd>${p.sex === 'male' ? 'Male' : 'Female'}</dd></div>
        <div><dt>Height</dt><dd>${fmt(p.heightCm)} cm</dd></div>
        <div><dt>Weight</dt><dd>${fmt(p.weightKg, 1)} kg</dd></div>
        <div><dt>Activity level</dt><dd>${level ? level.label : '–'}</dd></div>
        <div><dt>BMI</dt><dd>${b ? `${b.toFixed(1)} · ${bmiCategory(b)}` : '–'}</dd></div>
      </dl>
    </section>

    <section class="panel" aria-labelledby="goal-h">
      <header class="panel-head">
        <h2 id="goal-h" class="panel-title">Goal</h2>
        <button type="button" class="link-btn" data-adjust>Adjust goal</button>
      </header>
      <p class="goal-line">${goal ? goal.label : ''}${p.goal !== 'maintain' ? ` · ${p.rateKgPerWeek} kg per week` : ''}${p.targetWeightKg ? ` · target ${fmt(p.targetWeightKg, 1)} kg` : ''}</p>
      <div class="big-goal">
        <span>Daily calories</span>
        <strong>${fmt(t.kcal)} kcal</strong>
        <span class="tag">${t.kcalIsCustom ? 'Custom' : 'Auto'}</span>
      </div>
      ${t.kcalIsCustom
        ? html`<p class="note">คุณตั้งเป้านี้เอง · ค่าที่คำนวณได้คือ ${fmt(t.calc && t.calc.goal)} kcal</p>`
        : goalBreakdown(t.calc, p.goal)}
    </section>

    <section class="panel" aria-labelledby="nut-goal-h">
      <header class="panel-head">
        <h2 id="nut-goal-h" class="panel-title">Nutrition goals</h2>
        <button type="button" class="link-btn" data-edit-macros>Edit</button>
      </header>
      <ul class="macro-summary">
        <li><span>Carbs</span><strong>${fmt(t.macros.carbs)} g</strong></li>
        <li><span>Protein</span><strong>${fmt(t.macros.protein)} g</strong></li>
        <li><span>Fat</span><strong>${fmt(t.macros.fat)} g</strong></li>
      </ul>
      <p class="fine">${t.macrosAreCustom
        ? `ตั้งเอง · รวมเป็น ${fmt(kcalFromMacros(t.macros))} kcal`
        : 'อัตโนมัติ · Carbs 50% Protein 20% Fat 30% ของเป้าแคลอรี่'}</p>
    </section>

    <section class="panel" aria-labelledby="ai-h">
      <header class="panel-head">
        <h2 id="ai-h" class="panel-title">AI connection</h2>
        <button type="button" class="link-btn" data-ai>${aiReady ? 'Manage' : 'Set up'}</button>
      </header>
      <p class="status-line"><span class="dot ${aiReady ? 'on' : ''}"></span>${aiReady ? 'พร้อมใช้ — Scan Meal และค้นด้วย Gemini ได้แล้ว' : 'ยังไม่ได้ตั้งค่า — Scan Meal และค้นด้วย Gemini ต้องใส่ access token ก่อน'}</p>
    </section>

    <section class="panel" aria-labelledby="data-h">
      <h2 id="data-h" class="panel-title">Data</h2>
      <p class="fine">ข้อมูลทั้งหมดเก็บอยู่ในเบราว์เซอร์ของเครื่องนี้เท่านั้น${persisted ? ' (ป้องกันการล้างอัตโนมัติแล้ว)' : ''} · ส่งออกข้อมูลสำรองไว้เป็นระยะ</p>
      <div class="data-actions">
        <button type="button" class="btn btn-quiet" data-export>${icon('download', 18)} Export backup</button>
        <label class="btn btn-quiet file-btn">${icon('upload', 18)} Import backup<input type="file" accept="application/json,.json" data-import></label>
      </div>
      <button type="button" class="btn btn-danger-quiet btn-block" data-reset>${icon('trash', 18)} Reset all data</button>
    </section>
    <p class="footer-note">ZJTrackerCal · ค่าจาก Gemini เป็นการประมาณ ไม่ใช่คำแนะนำทางการแพทย์</p>
  `.s;

  root.querySelector('[data-edit-personal]').onclick = editPersonal;
  root.querySelector('[data-adjust]').onclick = adjustGoal;
  root.querySelector('[data-edit-macros]').onclick = editMacros;
  root.querySelector('[data-ai]').onclick = openAiSettings;
  root.querySelector('[data-export]').onclick = exportBackup;
  root.querySelector('[data-import]').onchange = e => importBackup(e.target);
  root.querySelector('[data-reset]').onclick = resetData;
}

/* ---------- Personal details ---------- */

function editPersonal() {
  const p = state.profile;
  openSheet({
    title: 'Personal details',
    body: html`
      <form class="stack-form" novalidate data-form>
        ${personalFields(p)}
        <h3 class="subhead">Activity level</h3>
        ${activityFields(p)}
      </form>`,
    footer: html`<button type="button" class="btn btn-primary btn-block" data-save>Save</button>`,
    onMount(el, sheet) {
      const form = el.querySelector('[data-form]');
      el.querySelector('[data-save]').onclick = async () => {
        const a = readPersonal(form);
        if (a.error) return showFormError(form, a.error);
        const before = targets().kcal;
        const { weightKg, ...rest } = a.value;
        await saveProfile({ ...rest, ...readActivity(form).value });
        /* น้ำหนักที่แก้ตรงนี้ = บันทึกน้ำหนักของวันนี้ */
        if (weightKg !== state.profile.weightKg) await logWeight(ymd(), weightKg);
        sheet.close();
        const after = targets().kcal;
        toast(after !== before ? `Saved · daily goal is now ${fmt(after)} kcal` : 'Saved');
      };
    },
  });
}

/* ---------- Adjust goal (เป้าน้ำหนัก + เป้าแคลอรี่) ---------- */

function adjustGoal() {
  const p = state.profile;
  const t = targets();
  openSheet({
    title: 'Adjust goal',
    body: html`
      <form class="stack-form" novalidate data-form>
        ${goalFields(p)}
        <h3 class="subhead">Daily calories</h3>
        <label class="switch-row">
          <input type="checkbox" name="custom" ${t.kcalIsCustom ? raw('checked') : ''}>
          <span>Set my own calorie goal</span>
        </label>
        <div data-custom ${t.kcalIsCustom ? '' : raw('hidden')}>
          ${numField({ name: 'kcal', label: 'Daily calorie goal', unit: 'kcal', value: t.kcalIsCustom ? t.kcal : (t.calc && t.calc.goal) })}
        </div>
        <p class="hint" data-calc></p>
      </form>`,
    footer: html`<button type="button" class="btn btn-primary btn-block" data-save>Save goal</button>`,
    onMount(el, sheet) {
      const form = el.querySelector('[data-form]');
      wireGoalFields(form);
      const custom = form.elements.custom;
      const box = el.querySelector('[data-custom]');
      const calcHint = el.querySelector('[data-calc]');
      const preview = () => {
        const g = readGoal(form);
        if (g.error) return;
        const c = calorieGoal({ ...state.profile, ...g.value });
        calcHint.textContent = c ? `คำนวณจากข้อมูลของคุณ: ${fmt(c.goal)} kcal/วัน (TDEE ${fmt(c.tdee)} ${c.adjust < 0 ? '−' : '+'} ${fmt(Math.abs(c.adjust))})` : '';
      };
      custom.onchange = () => { box.hidden = !custom.checked; };
      form.addEventListener('change', preview);
      preview();
      el.querySelector('[data-save]').onclick = async () => {
        const g = readGoal(form);
        if (g.error) return showFormError(form, g.error);
        let kcalOverride = null;
        if (custom.checked) {
          const k = num(form.elements.kcal.value);
          if (!(k >= 800 && k <= 6000)) return showFormError(form, 'เป้าแคลอรี่ต้องอยู่ระหว่าง 800–6,000 kcal');
          kcalOverride = Math.round(k);
        }
        await saveProfile(g.value);
        await saveGoals({ kcalOverride });
        sheet.close();
        toast(`Goal saved · ${fmt(targets().kcal)} kcal per day`);
      };
    },
  });
}

/* ---------- Nutrition goals ---------- */

function editMacros() {
  const t = targets();
  const auto = macroTargets(t.kcal);
  openSheet({
    title: 'Nutrition goals',
    body: html`
      <form class="stack-form" novalidate data-form>
        <label class="switch-row">
          <input type="checkbox" name="custom" ${t.macrosAreCustom ? raw('checked') : ''}>
          <span>Set my own targets</span>
        </label>
        <p class="hint">ค่าอัตโนมัติสำหรับ ${fmt(t.kcal)} kcal: Carbs ${auto.carbs} g · Protein ${auto.protein} g · Fat ${auto.fat} g</p>
        <fieldset class="field-row three" data-fields ${t.macrosAreCustom ? '' : raw('disabled')}>
          ${numField({ name: 'carbs', label: 'Carbs', unit: 'g', value: t.macros.carbs })}
          ${numField({ name: 'protein', label: 'Protein', unit: 'g', value: t.macros.protein })}
          ${numField({ name: 'fat', label: 'Fat', unit: 'g', value: t.macros.fat })}
        </fieldset>
        <p class="hint" data-sum></p>
      </form>`,
    footer: html`<button type="button" class="btn btn-primary btn-block" data-save>Save targets</button>`,
    onMount(el, sheet) {
      const form = el.querySelector('[data-form]');
      const fields = el.querySelector('[data-fields]');
      const sum = el.querySelector('[data-sum]');
      const read = () => ({ carbs: num(form.elements.carbs.value), protein: num(form.elements.protein.value), fat: num(form.elements.fat.value) });
      const update = () => {
        const m = read();
        const k = kcalFromMacros({ carbs: m.carbs || 0, protein: m.protein || 0, fat: m.fat || 0 });
        sum.textContent = form.elements.custom.checked ? `รวมเป็น ${fmt(k)} kcal (เป้าแคลอรี่ของคุณคือ ${fmt(t.kcal)})` : '';
      };
      form.elements.custom.onchange = () => {
        fields.disabled = !form.elements.custom.checked;
        if (!form.elements.custom.checked) {
          form.elements.carbs.value = auto.carbs; form.elements.protein.value = auto.protein; form.elements.fat.value = auto.fat;
        }
        update();
      };
      form.addEventListener('input', update);
      update();
      el.querySelector('[data-save]').onclick = async () => {
        if (!form.elements.custom.checked) {
          await saveGoals({ macrosOverride: false, macros: null });
        } else {
          const m = read();
          const TH = { carbs: 'Carbs', protein: 'Protein', fat: 'Fat' };
          for (const [k, v] of Object.entries(m)) {
            if (!(v >= 0 && v <= 1000)) return showFormError(form, `กรอก ${TH[k]} เป็นกรัม (0–1,000)`);
          }
          await saveGoals({ macrosOverride: true, macros: { carbs: Math.round(m.carbs), protein: Math.round(m.protein), fat: Math.round(m.fat) } });
        }
        sheet.close();
        toast('Nutrition goals saved');
      };
    },
  });
}

/* ---------- AI connection ---------- */

export async function openAiSettings() {
  const cur = await db.getKV('ai', {}) || {};
  const dev = !!CONFIG.dev;
  openSheet({
    title: 'AI connection',
    body: html`
      <p class="lead">Scan Meal และค้นด้วย Gemini จะส่งผ่าน AI server ส่วนตัวของคุณ Gemini API key อยู่บน server นั้น แอปนี้เก็บแค่ access token ไว้ในเครื่องนี้</p>
      <form class="stack-form" novalidate data-form>
        <label class="field">
          <span class="field-label">Access token</span>
          <input name="token" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" value="${cur.token || ''}" placeholder="${dev ? 'Not needed on this Mac' : 'Paste your token'}">
          <span class="field-hint">token ได้มาตอนตั้งค่า server (ดู README) — วางครั้งเดียวต่อเครื่อง</span>
        </label>
        <details class="more" ${cur.proxyUrl ? raw('open') : ''}>
          <summary>Server address</summary>
          <label class="field">
            <span class="field-label">Proxy URL</span>
            <input name="proxyUrl" type="url" autocomplete="off" autocapitalize="off" spellcheck="false" value="${cur.proxyUrl || ''}" placeholder="${CONFIG.proxyUrl || (dev ? 'This Mac (serve.py)' : 'https://…workers.dev')}">
            <span class="field-hint">เว้นว่างไว้เพื่อใช้${CONFIG.proxyUrl ? 'ที่อยู่ที่ตั้งไว้ในแอป' : dev ? ' Mac เครื่องนี้' : 'ที่อยู่ที่ตั้งไว้ในแอป'}</span>
          </label>
        </details>
        <div class="calc-box" data-result hidden></div>
      </form>`,
    footer: html`
      <div class="foot-row">
        <button type="button" class="btn btn-quiet" data-test>Test connection</button>
        <button type="button" class="btn btn-primary" data-save>Save</button>
      </div>`,
    onMount(el, sheet) {
      const form = el.querySelector('[data-form]');
      const out = el.querySelector('[data-result]');
      const values = () => ({ token: form.elements.token.value.trim(), proxyUrl: form.elements.proxyUrl.value.trim().replace(/\/+$/, '') });
      const validUrl = u => !u || /^https:\/\/[^\s/]+/.test(u);
      const persist = async () => {
        const v = values();
        if (!validUrl(v.proxyUrl)) { showFormError(form, 'Proxy URL ต้องขึ้นต้นด้วย https://'); return false; }
        showFormError(form, '');
        await db.setKV('ai', v);
        return true;
      };
      el.querySelector('[data-test]').onclick = async e => {
        const btn = e.currentTarget;
        const prev = await db.getKV('ai', {});
        if (!(await persist())) return;
        btn.disabled = true;
        out.hidden = false;
        out.innerHTML = html`<span>Testing…</span>`.s;
        try {
          const r = await ai.testConnection();
          out.innerHTML = html`<strong>${icon('check', 18)} Connected</strong><span>Model: ${r.model || 'Gemini'}</span>`.s;
        } catch (err) {
          out.innerHTML = html`<strong>${err.title || 'Not connected'}</strong><span>${err.message}</span>`.s;
          await db.setKV('ai', prev || {});
        }
        btn.disabled = false;
      };
      el.querySelector('[data-save]').onclick = async () => {
        if (!(await persist())) return;
        sheet.close();
        changed();
        toast('AI connection saved');
      };
    },
  });
}

/* ---------- Data ---------- */

async function exportBackup() {
  const data = await db.exportAll();
  const name = `zjtrackercal-backup-${ymd()}.json`;
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  /* iPhone: ใช้ share sheet → "Save to Files" */
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'ZJTrackerCal backup' }); toast('Backup exported'); return; }
    catch (e) {
      if (e.name === 'AbortError') return;
      /* Safari ต้องการการแตะสดๆ — การอ่าน IndexedDB ก่อนหน้าอาจทำให้สิทธิ์หมด → ให้แตะอีกครั้ง */
      if (e.name === 'NotAllowedError') return offerShare(file);
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('Backup file created');
}

function offerShare(file) {
  openSheet({
    title: 'Backup ready',
    body: html`<p class="lead">แตะปุ่มด้านล่าง แล้วเลือก <strong>บันทึกไปยังแอปไฟล์</strong> (Save to Files)</p><form data-form></form>`,
    footer: html`<button type="button" class="btn btn-primary btn-block" data-share>${icon('download', 18)} Save backup file</button>`,
    onMount(el, sheet) {
      el.querySelector('[data-share]').onclick = async () => {
        try {
          await navigator.share({ files: [file], title: 'ZJTrackerCal backup' });
          sheet.close();
          toast('Backup exported');
        } catch (e) {
          if (e.name !== 'AbortError') showFormError(el.querySelector('[data-form]'), `เปิดหน้าแชร์ไม่ได้ (${e.name})`);
        }
      };
    },
  });
}

async function importBackup(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  let obj;
  try { obj = JSON.parse(await file.text()); }
  catch { return toast('ไฟล์นี้ไม่ใช่ข้อมูลสำรองที่ถูกต้อง (ไม่ใช่ JSON)'); }
  const err = db.validateBackup(obj);
  if (err) return toast(err);
  const n = k => (obj.data[k] || []).length;
  const counts = `อาหาร ${n('meals')} รายการ · กิจกรรม ${n('activities')} รายการ · น้ำหนัก ${n('weights')} ครั้ง`;
  const when = new Date(obj.exportedAt);
  const ok = await confirmDialog({
    title: 'Replace all data?',
    message: `ไฟล์สำรอง${Number.isNaN(when.getTime()) ? '' : `วันที่ ${fmtDate(ymd(when))}`} มี${counts} — ข้อมูลที่อยู่ในเครื่องตอนนี้จะถูกแทนที่ทั้งหมด`,
    confirm: 'Replace', danger: true,
  });
  if (!ok) return;
  try {
    await db.importAll(obj);
  } catch (err) {
    console.error(err);
    return toast(`นำเข้าไม่สำเร็จ ข้อมูลเดิมไม่เปลี่ยน (${err && err.name ? err.name : 'error'})`, { ms: 6000 });
  }
  location.reload();
}

async function resetData() {
  const ok = await confirmDialog({
    title: 'Reset all data?',
    message: 'โปรไฟล์ อาหาร กิจกรรม และประวัติน้ำหนักทั้งหมดในเครื่องนี้จะถูกลบถาวร ถ้าอาจอยากได้คืน ให้กด Export backup ก่อน',
    confirm: 'Delete everything', danger: true,
  });
  if (!ok) return;
  await db.resetAll();
  location.hash = '#/dashboard';
  location.reload();
}
