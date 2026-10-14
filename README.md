# ZJTrackerCal

ตัวช่วยคุมน้ำหนักและนับแคลอรี่แบบส่วนตัว — ถ่ายรูปอาหารให้ Gemini ประมาณแคลอรี่ / ค้นจากฐานข้อมูลอาหารไทยในเครื่อง /
บันทึกเอง · บันทึกการออกกำลังกาย (ตาราง MET) · ติดตามน้ำหนักและ BMI

ทำมาเพื่อใช้บน **iPhone Safari** แบบ Add to Home Screen เป็นหลัก ข้อมูลทั้งหมดอยู่ใน **IndexedDB บนเครื่อง**
ไม่มีฐานข้อมูลภายนอก — อ่านการออกแบบและเหตุผลได้ที่ [ARCHITECTURE.md](ARCHITECTURE.md)

## ใช้บน Mac (ตอนนี้ใช้ได้เลย)

ดับเบิลคลิก **`เปิด ZJTrackerCal.command`** → เปิด <http://localhost:8010>

- AI ใช้ได้ทันทีบน Mac: `serve.py` เป็น proxy บนเครื่อง อ่าน Gemini key จาก `.dev.vars` (ไม่ถูก commit)
- `.dev.vars` สร้างไว้แล้วจาก key เดิมของ MonthlyCalculator — ถ้าจะเปลี่ยน key ดับเบิลคลิก **`ตั้งค่า Gemini.command`**

## ติดตั้งลง iPhone (ทำครั้งเดียว)

iPhone ต้องเปิดผ่าน HTTPS ถึงจะติดตั้งเป็นแอปและใช้ออฟไลน์ได้ จึงต้องมี 2 อย่าง:

| ส่วน | อยู่ที่ไหน | มีความลับไหม |
|---|---|---|
| ตัวแอป (โฟลเดอร์ `app/`) | GitHub Pages | ไม่มี |
| AI proxy (`proxy/worker.js`) | Cloudflare Workers (ฟรี) | ถือ Gemini key ไว้เป็น secret |

**1. เอาแอปขึ้น GitHub Pages**

```bash
gh repo create zjtrackercal --public --source . --push
gh api -X POST repos/{owner}/zjtrackercal/pages -f build_type=workflow
```

workflow ใน `.github/workflows/pages.yml` จะเอาเฉพาะโฟลเดอร์ `app/` ขึ้นเว็บทุกครั้งที่ push
ลิงก์จะเป็น `https://<ชื่อ GitHub>.github.io/zjtrackercal/`

**2. เอา AI proxy ขึ้น Cloudflare**

1. สมัคร <https://dash.cloudflare.com> (ฟรี) แล้วเปิดเมนู **Workers & Pages** หนึ่งครั้งเพื่อตั้งชื่อ `*.workers.dev`
2. สร้าง API token: **My Profile → API Tokens → Create Token → template "Edit Cloudflare Workers"**
3. ดับเบิลคลิก **`Deploy AI proxy.command`** → ใส่ `https://<ชื่อ GitHub>.github.io` → วาง token
4. สคริปต์จะเขียนที่อยู่ proxy ลง `app/config.js` แล้วพิมพ์ **access token** ออกมา → commit + push อีกครั้ง

ไม่มี Node ก็ทำได้ — `proxy/deploy.py` คุยกับ Cloudflare API ตรงๆ และสร้าง Durable Object `GeminiRelay`
(ตั้งอยู่ในสหรัฐฯ) ให้ด้วย เพราะถ้า Cloudflare ส่งคำขอออกจากสาขาฮ่องกง Gemini จะปฏิเสธ (แอปขึ้น "API error")
(ถ้าสคริปต์มีปัญหา: สร้าง Worker ใน dashboard → วางโค้ด `proxy/worker.js` → Settings → Variables and Secrets
— วิธีนี้ไม่มี Durable Object จึงอาจเจอ "API error" เป็นบางครั้งตามที่บอกข้างบน
ใส่ secret `GEMINI_API_KEY`, `APP_TOKEN` และ text `ALLOWED_ORIGINS` = `https://<ชื่อ GitHub>.github.io`
แล้วใส่ URL ของ Worker ลง `app/config.js` เอง)

**3. บน iPhone**

1. เปิดลิงก์ GitHub Pages ด้วย **Safari** → ปุ่มแชร์ → **เพิ่มไปยังหน้าจอโฮม**
2. เปิดแอป **จากไอคอนบนหน้าจอโฮม** แล้วค่อยตั้งค่าโปรไฟล์ในนั้น
   (iOS แยกข้อมูลของแอปบนหน้าจอโฮมกับแท็บ Safari ออกจากกัน — ตั้งค่าใน Safari จะไม่ตามไปในแอป)
3. **Profile → AI connection** → วาง access token → **Test connection** (copy จาก Mac แล้ว paste บน iPhone ได้ผ่าน Universal Clipboard)

## ความปลอดภัยและความเป็นส่วนตัว

- Gemini key **ไม่อยู่ในโค้ดของแอป ไม่อยู่ใน git ไม่อยู่บน iPhone** — อยู่ใน `.dev.vars` (Mac) และเป็น secret ใน Cloudflare
- proxy ทำงานเฉพาะเมื่อมี access token และรับแค่งาน "วิเคราะห์รูปอาหาร" กับ "หาข้อมูลอาหารจากชื่อ" —
  prompt ถูกกำหนดฝั่ง proxy ถึง token หลุดก็เอาไปใช้ Gemini ทำอย่างอื่นไม่ได้ · อยากเปลี่ยน token: แก้ `APP_TOKEN`
  ใน `.dev.vars` แล้ว deploy ใหม่
