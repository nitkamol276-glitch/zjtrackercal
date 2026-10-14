/* ZJTrackerCal — Gemini proxy (Cloudflare Worker)
 *
 * ถือ Gemini API key ไว้ฝั่ง server เพื่อไม่ให้ key ไปอยู่ในเว็บหรือบนมือถือ
 * - ต้องมี access token (Authorization: Bearer …) ทุก request
 * - รับแค่ 2 งาน: 'photo' (รูปอาหาร) และ 'lookup' (ชื่ออาหาร) — prompt และ schema กำหนดที่นี่ client แก้ไม่ได้
 * - ไม่มี database ไม่เก็บ log ของรูปหรือชื่ออาหาร
 *
 * Secrets:  GEMINI_API_KEY, APP_TOKEN
 * Vars:     ALLOWED_ORIGINS (คั่นด้วย , เช่น "https://you.github.io,http://localhost:8000"), GEMINI_MODEL (ไม่ใส่ = ค่าเริ่มต้น)
 *
 * serve.py อ่าน TASKS ระหว่าง marker สองตัวนี้ไปใช้ด้วย — ต้องเป็น JSON ล้วน (ไม่มี comment / trailing comma)
 */

const TASKS = /*TASKS_BEGIN*/{
  "defaultModel": "gemini-3.5-flash-lite",
  "temperature": 0.2,
  "schema": {
    "type": "OBJECT",
    "properties": {
      "isFood": { "type": "BOOLEAN" },
      "items": {
        "type": "ARRAY",
        "items": {
          "type": "OBJECT",
          "properties": {
            "name": { "type": "STRING", "description": "Short English name" },
            "nameTh": { "type": "STRING", "description": "Thai name, or empty string" },
            "grams": { "type": "NUMBER", "description": "Estimated portion weight in grams" },
            "kcal": { "type": "NUMBER" },
            "carbs": { "type": "NUMBER", "description": "grams" },
            "protein": { "type": "NUMBER", "description": "grams" },
            "fat": { "type": "NUMBER", "description": "grams" }
          },
          "required": ["name", "nameTh", "grams", "kcal", "carbs", "protein", "fat"]
        }
      },
      "confidence": { "type": "STRING", "enum": ["low", "medium", "high"] },
      "note": { "type": "STRING" }
    },
    "required": ["isFood", "items", "confidence", "note"]
  },
  "photo": {
    "system": "You estimate nutrition for a calorie-tracking app used mostly in Thailand. Look at the photo and list every distinct food or drink that is going to be eaten. For each item estimate the portion that is visible, in grams (for drinks, ml is roughly grams), and the energy (kcal), carbohydrate, protein and fat in grams for that whole portion. Thai dishes are common: recognise them and give their usual Thai name in nameTh and a short English name in name (nameTh is an empty string when there is no common Thai name). Put rice or sticky rice served on the side as its own item. Include cooking oil, coconut milk, sugar and sauces in the dish they belong to. Use plate, bowl, cutlery and hand size to judge portions. If the image shows no food or drink, or is too unclear to identify, set isFood to false and return an empty items list. Set confidence to low when the portion size is hard to judge. note is one short sentence in Thai about the main uncertainty, or an empty string. Never return negative numbers.",
    "user": "Analyse this meal photo."
  },
  "lookup": {
    "system": "You estimate nutrition for a calorie-tracking app used mostly in Thailand. The user typed the name of a food or drink (Thai or English) that is not in the app's database. Return one item for one typical serving as eaten in Thailand, unless the text clearly names several foods, then one item per food. If a portion in grams is given, use exactly that portion. Give the usual Thai name in nameTh and a short English name in name (nameTh is an empty string when there is no common Thai name). Include cooking oil, coconut milk, sugar and sauces in the numbers. If the text is not a food or drink, set isFood to false and return an empty items list. note is one short sentence in Thai about what serving you assumed. Never return negative numbers.",
    "user": "Food: {query}"
  }
}/*TASKS_END*/;

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';
const MAX_BODY = 4 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(origin, env);

    /* เบราว์เซอร์จาก origin ที่ไม่ได้อนุญาต — ปฏิเสธตั้งแต่ต้น */
    if (origin && !cors) return json({ error: 'origin_not_allowed' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors || {} });

    const route = `${request.method} ${url.pathname.replace(/\/+$/, '')}`;
    if (route !== 'GET /api/health' && route !== 'POST /api/food') return json({ error: 'not_found' }, 404, cors);

    if (!env.GEMINI_API_KEY || !env.APP_TOKEN) return json({ error: 'not_configured' }, 503, cors);
    if (!(await tokenOk(request, env.APP_TOKEN))) return json({ error: 'unauthorized' }, 401, cors);

    const model = env.GEMINI_MODEL || TASKS.defaultModel;
    if (route === 'GET /api/health') return json({ ok: true, model }, 200, cors);

    if (Number(request.headers.get('Content-Length') || 0) > MAX_BODY) return json({ error: 'too_large' }, 413, cors);
    let input;
    try {
      const text = await request.text();
      if (text.length > MAX_BODY) return json({ error: 'too_large' }, 413, cors);
      input = JSON.parse(text);
    } catch {
      return json({ error: 'invalid_request' }, 400, cors);
    }

    const built = buildRequest(input);
    if (built.error) return json({ error: built.error }, 400, cors);

    let res;
    try {
      res = await fetch(GEMINI_URL + encodeURIComponent(model) + ':generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify(built.body),
        signal: AbortSignal.timeout(50000),
      });
    } catch {
      return json({ error: 'upstream_unreachable' }, 502, cors);
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      if (res.status === 429) return json({ error: 'rate_limited' }, 429, cors);
      if (res.status === 400 && /image|inline_data|mime/i.test(detail)) return json({ error: 'invalid_image' }, 400, cors);
      return json({ error: 'upstream_error', status: res.status }, 502, cors);
    }

    const out = parseAnswer(await res.json().catch(() => null));
    if (out.error) return json({ error: out.error }, 502, cors);
    return json({ ...out.data, model }, 200, cors);
  },
};

