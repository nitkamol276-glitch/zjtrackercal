/* ชิ้นส่วน UI ที่ใช้ร่วมกัน: template ที่ escape ให้เอง, sheet, drawer, toast, กล่องยืนยัน, ไอคอน, ฟอร์แมตตัวเลข */

/* ---------- template ---------- */

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);

class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = s => new Raw(String(s));

const val = v => v instanceof Raw ? v.s
  : Array.isArray(v) ? v.map(val).join('')
  : (v === false || v == null) ? '' : esc(v);

/* html`...${x}...` — ค่าที่แทรกถูก escape เสมอ ยกเว้นห่อด้วย raw() หรือเป็น html`` อีกชั้น */
export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += val(vals[i]) + strings[i + 1];
  return new Raw(out);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ---------- ตัวเลข / วันที่ ---------- */

export const fmt = (n, digits = 0) => n == null || Number.isNaN(n) ? '–'
  : Number(n).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 });

export const fmtG = n => fmt(n, 1);

/* วันที่แบบไทย (ปี พ.ศ.) */
export function fmtDate(s, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('th-TH', opts);
}

/* label = หัวข้อมื้อ · short = ปุ่มเลือกมื้อ (ที่แคบ) */
export const MEALS = [
  { id: 'breakfast', label: 'มื้อเช้า',     short: 'เช้า' },
  { id: 'lunch',     label: 'มื้อกลางวัน',  short: 'กลางวัน' },
  { id: 'dinner',    label: 'มื้อเย็น',     short: 'เย็น' },
  { id: 'snack',     label: 'ของว่าง',     short: 'ของว่าง' },
];
export const mealLabel = id => (MEALS.find(m => m.id === id) || MEALS[3]).label;

/* ---------- ไอคอน (เส้น 1.75px, ใช้ currentColor) ---------- */

const P = {
  home: '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"/>',
  book: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"/><path d="M9 7.5h6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chart: '<path d="M4 20h16"/><path d="M7 16v-5M12 16V7M17 16v-8"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
  camera: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="13" r="3.5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  pencil: '<path d="M15.5 4.5 19.5 8.5 9 19H5v-4z"/><path d="m13.5 6.5 4 4"/>',
  run: '<circle cx="14" cy="4.5" r="1.75"/><path d="m9 21 2.5-5.5 3 2.5V22"/><path d="M6 12.5 9 9l4 1 2.5 3.5H19"/><path d="M11.5 15.5 13 10"/>',
  scale: '<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><path d="M7.5 11.5a4.5 4.5 0 0 1 9 0z"/><path d="m12 11.5 1.8-2.4"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  left: '<path d="M14.5 6 8.5 12l6 6"/>',
  right: '<path d="M9.5 6l6 6-6 6"/>',
  flag: '<path d="M6 21V4M6 4h10l-2 4 2 4H6"/>',
  fork: '<path d="M8 3v7a2 2 0 0 0 2 2v9M12 3v7a2 2 0 0 1-2 2M7 3v4M17 21V3c-2 1-3 4-3 7h3"/>',
  flame: '<path d="M12 21c-3.5 0-6-2.5-6-5.5 0-3 2-4.5 3-7 1 1.5 1.5 2.5 1.5 4 1-1 2-3 1.5-7.5C15 7 18 10.5 18 15.5c0 3-2.5 5.5-6 5.5z"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  spark: '<path d="M12 4v4M12 16v4M4 12h4M16 12h4M6.5 6.5l2.5 2.5M15 15l2.5 2.5M6.5 17.5 9 15M15 9l2.5-2.5"/>',
  image: '<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m20 16-5-5-8 8"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  alert: '<path d="M12 4 21 20H3z"/><path d="M12 10v4M12 17h.01"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  table: '<rect x="4" y="5" width="16" height="14" rx="1.5"/><path d="M4 10h16M4 14.5h16M10 5v14"/>',
};

