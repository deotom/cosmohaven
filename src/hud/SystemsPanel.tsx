import { TASK_LABELS, setTask } from '../game/autopilot'
import { AUTOPILOT_TIERS, HARVESTER_TIERS, nextUpgradeCost, upgrade } from '../game/upgrades'
import { CELESTIAL_BODIES, getFoldCost, readGameStats } from '../game/gameState'
import { ROLES, crewProfile } from '../game/crewProfile'
import { SPECIES } from '../game/species'
import { Bar } from './Bar'
import { panelStyle, upgradeButtonStyle } from './styles'
import { readCrew, readHazards } from './readers'
import { useSampled } from './useSampled'
import { MeteorWarnings } from './Warnings'

export function SystemsPanel() {
  const game = useSampled(readGameStats)
  const harvester = HARVESTER_TIERS[game.harvesterTier - 1]
  const nextHarvester = HARVESTER_TIERS[game.harvesterTier]
  const autopilot = AUTOPILOT_TIERS[game.autopilotTier - 1]
  const nextAutopilot = AUTOPILOT_TIERS[game.autopilotTier]
  const ap = game.autopilot

  const upgradeButton = (system: 'harvester' | 'autopilot', key: string, next?: { name: string }) => {
    const cost = nextUpgradeCost(system)
    return (
    <div
      role="button"
      onClick={() => upgrade(system)}
      style={{ ...upgradeButtonStyle, color: next && cost !== undefined && game.scrap < cost ? '#ff8a8a' : '#cfe8ff' }}
    >
      {next && cost !== undefined ? `[${key}] Upgrade → ${next.name} · ${cost} Scrap` : 'Max tier'}
    </div>
    )
  }

  return (
    <div className="hud-system-panel" style={panelStyle}>
      <div style={{ fontWeight: 700, letterSpacing: 2, color: '#9dff9d' }}>SYSTEMS</div>

      <div style={{ marginTop: 6, color: harvester.beamColor, fontWeight: 700 }}>
        Harvester: {harvester.name} (T{game.harvesterTier})
      </div>
      <div style={{ opacity: 0.8 }}>
        Range {harvester.range} u · {harvester.collectTime}s per scrap{harvester.autoRange > 0 && ` · auto-pull ${harvester.autoRange} u`}
      </div>
      <div>{game.harvest.text}</div>
      {game.harvest.progress > 0 && <Bar label="Beam" value={game.harvest.progress * 100} />}
      {upgradeButton('harvester', 'U', nextHarvester)}

      <div style={{ marginTop: 10, fontWeight: 700, color: ap.engaged ? '#4dffb8' : '#cfe8ff' }}>
        Auto-Pilot: [{TASK_LABELS[ap.task]}] {ap.engaged ? 'ENGAGED' : 'OFF'} [P]
      </div>
      <div style={{ display: 'flex', gap: 6, margin: '4px 0' }}>
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
      <div style={{ opacity: 0.65, fontSize: 11 }}>Shift+P cycle task · T / middle-click: lock target</div>
      {(ap.task === 'nav' || ap.task === 'orbit' || ap.task === 'land') && (
        <div>
          Destination: <span style={{ color: '#fff' }}>{CELESTIAL_BODIES[ap.destination]?.name ?? '—'}</span> [N]
        </div>
      )}
      <div>
        Intelligence: <span style={{ color: '#fff' }}>{autopilot.name} (T{game.autopilotTier})</span>
      </div>
      <div style={{ opacity: 0.8 }}>{autopilot.blurb}</div>
      {ap.engaged && (
        <div>
          Auto-Pilot: <span style={{ color: '#4dffb8' }}>[{TASK_LABELS[ap.task]}] {ap.status}</span>
        </div>
      )}
      {upgradeButton('autopilot', 'I', nextAutopilot)}

      <div style={{ marginTop: 10, fontWeight: 700, color: '#d6a8ff' }}>Fold Drive [J]</div>
      <div style={{ opacity: 0.8 }}>Space-Fold to a new star system · {getFoldCost()} Scrap</div>
      <div>
        {game.fold.phase === 'charging'
          ? `Charging ${Math.round(game.fold.charge * 100)}%`
          : game.fold.phase === 'arriving'
            ? 'Arriving…'
            : 'Ready (pilot mode)'}
      </div>

      <div style={{ marginTop: 8, opacity: 0.8 }}>Thrust used: {game.thrustUsed.toFixed(1)} s</div>
    </div>
  )
}

export function CrewPanel() {
  const snapshot = useSampled(readCrew)
  const hazards = useSampled(readHazards)

  return (
    <div className="hud-crew-panel" style={panelStyle}>
      <div style={{ fontWeight: 700, letterSpacing: 2, color: '#ffb36b' }}>
        CREW · {crewProfile.name} ({SPECIES[crewProfile.species].name} {ROLES[crewProfile.role].name})
      </div>
      {SPECIES[crewProfile.species].hungerImmune ? (
        <div style={{ marginTop: 4, color: '#4dffb8' }}>Hunger: IMMUNE</div>
      ) : (
        <Bar label="Hunger" value={snapshot.hunger} />
      )}
      <Bar label="Sanity" value={snapshot.sanity} />
      {SPECIES[crewProfile.species].photosynthesis && (
        <div style={{ marginTop: 4, color: snapshot.lit ? '#a6ff5a' : '#8aa' }}>
          Photosynthesis: {snapshot.lit ? 'basking, regrowing' : 'in the dark'}
        </div>
      )}
      {SPECIES[crewProfile.species].shipRepair > 0 && <div style={{ marginTop: 4, color: '#7fe3ff' }}>Bioluminescent: mending the hull</div>}
      <div style={{ marginTop: 8 }}>
        Action: <span style={{ color: '#fff' }}>{snapshot.action}</span>
      </div>
      <div style={{ marginTop: 8, color: hazards.meteors > 0 ? '#ff7a4d' : undefined }}>
        Meteors in range: {hazards.meteors}
      </div>
      {SPECIES[crewProfile.species].meteorWarning && <MeteorWarnings />}
    </div>
  )
}
