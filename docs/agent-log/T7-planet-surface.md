# T7 — Planet surface & landing experience (P0–P1)

Branch `feature/planet-surface` (worktree `C:\cosmohaven-wt\T7`). Not pushed.

## P0 diagnosis (numbers)
Scratch cannon-es script: box ship dropped on a static sphere (R = 40/100/150; 1-block and 3×3 flat) rests at centre altitude **0.500** = collider radius == visual sphere radius == `body.radius`; block = 1 u cube. `LAND_ALTITUDE = 5` (centre altitude), so `landed` triggers ~4.5 u before contact.
- Case 1 (surface smooth/featureless): **yes, main cause.**
- Case 2 (ship sinks through surface): **not occurring** (collider matches visual; tessellation sag ≤ 0.05 u).
- Case 3 (camera clips): already fixed upstream (`clampAboveSurface`, margin 2).
- Other findings, fixed: planet mesh rotated (`rotation.y += dt*0.012`) while collider is static → surface drifted 0.5–1.8 u/s under a landed ship (rotation now frozen near ground); cloud shell at R×1.012 overlapped ship/camera at touchdown (cloud opacity fades with detail strength).

## Changes
New: `src/game/surfaceDetail.ts` (pure helpers: planetKind/isLandable, detail strength, shader patch, deterministic props, dust/shake), `GroundProps.tsx` (one InstancedMesh, ≤400 props, no collider), `LandingDust.tsx` (160-particle pooled points, touch shake), `surfaceDetail.test.ts`.
Modified: `Planet.tsx` (detail shader, rotation freeze, cloud fade, mounts props/dust), `autopilot.ts` (gas giants refuse de-orbit/landing), `Ship.tsx` (touchdown requires `isLandable`), `ArrivalPanel.tsx` (no land buttons for gas giants), `docs/PLAN_CREW_AND_SHIPS.md` (P0 `[x]`, P1 `[~]`).
`sector.ts` untouched.

## Verification
- Sector snapshot: 1000 sectors (250 seeds × 4 ids) dumped before, compared after → identical (temp test removed).
- `npm run lint` exit 0 (0 warnings); `npx vitest run` 13 files passed / 1 skipped, 148 tests passed; `npm run build` exit 0 (only chunk-size warning).
- Headless Chrome (puppeteer, swiftshader) on rocky/ice planet Luxa-4 at alt ≈200/50/10/touch, before vs after: `docs/ux/T7-{before,after}-{200,50,10,1}.jpg`. After: visible surface variation, rock props, touchdown reaches `landed`. No console errors.

## NOT verified
- Whether it "looks good" — user judgment; screenshots are proposals only.
- FPS (headless ≈2 FPS; not meaningful). Props capped 400, dust 160 particles.
- Dust and touch-shake animation (static screenshots only), real manual flight/landing, gas-giant refusal in the live game (covered by unit test only), ice/gas visuals.

## Assumptions
- `landable` derived from the name hash (`planetKind`, same formula as old Planet.tsx), not added to `PlanetSpec` → save format/sector generation unchanged.
- Gas refusal placed in `autopilot.ts` since `requestArrival`/keymap/targetActions are outside touchable files.
- Touch shake lives in LandingDust, relying on it running after CameraRig (mount order; fragile).

## Problems seen, not fixed
- Pressing L on a gas giant briefly sets phase `deorbit` before autopilot reverts it with a notice.
- `Earth.tsx` untouched; detail layer is colour-only (no normals); no heightfield (P3).
- `LAND_ALTITUDE` (5) vs rest altitude (0.5) gap left as is.
