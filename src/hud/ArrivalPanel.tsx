import type { CSSProperties } from 'react'
import { CELESTIAL_BODIES, readGameStats, requestArrival } from '../game/gameState'
import { useSampled } from './useSampled'

/** The arrival choice, orbital insertion, and landing telemetry, shown while the ship is inside a planet's sphere of influence. */
export function ArrivalPanel() {
  const game = useSampled(readGameStats, 100)
  const a = game.arrival
  const body = CELESTIAL_BODIES[a.body]
  if (a.phase === 'none' || !body) return null

  const well = game.well
  const altitude = well?.altitude ?? 0
  const vertical = well?.radialSpeed ?? 0
  const orbitSpeed = well?.orbitSpeed ?? 0
  const safe = -vertical <= 12
  const box: CSSProperties = {
    position: 'absolute',
    top: 16,
    left: '50%',
    transform: 'translateX(-50%)',
    minWidth: 360,
    padding: '12px 20px',
    textAlign: 'center',
    font: '14px/1.55 ui-monospace, Consolas, monospace',
    color: '#dff6ff',
    background: 'rgba(6, 16, 34, 0.85)',
    border: '1px solid rgba(80, 200, 255, 0.55)',
    borderRadius: 12,
    boxShadow: '0 0 28px rgba(60, 170, 255, 0.25)',
  }
  const choiceButton = (key: string, label: string, color: string, onClick: () => void) => (
    <div
      role="button"
      onClick={onClick}
      style={{ pointerEvents: 'auto', cursor: 'pointer', padding: '8px 16px', borderRadius: 8, fontWeight: 700, color, border: `1px solid ${color}`, background: 'rgba(255,255,255,0.05)' }}
    >
      [{key}] {label}
    </div>
  )

  const title = (text: string, color = '#7fe3ff') => <div style={{ fontWeight: 800, letterSpacing: 3, color }}>{text}</div>

  return (
    <div className="hud-arrival-panel" style={box}>
      {a.phase === 'choice' && (
        <>
          {title(`SPHERE OF INFLUENCE: ${body.name.toUpperCase()}`)}
          <div style={{ opacity: 0.85 }}>
            Altitude {Math.round(altitude).toLocaleString()} u · Speed {Math.round(well?.speed ?? 0)} u/s · Circular orbit here: {Math.round(orbitSpeed)} u/s
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 8 }}>
            {choiceButton('O', 'ENTER ORBIT', '#4dffb8', () => requestArrival('orbit'))}
            {choiceButton('L', 'INITIATE LANDING', '#ffb347', () => requestArrival('land'))}
          </div>
        </>
      )}
      {a.phase === 'insertion' && (
        <>
          {title('ORBITAL INSERTION', '#4dffb8')}
          <div>{game.autopilot.status}</div>
          <div style={{ opacity: 0.8 }}>Target orbit speed {Math.round(orbitSpeed)} u/s · any control input cancels</div>
        </>
      )}
      {a.phase === 'orbiting' && (
        <>
          {title('ORBIT LOCKED', '#4dffb8')}
          <div>
            {body.name} · altitude {Math.round(altitude).toLocaleString()} u · {Math.round(well?.speed ?? 0)} u/s · engine off
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 6 }}>
            {choiceButton('L', 'DE-ORBIT AND LAND', '#ffb347', () => requestArrival('land'))}
          </div>
        </>
      )}
      {a.phase === 'deorbit' && (
        <>
          {title('DE-ORBIT BURN', '#ffb347')}
          <div>{game.autopilot.status}</div>
        </>
      )}
      {a.phase === 'descent' && (
        <>
          {title(well?.inAtmosphere ? 'ATMOSPHERIC RE-ENTRY' : 'DESCENT', well?.inAtmosphere ? '#ff8a4d' : '#ffb347')}
          <div>
            Altitude <b>{Math.round(altitude).toLocaleString()}</b> u · Vertical{' '}
            <b style={{ color: safe ? '#4dff88' : '#ff5d5d' }}>{vertical.toFixed(1)}</b> u/s{' '}
            <span style={{ color: safe ? '#4dff88' : '#ff5d5d' }}>{safe ? '(safe)' : '(TOO FAST: under 12 to land)'}</span>
          </div>
          <div>
            Throttle lever <b>{Math.round(a.lever * 100)}%</b>{game.autopilot.engaged ? ' · AUTO-LANDING' : ''}
          </div>
          <div style={{ opacity: 0.75, fontSize: 12 }}>Space / Shift: throttle up / down · touch down under 12 u/s</div>
        </>
      )}
      {a.phase === 'landed' && (
        <>
          {title(`LANDED ON ${body.name.toUpperCase()}`, '#4dff88')}
          <div style={{ opacity: 0.8 }}>Thrust away to lift off</div>
        </>
      )}
    </div>
  )
}
