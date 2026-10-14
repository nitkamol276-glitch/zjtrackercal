/* ปุ่ม + : drawer เมนู → Scan Meal / Search Food / Quick Add / Activity / Weight
   ทุก flow บอกขั้นที่อยู่ ("Step 2 of 3 · Review") และจบด้วยการบันทึก → ปิด → กลับหน้าที่เปิดค้างไว้ + toast
   มีฟอร์มแก้ไขรายการอาหาร/กิจกรรมที่ Diary เรียกใช้ด้วย */

import {
  html, raw, icon, fmt, fmtG, fmtDate, openSheet, openDrawer, closeAllSheets, toast, numField,
  mealPicker, dateField, showFormError, mealLabel, confirmDialog, busy,
} from '../ui.js';
import { scaleFood, sumEntries, num, mealForTime, ymd, kcalFromMacros, activityKcal, round1 } from '../calc.js';
import * as db from '../db.js';
import { state, changed, logWeight } from '../state.js';
import { FOODS } from '../data/foods.js';
import { ACTIVITIES, findActivity, activityLabel } from '../data/met.js';
import * as ai from '../ai.js';
import { openAiSettings } from './profile.js';

const NUTS = ['kcal', 'carbs', 'protein', 'fat'];
const UNIT_LABEL = { plate: 'plate', bowl: 'bowl', piece: 'piece', cup: 'cup', glass: 'glass', serving: 'serving' };
const CONFIDENCE = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' };

/* บริบทการเพิ่ม: วันที่ + มื้อ (มาจาก Diary หรือเดาจากเวลาตอนนี้) */
function context(ctx = {}) {
  return { date: ctx.date || ymd(), meal: ctx.meal || mealForTime() };
}

function whenLabel(date) {
  return date === ymd() ? 'วันนี้' : `วันที่ ${fmtDate(date)}`;
}

/* ---------- เมนู + ---------- */

export function openAdd(ctx = {}) {
  const c = context(ctx);
  const opts = [
    { id: 'scan', icon: 'camera', title: 'Scan Meal', sub: 'ถ่ายรูป ให้ Gemini ประมาณแคลอรี่และสารอาหาร' },
    { id: 'search', icon: 'search', title: 'Search Food', sub: 'หาเมนูจากรายการอาหารในเครื่อง' },
    { id: 'quick', icon: 'pencil', title: 'Quick Add', sub: 'กรอกชื่อ น้ำหนัก และสารอาหารเอง' },
    { id: 'activity', icon: 'run', title: 'Activity', sub: 'บันทึกการออกกำลังกาย คำนวณจากตาราง MET' },
    { id: 'weight', icon: 'scale', title: 'Weight', sub: 'บันทึกน้ำหนักตัว' },
  ];
  openDrawer({
    title: c.date === ymd() ? 'Add' : `Add to ${fmtDate(c.date)}`,
    body: html`
      <ul class="menu-list">
        ${opts.map(o => html`
          <li><button type="button" class="menu-item" data-flow="${o.id}">
            <span class="menu-icon ${o.id === 'activity' || o.id === 'weight' ? 'is-blue' : ''}">${icon(o.icon)}</span>
            <span class="menu-text"><strong>${o.title}</strong><span>${o.sub}</span></span>
            ${icon('right', 18)}
          </button></li>`)}
      </ul>`,
    onMount(el, drawer) {
      el.querySelectorAll('[data-flow]').forEach(b => b.onclick = () => {
        drawer.close();
        ({ scan: openScan, search: openSearch, quick: openQuickAdd, activity: openActivity, weight: openWeight })[b.dataset.flow](c);
      });
    },
  });
}

/* ---------- การ์ดแก้ไขอาหาร (ใช้กับ Scan / Search / แก้ไข) ---------- */

const pickNuts = it => ({ grams: it.grams, kcal: it.kcal, carbs: it.carbs, protein: it.protein, fat: it.fat });

function toItem(f) {
  const it = { name: f.name, nameEn: f.nameEn || '', grams: f.grams, kcal: f.kcal, carbs: f.carbs, protein: f.protein, fat: f.fat };
  it.base = pickNuts(it);
  return it;
}

function itemCard(it, i, removable) {
  return html`
    <fieldset class="item-card" data-i="${i}">
      <div class="item-head">
        <input class="item-name" type="text" name="name" value="${it.name}" aria-label="Food name" maxlength="80" placeholder="Food name">
        ${removable ? html`<button type="button" class="icon-btn small" data-remove aria-label="Remove">${icon('trash', 18)}</button>` : ''}
      </div>
      ${it.nameEn ? html`<p class="item-sub">${it.nameEn}</p>` : ''}
      <div class="field-row">
        ${numField({ name: 'grams', label: 'Weight', value: it.grams, unit: 'g' })}
        ${numField({ name: 'kcal', label: 'Calories', value: it.kcal, unit: 'kcal' })}
      </div>
      <div class="field-row three">
        ${numField({ name: 'carbs', label: 'Carbs', value: it.carbs, unit: 'g' })}
        ${numField({ name: 'protein', label: 'Protein', value: it.protein, unit: 'g' })}
        ${numField({ name: 'fat', label: 'Fat', value: it.fat, unit: 'g' })}
      </div>
    </fieldset>`;
}

