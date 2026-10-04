# T4 — Milestones (ส่วนที่เหลือของเงื่อนไข Phase 0)

- **Branch:** `feature/milestones` (จาก master ล่าสุด)
- **แผนอ้างอิง:** `docs/PLAN_CREW_AND_SHIPS.md` หัวข้อ **8.1.1** (เป้าหมายระยะกลาง) และรายการ Phase 0
- **Log:** `docs/agent-log/T4-milestones.md`
- ⚠️ **ห้ามทำพร้อม T5** (ทั้งคู่เพิ่มฟิลด์ใน `saveGame.ts`/`gameState.ts`)

## เป้าหมาย
เมื่อไม่มี "ชนะแล้วจบ" ผู้เล่นต้องมีเป้าหมายระยะกลางที่ **มาจากสิ่งที่ทำอยู่แล้ว** Contracts (ระยะสั้น) ทำแล้ว; งานนี้ทำ **Milestones**: รายการเหตุการณ์ก้าวหน้าที่ปลดล็อกเองพร้อมรางวัลเล็ก ๆ และบันทึกในเซฟ

## อ่านก่อน
- `src/game/gameState.ts` (`gameStats`, `notify`, `STORAGE_TECHS`), `src/game/upgrades.ts` (tier), `src/game/contracts.ts` (`gameStats.contracts.completed`), `src/game/shipState.ts` (`blocks`)
- `src/game/saveGame.ts` — วิธีเพิ่มฟิลด์ **optional** ให้เซฟเก่ายังโหลดได้ (ดู `contracts` เป็นตัวอย่าง: type, `isGameData`, snapshot, `restoreSave`, `resetNewGame`)
- `src/game/contracts.test.ts` — ตัวอย่าง test ที่ครอบคลุมเซฟ/โหลด และรูปแบบ `beforeEach`
- `src/hud/HelpOverlay.tsx` (ที่จะแสดงรายการชั่วคราว)

## ไฟล์ที่แตะได้
- **ใหม่:** `src/game/milestones.ts`, `src/game/milestones.test.ts`
- **แก้ได้:** `src/game/gameState.ts` (ฟิลด์ `milestones` + ตัวนับที่ขาด), `src/game/saveGame.ts` (ฟิลด์ optional), `src/hud/HelpOverlay.tsx` (แสดงรายการ), `src/App.tsx` (เรียกตัวประเมินแบบ interval — น้อยที่สุด), และจุดที่ต้องนับ (เช่น `fold.ts` นับ fold สำเร็จ, `Ship.tsx` นับลงจอด — แก้เฉพาะบรรทัดนับ)

## สเปก
1. **ข้อมูล (data-driven) ใน `milestones.ts`:** `{ id, title, description, reward (HC), when(snapshot) }` อย่างน้อย **8 รายการ** เสนอ:
   `first-contract` (ส่งสัญญา 1), `five-contracts` (5), `six-blocks` (ยาน ≥ 6 บล็อก), `first-fold` (fold สำเร็จ 1 ครั้ง), `harvester-t2`, `autopilot-t2`, `first-landing` (ลงจอดสำเร็จบนดาวใดก็ได้ที่ไม่ใช่จุดเริ่มต้น), `engine-module` (มี Engine Module ≥ 1)
2. **ตัวประเมินบริสุทธิ์:** `evaluateMilestones(snapshot, claimed: ReadonlySet<string>) → string[]` (id ที่เพิ่งสำเร็จ) — `snapshot` เป็น object ธรรมดา สร้างจาก state ด้วยฟังก์ชันแยก (`takeSnapshot()`)
3. **ตัวนับที่ยังไม่มี** ต้องเพิ่ม: จำนวน fold สำเร็จ, จำนวนครั้งลงจอด — เก็บใน `gameStats` (เช่น `stats.folds`, `stats.landings`) และ **ในเซฟแบบ optional**
4. **ปลดล็อก:** เมื่อสำเร็จ → เพิ่ม id เข้า `gameStats.milestones` (ชุดที่รับรางวัลแล้ว) **ครั้งเดียว**, เพิ่ม HC ตาม `reward`, `notify(...)` toast; ประเมินแบบ interval (~1 วินาที) ไม่ใช่ทุกเฟรม
5. **เซฟ/โหลด:** ฟิลด์ optional `milestones: string[]` + ตัวนับ; validation (id ต้องอยู่ในรายการที่รู้จัก ไม่ซ้ำ); เซฟเก่าไม่มีฟิลด์ → ค่าว่าง; `resetNewGame` ล้าง
6. **UI ชั่วคราว:** แสดงรายการ (สำเร็จ/ยังไม่สำเร็จ + รางวัล) ใน `HelpOverlay` (ภายหลังย้ายไปเมนู `Tab` ใน X2); **ห้ามเพิ่มบรรทัดบน HUD ที่โชว์ตลอด**
7. **รางวัลต้องเล็ก** (ค่าตั้งต้นเสนอ 10–60 HC) และใช้ `adjustedCost`/ตัวคูณความยากเฉพาะที่เหมาะสม — อธิบายเหตุผลใน log (อย่าให้รางวัลทำลายสมดุลเศรษฐกิจเริ่มต้น: เริ่มเกมมี 100 HC, บล็อก hull 10, engine 60)

## เกณฑ์ผ่าน (วัดได้)
1. `evaluateMilestones`: ไม่คืน id ที่รับรางวัลแล้ว; คืนครบเมื่อเงื่อนไขจริง; ไม่คืนเมื่อไม่ถึง (ครอบคลุมทุกรายการ)
2. ปลดล็อกครั้งเดียว: ประเมินซ้ำหลายรอบ HC เพิ่มครั้งเดียว
3. เซฟ/โหลด round-trip ถูกต้อง; **เซฟเก่า (ไม่มีฟิลด์) โหลดได้**; ข้อมูลผิดรูปถูกปฏิเสธ; new game ล้างค่า
4. ตัวนับ fold/ลงจอดเพิ่มถูกต้องและไม่นับซ้ำ (fold ที่ถูกยกเลิก/ขัดจังหวะไม่นับ — ดู `fold.ts`)
5. ในเบราว์เซอร์: ทำเงื่อนไขหนึ่งข้อ (เช่น ส่งสัญญา 1 ครั้ง ถ้าทำได้ หรือใช้ debug hook ชั่วคราวที่ **ลบออกก่อนจบ**) เห็น toast และรายการใน `?`
6. `npm run lint`, `npm test`, `npm run build` ผ่าน

## ข้อควรระวัง
- test ใน **ไฟล์ใหม่** (`milestones.test.ts`) ไม่ต่อท้าย `game.test.ts`
- mutation ของ store ทำในฟังก์ชัน module-level (lint ไม่ให้ mutate ใน component)
- อย่าให้ตัวประเมินแตะ React state 60 fps

## นอกขอบเขต
Codex/เมนู `Tab` (X2), Cartographer, Genesis Schematics (8.6), ระบบทักษะ, รางวัลที่ปลดล็อกบล็อก/เทคโนโลยี
