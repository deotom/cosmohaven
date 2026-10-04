# Agent task queue

งานที่ **เตรียมให้ agent อื่นทำ** โดยตัดเป็นก้อนเล็ก มีขอบเขตไฟล์ชัด และมีเกณฑ์ตรวจที่วัดได้
ผู้ประสานงาน (lead) คือ Claude ใน session หลัก — ดู [../HANDOFF.md](../HANDOFF.md) สำหรับสถานะโปรเจกต์ ณ วันที่ส่งมอบ

## วิธีใช้ (ย่อ)
1. เลือกงานจากตารางด้านล่าง (ดูคอลัมน์ "ทำคู่กันได้ไหม" ก่อนเปิดหลาย agent พร้อมกัน)
2. ให้ agent อ่าน **[../../AGENTS.md](../../AGENTS.md)** ก่อน แล้วอ่านไฟล์งานของตัวเอง
3. ใช้ prompt ด้านล่าง (เปลี่ยนแค่ชื่อไฟล์งาน)
4. เมื่อ agent ส่งงาน ให้ lead ตรวจตาม "เกณฑ์ผ่าน" ของไฟล์งานนั้น + รัน `npm run lint && npm test && npm run build` เอง ก่อน merge

### ถ้าเปิดหลาย agent พร้อมกัน — **ต้องแยกโฟลเดอร์ทำงาน (git worktree)**
agent ทุกตัวสร้าง/สลับ branch ใน `C:\cosmohaven` ถ้าอยู่โฟลเดอร์เดียวกัน จะ **ทับไฟล์กันและทำให้ dev server ของอีกตัว reload กลางคัน** ให้สร้าง worktree ต่อ 1 งานด้วยสคริปต์ (ทดสอบแล้ว):
```powershell
powershell -ExecutionPolicy Bypass -File docs\agent-tasks\new-worktree.ps1 -Task T3 -Branch feature/hud-radar -Port 5303
```
ได้โฟลเดอร์ `C:\cosmohaven-wt\T3` (จาก `master` ล่าสุด, `node_modules` เป็น junction ไม่ต้องติดตั้งใหม่) → **ให้ agent ทำงานในโฟลเดอร์นั้น** และใช้พอร์ต dev server ของตัวเองเท่านั้น; งานเดียวที่ทำคนเดียวจะใช้ `C:\cosmohaven` ตรง ๆ ก็ได้ (ถ้าไม่มี dev server ของใครรันอยู่)
พอร์ตที่เสนอ: T2=5302, T3=5303, T7=5307, T8=5308, T9=5309

### Prompt มาตรฐาน (ก๊อปไปวางได้เลย)
```
คุณทำงานในโปรเจกต์ CosmoHaven (C:\\cosmohaven)
1) อ่าน AGENTS.md (กฎของโค้ดและการทำงานร่วมกัน) ให้จบก่อน
2) อ่าน docs/HANDOFF.md ส่วน "ข้อควรระวัง" และ "สิ่งที่ยังไม่ได้ตรวจ"
3) ทำงานตามไฟล์ docs/agent-tasks/<ชื่อไฟล์งาน>.md เท่านั้น — ทำเฉพาะขอบเขตที่ระบุ
   ห้ามแก้ไฟล์นอก "ไฟล์ที่แตะได้" และห้ามทำสิ่งที่ระบุใน "นอกขอบเขต"
4) ก่อนเริ่ม: git status, git log -5; สร้าง branch ตามที่ไฟล์งานระบุ จาก master ล่าสุด
5) ห้าม push, ห้ามแตะ master/main, ห้ามแก้ docs/PLAN.md และ docs/GAME_DESIGN.md
6) เสร็จเมื่อ: lint + test + build ผ่าน, เกณฑ์ผ่านทุกข้อในไฟล์งานครบ, เขียน log ที่ docs/agent-log/<ชื่องาน>.md
7) รายงานตอนจบตรงไปตรงมา: แก้ไฟล์ไหน, รันอะไรได้ผลอย่างไร, อะไร "ไม่ได้ตรวจ", ข้อสมมติที่ตั้งเอง,
   ปัญหาที่พบแต่ไม่ได้แก้ ถ้า test ไม่ผ่านให้แนบผลลัพธ์ อย่าอ้างว่าใช้ได้เพียงเพราะ type-check ผ่าน
```

## ตารางงาน