function totalsLine(items) {
  const t = sumEntries(items);
  return html`<strong>${fmt(t.kcal)} kcal</strong><span>Carbs ${fmtG(t.carbs)} g · Protein ${fmtG(t.protein)} g · Fat ${fmtG(t.fat)} g</span>`;
}

/* เปลี่ยนน้ำหนัก → สารอาหารอื่นย่อขยายตาม · แก้สารอาหาร → ค่านั้นเป็นฐานใหม่ */
function wireItems(root, items, { onChange, onRemove }) {
  root.querySelectorAll('.item-card').forEach(card => {
    const it = items[Number(card.dataset.i)];
    const field = n => card.querySelector(`[name=${n}]`);
    card.addEventListener('input', e => {
      const n = e.target.name;
      if (n === 'name') { it.name = e.target.value; return; }
      const v = num(e.target.value);
      if (n === 'grams') {
        if (!(v >= 0)) return;
        if (it.base.grams > 0) {
          const s = scaleFood(it.base, v);
          for (const k of NUTS) { it[k] = s[k]; field(k).value = s[k]; }
        } else {
          it.base = { ...pickNuts(it), grams: v };
        }
        it.grams = v;
      } else {
        it[n] = Number.isFinite(v) && v >= 0 ? v : 0;
        it.base = pickNuts(it);
      }
      onChange && onChange();
    });
    const rm = card.querySelector('[data-remove]');
    if (rm) rm.onclick = () => onRemove(Number(card.dataset.i));
  });
}

function validateItems(items) {
  if (!items.length) return 'เพิ่มอาหารอย่างน้อย 1 รายการ';
  for (const it of items) {
    if (!String(it.name || '').trim()) return 'อาหารทุกรายการต้องมีชื่อ';
    for (const k of ['grams', ...NUTS]) {
      if (!Number.isFinite(Number(it[k])) || Number(it[k]) < 0) return `ตรวจตัวเลขของ “${it.name}” อีกครั้ง`;
    }
  }
  return null;
}

/* อาหารที่บันทึกจาก AI / Quick Add เก็บไว้ค้นเจอในเครื่องครั้งหน้า */
async function rememberFood(it) {
  const mine = await db.all('foods');
  const key = it.name.trim().toLowerCase();
  const existing = mine.find(f => f.th.trim().toLowerCase() === key);
  await db.put('foods', {
    ...(existing || {}),
    th: it.name.trim(), en: it.nameEn || '', unit: 'serving',
    grams: Math.round(it.grams) || 100, kcal: Math.round(it.kcal), carbs: round1(it.carbs), protein: round1(it.protein), fat: round1(it.fat),
  });
}

async function saveMeals(items, { date, meal, source, remember = false }) {
  await db.putMany('meals', items.map(it => ({
    date, meal, source,
    name: it.name.trim(), nameEn: it.nameEn || '',
    grams: Math.round(Number(it.grams)), kcal: Math.round(Number(it.kcal)),
    carbs: round1(Number(it.carbs)), protein: round1(Number(it.protein)), fat: round1(Number(it.fat)),
  })));
  if (remember) for (const it of items) await rememberFood(it);
  const total = sumEntries(items).kcal;
  closeAllSheets();
  changed();
  toast(`Saved to ${mealLabel(meal)} ${date === ymd() ? '' : `(${fmtDate(date)}) `}· ${fmt(total)} kcal`);
}

/* หน้ารีวิวผลจาก Gemini: ตรวจ/แก้ → Save */
function reviewBody(items, c, { photo, result, intro }) {
  return html`
    ${photo ? html`<img class="review-photo" src="${photo}" alt="Your meal photo">` : ''}
    <div class="ai-meta">
      <span class="badge badge-${result.confidence}">${CONFIDENCE[result.confidence]}</span>
      <span>Gemini ประมาณให้ — ตรวจก่อนบันทึก</span>
    </div>
    <!-- note จาก Gemini ไม่แสดง: รุ่น flash-lite เขียนภาษาไทยเพี้ยนเป็นบางครั้ง -->
    <p class="hint">${intro}</p>
    <form class="review-form" novalidate>
      <div data-items>${items.map((it, i) => itemCard(it, i, items.length > 1))}</div>
      <button type="button" class="btn btn-quiet btn-small" data-add-item>${icon('plus', 16)} Add another item</button>
      <div class="totals" data-totals>${totalsLine(items)}</div>
      ${mealPicker(c.meal)}
      ${dateField(c.date)}
    </form>`;
}

