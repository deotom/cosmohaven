# T5 — พิกัด sector แบบ deterministic (ฐานของจักรวาลไม่จำกัด)

- **Branch:** `feature/sector-addressing` (จาก master ล่าสุด **หลังรวม T4 แล้ว**)
- **แผนอ้างอิง:** `docs/PLAN_CREW_AND_SHIPS.md` หัวข้อ **8.4** (ก, ข, ง, ช) และ Phase U ข้อแรก
- **Log:** `docs/agent-log/T5-sector-addressing.md`
- ⚠️ **ทำคนเดียว** — แตะ `fold.ts`, `sector.ts`, `saveGame.ts`, `gameState.ts` พร้อมกัน ห้ามเปิดพร้อม T4

## เป้าหมาย
ตอนนี้ `fold.ts` สร้าง sector ใหม่จาก **`Math.random()`** ทุกครั้งที่ fold (`jump()`) และนับ `nextSectorId` ไปเรื่อย ๆ — **sector ไม่มีพิกัด กลับไป sector เดิมไม่ได้** ต้องเปลี่ยนเป็น **sector ที่ระบุตำแหน่งได้ ได้ผลเดิมเสมอจากพิกัดเดิม** เพื่อเป็นฐานของจักรวาลไม่จำกัด (ยังไม่ต้องมีแผนที่ดาว/เลือกปลายทาง)

## อ่านก่อน
- `src/game/fold.ts` (`jump`, `buildDestination`, `setNextSectorId`), `src/game/sector.ts` (`generateSector(seed, id)`, `earthSector`, `homeSector`, `enterSector`), `src/game/rng.ts` (`mulberry32`)
- `src/game/saveGame.ts` — เซฟเก็บ `sector` ทั้งก้อนอยู่แล้ว (`save.sector`) และเรียก `setNextSectorId`; ดูวิธีเพิ่มฟิลด์ optional
- `src/game/fold.test.ts`, `src/game/game.test.ts` (test เดิมของ sector/fold ต้องผ่านทั้งหมด)

## ไฟล์ที่แตะได้
- **ใหม่:** `src/game/universe.ts`, `src/game/universe.test.ts`
- **แก้ได้:** `src/game/fold.ts`, `src/game/sector.ts` (เพิ่มฟังก์ชัน; **ห้ามเปลี่ยนผลลัพธ์ของ `generateSector(seed, id)` ต่อ seed เดิม**), `src/game/gameState.ts` (ฟิลด์ `universe`), `src/game/saveGame.ts` (ฟิลด์ optional)

## สเปก
1. **`universe.ts`:**
   - `type SectorCoords = readonly [number, number, number]` (จำนวนเต็ม)
   - `hash32(universeSeed: number, coords: SectorCoords): number` — hash คุณภาพดี (เช่น cyrb53 ตัดเป็น 32 บิต หรือ splitmix) ที่ผลคงที่ข้ามเครื่อง/รอบ (ไม่ใช้ `Math.random`)
   - `sectorAt(universeSeed, coords, id?) → Sector` — เรียก `generateSector(hash32(...), id)`; **พิกัดเดียวกัน → sector เท่ากันทุกค่า (deep equal)**
   - `neighbourCoords(universeSeed, from, foldIndex) → SectorCoords` — เลือกพิกัดปลายทางของ fold ครั้งถัดไปแบบ **deterministic จาก seed + ลำดับ fold** (ระยะ ±1–3 ต่อแกน ไม่ซ้ำพิกัดปัจจุบัน) — ยังไม่ต้องมี UI เลือกเอง
