# T3 — Radar and speed gauge

Date: 2026-10-04 (Asia/Bangkok). Worktree: `C:\cosmohaven-wt\T3`, branch `feature/hud-radar`.
Initial `git status --short` was clean; `git log -5` began at `0529c4c`.
Read AGENTS.md, HANDOFF cautions/unverified work, T3 task, task queue, X0 audit, and plan section 8.11 ค.
This log uses the filename requested by the user rather than the older `T3-hud-radar.md` filename in the task.

## Changes and assumptions

- `src/hud/radarMath.ts`: pure ship-relative projection and bounded contact selection. Inverse normalized quaternion maps local -Z forward to canvas up; height is local +Y. Out-of-range contacts stay on the rim. A contact exactly overhead/underneath has no horizontal bearing: its clipped marker uses the top rim, with signed height.
- `src/hud/radarMath.test.ts`: 10 tests covering pitch/yaw/roll and combined rotation, signed height, clipping including vertical/zero-distance cases, translation invariance, input immutability, invalid ranges, selection priority and the cap. Median projection + selection of 500 contacts across 21 runs must be below 10 ms, within the 100 ms update interval.
- `src/hud/Radar.tsx`: one canvas updated by a cleaned-up 100 ms interval, reading existing stores without React state updates or physics subscriptions. Planet/station/scrap/relic/survey/meteor markers have distinct colors/shapes, height stems, and a white selected-target ring drawn last. Ship glyph and three range rings remain centered. Style table and outer margins leave room for later marker kinds/status arcs; no Heat/enemy system is added.
- Default range is **300 u**, twice `HARVEST_SCAN_RANGE = 150`: cargo becomes visible before entering harvesting range. The `range` prop can override it; no new player control or saved setting is introduced.
- Maximum **128 drawn markers**, prioritizing the locked target, navigation landmarks, meteors, and nearest in-range cargo. Distant cargo is culled except the locked target; distant planets/stations/meteors retain rim bearings subject to the cap.
- Speed uses `shipState.velocity.length()`, with a **50 u/s gauge scale**, rounded above the existing autopilot `APPROACH_CAP = 45` in `src/game/autopilot.ts`. This is a display scale, not a physical speed limit. Above 50, the arc saturates and turns amber while the number remains actual speed.
- `src/App.tsx`: minimal Radar import/mount in pilot mode and flight-controls class.
- `src/hud/ShipPanel.tsx`: removes duplicate speed subscription/header number.
- `src/index.css`: moves flight controls above the radar and dock prompt above controls, compacts controls at 1280px, and hides flight controls/radar/dock prompt while Trade is open so the dialog has space. The radar is hidden in build mode to preserve the assembly workspace; build layout remains usable.
- Four required JPEG artifacts in `docs/ux/T3-{before,after}-{build,flight}-*.jpg`, each below 200 KB. These and this log are the task's explicitly requested documentation artifacts. No other documentation/checklist was edited because the user's allowed-file scope excludes the plan.

## Verification

- Dev server: `npx vite --port 5303 --strictPort`; no other dev port used.
- `npm run lint`: final exit **0**, no lint diagnostics.
- `npm test`: final exit **0**, **143 passed, 1 skipped** (13 passing files, 1 skipped). Default test timeouts were retained. Run separately from Chrome/build after earlier timeouts; duration 18.46 s.
- `npm run build`: final exit **0**, inspected separately; Vite completed in 5.55 s. Existing Cannon chunk-size warning remains.
- `git diff --check`: exit **0**.
- Real Chrome headless, with SwiftShader: ran the existing `docs/ux/ux-audit.mjs` through a copy outside the repo, replacing only its Puppeteer import to use an already installed external package. `PORT=5303`; project dependencies/lockfile were unchanged.
- Supplementary external copy includes the radar canvas in overlap measurements (the original audit excludes elements without innerText). It also checks page errors and console errors. No console/page errors observed; a pre-existing THREE.Clock deprecation warning appeared.

