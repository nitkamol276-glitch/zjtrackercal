/* เรียก Gemini ผ่าน proxy (Cloudflare Worker / serve.py) — แอปไม่เคยถือ Gemini API key
   proxy รับแค่ 2 งาน: 'photo' (รูปอาหาร) และ 'lookup' (ชื่ออาหาร) แล้วตอบ JSON รูปแบบเดียวกัน
   ไฟล์นี้: ย่อรูป, เรียก proxy, ตรวจและทำความสะอาดคำตอบ, แปลง error เป็นข้อความที่ผู้ใช้เข้าใจ */

import { CONFIG } from '../config.js';
import { getKV } from './db.js';
import { round1 } from './calc.js';

const MAX_SIDE = 1024;       // px — พอให้ Gemini เห็นชัด และส่งเร็วบนมือถือ
const JPEG_QUALITY = 0.82;
const TIMEOUT_MS = 60000;

export const ERROR_TITLES = {
  unavailable: 'Gemini API unavailable',
  invalid_image: 'Invalid image',
  api: 'API error',
  unidentified: 'Unable to identify food',
};

export class AiError extends Error {
  constructor(kind, message, { settings = false } = {}) {
    super(message);
    this.kind = kind;
    this.title = ERROR_TITLES[kind];
    this.settings = settings;   // true = ปุ่ม "เปิดหน้าตั้งค่า AI" ช่วยได้
  }
}

/* ---------- การเชื่อมต่อ ---------- */

export async function connection() {
  const ai = await getKV('ai', {}) || {};
  const base = String(ai.proxyUrl || CONFIG.proxyUrl || '').trim().replace(/\/+$/, '');
  return { base, token: String(ai.token || '').trim(), sameOrigin: !base };
}

/* ตั้งค่าแล้วหรือยัง: ต้องมี proxy (หรือรันผ่าน serve.py บนเครื่อง) และมี token เมื่อใช้ proxy ภายนอก */
export async function isConfigured() {
  const c = await connection();
  return c.sameOrigin ? !!CONFIG.dev : !!c.token;
}