function mountReview(el, items, c, { source, remember }) {
  const form = el.querySelector('.review-form');
  const list = el.querySelector('[data-items]');
  const totals = el.querySelector('[data-totals]');
  const syncTotals = () => { if (totals) totals.innerHTML = totalsLine(items).s; };
  const redraw = () => {
    list.innerHTML = items.map((it, i) => itemCard(it, i, items.length > 1)).join('');
    wire();
    syncTotals();
  };
  const wire = () => wireItems(list, items, {
    onChange: syncTotals,
    onRemove: i => { items.splice(i, 1); redraw(); },
  });
  wire();
  const addItem = el.querySelector('[data-add-item]');
  if (addItem) addItem.onclick = () => {
    items.push(toItem({ name: '', grams: 100, kcal: 0, carbs: 0, protein: 0, fat: 0 }));
    redraw();
    list.querySelector('.item-card:last-child .item-name').focus();
  };
  const save = el.querySelector('[data-save]');
  const meal = () => form.querySelector('[name=meal]:checked').value;
  const syncLabel = () => { save.textContent = `Save to ${mealLabel(meal())}`; };
  form.querySelectorAll('[name=meal]').forEach(r => r.onchange = syncLabel);
  syncLabel();
  save.onclick = async () => {
    const err = validateItems(items);
    if (err) return showFormError(form, err);
    await busy(save, form, () => saveMeals(items, { date: form.elements.date.value || c.date, meal: meal(), source, remember }));
  };
}

/* ---------- สถานะ loading / error ของ Gemini ---------- */

function loadingBody(text, photo) {
  return html`
    <div class="state-box" aria-live="polite">
      ${photo ? html`<img class="review-photo is-dim" src="${photo}" alt="">` : ''}
      <div class="spinner" aria-hidden="true"></div>
      <p class="state-title">${text}</p>
      <p class="muted">ปกติใช้เวลาไม่กี่วินาที</p>
    </div>`;
}

function errorBody(err, { photo, manual = true, another = false }) {
  return html`
    <div class="state-box" role="alert">
      ${photo ? html`<img class="review-photo is-dim" src="${photo}" alt="">` : ''}
      <span class="state-icon">${icon('alert', 26)}</span>
      <p class="state-title">${err.title || 'Something went wrong'}</p>
      <p class="muted">${err.message}</p>
      <div class="state-actions">
        ${err.kind !== 'invalid_image' ? html`<button type="button" class="btn btn-primary" data-retry>Retry</button>` : ''}
        ${another ? html`<button type="button" class="btn ${err.kind === 'invalid_image' ? 'btn-primary' : 'btn-quiet'}" data-another>Choose another photo</button>` : ''}
        ${err.settings ? html`<button type="button" class="btn btn-quiet" data-settings>Open AI settings</button>` : ''}
        ${manual ? html`<button type="button" class="btn btn-quiet" data-manual>Enter manually</button>` : ''}
      </div>
    </div>`;
}

function wireError(el, { retry, another, manual }) {
  const b = s => el.querySelector(s);
  if (b('[data-retry]')) b('[data-retry]').onclick = retry;
  if (b('[data-another]')) b('[data-another]').onclick = another;
  if (b('[data-manual]')) b('[data-manual]').onclick = manual;
  if (b('[data-settings]')) b('[data-settings]').onclick = () => { closeAllSheets(); location.hash = '#/profile'; openAiSettings(); };
}

/* ---------- 1. Scan Meal: ถ่ายรูป → วิเคราะห์ → รีวิว/แก้ → Save ---------- */