/* ---------- ตรวจ input แล้วสร้าง request ไป Gemini ---------- */

function buildRequest(input) {
  const generationConfig = {
    temperature: TASKS.temperature,
    responseMimeType: 'application/json',
    responseSchema: TASKS.schema,
  };

  if (input && input.task === 'photo') {
    const img = input.image || {};
    const data = typeof img.data === 'string' ? img.data : '';
    if (!IMAGE_TYPES.includes(img.mimeType) || data.length < 100 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
      return { error: 'invalid_image' };
    }
    return { body: {
      systemInstruction: { parts: [{ text: TASKS.photo.system }] },
      contents: [{ role: 'user', parts: [{ inlineData: { mimeType: img.mimeType, data } }, { text: TASKS.photo.user }] }],
      generationConfig,
    } };
  }

  if (input && input.task === 'lookup') {
    const query = typeof input.query === 'string' ? input.query.trim().slice(0, 120) : '';
    if (!query) return { error: 'invalid_request' };
    const grams = Number(input.grams);
    let text = TASKS.lookup.user.replace('{query}', query);
    if (grams > 0 && grams <= 5000) text += `\nPortion: ${Math.round(grams)} g`;
    return { body: {
      systemInstruction: { parts: [{ text: TASKS.lookup.system }] },
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig,
    } };
  }

  return { error: 'invalid_request' };
}

function parseAnswer(answer) {
  const cand = answer && answer.candidates && answer.candidates[0];
  if (!cand) return { error: answer && answer.promptFeedback && answer.promptFeedback.blockReason ? 'blocked' : 'bad_response' };
  if (cand.finishReason === 'SAFETY' || cand.finishReason === 'PROHIBITED_CONTENT') return { error: 'blocked' };
  const text = ((cand.content && cand.content.parts) || []).filter(p => !p.thought && p.text).map(p => p.text).join('');
  try {
    const data = JSON.parse(text);
    return data && typeof data === 'object' ? { data } : { error: 'bad_response' };
  } catch {
    return { error: 'bad_response' };
  }
}

/* ---------- ความปลอดภัย ---------- */

function corsHeaders(origin, env) {
  if (!origin) return null;
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!allowed.includes('*') && !allowed.includes(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

/* เทียบ token แบบใช้เวลาคงที่ (hash ก่อนเพื่อให้ความยาวเท่ากัน) */
async function tokenOk(request, expected) {
  const m = /^Bearer\s+(.+)$/.exec(request.headers.get('Authorization') || '');
  if (!m) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(m[1].trim())),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

function json(data, status = 200, cors = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(cors || {}) },
  });
}
