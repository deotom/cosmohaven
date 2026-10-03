# CosmoHaven

CosmoHaven is a 3D space exploration and shipbuilding game. Assemble a ship from blocks at a drydock, keep its crew alive, recover cargo and Signal Relics, and use the Space-Fold drive to find Earth 2.0.

## Getting started

Requirements: Node.js and npm.

```sh
npm install
npm run dev
```

To verify a production build and the code quality checks:

```sh
npm run build
npm run lint
npm test
```

## How to play

Start by creating a crew member, then build and launch from the home drydock. Collect five Signal Relics across sectors to decode Earth 2.0 and establish a colony there.

The economy uses **Haven Credits (HC)**. Tractor-beam pickups occupy real cargo capacity and must be sold at the Trade Relay (90% rate) or a drydock (full rate). The starting hold fits 8 units; buy one of three storage technologies from the trade panel to expand or compress it. Relics occupy cargo space and cannot be sold. Some sectors also contain an optional Survey Beacon; recover its research data and sell it as valuable cargo.

Progress is autosaved to one local save slot. Choose **Continue** to resume your ship, crew, sector, and economy, or **New Game** to begin a fresh run. A short, skippable flight briefing introduces shipbuilding, cargo trading, and the campaign goal on the first run.

### Flight controls

| Input | Action |
|---|---|
| Mouse | Steer (click to capture; Esc to release) |
| W / S | Thrust forward / backward |
| A / D | Yaw |
| Up / Down | Pitch |
| Q / E | Roll |
| Space / Shift | Strafe up / down |
| C | Switch chase / orbit camera |
| F | Hold to harvest Scrap |
| P / Shift+P | Toggle auto-pilot / cycle its task |
| N / T | Next waypoint / cycle target |
| O / L | Enter orbit / initiate landing |
| J | Space-Fold to another sector |
| E | Dock when near a station |
| Esc | Pause / resume |
| R | Emergency hull repair |
| V | Toggle interior view |
| U / I | Upgrade Harvester / Auto-Pilot |
| Trade Relay button | Sell cargo or buy storage technology |

### Shipyard controls

Click a block face to queue construction; Shift-click a block to dismantle it. Use 1–6 to select Hull, Food Dispenser, Arcade, Engine, Shield, or Repair Bay, or Q to cycle the selection. Block and upgrade prices are paid in HC. Engines increase thrust, shields reduce impact damage, and crew use Repair Bays to restore hull below 75%. Drag to orbit the camera and scroll to zoom.

## Technology

Built with React, TypeScript, Vite, Three.js, React Three Fiber, and Cannon physics. See [docs/KNOWLEDGE.md](docs/KNOWLEDGE.md) for the architecture, gameplay systems, and implementation caveats, and [docs/PLAN.md](docs/PLAN.md) for the project checklist.

## Deployment

GitHub Actions runs lint, tests, and a production build on pushes and pull requests. A push to the repository's default branch deploys the site to GitHub Pages after verification succeeds. Set **Settings → Pages → Build and deployment → Source** to **GitHub Actions** in the repository; Vite applies the repository base path during the Actions build.