export function openScan(ctx) {
  const c = context(ctx);
  let image = null;
  let ctrl = null;
  const sheet = openSheet({ title: 'Scan Meal' });

  const pick = () => sheet.set({
    step: 'Step 1 of 3 · Photo',
    back: null,
    body: html`
      <div class="scan-pick">
        <span class="scan-art">${icon('camera', 40)}</span>
        <p class="lead">ถ่ายรูปอาหาร แล้ว Gemini จะบอกชื่ออาหาร และประมาณแคลอรี่ คาร์โบไฮเดรต โปรตีน ไขมันให้</p>
        <ul class="tips">
          <li>ให้เห็นอาหารทั้งจาน</li>
          <li>แสงสว่างพอ ถ่ายจากด้านบน</li>
          <li>ถ่ายเครื่องดื่มและกับข้าวด้านข้างด้วย</li>
        </ul>
        <label class="btn btn-primary btn-block file-btn">${icon('camera', 18)} Take photo
          <input type="file" accept="image/*" capture="environment" data-file></label>
        <label class="btn btn-quiet btn-block file-btn">${icon('image', 18)} Choose from library
          <input type="file" accept="image/*" data-file></label>
      </div>`,
    footer: null,
    onMount(el) {
      el.querySelectorAll('[data-file]').forEach(inp => inp.onchange = async () => {
        const file = inp.files && inp.files[0];
        inp.value = '';
        if (!file) return;
        try {
          image = await ai.prepareImage(file);
          analyze();
        } catch (err) {
          showError(err);
        }
      });
    },
  });

  const analyze = async () => {
    ctrl = new AbortController();
    sheet.set({
      step: 'Step 2 of 3 · Analyzing',
      back: null,
      body: loadingBody('Analyzing image...', image.previewUrl),
      footer: html`<button type="button" class="btn btn-quiet btn-block" data-cancel>Cancel</button>`,
      onMount(el) { el.querySelector('[data-cancel]').onclick = () => { ctrl.abort(); pick(); }; },
    });
    try {
      const result = await ai.analyzePhoto(image, { signal: ctrl.signal });
      review(result);
    } catch (err) {
      if (err.kind === 'cancelled') return;
      showError(err);
    }
  };

  const showError = err => sheet.set({
    step: 'Step 2 of 3 · Analyzing',
    back: pick,
    body: errorBody(err, { photo: image && image.previewUrl, another: true }),
    footer: null,
    onMount(el) { wireError(el, { retry: analyze, another: pick, manual: () => { sheet.close(); openQuickAdd(c); } }); },
  });

  const review = result => {
    const items = result.items.map(toItem);
    sheet.set({
      step: 'Step 3 of 3 · Review',
      back: pick,
      body: reviewBody(items, c, { photo: image.previewUrl, result, intro: 'แก้ส่วนที่ดูไม่ถูกได้เลย — เปลี่ยนน้ำหนักแล้วสารอาหารของรายการนั้นจะปรับตาม' }),
      footer: html`<button type="button" class="btn btn-primary btn-block" data-save>Save</button>`,
      onMount(el) { mountReview(el, items, c, { source: 'scan', remember: true }); },
    });
  };

  pick();
}

/* ---------- 2. Search Food: ในเครื่องก่อน → ไม่เจอ → Gemini → รีวิว → Save ---------- */

const norm = s => String(s || '').toLowerCase().replace(/\s+/g, '');

function searchFoods(q, mine) {
  const nq = norm(q);
  if (!nq) return [];
  const scored = [];
  const consider = (f, mineBonus) => {
    const names = [f.th, f.en, ...(f.aliases || [])].map(norm);
    let score = 0;
    for (const n of names) {
      if (n === nq) score = Math.max(score, 3);
      else if (n.startsWith(nq)) score = Math.max(score, 2);
      else if (n.includes(nq)) score = Math.max(score, 1);
    }
    if (score) scored.push({ f, score: score + mineBonus });
  };
  mine.forEach(f => consider(f, 0.5));
  FOODS.forEach(f => consider(f, 0));
  return scored.sort((a, b) => b.score - a.score || a.f.th.localeCompare(b.f.th, 'th')).slice(0, 40).map(s => s.f);
}

function servingText(f) {
  if (f.unit === 'g') return `per ${fmt(f.grams)} g`;
  return `1 ${UNIT_LABEL[f.unit] || 'serving'} · ${fmt(f.grams)} g`;
}

function foodRow(f, i, tag) {
  return html`
    <li><button type="button" class="food-row" data-pick="${i}">
      <span class="food-name"><strong>${f.th}</strong><span>${[f.en, servingText(f)].filter(Boolean).join(' · ')}</span></span>
      <span class="food-kcal">${fmt(f.kcal)}<small>kcal</small></span>
      ${tag ? html`<span class="tag">${tag}</span>` : ''}
    </button></li>`;
}

