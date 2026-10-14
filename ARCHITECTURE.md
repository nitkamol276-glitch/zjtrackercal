# ZJTrackerCal — Requirements & Architecture

เอกสารนี้เขียนก่อนลงมือสร้าง: สรุปว่า prompt ขออะไร ตัดสินใจเรื่องโครงสร้างอย่างไร และทำไม

---

## 1. สรุป requirements

| หมวด | สิ่งที่ต้องได้ |
|---|---|
| ผู้ใช้ | คนเดียว (ส่วนตัว) ใช้บน iPhone Safari เป็นหลัก ติดตั้งแบบ Add to Home Screen |
| ข้อมูล | เก็บในเครื่องด้วย IndexedDB เท่านั้น — ไม่มี Supabase / Firebase / ฐานข้อมูลภายนอก รีเฟรชหรือปิด Safari แล้วข้อมูลยังอยู่ |
| AI | Gemini ใช้ **เฉพาะ** งานที่ต้องเดา: ดูรูปอาหาร, บอกชื่ออาหาร, ประมาณ kcal / carbs / protein / fat, ช่วยหาอาหารที่ไม่มีในฐานข้อมูล |
| สูตรคำนวณ | BMI, BMR, TDEE, เป้าแคลอรี่, แคลอรี่ที่เหลือ, สารอาหารที่เหลือ, แคลอรี่จากกิจกรรม (MET) → **JavaScript คำนวณเอง** ผลลัพธ์ต้องเหมือนเดิมทุกครั้ง |
| ความลับ | Gemini API key **ห้ามอยู่ในโค้ดฝั่ง client** |
| หน่วย | น้ำหนักตัว kg · ส่วนสูง cm · น้ำหนักอาหาร g · ระยะทาง km · เวลา minutes |
| หน้าตา | minimal, สะอาด, ไม่รก, สีน้อย: ชมพูพาสเทล (หลัก) ฟ้าพาสเทล (รอง) พื้นขาวนวล ตัวหนังสือน้ำตาลเข้ม ไม่มี gradient / animation เกินจำเป็น |

### กฎที่ prompt เน้นและต้องไม่พลาด

1. **Calories Remaining = Base Goal − Food** — แคลอรี่จากการออกกำลังกาย *แสดง* ได้ แต่ **ไม่บวกกลับ** เข้างบประมาณ
2. ผลจาก Gemini ต้องผ่านขั้น **ผู้ใช้ตรวจ/แก้ก่อนบันทึก** เสมอ (Scan → วิเคราะห์ → แสดงผล → แก้ → Save)
3. Search Food: **ฐานข้อมูลในเครื่องก่อน** → ไม่เจอ → ถาม Gemini → ผู้ใช้ตรวจ → Save
4. Activity ใช้ **ตาราง MET** ในแอป: `kcal = MET × น้ำหนัก(kg) × ชั่วโมง`
5. เป้าหมายแคลอรี่: **BMR (Mifflin-St Jeor) → TDEE (× activity factor) → ปรับตามเป้า (ลด/คงที่/เพิ่ม) → Daily Goal** และ override เองได้
6. เป้าสารอาหารคำนวณอัตโนมัติจากเป้าแคลอรี่ แล้วแก้เองได้
7. มี empty state, loading state, error state ของ Gemini ครบ พร้อมปุ่ม **Retry**
8. Reset All Data ต้องยืนยันก่อน · Export / Import backup ได้

---

## 2. เรื่อง API key — สถาปัตยกรรมที่ปลอดภัยที่สุดสำหรับแอปส่วนตัวคนเดียว

### ปัญหา

PWA คือไฟล์ HTML/JS ที่ใครเปิดลิงก์ก็โหลดไปอ่านได้ทั้งหมด ถ้าใส่ key ไว้ในโค้ด (แม้จะซ่อนหรือเข้ารหัส)
ใครก็ดึงไปใช้ได้ จะซ่อนในโค้ดอย่างไรก็ไม่ปลอดภัย

### ทางเลือกที่พิจารณา

