# Cosmohaven — Plan & Checklist

ความรู้พื้นฐานดูที่ [KNOWLEDGE.md](KNOWLEDGE.md)
สัญลักษณ์: `[x]` = เสร็จและตรวจแล้ว · `[~]` = ยังต้องยืนยัน/มี blocker · `[ ]` = ยังไม่เริ่ม
อัปเดตสถานะล่าสุด: **2026-10-04**

## Phase 0 — เตรียมการทำงานต่อ (ทำก่อน)

- [x] `git init` + commit สถานะเริ่มต้น (`a0e8a1f`)
- [~] ตรวจ dependencies/เปิดเกม/เล่นให้จบหนึ่งรอบ — dependencies พร้อม; smoke test ผ่านหน้าเริ่มเกม → Crew Registration → Shipyard → ข้าม tutorial → autosave/reload/Continue; **ยังไม่ได้ยืนยัน campaign เต็มจนชนะบน gameplay จริง**
- [x] `npm run build` ผ่าน (ตรวจเมื่อ 2026-10-04; มีคำเตือน chunk `cannon` ด้านล่าง)
- [x] `npm run lint` ผ่าน (ตรวจเมื่อ 2026-10-04)
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
- [x] เพิ่ม unit test (Vitest) สำหรับ logic ที่ pure: `rng`, `sector` (seed เดิม → ผลเดิม), `gravity`, docking geometry, `Pathfinding`, `upgrades`, `gameState` (trySpendCredits, requestArrival) — tests ผ่าน
- [x] เพิ่ม test สำหรับ `runAutopilot` (input → output): หลบอุกกาบาตและสั่งเบรกขณะลงจอดเร็วเกิน safe speed
- [x] เปิด type-aware lint ด้วย `oxlint-tsgolint` (ติดตั้งแล้วและ `npm run lint` ผ่าน)
- [~] ตรวจ performance: `npm run build` (2026-10-04) ให้ entry chunk 115.68 kB (37.40 kB gzip); `cannon` 585.78 kB (148.94 kB gzip) ยังเกิน 500 kB. **ยังไม่มีการ profile FPS/heap/GPU แบบต่อเนื่องหลังเล่น/fold ซ้ำบน hardware เป้าหมาย**; ค่า FPS sample เดิม 96 FPS/2 วินาทีไม่ถือเป็น benchmark หรือ memory-plateau verification

## Phase 3 — Gameplay เพิ่มเติม (ขอบเขตที่อนุมัติแล้ว)

- [x] Autosave ช่องเดียว + Continue/New Game (localStorage): HC, cargo, storage tech, บล็อก/คิวสร้าง/ตำแหน่งยาน, tier, relic, ลูกเรือ, difficulty และ sector ปัจจุบัน; ตรวจ schema ก่อนโหลด
- [x] Tutorial / onboarding แบบ skippable 4 ขั้น: สร้างยาน, บิน/เก็บ cargo, Trade Relay, Space-Fold/เป้าหมาย; แสดงครั้งแรกและบันทึกสถานะที่ข้าม/จบแล้ว
- [x] เมนู pause + ตั้งค่า — ปุ่ม Pause/`Esc`, pause simulation, ปรับ mouse sensitivity และ remap keys พร้อมตรวจ collision
- [x] ตรวจระบบเสียง — ยังไม่พบ audio/sound playback ใน `src/`
- [x] Difficulty presets: Relaxed (30–40s, 0.8×), Standard (15–20s, 1×), Challenging (8–12s, 1.25×); ปรับช่วง meteor และราคาบล็อก/อัปเกรด/fold/ซ่อม
- [x] ตรวจ Hunger/Sanity: ต่ำกว่า 40 ลูกเรือจะหา Food Dispenser/Arcade และฟื้นค่าที่บล็อก; ถ้าไม่มีบล็อกจะแจ้งใน HUD แต่ค่า 0 ยังไม่มี penalty/game-over โดยตรง
- [x] Ship Modules: Engine (+25% thrust ต่อบล็อก สูงสุด 4), Shield (ลด impact damage 20% ต่อบล็อก สูงสุด 3), Repair Bay (ลูกเรือซ่อม 5 hull/s เมื่อ hull <75%); แสดงผลใน Shipyard/Systems และ remap ปุ่มเลือก 1–6 ได้
- [x] Cargo economy: Haven Credits, จำกัด cargo 8 units, ขาย Scrap/Survey Data ที่ Trade Relay/drydock และ storage tech 3 แบบ
- [x] เป้าหมายรอง / เหตุการณ์สุ่มอื่นนอกจากอุกกาบาต — Survey Beacon แบบ optional ใน sector ที่สร้างจาก seed; กู้ข้อมูลเข้า cargo และขายได้
- [x] ตรวจพฤติกรรม hull 0 — hull ถูก clamp ที่ 0, ไม่มี Game Over state; ยานยังบินได้แต่ thrust เหลือ 55%

