import { dockInfo, requestDockToggle, useDock } from '../game/dock'
import { meteorTracks } from '../game/gameState'
import { shipState } from '../game/shipState'
import { shipPositionRef } from '../game/targetScreen'
import { buttonStyle } from './styles'
import { useSampled } from './useSampled'

type Warning = { id: number; eta: number; miss: number }

/** Felinian whisker-sense: meteors that will pass close, and how long until they do. Looks 20 s ahead. */
function readWarnings(): Warning[] {
  const ship = shipPositionRef.current
  const warnings: Warning[] = []
  for (const [id, track] of meteorTracks) {
    const relX = track.position[0] - ship.x
    const relY = track.position[1] - ship.y
    const relZ = track.position[2] - ship.z
    const vx = track.velocity[0] - shipState.velocity.x
    const vy = track.velocity[1] - shipState.velocity.y
    const vz = track.velocity[2] - shipState.velocity.z
    const speedSq = vx * vx + vy * vy + vz * vz
    if (speedSq < 1e-3) continue
    const eta = -(relX * vx + relY * vy + relZ * vz) / speedSq
    if (eta < 0 || eta > 20) continue
    const miss = Math.hypot(relX + vx * eta, relY + vy * eta, relZ + vz * eta)
    if (miss < 30) warnings.push({ id, eta, miss })
  }
  return warnings.sort((a, b) => a.eta - b.eta).slice(0, 3)
}

export function MeteorWarnings() {
  const warnings = useSampled(readWarnings, 250)
  if (warnings.length === 0) return <div style={{ marginTop: 4, color: '#8aa' }}>Whiskers: all quiet</div>
  return (
    <div style={{ marginTop: 6, color: '#ffb36b', fontWeight: 700 }}>
      {warnings.map((w) => (
        <div key={w.id}>
          ⚠ Meteor in {w.eta.toFixed(0)} s (passes {w.miss.toFixed(0)} u {w.miss < 12 ? '- DIRECT HIT' : 'away'})
        </div>
      ))}
    </div>
  )
}

const readDock = () => ({ ...dockInfo })

/** The "Press [E] to Dock" prompt that appears near a station, and a warning when going too fast. */
export function DockPrompt() {
  const info = useSampled(readDock, 100)
  if (!info.prompt) return null
  return (
    <div
      className="hud-dock-prompt"
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 96,
        transform: 'translateX(-50%)',
        padding: '12px 26px',
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: 18,
        fontWeight: 700,
        letterSpacing: 2,
        color: info.canDock ? '#4dffb8' : '#ffc94d',
        background: 'rgba(5, 14, 30, 0.8)',
        border: `1px solid ${info.canDock ? '#4dffb8' : '#ffc94d'}`,
        borderRadius: 10,
        boxShadow: `0 0 24px ${info.canDock ? 'rgba(77,255,184,0.35)' : 'rgba(255,201,77,0.3)'}`,
        pointerEvents: 'none',
      }}
    >
      {info.stationName && <div style={{ fontSize: 12, opacity: 0.75, letterSpacing: 3 }}>{info.stationName.toUpperCase()}</div>}
      {info.prompt}
    </div>
  )
}

/** Undock when docked; dock when a station is in range. */
export function DockButton() {
  const dock = useDock()
  const info = useSampled(readDock, 150)
  if (dock.phase === 'docked') {
    return (
      <div role="button" onClick={requestDockToggle} style={buttonStyle}>
        UNDOCK [E]
      </div>
    )
  }
  if (dock.phase === 'free' && info.canDock) {
    return (
      <div role="button" onClick={requestDockToggle} style={{ ...buttonStyle, color: '#4dffb8' }}>
        DOCK AT SHIPYARD [E]
      </div>
    )
  }
  return null
}

/** The shipyard's assembly panel: pick a block to build and watch the drones work through the queue. */
