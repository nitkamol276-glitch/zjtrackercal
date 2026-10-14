/* จุดเริ่มแอป: เปิดฐานข้อมูล → ยังไม่มี profile = Setup → มีแล้ว = tab bar + หน้าตาม #hash */

import { state, load, onChange } from './state.js';
import { html, icon, closeAllSheets, toast } from './ui.js';
import { ymd } from './calc.js';
import { renderSetup } from './views/setup.js';
import { renderDashboard } from './views/dashboard.js';
import { renderDiary } from './views/diary.js';
import { renderInsight } from './views/insight.js';
import { renderProfile } from './views/profile.js';
import { openAdd } from './views/add.js';

const ROUTES = {
  dashboard: { label: 'หน้าหลัก', icon: 'home', render: renderDashboard },
  diary:     { label: 'ไดอารี่',  icon: 'book', render: renderDiary },
  insight:   { label: 'สถิติ',    icon: 'chart', render: renderInsight },
  profile:   { label: 'โปรไฟล์',  icon: 'user', render: renderProfile },
};
const TAB_ORDER = ['dashboard', 'diary', 'add', 'insight', 'profile'];

const root = document.getElementById('app');
let lastDay = ymd();

const current = () => {
  const r = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  return ROUTES[r] ? r : 'dashboard';
};

function buildShell() {
  root.innerHTML = html`
    <main id="view" class="view" tabindex="-1"></main>
    <nav class="tabbar" aria-label="เมนูหลัก">
      ${TAB_ORDER.map(id => id === 'add'
        ? html`<button type="button" class="tab tab-add" data-add aria-label="เพิ่ม"><span class="tab-add-circle">${icon('plus', 26)}</span><span class="tab-label">เพิ่ม</span></button>`
        : html`<a class="tab" href="#/${id}" data-tab="${id}">${icon(ROUTES[id].icon, 24)}<span class="tab-label">${ROUTES[id].label}</span></a>`)}
    </nav>`.s;
  root.querySelector('[data-add]').onclick = () => openAdd({ date: current() === 'diary' ? state.diaryDate : ymd() });
}

let rendering = Promise.resolve();
function render() {
  rendering = rendering.then(async () => {
    const r = current();
    const view = document.getElementById('view');
    if (!view) return;
    root.querySelectorAll('[data-tab]').forEach(a => {
      if (a.dataset.tab === r) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    document.title = `${ROUTES[r].label} · ZJTrackerCal`;
    try {
      await ROUTES[r].render(view);
    } catch (err) {
      console.error(err);
      view.innerHTML = html`
        <section class="state-box" role="alert">
          <p class="state-title">เกิดข้อผิดพลาด</p>
          <p class="muted">${err.message || String(err)}</p>
          <button type="button" class="btn btn-primary" data-reload>โหลดใหม่</button>
        </section>`.s;
      view.querySelector('[data-reload]').onclick = () => location.reload();
    }
  });
  return rendering;
}

/* เปิดแอปค้างข้ามวัน → วันนี้เปลี่ยน ให้ Dashboard/Diary ตามมา */
function checkDayRollover() {
  const today = ymd();
  if (today === lastDay) return;
  if (state.diaryDate === lastDay) state.diaryDate = today;
  lastDay = today;
  render();
}

async function boot() {
  try {
    await load();
  } catch (err) {
    root.innerHTML = html`
      <section class="state-box" role="alert">
        <p class="state-title">บันทึกข้อมูลในเครื่องไม่ได้</p>
        <p class="muted">ZJTrackerCal เก็บข้อมูลไว้ในเบราว์เซอร์ แต่ตอนนี้พื้นที่เก็บข้อมูลถูกปิดอยู่ (${err.message || err}) — ถ้าเปิดโหมดส่วนตัว (Private) ใน Safari ให้ปิดแล้วเปิดแอปใหม่</p>
      </section>`.s;
    return;
  }

  if (!state.profile) {
    renderSetup(root, () => {
      buildShell();
      if (location.hash !== '#/dashboard') location.hash = '#/dashboard'; else render();
    });
  } else {
    buildShell();
    render();
  }

  window.addEventListener('hashchange', () => {
    if (!state.profile) return;
    closeAllSheets();
    render().then(() => window.scrollTo(0, 0));
  });
  onChange(() => { if (state.profile && document.getElementById('view')) render(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkDayRollover(); });
}

boot();

/* service worker: เก็บไฟล์ไว้ใช้ออฟไลน์ (ไม่เปิดตอนพัฒนาบน localhost เพื่อไม่ให้ไฟล์เก่าค้าง ยกเว้นใส่ ?sw=1) */
const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
if ('serviceWorker' in navigator && (!isLocal || new URLSearchParams(location.search).has('sw'))) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js').catch(err => console.warn('Service worker not registered', err));
  /* มีเวอร์ชันใหม่ติดตั้งเสร็จ → ให้ผู้ใช้กด Reload เอง (ไม่รีเฟรชทับฟอร์มที่กรอกค้าง) */
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) toast('มีเวอร์ชันใหม่แล้ว', { action: 'โหลดใหม่', onAction: () => location.reload(), ms: 15000 });
  });
}
