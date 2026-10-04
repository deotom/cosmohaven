# T12 — Landing gear (P1.5)

ทำงานเฉพาะ `C:\cosmohaven-wt\T12`, branch `feature/landing-gear`; เริ่มจาก `6580aed` หลังตรวจ `git status` (สะอาด) และ `git log -5`. ไม่ push และไม่แก้ default branch/โฟลเดอร์ `C:\cosmohaven`.

## ไฟล์และพฤติกรรมที่เปลี่ยน

- ใหม่: `src/game/landingGear.ts` (layout/contact/suspension และ store ชั่วคราว), `LandingGear.tsx` (ข้อต่อหมุน ท่อซ้อน แผ่นรอง), `landingGear.test.ts`, `src/input/landingGearKeymap.test.ts`.
- แก้: `src/game/Ship.tsx` (แรงรองรับ/ตรวจแตะ/ความเสียหาย/วาดขา), `autopilot.ts` (ความสูงเป้าหมายเบรก), `dock.ts` (เก็บขาก่อนเปลี่ยนเฟส), `LandingDust.tsx` (ฝุ่นที่เท้า), `src/input/keymap.ts` (G), `src/hud/ArrivalPanel.tsx` (สถานะขาบรรทัดเดียว).
- ภาพ 1280×720: [กำลังกาง](../ux/T12-deploying.jpg) (54,220 bytes), [ใกล้แตะ](../ux/T12-near-touch.jpg) (56,144 bytes), [ลงแล้ว](../ux/T12-landed.jpg) (46,729 bytes). ตรวจภาพจริงแล้ว; HUD ไม่ซ้อนกันในภาพเหล่านี้.
- ไม่เพิ่ม dependency ในโปรเจกต์; Puppeteer สำหรับตรวจ Chrome ติดตั้งแยกนอกรีโป.

## ทางเลือกและค่าที่ใช้

เลือก **B: virtual suspension** — ไม่มี foot shape/physics body เพิ่ม ไม่มี subscription เพิ่ม และไม่เปลี่ยน damping. การกางขาไม่ rebuild compound body จึงเลี่ยงความเสี่ยง worker/body transform ของแนวทาง A.

Mounts อยู่ในเซลล์ที่มีบล็อกจริงบนชั้น `min y`: ชั้นเล็ก 1–2 บล็อกใช้ 3 ขา ที่เหลือ 4 ขา; ความยาว 1.5 u, แผ่นรองกว้าง 0.5 u. ข้อต่อหมุนรักษารอยเท้าเมื่อ autopilot หันหัวออกจากดาว; bounds ที่หมุนตามยานและความโค้งดาวกำหนดระดับเท้าจริง. อ่าน transform ยานจาก matrix ตามเดิม ไม่เปลี่ยน attitude controller/กล้อง.

กางต่ำกว่า 40 u ใน descent/landed, กาง/เก็บประมาณ 1 วินาที, G override คงอยู่ระหว่าง descent → landed. เก็บเมื่อออกเฟสลง/ขึ้นเกิน 15 u และเก็บทันทีเมื่อ docking/docked/undocking หรือเลือก task dock. สถานะชั่วคราวไม่ลงเซฟ.

สปริง 400 / ตัวหน่วง 80 ใช้ implicit response และ swept contact เพื่อไม่ข้าม stroke ที่ FPS ต่ำ; แรงคูณ mass × `min(dt, 0.1) * 60` ตาม gravity เดิม. `stepSuspension` คาด velocity/altitude หลังแรงที่ส่งไปแล้ว จนได้ velocity sample ใหม่จาก worker เพื่อไม่ส่ง stopping impulse ซ้ำจากค่าค้าง. ค่าคาดนี้ใช้ควบคุมแรงเท่านั้น ไม่เขียนตำแหน่ง physics/mesh. จำ incoming impact ก่อนสปริงชะลอ เพื่อให้ >12 u/s ยังเข้าตรรกะชน/บล็อกหลุดเดิม.

