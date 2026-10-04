# T9 — Meteor variety (log)

Branch `feature/meteor-variety`, worktree `C:\cosmohaven-wt\T9`.

## What changed
- **New** `src/game/meteorField.ts` — pure generation (all take `rand`): gap = hard minimum + exponential tail, first delay 20–40 s,
  shower (12%: 3–6 small rocks, 0.5–2.5 s apart, ≤0.25 rad cone), log-normal radius (median 0.95, σ 0.6, clamp 0.4–4),
  mass ∝ r³ anchored at r 1.3 ↔ 40, speed 28→10 u/s falling with size (±10%), spin 0.2–2 rad/s random axis,
  spawn distance 80–140, 25% direct hits and otherwise miss distance 0–30 (exact closest approach), y squashed ×0.6 (kept),
  palette (3) + emissive intensity 0.15–0.5, `MAX_ACTIVE_METEORS = 12`. All tuning numbers are exported constants at the top.
- **New** `src/game/meteorGeometry.ts` — seeded lumpy icosahedron (position-based wave displacement ±30%, per-axis stretch ±40%,
  normalised so the furthest vertex is exactly 1), cached per (variant 0–5, detail 1|2) = max 12 geometries for the whole session.
  Collider = `0.92 × radius` sphere (`COLLIDER_FACTOR`); disposal is `disposeMeteorGeometries()` on EventManager unmount
  (geometries are shared, so they are not disposed per meteor on expiry).
- `src/game/EventManager.tsx` — uses the above; event queue with a game clock; **no spawning (and the clock does not advance) while docked**;
  active cap; the physics mesh stays unscaled and the visible rock is a scaled child mesh (cannon owns the parent's matrix);
  `meteorTracks` publishing is unchanged.
- `src/game/difficulty.ts` — `meteorInterval: [min,max]` replaced by `meteorGap: {min, mean}`: Relaxed 25/100, Standard 15/50, Challenging 8/25.
  `difficulty.test.ts` updated (intervals were uniform 30–40 / 15–20 / 8–12).
- `src/hud/PauseMenu.tsx` (outside the listed files, forced by the rename): label now "Meteor about every N s".
- Tests (new files): `meteorField.test.ts`, `meteorGeometry.test.ts`, `meteorAutopilot.test.ts`.
- `docs/agent-log/T9-meteor-variety.jpg` — size/shape sample (see below).

## Commands and results
- `npm run lint` → exit 0. `npm test` → exit 0 (15 files passed, 1 skipped; 156 passed, 1 skipped). `npm run build` → exit 0 (only the existing chunk-size warning).
  (Final re-run after removing the debug hook is recorded in the report below.)
- Browser (integrated browser, dev server on port 5309, temporary hook `window.__t9`, **removed**):
  - Docked: the clock stayed at 0 for 4 s → no spawn while docked.
  - Natural run, no skipping, 172 game-seconds after undock: 9 meteors at t = 25, 63, 81, 124, then a 5-rock shower at 140–148 s
    (gaps 38, 17, 43 s). Sizes r 0.47–2.51, speeds 18–28, miss 0–23. Console errors: none (only the existing THREE.Clock/shader warnings).
  - Forced run (clock skipped) hit the 12 cap; hull dropped as rocks hit the stationary ship, no crash/physics-worker error.
  - A real in-game rock was seen as an irregular dark-orange egg. The picture `T9-meteor-variety.jpg` is **not an in-game screenshot**: it is
    six cached geometries (r 0.45 … 3.6) rendered in a scratch WebGL canvas overlaid in the page — I could not get several rocks into the
    in-game camera frame reliably.

## Damage vs size (from `Ship.tsx` `handleImpact`: `(impact − 12) × 1.6`, cap 60, block torn if impact > 30; stationary ship, no shields)
| radius | speed | impact damage |
|---|---|---|
| 0.4 | ~28 | ~26% |
| 1.0 | ~25 | ~21% |
| 1.3 | ~24 | ~19% (old fixed rock: 18 u/s → 10%) |
| 2.5 | ~19 | ~11% |
| 4.0 | ~10 | 0% (under the 12 u/s threshold; it only shoves the ship; mass ≈ 1170) |
Damage ignores mass, so big slow rocks are *less* hurtful than small fast ones. Small rocks are now harder-hitting than the old 18 u/s
ball (~26% vs 10%): the user should judge this. Moving ship speed adds to the impact.

## Not verified
- Feel of the pacing, how the rocks look in flight, fairness of large rocks (the user must play).
- The in-game look of many different rocks at once; lighting/visibility of the darker rocks against the sky (emissive is lower than before: 0.15–0.5 vs 0.6).
- Autopilot tier 2 in the live game (only unit tests: `avoidMeteors` dodges rocks with miss < 8, ignores miss > 20, using the new generator's tracks).
- Whether the ship moving at speed gets shoved by a 1170-mass rock in a bad way.
- Headless FPS was fine here (clock ≈ real time), but I did not measure frame cost of the 12 × 320-triangle rocks.

## Assumptions
- Standard mean 50 s (spec 45–60); Relaxed 100, Challenging 25 (×2, ×0.5); minimum gaps 25/15/8. First delay 20–40 s for all difficulties.
- Gap counted from the last rock of an event (a shower can't overlap the next event).
- Shower rocks are capped at r ≤ 1; shower spawns can be skipped if the 12-cap is reached (the rock is dropped, not delayed).
- Collider 0.92 × radius: the longest axis pokes out ≤ ~8%, short axes are inside the sphere.
- Not spawning while docked is optional spec item 8: before this change meteors did spawn while docked (EventManager had no dock check).
- Lifetime stays 20 s; a 140-unit spawn at 10 u/s needs 14 s, so slow rocks arrive late but before expiry.

## Seen, not fixed
- Not verified why some forced queues showed fewer rocks than queued on the HUD counter; most likely the earlier ones had expired (20 s lifetime, slow tool round-trips), but I did not confirm it.
- Autopilot ignores meteor radius (`SAFE_DISTANCE` 12 for all); with r up to 4 a 12-unit pass is still ~8 from the surface — fine, but not tuned.
