#!/usr/bin/env python3
"""เปิด ZJTrackerCal บน Mac ตอนพัฒนา — http://localhost:8010

ทำ 2 อย่าง:
  1. เสิร์ฟไฟล์ในโฟลเดอร์ app/ แบบห้าม cache (แก้โค้ดแล้วรีเฟรชเห็นผลทันที)
  2. เป็น proxy ไป Gemini บนเครื่อง (/api/health, /api/food) — ทำงานเหมือน proxy/worker.js
     อ่าน prompt/schema จาก proxy/worker.js ไฟล์เดียวกัน และอ่าน key จาก .dev.vars (ไม่อยู่ใน git)

วิธีใช้:
  python3 serve.py          เปิดให้เฉพาะเครื่องนี้ (127.0.0.1) — ไม่ต้องใช้ access token
  python3 serve.py --lan    เปิดให้ iPhone ใน Wi-Fi เดียวกันเข้าได้ — ต้องใส่ access token ในแอป
"""
import http.server
import json
import os
import re
import secrets
import sys
import hashlib
import hmac
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.join(ROOT, "app")
PORT = 8010
LAN = "--lan" in sys.argv
HOST = "0.0.0.0" if LAN else "127.0.0.1"
MAX_BODY = 4 * 1024 * 1024
IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/"


def load_tasks():
    src = open(os.path.join(ROOT, "proxy", "worker.js"), encoding="utf-8").read()
    m = re.search(r"/\*TASKS_BEGIN\*/(.*?)/\*TASKS_END\*/", src, re.S)
    return json.loads(m.group(1))


def load_vars():
    out = {}
    path = os.path.join(ROOT, ".dev.vars")
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                out[k.strip()] = v.strip().strip('"').strip("'")
    return out


TASKS = load_tasks()
VARS = load_vars()


def build_request(inp):
    gen = {"temperature": TASKS["temperature"], "responseMimeType": "application/json", "responseSchema": TASKS["schema"]}
    task = inp.get("task") if isinstance(inp, dict) else None
    if task == "photo":
        img = inp.get("image") or {}
        data = img.get("data") if isinstance(img.get("data"), str) else ""
        if img.get("mimeType") not in IMAGE_TYPES or len(data) < 100 or not re.fullmatch(r"[A-Za-z0-9+/]+={0,2}", data):
            return None, "invalid_image"
        return {
            "systemInstruction": {"parts": [{"text": TASKS["photo"]["system"]}]},
            "contents": [{"role": "user", "parts": [{"inlineData": {"mimeType": img["mimeType"], "data": data}}, {"text": TASKS["photo"]["user"]}]}],
            "generationConfig": gen,
        }, None
    if task == "lookup":
        query = inp.get("query").strip()[:120] if isinstance(inp.get("query"), str) else ""
        if not query:
            return None, "invalid_request"
        text = TASKS["lookup"]["user"].replace("{query}", query)
        try:
            grams = float(inp.get("grams") or 0)
        except (TypeError, ValueError):
            grams = 0
        if 0 < grams <= 5000:
            text += f"\nPortion: {round(grams)} g"
        return {
            "systemInstruction": {"parts": [{"text": TASKS["lookup"]["system"]}]},
            "contents": [{"role": "user", "parts": [{"text": text}]}],
            "generationConfig": gen,
        }, None
    return None, "invalid_request"