ค่าเผื่อ touchdown ลดเป็น **0.02 u**: รอบใช้ 0.15 ประกาศขณะเท้ายังห่าง ~0.1 u และปิดเครื่องก่อนแตะ. `LAND_ALTITUDE(height)` เป็น **support height + 3 u** สำหรับเริ่มเบรกให้ controller มีเวลาลู่เข้า; ไม่ใช่เงื่อนไขประกาศ landed. ค่าความเร็วปลอดภัย 12 และ TOUCH_SPEED 4 ไม่เปลี่ยน.

## ตรวจแล้ว

- `npm run lint`: **exit 0**.
- `npm test`: **exit 0**, 19 files passed / 1 skipped; **205 tests passed / 1 skipped**. รวม autopilotSim.test, arrival/landing/autopilot/damping เดิม. ไม่แก้ test เดิม.
- `npm run build`: **exit 0 ตรวจจากคำสั่งแยก**, tsc และ Vite ผ่าน; ยังมี chunk-size warning เดิม.
- ชุดใหม่ 24 ข้อ: 5 รูปทรง (core, 3×3, L, สูง, ชั้นล่างมีช่องกลาง), deterministic/ไม่มี mount หรือเท้าซ้ำเมื่อหมุน, animation/contact/damage/auto/manual/dock, spring ที่ 2/6/12 u/s และ dt 1/2–1/240 s. Cannon simulation ตรวจระดับ/ความเร็วหลัง 1 วินาที และไม่ NaN/ไม่ทะลุท้อง. ทดสอบ worker samples ช้า 4 frames ที่ 2/60/240 FPS เพิ่มเพื่อกันเด้งจากแรงซ้ำ.
- Sector snapshot เทียบกับ `6580aed`: **1,000 sectors ตรงกัน** (250 seeds × ids 1/4/25/49); SHA-256 ทั้งคู่ `b8a925fe7f3d5d88c1eb0ee0f09abe8e91990b80536189c47745cd430f76dc30`. `sector.ts`, RNG และ save format ไม่เปลี่ยน.
- Chrome จริงผ่าน Puppeteer, dev server เฉพาะ `npx vite --port 5312 --strictPort`. ใช้ save fixture core หนึ่งบล็อก ลงอัตโนมัติจาก 250 u บน Mixa-7; ฉาก fixture เหลือดาวที่เลือกเพื่อลดภาระ render แต่ใช้ Ship/Planet/physics worker จริง. Screenshot/trace เก็บจากรอบสุดท้าย ไม่มี source debug hook. รอบ HMR ที่อ่าน store คนละ module instance ถูกทิ้งและตรวจซ้ำหลัง restart.

| จุดวัด (เฟรมจริง) | ความสูงศูนย์กลาง u | ระดับเท้า u | radial speed u/s |
|---|---:|---:|---:|
| เริ่มกาง | 39.7428 | ยังไม่ล็อก | -16.5078 |
| เฟรมแรก landed | 2.0171 | 2.0042 | -1.5132 |
| +1.003 s | 2.0056 | 2.0058 | +0.0017 |
| +3.004 s | 2.0059 | 2.0062 | +0.0014 |

ความสูงต่ำสุดทั้งรอบ 1.9992 u; Hull 100%; ไม่ตกต่อถึงท้อง ไม่ NaN ไม่มี console error/worker crash. เท้าเข้าสัมผัสจริงที่ 2.0010 u, radial speed -0.4819 u/s (ต่ำกว่า TOUCH_SPEED).

ตารางแรงกระแทก: browser fixtures ตั้ง velocity เริ่มสัมผัสตามตาราง (ไม่มี autopilot thrust), วัด Hull และรออย่างน้อย 3 วินาทีหลัง landed จน speed <0.1 และระดับตรงกับ support height ±0.15. ผลตรงกับฟังก์ชัน damage; ทุกกรณีไม่มี page error.