- รูปถูกย่อเหลือ ≤ 1024px และวาดใหม่ก่อนส่ง (ข้อมูล GPS ในรูปหายไปด้วย) · proxy ไม่เก็บรูปหรือ log
- ใครได้ลิงก์ไปก็เจอแค่แอปเปล่า ไม่เห็นข้อมูลของเรา และใช้ AI ไม่ได้ถ้าไม่มี token
- ข้อมูลอยู่ในเครื่องเดียว — ลบแอปหรือล้างข้อมูลเว็บไซต์ = ข้อมูลหาย ให้กด **Profile → Export backup** เป็นระยะ

## อัปเดตแอป

แก้ไฟล์ใน `app/` แล้ว **ขยับเลข `VERSION` ใน `app/sw.js`** (เช่น `zjtrackercal-v1` → `v2`) แล้ว push
ครั้งถัดไปที่เปิดแอปตอนมีเน็ต จะขึ้นข้อความ "A new version is ready" ให้กด **Reload**
ถ้าแก้ `proxy/worker.js` ให้รัน `Deploy AI proxy.command` อีกครั้ง

## ทดสอบ (สำหรับคนแก้โค้ด)

เปิด `serve.py` ไว้ก่อน แล้ว:

```bash
python3 -m venv .venv && .venv/bin/pip install playwright   # ครั้งแรกครั้งเดียว (ใช้ Google Chrome ที่มีในเครื่อง)
.venv/bin/python tests/e2e.py            # ทุกหน้า ทุก flow ทุก error (ใช้คำตอบจำลอง ไม่เรียก Gemini)
.venv/bin/python tests/e2e.py --photo รูปอาหาร.jpg   # + สแกนจริงกับ Gemini 1 ครั้ง
.venv/bin/python tests/worker_test.py    # proxy: token, CORS, งานที่อนุญาต, การแปลง error
.venv/bin/python tests/offline_test.py   # ปิดเบราว์เซอร์แล้วข้อมูลยังอยู่ + เปิดได้ตอนไม่มีเน็ต
```

รูปหน้าจอจากการทดสอบอยู่ที่ `tests/shots/`

## สูตรที่ใช้ (JavaScript คำนวณเอง ไม่ให้ AI คิด)

| ค่า | สูตร |
|---|---|
| BMR | Mifflin-St Jeor: `10·kg + 6.25·cm − 5·อายุ + 5` (ชาย) / `− 161` (หญิง) |
| TDEE | BMR × 1.2 / 1.375 / 1.55 / 1.725 / 1.9 ตาม activity level |
| เป้าแคลอรี่ | TDEE ± (kg ต่อสัปดาห์ × 7700 ÷ 7) ปัดหลัก 10 ไม่ต่ำกว่า 1,200 (หญิง) / 1,500 (ชาย) |
| สารอาหาร | Carbs 50% · Protein 20% · Fat 30% ของเป้าแคลอรี่ (÷4, ÷4, ÷9) แก้เองได้ |
| Remaining | Base Goal − Food (แคลอรี่จากกิจกรรม **ไม่** บวกกลับ) |
| กิจกรรม | MET × น้ำหนัก (kg) × ชั่วโมง |
| BMI | kg ÷ m² · เกณฑ์ WHO Asia-Pacific (18.5 / 23 / 25 / 30) |

หน่วย: น้ำหนักตัว kg · ส่วนสูง cm · อาหาร g · ระยะทาง km · เวลา minutes

## โครงสร้าง

| ไฟล์ | หน้าที่ |
|---|---|
| `app/index.html`, `styles.css` | หน้าแอป (หัวข้อ/ปุ่มภาษาอังกฤษ คำอธิบายตัวเล็กภาษาไทย) โทนชมพู/ฟ้าพาสเทลบนพื้นขาวนวล |
| `app/js/main.js` | router, tab bar, setup ครั้งแรก |
| `app/js/calc.js` | สูตรทั้งหมด |
| `app/js/db.js` | IndexedDB, export/import/reset |
| `app/js/ai.js` | เรียก proxy, ย่อรูป, ข้อความ error |
| `app/js/charts.js` | วงแหวนแคลอรี่ + กราฟ SVG (ไม่มี library ภายนอก) |
| `app/js/views/*` | Dashboard, Diary, Add (Scan/Search/Quick Add/Activity/Weight), Insight, Profile |
| `app/js/data/foods.js` | อาหาร 188 รายการ (อาหารไทย วัตถุดิบ ผลไม้ เครื่องดื่ม) ค่าโดยประมาณ |
| `app/js/data/met.js` | ตาราง MET (Compendium of Physical Activities) |
| `proxy/worker.js` | Cloudflare Worker — ถือ key, ตรวจ token, prompt + schema ของ Gemini |
| `proxy/deploy.py` | deploy Worker ผ่าน Cloudflare API |
| `serve.py` | เซิร์ฟเวอร์ตอนพัฒนาบน Mac + proxy บนเครื่อง (`--lan` = ให้ iPhone ใน Wi-Fi เดียวกันลองได้ ต้องใช้ token) |