## Phase 4 — Polish & Release

- [x] รองรับขนาดจอ/ความละเอียดต่าง ๆ, ตรวจ HUD บนจอเล็กที่ viewport 390×844
- [~] Code-splitting / ลดขนาด bundle — แยก Scene แบบ lazy และแบ่ง vendor chunks แล้ว; ณ 2026-10-04 `cannon` ยัง 585.78 kB หลัง minify (148.94 kB gzip) และยังเตือน >500 kB. `@react-three/cannon` ส่ง dist เป็น bundled entry; ต้องประเมินการแยก physics package/engine ก่อนเปลี่ยน dependency (ยังไม่แก้ด้วยการเพิ่ม warning limit)
- [x] ตั้ง GitHub Actions CI สำหรับ `npm ci`, lint, test และ build
- [~] ตั้งค่า GitHub Pages — workflow มี upload/deploy job และ Vite base รองรับชื่อ repository แล้ว; สร้าง public repository [deotom/cosmohaven](https://github.com/deotom/cosmohaven) และตั้ง `origin` ใน local แล้ว แต่ repository ยังว่าง จึงยัง publish ไม่ได้. ต้อง push branch, เลือก Pages source เป็น GitHub Actions และตรวจ deployment URL จริง
- [x] ตั้งชื่อ title และ meta ให้ตรงเกม (favicon เดิม `/favicon.svg` ยังใช้งานอยู่)

## สิ่งที่ยังต้องปิดก่อนถือว่า PLAN.md เสร็จ

รายการ feature ใน Phase 1–3 และ CI ที่ทำได้จาก workspace เสร็จแล้ว; สถานะ `[~]` ที่เหลือเป็น verification/deployment gates ไม่ใช่งานที่ติ๊กผ่านได้จากการอ่านโค้ด:

1. **Campaign win:** เล่นจาก New Game จนเก็บ 5 Signal Relics, fold ไป Earth 2.0 และลงจอดปลอดภัย; บันทึกผลและข้อผิดพลาดที่พบ (full-playthrough ยังไม่ยืนยัน)
2. **Performance:** profile session ที่เล่น/fold หลายรอบบน browser/device เป้าหมาย พร้อม FPS และ heap/GPU memory ก่อน-หลัง เพื่อยืนยัน plateau; benchmark 2 วินาทีเดิมไม่เพียงพอ
3. **Bundle:** ตรวจทางลด `cannon` chunk โดยไม่เปลี่ยน physics behavior; ถ้าต้องเปลี่ยน physics engine ให้แยกเป็นงาน migration พร้อม regression tests
4. **GitHub Pages:** สร้าง [deotom/cosmohaven](https://github.com/deotom/cosmohaven) แล้วและ local `origin` ชี้มาที่ repo; ตอนนี้ remote ยังไม่มี source files และหน้า Pages ระบุว่ายัง disabled. หลัง push branch ให้เลือก Pages source เป็น GitHub Actions แล้วตรวจ workflow run และ URL จริง

## วิธีกลับมาทำงานต่อ (quick start)

1. อ่าน [KNOWLEDGE.md](KNOWLEDGE.md) หัวข้อ 4 (สถาปัตยกรรม) และ 7 (ข้อควรระวัง)
2. ปิด verification gates ที่ระบุข้างบน; อย่าทำเครื่องหมาย `[x]` หากยังไม่มีผลทดสอบ/หลักฐาน
3. งาน feature ใหม่สำหรับตัวละครและยานสำรวจอยู่ใน [PLAN_CREW_AND_SHIPS.md](PLAN_CREW_AND_SHIPS.md) และเป็น roadmap แยกจาก checklist นี้

## Decision Log

| วันที่ | การตัดสินใจ | เหตุผล |
|---|---|---|
| 2026-10-03 | สร้างเอกสารเริ่มต้นจากการอ่านโค้ด | เพื่อกลับมาทำต่อได้ |
| 2026-10-04 | แยกสถานะ feature completion ออกจาก campaign/performance/deployment verification | ไม่รายงานการชนะ, memory plateau หรือ GitHub Pages deployment ว่าผ่านโดยไม่มีการทดสอบจริง |
