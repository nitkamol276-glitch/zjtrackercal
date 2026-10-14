"""ทดสอบแอปทั้งระบบใน Chrome ขนาดจอ iPhone (ต้องเปิด serve.py ไว้ก่อน)

ติดตั้งครั้งเดียว:  python3 -m venv .venv && .venv/bin/pip install playwright
รัน:            .venv/bin/python tests/e2e.py [--photo รูปอาหาร.jpg] [--out โฟลเดอร์รูปหน้าจอ]
  --photo  ทดสอบสแกนรูปกับ Gemini จริง 1 ครั้ง (ไม่ใส่ = ไม่เรียก Gemini เลย ใช้คำตอบจำลอง)
"""
import argparse
import json
import os
import tempfile
from playwright.sync_api import sync_playwright, expect

ap = argparse.ArgumentParser()
ap.add_argument("--base", default="http://127.0.0.1:8010/")
ap.add_argument("--photo", help="รูปอาหารจริง สำหรับทดสอบ Gemini")
ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "shots"))
args = ap.parse_args()
BASE, OUT = args.base, args.out
os.makedirs(OUT, exist_ok=True)
TMP = tempfile.mkdtemp(prefix="zjtc-")

errors, fails = [], []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        fails.append(msg)


def shot(page, name):
    page.wait_for_timeout(300)
    page.screenshot(path=os.path.join(OUT, name + ".png"))


def pick(page, name, value):
    """แตะปุ่มเลือก (radio) แบบที่คนแตะจริง คือแตะที่ label"""
    lab = page.locator(f".sheet label:has(> input[name={name}][value='{value}']), main label:has(> input[name={name}][value='{value}'])").last
    lab.scroll_into_view_if_needed()
    lab.click()


def tiny_jpeg():
    """รูป JPEG เล็กๆ สำหรับเทสต์ที่ใช้คำตอบจำลอง (แอปต้องอ่านรูปได้ แต่ไม่ต้องเป็นอาหารจริง)"""
    path = os.path.join(TMP, "plate.jpg")
    if not os.path.exists(path):
        with sync_playwright() as p2:
            b = p2.chromium.launch(channel="chrome", headless=True)
            pg = b.new_page(viewport={"width": 320, "height": 240})
            pg.set_content("<body style='margin:0;background:#f4e2c8'><div style='margin:40px auto;width:160px;height:160px;border-radius:50%;background:#fff;border:12px solid #ddd'></div></body>")
            pg.screenshot(path=path, type="jpeg")
            b.close()
    return path


def mock_food(page, status, body):
    page.route("**/api/food", lambda route: route.fulfill(status=status, content_type="application/json", body=json.dumps(body)))


PLATE = tiny_jpeg()

