# T6 — ติดตามผล T1: Autopilot (harvest ข้ามเศษที่เข้าไม่ได้, วัดต้นทุน, จัดค่าให้ปรับง่าย)

- **Branch:** `feature/autopilot-followups` (จาก master ล่าสุด)
- **แผนอ้างอิง:** `docs/PLAN_CREW_AND_SHIPS.md` 8.14 ค; ข้อบกพร่องที่ระบุใน `docs/agent-log/T1-autopilot-avoidance.md` (หัวข้อ "ปัญหาที่พบแต่ไม่ได้แก้" และ Lead review)
- **Log:** `docs/agent-log/T6-autopilot-followups.md`
- ทำคู่กับ T2/T3 ได้; **ห้ามทำคู่กับ T7 ถ้า T7 แก้ `Ship.tsx`** (ตรวจ git status ก่อน)

## เป้าหมาย
แก้ข้อบกพร่องที่ T1 ทิ้งไว้ และทำให้ค่าที่ตั้งเองปรับได้ง่ายหลังผู้ใช้ลองบิน

## งาน
1. **Harvest ข้ามเศษที่เส้นทางถูกขวาง:** ปัจจุบัน `harvestTask` เมื่อ `planPath` ได้ `blocked` ยานจะ `holdStill` ตลอดไป. ให้ **เลือกเศษถัดไปที่เข้าถึงได้** (ใกล้สุดที่ planner คืนเส้นทางไม่ blocked) แล้วบินไปแทน; ถ้าไม่มีเศษที่เข้าถึงได้เลย จึงหยุดและแจ้งสถานะ `No reachable scrap`; ต้องไม่สลับเป้าไปมาทุกเฟรม (hysteresis ง่าย ๆ — อธิบายใน log)
2. **วัดต้นทุน `planPath`:** เพิ่ม **สคริปต์ benchmark** (ไม่ใช่ test ที่ flaky) ที่วัดเวลาเฉลี่ย/p95/สูงสุดของ `planPath` + `buildObstacles` บน sector จริงอย่างน้อย 500 seed ด้วยสคริปต์ที่รันซ้ำได้ (เช่น `scripts/bench-planner.ts` หรือ test ที่ log ตัวเลขและมีเพดานหลวมมาก) — รายงานตัวเลข; ถ้า p95 เกินงบ ~2 ms ต่อครั้ง ให้เสนอแนวทางลด (อย่าเพิ่งแก้ใหญ่)
3. **รวมค่าคงที่ที่ตั้งเอง** (clearance, `0.55 × wellRadius`, merge gap, cluster, standoff, gate cone, `PLAN_INTERVAL`, `WAYPOINT_REACH`, `WAYPOINT_SPEED`) ให้อยู่ในบล็อกเดียวที่อ่านง่ายพร้อมคอมเมนต์ว่า "ปรับเมื่อผู้ใช้ลองบินแล้ว" — **ห้ามเปลี่ยนค่า** (พฤติกรรมต้องเท่าเดิม) ยกเว้นจำเป็นต่อข้อ 1

## ไฟล์ที่แตะได้
`src/game/autopilot.ts`, `src/game/pathPlanner.ts`, `src/game/pathPlanner.test.ts` (หรือไฟล์ test ใหม่), สคริปต์ benchmark ใหม่

## เกณฑ์ผ่าน
1. test: เมื่อเศษที่ใกล้ที่สุดเข้าไม่ได้ (ขวางด้วยทรงกลมล้อม) และมีอีกชิ้นเข้าได้ → `runAutopilot` ให้คำสั่งไปยังชิ้นที่เข้าได้; ไม่มีเศษเข้าได้ → สถานะ `No reachable scrap` ไม่ throw
2. test เดิมทั้งหมดผ่าน; พฤติกรรมอื่นไม่เปลี่ยน (เทียบ test เดิมของ T1)
3. มีตัวเลข benchmark ใน log (จำนวน seed, mean/p95/max, เครื่องที่ใช้)
4. lint/test/build ผ่าน (ตรวจ exit code ของ build แยก)

## นอกขอบเขต
คำสั่งแบบ EVE (V2/V3), ปรับค่า clearance ตามความรู้สึก (ต้องให้ผู้ใช้บินก่อน), ตรรกะลงจอด/orbit