export async function openSearch(ctx) {
  const c = context(ctx);
  const mine = await db.all('foods');
  const recentMeals = (await db.all('meals')).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const recent = [];
  const seen = new Set();
  for (const m of recentMeals) {
    const k = m.name.toLowerCase();
    if (seen.has(k) || !(m.grams > 0)) continue;
    seen.add(k);
    recent.push({ th: m.name, en: m.nameEn, unit: 'serving', grams: m.grams, kcal: m.kcal, carbs: m.carbs, protein: m.protein, fat: m.fat });
    if (recent.length === 8) break;
  }
  let query = '';
  let shown = [];
  let ctrl = null;
  const sheet = openSheet({ title: 'Search Food' });

  const find = () => sheet.set({
    step: 'Step 1 of 2 · Find food',
    back: null,
    footer: null,
    body: html`
      <form class="search-box" role="search" data-search>
        ${icon('search', 20)}
        <input type="search" name="q" placeholder="e.g. ข้าวมันไก่, pad thai, banana" value="${query}" autocomplete="off" enterkeyhint="search" aria-label="Search food">
      </form>
      <div data-results></div>`,
    onMount(el) {
      const input = el.querySelector('[name=q]');
      const results = el.querySelector('[data-results]');
      const draw = () => {
        query = input.value;
        const q = query.trim();
        if (!q) {
          shown = recent;
          results.innerHTML = recent.length ? html`
            <h3 class="list-head">Recent</h3>
            <ul class="food-list">${recent.map((f, i) => foodRow(f, i))}</ul>`.s
            : html`<p class="hint center">พิมพ์ชื่ออาหารหรือวัตถุดิบ ภาษาไทยหรืออังกฤษก็ได้</p>`.s;
        } else {
          shown = searchFoods(q, mine);
          results.innerHTML = shown.length ? html`
            <ul class="food-list">${shown.map((f, i) => foodRow(f, i, f.id && !FOODS.includes(f) ? 'Saved' : ''))}</ul>
            <div class="ai-fallback quiet">
              <span>ไม่ใช่อันที่หา?</span>
              <button type="button" class="btn btn-quiet btn-small" data-ai>${icon('spark', 16)} Estimate “${q}” with Gemini</button>
            </div>`.s : html`
            <div class="empty in-sheet">
              <p>No match for “${q}” in the food list.</p>
              <button type="button" class="btn btn-primary" data-ai>${icon('spark', 18)} Estimate with Gemini</button>
              <button type="button" class="btn btn-quiet" data-quick>Add it manually</button>
            </div>`.s;
        }
        results.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => detail(shown[Number(b.dataset.pick)]));
        const aiBtn = results.querySelector('[data-ai]');
        if (aiBtn) aiBtn.onclick = () => estimate(q);
        const quick = results.querySelector('[data-quick]');
        if (quick) quick.onclick = () => { sheet.close(); openQuickAdd({ ...c, name: q }); };
      };
      input.addEventListener('input', draw);
      el.querySelector('[data-search]').onsubmit = e => { e.preventDefault(); input.blur(); };
      draw();
      if (!query) setTimeout(() => input.focus(), 350);
    },
  });

  /* เลือกจากฐานข้อมูล → ปรับปริมาณ (คำนวณด้วย JS) → Save */
  const detail = f => {
    const base = { name: f.th, nameEn: f.en || '', grams: f.grams, kcal: f.kcal, carbs: f.carbs, protein: f.protein, fat: f.fat };
    const items = [toItem(base)];
    const chips = f.unit === 'g'
      ? [50, 100, 150, 200].map(g => ({ g, label: `${g} g` }))
      : [0.5, 1, 1.5, 2].map(k => ({ g: Math.round(f.grams * k), label: `${k === 0.5 ? '½' : k === 1.5 ? '1½' : k} ${UNIT_LABEL[f.unit] || 'serving'}` }));
    sheet.set({
      step: 'Step 2 of 2 · Amount',
      back: find,
      body: html`
        <p class="hint">เลือกปริมาณที่กิน — สารอาหารคำนวณจากค่าในรายการอาหาร</p>
        <div class="chips" role="group" aria-label="Portion">
          ${chips.map(ch => html`<button type="button" class="chip ${ch.g === f.grams ? 'on' : ''}" data-g="${ch.g}">${ch.label}</button>`)}
        </div>
        <form class="review-form" novalidate>
          <div data-items>${itemCard(items[0], 0, false)}</div>
          ${mealPicker(c.meal)}
          ${dateField(c.date)}
        </form>`,
      footer: html`<button type="button" class="btn btn-primary btn-block" data-save>Save</button>`,
      onMount(el) {
        mountReview(el, items, c, { source: 'search', remember: false });
        el.querySelectorAll('[data-g]').forEach(b => b.onclick = () => {
          const g = el.querySelector('[name=grams]');
          g.value = b.dataset.g;
          g.dispatchEvent(new Event('input', { bubbles: true }));
          el.querySelectorAll('[data-g]').forEach(x => x.classList.toggle('on', x === b));
        });
      },
    });
  };

  const estimate = async q => {
    ctrl = new AbortController();
    sheet.set({
      step: 'Step 2 of 3 · Asking Gemini',
      back: null,
      body: loadingBody(`Estimating “${q}”...`),
      footer: html`<button type="button" class="btn btn-quiet btn-block" data-cancel>Cancel</button>`,
      onMount(el) { el.querySelector('[data-cancel]').onclick = () => { ctrl.abort(); find(); }; },
    });
    try {
      const result = await ai.lookupFood(q, { signal: ctrl.signal });
      const items = result.items.map(toItem);
      sheet.set({
        step: 'Step 3 of 3 · Review',
        back: find,
        body: reviewBody(items, c, { result, intro: 'ตรวจปริมาณและตัวเลข — จะเก็บไว้ในเครื่องด้วย ค้นครั้งหน้าจะเจอเลย' }),
        footer: html`<button type="button" class="btn btn-primary btn-block" data-save>Save</button>`,
        onMount(el) { mountReview(el, items, c, { source: 'ai-search', remember: true }); },
      });
    } catch (err) {
      if (err.kind === 'cancelled') return;
      sheet.set({
        step: 'Step 2 of 3 · Asking Gemini',
        back: find,
        body: errorBody(err, {}),
        footer: null,
        onMount(el) { wireError(el, { retry: () => estimate(q), manual: () => { sheet.close(); openQuickAdd({ ...c, name: q }); } }); },
      });
    }
  };

  find();
}