with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
                              locale="th-TH", timezone_id="Asia/Bangkok", reduced_motion="reduce")
    page = ctx.new_page()
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    page.on("pageerror", lambda e: errors.append(str(e)))

    # ---------- สูตร (calc.js) ----------
    page.goto(BASE)
    r = page.evaluate("""async () => {
      const c = await import('/js/calc.js');
      const p = { sex: 'female', weightKg: 60, heightCm: 160, age: 30, activityLevel: 'light', goal: 'lose', rateKgPerWeek: 0.5 };
      const m = { ...p, sex: 'male', weightKg: 80, heightCm: 180, age: 35, activityLevel: 'moderate', goal: 'gain', rateKgPerWeek: 0.25 };
      return {
        bmi: c.bmi(60, 160), cat: c.bmiCategory(23.4), bmr: c.bmr(p), goal: c.calorieGoal(p), goalM: c.calorieGoal(m),
        macros: c.macroTargets(1800), met: c.activityKcal(3.5, 60, 30),
        scale: c.scaleFood({ grams: 300, kcal: 596, carbs: 72, protein: 24, fat: 24.5 }, 150),
        floor: c.calorieGoal({ ...p, weightKg: 45, heightCm: 150, age: 60, activityLevel: 'sedentary', rateKgPerWeek: 1 }),
        summary: c.dailySummary({ goalKcal: 1500, macroGoals: { carbs: 180, protein: 75, fat: 50 }, meals: [{ kcal: 600, carbs: 70, protein: 20, fat: 25 }], activities: [{ kcal: 300 }] }),
        num: [c.num('12,5'), c.num(' 7 '), Number.isNaN(c.num('abc')), Number.isNaN(c.num(''))],
        addDays: c.addDays('2026-03-01', -1),
        eff: c.effectiveGoals(p, { kcalOverride: 1600 }).kcal,
        effM: c.effectiveGoals(p, { macrosOverride: true, macros: { protein: 100 } }).macros,
      };
    }""")
    check(r["bmi"] == 23.4, "BMI 60kg/160cm = 23.4")
    check(r["cat"] == "ท้วม", "BMI 23.4 = ท้วม (เกณฑ์เอเชีย)")
    check(r["bmr"] == 1289, "BMR (Mifflin) หญิง 60/160/30 = 1289")
    g = r["goal"]
    check(g["tdee"] == 1772 and g["adjust"] == -550 and g["goal"] == 1220, "TDEE 1772 → −550 → เป้า 1220")
    gm = r["goalM"]
    check(gm["bmr"] == 1755 and gm["tdee"] == 2720 and gm["adjust"] == 275 and gm["goal"] == 3000, "ชาย เพิ่ม 0.25: 1755 → 2720 → +275 → 3000")
    check(r["macros"] == {"carbs": 225, "protein": 90, "fat": 60}, "1800 kcal → 225/90/60 g")
    check(r["met"] == 105, "MET 3.5 × 60 kg × 0.5 ชม. = 105")
    check(r["scale"]["kcal"] == 298 and r["scale"]["fat"] == 12.3, "300 g → 150 g สารอาหารลดครึ่ง")
    check(r["floor"]["clamped"] and r["floor"]["goal"] == 1200, "เป้าต่ำเกินถูกยกเป็น 1200 (หญิง)")
    check(r["summary"]["remaining"] == 900 and r["summary"]["activity"] == 300, "เหลือ = เป้า − อาหาร (ไม่บวกกิจกรรม)")
    check(r["num"] == [12.5, 7, True, True], "อ่านตัวเลขที่ใช้ , เป็นจุดทศนิยมได้")
    check(r["addDays"] == "2026-02-28", "ข้ามเดือนถูกต้อง")
    check(r["eff"] == 1600 and r["effM"]["protein"] == 100 and r["effM"]["carbs"] == 153, "ค่าที่ตั้งเองชนะค่าคำนวณ")

    # ---------- ตั้งค่าครั้งแรก ----------
    page.goto(BASE)
    expect(page.locator("text=ขั้นที่ 1 จาก 3")).to_be_visible()
    shot(page, "01-setup-1")
    page.click("text=ถัดไป")
    expect(page.locator(".form-error")).to_contain_text("อายุ")
    page.fill("[name=name]", "ซี")
    page.fill("[name=age]", "30"); page.fill("[name=heightCm]", "160"); page.fill("[name=weightKg]", "60")
    page.click("text=ถัดไป")
    expect(page.locator("text=ขั้นที่ 2 จาก 3")).to_be_visible()
    shot(page, "02-setup-2")
    page.click("text=ถัดไป")
    expect(page.locator("text=ขั้นที่ 3 จาก 3")).to_be_visible()
    shot(page, "03-setup-3")
    page.click("text=คำนวณเป้าหมาย")
    expect(page.locator(".hero-figure")).to_contain_text("1,220")
    summary = page.inner_text(".macro-summary")
    check("153 g" in summary and "61 g" in summary and "41 g" in summary, "หน้าสรุปแสดง 153/61/41 g")
    shot(page, "04-setup-result")
    page.click("text=เริ่มบันทึก")

    # ---------- หน้าหลัก (ยังไม่มีข้อมูล) ----------
    expect(page.locator(".ring-center")).to_contain_text("1,220")
    expect(page.locator("text=ยังไม่มีบันทึกอาหาร แตะ + เพื่อเพิ่มมื้อแรก")).to_be_visible()
    shot(page, "05-dashboard-empty")

    # ---------- ค้นหาอาหาร (ในเครื่อง) ----------
    page.click(".tab-add")
    shot(page, "06-add-drawer")
    page.click("[data-flow=search]")
    expect(page.locator("text=ขั้นที่ 1 จาก 2 · หาอาหาร")).to_be_visible()
    page.fill("[name=q]", "ข้าวมันไก่")
    shot(page, "07-search-results")
    page.locator(".food-row").first.click()
    expect(page.locator("text=ขั้นที่ 2 จาก 2 · ปริมาณ")).to_be_visible()
    pick(page, "meal", "lunch")
    page.click(".chip >> nth=2")  # 1½ จาน
    grams, kcal = page.input_value(".item-card [name=grams]"), page.input_value(".item-card [name=kcal]")
    check(grams == "450" and kcal == "894", f"1½ จาน → 450 g / 894 kcal (ได้ {grams} / {kcal})")
    shot(page, "08-search-amount")
    page.click("[data-save]")
    expect(page.locator("#toast")).to_contain_text("บันทึกลงมื้อกลางวัน")
    check("894" in page.inner_text(".cal-legend"), "หน้าหลักแสดงอาหาร 894")

    # ---------- ค้นไม่เจอ → Gemini (คำตอบจำลอง) ----------
    page.click(".tab-add"); page.click("[data-flow=search]")
    page.fill("[name=q]", "zzqx เมนูลับ")
    expect(page.locator("text=ไม่พบ")).to_be_visible()
    shot(page, "09-search-nomatch")
    mock_food(page, 200, {"isFood": True, "confidence": "medium", "note": "ประมาณจาก 1 ชาม", "items": [{"name": "Mystery soup", "nameTh": "ซุปลึกลับ", "grams": 300, "kcal": 210, "carbs": 20, "protein": 12, "fat": 8}]})
    page.click("[data-ai]")
    expect(page.locator("text=ขั้นที่ 3 จาก 3 · ตรวจสอบ")).to_be_visible()
    shot(page, "10-search-ai-review")
    pick(page, "meal", "dinner")
    expect(page.locator("[data-save]")).to_have_text("บันทึกลงมื้อเย็น")
    page.click("[data-save]")
    page.unroute("**/api/food")
    expect(page.locator("#toast")).to_contain_text("มื้อเย็น")
    page.click(".tab-add"); page.click("[data-flow=search]")
    page.fill("[name=q]", "ซุปลึก")
    check(page.locator(".food-row:has-text('ซุปลึกลับ')").count() == 1, "ผลจาก Gemini ถูกเก็บไว้ค้นในเครื่องครั้งหน้า")
    page.click("[data-sheet-close]")

    # ---------- เพิ่มเอง ----------
    page.click(".tab-add"); page.click("[data-flow=quick]")
    page.fill("[name=name]", "โปรตีนบาร์")
    page.fill("[name=grams]", "50"); page.fill("[name=carbs]", "20"); page.fill("[name=protein]", "15"); page.fill("[name=fat]", "7")
    check("203 kcal" in page.inner_text("[data-auto]"), "เพิ่มเอง: 20×4 + 15×4 + 7×9 = 203")
    pick(page, "meal", "snack")
    shot(page, "11-quick-add")
    page.click("[data-save]")
    expect(page.locator("#toast")).to_contain_text("ของว่าง")

    # ---------- กิจกรรม ----------
    page.click(".tab-add"); page.click("[data-flow=activity]")
    expect(page.locator("text=ขั้นที่ 1 จาก 2 · เลือกกิจกรรม")).to_be_visible()
    shot(page, "12-activity-choose")
    page.click("[data-a=walking]")
    pick(page, "level", "moderate")
    page.fill("[name=minutes]", "30")
    check("105 kcal" in page.inner_text("[data-result]"), "เดินปานกลาง 30 นาที @60 kg = 105 kcal")
    page.fill("[name=distanceKm]", "2.5")
    shot(page, "13-activity-details")
    page.click("[data-save]")
    expect(page.locator("#toast")).to_contain_text("105 kcal")
    rem = page.inner_text(".ring-center")
    check("87" in rem and "เกินเป้า" in rem, f"1220 − (894+210+203) = เกิน 87 · กิจกรรมไม่ถูกบวก (ได้ {rem!r})")
    shot(page, "14-dashboard-filled")

    # ---------- น้ำหนัก ----------
    page.click(".tab-add"); page.click("[data-flow=weight]")
    page.fill("[name=kg]", "59")
    shot(page, "15-weight")
    page.click("[data-save]")
    expect(page.locator("#toast")).to_contain_text("เป้าต่อวันเปลี่ยนเป็น 1,210")

    # ---------- ไดอารี่ ----------
    page.click("[data-tab=diary]")
    expect(page.locator(".date-title")).to_have_text("วันนี้")
    shot(page, "16-diary")
    check(page.locator(".entry").count() == 4, "ไดอารี่: อาหาร 3 + กิจกรรม 1")
    check("เดิน — ปานกลาง" in page.inner_text(".diary-group:last-of-type"), "ชื่อกิจกรรมเป็นภาษาไทย")
    check(page.is_disabled("[data-today]"), "ปุ่มวันนี้กดไม่ได้เมื่ออยู่วันนี้")
    page.click("[data-day='-1']")
    expect(page.locator(".date-title")).to_have_text("เมื่อวาน")
    check(page.locator(".entry").count() == 0 and page.is_enabled("[data-today]"), "เมื่อวานว่าง ปุ่มวันนี้กดได้")
    page.click("[data-add-meal=breakfast]")
    expect(page.locator(".drawer-title")).to_contain_text("เพิ่มลงวันที่")
    page.click("[data-flow=quick]")
    page.fill("[name=name]", "ขนมปัง"); page.fill("[name=kcal]", "150")
    check(page.locator("[name=meal][value=breakfast]").is_checked(), "มื้อถูกเลือกตามหัวข้อที่กดมา")
    page.click("[data-save]")
    expect(page.locator(".entry")).to_have_count(1)
    page.click("[data-today]")
    expect(page.locator(".date-title")).to_have_text("วันนี้")
    page.locator(".entry-main:has-text('โปรตีนบาร์')").click()
    expect(page.locator("text=แก้ไขอาหาร")).to_be_visible()
    page.fill(".item-card [name=grams]", "100")
    check(page.input_value(".item-card [name=kcal]") == "406", "แก้น้ำหนักเป็น 2 เท่า แคลอรี่เป็น 2 เท่า")
    shot(page, "17-edit-food")
    page.click("[data-save]")
    expect(page.locator(".entry:has-text('โปรตีนบาร์') .entry-kcal")).to_have_text("406")
    page.locator(".entry:has-text('โปรตีนบาร์') [data-del]").click()
    shot(page, "18-delete-confirm")
    page.click("[data-yes]")
    expect(page.locator(".entry:has-text('โปรตีนบาร์')")).to_have_count(0)
    page.click("#toast button")
    expect(page.locator(".entry:has-text('โปรตีนบาร์')")).to_have_count(1)
    check(True, "ลบแล้วกดเลิกทำ รายการกลับมา")

    # ---------- ข้อมูลย้อนหลังสำหรับกราฟ ----------
    page.evaluate("""async () => {
      const db = await import('/js/db.js'); const c = await import('/js/calc.js');
      const today = c.ymd(); const rows = [], acts = [], ws = [];
      for (let i = 1; i < 400; i++) {
        const d = c.addDays(today, -i);
        if (i % 9 === 4) continue;
        rows.push({ date: d, meal: 'lunch', name: 'ข้อมูลทดสอบ', grams: 300, kcal: 1100 + Math.round(400 * Math.abs(Math.sin(i * 1.7))), carbs: 120, protein: 50, fat: 40, source: 'manual' });
        if (i % 3 === 0) acts.push({ date: d, activityId: 'running', levelId: 'slow', label: 'Running — Slow', met: 8.3, minutes: 30, weightKg: 60, kcal: 249 });
        if (i % 4 === 0) ws.push({ date: d, kg: Math.round((59 + i * 0.012 + 0.3 * Math.sin(i)) * 10) / 10 });
      }
      await db.putMany('meals', rows); await db.putMany('activities', acts); await db.putMany('weights', ws);
    }""")

    # ---------- สถิติ ----------
    page.click("[data-tab=insight]")
    expect(page.locator("#ins-intake svg")).to_be_visible()
    shot(page, "19-insight-week")
    box = page.locator("#ins-intake svg").bounding_box()
    page.mouse.move(box["x"] + box["width"] - 20, box["y"] + 100)
    page.wait_for_timeout(200)
    check(page.locator("#ins-intake .chart-tip").is_visible(), "แตะ/ชี้กราฟแล้วเห็นค่า")
    pick(page, "period", "month")
    page.wait_for_timeout(300)
    shot(page, "20-insight-month")
    pick(page, "period", "year")
    page.wait_for_timeout(300)
    check(page.locator("#ins-intake .bar").count() == 12, "รายปี: 12 แท่ง")
    shot(page, "21-insight-year")
    page.locator("#ins-weight").scroll_into_view_if_needed()
    shot(page, "22-insight-weight-bmi")
    page.click("#ins-intake [data-toggle-table]")
    check(page.locator("#ins-intake table tbody tr").count() == 12, "ดูเป็นตาราง 12 แถว")

    # ---------- โปรไฟล์ ----------
    page.click("[data-tab=profile]")
    shot(page, "23-profile")
    page.click("[data-adjust]")
    page.locator(".sheet label:has(> [name=custom])").click()
    page.fill("[name=kcal]", "1500")
    shot(page, "24-adjust-goal")
    page.click("[data-save]")
    expect(page.locator(".big-goal")).to_contain_text("1,500")
    page.click("[data-edit-macros]")
    page.locator(".sheet label:has(> [name=custom])").click()
    page.fill("[name=protein]", "100")
    check("รวมเป็น" in page.inner_text("[data-sum]"), "บอกผลรวม kcal ของเป้าสารอาหาร")
    page.click("[data-save]")
    expect(page.locator(".macro-summary")).to_contain_text("100 g")
    page.click("[data-tab=dashboard]")
    check("1,500" in page.inner_text(".cal-legend") and "/ 100 g" in page.inner_text(".macros"), "หน้าหลักใช้ค่าที่ตั้งเอง")

    # ---------- ส่งออก / นำเข้า ----------
    page.click("[data-tab=profile]")
    page.evaluate("""() => { let n = 0; window.__shared = 0;
      navigator.canShare = () => true;
      navigator.share = async () => { if (n++ === 0) throw new DOMException('no activation', 'NotAllowedError'); window.__shared++; }; }""")
    page.click("[data-export]")
    expect(page.locator(".sheet h2")).to_have_text("ไฟล์สำรองพร้อมแล้ว")
    page.click("[data-share]")
    expect(page.locator("#toast")).to_contain_text("ส่งออกข้อมูลแล้ว")
    check(page.evaluate("window.__shared") == 1, "iPhone: แตะอีกครั้งเพื่อแชร์ไฟล์สำรองได้")
    page.evaluate("() => { navigator.canShare = undefined; }")
    with page.expect_download() as dl:
        page.click("[data-export]")
    backup = json.load(open(dl.value.path()))
    check(backup["app"] == "ZJTrackerCal" and len(backup["data"]["meals"]) > 200 and not any(r["key"] == "ai" for r in backup["data"]["kv"]), "ไฟล์สำรองมีข้อมูลครบ ไม่มี token AI")
    broken = json.loads(json.dumps(backup)); broken["data"]["meals"][0]["meal"] = "brunch"
    brpath = os.path.join(TMP, "broken.json"); json.dump(broken, open(brpath, "w"))
    count = "async () => (await (await import('/js/db.js')).all('meals')).length"
    before = page.evaluate(count)
    page.set_input_files("[data-import]", brpath)
    expect(page.locator("#toast")).to_contain_text("ข้อมูลผิดพลาดใน meals")
    check(page.evaluate(count) == before, f"ไฟล์สำรองที่เสียถูกปฏิเสธ ข้อมูลเดิมไม่เปลี่ยน ({before} รายการ)")
    page.click(".tab-add"); page.click("[data-flow=weight]")
    page.fill("[name=kg]", "80")
    page.fill("[name=date]", page.evaluate("async () => { const c = await import('/js/calc.js'); return c.addDays(c.ymd(), 1); }"))
    page.click("[data-save]")
    expect(page.locator(".form-error")).to_contain_text("อนาคต")
    check(page.is_enabled("[data-save]"), "บันทึกน้ำหนักวันในอนาคตไม่ได้ และปุ่มไม่ค้าง")
    page.click("[data-sheet-close]")

    # ---------- สถานะ error ของ Gemini (คำตอบจำลอง) ----------
    def scan_error(status, body, label, title):
        mock_food(page, status, body)
        page.click(".tab-add"); page.click("[data-flow=scan]")
        page.set_input_files("[data-file] >> nth=1", PLATE)
        expect(page.locator(".state-title")).to_have_text(title)
        check(page.locator("[data-retry]").count() == 1, f"{title}: มีปุ่มลองอีกครั้ง")
        shot(page, f"25-error-{label}")
        page.unroute("**/api/food")
        page.click("[data-sheet-close]")
    scan_error(503, {"error": "not_configured"}, "unavailable", "เชื่อมต่อ Gemini API ไม่ได้")
    scan_error(502, {"error": "upstream_error", "status": 500}, "api", "Gemini API ขัดข้อง")
    scan_error(200, {"isFood": False, "items": [], "confidence": "high", "note": ""}, "unidentified", "ระบุอาหารไม่ได้")
    page.click(".tab-add"); page.click("[data-flow=scan]")
    bad = os.path.join(TMP, "not-an-image.txt"); open(bad, "w").write("hello")
    page.set_input_files("[data-file] >> nth=1", bad)
    expect(page.locator(".state-title")).to_have_text("ใช้รูปนี้ไม่ได้")
    check(page.locator("[data-another]").count() == 1, "รูปใช้ไม่ได้: มีปุ่มเลือกรูปอื่น")
    shot(page, "26-error-invalid")
    page.click("[data-sheet-close]")
    held = []
    page.route("**/api/food", lambda route: held.append(route))
    page.click(".tab-add"); page.click("[data-flow=scan]")
    page.set_input_files("[data-file] >> nth=1", PLATE)
    expect(page.locator(".state-title")).to_have_text("กำลังวิเคราะห์รูป...")
    shot(page, "27-analyzing")
    held[0].fulfill(status=200, content_type="application/json", body=json.dumps({"isFood": True, "confidence": "high", "note": "", "items": [{"name": "Rice", "nameTh": "ข้าวสวย", "grams": 100, "kcal": 130, "carbs": 28, "protein": 3, "fat": 0.3}]}))
    expect(page.locator("text=ขั้นที่ 3 จาก 3 · ตรวจสอบ")).to_be_visible(timeout=10000)
    page.unroute("**/api/food")
    page.click("[data-sheet-close]")

    # ---------- สแกนจริงกับ Gemini (ถ้าใส่ --photo) ----------
    if args.photo:
        page.click(".tab-add"); page.click("[data-flow=scan]")
        page.set_input_files("[data-file] >> nth=1", args.photo)
        page.wait_for_selector("text=ขั้นที่ 3 จาก 3 · ตรวจสอบ", timeout=60000)
        names = page.locator(".item-name").evaluate_all("els => els.map(e => e.value)")
        note = page.locator(".ai-meta + .note").all_inner_texts()
        print("   Gemini:", names, "| note:", note)
        check(len(names) >= 1, "สแกนจริงได้รายการอาหาร")
        shot(page, "28-real-scan-review")
        page.click("[data-save]")
        expect(page.locator("#toast")).to_contain_text("บันทึกลง")

    # ---------- การเชื่อมต่อ AI ----------
    page.click("[data-tab=profile]")
    page.click("[data-ai]")
    page.click("[data-test]")
    expect(page.locator("[data-result]")).to_contain_text("เชื่อมต่อแล้ว")
    shot(page, "29-ai-settings")
    page.click("[data-sheet-close]")

    # ---------- ล้างข้อมูล + นำเข้ากลับ ----------
    page.click("[data-reset]")
    page.click("[data-yes]")
    expect(page.locator("text=ขั้นที่ 1 จาก 3")).to_be_visible()
    page.evaluate("async b => { const db = await import('/js/db.js'); await db.importAll(b); }", backup)
    page.reload()
    expect(page.locator(".ring-center")).to_be_visible()
    check(True, "ล้างข้อมูลแล้วนำเข้าไฟล์สำรองกลับมาได้")

    browser.close()

expected_errors = [e for e in errors if "status of 50" not in e]  # 503/502 มาจากการจำลอง error ตั้งใจ
print("\nconsole errors:", expected_errors or "none (นอกจาก 502/503 ที่จำลองไว้)")
if expected_errors:
    fails.append("console errors")
print("ไม่ผ่าน:" if fails else "ผ่านทั้งหมด", fails if fails else "")
raise SystemExit(1 if fails else 0)
