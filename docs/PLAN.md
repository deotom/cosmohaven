# Cosmohaven — Plan & Checklist

ความรู้พื้นฐานดูที่ [KNOWLEDGE.md](KNOWLEDGE.md)
สัญลักษณ์: `[x]` = มีในโค้ดแล้ว (ยืนยันจากการอ่านโค้ด ไม่ได้รันเกม) · `[ ]` = ยังไม่ทำ / ยังไม่ยืนยัน

## Phase 0 — เตรียมการทำงานต่อ (ทำก่อน)

- [ ] `git init` + commit สถานะปัจจุบัน (ตอนนี้ไม่ใช่ git repo เสี่ยงงานหาย)
- [ ] `npm install` แล้วรัน `npm run dev` เปิดเกม เล่นให้จบหนึ่งรอบเพื่อดูสถานะจริง
- [ ] `npm run build` ผ่านหรือไม่ (ยังไม่ได้ตรวจ)
- [ ] `npm run lint` ผ่านหรือไม่ (ยังไม่ได้ตรวจ)
- [ ] แก้ README.md ให้เป็นคำอธิบายเกมจริง (ตอนนี้เป็น template ของ Vite)
- [ ] ลบ comment ลอย `1-based tiers` ใน `gameState.ts` และไฟล์ asset ที่ไม่ได้ใช้ (`react.svg`, `vite.svg`, `hero.png` ถ้าไม่ได้ import)

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

- [ ] แยก `App.tsx` ออกเป็นไฟล์ (`hud/SystemsPanel`, `hud/ShipPanel`, `hud/ArrivalPanel`, `hud/ShipyardPanel`, `input/keymap`, `scene/Scene`)
- [ ] ย้าย key handler ไปไฟล์ keymap เดียว และทำตารางปุ่มให้ HUD ใช้ร่วม (ตอนนี้ข้อความปุ่มใน HUD กับ handler แยกกัน)
- [ ] ตรวจ memory leak เมื่อ fold หลายครั้ง (geometry/texture/physics body ของ sector เก่าถูก dispose หรือไม่)
- [ ] เพิ่ม unit test (Vitest) สำหรับ logic ที่ pure: `rng`, `sector` (seed เดิม → ผลเดิม), `gravity`, `docking`, `Pathfinding`, `upgrades`, `gameState` (trySpendScrap, requestArrival)
- [ ] เพิ่ม test สำหรับ `runAutopilot` (input → output) เช่น หลบอุกกาบาต, ลงจอดไม่เกิน 12 u/s
- [ ] เปิด type-aware lint ตามที่ README แนะนำ (`oxlint-tsgolint`)
- [ ] ตรวจ performance: FPS ตอนมีอุกกาบาต + หลาย sector, `dpr`, shadow

## Phase 3 — Gameplay เพิ่มเติม (ข้อเสนอ ยังไม่ได้ตัดสินใจ)

- [ ] Save/Load (localStorage): scrap, บล็อกของยาน, tier, relic, เผ่า/รูปลักษณ์
- [ ] Tutorial / onboarding สั้น ๆ ตอนเริ่มเกม (ปุ่มเยอะมาก)
- [ ] เมนู pause + ตั้งค่า (sensitivity เมาส์, ปุ่ม)
- [ ] เสียง (engine, beam, alarm อุกกาบาต, ambient) — ตรวจก่อนว่ามีแล้วหรือไม่
- [ ] ความยากปรับได้ (ความถี่อุกกาบาต, ราคา)
- [ ] Hunger/Sanity ที่ต่ำมีผลจริงต่อเกม (ตรวจว่าตอนนี้มีผลอะไร)
- [ ] บล็อกชนิดใหม่ (เช่น เครื่องยนต์เสริม, โล่, ห้องซ่อม) และอัปเกรดอื่น
- [ ] เป้าหมายรอง / เหตุการณ์สุ่มอื่นนอกจากอุกกาบาต
- [ ] หน้าจอ Game over (hull 0 เกิดอะไรขึ้นตอนนี้? ตรวจ)

## Phase 4 — Polish & Release

- [ ] รองรับขนาดจอ/ความละเอียดต่าง ๆ, ตรวจ HUD บนจอเล็ก
- [ ] Code-splitting / ลดขนาด bundle (three ใหญ่)
- [ ] ตั้งค่า deploy (static hosting) + `npm run build` ใน CI
- [ ] ตั้งชื่อ title/favicon/meta ให้ตรงเกม

## วิธีกลับมาทำงานต่อ (quick start)

1. อ่าน [KNOWLEDGE.md](KNOWLEDGE.md) หัวข้อ 4 (สถาปัตยกรรม) และ 7 (ข้อควรระวัง)
2. ทำ Phase 0 ให้ครบ
3. เลือกหัวข้อจาก Phase 2 หรือ 3 ติ๊ก `[x]` เมื่อเสร็จ และจดการตัดสินใจสำคัญลงใน Decision Log ด้านล่าง

## Decision Log

| วันที่ | การตัดสินใจ | เหตุผล |
|---|---|---|
| 2026-10-03 | สร้างเอกสารเริ่มต้นจากการอ่านโค้ด | เพื่อกลับมาทำต่อได้ |