/* ---------- 3. Quick Add ---------- */

export function openQuickAdd(ctx) {
  const c = context(ctx);
  openSheet({
    title: 'Quick Add',
    body: html`
      <form class="stack-form" novalidate data-form>
        <label class="field">
          <span class="field-label">Food name</span>
          <input name="name" type="text" maxlength="80" value="${ctx.name || ''}" placeholder="e.g. Homemade salad" required>
        </label>
        <div class="field-row">
          ${numField({ name: 'grams', label: 'Weight', unit: 'g' })}
          ${numField({ name: 'kcal', label: 'Calories', unit: 'kcal', placeholder: 'auto' })}
        </div>
        <div class="field-row three">
          ${numField({ name: 'carbs', label: 'Carbs', unit: 'g' })}
          ${numField({ name: 'protein', label: 'Protein', unit: 'g' })}
          ${numField({ name: 'fat', label: 'Fat', unit: 'g' })}
        </div>
        <p class="hint" data-auto>เว้นช่อง Calories ว่างไว้ได้ จะคำนวณจาก Carbs × 4 + Protein × 4 + Fat × 9</p>
        ${mealPicker(c.meal)}
        ${dateField(c.date)}
        <label class="switch-row">
          <input type="checkbox" name="remember" checked>
          <span>Save to my foods</span>
        </label>
      </form>`,
    footer: html`<button type="button" class="btn btn-primary btn-block" data-save>Save</button>`,
    onMount(el) {
      const form = el.querySelector('[data-form]');
      const auto = el.querySelector('[data-auto]');
      const read = () => {
        const v = n => { const x = num(form.elements[n].value); return Number.isFinite(x) ? x : null; };
        return { grams: v('grams'), kcal: v('kcal'), carbs: v('carbs') || 0, protein: v('protein') || 0, fat: v('fat') || 0 };
      };
      form.addEventListener('input', () => {
        const r = read();
        auto.textContent = r.kcal == null && (r.carbs || r.protein || r.fat)
          ? `จะบันทึกเป็น ${fmt(kcalFromMacros(r))} kcal (คำนวณจาก Carbs, Protein และ Fat)`
          : 'เว้นช่อง Calories ว่างไว้ได้ จะคำนวณจาก Carbs × 4 + Protein × 4 + Fat × 9';
      });
      el.querySelector('[data-save]').onclick = async e => {
        const name = form.elements.name.value.trim();
        const r = read();
        if (!name) { form.elements.name.focus(); return showFormError(form, 'กรอกชื่ออาหาร'); }
        const TH = { grams: 'Weight', kcal: 'Calories', carbs: 'Carbs', protein: 'Protein', fat: 'Fat' };
        for (const k of Object.keys(TH)) {
          if (form.elements[k].value.trim() !== '' && !(num(form.elements[k].value) >= 0)) return showFormError(form, `ตรวจค่า ${TH[k]} อีกครั้ง`);
        }
        if (r.kcal == null && !(r.carbs || r.protein || r.fat)) return showFormError(form, 'กรอก Calories หรือกรอก Carbs / Protein / Fat เพื่อคำนวณ');
        const item = { name, grams: r.grams || 0, kcal: r.kcal ?? kcalFromMacros(r), carbs: r.carbs, protein: r.protein, fat: r.fat };
        await busy(e.currentTarget, form, () => saveMeals([item], {
          date: form.elements.date.value || c.date,
          meal: form.querySelector('[name=meal]:checked').value,
          source: 'manual',
          remember: form.elements.remember.checked && item.grams > 0,
        }));
      };
    },
  });
}

/* ---------- แก้ไขรายการอาหาร (จาก Diary) ---------- */