async function call(path, { method = 'GET', body, signal } = {}) {
  const c = await connection();
  if (!c.sameOrigin && !c.token) {
    throw new AiError('unavailable', 'เครื่องนี้ยังไม่ได้เชื่อมต่อ AI — ใส่ access token ที่ Profile → AI connection', { settings: true });
  }
  if (c.sameOrigin && !CONFIG.dev) {
    throw new AiError('unavailable', 'แอปนี้ยังไม่มีที่อยู่ AI server — ใส่ Proxy URL ที่ Profile → AI connection', { settings: true });
  }
  if (!navigator.onLine) throw new AiError('unavailable', 'ตอนนี้ไม่ได้ต่ออินเทอร์เน็ต — ต่อเน็ตแล้วลองใหม่');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort('timeout'), TIMEOUT_MS);
  if (signal) signal.addEventListener('abort', () => ctrl.abort('cancel'), { once: true });

  let res, data = null;
  try {
    res = await fetch(c.base + path, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(c.token ? { Authorization: `Bearer ${c.token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
      cache: 'no-store',
    });
    try { data = await res.json(); } catch { /* ไม่ใช่ JSON หรือถูกยกเลิกระหว่างอ่าน */ }
  } catch {
    /* ตกลงไปเช็กด้านล่าง */
  } finally {
    clearTimeout(timer);
  }
  if (ctrl.signal.aborted && ctrl.signal.reason === 'cancel') throw new AiError('cancelled', 'Cancelled');
  if (ctrl.signal.aborted) throw new AiError('api', 'Gemini ตอบช้าเกินไป — ลองใหม่อีกครั้ง');
  if (!res) throw new AiError('unavailable', 'ติดต่อ AI server ไม่ได้ — ตรวจอินเทอร์เน็ต หรือดูว่า server อนุญาตที่อยู่เว็บของแอปนี้แล้ว');
  if (res.ok && data) return data;

  const code = data && data.error;
  if (res.status === 401) throw new AiError('unavailable', 'access token ไม่ถูกต้อง — ตรวจอีกครั้งที่ Profile → AI connection', { settings: true });
  if (res.status === 403) throw new AiError('unavailable', 'AI server ไม่อนุญาตที่อยู่เว็บของแอปนี้', { settings: true });
  if (res.status === 404 || res.status === 405) throw new AiError('unavailable', 'ที่อยู่ AI server ไม่ถูกต้อง — ตรวจอีกครั้งที่ Profile → AI connection', { settings: true });
  if (res.status === 503 || code === 'not_configured') throw new AiError('unavailable', 'AI server ยังไม่ได้ตั้ง Gemini key');
  if (code === 'invalid_image') throw new AiError('invalid_image', 'Gemini อ่านรูปนี้ไม่ได้ — ลองรูปที่ชัดกว่านี้ (JPEG หรือ PNG)');
  if (res.status === 413) throw new AiError('invalid_image', 'รูปใหญ่เกินไป — ลองรูปอื่น');
  if (res.status === 429 || code === 'rate_limited') throw new AiError('api', 'โควตาฟรีของ Gemini หมดชั่วคราว — รอสักนาทีแล้วลองใหม่ หรือพรุ่งนี้ถ้าใช้ครบโควตาของวันแล้ว');
  if (code === 'blocked') throw new AiError('api', 'Gemini ปฏิเสธคำขอนี้ — ลองรูปหรือชื่ออื่น');
  throw new AiError('api', `Gemini ตอบกลับผิดพลาด${res.status ? ` (${res.status})` : ''} — ลองใหม่อีกครั้ง`);
}

export async function testConnection() {
  return call('/api/health');
}

/* ---------- รูป ---------- */

async function decode(file) {
  try {
    return await createImageBitmap(file);
  } catch {
    /* Safari บางรุ่นอ่าน HEIC ผ่าน createImageBitmap ไม่ได้ → ลองผ่าน <img> */
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/* ย่อรูปให้ด้านยาวสุด ≤ 1024px แล้ววาดใหม่เป็น JPEG — metadata (GPS ฯลฯ) หายไปด้วย */
export async function prepareImage(file) {
  const looksLikeImage = file && (/^image\//.test(file.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name || ''));
  if (!looksLikeImage) throw new AiError('invalid_image', 'ไฟล์นี้ไม่ใช่รูปภาพ — เลือกไฟล์ JPEG, PNG หรือ HEIC');
  let src;
  try { src = await decode(file); }
  catch { throw new AiError('invalid_image', 'เปิดรูปนี้ไม่ได้ — ลองถ่ายใหม่อีกครั้ง'); }
  const w = src.width, h = src.height;
  if (!w || !h || Math.min(w, h) < 64) throw new AiError('invalid_image', 'รูปเล็กเกินไป วิเคราะห์ไม่ได้');
  const k = Math.min(1, MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * k);
  canvas.height = Math.round(h * k);
  canvas.getContext('2d').drawImage(src, 0, 0, canvas.width, canvas.height);
  if (src.close) src.close();
  const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', JPEG_QUALITY));
  if (!blob) throw new AiError('invalid_image', 'ประมวลผลรูปนี้ไม่ได้');
  const dataUrl = await new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(blob);
  });
  return { mimeType: 'image/jpeg', data: String(dataUrl).split(',')[1], previewUrl: dataUrl };
}

/* ---------- คำตอบ ---------- */

const clampNum = (v, max) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0;
};

/* ไม่เชื่อคำตอบจากภายนอกตรงๆ: ตัดค่าติดลบ/เกินจริง ตัดชื่อยาวเกิน */
export function normalize(data) {
  const items = Array.isArray(data && data.items) ? data.items : [];
  const clean = items.slice(0, 12).map(it => {
    const en = String(it.name || '').trim().slice(0, 80);
    const th = String(it.nameTh || '').trim().slice(0, 80);
    return {
      name: th || en || 'Food',
      nameEn: th && en && th !== en ? en : '',
      grams: Math.round(clampNum(it.grams, 5000)),
      kcal: Math.round(clampNum(it.kcal, 10000)),
      carbs: round1(clampNum(it.carbs, 2000)),
      protein: round1(clampNum(it.protein, 2000)),
      fat: round1(clampNum(it.fat, 2000)),
    };
  }).filter(it => it.kcal > 0 || it.grams > 0);
  const conf = ['low', 'medium', 'high'].includes(data && data.confidence) ? data.confidence : 'low';
  return { isFood: !!(data && data.isFood) && clean.length > 0, items: clean, confidence: conf, note: String((data && data.note) || '').slice(0, 200) };
}

export async function analyzePhoto(image, { signal } = {}) {
  const data = await call('/api/food', { method: 'POST', body: { task: 'photo', image: { mimeType: image.mimeType, data: image.data } }, signal });
  const out = normalize(data);
  if (!out.isFood) throw new AiError('unidentified', 'Gemini หาอาหารในรูปนี้ไม่เจอ — ลองถ่ายใกล้ขึ้น สว่างขึ้น หรือกรอกเอง');
  return out;
}

export async function lookupFood(query, { grams, signal } = {}) {
  const body = { task: 'lookup', query: String(query).trim().slice(0, 120) };
  if (grams > 0) body.grams = Math.round(grams);
  const data = await call('/api/food', { method: 'POST', body, signal });
  const out = normalize(data);
  if (!out.isFood) throw new AiError('unidentified', `Gemini ไม่รู้จัก “${body.query}” ว่าเป็นอาหาร — ตรวจตัวสะกด หรือเพิ่มเองด้วย Quick Add`);
  return out;
}