| ID | งาน | Branch | แผนอ้างอิง | ไฟล์หลักที่แตะ | ขึ้นกับ | ทำคู่กันได้ไหม |
|---|---|---|---|---|---|---|
| [T1](T1-autopilot-obstacle-avoidance.md) | Autopilot หลบสิ่งกีดขวาง (V1) | `feature/autopilot-avoidance` | 8.14 ค | `src/game/pathPlanner.ts` (ใหม่), `autopilot.ts`, `Ship.tsx` (ส่ง obstacles) | — | ✅ กับ T2, T3 |
| [T2](T2-audio-foundation.md) | ระบบเสียงพื้นฐาน (S1) | `feature/audio-s1` | 8.14 จ | `src/audio/**` (ใหม่), `PauseMenu.tsx`, `App.tsx` (เล็กน้อย) | — | ✅ กับ T1; ⚠️ แก้ `App.tsx` น้อยที่สุดเพราะ T3 ก็แตะ |
| [T3](T3-radar-speed-gauge.md) | เรดาร์ + มาตรวัดความเร็ว (X2a) | `feature/hud-radar` | 8.11 ค, ux/X0-audit.md | `src/hud/Radar.tsx`, `radarMath.ts` (ใหม่), `App.tsx` (วางตำแหน่ง) | — | ✅ กับ T1; ⚠️ `App.tsx` ร่วมกับ T2 |
| [T4](T4-milestones.md) | Milestones (Phase 0 ที่เหลือ) | `feature/milestones` | 8.1.1, Phase 0 | `src/game/milestones.ts` (ใหม่), `gameState.ts`, `saveGame.ts`, `HelpOverlay.tsx` | — | ❌ ไม่ทำพร้อม T5 (ชน `saveGame.ts`) |
| [T5](T5-deterministic-sector-addressing.md) | พิกัด sector แบบ deterministic | `feature/sector-addressing` | 8.4, Phase U | `fold.ts`, `sector.ts`, `saveGame.ts`, `gameState.ts` | — | ❌ ทำ **คนเดียว** หลังรวม T4 แล้ว |
| [T6](T6-autopilot-followups.md) | ติดตามผล T1: harvest ข้ามเศษเข้าไม่ได้ + benchmark planner | `feature/autopilot-followups` | 8.14 ค, log T1 | `autopilot.ts`, `pathPlanner.ts`, สคริปต์ benchmark | T1 ✅ | ✅ กับ T2/T3; ❌ กับ T7 ถ้าแก้ `Ship.tsx` |
| [T7](T7-planet-surface-p1.md) | ผิวดาว/ลงจอด P0–P1 (วินิจฉัย + detail + props + ฝุ่น + ดาวแก๊สไม่ลงจอด) | `feature/planet-surface` | 8.15 | `Planet.tsx`, `Earth.tsx`, `Ship.tsx` (ส่วนแตะพื้น), `ArrivalPanel.tsx`, ไฟล์ใหม่ | — | ✅ กับ T2/T3; ❌ กับ T6 |
| [T8](T8-autopilot-trajectory-sim.md) | จำลองวิถีจริง (แรงโน้มถ่วง) ของ autopilot แล้วแก้ให้ไม่ชน/ไม่ถูกดูด | `feature/autopilot-sim` | 8.14 ค, log T1 | `autopilotSim.ts` (ใหม่), `autopilot.ts`, `pathPlanner.ts` | T1 ✅ | ✅ กับ T2/T3/T7; ❌ กับ T6 (รวมกันได้) |
| [T9](T9-meteor-variety.md) | อุกกาบาตหลากหลาย (ขนาด/รูปร่าง/จังหวะ) และไม่ถี่เกิน | `feature/meteor-variety` | 8.1 | `meteorField.ts`, `meteorGeometry.ts` (ใหม่), `EventManager.tsx`, `difficulty.ts` | — | ✅ กับ T2/T3/T7/T8 (T9 ไม่แตะ autopilot) |

**สถานะงาน (อัปเดตโดย lead):**
- **T1 ✅ เสร็จ — merge เข้า master ในเครื่องแล้ว** (ดู `docs/agent-log/T1-autopilot-avoidance.md` ส่วน Lead review)
- T2, T3, T4, T5, T6, T7, T8, T9: ยังไม่เริ่ม
- **ผู้ใช้รายงานหลัง T1:** autopilot ยังชนสิ่งของและเฉียดดาวแล้วถูกดูดเข้า → **T8 มาก่อน T6** (T6 รวมเข้า T8 ได้)
- **ลำดับที่แนะนำตอนนี้:** T7 (ผู้ใช้เจอปัญหาตอนลงจอด) + T3 พร้อมกันได้; T6 หลังจากนั้น

**ลำดับที่แนะนำ:** T1 + T3 (+ T2) พร้อมกันได้ → รวมเข้า master → T4 → T5
**ห้ามเปิดพร้อมกัน:** T4 กับ T5 (ทั้งคู่เพิ่มฟิลด์ใน `saveGame.ts` และ `gameState.ts`)

## ข้อมูลที่ lead ต้องรู้เมื่อรับงานกลับ
- รันตรวจเอง: `npm run lint && npm test && npm run build` และดู diff ด้วย `git diff master...<branch>`
- งานที่มี UI ให้ดูภาพจริง: สคริปต์ [../ux/ux-audit.mjs](../ux/ux-audit.mjs) (ต้องมี dev server + `puppeteer-core`; ไม่ใช่ dependency ของโปรเจกต์ — ติดตั้งนอกรีโป)
- คุณภาพ "ความรู้สึก" (กล้อง เสียง ความถูกใจของเรดาร์) agent ตรวจไม่ได้ — ต้องให้ผู้ใช้ลองเล่น