export function editMeal(entry) {
  const items = [toItem(entry)];
  openSheet({
    title: 'Edit food',
    body: html`
      <form class="review-form" novalidate>
        <div data-items>${itemCard(items[0], 0, false)}</div>
        ${mealPicker(entry.meal)}
        ${dateField(entry.date)}
      </form>
      <button type="button" class="btn btn-danger-quiet btn-block" data-delete>${icon('trash', 18)} Delete this food</button>`,
    footer: html`<button type="button" class="btn btn-primary btn-block" data-save>Save changes</button>`,
    onMount(el, sheet) {
      const form = el.querySelector('.review-form');
      wireItems(el.querySelector('[data-items]'), items, {});
      el.querySelector('[data-save]').onclick = async e => {
        const err = validateItems(items);
        if (err) return showFormError(form, err);
        const it = items[0];
        await busy(e.currentTarget, form, async () => {
          await db.put('meals', {
            ...entry,
            name: it.name.trim(), grams: Math.round(it.grams), kcal: Math.round(it.kcal),
            carbs: round1(it.carbs), protein: round1(it.protein), fat: round1(it.fat),
            meal: form.querySelector('[name=meal]:checked').value,
            date: form.elements.date.value || entry.date,
          });
          sheet.close();
          changed();
          toast('Changes saved');
        });
      };
      el.querySelector('[data-delete]').onclick = async () => {
        if (await deleteEntry('meals', entry)) sheet.close();
      };
    },
  });
}

/* ลบพร้อมยืนยัน + ปุ่ม Undo */
export async function deleteEntry(store, entry) {
  const what = store === 'meals' ? entry.name : activityLabel(entry);
  const ok = await confirmDialog({ title: `Delete “${what}”?`, message: `${fmt(entry.kcal)} kcal จะถูกลบออกจากวันที่ ${fmtDate(entry.date)}`, confirm: 'Delete', danger: true });
  if (!ok) return false;
  await db.remove(store, entry.id);
  changed();
  toast(`Deleted ${what}`, { action: 'Undo', onAction: async () => { await db.put(store, entry); changed(); } });
  return true;
}

/* ---------- 4. Activity: เลือกกิจกรรม → รายละเอียด → Save (MET × kg × ชั่วโมง) ---------- */

export function openActivity(ctx, existing = null) {
  const c = context(ctx);
  const sheet = openSheet({ title: existing ? 'Edit activity' : 'Activity' });

  const choose = () => sheet.set({
    step: 'Step 1 of 2 · Choose activity',
    back: null,
    footer: null,
    body: html`
      <ul class="activity-grid">
        ${ACTIVITIES.map(a => html`<li><button type="button" class="activity-pick" data-a="${a.id}">${a.label}</button></li>`)}
      </ul>`,
    onMount(el) { el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => details(b.dataset.a)); },
  });

  const details = (activityId, preset = {}) => {
    const a = ACTIVITIES.find(x => x.id === activityId);
    const levelId = preset.levelId || a.levels[Math.min(1, a.levels.length - 1)].id;
    const weight = preset.weightKg ?? state.profile.weightKg;
    sheet.set({
      step: existing ? a.label : `Step 2 of 2 · ${a.label}`,
      back: existing ? null : choose,
      body: html`
        <form class="stack-form" novalidate data-form>
          <div class="field">
            <span class="field-label">Intensity</span>
            <div class="chips" role="radiogroup" aria-label="Intensity">
              ${a.levels.map(l => html`
                <label class="chip-radio">
                  <input type="radio" name="level" value="${l.id}" ${l.id === levelId ? raw('checked') : ''}>
                  <span>${l.label}${l.note ? html`<small>${l.note}</small>` : ''}</span>
                </label>`)}
            </div>
          </div>
          <div class="field-row">
            ${numField({ name: 'minutes', label: 'Duration', unit: 'min', value: preset.minutes ?? '' })}
            ${numField({ name: 'weightKg', label: 'Your weight', unit: 'kg', value: weight })}
          </div>
          ${a.distance ? numField({ name: 'distanceKm', label: 'Distance (optional)', unit: 'km', value: preset.distanceKm ?? '', hint: 'เก็บไว้ดูเฉยๆ — แคลอรี่คำนวณจากความหนักและเวลา' }) : ''}
          ${dateField(preset.date || c.date)}
          <div class="calc-box" aria-live="polite" data-result></div>
        </form>
        ${existing ? html`<button type="button" class="btn btn-danger-quiet btn-block" data-delete>${icon('trash', 18)} Delete this activity</button>` : ''}`,
      footer: html`<button type="button" class="btn btn-primary btn-block" data-save>${existing ? 'Save changes' : 'Save activity'}</button>`,
      onMount(el) {
        const form = el.querySelector('[data-form]');
        const out = el.querySelector('[data-result]');
        const read = () => {
          const lv = a.levels.find(l => l.id === form.querySelector('[name=level]:checked').value);
          return { lv, minutes: num(form.elements.minutes.value), kg: num(form.elements.weightKg.value) };
        };
        const update = () => {
          const { lv, minutes, kg } = read();
          const kcal = activityKcal(lv.met, kg, minutes);
          out.innerHTML = kcal > 0
            ? html`<strong>≈ ${fmt(kcal)} kcal burned</strong><span>MET ${lv.met} × ${fmt(kg, 1)} kg × ${fmt(minutes / 60, 2)} h</span>`.s
            : html`<span>กรอกระยะเวลาเพื่อดูแคลอรี่ที่เผาผลาญ</span><span>MET ${lv.met} × weight (kg) × hours</span>`.s;
        };
        form.addEventListener('input', update);
        form.addEventListener('change', update);
        update();
        if (!preset.minutes) setTimeout(() => form.elements.minutes.focus(), 350);
        el.querySelector('[data-save]').onclick = async e => {
          const { lv, minutes, kg } = read();
          if (!(minutes > 0 && minutes <= 1440)) { form.elements.minutes.focus(); return showFormError(form, 'กรอกระยะเวลา 1–1,440 นาที'); }
          if (!(kg >= 25 && kg <= 350)) { form.elements.weightKg.focus(); return showFormError(form, 'กรอกน้ำหนักเป็น kg (25–350)'); }
          const dist = form.elements.distanceKm ? num(form.elements.distanceKm.value) : NaN;
          if (form.elements.distanceKm && form.elements.distanceKm.value.trim() && !(dist >= 0 && dist <= 500)) return showFormError(form, 'ตรวจระยะทาง (km) อีกครั้ง');
          const row = {
            ...(existing || {}),
            date: form.elements.date.value || c.date,
            activityId: a.id, levelId: lv.id,
            label: `${a.label} — ${lv.label}`,
            met: lv.met, minutes: Math.round(minutes), weightKg: round1(kg),
            distanceKm: dist >= 0 ? round1(dist) : null,
            kcal: activityKcal(lv.met, kg, minutes),
          };
          await busy(e.currentTarget, form, async () => {
            await db.put('activities', row);
            sheet.close();
            changed();
            toast(existing ? 'Changes saved' : `Logged ${a.label} · ${fmt(row.kcal)} kcal burned`);
          });
        };
        const del = el.querySelector('[data-delete]');
        if (del) del.onclick = async () => { if (await deleteEntry('activities', existing)) sheet.close(); };
      },
    });
  };

  if (existing) {
    const found = findActivity(existing.activityId, existing.levelId);
    if (found) return details(existing.activityId, existing);
  }
  choose();
}

