"""ทดสอบ proxy/worker.js ใน Chrome โดยจำลอง Gemini (ไม่ต้องมีบัญชี Cloudflare ไม่เรียก Gemini จริง)
รัน: .venv/bin/python tests/worker_test.py   (ต้องเปิด serve.py ไว้ — ใช้แค่เป็นหน้าเว็บ secure context)
"""
import json
import os
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = open(os.path.join(ROOT, "proxy", "worker.js"), encoding="utf-8").read()

TEST = r"""
async (src) => {
  /* timingSafeEqual มีแค่ใน Cloudflare → จำลองให้ Chrome */
  crypto.subtle.timingSafeEqual = (a, b) => { const x = new Uint8Array(a), y = new Uint8Array(b); if (x.length !== y.length) return false; let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i]; return d === 0; };
  const W = (await import(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })))).default;
  const env = { GEMINI_API_KEY: 'k-test', APP_TOKEN: 'secret-token', ALLOWED_ORIGINS: 'https://me.github.io' };
  const out = {};
  let last = null, reply = null;
  window.fetch = async (url, init) => { last = { url, init }; return reply(); };
  /* เบราว์เซอร์ห้ามตั้ง Origin เอง → ใช้ request จำลองที่มีแค่สิ่งที่ worker อ่าน */
  const req = (path, { method = 'GET', origin, token, body } = {}) => {
    const h = new Map(Object.entries({ ...(origin ? { origin } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}),
      ...(body ? { 'content-type': 'application/json', 'content-length': String(JSON.stringify(body).length) } : {}) }));
    return { url: 'https://proxy.example' + path, method, headers: { get: k => h.get(k.toLowerCase()) ?? null }, text: async () => body ? JSON.stringify(body) : '' };
  };
  const run = async (name, r, e = env) => { const res = await W.fetch(r, e); let j = null; try { j = await res.clone().json(); } catch {} out[name] = { status: res.status, body: j, acao: res.headers.get('Access-Control-Allow-Origin') }; };
  const T = 'secret-token', O = 'https://me.github.io';
  const lookup = q => ({ method: 'POST', token: T, body: { task: 'lookup', query: q } });
  const photo = { method: 'POST', token: T, body: { task: 'photo', image: { mimeType: 'image/jpeg', data: 'QUJD'.repeat(50) } } };

  await run('preflight_ok', req('/api/food', { method: 'OPTIONS', origin: O }));
  await run('origin_bad', req('/api/health', { origin: 'https://evil.example', token: T }));
  await run('no_token', req('/api/health', { origin: O }));
  await run('wrong_token', req('/api/health', { origin: O, token: 'nope' }));
  await run('health', req('/api/health', { origin: O, token: T }));
  await run('not_configured', req('/api/health', { token: T }), { ...env, GEMINI_API_KEY: '' });
  await run('unknown_route', req('/api/chat', lookup('x')));
  await run('bad_task', req('/api/food', { method: 'POST', token: T, body: { task: 'chat', prompt: 'write a poem' } }));
  await run('bad_image', req('/api/food', { method: 'POST', token: T, body: { task: 'photo', image: { mimeType: 'image/jpeg', data: 'not base64!!' } } }));
  await run('bad_mime', req('/api/food', { method: 'POST', token: T, body: { task: 'photo', image: { mimeType: 'text/html', data: 'A'.repeat(200) } } }));

  reply = () => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: 'thinking' }, { text: '{"isFood":true,"items":[{"name":"Pad thai","nameTh":"ผัดไทย","grams":250,"kcal":550,"carbs":70,"protein":20,"fat":20}],"confidence":"high","note":"ประมาณ 1 จาน"}' }] } }] }));
  await run('lookup_ok', req('/api/food', { ...lookup('ผัดไทย'), origin: O, body: { task: 'lookup', query: 'ผัดไทย', grams: 300 } }));
  const sent = JSON.parse(last.init.body);
  out.gemini_call = { key: last.init.headers['x-goog-api-key'], hasSchema: !!sent.generationConfig.responseSchema, user: sent.contents[0].parts[0].text, thaiNote: /note is one short sentence in Thai/.test(sent.systemInstruction.parts[0].text) };
  await run('photo_ok', req('/api/food', photo));
  out.photo_parts = Object.keys(JSON.parse(last.init.body).contents[0].parts[0]);

  reply = () => new Response('{}', { status: 429 });
  await run('rate_limited', req('/api/food', lookup('rice')));
  reply = () => new Response('{"error":{"message":"Unable to process input image"}}', { status: 400 });
  await run('gemini_bad_image', req('/api/food', photo));
  reply = () => new Response(JSON.stringify({ candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }] }));
  await run('blocked', req('/api/food', lookup('rice')));
  reply = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] }));
  await run('bad_json', req('/api/food', lookup('rice')));
  reply = () => { throw new TypeError('network'); };
  await run('unreachable', req('/api/food', lookup('rice')));
  return out;
}
"""

with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True)
    page = b.new_page()
    page.goto("http://127.0.0.1:8010/__blank")  # หน้า 404 ของ serve.py: secure context และไม่มี CSP ของแอป
    r = page.evaluate(TEST, SRC)
    b.close()

expect = {'preflight_ok': 204, 'origin_bad': 403, 'no_token': 401, 'wrong_token': 401, 'health': 200, 'not_configured': 503,
          'unknown_route': 404, 'bad_task': 400, 'bad_image': 400, 'bad_mime': 400, 'lookup_ok': 200, 'photo_ok': 200,
          'rate_limited': 429, 'gemini_bad_image': 400, 'blocked': 502, 'bad_json': 502, 'unreachable': 502}
fails = [f"{k}: {r[k]['status']} (ควรเป็น {s})" for k, s in expect.items() if r[k]['status'] != s]
if r['preflight_ok']['acao'] != 'https://me.github.io' or r['health']['acao'] != 'https://me.github.io':
    fails.append("CORS header ไม่ถูก")
c = r['gemini_call']
if not (c['key'] == 'k-test' and c['hasSchema'] and 'Portion: 300 g' in c['user'] and c['thaiNote']):
    fails.append(f"request ไป Gemini ไม่ถูก: {json.dumps(c, ensure_ascii=False)}")
if r['photo_parts'] != ['inlineData'] or r['lookup_ok']['body']['items'][0]['kcal'] != 550:
    fails.append("ส่งรูป/อ่านคำตอบไม่ถูก")
print("worker:", "ผ่านทั้งหมด" if not fails else fails)
raise SystemExit(1 if fails else 0)