| Final radar-inclusive measurement | 1280×720 | 1920×1080 | 2560×1440 |
|---|---:|---:|---:|
| Build overlaps | 0 | 0 | 0 |
| Flight overlaps | 0 | 0 | 0 |
| Flight + Trade overlaps (after final fix) | 0 | 0 | 0 |
| Build text lines | 36 | 36 | 36 |
| Flight text lines | 19 | 19 | 19 |

No measured build/flight panel was clipped. Radar has zero DOM text lines; speed is drawn into the canvas. Earlier flight captures sometimes had 20 lines due to the existing contextual `Meteors in range` row (also present in before captures), not added radar text.

Live canvas check: injected **501** cargo contacts into an isolated browser session, including a distant locked relic; paused physics for a stable speed vector `(30,40,0)`. Across 35 draws, the white selection ring appeared 35 times and the canvas speed label included **50 u/s**. Median draw duration **1.8 ms**, maximum **45.6 ms** under concurrent machine load. A repeat measured 2.0 ms median and 37.3 ms maximum. Browser session was discarded; no hooks or synthetic contacts were added to repository code or the user's saved game.

An initial unpaused browser probe failed its synthetic-speed assertion because physics overwrote the injected velocity (2 samples, 45 ms median, selected ring present). The paused probe isolates the canvas check; it does not establish flight FPS.

Extra Trade check found a 1280px overlap introduced by moving controls upward. The final CSS uses `display: none !important` to override their inline flex display while Trade is open. Rechecked all three sizes with an assertion that `.hud-trade-panel` actually opened: **31 text lines, 3 panels, overlaps = 0**, no clipped panels or console/page errors. An earlier quick recheck missed the button before React switched to flight mode; those mislabeled captures were discarded. The verified recheck polls flight controls and dialog presence. Its repeated paused canvas probe measured 1.9 ms median / 49.2 ms maximum over 35 draws.

## Earlier test failures (preserved)

First concurrent `npm test` run, exit 1:

```text
FAIL src/game/pathPlanner.test.ts:232
routes from the arrival point to every planet and station in 3,000 sectors
Error: Test timed out in 5000ms.
Test Files 1 failed | 12 passed | 1 skipped (14)
Tests 1 failed | 142 passed | 1 skipped (144)
```

Second concurrent run, exit 1:

```text
FAIL src/game/autopilotSim.test.ts:65
never hits a planet, a rock or a station, in any tier
Error: Test timed out in 120000ms.
FAIL src/game/fold.test.ts:221
every generated sector has a clear arrival point
Error: Test timed out in 5000ms.
FAIL src/game/pathPlanner.test.ts:185
reaches the goal in at least 99% of 3,000 fields, never cutting an obstacle, and explains the rest
Error: Test timed out in 5000ms.
FAIL src/game/pathPlanner.test.ts:207
keeps the detour within 1.5x of the straight line in typical fields
Error: Test timed out in 5000ms.
FAIL src/game/pathPlanner.test.ts:232
routes from the arrival point to every planet and station in 3,000 sectors
Error: Test timed out in 5000ms.
Test Files 3 failed | 10 passed | 1 skipped (14)
Tests 5 failed | 138 passed | 1 skipped (144)
```

These failures disappeared on the separate default `npm test` run; CPU contention is the working explanation, not a proven diagnosis. No out-of-scope tests or timeouts were edited.

## Not verified / remaining limitations

- Hardware-GPU FPS and manual flight performance with hundreds of objects: headless SwiftShader and concurrent machine load do not establish that FPS is unchanged. The contact cap, pure-math budget and isolated canvas timing were verified instead.
- Visual preference/readability is a proposal for the user to review, not an accepted design decision. Inspected real-browser screenshots; did not obtain user visual approval.
- Full gameplay round, other sectors, orbit/landing/arrival overlay, fold, interior, help/pause overlap layouts, mobile/portrait and manual docking were not audited for this task. Synthetic selected-target/speed checks are not a manual flight test.
- Existing engine-thrust frame-rate issue, autopilot/gravity concerns, planet surface issues, and bundle-size warning remain outside T3; see HANDOFF. No new dependency, physics/store/save changes, default-branch changes or push.
