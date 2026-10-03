# Cosmohaven — Knowledge Base

เอกสารสรุปความรู้เกี่ยวกับโปรเจกต์ เขียนจากการอ่านโค้ดใน `src/` (ณ 2026-10-03) เพื่อให้กลับมาทำงานต่อได้เร็ว
ดูแผนงานและ checklist ที่ [PLAN.md](PLAN.md)

## 1. โปรเจกต์คืออะไร

เกมอวกาศ 3D บนเบราว์เซอร์: สร้างยานจากบล็อก เก็บวัตถุดิบเพื่อขายเป็น Haven Credits (HC) และบินระหว่างระบบดาวด้วย Space-Fold
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
| Test | Vitest สำหรับ game logic และ keymap (`src/game/game.test.ts`) |

คำสั่ง (`package.json`): `npm run dev` · `npm run build` (`tsc -b && vite build`) · `npm run lint` · `npm test` · `npm run preview`

> Git ถูกเริ่มต้นแล้ว โดย commit สถานะเริ่มต้นคือ `a0e8a1f` (ดู PLAN)

## 3. โครงสร้างไฟล์

```
src/
  main.tsx              entry, StrictMode
  App.tsx               ประกอบหน้าเกมและ state ของ UI
  CrewRegistration.tsx  หน้าเลือกเผ่า/รูปลักษณ์
  hud/                  HUD panels, status readers, styles และ sampled state hook
  input/keymap.ts       binding table, key handler และคำอธิบายปุ่มที่ HUD ใช้ร่วมกัน
  scene/Scene.tsx       กล้องและฉาก Three.js (โหลดแบบ lazy)
  game/
    gameState.ts        state กลาง (gameStats) + HC/cargo/economy + ค่าคงที่และ helper
    types.ts            BlockType, GridPos, crewStats, hazardStats
    sector.ts           สร้างระบบดาวจาก seed (planets, stations, asteroids, scrap, relic, sun)
    fold.ts             Space-Fold: charge → jump → arrive
    gravity.ts / Atmosphere.tsx / ReentryEffects.tsx   แรงโน้มถ่วง, บรรยากาศ, ไฟตอนลงจอด
    autopilot.ts        (~26KB) controller ของ auto-pilot ทุก task
    Pathfinding.ts / shipGraph.ts   หาทางเดินลูกเรือในยาน
    Ship.tsx / ShipBlocks.tsx / shipState.ts   ยาน, บล็อก, state ของยาน
    SpaceStation.tsx / station.ts / dock.ts / docking.ts   สถานี, ลำดับ dock/undock
    Character.tsx / Crew.tsx / crewProfile.ts / species.ts   ลูกเรือ + เผ่าพันธุ์
    ScrapField.tsx      scrap/relic/Survey Beacon + beam เก็บเข้าคลังสินค้า
  hud/TradePanel.tsx    Trade Relay/drydock sale UI และ storage technologies
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
- HC เป็นเงิน; Scrap/Relics อยู่ใน cargo จนขายหรือปลดล็อก progression; refresh ยังเริ่มใหม่ (autosave อยู่ในแผน)

### 4.2 Sector (ระบบดาว)
- `Sector` เป็น data ล้วนที่สร้างจาก seed (`mulberry32` ใน `rng.ts`) → reproducible
- ยาน **มาถึงที่ origin ของ sector เสมอ** ตำแหน่งทุกอย่างสัมพัทธ์กับจุดนี้
- `CELESTIAL_BODIES` เป็น array กลาง ถูก **mutate in place** ตอน `enterSector()` ห้าม reassign ตัวแปร
- Sector ปกติ: ดาว 2+ ดวง (`WELL_PER_RADIUS=3.4`, `EDGE_PULL=0.25`), drydock โอกาส 35%, relic โอกาส 60%, Survey Beacon โอกาส 45% (relic/beacon ไม่มีใน home sector)
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

### 4.5 ปุ่มควบคุม
`input/keymap.ts` เป็นแหล่งข้อมูลกลางของปุ่มที่มี action และข้อความช่วยใน HUD ส่วน `game/useKeyboard.ts`
ใช้ binding table เดียวกันเพื่อกรองปุ่มที่ต้องป้องกัน browser default ระหว่างบิน; `input/preferences.ts` รองรับการ remap
ปุ่มและปรับ mouse sensitivity โดยตรวจ key ซ้ำตามโหมดก่อนบันทึกใน localStorage

### 4.6 ระบบเป้าหมาย (Target)
`TargetRef {kind, key, name}` — `key` unique ใน sector, `resolveTarget()` คืน false ถ้าของหายไป (เก็บแล้ว/หมดอายุ/fold ออก)
`T` วนเป้า, เลข `1–4` เรียก action ตาม kind (`targetActions.ts`), คลิกขวา/context menu

### 4.7 Physics
- `Physics gravity={[0,0,0]}`; แรงดึงดูดของดาว = `gm / r²` คำนวณใน `gravity.ts`
- ยานมี thrust 8 u/s², cruise ~19–22 u/s; แรงที่ขอบ well ≈ 0.25 ต้อง < thrust เสมอ (ออกจาก well ได้)
- อุกกาบาต: mass 40, speed 18, spawn ห่าง 80, อายุ 20s, ตัวแรกที่ 6s แล้วทุก 15–20s
  - เพิ่ม track ใน `meteorTracks` จาก mesh matrix (ห้าม subscribe worker — เคย crash ตอน body ถูกลบ ดู comment ใน `EventManager.tsx`)
- Landing: ปลอดภัยถ้าความเร็ว ≤ 12 (`SAFE_LANDING_SPEED`), touchdown ที่ altitude 5

## 5. กฎ/ตัวเลขเกม (แหล่งความจริงอยู่ในโค้ด)

| หัวข้อ | ค่า | ไฟล์ |
|---|---|---|
| เงินเริ่มต้น | 100 Haven Credits (HC) | `gameState.ts` |
| ราคาบล็อก (ก่อน difficulty multiplier) | hull 10, food 30, arcade 30, engine 60, shield 80, repair 70 HC | `gameState.ts` |
| Scrap ดิบ | 1 cargo unit; ขาย 18 HC ที่ Trade Relay / 20 HC ที่ drydock | `gameState.ts` |
| Survey Data | 1 cargo unit; ขาย 45 HC ที่ Trade Relay / 50 HC ที่ drydock | `gameState.ts`, `sector.ts` |
| ความจุ cargo เริ่มต้น | 8 units; Relic ใช้พื้นที่ 1 unit และขายไม่ได้ | `gameState.ts` |
| Fold cost / charge / arrive | 40 HC / 3s / 1.6s | `gameState.ts`, `fold.ts` |
| Relic ที่ต้องมี | 5 (หนึ่งชิ้นต่อ sector ที่ fold ไป) | `gameState.ts` |
| ซ่อมฉุกเฉิน | 15 HC → +25 hull, cooldown 4s | `gameState.ts` |
| Hull → thrust | 100% = 1.0×, 0% = 0.55× | `hullThrustFactor` |
| Harvester | T-Beam 0 / Magnetic Scoop 80 / Quantum 200 | `upgrades.ts` |
| Auto-Pilot | Basic 0 / Advanced 120 / Expert 250 | `upgrades.ts` |

### Cargo economy
- Wallet เริ่มต้น 100 HC; Scrap ที่เก็บด้วย beam เป็นวัตถุดิบใน hold ไม่ใช่เงินทันที และต้องขายก่อนจึงใช้จ่ายได้
- Trade Relay เปิดได้จาก HUD ทุก sector: Scrap ดิบ 18 HC/ชิ้น; drydock จ่ายเต็ม 20 HC/ชิ้น
- Relic ใช้ 1 unit และขายไม่ได้
- Survey Beacon เป็น optional side objective ใน procedural sector; กู้ Survey Data ได้ครั้งเดียวต่อ event
- Hold เริ่ม 8 units; Expanded Bay (14 units, 120 HC), Mass Compressor (8 units, 55% volume, 240 HC), Quantum Vault (12 units, 30% volume, 450 HC)
- ซื้อ storage tech ด้วย HC; เทคที่ซื้อแล้วสลับใช้งานได้ฟรี และราคาใหม่ได้รับ difficulty multiplier

### Ship Modules
- Engine เพิ่มตัวคูณ thrust 25% ต่อบล็อก สูงสุด 4 บล็อก (ตัวคูณสูงสุด 2×); คิดรวมกับโบนัส Pilot และ hull
- Shield ลดความเสียหายจากการชน 20% ต่อบล็อก สูงสุด 3 บล็อก (ลดได้สูงสุด 60%)
- Repair Bay ทำให้ลูกเรือเดินไปซ่อมเมื่อ Hull ต่ำกว่า 75% และฟื้น 5 Hull/วินาทีจนเต็ม; ต้องมีลูกเรือและทางเดินถึงห้อง
- เลือกบล็อกด้วย 1–6 หรือ Q; ปุ่มเลือกแต่ละชนิด remap ได้ใน Settings และ Shipyard แสดง binding ปัจจุบันพร้อมคำอธิบาย

### เผ่าพันธุ์ (`species.ts`)
- **Human** — hunger/sanity ลดช้าลง 15%
- **Lumi-Jelly** — เรืองแสง, ซ่อมตัวยาน 0.4/s
- **Felinian** — เดินเร็ว +30%, เตือนอุกกาบาตล่วงหน้า
- **Synth-Bot** — ไม่หิว, beam เร็ว +25%, sanity ลดเร็ว +25% (ต้องใช้ Arcade)
- **Floran** — ฟื้น hunger/sanity เมื่ออยู่ในแสง, scan range +20%

### Hunger / Sanity (`Crew.tsx`)
- Hunger ลด 1.5 จุด/วินาที, Sanity ลด 0.5 จุด/วินาที; เมื่อค่าต่ำกว่า 40 ลูกเรือจะหา Food Dispenser หรือ Arcade ด้วย pathfinding และใช้บล็อกเพื่อฟื้น (ปกติ 15 จุด/วินาที)
- ถ้าไม่มีบล็อกที่ต้องการ HUD แสดงสถานะหิวหรือ Sanity ต่ำ; ตรวจแล้วว่าค่าต่ำ/ศูนย์ไม่ได้ทำให้ hull หรือความเร็วลด และไม่ทำให้ game over โดยตรง
- ตรวจ `src/` แล้ว ยังไม่พบระบบเล่นเสียง; เมื่อ hull ถึง 0 เกมยังไม่เข้า Game Over และ thrust เหลือ 55% (`hullThrustFactor`)

## 6. ปุ่มควบคุม

**Pilot:** เมาส์=เลี้ยว (คลิกเพื่อ lock, Esc ปล่อย) · W/S ดัน หน้า/หลัง · A/D yaw · ↑/↓ pitch · Q/E roll · Space/Shift strafe ขึ้น/ลง ·
C กล้อง chase/orbit · F ถือเพื่อเก็บ Scrap · P auto-pilot · Shift+P เปลี่ยน task · N waypoint ถัดไป · T วนเป้า · 1–4 action ของเป้า ·
O/L orbit/land ที่ดาว · J Space-Fold · R ซ่อมฉุกเฉิน · E dock · V interior view · U/I อัปเกรด Harvester/Auto-Pilot

**Build (docked):** คลิกหน้าบล็อก=สั่งสร้าง · Shift+คลิก=รื้อ · 1–6 หรือ Q เลือกบล็อก · ลาก=หมุนกล้อง · E=undock
**Pause/settings:** ปุ่ม PAUSE หรือ `Esc` หยุด simulation; ตั้ง mouse sensitivity และ remap ปุ่มได้จากเมนู
**Trade:** ปุ่ม TRADE RELAY เปิดตลาดทุก sector; ขาย Scrap/Survey Data เพื่อรับ HC และเลือก storage technology
**Difficulty:** `game/difficulty.ts` กำหนดช่วง spawn meteor และตัวคูณราคา HC ของบล็อก, อัปเกรด, fold, ซ่อมฉุกเฉิน และ storage tech; ค่าเริ่มต้นคือ Standard

## 7. จุดที่ต้องระวัง / ข้อสังเกต

1. `Character.tsx`, `Ship.tsx`, `autopilot.ts` ยังเป็นไฟล์ใหญ่; แก้เฉพาะเมื่อมีเหตุผลเฉพาะส่วน
2. `E` ใช้ทั้ง dock/undock และ roll; keymap ต้องรักษาพฤติกรรมนี้ (ใน pilot ยังส่งปุ่มให้ flight controller ด้วย)
3. Planet และ Earth สร้าง texture เองและต้อง dispose เมื่อ unmount; texture ของสถานีเป็น cache ที่ใช้ซ้ำ
4. Sector เปลี่ยนด้วย key ของ Scene subtree; Planet/Earth dispose textures, meteor tracks ลบเมื่อ unmount และเคลียร์เมื่อเปลี่ยน sector; fold 2 ครั้งผ่านโดยไม่พบ error แต่ยังไม่ได้ profile heap/GPU memory
5. README อธิบายการเล่นแล้ว; ไม่มี Save/Load หรือเสียงในขณะนี้
6. Build/lint/test และการเปิดฉากตรวจแล้วบางส่วน; ยังไม่ได้ยืนยันการเล่น campaign จนชนะ ดูสถานะใน PLAN
7. GitHub Pages ต้องใช้ base path `/<repository>/`; Vite ตั้งค่านี้อัตโนมัติเฉพาะใน GitHub Actions ส่วน local build ใช้ `/`
8. เมื่อทำ checklist item เสร็จ ให้รัน validation ที่เกี่ยวข้อง อัปเดต PLAN/เอกสารดีไซน์ แล้ว commit แยกตามหัวข้อเพื่อให้ย้อนดูได้ง่าย
