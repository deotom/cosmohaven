# AGENTS.md — rules for any AI agent working on CosmoHaven

CosmoHaven is a 3D space sim in the browser: Vite + React 19 + TypeScript, @react-three/fiber, drei,
@react-three/cannon (physics in a worker), three 0.186. Docs are mostly Thai; code and identifiers are English.

## Read first (only what your task needs)

| Doc | Use it for |
|---|---|
| `docs/GAME_DESIGN.md` | What the game is and which systems exist |
| `docs/KNOWLEDGE.md` | Architecture, file map, numbers, pitfalls |
| `docs/PLAN_CREW_AND_SHIPS.md` | The forward plan. **Read only the section your task names** (it is long) and keep its checklist current |
| `docs/PLAN.md` | Older checklist, maintained by someone else: do not edit |

## Commands

```sh
npm ci          # install
npm run dev     # dev server (Vite)
npm run lint    # oxlint, type-aware
npm test        # vitest run
npm run build   # tsc -b && vite build
```

CI (`.github/workflows/ci.yml`) runs lint, test and build on every push and PR, and deploys to GitHub Pages
from the default branch. A change is not done until all three pass locally.

## Code rules learned the hard way

- **Ship position/rotation come from `object.matrix`**, never `position`/`quaternion`: cannon writes the body
  transform into the matrix (`matrixAutoUpdate = false`).
- **Never subscribe to a physics body per object if that body can be removed** (meteors, etc.): it crashed the
  physics worker. Track via the mesh matrix instead.
- **Forces are cleared every physics substep**: scale applied forces by `dt * 60` for frame-rate independence.
- **Game state is module-level mutable stores** (`gameStats`, `shipState`, `crewStats`, `construction`, ...),
  sampled by the HUD (`useSampled`) a few times a second. Do not push 60 fps state through React state. The lint
  rules reject mutating values inside components/hooks: put mutation in plain module-level functions.
- **Anything that must survive a reload goes through `src/game/saveGame.ts`**. If you add or change a field on
  `gameStats` (or similar), update save and restore too, with a validation rule and a test.
- **Generation is seeded and reproducible** (`mulberry32` in `src/game/rng.ts`). Do not call `Math.random()` in
  code that builds a sector or a character unless the task says so.
- **All key bindings live in one table**: `src/input/keymap.ts`. Do not add ad-hoc `keydown` listeners.
- **Money is HC (credits)**; Scrap is cargo that is sold for HC. Prices go through `adjustedCost` (difficulty).
  Reuse it, do not add another price system.
- **Windows checkout**: never create two files whose names differ only by letter case.
- Match the surrounding style: naming, comment density, idiom. Prefer small pure functions that can be unit tested.
- No new dependency without a stated reason in the PR/log.

## Working rules (several agents share this repo)

1. Before starting: `git status` and `git log -5`. If someone else has uncommitted changes in a file you need,
   stop and report instead of editing it.
2. Work on a feature branch (`feature/<topic>`). Commit only on that branch. **Never push, force-push, or touch
   the default branch.** Do not rewrite history.
3. Stay inside the scope the task gives. Out-of-scope problems go in your report, not in your diff.
4. Do not edit `docs/PLAN.md` or `docs/GAME_DESIGN.md`. In `docs/PLAN_CREW_AND_SHIPS.md` update only the
   checkbox lines for your own task: `[x]` done and verified, `[~]` in progress, `[ ]` not started.
5. Put new tests in a new file next to the code (`something.test.ts`) rather than appending to
   `src/game/game.test.ts`, which many tasks touch.
6. Temporary debug hooks and scratch files must be removed before you finish. Keep scratch work outside the repo.

## Definition of done

- `npm run lint`, `npm test` and `npm run build` all pass.
- New logic that can be a pure function has a unit test.
- Anything visible was checked in a real browser. If you could not, say so.
- A short log at `docs/agent-log/<task-name>.md`: what changed (files), commands run and their results, what you
  did **not** verify, assumptions you made, problems you saw but did not fix.

## Reporting

Be exact about what was verified. If a test fails, include the output. Do not claim something works because it
type-checks. If a requirement is ambiguous, state the assumption you chose rather than silently picking one.
