#!/bin/bash
# ดับเบิลคลิกเพื่อส่ง Gemini proxy ขึ้น Cloudflare Workers (ทำครั้งเดียว หรือเมื่อแก้ proxy/worker.js)
cd "$(dirname "$0")"
echo "════════ ZJTrackerCal · Deploy AI proxy ════════"
ORIGIN_FILE=".pages-origin"
ORIGIN="$(cat "$ORIGIN_FILE" 2>/dev/null)"
if [ -z "$ORIGIN" ]; then
  printf "ที่อยู่เว็บของแอป (เช่น https://yourname.github.io): "; read -r ORIGIN
fi
python3 proxy/deploy.py --origin "$ORIGIN" && echo "$ORIGIN" > "$ORIGIN_FILE"
read -n 1 -s -r -p "กดปุ่มใดก็ได้เพื่อปิด"
