# T1 — Autopilot หลบสิ่งกีดขวาง (Phase V1)

- **Branch:** `feature/autopilot-avoidance` (จาก master ล่าสุด)
- **แผนอ้างอิง:** `docs/PLAN_CREW_AND_SHIPS.md` หัวข้อ **8.14 ค** (อ่านเฉพาะหัวข้อนี้ + ก)
- **Log:** `docs/agent-log/T1-autopilot-avoidance.md`

## เป้าหมาย
ตอนนี้ autopilot บินเส้นตรงไปเป้าหมาย: หลบได้เฉพาะ **อุกกาบาตที่เคลื่อนที่** และเฉพาะ tier ≥ 2 (`avoidMeteors` ใน `autopilot.ts`) — **ไม่หลบดาวเคราะห์ แอสเทอรอยด์ที่อยู่กับที่ หรือสถานี**
ทำให้ autopilot **วางเส้นทางอ้อมสิ่งกีดขวางเหล่านี้ได้ ในทุก tier** (เป็นพื้นฐานความปลอดภัย; tier สูงขึ้นไม่ได้ทำให้ชนได้)

## อ่านก่อน
- `src/game/autopilot.ts` — `AutopilotInput`, `flyTo` (~บรรทัด 217), `navTask` (~269), `harvestTask`, `dockTask`, `runAutopilot` (~558), `avoidMeteors` (~176)
- `src/game/sector.ts` — `Sector.asteroids` (`{position, radius, spin}`), `Sector.stations`, `Sector.planets`
- `src/game/gameState.ts` — `CELESTIAL_BODIES` (`radius`, `wellRadius`, `atmosphereHeight`)
- `src/game/station.ts` — `STATION_KEEP_OUT` (85)
- `src/game/game.test.ts` — รูปแบบ test ของ `runAutopilot` (input → output)
- `src/game/Ship.tsx` — จุดที่เรียก `runAutopilot` และสร้าง `AutopilotInput`

## ไฟล์ที่แตะได้
- **ใหม่:** `src/game/pathPlanner.ts`, `src/game/pathPlanner.test.ts`
- **แก้ได้:** `src/game/autopilot.ts`, `src/game/Ship.tsx` (เฉพาะส่วนที่สร้าง input)
- แก้ไฟล์อื่นต้องมีเหตุผลใน log

## สเปก
1. **`pathPlanner.ts` (ฟังก์ชันบริสุทธิ์ ไม่แตะฟิสิกส์/React):**
   - `type Obstacle = { center: THREE.Vector3 | [number,number,number]; radius: number; kind: 'planet' | 'asteroid' | 'station' | 'well' }`
   - `buildObstacles(sector, bodies, options)` → รายการสิ่งกีดขวาง: ดาวเคราะห์ (รัศมี + `atmosphereHeight` + ระยะปลอดภัย), แอสเทอรอยด์ (รัศมี + ระยะปลอดภัย; **รวมกลุ่มที่อยู่ใกล้กันเป็นทรงกลมใหญ่** เพื่อจำกัดจำนวน), สถานี (ใช้ค่าคงที่ที่ระบุเหตุผล), หลุมแรงโน้มถ่วงลึก (หลีกเลี่ยงถ้าไม่ใช่ปลายทาง)
   - `planPath(from, to, obstacles, options) → { waypoints: Vector3[]; blocked: boolean; reason?: string }`: ตรวจ segment–sphere; ถ้าตัน แทรกจุดอ้อมสัมผัสทรงกลมแรกที่ตัน (เผื่อระยะ) แล้วตรวจต่อ สูงสุด N ครั้ง; ล้มเหลวต้อง **คืน `blocked: true` พร้อมเหตุผล ไม่วนไม่สิ้นสุด**
   - **ข้อยกเว้น:** สิ่งกีดขวางที่เป็นปลายทางเอง (ลงจอด/dock/วงโคจร) ต้องไม่ถูกนับ และต้องมีทางเข้า; ถ้ายานเริ่มในระยะปลอดภัยของวัตถุ ให้ดันออกก่อน