| ทางเลือก | key อยู่ที่ไหน | ข้อดี | ข้อเสีย | ผล |
|---|---|---|---|---|
| A. ใส่ key ในโค้ด | ไฟล์ JS บนเว็บ | ง่ายสุด | **ใครเปิดเว็บก็เห็น key** | ❌ ผิด requirement |
| B. ให้ผู้ใช้วาง key ในแอป เก็บใน IndexedDB | เครื่อง iPhone | ไม่ต้องมี server | key อยู่บนมือถือและเห็นได้ใน network ของเครื่อง · หลุดแล้วต้องไปเปลี่ยน key ที่ Google · ใช้ key ทำอะไรก็ได้ไม่จำกัด | ⚠️ ใช้ได้ แต่ไม่ใช่ "ปลอดภัยที่สุด" |
| C. Backend เต็มรูปแบบ + database | server | — | ขัด requirement (ห้ามมี backend/database ภายนอก) และเกินความจำเป็น | ❌ |
| **D. Proxy ไร้สถานะ (stateless) บน Cloudflare Worker** | **secret ของ Worker** | key ไม่เคยไปถึงมือถือ · ใช้ได้แค่งานวิเคราะห์อาหาร · เปลี่ยน access token ได้โดยไม่ต้องแตะ key | ต้องมีบัญชี Cloudflare (ฟรี) และ deploy ครั้งเดียว | ✅ **เลือกอันนี้** |

### สถาปัตยกรรมที่เลือก

```
 iPhone (PWA, Add to Home Screen)                    Cloudflare Worker (ฟรี)               Google
┌──────────────────────────────────────┐           ┌──────────────────────────────┐     ┌──────────┐
│ UI + JavaScript                      │  HTTPS    │ 1. ตรวจ access token          │     │          │
│ • คำนวณ BMI/BMR/TDEE/MET/remaining   │──────────▶│ 2. ตรวจ origin + ขนาด request │────▶│  Gemini  │
│ • ย่อรูปเหลือ ≤1024px (ลบ EXIF/GPS)    │  task +   │ 3. สร้าง prompt เอง           │ key │   API    │
│ • ผู้ใช้ตรวจ/แก้ผลก่อน Save              │  รูป/ชื่อ  │    (รับแค่ 2 งานที่กำหนด)      │     │          │
│                                      │◀──────────│ 4. ส่ง JSON กลับ              │◀────│          │
│ IndexedDB  ← ข้อมูลทั้งหมดอยู่ที่นี่        │   JSON    │ ไม่มี database ไม่เก็บ log     │     └──────────┘
│ (profile, meals, activities, weight) │           └──────────────────────────────┘
└──────────────────────────────────────┘
        ▲ ไฟล์เว็บ (ไม่มีความลับ) โหลดจาก GitHub Pages ครั้งแรก แล้ว service worker เก็บไว้ใช้ออฟไลน์
```

**การป้องกันแต่ละชั้น**

1. **Gemini key** เก็บเป็น *encrypted secret* ใน Cloudflare — ไม่อยู่ใน repo, ไม่อยู่ในไฟล์เว็บ, ไม่อยู่บน iPhone
2. **Access token** (สุ่ม 120+ bit) — Worker ไม่ยอมทำงานถ้าไม่มี token นี้ ผู้ใช้วาง token ในหน้า Profile ครั้งเดียว
   เก็บใน IndexedDB ของเครื่อง ถ้าหลุดก็แค่เปลี่ยน token ใหม่ ไม่ต้องเปลี่ยน key
3. **Worker ไม่ใช่ทางผ่านเปิด** — client ส่งได้แค่ `task: "photo"` (รูป) หรือ `task: "lookup"` (ชื่ออาหาร)
   prompt และ schema ของคำตอบถูกกำหนดใน Worker ถึง token หลุดก็เอาไปใช้ Gemini ทำอย่างอื่นไม่ได้
