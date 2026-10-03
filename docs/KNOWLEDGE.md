# Cosmohaven — Knowledge Base

เอกสารสรุปความรู้เกี่ยวกับโปรเจกต์ เขียนจากการอ่านโค้ดใน `src/` (ณ 2026-10-03) เพื่อให้กลับมาทำงานต่อได้เร็ว
ดูแผนงานและ checklist ที่ [PLAN.md](PLAN.md)

## 1. โปรเจกต์คืออะไร

เกมอวกาศ 3D บนเบราว์เซอร์: สร้างยานจากบล็อก เก็บ Scrap บินระหว่างระบบดาวด้วย Space-Fold
เก็บ Signal Relic ให้ครบ 5 ชิ้นเพื่อปลดล็อกพิกัด **Earth 2.0** แล้วบินไปถึงเพื่อชนะ

- เริ่มเกมที่หน้า **Crew Registration** (เลือกเผ่าพันธุ์ + ปรับรูปลักษณ์) ก่อนเข้าฉาก 3D
- ยานมีลูกเรือเดินอยู่ข้างใน (Hunger / Sanity) ต้องมี Food Dispenser และ Arcade
- สร้าง/แก้ไขยานได้เฉพาะตอน **จอดที่ Drydock (สถานีอู่ต่อยาน)** เท่านั้น

## 2. Tech stack

| ส่วน | ใช้อะไร |
|---|---|
| Build | Vite 8, TypeScript ~6.0, `@vitejs/plugin-react` |
| UI | React 19 (StrictMode) |
| 3D | three 0.186, `@react-three/fiber` 9, `@react-three/drei` 10 |
| Physics | `@react-three/cannon` (gravity ของ world = 0; แรงโน้มถ่วงดาวเคราะห์คำนวณเอง) |
| Post-FX | `@react-three/postprocessing` + `postprocessing` (bloom, tone mapping) |
| Lint | oxlint (`.oxlintrc.json`) |
| Test | **ยังไม่มี** |

คำสั่ง (`package.json`): `npm run dev` · `npm run build` (`tsc -b && vite build`) · `npm run lint` · `npm run preview`

> ไม่ใช่ git repo (ณ ตอนเขียนเอกสารนี้) — ควร `git init` ก่อนทำงานต่อ (ดู PLAN)

## 3. โครงสร้างไฟล์

```
src/
  main.tsx              entry, StrictMode
  App.tsx               (~40KB) Canvas, Scene, กล้อง, HUD ทุก panel, key handler หลัก
  CrewRegistration.tsx  หน้าเลือกเผ่า/รูปลักษณ์
  game/
    gameState.ts        state กลาง (gameStats) + ค่าคงที่เกม + helper (notify, trySpendScrap, ...)
    types.ts            BlockType, GridPos, crewStats, hazardStats
    sector.ts           สร้างระบบดาวจาก seed (planets, stations, asteroids, scrap, relic, sun)
    fold.ts             Space-Fold: charge → jump → arrive
    gravity.ts / Atmosphere.tsx / ReentryEffects.tsx   แรงโน้มถ่วง, บรรยากาศ, ไฟตอนลงจอด
    autopilot.ts        (~26KB) controller ของ auto-pilot ทุก task
    Pathfinding.ts / shipGraph.ts   หาทางเดินลูกเรือในยาน
    Ship.tsx / ShipBlocks.tsx / shipState.ts   ยาน, บล็อก, state ของยาน
    SpaceStation.tsx / station.ts / dock.ts / docking.ts   สถานี, ลำดับ dock/undock
    Character.tsx / Crew.tsx / crewProfile.ts / species.ts   ลูกเรือ + เผ่าพันธุ์
    ScrapField.tsx      scrap/relic + beam เก็บ
    targets.ts / targetActions.ts / targetScreen.ts / TargetSystem.tsx   ระบบ lock เป้าหมาย + context menu
    EventManager.tsx    spawn อุกกาบาต (physics body)
    upgrades.ts         tier ของ Harvester / Auto-Pilot
    Planet/Earth/Sun/Nebula/Asteroids/Flame/Holograms/Effects .tsx   visual
    textures.ts, noise.ts, rng.ts, glow.ts, exposure.ts, fold.ts ...   utility
    useKeyboard.ts / useMouseLook.ts / usePointerLock.ts   input hooks
```

