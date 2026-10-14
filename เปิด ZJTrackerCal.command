#!/bin/bash
# ดับเบิลคลิกเพื่อเปิด ZJTrackerCal บน Mac (http://localhost:8010)
# ⚠️ อย่าปิดหน้าต่าง Terminal นี้ระหว่างใช้ — ปิดหน้าต่าง = ปิดเว็บ
cd "$(dirname "$0")"
URL="http://localhost:8010/"
if curl -s -o /dev/null -m 2 "$URL"; then
  echo "เปิดอยู่แล้ว — กำลังเปิดเบราว์เซอร์..."; open "$URL"; exit 0
fi
python3 serve.py &
SERVER=$!
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -o /dev/null -m 1 "$URL" && break; sleep 0.5; done
if ! kill -0 "$SERVER" 2>/dev/null; then
  echo "❌ เปิดไม่สำเร็จ — อาจมีโปรแกรมอื่นใช้ port 8010 อยู่"
  read -n 1 -s -r -p "กดปุ่มใดก็ได้เพื่อปิด"; exit 1
fi
open "$URL"
echo; echo "✅ เปิดแล้ว: $URL   (ปิดหน้าต่างนี้ หรือกด Ctrl+C เพื่อปิด)"
wait "$SERVER"
