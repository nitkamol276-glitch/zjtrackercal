#!/usr/bin/env python3
"""ส่ง proxy/worker.js ขึ้น Cloudflare Workers (ฟรี) ผ่าน Cloudflare API — ไม่ต้องติดตั้ง Node/wrangler

ต้องมี:
  1. บัญชี Cloudflare (ฟรี)
  2. API token: dash.cloudflare.com/profile/api-tokens → Create Token → template "Edit Cloudflare Workers"
  3. ไฟล์ .dev.vars (มี GEMINI_API_KEY, APP_TOKEN) — สร้างด้วย "ตั้งค่า Gemini.command"

วิธีใช้:
  python3 proxy/deploy.py --origin https://<github-user>.github.io

สิ่งที่สคริปต์ทำ:
  - อัปโหลด worker.js พร้อม secret (GEMINI_API_KEY, APP_TOKEN) — key ถูกเก็บเข้ารหัสใน Cloudflare
  - สร้าง Durable Object "GeminiRelay" (ตั้งอยู่ในสหรัฐฯ) ไว้ส่งคำขอไป Gemini — กันปัญหา Cloudflare สาขาฮ่องกง
    ที่ Google ไม่เปิดให้ใช้ Gemini API
  - เปิด URL แบบ *.workers.dev แล้วทดสอบ /api/health ด้วย token
  - เขียน URL ลง app/config.js (ไม่ใช่ความลับ) — commit + push แล้วแอปบน iPhone จะรู้ที่อยู่ proxy เอง
"""
import argparse
import getpass
import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = "https://api.cloudflare.com/client/v4"
NAME = "zjtrackercal-proxy"
COMPAT_DATE = "2025-09-01"
RELAY_CLASS = "GeminiRelay"
MIGRATION_TAG = "v1-relay"


def fail(msg):
    print("❌ " + msg)
    sys.exit(1)


def load_vars():
    path = os.path.join(ROOT, ".dev.vars")
    if not os.path.exists(path):
        fail("ไม่พบ .dev.vars — ดับเบิลคลิก 'ตั้งค่า Gemini.command' ก่อน")
    out = {}
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    for k in ("GEMINI_API_KEY", "APP_TOKEN"):
        if not out.get(k):
            fail(f".dev.vars ไม่มี {k} — รัน 'ตั้งค่า Gemini.command' ใหม่")
    return out