export const icon = (name, size = 22) => raw(
  `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`
);

/* ---------- toast ---------- */

let toastTimer;
export function toast(msg, { action, onAction, ms = 3200 } = {}) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.append(el); }
  el.innerHTML = html`<span>${msg}</span>${action ? html`<button type="button">${action}</button>` : ''}`.s;
  if (action) el.querySelector('button').onclick = () => { el.classList.remove('show'); onAction && onAction(); };
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

/* ---------- sheet (เต็มจอ เลื่อนขึ้นจากล่าง) ---------- */

const stack = [];

function lockScroll() { document.documentElement.classList.toggle('has-overlay', stack.length > 0); }

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/* เปิดแบบเลื่อนขึ้น — หรือโผล่ทันทีถ้าเครื่องตั้ง Reduce Motion ไว้ */
function reveal(el) {
  if (reducedMotion()) el.classList.add('open');
  else requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')));
}

function dismiss(el, ms) {
  el.classList.remove('open');
  if (reducedMotion()) el.remove();
  else setTimeout(() => el.remove(), ms);
}

/* openSheet({title, step, back, body, footer, onMount, onClose}) → {el, close, set}
   step: 'ขั้นที่ 1 จาก 3 · ถ่ายรูป' — บอกผู้ใช้ว่าอยู่ขั้นไหน
   back: ฟังก์ชันเมื่อกดย้อน (ไม่มี = มีแค่ปุ่มปิด) */
export function openSheet(opts) {
  const el = document.createElement('section');
  el.className = 'sheet';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  document.body.append(el);
  const ctl = {
    el,
    opts,
    close(result) {
      const i = stack.indexOf(ctl);
      if (i >= 0) stack.splice(i, 1);
      dismiss(el, 320);
      lockScroll();
      opts.onClose && opts.onClose(result);
    },
    /* เปลี่ยนเนื้อหาในชีทเดิม (ใช้กับ flow หลายขั้น) */
    set(next) {
      Object.assign(opts, next);
      render();
    },
  };
  function render() {
    el.innerHTML = html`
      <header class="sheet-head">
        ${opts.back
          ? html`<button type="button" class="icon-btn" data-sheet-back aria-label="ย้อนกลับ">${icon('back')}</button>`
          : html`<span class="icon-btn-spacer"></span>`}
        <div class="sheet-title">
          ${opts.step ? html`<p class="sheet-step">${opts.step}</p>` : ''}
          <h2>${opts.title}</h2>
        </div>
        <button type="button" class="icon-btn" data-sheet-close aria-label="ปิด">${icon('close')}</button>
      </header>
      <div class="sheet-body">${opts.body || ''}</div>
      ${opts.footer ? html`<footer class="sheet-foot">${opts.footer}</footer>` : ''}
    `.s;
    el.querySelector('[data-sheet-close]').onclick = () => ctl.close();
    const b = el.querySelector('[data-sheet-back]');
    if (b) b.onclick = () => opts.back();
    el.querySelector('.sheet-body').scrollTop = 0;
    opts.onMount && opts.onMount(el, ctl);
  }
  render();
  stack.push(ctl);
  lockScroll();
  reveal(el);
  return ctl;
}

export function closeAllSheets() {
  while (stack.length) stack[stack.length - 1].close();
}

/* ---------- drawer (เมนูครึ่งจอจากล่าง) ---------- */

export function openDrawer({ title, body, onMount }) {
  const wrap = document.createElement('div');
  wrap.className = 'drawer-wrap';
  wrap.innerHTML = html`
    <div class="drawer-scrim" data-close></div>
    <section class="drawer" role="dialog" aria-modal="true" aria-label="${title}">
      <div class="drawer-grip" aria-hidden="true"></div>
      <h2 class="drawer-title">${title}</h2>
      ${body}
      <button type="button" class="btn btn-quiet btn-block" data-close>ยกเลิก</button>
    </section>`.s;
  document.body.append(wrap);
  const ctl = {
    el: wrap,
    close() {
      const i = stack.indexOf(ctl);
      if (i >= 0) stack.splice(i, 1);
      dismiss(wrap, 300);
      lockScroll();
    },
  };
  wrap.querySelectorAll('[data-close]').forEach(b => b.onclick = () => ctl.close());
  stack.push(ctl);
  lockScroll();
  reveal(wrap);
  onMount && onMount(wrap, ctl);
  return ctl;
}