export const editActivity = entry => openActivity({ date: entry.date }, entry);

/* ---------- 5. Weight ---------- */

export async function openWeight(ctx) {
  const c = context(ctx);
  const last = await db.latestWeight(ymd());
  openSheet({
    title: 'Weight',
    body: html`
      <form class="stack-form" novalidate data-form>
        ${numField({ name: 'kg', label: 'Weight', unit: 'kg', value: '', placeholder: last ? String(last.kg) : '' })}
        ${dateField(c.date > ymd() ? ymd() : c.date, 'Date', ymd())}
        <p class="hint" data-hint>${last ? `ครั้งล่าสุด: ${fmt(last.kg, 1)} kg เมื่อ ${fmtDate(last.date)}` : 'ค่าแรกจะเริ่มกราฟน้ำหนักในหน้า Insight'}</p>
      </form>`,
    footer: html`<button type="button" class="btn btn-primary btn-block" data-save>Save weight</button>`,
    onMount(el, sheet) {
      const form = el.querySelector('[data-form]');
      const hint = el.querySelector('[data-hint]');
      const base = hint.textContent;
      const checkDay = async () => {
        const same = await db.get('weights', form.elements.date.value);
        hint.textContent = same ? `จะแทนที่ ${fmt(same.kg, 1)} kg ที่บันทึกไว้แล้วของ${whenLabel(same.date)}` : base;
      };
      form.elements.date.onchange = checkDay;
      checkDay();
      setTimeout(() => form.elements.kg.focus(), 350);
      el.querySelector('[data-save]').onclick = async e => {
        const kg = num(form.elements.kg.value);
        if (!(kg >= 25 && kg <= 350)) { form.elements.kg.focus(); return showFormError(form, 'กรอกน้ำหนักเป็น kg (25–350)'); }
        const date = form.elements.date.value || c.date;
        if (date > ymd()) return showFormError(form, 'บันทึกน้ำหนักของวันในอนาคตไม่ได้');
        await busy(e.currentTarget, form, async () => {
          const { before, after } = await logWeight(date, Math.round(kg * 10) / 10);
          sheet.close();
          toast(before !== after ? `Weight saved · daily goal is now ${fmt(after)} kcal` : `Weight saved · ${fmt(kg, 1)} kg`);
        });
      };
    },
  });
}