def call(token, method, path, body=None, headers=None, raw=None):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    h = {"Authorization": f"Bearer {token}"}
    if body is not None:
        h["Content-Type"] = "application/json"
    h.update(headers or {})
    req = urllib.request.Request(API + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        try:
            return json.load(e)
        except ValueError:
            return {"success": False, "errors": [{"message": f"HTTP {e.code}"}]}


def errors(res):
    return "; ".join(e.get("message", "") for e in res.get("errors") or []) or "unknown error"


def multipart(parts):
    boundary = "----zjtrackercal" + uuid.uuid4().hex
    out = b""
    for name, filename, ctype, content in parts:
        out += f"--{boundary}\r\n".encode()
        disp = f'form-data; name="{name}"' + (f'; filename="{filename}"' if filename else "")
        out += f"Content-Disposition: {disp}\r\nContent-Type: {ctype}\r\n\r\n".encode()
        out += content + b"\r\n"
    out += f"--{boundary}--\r\n".encode()
    return out, f"multipart/form-data; boundary={boundary}"


def main():
    ap = argparse.ArgumentParser(description="Deploy the ZJTrackerCal Gemini proxy to Cloudflare Workers")
    ap.add_argument("--origin", action="append", required=True,
                    help="เว็บที่อนุญาตให้เรียก proxy เช่น https://you.github.io (ใส่ซ้ำได้หลายค่า)")
    args = ap.parse_args()
    origins = [o.rstrip("/") for o in args.origin]
    for o in origins:
        if not o.startswith("https://") or o.count("/") > 2:
            fail(f"origin ต้องเป็นแค่ https://โดเมน (ไม่มี path) — ได้ '{o}'")

    v = load_vars()
    token = os.environ.get("CLOUDFLARE_API_TOKEN") or getpass.getpass("วาง Cloudflare API token (ตัวอักษรจะไม่แสดง): ").strip()
    if not token:
        fail("ยังไม่ได้ใส่ token")

    res = call(token, "GET", "/user/tokens/verify")
    if not res.get("success"):
        fail("Cloudflare ไม่รับ token นี้: " + errors(res))

    res = call(token, "GET", "/accounts?per_page=50")
    accounts = res.get("result") or []
    if not accounts:
        fail("token นี้มองไม่เห็นบัญชีไหนเลย — สร้าง token ใหม่จาก template 'Edit Cloudflare Workers'")
    account = accounts[0]
    if len(accounts) > 1:
        for i, a in enumerate(accounts, 1):
            print(f"  {i}. {a['name']}")
        account = accounts[int(input("เลือกบัญชี (ตัวเลข): ").strip()) - 1]
    acc = account["id"]
    print(f"✅ บัญชี: {account['name']}")

    worker_src = open(os.path.join(ROOT, "proxy", "worker.js"), "rb").read()
    metadata = {
        "main_module": "worker.js",
        "compatibility_date": COMPAT_DATE,
        "bindings": [
            {"type": "plain_text", "name": "ALLOWED_ORIGINS", "text": ",".join(origins)},
            {"type": "plain_text", "name": "GEMINI_MODEL", "text": v.get("GEMINI_MODEL", "")},
            {"type": "secret_text", "name": "GEMINI_API_KEY", "text": v["GEMINI_API_KEY"]},
            {"type": "secret_text", "name": "APP_TOKEN", "text": v["APP_TOKEN"]},
            {"type": "durable_object_namespace", "name": "RELAY", "class_name": RELAY_CLASS},
        ],
    }
    # Durable Object ต้องมี migration ครั้งแรกที่สร้าง class (แผนฟรีใช้แบบ SQLite) — deploy ครั้งต่อไปไม่ต้องส่งซ้ำ
    res = call(token, "GET", f"/accounts/{acc}/workers/scripts")
    current = next((s for s in res.get("result") or [] if s.get("id") == NAME), None)
    tag = (current or {}).get("migration_tag")
    if tag != MIGRATION_TAG:
        migration = {"new_tag": MIGRATION_TAG, "new_sqlite_classes": [RELAY_CLASS]}
        if tag:
            migration["old_tag"] = tag
        metadata["migrations"] = migration
    body, ctype = multipart([
        ("metadata", None, "application/json", json.dumps(metadata).encode()),
        ("worker.js", "worker.js", "application/javascript+module", worker_src),
    ])
    res = call(token, "PUT", f"/accounts/{acc}/workers/scripts/{NAME}", raw=body, headers={"Content-Type": ctype})
    if not res.get("success"):
        fail("อัปโหลด worker ไม่สำเร็จ: " + errors(res))
    print(f"✅ อัปโหลด {NAME} แล้ว (key อยู่ใน Cloudflare แบบเข้ารหัส · ส่งคำขอ Gemini ผ่านสหรัฐฯ)")

    res = call(token, "GET", f"/accounts/{acc}/workers/subdomain")
    sub = (res.get("result") or {}).get("subdomain")
    if not sub:
        fail("บัญชีนี้ยังไม่มีชื่อ workers.dev — เปิด dash.cloudflare.com → Workers & Pages ครั้งหนึ่งเพื่อตั้งชื่อ แล้วรันสคริปต์นี้อีกครั้ง")
    res = call(token, "POST", f"/accounts/{acc}/workers/scripts/{NAME}/subdomain", {"enabled": True, "previews_enabled": False})
    if not res.get("success"):
        fail("เปิด URL workers.dev ไม่สำเร็จ: " + errors(res))
    url = f"https://{NAME}.{sub}.workers.dev"

    print(f"… ทดสอบ {url}/api/health")
    ok = False
    for _ in range(12):
        try:
            req = urllib.request.Request(url + "/api/health", headers={"Authorization": f"Bearer {v['APP_TOKEN']}"})
            with urllib.request.urlopen(req, timeout=15) as r:
                ok = json.load(r).get("ok") is True
                if ok:
                    break
        except Exception:  # noqa: BLE001 — URL ใหม่อาจใช้เวลาสักครู่
            pass
        time.sleep(5)
    if not ok:
        print("⚠️  ยังเรียก proxy ไม่ติด (URL ใหม่อาจใช้เวลา 1–2 นาที) — ลองกด Test connection ในแอปทีหลังได้")
    else:
        print("✅ proxy ตอบกลับแล้ว")

    with open(os.path.join(ROOT, "app", "config.js"), "w") as f:
        f.write(f"export const CONFIG = {{ proxyUrl: '{url}', dev: false }};\n")
    print(f"✅ เขียน URL ลง app/config.js แล้ว")
    print("\nขั้นถัดไป:")
    print("  1. commit + push (GitHub Pages จะอัปเดตเว็บเอง)")
    print("  2. บน iPhone: เปิดแอปจากหน้าจอโฮม → Profile → AI connection → วาง access token นี้:")
    print(f"\n     {v['APP_TOKEN']}\n")


if __name__ == "__main__":
    main()
