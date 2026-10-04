# Copilot instructions for CosmoHaven

The full rules are in [AGENTS.md](../AGENTS.md). Read it before changing code. The points that cause the most damage when missed:

- Ship position/rotation come from `object.matrix`, not `position`/`quaternion` (cannon writes the matrix).
- Do not subscribe to a physics body per object if the body can be removed (crashed the physics worker).
- Game state lives in module-level stores sampled by the HUD; mutation goes in plain functions, not in components.
- Anything that must survive a reload goes through `src/game/saveGame.ts` (save, restore, validation, test).
- Key bindings live only in `src/input/keymap.ts`. Money is HC via `adjustedCost`. Generation is seeded (`mulberry32`).
- Work on a `feature/*` branch; never push or touch the default branch; do not edit `docs/PLAN.md` or `docs/GAME_DESIGN.md`.
- Done means `npm run lint`, `npm test` and `npm run build` pass, plus a log at `docs/agent-log/<task>.md` that states
  what was and was not verified.
