import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildScenarios, formatReport, listFailures, simulate, tally, type SimResult } from './autopilotSim'
import { generateSector, homeSector } from './sector'

/**
 * The slow, full measurement. Skipped unless AUTOPILOT_SIM_FULL is set:
 *
 *   $env:AUTOPILOT_SIM_FULL=1; npx vitest run src/game/autopilotSim.full.test.ts
 *
 * AUTOPILOT_SIM_SEEDS sets how many sectors (default 300), AUTOPILOT_SIM_RADIUS and AUTOPILOT_SIM_ACCEL the ship's collision radius and
 * main-engine acceleration, AUTOPILOT_SIM_REPORT a file for the report and AUTOPILOT_SIM_OUT a JSON file for the raw results.
 */
const FULL = Boolean(process.env.AUTOPILOT_SIM_FULL)
const SEEDS = Number(process.env.AUTOPILOT_SIM_SEEDS ?? 300)
const OPTIONS = {
  shipRadius: process.env.AUTOPILOT_SIM_RADIUS ? Number(process.env.AUTOPILOT_SIM_RADIUS) : undefined,
  mainAccel: process.env.AUTOPILOT_SIM_ACCEL ? Number(process.env.AUTOPILOT_SIM_ACCEL) : undefined,
  dt: process.env.AUTOPILOT_SIM_FPS ? 1 / Number(process.env.AUTOPILOT_SIM_FPS) : undefined,
}

describe.skipIf(!FULL)('auto-pilot trajectory simulation (full)', () => {
  it(
    'does not hit a planet, a rock or a station in any scenario',
    () => {
      const results: SimResult[] = []
      for (let seed = 1; seed <= SEEDS; seed++) {
        const sector = generateSector(seed, 1 + (seed % 50))
        for (const scenario of buildScenarios(sector, seed)) results.push(simulate(scenario, OPTIONS))
      }
      const home = homeSector()
      for (const scenario of buildScenarios(home, 0, [1, 2, 3], 'home')) results.push(simulate(scenario, OPTIONS))

      const failures = listFailures(results, 60).join('\n')
      const report = `${formatReport(`${SEEDS} generated sectors + home sector`, results)}\n\n${failures}\n`
      console.log(report)
      if (process.env.AUTOPILOT_SIM_REPORT) writeFileSync(process.env.AUTOPILOT_SIM_REPORT, report)
      const out = process.env.AUTOPILOT_SIM_OUT
      if (out) writeFileSync(out, JSON.stringify(results))

      const t = tally(results)
      expect(t.planet + t.asteroid + t.station).toBe(0)
    },
    3_600_000,
  )
})