def parse_answer(ans):
    cands = (ans or {}).get("candidates") or []
    if not cands:
        return None, "blocked" if (ans or {}).get("promptFeedback", {}).get("blockReason") else "bad_response"
    cand = cands[0]
    if cand.get("finishReason") in ("SAFETY", "PROHIBITED_CONTENT"):
        return None, "blocked"
    text = "".join(p.get("text", "") for p in (cand.get("content") or {}).get("parts", []) if not p.get("thought"))
    try:
        data = json.loads(text)
        return (data, None) if isinstance(data, dict) else (None, "bad_response")
    except ValueError:
        return None, "bad_response"


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=APP_DIR, **kw)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        # ไม่ log body — แค่บรรทัด request ปกติ
        sys.stderr.write("  " + (fmt % args) + "\n")

    def send_json(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def same_site(self):
        """กันเว็บอื่นที่เปิดอยู่ในเบราว์เซอร์ยิงมาใช้โควตา: Host ต้องเป็นของเรา (กัน DNS rebinding)
        และถ้าเบราว์เซอร์ส่ง Origin มา ต้องเป็นหน้าแอปเองเท่านั้น"""
        host = (self.headers.get("Host") or "").lower()
        if not LAN and host not in (f"localhost:{PORT}", f"127.0.0.1:{PORT}"):
            return False
        origin = self.headers.get("Origin")
        return origin is None or origin.lower() == f"http://{host}"

    def authorized(self):
        if not LAN:
            return True  # เปิดเฉพาะ 127.0.0.1 — มีแค่เครื่องนี้ที่เข้าได้ (same_site กันเว็บอื่นไว้แล้ว)
        expected = VARS.get("APP_TOKEN", "")
        m = re.match(r"^Bearer\s+(.+)$", self.headers.get("Authorization", ""))
        if not expected or not m:
            return False
        a = hashlib.sha256(m.group(1).strip().encode()).digest()
        b = hashlib.sha256(expected.encode()).digest()
        return hmac.compare_digest(a, b)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/config.js":
            # ตอนพัฒนา: เรียก /api บนเซิร์ฟเวอร์นี้เอง
            body = b"export const CONFIG = { proxyUrl: '', dev: true };\n"
            self.send_response(200)
            self.send_header("Content-Type", "text/javascript; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path.rstrip("/") == "/api/health":
            if not self.same_site():
                return self.send_json(403, {"error": "origin_not_allowed"})
            if not VARS.get("GEMINI_API_KEY"):
                return self.send_json(503, {"error": "not_configured"})
            if not self.authorized():
                return self.send_json(401, {"error": "unauthorized"})
            return self.send_json(200, {"ok": True, "model": self.model()})
        if path.startswith("/api/"):
            return self.send_json(404, {"error": "not_found"})
        super().do_GET()

    def model(self):
        return VARS.get("GEMINI_MODEL") or TASKS["defaultModel"]

    def do_POST(self):
        if self.path.split("?", 1)[0].rstrip("/") != "/api/food":
            return self.send_json(404, {"error": "not_found"})
        if not self.same_site():
            return self.send_json(403, {"error": "origin_not_allowed"})
        if not (self.headers.get("Content-Type") or "").startswith("application/json"):
            return self.send_json(415, {"error": "invalid_request"})
        if not VARS.get("GEMINI_API_KEY"):
            return self.send_json(503, {"error": "not_configured"})
        if not self.authorized():
            return self.send_json(401, {"error": "unauthorized"})
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            return self.send_json(413, {"error": "too_large"})
        try:
            inp = json.loads(self.rfile.read(length) or b"null")
        except ValueError:
            return self.send_json(400, {"error": "invalid_request"})
        body, err = build_request(inp)
        if err:
            return self.send_json(400, {"error": err})

        req = urllib.request.Request(
            GEMINI_URL + self.model() + ":generateContent",
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json", "x-goog-api-key": VARS["GEMINI_API_KEY"]},
        )
        try:
            with urllib.request.urlopen(req, timeout=50) as r:
                ans = json.load(r)
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")
            if e.code == 429:
                return self.send_json(429, {"error": "rate_limited"})
            if e.code == 400 and re.search(r"image|inline_data|mime", detail, re.I):
                return self.send_json(400, {"error": "invalid_image"})
            sys.stderr.write(f"  Gemini {e.code}: {detail[:300]}\n")
            return self.send_json(502, {"error": "upstream_error", "status": e.code})
        except Exception as e:  # noqa: BLE001 — เน็ตหลุด / timeout
            sys.stderr.write(f"  Gemini unreachable: {e}\n")
            return self.send_json(502, {"error": "upstream_unreachable"})
        data, err = parse_answer(ans)
        if err:
            return self.send_json(502, {"error": err})
        data["model"] = self.model()
        return self.send_json(200, data)


if __name__ == "__main__":
    if not VARS.get("GEMINI_API_KEY"):
        print("⚠️  ยังไม่มี .dev.vars — ฟีเจอร์ AI จะขึ้น 'Gemini API unavailable' (ดับเบิลคลิก 'ตั้งค่า Gemini.command' ก่อน)")
    if LAN and not VARS.get("APP_TOKEN"):
        VARS["APP_TOKEN"] = secrets.token_urlsafe(18)
        print(f"ไม่มี APP_TOKEN ใน .dev.vars — ใช้ token ชั่วคราวรอบนี้: {VARS['APP_TOKEN']}")
    where = "iPhone ใน Wi-Fi เดียวกันเปิดได้ที่ http://<IP ของ Mac>:%d" % PORT if LAN else "http://localhost:%d" % PORT
    print(f"ZJTrackerCal → {where}   (Ctrl+C เพื่อปิด)")
    http.server.ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
