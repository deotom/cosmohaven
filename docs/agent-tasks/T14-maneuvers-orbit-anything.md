# T14 — Maneuvers และ Orbit ได้เกือบทุกอย่าง (Phase V2)

- **Branch:** `feature/maneuvers` (จาก master ล่าสุด)
- **ที่มา:** ผู้ใช้ (2026-10-04): "ควร orbit ได้เกือบทุกอย่าง"
- **แผนอ้างอิง:** `docs/PLAN_CREW_AND_SHIPS.md` หัวข้อ **8.25 ข้อ จ, ช** (อ่านทั้งสองข้อ) และ 8.14 ง
- **Log:** `docs/agent-log/T14-maneuvers.md`
- **ทำก่อน T13** (T13 ใช้คำสั่งที่ T14 เพิ่ม); ไม่ทำพร้อมงานที่แก้ `autopilot.ts`/`targetActions.ts`

## สถานะโค้ดปัจจุบัน (lead ตรวจแล้ว)
- "Orbit" = วงโคจรโน้มถ่วงรอบดาวเคราะห์เท่านั้น (`autopilot.ts` `orbitInsertion`, `[O]`); ใช้กับสถานี/หิน/Scrap ไม่ได้
- `TargetKind` = scrap | relic | survey | planet | station | meteor; `resolveTarget(ref, out)` ใน `targets.ts` ให้ position/velocity/radius ต่อชนิด; **หินแอสเทอรอยด์ไม่อยู่ในระบบเป้าหมายและไม่มี registry**
- ตัวจำลอง `autopilotSim.ts` (T8) รัน `runAutopilot` จริง + แรงโน้มถ่วง + ฟิสิกส์ยาน — **ใช้ตรวจ orbit ได้**
- station มีเขต keep-out ~99 (`STATION_AVOID_RADIUS` ใน `station.ts`)

## ไฟล์ที่แตะได้
- **ใหม่:** `src/game/maneuvers.ts` (pure) + `maneuvers.test.ts`; `src/game/asteroidRegistry.ts` (ทะเบียนหินจากเมช matrix — **ไม่สมัคร physics body ต่อก้อน**) + test
- **แก้ได้:** `src/game/autopilot.ts` (งานใหม่ `orbit-object`, `approach`, `keep-range`, `stop`), `src/game/targets.ts` (`resolveTarget`/ref ใหม่สำหรับ `asteroid` และ `bookmark`), `src/game/gameState.ts` (เฉพาะ `TargetKind` ใหม่ + สถานะหมุด/พารามิเตอร์ orbit — ถ้าเพิ่มฟิลด์ที่ต้องเซฟ ให้ optional + validation + test), `src/game/targetActions.ts` (`actionsFor`/`runAction` ชนิดใหม่และคำสั่งใหม่), `src/game/Asteroids.tsx` (ลงทะเบียนเมช), `src/input/keymap.ts` (`[` `]` รัศมี, สลับทิศ ถ้าไม่ชน), `src/game/autopilotSim.ts` (ถ้าต้องเพิ่มเฉพาะสนับสนุน test)
- **ห้ามแตะ:** `sector.ts`/RNG, `Ship.tsx` (ยกเว้นส่งข้อมูลให้ autopilot ถ้าจำเป็นจริง — รายงานก่อน), `Radar.tsx`/HUD (T13), ฟิสิกส์ลงจอด