4. **จำกัด origin** (CORS) ให้เฉพาะเว็บของแอป และจำกัดขนาด request (รูป ≤ 4 MB)
5. **ไม่เก็บข้อมูล** — Worker ไม่มี database ไม่ log รูปหรือชื่ออาหาร เป็นแค่ตัวส่งต่อ
6. **ใช้ key แผนฟรีที่ไม่ผูกบัตร** — กรณีแย่ที่สุดคือโควตาหมด ไม่มีค่าใช้จ่ายงอก
7. **ไม่โหลด script จากภายนอก** (ไม่มี CDN, ไม่มี analytics) — ลดความเสี่ยงที่โค้ดคนอื่นจะอ่านข้อมูลใน IndexedDB
8. **รูปถูกย่อและวาดใหม่บน canvas ก่อนส่ง** — metadata อย่าง GPS ในรูปจะหายไปด้วย
9. **ส่งคำขอไป Gemini ผ่านสหรัฐฯ เสมอ** — Cloudflare อาจรัน Worker ที่สาขาฮ่องกงให้คนในไทย ซึ่ง Google
   ไม่เปิด Gemini API ให้ (ตอบ 400 "User location is not supported") Worker จึงส่งต่อผ่าน Durable Object
   `GeminiRelay` ที่สร้างด้วย `locationHint: 'wnam'` (อเมริกาเหนือ) — Durable Object ไม่เก็บข้อมูลอะไร แค่ส่งต่อ

> Worker เป็นแค่ตัวส่งต่อแบบไร้สถานะ ไม่ได้เก็บข้อมูลผู้ใช้ จึงไม่ขัดข้อ "ห้ามใช้ backend/database ภายนอก"
> ข้อมูลทุกอย่างของผู้ใช้ยังอยู่ใน IndexedDB บนเครื่องเท่านั้น

### เรื่อง "ลิงก์ส่วนตัว"

- ตัวเว็บอยู่บน GitHub Pages (HTTPS ฟรี — iPhone ต้องใช้ HTTPS ถึงจะติดตั้งเป็นแอปและใช้ออฟไลน์ได้)
- ใครได้ลิงก์ไปก็เจอแค่แอปเปล่า: ไม่มีข้อมูลของเรา (อยู่ในเครื่องเราเท่านั้น) และใช้ AI ไม่ได้ (ไม่มี token)
- ถ้าอยากล็อกทั้งเว็บ ใช้ Cloudflare Access ครอบได้ภายหลัง (ไม่ได้ทำเป็นค่าเริ่มต้น เพราะ iOS แบบ standalone
  จัดการหน้า login ได้ไม่ดี)

### ตอนพัฒนาบน Mac

`serve.py` เปิดเว็บที่ `127.0.0.1` และทำหน้าที่เป็น proxy ตัวเดียวกันบนเครื่อง (อ่าน key จาก `.dev.vars`
ซึ่งไม่ถูก commit) prompt และ schema อ่านจาก `proxy/worker.js` ไฟล์เดียวกัน จึงไม่มีสองชุดให้แก้ไม่ตรงกัน

---

## 3. โครงสร้างข้อมูล (IndexedDB: `zjtrackercal`)

| store | key | ตัวอย่าง |
|---|---|---|
| `kv` | `key` | `profile`, `goals`, `ai` (token), `prefs` |
| `meals` | `id` · index `date` | `{date:'2026-10-12', meal:'lunch', name, grams, kcal, carbs, protein, fat, source}` |
| `activities` | `id` · index `date` | `{date, activityId, label, intensity, met, minutes, weightKg, distanceKm, kcal}` |
| `weights` | `date` (1 ค่าต่อวัน) | `{date, kg}` |
| `foods` | `id` | อาหารที่ผู้ใช้บันทึกจาก AI/Quick Add → ค้นเจอในเครื่องครั้งต่อไป |

- วันที่เก็บเป็น `YYYY-MM-DD` ตามเวลาท้องถิ่นของเครื่อง (ไม่ใช้ UTC กันวันเลื่อน)
- ตัวเลขทุกตัวเก็บในหน่วยมาตรฐาน (kg, cm, g, km, minutes, kcal) ชื่อ field บอกหน่วยเมื่อกำกวม (`weightKg`, `heightCm`, `distanceKm`)
- ขอ `navigator.storage.persist()` เพื่อลดโอกาสที่ iOS จะล้างข้อมูล + มี Export backup เป็นไฟล์ JSON

## 4. สูตร (อยู่ใน `app/js/calc.js` ทั้งหมด)

