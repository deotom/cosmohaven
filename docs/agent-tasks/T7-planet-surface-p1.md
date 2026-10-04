# T7 — ผิวดาวและประสบการณ์ลงจอด (Phase P0–P1)

- **Branch:** `feature/planet-surface` (จาก master ล่าสุด)
- **แผนอ้างอิง:** `docs/PLAN_CREW_AND_SHIPS.md` หัวข้อ **8.15** (อ่านทั้งหัวข้อ)
- **Log:** `docs/agent-log/T7-planet-surface.md`
- ⚠️ แตะ `Planet.tsx`, `Earth.tsx`, `Ship.tsx` (ส่วนลงจอด), `ArrivalPanel.tsx`, `autopilot.ts` (land) — **ไม่ทำพร้อม T6** และต้องตรวจ git status ก่อน

## เป้าหมาย
ผู้ใช้ทดสอบแล้วพบว่า **ตอนลงจอดไม่มีพื้นผิวดาว รู้สึกเหมือนพุ่งเข้าไปในดาว** ทำให้ลงจอดแล้วรู้สึกแตะพื้นจริง (P1) โดย **วินิจฉัยด้วยตัวเลขก่อนแก้** (P0)

## อ่านก่อน
- `src/game/Planet.tsx` (sphere 96×64 + texture/bump จาก `textures.ts`, collider `useSphere … Static`), `src/game/Earth.tsx`
- `src/game/Ship.tsx` ช่วง touchdown (~บรรทัด 466–490: `altitude`, `LAND_ALTITUDE`, `SAFE_LANDING_SPEED`, สถานะ `landed`)
- `src/game/autopilot.ts` — `LAND_ALTITUDE = 5` (ความสูงของ **จุดศูนย์กลางยาน**), งาน `land`/`descentController`
- `src/hud/ArrivalPanel.tsx` (ปุ่มลงจอด), `src/game/ReentryEffects.tsx` (เอฟเฟกต์เดิมที่ใช้อนุภาค/สั่นกล้อง — ใช้เป็นรูปแบบ), `src/game/rng.ts`
- `src/game/sector.ts` — `makePlanet` (รัศมี 40–150), `PlanetSpec`; `AGENTS.md` ข้อห้ามแตะสตรีมสุ่มของ `generateSector`

## ไฟล์ที่แตะได้
- **ใหม่:** `src/game/surfaceDetail.ts` (+ test), เช่น `src/game/GroundProps.tsx`, `src/game/LandingDust.tsx`
- **แก้ได้:** `Planet.tsx`, `Earth.tsx`, `Ship.tsx` (เฉพาะส่วนตรวจแตะพื้น/เรียกเอฟเฟกต์), `ArrivalPanel.tsx`, `autopilot.ts` (เฉพาะการปฏิเสธ land บนดาวแก๊ส), `PlanetSpec` ถ้าต้องเพิ่ม `landable` (ต้องทำแบบไม่เปลี่ยนผลของ `generateSector` ต่อ seed เดิม)

## งาน
### P0 — วินิจฉัย (ทำก่อน และรายงานเป็นตัวเลข)
วัดตอนแตะพื้นจริง (ผ่านเบราว์เซอร์ + debug hook ชั่วคราวที่ **ต้องลบก่อนจบ** หรือจำลองด้วย cannon-es ใน test): ระยะศูนย์กลางดาว→ศูนย์กลางยานเทียบรัศมีภาพ/รัศมี collider; ขนาดครึ่งของยาน; ผู้ใช้เห็น (1) ภาพเรียบจนไม่รู้สึกมีพื้น, (2) ยานทะลุผิวภาพ, หรือ (3) กล้องทะลุผิว? — ระบุข้อสรุปพร้อมหลักฐาน; แก้ถ้าภาพ/collider/จุดแตะไม่ตรงกัน