| ความเร็วเริ่ม u/s | มีขา: Hull เสีย % | ลงท้อง: Hull เสีย % |
|---|---:|---:|
| 4 | 0 | 0 |
| 8 | 0 | 4 |
| 12 | 2 | 8 |

หลัง fixture มีขา: ระดับ/เท้า 1.9881/2.0046, 2.0253/2.0255, 2.0128/2.0151 u ตามลำดับ. ท้องที่เอียงทำให้ระดับพักแตกต่างจาก 0.5 ได้ แต่ตรงกับ bounds ที่หมุนแล้ว ไม่ใช้ threshold 5.

ปุ่มจริงใน Chrome: G กาง → เก็บ → กาง, E docking เก็บทันที → docked, G ถูกบล็อกใน hangar, E undocking → free ขายังเก็บ. `canDock` ไม่ติดขา; ไม่มี console error.

## สิ่งที่พบระหว่างพัฒนาและแก้แล้ว

- Build เคยล้ม TS2305/TS1149 จาก Windows เลือก `landingGear.ts` เมื่อ import component ไม่ระบุนามสกุล; ใช้ `./LandingGear.tsx` ชัดเจน (tsconfig เดิมอนุญาต).
- Test สปริงเคยล้ม `expected 1.9474525893690837 to be close to 2` และ regression delayed sample เคยล้ม `expected 0.28114743995279845 to be less than 0.15`; แก้ gravity feedforward และ prediction ทั้ง velocity/altitude แล้วผ่านทั้งหมด.
- Browser fixture 12 u/s เคยเด้งสูงจาก impulse ซ้ำตอน worker ตอบช้า แม้ synchronous tests ผ่าน; เพิ่ม prediction/regression test และตรวจ fixture ซ้ำจนกลับอยู่ระดับเท้า.

## ไม่ได้ตรวจ / สมมติฐาน / ปัญหาที่ไม่แก้

- ความรู้สึกบิน/ลงด้วยมือ ความถูกใจสไตล์/จังหวะขา และ FPS บน GPU จริงไม่ได้ตรวจ. Browser ใช้ headless renderer ซึ่งมีช่วงค้าง; FPS ที่ระบุข้างต้นเป็นการจำลอง Cannon ไม่ใช่คำอ้าง performance ของเครื่องผู้เล่น.
- ยานรูปร่างอื่นตรวจด้วย pure tests 5 ตัวอย่างและการหมุน ไม่ได้ลงจริงทุกแบบใน browser. ไม่ตรวจพื้นลาด/ล้ม (F3), Earth 2.0 victory, หรือ reload เซฟที่จอดแล้วใน browser. ไม่มีข้อมูลเซฟใหม่.
- ชุด full trajectory simulation เดิม 300 seeds ถูก skipped ตามค่าเริ่มต้น; ชุด autopilotSim.test ปกติผ่าน.
- สมมติให้ข้อต่อหมุนรับทิศหัวขึ้นของ autopilot เดิม; ไม่เปลี่ยน flight attitude/แรงขับหลัก. แรงขับหลักเดิมไม่คูณ dt (ปัญหา T8 ใน handoff) ยังอยู่นอกงานนี้.
- G ใช้ binding เริ่มต้นที่ไม่ชนตาราง. จากโค้ด preferences ยังยอมให้ผู้เล่น rebind control อื่นไป G ได้; ไม่แก้ระบบ rebind เพราะไฟล์นั้นอยู่นอก scope.
- เปลวเครื่องยนต์เดิมยังบังขาบางส่วนในภาพก่อนแตะ; ไม่แก้ Flame/กล้อง. มี THREE.Clock deprecation/shader precision warnings เดิม แต่ไม่ใช่ console errors.
- ไม่แก้ checkbox ใน PLAN_CREW_AND_SHIPS: เลือกยึดคำสั่งผู้ใช้ที่ห้ามไฟล์นอก “ไฟล์ที่แตะได้”; checklist ไม่ได้อยู่ในรายการนั้น. ไม่มีการแก้ PLAN.md/GAME_DESIGN.md.
