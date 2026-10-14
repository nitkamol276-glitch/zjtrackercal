/* IndexedDB — ข้อมูลทั้งหมดของผู้ใช้อยู่ที่นี่ บนเครื่องเท่านั้น
   stores: kv (profile/goals/ai/prefs) · meals · activities · weights (key = date) · foods (อาหารที่ผู้ใช้บันทึกไว้) */

const DB_NAME = 'zjtrackercal';
const DB_VERSION = 1;
export const STORES = ['kv', 'meals', 'activities', 'weights', 'foods'];

let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' });
      for (const name of ['meals', 'activities']) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' }).createIndex('date', 'date');
        }
      }
      if (!db.objectStoreNames.contains('weights')) db.createObjectStore('weights', { keyPath: 'date' });
      if (!db.objectStoreNames.contains('foods')) db.createObjectStore('foods', { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const db = req.result;
      /* อีกแท็บอัปเกรดฐานข้อมูล → ปิดของเราแล้วเปิดใหม่ครั้งหน้า */
      db.onversionchange = () => { db.close(); dbp = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('แอปเปิดค้างอยู่อีกแท็บ ปิดแท็บนั้นแล้วลองใหม่'));
  });
  return dbp;
}

const done = req => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
const txDone = tx => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });

async function store(name, mode = 'readonly') {
  const db = await open();
  return db.transaction(name, mode).objectStore(name);
}

export function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
}

/* ---------- key-value ---------- */

export async function getKV(key, fallback = null) {
  const row = await done((await store('kv')).get(key));
  return row ? row.value : fallback;
}

export async function setKV(key, value) {
  await done((await store('kv', 'readwrite')).put({ key, value }));
  return value;
}

/* ---------- รายการทั่วไป ---------- */

export async function put(name, row) {
  const now = Date.now();
  const rec = { ...row, updatedAt: now, createdAt: row.createdAt || now };
  if (name !== 'weights' && !rec.id) rec.id = uid();
  await done((await store(name, 'readwrite')).put(rec));
  return rec;
}

export async function putMany(name, rows) {
  const db = await open();
  const tx = db.transaction(name, 'readwrite');
  const s = tx.objectStore(name);
  const now = Date.now();
  const out = rows.map(r => {
    const rec = { ...r, createdAt: r.createdAt || now, updatedAt: now };
    if (name !== 'weights' && !rec.id) rec.id = uid();
    return rec;
  });
  for (const r of out) s.put(r);
  await txDone(tx);
  return out;
}

export async function get(name, key) {
  return done((await store(name)).get(key));
}

export async function remove(name, key) {
  await done((await store(name, 'readwrite')).delete(key));
}

export async function all(name) {
  return done((await store(name)).getAll());
}

export async function byDate(name, date) {
  const s = await store(name);
  const rows = await done(s.index('date').getAll(date));
  return rows.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

export async function byDateRange(name, from, to) {
  const s = await store(name);
  if (name === 'weights') return done(s.getAll(IDBKeyRange.bound(from, to)));
  return done(s.index('date').getAll(IDBKeyRange.bound(from, to)));
}

/* น้ำหนักล่าสุด (ถึงวันที่กำหนด) */
export async function latestWeight(upTo = '9999-12-31') {
  const s = await store('weights');
  return new Promise((resolve, reject) => {
    const req = s.openCursor(IDBKeyRange.upperBound(upTo), 'prev');
    req.onsuccess = () => resolve(req.result ? req.result.value : null);
    req.onerror = () => reject(req.error);
  });
}

/* ---------- backup ---------- */

export async function exportAll() {
  const data = {};
  for (const name of STORES) data[name] = await all(name);
  /* token ของ AI เป็นของเครื่องนี้ ไม่ใส่ในไฟล์ backup */
  data.kv = data.kv.filter(r => r.key !== 'ai');
  return { app: 'ZJTrackerCal', version: DB_VERSION, exportedAt: new Date().toISOString(), data };
}

/* ตรวจทุก field ที่แอปอ่าน — ไฟล์ที่ผ่านต้องไม่ทำให้หน้าไหนพังหลัง import */
const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isStr = v => typeof v === 'string' && v.trim() !== '';
const isNum = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const MEAL_IDS = ['breakfast', 'lunch', 'dinner', 'snack'];
const ROW_CHECKS = {
  kv: r => isStr(r.key),
  meals: r => isStr(r.id) && isDate(r.date) && MEAL_IDS.includes(r.meal) && isStr(r.name)
    && ['grams', 'kcal', 'carbs', 'protein', 'fat'].every(k => isNum(r[k])),
  activities: r => isStr(r.id) && isDate(r.date) && isStr(r.label) && isNum(r.kcal) && isNum(r.minutes),
  weights: r => isDate(r.date) && isNum(r.kg) && r.kg > 0,
  foods: r => isStr(r.id) && isStr(r.th) && ['grams', 'kcal', 'carbs', 'protein', 'fat'].every(k => isNum(r[k])),
};

export function validateBackup(obj) {
  if (!obj || obj.app !== 'ZJTrackerCal' || !obj.data || typeof obj.data !== 'object') return 'ไฟล์นี้ไม่ใช่ข้อมูลสำรองของ ZJTrackerCal';
  for (const name of STORES) {
    const rows = obj.data[name];
    if (rows === undefined) continue;
    if (!Array.isArray(rows)) return `ไฟล์สำรองเสียหาย (${name})`;
    const i = rows.findIndex(r => !r || typeof r !== 'object' || !ROW_CHECKS[name](r));
    if (i >= 0) return `ไฟล์สำรองมีข้อมูลผิดพลาดใน ${name} (แถวที่ ${i + 1}) — ข้อมูลเดิมไม่เปลี่ยน`;
  }
  const profile = (obj.data.kv || []).find(r => r.key === 'profile');
  const p = profile && profile.value;
  if (!p || !isNum(p.weightKg) || !isNum(p.heightCm) || !isNum(p.age)) return 'ไฟล์สำรองไม่มีโปรไฟล์ที่ถูกต้อง — ข้อมูลเดิมไม่เปลี่ยน';
  return null;
}

/* แทนที่ข้อมูลทั้งหมด (คง token AI ของเครื่องนี้ไว้) */
export async function importAll(obj) {
  const keepAi = await getKV('ai');
  const db = await open();
  const tx = db.transaction(STORES, 'readwrite');
  const finished = txDone(tx);
  /* ผิดพลาดแถวไหน = ยกเลิกทั้งก้อน ข้อมูลเดิมยังอยู่ครบ */
  try {
    for (const name of STORES) {
      const s = tx.objectStore(name);
      s.clear();
      for (const row of obj.data[name] || []) {
        if (name === 'kv' && row.key === 'ai') continue;
        s.put(row);
      }
    }
    if (keepAi) tx.objectStore('kv').put({ key: 'ai', value: keepAi });
  } catch (err) {
    tx.abort();
    await finished.catch(() => {});
    throw err;
  }
  await finished;
}

export async function resetAll() {
  const db = await open();
  const tx = db.transaction(STORES, 'readwrite');
  for (const name of STORES) tx.objectStore(name).clear();
  await txDone(tx);
}

/* ขอให้ iOS/เบราว์เซอร์ไม่ล้างข้อมูลเองเมื่อพื้นที่เหลือน้อย */
export async function requestPersist() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch { /* เบราว์เซอร์ไม่รองรับ — ไม่เป็นไร */ }
  return false;
}