### P1 — ผิวดาวระยะใกล้
1. **detail layer:** shader (triplanar noise ฯลฯ) ผสมกับ texture เดิมเมื่อยานต่ำกว่าระยะที่กำหนด **ไม่เพิ่มไฟล์ภาพ**; ค่าความเข้มเป็นฟังก์ชันบริสุทธิ์ของความสูง (monotonic)
2. **ground props:** หิน/ก้อนน้ำแข็ง instanced วาง **deterministic** จาก hash ของ (ชื่อ/seed ดาว, เซลล์บนผิว); เปิดเฉพาะเมื่อต่ำกว่าระยะที่กำหนด; เพดานจำนวน (ค่าตั้งต้นเสนอ ≤ 400); ไม่มีบนดาวแก๊ส; **ไม่มี collider**
3. **เอฟเฟกต์แตะพื้น:** ฝุ่น/ละอองจากเครื่องยนต์เมื่อต่ำกว่า ~25 หน่วย (ขนาดตาม `gameStats.thrustLevel`), สั่นเล็กน้อยตอนแตะ; สถานะ `landed` เห็นชัดบน HUD (ข้อความ `LANDED ON …` มีอยู่ — ไม่ต้องเพิ่มบรรทัดที่โชว์ตลอด)
4. **ดาวแก๊สไม่ลงจอด:** `landable: false` (หรือคำนวณจาก `look.kind === 'gas'`); ปุ่มลงจอดใน `ArrivalPanel` ซ่อน/ปฏิเสธพร้อมเหตุผล; `autopilot` งาน `land` ปฏิเสธพร้อมสถานะ; **ไม่เปลี่ยนตรรกะเบรก/ความเร็วปลอดภัย (≤ 12 u/s) ของดาวแข็ง**
5. ห้ามเพิ่มความสูงต่ำของ **ภาพ** เกินกว่าที่ collider ทรงกลมรองรับ (heightfield เป็น P3 — นอกขอบเขต)

## เกณฑ์ผ่าน
1. P0: รายงานตัวเลขและข้อสรุป (1)/(2)/(3) ใน log; ถ้าแก้ความไม่ตรงกัน ต้องมี test หรือการวัดก่อน/หลัง
2. test บริสุทธิ์ (ไฟล์ใหม่): การวางวัตถุ deterministic ต่อ (seed, เซลล์) · ไม่เกินเพดาน · ไม่มีบนดาวแก๊ส · ฟังก์ชันความเข้ม detail ตามความสูง monotonic · `landable` ของดาวแก๊ส = false และดาวหิน/น้ำแข็ง = true
3. **sector เดิมไม่เปลี่ยน:** snapshot ของ `generateSector(seed, id)` ≥ 200 seed เหมือนก่อนแก้ทุกค่า (เก็บ snapshot ก่อนเริ่ม)
4. ภาพก่อน/หลังที่ความสูง ~200 / 50 / 10 / แตะพื้น (JPEG เล็ก ≤ ~200 KB ต่อภาพ ใน `docs/ux/`) แนบใน log
5. test เดิมทั้งหมดผ่าน (โดยเฉพาะ test ลงจอด/arrival/autopilot); lint/test/build ผ่าน (ตรวจ exit code build แยก); ไม่มี console error
6. FPS: รายงานตัวเลขที่วัดได้ (หรือบอกตรง ๆ ว่าวัดไม่ได้ใน headless) พร้อมเพดานที่ตั้ง

## **ตรวจเองไม่ได้ (ต้องเขียนใน log)**
ว่าผิวดาวใหม่ "ดูดี/รู้สึกแตะพื้น" หรือไม่ — เป็นความรู้สึก ต้องให้ผู้ใช้ลองลงจอด แนบภาพแล้วระบุว่าเป็นข้อเสนอ ไม่ใช่ข้อสรุป

## นอกขอบเขต
ภูมิประเทศจริง/heightfield/collider ภูมิประเทศ (P3), ลูกเรือเดินบนผิวดาว, Outpost, สัตว์ประจำถิ่น, biome ตามโมเดลสภาพแวดล้อม (P2), ขาลงจอด, ระบบเสียง
