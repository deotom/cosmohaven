# Cosmohaven — Plan & Checklist

ความรู้พื้นฐานดูที่ [KNOWLEDGE.md](KNOWLEDGE.md)
สัญลักษณ์: `[x]` = เสร็จและตรวจแล้ว · `[~]` = กำลังทำ · `[ ]` = ยังไม่ทำ / ยังไม่ยืนยัน

## Phase 0 — เตรียมการทำงานต่อ (ทำก่อน)

- [x] `git init` + commit สถานะเริ่มต้น (`a0e8a1f`)
- [~] ตรวจ dependencies/เปิดเกม/เล่นให้จบหนึ่งรอบ — dependencies พร้อม, เข้า Shipyard, undock และ fold สำเร็จ 2 ครั้ง; ยังไม่ได้เล่น campaign จนชนะ
- [x] `npm run build` ผ่าน (ตรวจเมื่อ 2026-10-03)
- [x] `npm run lint` ผ่าน (ตรวจเมื่อ 2026-10-03)
- [x] แก้ README.md ให้เป็นคำอธิบายเกมจริง
- [x] ลบ comment ลอย `1-based tiers` ใน `gameState.ts` และ asset ที่ไม่ได้ import (`react.svg`, `vite.svg`, `hero.png`)

## Phase 1 — ฟีเจอร์หลักที่มีอยู่แล้ว (baseline)

- [x] หน้า Crew Registration + 5 เผ่าพันธุ์ พร้อมตัวเลือกรูปลักษณ์
- [x] สร้างยานจากบล็อก (hull / food / arcade) พร้อม drone queue
- [x] Drydock + ลำดับ dock/undock
- [x] ฟิสิกส์ยาน + แรงโน้มถ่วงดาว + บรรยากาศ + reentry
- [x] Arrival: orbit insertion, de-orbit, descent, landing
- [x] Auto-pilot 3 tier, 7 task
- [x] ระบบ target lock + context action
- [x] Harvester 3 tier, Scrap/Relic
- [x] Sector generation จาก seed + Space-Fold
- [x] อุกกาบาต + hull damage + emergency repair
- [x] ลูกเรือ (hunger/sanity), pathfinding ในยาน
- [x] Victory (Earth 2.0)

## Phase 2 — ความเสถียรและคุณภาพโค้ด

- [x] แยก `App.tsx` ออกเป็นไฟล์ `hud/SystemsPanel`, `hud/ShipPanel`, `hud/ArrivalPanel`, `hud/ShipyardPanel`, `input/keymap`, `scene/Scene`
- [x] ย้าย key handler ไปไฟล์ keymap เดียว และทำตารางปุ่มให้ HUD ใช้ร่วม; `useKeyboard` ใช้ flight-key codes จาก binding table เดียวกัน
- [x] ตรวจ lifecycle ตอน fold: Scene subtree ถูกสร้างใหม่ต่อ sector, Planet/Earth dispose textures, meteor tracks ถูกลบ/เคลียร์; ทดสอบ fold 2 ครั้งไม่พบ error (ยังไม่ได้ profile heap/GPU memory)
- [x] เพิ่ม unit test (Vitest) สำหรับ logic ที่ pure: `rng`, `sector` (seed เดิม → ผลเดิม), `gravity`, docking geometry, `Pathfinding`, `upgrades`, `gameState` (trySpendScrap, requestArrival) — 14 tests ผ่าน
- [x] เพิ่ม test สำหรับ `runAutopilot` (input → output): หลบอุกกาบาตและสั่งเบรกขณะลงจอดเร็วเกิน safe speed
- [x] เปิด type-aware lint ด้วย `oxlint-tsgolint` (ติดตั้งแล้วและ `npm run lint` ผ่าน)
- [~] ตรวจ performance: code splitting ลด entry chunk จาก ~2,044 kB เหลือ ~80 kB; `cannon` ยัง 585.78 kB (148.94 kB gzip) และ build เตือน chunk >500 kB; วัดได้ 96 FPS ใน browser sample 2 วินาทีขณะมี meteor 1 ลูก (หลัง fold 2 ครั้ง) แต่ยังไม่ใช่ hardware/device benchmark

## Phase 3 — Gameplay เพิ่มเติม (ข้อเสนอ ยังไม่ได้ตัดสินใจ)

- [ ] Save/Load (localStorage): scrap, บล็อกของยาน, tier, relic, เผ่า/รูปลักษณ์
- [ ] Tutorial / onboarding สั้น ๆ ตอนเริ่มเกม (ปุ่มเยอะมาก)
- [x] เมนู pause + ตั้งค่า — ปุ่ม Pause/`Esc`, pause simulation, ปรับ mouse sensitivity และ remap keys พร้อมตรวจ collision
- [x] ตรวจระบบเสียง — ยังไม่พบ audio/sound playback ใน `src/`
- [x] Difficulty presets: Relaxed (30–40s, 0.8×), Standard (15–20s, 1×), Challenging (8–12s, 1.25×); ปรับช่วง meteor และราคาบล็อก/อัปเกรด/fold/ซ่อม
- [x] ตรวจ Hunger/Sanity: ต่ำกว่า 40 ลูกเรือจะหา Food Dispenser/Arcade และฟื้นค่าที่บล็อก; ถ้าไม่มีบล็อกจะแจ้งใน HUD แต่ค่า 0 ยังไม่มี penalty/game-over โดยตรง
- [ ] บล็อกชนิดใหม่ (เช่น เครื่องยนต์เสริม, โล่, ห้องซ่อม) และอัปเกรดอื่น
- [ ] เป้าหมายรอง / เหตุการณ์สุ่มอื่นนอกจากอุกกาบาต
- [x] ตรวจพฤติกรรม hull 0 — hull ถูก clamp ที่ 0, ไม่มี Game Over state; ยานยังบินได้แต่ thrust เหลือ 55%

## Phase 4 — Polish & Release

- [x] รองรับขนาดจอ/ความละเอียดต่าง ๆ, ตรวจ HUD บนจอเล็กที่ viewport 390×844
- [~] Code-splitting / ลดขนาด bundle — แยก Scene แบบ lazy และแบ่ง vendor chunks แล้ว; `cannon` ยังเกิน 500 kB (ยังไม่เปลี่ยน physics engine)
- [x] ตั้ง GitHub Actions CI สำหรับ `npm ci`, lint, test และ build
- [~] ตั้งค่า GitHub Pages — เพิ่ม deploy job ต่อจาก CI และตั้ง Vite base ตามชื่อ repository แล้ว; ต้องเปิด Pages source เป็น GitHub Actions และยังไม่ได้ทดสอบ deploy จริง (ไม่มี remote ใน workspace)
- [x] ตั้งชื่อ title และ meta ให้ตรงเกม (favicon เดิม `/favicon.svg` ยังใช้งานอยู่)

## วิธีกลับมาทำงานต่อ (quick start)

1. อ่าน [KNOWLEDGE.md](KNOWLEDGE.md) หัวข้อ 4 (สถาปัตยกรรม) และ 7 (ข้อควรระวัง)
2. ทำ Phase 0 ให้ครบ
3. เลือกหัวข้อจาก Phase 2 หรือ 3 ติ๊ก `[x]` เมื่อเสร็จ และจดการตัดสินใจสำคัญลงใน Decision Log ด้านล่าง

## Decision Log

| วันที่ | การตัดสินใจ | เหตุผล |
|---|---|---|
| 2026-10-03 | สร้างเอกสารเริ่มต้นจากการอ่านโค้ด | เพื่อกลับมาทำต่อได้ |
