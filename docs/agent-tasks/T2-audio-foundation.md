# T2 — ระบบเสียงพื้นฐาน (Phase S1)

- **Branch:** `feature/audio-s1` (จาก master ล่าสุด)
- **แผนอ้างอิง:** `docs/PLAN_CREW_AND_SHIPS.md` หัวข้อ **8.14 จ**
- **Log:** `docs/agent-log/T2-audio-s1.md`

## เป้าหมาย
เกม **ไม่มีเสียงเลย** (ตรวจแล้ว: ไม่มี `AudioContext` หรือไฟล์เสียงในโค้ด) สร้างระบบเสียงกลางและเสียงชุดแรก **ที่สังเคราะห์ด้วยโค้ด (ไม่ใช้ไฟล์เสียงภายนอก)** ตามหลักการ "ไม่พึ่ง asset ภายนอก" ของเกม

## อ่านก่อน
- `src/input/preferences.ts` — รูปแบบ preferences + validation + `localStorage` (try/catch) ที่ต้องเลียนแบบ
- `src/hud/PauseMenu.tsx` — ที่จะเพิ่มตัวตั้งค่าเสียง
- `src/game/gameState.ts` — `gameStats.thrustLevel` (0–1), `gameStats.fold` (`phase`, `charge`), `gameStats.hull`, `gameStats.notice` / `notify()`; `src/game/dock.ts` (`getDock()`)
- `src/game/fold.ts` — จังหวะ fold (ชาร์จ/ยกเลิก/ขัดจังหวะ/มาถึง)

## ไฟล์ที่แตะได้
- **ใหม่:** `src/audio/audioEngine.ts`, `src/audio/audioPreferences.ts`, `src/audio/sounds.ts`, `src/audio/*.test.ts`, (ถ้าจำเป็น) `src/audio/AudioDriver.tsx`
- **แก้ได้เล็กน้อย:** `src/hud/PauseMenu.tsx` (ตัวเลื่อนระดับเสียง), `src/App.tsx` (เพิ่มการเรียก driver — **ให้น้อยที่สุด**, T3 ก็แตะ App.tsx), `src/index.css` ถ้าจำเป็น

## สเปก
1. **`audioEngine.ts`:** สร้าง `AudioContext` แบบ lazy; **resume หลังการคลิกครั้งแรก** (ผู้เล่นคลิกปุ่มเริ่มเกมอยู่แล้ว); บัส (GainNode): `master`, `sfx`, `ui` (เตรียม `ambience`, `music` ไว้แต่ยังไม่ต้องมีเสียง); **จำกัดจำนวนเสียงพร้อมกัน** (voice pool, ค่าตั้งต้น 16); หยุด/ลดเสียงเมื่อแท็บถูกซ่อน (`visibilitychange`); รับ **factory ของ AudioContext ที่ฉีดได้** เพื่อทดสอบด้วย fake
2. **เสียงชุดแรก (สังเคราะห์):**
   - เครื่องยนต์: loop ที่ระดับเสียง/ความถี่ตามแรงขับ — ใช้ **ฟังก์ชันบริสุทธิ์** `engineVoice(thrust, speed) → { gain, frequency }`
   - UI: คลิก/ยืนยัน/ปฏิเสธ; toast `gain` และ `warning` (ผูกกับ `notify`/`gameStats.notice` โดยไม่เปลี่ยนพฤติกรรมเดิม)
   - Fold: ชาร์จ / ยกเลิก / กระโดด / มาถึง
   - dock/undock และเตือน Hull ต่ำ
3. **การตั้งค่า (`audioPreferences.ts`):** key `cosmohaven.audio.v1`; ค่า master/sfx/ui 0–1 + mute; validation เมื่ออ่าน (ผิดรูป → ค่าเริ่มต้น ไม่ throw); `localStorage` ใช้ไม่ได้ต้องไม่ล้ม; **ค่าเริ่มต้นเบา (ไม่เกิน ~0.5)**
4. **PauseMenu:** ตัวเลื่อนระดับเสียง + ปุ่มปิดเสียง ใช้สไตล์เดิมของเมนู
5. **ห้ามเปลี่ยนพฤติกรรมเกมเดิม:** เสียงเป็น observer เท่านั้น (อ่าน state ที่มี)

## เกณฑ์ผ่าน (วัดได้)
1. `engineVoice` เป็นฟังก์ชันบริสุทธิ์: monotonic ตามแรงขับ, ค่าอยู่ในช่วงที่ระบุ, thrust 0 = เงียบ
2. voice pool: เล่นเกินงบแล้วจำนวน voice ที่ active ไม่เกินงบ (ทดสอบด้วย fake context)
3. preferences: ค่าผิดรูป/นอกช่วง/JSON เสีย → ได้ค่าเริ่มต้น; `localStorage` โยน error → ไม่ล้ม; round-trip ถูกต้อง
4. context ถูก resume หลังเหตุการณ์คลิกครั้งแรก (ทดสอบด้วย fake: `resume()` ถูกเรียกครั้งเดียวที่เหมาะสม); ไม่มีเสียงค้างหลัง `dispose()`
5. ในเบราว์เซอร์: หลังคลิกเริ่มเกม `audioContext.state === 'running'` (ตรวจด้วย puppeteer ได้); ไม่มี console error
6. `npm run lint`, `npm test`, `npm run build` ผ่าน

## **สิ่งที่ตรวจเองไม่ได้ (ต้องเขียนใน log ตรง ๆ)**
เบราว์เซอร์ headless ไม่ออกเสียง — **ไม่ได้ฟังจริง** คุณภาพ/ความดัง/ความน่ารำคาญของเสียงต้องให้ผู้ใช้ฟังเอง ห้ามอ้างว่า "เสียงดี"

## ข้อควรระวัง
- นโยบาย autoplay: สร้าง/resume context ใน handler ของ user gesture
- ห้ามใช้ Web Audio ใน render loop แบบสร้าง node ใหม่ทุกเฟรม (ใช้ `setTargetAtTime` กับ node ที่มีอยู่)
- ไม่ใช้ไฟล์เสียง/ไลบรารีเสียงภายนอก (ถ้าอยากเพิ่ม dependency ต้องขอก่อน)
- อย่าให้ driver ที่อ่าน `gameStats` ทำให้ React re-render 60 fps (ใช้ interval ~20 Hz หรือ ref)

## นอกขอบเขต
เพลง/บรรยากาศ/เสียงตามตำแหน่ง 3D (S2), เสียงอาวุธ/ตำรวจ (S3), เสียงพูด, ไฟล์เสียง