| ค่า | สูตร |
|---|---|
| BMI | `kg / (m²)` · เกณฑ์ WHO Asia-Pacific (เกณฑ์ที่กรมอนามัยใช้): <18.5 / 18.5–22.9 / 23–24.9 / 25–29.9 / ≥30 |
| BMR (Mifflin-St Jeor) | ชาย `10·kg + 6.25·cm − 5·อายุ + 5` · หญิง `… − 161` |
| TDEE | `BMR × factor` — Sedentary 1.2 · Lightly 1.375 · Moderately 1.55 · Very 1.725 · Extremely 1.9 |
| ปรับตามเป้า | `อัตรา(kg/สัปดาห์) × 7700 / 7` kcal/วัน (ลบเมื่อลด บวกเมื่อเพิ่ม) |
| Daily Goal | `TDEE ± ปรับ` ปัดเป็นหลัก 10 · ไม่ต่ำกว่า 1,200 (หญิง) / 1,500 (ชาย) · override ได้ |
| เป้าสารอาหาร | Carbs 50% · Protein 20% · Fat 30% ของเป้าแคลอรี่ → กรัม (÷4, ÷4, ÷9) · แก้เองได้ |
| Remaining | `Goal − Food` (ไม่บวก Activity) · สารอาหารเหลือ = เป้า − ที่กินไป |
| Activity | `MET × kg × (นาที/60)` ปัดเป็นจำนวนเต็ม |
| ปรับปริมาณอาหาร | ทุกสารอาหาร × (กรัมใหม่ / กรัมเดิม) |

Gemini ให้แค่ "ตัวเลขประมาณต่อจาน" ส่วนการรวม การย่อขยายตามกรัม และทุกอย่างข้างบน JavaScript ทำเอง

## 5. โครงสร้างไฟล์

```
ZJTrackerCal/
├── app/                      ← ตัวเว็บ (ขึ้น GitHub Pages ทั้งโฟลเดอร์นี้ ไม่มีความลับ)
│   ├── index.html, styles.css, manifest.webmanifest, sw.js, config.js
│   ├── icons/
│   └── js/
│       ├── main.js           router, tab bar, setup ครั้งแรก
│       ├── db.js             IndexedDB
│       ├── calc.js           สูตรทั้งหมด (pure functions)
│       ├── ai.js             เรียก proxy + แปลง error เป็นข้อความที่ผู้ใช้เข้าใจ
│       ├── ui.js             sheet / drawer / toast / ฟอร์ม
│       ├── charts.js         กราฟ SVG เขียนเอง (ไม่มี library ภายนอก)
│       ├── data/foods.js     ฐานข้อมูลอาหารในเครื่อง
│       ├── data/met.js       ตาราง MET
│       └── views/            dashboard, diary, add, insight, profile, setup
├── proxy/worker.js           Cloudflare Worker (ตัวกลางถือ key)
├── proxy/deploy.py           deploy Worker ผ่าน Cloudflare API (ไม่ต้องมี Node)
├── serve.py                  เซิร์ฟเวอร์ตอนพัฒนา + proxy บนเครื่อง
└── .dev.vars                 key + token เฉพาะเครื่อง (อยู่ใน .gitignore)
```

ไม่มี build step: HTML/CSS/ES modules ล้วน แก้ไฟล์แล้วรีเฟรชเห็นผลเลย

## 6. User flow

```
ครั้งแรก:   เปิดแอป → Setup (1/3 ข้อมูลตัวเอง → 2/3 Activity level → 3/3 เป้าหมาย) → ดูเป้าที่คำนวณได้ → Dashboard
ทุกวัน:     Dashboard → แตะ + → เลือก Scan / Search / Quick Add / Activity / Weight
           → ทำตามขั้น (หัวข้อบอกขั้นที่เท่าไหร่) → Save → กลับไปหน้าที่เปิดค้างไว้ + toast บอกว่าบันทึกอะไรไปเท่าไหร่
```

- tab bar ด้านล่าง: Dashboard · Diary · **+** · Insight · Profile (tab ที่อยู่ถูกไฮไลต์เสมอ)
- ทุก sheet มีหัวข้อชื่อขั้นตอน + ปุ่มย้อน/ปิด + ปุ่มหลักปุ่มเดียวที่บอกว่าต้องทำอะไรต่อ
- เปิด + จาก Diary ของวันไหน มื้อไหน → บันทึกเข้าวันนั้น มื้อนั้นเลย