2. **State:** `gameStats.universe = { seed, coords, folds }` (หรือโครงสร้างเทียบเท่า) — game ใหม่สุ่ม `seed` **ครั้งเดียวตอนเริ่มเกม** (ไม่ใช่ทุก fold); Home sector อยู่ที่ `[0,0,0]`
3. **`fold.ts`:** `jump()` ใช้ `neighbourCoords` + `sectorAt`; **ห้ามมี `Math.random()` ในเส้นทาง fold อีก**; กฎ Earth 2.0 เดิม (Relic ≥ `RELICS_NEEDED` → Earth sector) คงไว้ก่อน (จะเปลี่ยนใน 8.6 ภายหลัง) แต่ Earth ต้องมีพิกัดที่กำหนดแน่นอนด้วย (เช่น จาก hash ของ seed) ไม่ใช่ "fold ครั้งถัดไป"
4. **เซฟ:** ฟิลด์ optional `universe` (seed, coords, folds); validation (จำนวนเต็มในช่วงสมเหตุผล); **เซฟเก่าที่ไม่มี `universe`** → กำหนด `seed` ใหม่และ `coords = [0,0,0]` ถ้า sector ปัจจุบันคือ Home หรือพิกัดใหม่ที่ไม่ชน แล้วโหลดได้ปกติ (อธิบายการตัดสินใจใน log); `resetNewGame` สุ่ม seed ใหม่
5. **ไม่ต้องทำ:** แผนที่ดาว, เลือกปลายทาง, ราคาตามระยะ, delta ของ sector (Scrap ที่เก็บแล้วยังหายตอนกลับ — ยอมรับก่อน; บันทึกเป็นข้อจำกัดใน log), กาแล็กซีหลายชั้น

## เกณฑ์ผ่าน (วัดได้)
1. **determinism:** `sectorAt(seed, coords)` สองครั้ง → deep equal; พิกัดต่างกัน → ต่างกัน (ตัวอย่างหลายพันพิกัด ไม่เหมือนกันเกินโอกาสชนที่ยอมรับได้ — ระบุเกณฑ์)
2. **chain:** เริ่มด้วย seed เดียวกัน fold N ครั้ง → ได้ลำดับพิกัด/sector เหมือนเดิมทุกรอบ; ต่าง seed → ต่าง
3. **revisit:** ไปพิกัด A → B → กลับ A ได้ sector A เหมือนครั้งแรก (โครงสร้าง; Scrap ที่เก็บแล้วยังไม่เก็บ delta)
4. **ผลต่อ seed เดิมไม่เปลี่ยน:** snapshot ของ `generateSector(seed, id)` สำหรับ seed ตัวอย่าง ≥ 200 ค่า เหมือนก่อนแก้ทุกค่า (เก็บ snapshot ไว้ก่อนเริ่มแก้)
5. **เซฟ:** round-trip ถูกต้อง; เซฟเก่าโหลดได้; ข้อมูลผิดรูปถูกปฏิเสธ
6. ทุก sector ที่สร้างผ่าน `arrivalHazard` (มีอยู่แล้วใน `sector.ts`) สำหรับพิกัด ≥ 3,000 ค่า
7. test เดิมทั้งหมดผ่าน (โดยเฉพาะ `fold.test.ts`: เงื่อนไข/ยกเลิก/ขัดจังหวะ/การคืนเงิน ต้องไม่เปลี่ยน)
8. ในเบราว์เซอร์: fold 2–3 ครั้งได้ sector ต่างกัน, reload แล้ว CONTINUE ยังอยู่ที่เดิม; ไม่มี console error
9. `npm run lint`, `npm test`, `npm run build` ผ่าน

## ข้อควรระวัง
- **ห้ามแตะสตรีมสุ่มภายใน `generateSector`** (ลำดับการเรียก `rand()` เปลี่ยน → ทุก seed เดิมเปลี่ยนหน้าตา) — ถ้าต้องการข้อมูลเพิ่มใช้ hash สายแยก
- เซฟเก็บ `sector` ทั้งก้อน: เก็บพิกัดเพิ่มได้โดยไม่ต้องสร้างใหม่จากพิกัดตอนโหลด (ลดความเสี่ยง)
- เลขที่ใช้เป็น seed ต้องเป็นจำนวนเต็ม 32 บิตที่ `mulberry32` รับได้
- ถ้าจะเปลี่ยนอัลกอริทึม hash ภายหลังจะทำให้พิกัดเดิมคนละที่ — **เขียนเวอร์ชันของ generator ลงในโค้ด/เซฟ** (`generatorVersion: 1`) ไว้ตั้งแต่ตอนนี้

## นอกขอบเขต
UI แผนที่ดาว, เลือกปลายทาง, ราคา fold ตามระยะ, Galaxy Profile, ระดับ Fade/security, delta persistence, Intergalactic Drive
