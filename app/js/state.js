/* สถานะกลางของแอป: profile, เป้าหมาย, และการแจ้งให้หน้าจอวาดใหม่เมื่อข้อมูลเปลี่ยน */

import * as db from './db.js';
import { effectiveGoals, ymd } from './calc.js';

export const state = {
  profile: null,
  goals: {},          // { kcalOverride, macrosOverride, macros }
  diaryDate: ymd(),
};

export async function load() {
  state.profile = await db.getKV('profile');
  state.goals = await db.getKV('goals', {}) || {};
}

export const targets = () => effectiveGoals(state.profile, state.goals);

const listeners = new Set();
export const onChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export function changed() { for (const fn of listeners) fn(); }

export async function saveProfile(next) {
  state.profile = await db.setKV('profile', { ...state.profile, ...next });
  changed();
}

export async function saveGoals(next) {
  state.goals = await db.setKV('goals', { ...state.goals, ...next });
  changed();
}

/* บันทึกน้ำหนัก (1 ค่าต่อวัน) — ถ้าเป็นค่าล่าสุด profile ใช้ค่านี้คำนวณเป้าใหม่ด้วย
   คืนเป้าแคลอรี่ก่อน/หลัง เพื่อบอกผู้ใช้เมื่อเป้าเปลี่ยน */
export async function logWeight(date, kg) {
  const before = targets().kcal;
  await db.put('weights', { date, kg });
  const latest = await db.latestWeight(ymd());
  if (latest && latest.kg !== state.profile.weightKg) {
    state.profile = await db.setKV('profile', { ...state.profile, weightKg: latest.kg });
  }
  changed();
  return { before, after: targets().kcal };
}