## งาน
1. **`orbitController(state, target, params) → AutopilotOutput` (pure):** วนรอบวัตถุที่ระยะ r ด้วยเครื่องยนต์ — เส้นทางวงกลมในระนาบที่กำหนด (ค่าเริ่มต้น: ระนาบที่มีเวกเตอร์ยาน→วัตถุและความเร็วปัจจุบัน; ถ้าความเร็ว≈0 ใช้ระนาบแนวนอนของ sector), ทิศตามเข็ม/ทวนเข็ม, ความเร็ว v ≈ min(เพดาน ~22 u/s, √(a_lat·r)), ตัวควบคุมเข้าวงจากภายนอก/ภายใน (ไม่พุ่งชน), ชดเชยแรงโน้มถ่วงในหลุม (เหมือนการค้างตำแหน่งตอนถึงเป้าใน T8), รัศมีขั้นต่ำ = รัศมีวัตถุ + ระยะปลอดภัยของยาน + keep-out (สถานี) — ถ้า r ต่ำกว่านี้ **ปรับขึ้นพร้อมข้อความ** ไม่ปฏิเสธเงียบ; รัศมีเปลี่ยนสดได้ (`[` `]`) โดยไม่กระชาก
2. **งาน autopilot ใหม่:** `orbit-object`(r, ทิศ, ระนาบ), `approach`(r), `keep-range`(r), `stop` — ใช้ `resolveTarget` เดิม; วัตถุหาย (เก็บแล้ว/หมดอายุ/fold) → หยุดอย่างปลอดภัยและแจ้ง; ระหว่างเข้าวงใช้ตัวหลบสิ่งกีดขวางเดิม (`pathPlanner`); **ห้ามใช้กับ meteor** (อันตราย — เมนูแสดงเทาพร้อมเหตุผล)
3. **ชนิดเป้าใหม่:** `asteroid` (ทะเบียนจากเมช; กรองด้วยระยะ/จัดกลุ่มเพื่อไม่ท่วมเมนู — เรดาร์เป็นงาน T13) และ `bookmark` (จุดในอวกาศที่ผู้เล่นปัก — เก็บเฉพาะใน sector ปัจจุบัน ไม่เซฟข้าม sector ในงานนี้)
4. **เมนูคำสั่ง:** ขยาย `actionsFor`: station/asteroid/scrap/relic/survey/bookmark/planet ได้ Approach · Orbit (พร้อมรัศมีสำเร็จรูป 50/100/250/500/1000 ที่ไม่ต่ำกว่าขั้นต่ำ) · Keep at Range · Align · Stop; planet คง "Enter Orbit" เดิม (วงโน้มถ่วง) และเพิ่ม "Orbit (powered)"; คำสั่งที่ใช้ไม่ได้เทาพร้อมเหตุผล (ตัวเลือกกำหนดเป็นข้อมูล ไม่ฮาร์ดโค้ดกระจาย)
5. **ค่าเริ่มต้นของ r ต่อชนิด** เป็นข้อมูล (ตารางใน 8.25 จ) — แก้เป็นค่าคงที่ที่ต้นไฟล์

## เกณฑ์ผ่าน (วัดได้)
1. test pure + ตัวจำลอง T8: `orbitController` — รัศมีลู่เข้า r ±10% และคงอยู่ ≥ 3 รอบ ที่ tier 1–3 กับสถานี หิน Scrap ดาว (ทั้งสองทิศ); **ไม่ชนวัตถุที่ orbit และสิ่งกีดขวางอื่นใน fuzz ≥ 300 sector** ทุก tier; ในหลุมแรงโน้มถ่วง (ดาวเคราะห์) ไม่ถูกดูดเข้าดาว; เปลี่ยนรัศมีสดไม่กระชากเกินค่าที่ตั้ง; วัตถุหายแล้วหยุดปลอดภัย; ไม่มี NaN ที่ dt 1/240–0.1 s; r ต่ำกว่าขั้นต่ำถูกปรับพร้อมข้อความ (test เป็นข้อความ/ค่าที่ปรับ)
2. test เดิมทั้งหมดผ่าน โดยเฉพาะ `autopilotSim.test.ts` (ตัวเลข crash = 0 เหมือนเดิม) และ test arrival/dock/harvest
3. เมนู: ทุกชนิดมีอย่างน้อย 1 คำสั่งที่ใช้ได้; meteor ไม่มี Orbit; ดาวแก๊สยังไม่มี Land (ตาม T7)
4. **ในเบราว์เซอร์ (headless ช้า ~2 FPS — ใช้ polling + `import('/src/game/*.ts')` ตามวิธีเดิม):** สั่ง orbit กับสถานี หิน และ Scrap แล้วบันทึกระยะจริงจากวัตถุตามเวลา (ตัวเลข) + ภาพวงที่ r ต่างกัน (JPEG เล็ก ≤ ~200 KB ใน `docs/ux/`); ไม่มี console error
5. lint/test/build ผ่าน (ตรวจ exit code ของ build แยก); ไม่มี debug hook ค้าง; sector snapshot ไม่เปลี่ยน (ไม่แตะ `sector.ts`)

## ตรวจเองไม่ได้ (ต้องเขียนใน log)
ความรู้สึกของวงโคจร/ความเร็ว/การเข้าวง, ความพอดีของรัศมีเริ่มต้น, พฤติกรรมที่ FPS จริง

## นอกขอบเขต
UI เรดาร์/Tactical Map/Radial menu (T13), Overview + สถานะการรู้ (8.19), Cruise/Warp (8.23), Realistic delta-v จริง, วงโคจรจริง (Kepler) นอกจากที่มีอยู่, ระบบเสียง, ยาน NPC
