import type { CSSProperties } from 'react'
import type { SavedGame } from '../game/saveGame'

const button: CSSProperties = {
  width: '100%',
  padding: '12px 18px',
  border: '1px solid rgba(140,190,255,0.5)',
  borderRadius: 8,
  color: '#e8f6ff',
  background: 'rgba(44,72,120,0.55)',
  fontSize: 14,
  fontWeight: 800,
  letterSpacing: 2,
  cursor: 'pointer',
}

export function StartMenu({
  save,
  error,
  onContinue,
  onNewGame,
}: {
  save: SavedGame | null
  error: string | null
  onContinue: () => void
  onNewGame: () => void
}) {
  return (
    <main
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        color: '#dbeaff',
        fontFamily: 'system-ui, sans-serif',
        background: 'radial-gradient(ellipse at 30% 20%, #1b2350 0%, #070a1a 55%, #02030a 100%)',
      }}
    >
      <section style={{ width: 'min(420px, 100%)', padding: 30, border: '1px solid rgba(140,190,255,0.3)', borderRadius: 16, background: 'rgba(5,10,24,0.82)', boxSizing: 'border-box' }}>
        <div style={{ fontSize: 13, letterSpacing: 6, color: '#7fd4ff' }}>COSMOHAVEN</div>
        <h1 style={{ margin: '6px 0 22px', fontSize: 32 }}>Continue your voyage</h1>
        {save ? (
          <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.06)', fontSize: 13 }}>
            <strong>{save.profile.name}</strong> · {save.sector.name}
            <br />
            {save.game.credits} HC · {save.game.relics} Signal Relics · saved {new Date(save.savedAt).toLocaleString()}
          </div>
        ) : (
          <div style={{ marginBottom: 16, opacity: 0.75 }}>No valid autosave is available.</div>
        )}
        {error && (
          <div role="alert" style={{ marginBottom: 14, color: '#ff9696', fontSize: 12 }}>
            Save warning: {error}
          </div>
        )}
        <div style={{ display: 'grid', gap: 10 }}>
          <button type="button" disabled={!save} onClick={onContinue} style={{ ...button, opacity: save ? 1 : 0.45, cursor: save ? 'pointer' : 'not-allowed' }}>
            CONTINUE
          </button>
          <button type="button" onClick={onNewGame} style={{ ...button, background: 'rgba(36,90,80,0.55)' }}>
            NEW GAME
          </button>
        </div>
        {save && <div style={{ marginTop: 12, opacity: 0.65, fontSize: 11 }}>Starting a new game replaces this single save after crew registration.</div>}
      </section>
    </main>
  )
}