/* ---------- กล่องยืนยัน ---------- */

export function confirmDialog({ title, message, confirm = 'ยืนยัน', danger = false }) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'dialog-wrap';
    wrap.innerHTML = html`
      <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t" aria-describedby="dlg-m">
        <h2 id="dlg-t">${title}</h2>
        <p id="dlg-m">${message}</p>
        <div class="dialog-actions">
          <button type="button" class="btn btn-quiet" data-no>ยกเลิก</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${confirm}</button>
        </div>
      </div>`.s;
    document.body.append(wrap);
    requestAnimationFrame(() => wrap.classList.add('open'));
    const finish = v => { wrap.remove(); resolve(v); };
    wrap.querySelector('[data-no]').onclick = () => finish(false);
    wrap.querySelector('[data-yes]').onclick = () => finish(true);
    wrap.querySelector('[data-no]').focus();
  });
}

/* ---------- ฟอร์ม ---------- */

/* ช่องตัวเลขพร้อมหน่วย */
export function numField({ name, label, value, unit, step = 'any', min = 0, required = false, hint, placeholder = '' }) {
  return html`
    <label class="field">
      <span class="field-label">${label}</span>
      <span class="input-unit">
        <input name="${name}" type="text" inputmode="decimal" autocomplete="off" enterkeyhint="done"
          value="${value ?? ''}" placeholder="${placeholder}" data-min="${min}" data-step="${step}" ${required ? raw('required') : ''}>
        ${unit ? html`<span class="unit">${unit}</span>` : ''}
      </span>
      ${hint ? html`<span class="field-hint">${hint}</span>` : ''}
    </label>`;
}

/* ปุ่มเลือกแบบแบ่งช่อง (segmented) */
export function segmented(name, options, current) {
  return html`
    <div class="segmented" role="radiogroup">
      ${options.map(o => html`
        <label class="seg">
          <input type="radio" name="${name}" value="${o.id}" ${o.id === current ? raw('checked') : ''}>
          <span>${o.label}</span>
        </label>`)}
    </div>`;
}

export function mealPicker(current) {
  return html`<div class="field"><span class="field-label">มื้อ</span>${segmented('meal', MEALS.map(m => ({ id: m.id, label: m.short })), current)}</div>`;
}

export function dateField(value, label = 'วันที่', max = '') {
  return html`
    <label class="field">
      <span class="field-label">${label}</span>
      <input name="date" type="date" value="${value}" ${max ? raw(`max="${esc(max)}"`) : ''} required>
    </label>`;
}

export function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

/* กดบันทึก: ปิดปุ่มระหว่างทำงาน ถ้าพลาด (เช่น พื้นที่เต็ม) บอกสาเหตุแล้วให้กดใหม่ได้ */
export async function busy(btn, form, fn) {
  btn.disabled = true;
  try {
    await fn();
  } catch (err) {
    console.error(err);
    showFormError(form, `บันทึกไม่สำเร็จ (${err && err.message ? err.message : err}) — ลองอีกครั้ง`);
  } finally {
    if (btn.isConnected) btn.disabled = false;
  }
}

/* ข้อความ error ใต้ฟอร์ม */
export function showFormError(form, msg) {
  let el = form.querySelector('.form-error');
  if (!el) { el = document.createElement('p'); el.className = 'form-error'; el.setAttribute('role', 'alert'); form.append(el); }
  el.textContent = msg || '';
  el.hidden = !msg;
}
