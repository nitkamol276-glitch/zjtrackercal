"""ทดสอบว่าปิดเบราว์เซอร์แล้วเปิดใหม่ข้อมูลยังอยู่ และเปิดแอปได้ตอนไม่มีเน็ต (service worker)
รัน: .venv/bin/python tests/offline_test.py   (ต้องเปิด serve.py ไว้)
"""
import struct
import tempfile
import zlib
from playwright.sync_api import sync_playwright, expect


def png(w, h, rgb=(244, 226, 200)):
    """สร้างไฟล์ PNG สีพื้นด้วย library มาตรฐาน"""
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    raw = b"".join(b"\x00" + bytes(rgb) * w for _ in range(h))
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")

PROFILE = tempfile.mkdtemp(prefix="zjtc-profile-")
opts = dict(channel="chrome", headless=True, viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, reduced_motion="reduce")
URL = "http://127.0.0.1:8010/?sw=1"

with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(PROFILE, **opts)
    page = ctx.new_page()
    page.goto(URL)
    page.fill("[name=age]", "28"); page.fill("[name=heightCm]", "170"); page.fill("[name=weightKg]", "65")
    page.click("text=Continue"); page.click("text=Continue"); page.click("text=Calculate my goals"); page.click("text=Start tracking")
    page.click(".tab-add"); page.click("[data-flow=quick]")
    page.fill("[name=name]", "ก๋วยเตี๋ยวทดสอบ"); page.fill("[name=kcal]", "420"); page.click("[data-save]")
    expect(page.locator("#toast")).to_contain_text("420 kcal")
    page.evaluate("navigator.serviceWorker.ready.then(() => true)")
    page.wait_for_timeout(1500)
    ctx.close()  # = ปิดเบราว์เซอร์

    ctx = p.chromium.launch_persistent_context(PROFILE, **opts)
    page = ctx.new_page()
    page.goto(URL + "#/diary")
    expect(page.locator(".entry-name")).to_have_text("ก๋วยเตี๋ยวทดสอบ")
    print("  ok   ปิดเบราว์เซอร์แล้วเปิดใหม่ ข้อมูลยังอยู่")
    ctx.set_offline(True)
    page.reload()
    expect(page.locator(".entry-name")).to_have_text("ก๋วยเตี๋ยวทดสอบ")
    print("  ok   ไม่มีเน็ตก็เปิดแอปได้")
    page.click(".tab-add"); page.click("[data-flow=scan]")
    page.set_input_files("[data-file] >> nth=1", files=[{"name": "plate.png", "mimeType": "image/png", "buffer": png(128, 128)}])
    expect(page.locator(".state-title")).to_have_text("Gemini API unavailable")
    print("  ok   สแกนตอนไม่มีเน็ต →", page.inner_text(".state-box .muted"))
    ctx.close()