2. **ต่อเข้า `autopilot.ts`:** เพิ่มฟิลด์ `obstacles: readonly Obstacle[]` ใน `AutopilotInput`; `navTask`/`harvestTask`/`dockTask` บินไปยัง **waypoint ถัดไปของ planner** แทนเป้าหมายสุดท้าย; replan ประมาณทุก 1 วินาที (cache ผล); สถานะ HUD แสดง เช่น `Detouring around <ชื่อ>`
3. **อย่าทำให้การลงจอด/orbit/dock พัง:** ตรรกะเบรกและเข้าสู่วงโคจร/ลงจอดเดิมต้องไม่เปลี่ยนพฤติกรรม (มี test เดิมคุมอยู่ — ต้องผ่านทั้งหมด)
4. ตรรกะ `avoidMeteors` เดิมยังอยู่ (ซ้อนบนเส้นทาง)

## เกณฑ์ผ่าน (วัดได้)
1. ไม่มีช่วงของ `waypoints` ที่ตัดสิ่งกีดขวาง (ที่ขยายด้วยระยะปลอดภัยแล้ว) เมื่อ `blocked === false`
2. ความยาวเส้นทาง ≤ ~1.5× เส้นตรงในกรณีสุ่มทั่วไป (อธิบายนิยาม "ทั่วไป" ใน log)
3. **fuzz:** สนามสิ่งกีดขวางสุ่มอย่างน้อย 3,000 แบบ (seed คงที่) → ถึงเป้าหมายได้ ≥ 99%; ที่เหลือต้อง `blocked: true` พร้อมเหตุผล (ไม่ throw ไม่วน)
4. **deterministic:** input เดียวกัน → ผลเดียวกัน
5. **sector จริง:** ใช้ `generateSector` จาก seed อย่างน้อย 3,000 ค่า — จากจุดมาถึง (0,0,0) ไปยังดาวเคราะห์/สถานีทุกแห่ง ได้เส้นทางที่ผ่านเกณฑ์ข้อ 1
6. test เดิมทั้งหมด (`game.test.ts` ฯลฯ) ผ่าน; เพิ่ม test ระดับ `runAutopilot` ว่ามีสิ่งกีดขวางขวางทาง → ยานได้คำสั่งเลี้ยวอ้อม (ไม่พุ่งตรง)
7. `npm run lint`, `npm test`, `npm run build` ผ่าน

## ตรวจในเบราว์เซอร์ (ถ้าทำได้)
undock → ตั้ง destination เป็นดาวเคราะห์ที่มีแอสเทอรอยด์/ดาวอีกดวงขวางทาง → เปิด autopilot → ดูสถานะ "Detouring…" และว่าไม่ชน (headless render ช้า ~2 FPS ใช้ polling รอ) — ถ้าใช้ debug hook ชั่วคราว **ต้องลบออกก่อนจบ**

## ข้อควรระวัง
- แรงโน้มถ่วงทำให้เส้นทางจริงไม่ตรงใกล้ดาว — เผื่อระยะเพิ่มรอบวัตถุที่มีแรงโน้มถ่วง
- อย่าใช้ `Math.random()` (ต้อง deterministic); ใช้ `mulberry32` (`src/game/rng.ts`) ใน test
- ห้าม subscribe physics body ต่อชิ้น (เคยทำ worker ล่ม) — planner ไม่ควรแตะ physics เลย
- ตำแหน่งยานอ่านจาก `object.matrix` ไม่ใช่ `position`

## นอกขอบเขต
คำสั่งแบบ EVE (Approach/Orbit/Keep range/Warp — เป็น V2/V3), ระบบต่อสู้, UI ใหม่, ตรรกะ multi-sector
