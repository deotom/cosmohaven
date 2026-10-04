import type { GameMode } from '../game/types'
import { controlHints } from '../input/keymap'
import { panelStyle } from './styles'

/** Every key binding for the current mode plus the tips that used to be printed on the HUD all the time. */
export function HelpOverlay({ mode, onClose }: { mode: GameMode; onClose: () => void }) {
  const hints = controlHints(mode)
  return (
    <div
      role="dialog"
      aria-label="Controls help"
      className="hud-help-overlay"
      style={{
        ...panelStyle,
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(720px, calc(100vw - 32px))',
        maxHeight: '80vh',
        overflowY: 'auto',
        boxSizing: 'border-box',
        zIndex: 25,
        pointerEvents: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ fontWeight: 700, letterSpacing: 2, color: '#7fd4ff' }}>CONTROLS · {mode === 'pilot' ? 'FLIGHT' : 'SHIPYARD'}</div>
        <div role="button" aria-label="Close help" onClick={onClose} style={{ cursor: 'pointer', pointerEvents: 'auto', color: '#9fd4ff' }}>
          CLOSE [?]
        </div>
      </div>
      <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', columnGap: 24, rowGap: 2 }}>
        {hints.map((hint) => (
          <div key={hint}>{hint}</div>
        ))}
      </div>
      <div style={{ marginTop: 12, opacity: 0.85 }}>
        {mode === 'build' ? (
          <>
            <div>Click a block face — queue a block (drones build it)</div>
            <div>Shift+click a block — dismantle it (50% back)</div>
            <div>Drag — orbit camera · Scroll — zoom</div>
          </>
        ) : (
          <>
            <div>Mouse — steer: left / right yaw, up / down pitch (click to capture, Esc to release)</div>
            <div>Hold F near Scrap to harvest it · survey data sells for more than Scrap</div>
          </>
        )}
        <div>Ships can only be built or modified at a drydock.</div>
      </div>
    </div>
  )
}
