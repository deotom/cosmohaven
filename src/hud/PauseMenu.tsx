import { useEffect, useState } from 'react'
import { DIFFICULTY_ORDER, DIFFICULTY_PROFILES, type Difficulty } from '../game/difficulty'
import { buttonStyle } from './styles'
import {
  CONTROL_DEFINITIONS,
  controlLabel,
  getControlCode,
  type ControlId,
  type InputPreferences,
} from '../input/preferences'

type PauseMenuProps = {
  preferences: InputPreferences
  difficulty: Difficulty
  settingsError: string | null
  onResume: () => void
  onDifficultyChange: (difficulty: Difficulty) => void
  onSensitivityChange: (value: number) => void
  onAssignControl: (id: ControlId, code: string) => void
  onResetControls: () => void
}

export function PauseMenu({
  preferences,
  difficulty,
  settingsError,
  onResume,
  onDifficultyChange,
  onSensitivityChange,
  onAssignControl,
  onResetControls,
}: PauseMenuProps) {
  const [capturing, setCapturing] = useState<ControlId | null>(null)
  const [captureError, setCaptureError] = useState<string | null>(null)

  useEffect(() => {
    if (!capturing) return
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopImmediatePropagation()
      if (event.code === 'Escape') {
        setCapturing(null)
        return
      }
      try {
        onAssignControl(capturing, event.code)
        setCaptureError(null)
        setCapturing(null)
      } catch (error) {
        setCaptureError(error instanceof Error ? error.message : 'Could not assign this key')
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [capturing, onAssignControl])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-menu-title"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 20,
        overflow: 'auto',
        padding: 20,
        background: 'rgba(1, 4, 16, 0.88)',
        color: '#dbeaff',
        font: '14px/1.5 ui-monospace, Consolas, monospace',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <div style={{ width: 'min(720px, 100%)', maxHeight: '100%', overflow: 'auto', padding: 24, background: 'rgba(8, 14, 32, 0.96)', border: '1px solid rgba(110,170,255,0.4)', borderRadius: 12 }}>
        <h1 id="pause-menu-title" style={{ marginTop: 0, letterSpacing: 4 }}>PAUSED</h1>
        <button type="button" onClick={onResume} style={{ ...buttonStyle, background: '#15243b', color: '#dbeaff' }}>RESUME</button>

        <section style={{ marginTop: 18 }}>
          <h2 style={{ fontSize: 16, color: '#7fd4ff' }}>DIFFICULTY</h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {DIFFICULTY_ORDER.map((id) => {
              const profile = DIFFICULTY_PROFILES[id]
              return (
              <button
                key={id}
                type="button"
                aria-pressed={difficulty === id}
                onClick={() => onDifficultyChange(id)}
                style={{ ...buttonStyle, color: '#dbeaff', background: difficulty === id ? '#263f65' : 'transparent' }}
              >
                <span style={{ display: 'block' }}>{profile.label}</span>
                <span style={{ display: 'block', fontSize: 10, fontWeight: 400 }}>
                  Meteor about every {profile.meteorGap.mean}s · prices ×{profile.priceMultiplier}
                </span>
              </button>
              )
            })}
          </div>
          <div style={{ opacity: 0.75, marginTop: 6 }}>Meteor frequency and purchase prices change with difficulty.</div>
        </section>

        <section style={{ marginTop: 18 }}>
          <h2 style={{ fontSize: 16, color: '#7fd4ff' }}>MOUSE</h2>
          <label style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            Sensitivity: {preferences.mouseSensitivity.toFixed(2)}×
            <input
              aria-label="Mouse sensitivity"
              type="range"
              min="0.25"
              max="2"
              step="0.05"
              value={preferences.mouseSensitivity}
              onChange={(event) => onSensitivityChange(Number(event.currentTarget.value))}
            />
          </label>
        </section>

        <section style={{ marginTop: 18 }}>
          <h2 style={{ fontSize: 16, color: '#7fd4ff' }}>KEYBOARD</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px 12px' }}>
            {CONTROL_DEFINITIONS.map((control) => (
              <div key={control.id} style={{ display: 'contents' }}>
                <span>{control.label}</span>
                <button
                  type="button"
                  aria-label={`Rebind ${control.label}`}
                  onClick={() => {
                    setCaptureError(null)
                    setCapturing(control.id)
                  }}
                  style={{ ...buttonStyle, padding: '4px 10px', color: '#dbeaff', background: capturing === control.id ? '#263f65' : 'transparent' }}
                >
                  {capturing === control.id ? 'Press a key… (Esc cancels)' : controlLabel(getControlCode(control.id))}
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={onResetControls} style={{ ...buttonStyle, marginTop: 10, color: '#dbeaff' }}>RESTORE DEFAULT KEYS</button>
        </section>

        {(settingsError || captureError) && (
          <div role="alert" style={{ marginTop: 12, color: '#ff8d8d' }}>{captureError ?? settingsError}</div>
        )}
      </div>
    </div>
  )
}