## 4. สถาปัตยกรรมที่ต้องรู้

### 4.1 State อยู่นอก React
`gameStats` ใน `gameState.ts` และ `crewStats`/`hazardStats` ใน `types.ts` เป็น **object ธรรมดาที่ถูก mutate**
จาก `useFrame`/event handler โดยตรง HUD อ่านผ่าน `useSampled(read, 200ms)` ใน `App.tsx` เพื่อไม่ให้ re-render 60fps
- เพิ่มค่าใหม่ → ใส่ใน `gameStats`, ทำ setter, และ **copy ใน `readGameStats()`** ถ้าเป็น nested object
  (ไม่งั้น HUD จะได้ reference เดียวกันและไม่เห็นการเปลี่ยน)
- ไม่มี save/load — refresh = เริ่มใหม่

### 4.2 Sector (ระบบดาว)
- `Sector` เป็น data ล้วนที่สร้างจาก seed (`mulberry32` ใน `rng.ts`) → reproducible
- ยาน **มาถึงที่ origin ของ sector เสมอ** ตำแหน่งทุกอย่างสัมพัทธ์กับจุดนี้
- `CELESTIAL_BODIES` เป็น array กลาง ถูก **mutate in place** ตอน `enterSector()` ห้าม reassign ตัวแปร
- Sector ปกติ: ดาว 2+ ดวง (`WELL_PER_RADIUS=3.4`, `EDGE_PULL=0.25`), drydock โอกาส 35%, relic โอกาส 60% (ไม่มีใน home sector)
- Earth sector (`earthSector`): Earth 2.0 ที่ `[0,0,-1700]` รัศมี 300, ชนะเมื่อเข้าใกล้ศูนย์กลาง ≤ 600 (`VICTORY_RADIUS`)

### 4.3 โหมดเกม
`mode` ไม่ได้เก็บเป็น state แยก — ได้จาก `dock.phase === 'docked' ? 'build' : 'pilot'`
- **build**: ยานจอดที่ drydock, คลิกหน้าบล็อกเพื่อ queue ให้ drone สร้าง, Shift+คลิก = รื้อ (คืน 50%)
- **pilot**: บินด้วย chase/orbit camera, interior view (V) ดูลูกเรือ

### 4.4 Auto-pilot
`runAutopilot(input, out)` ใน `autopilot.ts` เป็น pure-ish controller (รับ input → เติม output แรง/แรงบิด)
Task: `nav | harvest | hold | evac | orbit | land | dock` — `Shift+P` วนผ่าน nav→harvest→hold→evac
ฟีเจอร์ขึ้นกับ tier: Basic (บินตรง) → Advanced (หลบอุกกาบาต) → Expert (burn ประหยัด + lock orbit)
การมาถึงดาวเคราะห์: ที่ 97% ของ well radius เข้า `ArrivalPhase` (`choice → insertion → orbiting` หรือ `deorbit → descent → landed`)

### 4.5 ระบบเป้าหมาย (Target)
`TargetRef {kind, key, name}` — `key` unique ใน sector, `resolveTarget()` คืน false ถ้าของหายไป (เก็บแล้ว/หมดอายุ/fold ออก)
`T` วนเป้า, เลข `1–4` เรียก action ตาม kind (`targetActions.ts`), คลิกขวา/context menu

### 4.6 Physics
- `Physics gravity={[0,0,0]}`; แรงดึงดูดของดาว = `gm / r²` คำนวณใน `gravity.ts`
- ยานมี thrust 8 u/s², cruise ~19–22 u/s; แรงที่ขอบ well ≈ 0.25 ต้อง < thrust เสมอ (ออกจาก well ได้)
- อุกกาบาต: mass 40, speed 18, spawn ห่าง 80, อายุ 20s, ตัวแรกที่ 6s แล้วทุก 15–20s
  - เพิ่ม track ใน `meteorTracks` จาก mesh matrix (ห้าม subscribe worker — เคย crash ตอน body ถูกลบ ดู comment ใน `EventManager.tsx`)
