import { useState } from 'react'
import { TASK_LABELS, setTask } from '../game/autopilot'
import { AUTOPILOT_TIERS, HARVESTER_TIERS, nextUpgradeCost, upgrade } from '../game/upgrades'
import { CELESTIAL_BODIES, getFoldCost, readGameStats } from '../game/gameState'
import { foldChecklist } from '../game/fold'
import { ROLES, crewProfile } from '../game/crewProfile'
import { SPECIES } from '../game/species'
import { Bar } from './Bar'
import { panelStyle, upgradeButtonStyle } from './styles'
import { readCrew, readHazards } from './readers'
import { useSampled } from './useSampled'
import { MeteorWarnings } from './Warnings'

/**
 * Ship systems. Collapsed it is four short lines (one per system); click the header to expand the details and
 * controls. What matters right now (an engaged auto-pilot, a charging fold) is always visible either way.
 */
export function SystemsPanel() {
  const game = useSampled(readGameStats)
  const foldChecks = useSampled(foldChecklist)
  const [expanded, setExpanded] = useState(false)
  const harvester = HARVESTER_TIERS[game.harvesterTier - 1]
  const nextHarvester = HARVESTER_TIERS[game.harvesterTier]
  const autopilot = AUTOPILOT_TIERS[game.autopilotTier - 1]
  const nextAutopilot = AUTOPILOT_TIERS[game.autopilotTier]
  const ap = game.autopilot
  const harvesterCost = nextUpgradeCost('harvester')
  const autopilotCost = nextUpgradeCost('autopilot')
  const modulesInstalled = game.modules.engines + game.modules.shields + game.modules.repairBays > 0
  const blockers = foldChecks.filter((check) => !check.ok)

  const upgradeButton = (system: 'harvester' | 'autopilot', key: string, next?: { name: string }) => {
    const cost = nextUpgradeCost(system)
    return (
      <div
        role="button"
        onClick={() => upgrade(system)}
        style={{ ...upgradeButtonStyle, color: next && cost !== undefined && game.credits < cost ? '#ff8a8a' : '#cfe8ff' }}
      >
        {next && cost !== undefined ? `[${key}] Upgrade → ${next.name} · ${cost} HC` : 'Max tier'}
      </div>
    )
  }

  const foldStatus =
    game.fold.phase === 'charging'
      ? `charging ${Math.round(game.fold.charge * 100)}% · [J] cancels`
      : game.fold.phase === 'arriving'
        ? 'arriving…'
        : blockers.length === 0
          ? `ready · ${getFoldCost()} HC`
          : `not ready · ${blockers[0].label}`

  return (
    <div className="hud-system-panel" style={panelStyle}>
      <div
        role="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((open) => !open)}
        style={{ fontWeight: 700, letterSpacing: 2, color: '#9dff9d', cursor: 'pointer', pointerEvents: 'auto' }}
      >
        SYSTEMS {expanded ? '▾' : '▸'}
      </div>

      <div style={{ marginTop: 4, color: harvester.beamColor }}>
        Harvester T{game.harvesterTier} · {harvester.range} u
        {nextHarvester && harvesterCost !== undefined && game.credits >= harvesterCost && (
          <span style={{ color: '#4dffb8' }}> · ▲ [U] {harvesterCost} HC</span>
        )}
      </div>
      {game.harvest.progress > 0 && <Bar label="Beam" value={game.harvest.progress * 100} />}
      <div style={{ color: ap.engaged ? '#4dffb8' : '#cfe8ff' }}>
        Auto-Pilot {ap.engaged ? `[${TASK_LABELS[ap.task]}] ${ap.status}` : 'off'} [P]
        {!ap.engaged && nextAutopilot && autopilotCost !== undefined && game.credits >= autopilotCost && (
          <span style={{ color: '#4dffb8' }}> · ▲ [I] {autopilotCost} HC</span>
        )}
      </div>
      <div style={{ color: game.fold.phase === 'idle' && blockers.length > 0 ? '#ff8a8a' : '#d6a8ff' }}>Fold [J] {foldStatus}</div>
      {modulesInstalled && (
        <div style={{ opacity: 0.85 }}>
          Engine {game.modules.engines} · Shield {game.modules.shields} · Repair {game.modules.repairBays}
        </div>
      )}

      {expanded && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(160,210,255,0.2)' }}>
          <div style={{ opacity: 0.8 }}>
            {harvester.name} · {harvester.collectTime}s per scrap{harvester.autoRange > 0 && ` · auto-pull ${harvester.autoRange} u`}
          </div>
          <div>{game.harvest.text}</div>
          {upgradeButton('harvester', 'U', nextHarvester)}

          <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
            {(['nav', 'harvest', 'hold', 'evac'] as const).map((task) => (
              <div
                key={task}
                role="button"
                onClick={() => setTask(task, { intent: 'choose' })}
                style={{
                  pointerEvents: 'auto',
                  cursor: 'pointer',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 700,
                  color: ap.task === task ? '#021014' : '#cfe8ff',
                  background: ap.task === task ? '#4dffb8' : 'transparent',
                  border: '1px solid rgba(160,210,255,0.4)',
                }}
              >
                {TASK_LABELS[task]}
              </div>
            ))}
          </div>
          {(ap.task === 'nav' || ap.task === 'orbit' || ap.task === 'land') && (
            <div style={{ marginTop: 4 }}>
              Destination: <span style={{ color: '#fff' }}>{CELESTIAL_BODIES[ap.destination]?.name ?? '—'}</span> [N]
            </div>
          )}
          <div style={{ opacity: 0.8 }}>
            {autopilot.name} (T{game.autopilotTier}): {autopilot.blurb}
          </div>
          {upgradeButton('autopilot', 'I', nextAutopilot)}

          {blockers.length > 0 && game.fold.phase === 'idle' && (
            <div style={{ marginTop: 8 }}>
              {blockers.map((check) => (
                <div key={check.id} style={{ color: '#ff8a8a', fontSize: 12 }}>
                  ✗ {check.label}
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 8, opacity: 0.7 }}>
            Engine +{Math.min(game.modules.engines, 4) * 25}% thrust · Shield −{Math.min(game.modules.shields, 3) * 20}% impact · Repair Bay mends
            below 75% hull
          </div>
        </div>
      )}
    </div>
  )
}

export function CrewPanel() {
  const snapshot = useSampled(readCrew)
  const hazards = useSampled(readHazards)
  const species = SPECIES[crewProfile.species]

  return (
    <div className="hud-crew-panel" style={panelStyle}>
      <div style={{ fontWeight: 700, letterSpacing: 2, color: '#ffb36b' }}>
        {crewProfile.name} · {species.name} {ROLES[crewProfile.role].name}
      </div>
      {species.hungerImmune ? <div style={{ marginTop: 4, color: '#4dffb8' }}>Hunger: immune</div> : <Bar label="Hunger" value={snapshot.hunger} />}
      <Bar label="Sanity" value={snapshot.sanity} />
      {species.photosynthesis && (
        <div style={{ marginTop: 4, color: snapshot.lit ? '#a6ff5a' : '#8aa' }}>
          Photosynthesis: {snapshot.lit ? 'basking, regrowing' : 'in the dark'}
        </div>
      )}
      {species.shipRepair > 0 && <div style={{ marginTop: 4, color: '#7fe3ff' }}>Bioluminescent: mending the hull</div>}
      <div style={{ marginTop: 6, opacity: 0.85 }}>{snapshot.action}</div>
      {hazards.meteors > 0 && <div style={{ marginTop: 4, color: '#ff7a4d' }}>Meteors in range: {hazards.meteors}</div>}
      {species.meteorWarning && <MeteorWarnings />}
    </div>
  )
}
