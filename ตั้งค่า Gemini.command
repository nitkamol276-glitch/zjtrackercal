#!/bin/bash
# ดับเบิลคลิกครั้งเดียว: สร้างไฟล์ .dev.vars (Gemini key + access token) — ไฟล์นี้ไม่ถูก commit
# ถ้ามี key ของ MonthlyCalculator อยู่แล้ว (../local/ai-config.js) จะถามว่าใช้ตัวเดิมไหม
cd "$(dirname "$0")"
echo "════════ ZJTrackerCal · ตั้งค่า Gemini ════════"
python3 - <<'PY'
import json, os, re, secrets, getpass, urllib.request, urllib.error

def read_vars():
    out = {}
    if os.path.exists(".dev.vars"):
        for line in open(".dev.vars"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1); out[k.strip()] = v.strip()
    return out

cur = read_vars()
key = cur.get("GEMINI_API_KEY", "")
if key:
    if input("มี Gemini key อยู่แล้ว — ใช้ตัวเดิม? [Y/n] ").strip().lower() == "n":
        key = ""
if not key and os.path.exists("../local/ai-config.js"):
    m = re.search(r"=\s*(\{.*\})\s*;", open("../local/ai-config.js").read())
    old = json.loads(m.group(1)).get("key", "") if m else ""
    if old and input("พบ key ของ MonthlyCalculator — ใช้ตัวเดียวกัน? [Y/n] ").strip().lower() != "n":
        key = old
if not key:
    print("ขอ key ฟรีได้ที่ https://aistudio.google.com/apikey (ไม่ต้องผูกบัตร)")
    key = getpass.getpass("วาง key (ตัวอักษรจะไม่แสดง): ").strip()
if not key:
    raise SystemExit("❌ ยังไม่ได้ใส่ key")

req = urllib.request.Request("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", headers={"x-goog-api-key": key})
try:
    urllib.request.urlopen(req, timeout=20)
    print("✅ key ใช้งานได้")
except urllib.error.HTTPError as e:
    raise SystemExit(f"❌ Google ไม่รับ key นี้ ({e.code}) — สร้างใหม่ที่ https://aistudio.google.com/apikey")

alphabet = "abcdefghjkmnpqrstuvwxyz23456789"
token = cur.get("APP_TOKEN") or "-".join("".join(secrets.choice(alphabet) for _ in range(5)) for _ in range(5))
model = cur.get("GEMINI_MODEL") or "gemini-3.5-flash-lite"
with open(".dev.vars", "w") as f:
    f.write("# เฉพาะเครื่องนี้ — ห้าม commit (อยู่ใน .gitignore)\n")
    f.write(f"GEMINI_API_KEY={key}\nAPP_TOKEN={token}\nGEMINI_MODEL={model}\n")
os.chmod(".dev.vars", 0o600)
print("✅ บันทึก .dev.vars แล้ว")
print(f"\nAccess token (ใช้วางในแอปบน iPhone หลัง deploy proxy):\n   {token}\n")
PY
read -n 1 -s -r -p "กดปุ่มใดก็ได้เพื่อปิด"