- Landing: ปลอดภัยถ้าความเร็ว ≤ 12 (`SAFE_LANDING_SPEED`), touchdown ที่ altitude 5

## 5. กฎ/ตัวเลขเกม (แหล่งความจริงอยู่ในโค้ด)

| หัวข้อ | ค่า | ไฟล์ |
|---|---|---|
| Scrap เริ่มต้น / ต่อชิ้น | 100 / 20 | `gameState.ts` |
| ราคาบล็อก | hull 10, food 30, arcade 30 | `gameState.ts` |
| Fold cost / charge / arrive | 40 Scrap / 3s / 1.6s | `gameState.ts`, `fold.ts` |
| Relic ที่ต้องมี | 5 (หนึ่งชิ้นต่อ sector ที่ fold ไป) | `gameState.ts` |
| ซ่อมฉุกเฉิน | 15 Scrap → +25 hull, cooldown 4s | `gameState.ts` |
| Hull → thrust | 100% = 1.0×, 0% = 0.55× | `hullThrustFactor` |
| Harvester | T-Beam 0 / Magnetic Scoop 80 / Quantum 200 | `upgrades.ts` |
| Auto-Pilot | Basic 0 / Advanced 120 / Expert 250 | `upgrades.ts` |

### เผ่าพันธุ์ (`species.ts`)
- **Human** — hunger/sanity ลดช้าลง 15%
- **Lumi-Jelly** — เรืองแสง, ซ่อมตัวยาน 0.4/s
- **Felinian** — เดินเร็ว +30%, เตือนอุกกาบาตล่วงหน้า
- **Synth-Bot** — ไม่หิว, beam เร็ว +25%, sanity ลดเร็ว +25% (ต้องใช้ Arcade)
- **Floran** — ฟื้น hunger/sanity เมื่ออยู่ในแสง, scan range +20%

## 6. ปุ่มควบคุม

**Pilot:** เมาส์=เลี้ยว (คลิกเพื่อ lock, Esc ปล่อย) · W/S ดัน หน้า/หลัง · A/D yaw · ↑/↓ pitch · Q/E roll · Space/Shift strafe ขึ้น/ลง ·
C กล้อง chase/orbit · F ถือเพื่อเก็บ Scrap · P auto-pilot · Shift+P เปลี่ยน task · N waypoint ถัดไป · T วนเป้า · 1–4 action ของเป้า ·
O/L orbit/land ที่ดาว · J Space-Fold · R ซ่อมฉุกเฉิน · E dock · V interior view · U/I อัปเกรด Harvester/Auto-Pilot

**Build (docked):** คลิกหน้าบล็อก=สั่งสร้าง · Shift+คลิก=รื้อ · 1/2/3 หรือ Q เลือก Hull/Food/Arcade · ลาก=หมุนกล้อง · E=undock

## 7. จุดที่ต้องระวัง / ข้อสังเกต

1. `App.tsx` ใหญ่ (~40KB) รวม HUD ทั้งหมด + key handler — เป็นผู้ต้องสงสัยแรกถ้าต้อง refactor
2. `Character.tsx` (~36KB), `Ship.tsx` (~30KB), `autopilot.ts` (~26KB) ก็ใหญ่เช่นกัน
3. Key handler ใน `App.tsx` ผูก `E` ทั้ง dock และ roll (Q/E) — เช็คลำดับ `if/else` ก่อนเพิ่มปุ่ม
4. `README.md` ยังเป็น template ของ Vite ไม่ได้อธิบายเกม
5. ไม่มี test, ไม่มี save, ไม่มีเสียง (จากที่เห็นในโครงสร้างไฟล์ — ยังไม่ได้ยืนยัน audio ด้วย grep)
6. Placeholder ใน `gameStats` มี comment ลอย `/** 1-based tiers; see upgrades.ts */` ที่ไม่ได้ติดกับ field ใด (เหลือจาก refactor)
7. เอกสารนี้ **ไม่ได้รัน build/lint/เกม** — สถานะว่าผ่านหรือไม่ยังไม่ทราบ ดู PLAN ข้อ Phase 0
