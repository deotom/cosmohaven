# T8 - Autopilot trajectory simulator (includes T6) - log

Branch `feature/autopilot-sim`. Nothing pushed.

## Files changed
- `src/game/autopilotSim.ts` (new): headless simulator. Runs the real `runAutopilot`, real gravity and the ship physics (damping, atmosphere drag, thrust, cannon-es step order). Seeded (`mulberry32`), no `Math.random`.
- `src/game/autopilotSim.test.ts` (new, 7 tests, ~13 s): constants match `Ship.tsx`; matches cannon-es (<1e-6 pos/vel, <1e-9 attitude over 600 steps); station radius covers the structure; 4 seeds + home sector x tiers 1-3 with 0 crashes; no fall-in after NAV arrival; seed 83; ship-radius sanity.
- `src/game/autopilotSim.full.test.ts` (new): slow measurement, only with `AUTOPILOT_SIM_FULL=1` (`AUTOPILOT_SIM_SEEDS`, `_REPORT`, `_OUT`, `_RADIUS`, `_ACCEL`, `_FPS`). Asserts 0 planet/rock/station crashes.
- `src/game/autopilot.ts`: arrival hold in `navTask`; skip unreachable scrap (T6); `resetRoute`.
- `src/game/pathPlanner.ts`: planet `core` and rock `solids` checks in `findGate`; buried goal -> blocked; station avoid radius.
- `src/game/station.ts`, `SpaceStation.tsx`: collider constants moved to `station.ts` (exported), plus derived `STATION_EXTENT` / `STATION_AVOID_RADIUS` (~99). `STATION_KEEP_OUT` (85) untouched (the sector generator uses it).

## Root causes found by measuring
1. **Fall-in after NAV arrival (the user's "sucked in by gravity").** At arrival `navTask` set throttle 0 and did nothing; gravity pulled the ship into the planet. Seen in the real game (Kepler-9: 16-18 u/s to the surface, hull 93->80%) and in the sim. Fix: hold position on arrival (counter gravity + velocity damping, capped at autopilot thrust).
2. **Final leg through a planet.** `findGate` could choose a near-side gate; the gate->scrap leg then cut through the planet when the scrap lay on the far side inside the avoid sphere (dive at 36-43 u/s). Fix: planet core check; goal buried in a core -> blocked. T6: blocked pickup goes to an `unreachable` set and the next scrap is used.
3. **Final leg through a rock** (seed 110): gate chosen so the leg to scrap next to a small rock cut through the rock. Fix: rock `solids` check in `findGate`.
4. **Station:** the sim never produced a station crash (min gap >= 12 u for the starter ship). Solar-array corners reach ~89 u, past the old 85 u sphere (arrays have no collider). The larger radius is a precaution from geometry, not a confirmed bug fix. Hangar mouth (+Z) stays enterable: DOCK 100% arrived, 0 crashes before and after.

## Before / after (300 generated sectors + home; 23,319 runs each; tiers 1-3 x nav/dock/harvest)
Start families: arrival, undock, flyby (slow/still at well edge), graze (moving past a planet), cross (through station/rocks), wellscrap, random.

| | runs | arrived | planet | rock | station | timeout | blocked |
|---|---|---|---|---|---|---|---|
| before | 23319 | 78.4% | 5040 | 3 | 0 | - | 3 |
| after | 23319 | 99.8% | 0 | 0 | 0 | 42 | 0 |

Before: every NAV run (1670 per tier) ended in the planet at 12-14 u/s, plus 10 harvest runs per tier. After, per tier and task: NAV 100% arrived (tier 1/2/3), DOCK 100%, HARVEST 99.8%, all with 0 crashes.
The 42 timeouts (14 scenarios x 3 tiers, seeds 23, 45, 83, 98, 102, 114, 186, 202, 228) are scrap the planner judges unreachable (inside a planet's atmosphere/core or without a clear approach); the autopilot skips them and reports "Sweeping: no scrap". Not crashes.

## Path length (mean length / straight line)
Before -> after: dock 1.07-1.08 -> 1.09-1.10 (~+2%); harvest 1.07-1.08 -> 1.07-1.08. NAV had no baseline (it never arrived before); after: 0.72-0.75 (arrival at 0.97 of the well radius, not at the centre). Well under the +30% limit.

## Simulator vs the real game
- vs cannon-es (same body, 600 steps): <1e-6 position/velocity. An integrator-order bug in my first version (force before damping) gave 0.33 u error over 10 s; fixed.
- vs the browser (home sector, tier 1, start at the hangar mouth (0,-3.5,36.7), v=0.74, NAV to Kepler-9): the game stops at (-134,-33,-175), the sim at (-132,-33,-168), ~7 u apart (~1.5% of 450 u). Shape and speeds match (peaks ~22-24 u/s); the game's timing is ~2 s off. The game ran at ~2 FPS and had meteor hits.
- Browser post-fix: arrived at ~143 u from the centre and held for ~90 s without falling in; hull drops came from meteors. Pre-fix recording: arrival, then a fall to the surface (LANDED, hull 93->80%).

## Not verified
- Browser: NAV with rocks in the way and a slow fly-by of a planet. The home sector has one planet and almost no rocks. Sim evidence only.
- How the detour feels to fly.
- Meteors (the sim ignores them; tier 1 does not dodge by design). In the browser they hit the hull on the way.
- Player-built ships: only radius 2 (starter) plus sweeps at radius 4/8 before the last fixes; non-uniform inertia not swept.
- The real main thrust is not scaled by dt (maneuver and gravity are), so at fps != 60 the real impulse differs (~2.4x at 144 fps). The sim runs at 60 Hz. Not fixed (outside scope).
- Solar arrays are visual only (no collider).

## Assumptions
- Arrival (NAV) = status "Arrival" then 60 s without a crash; dock = canDock; harvest = within 10 u; blocked = "Path blocked" > 5 s.
- Editing `station.ts`/`SpaceStation.tsx` and the arrival hold touches things outside a strict file list; both were needed for the sim's shared constants and the user-reported fall-in.
- `docs/PLAN_CREW_AND_SHIPS.md` has no checkbox for T8, so no line was edited.

## Commands
`npm run lint` 0; `npm test` 133 passed, 1 skipped (the full sim), 16 s; `npm run build` exit 0 (chunk-size warning only); full sim `AUTOPILOT_SIM_FULL=1 AUTOPILOT_SIM_SEEDS=300 npx vitest run src/game/autopilotSim.full.test.ts` ~13 min, passed.
