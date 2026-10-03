const STEPS = [
  {
    title: 'Build your ship',
    body: 'You begin docked at Haven Drydock. Choose a block and click an exposed ship face to queue construction. New blocks cost Haven Credits (HC).',
    hint: 'Shipyard controls: 1–6 select block types · Shift-click dismantles a connected block',
  },
  {
    title: 'Launch and explore',
    body: 'Undock when you are ready. Mouse steering or W/S controls flight. Hold F near Scrap or a Survey Beacon to draw it into your cargo hold.',
    hint: 'Cargo space is finite: when the hold is full, the beam stops collecting.',
  },
  {
    title: 'Trade and upgrade',
    body: 'Open Trade Relay from the HUD to sell Scrap and Survey Data for HC. Drydocks pay the full rate; relays pay 90%. Relics take space but are never sold.',
    hint: 'Buy one of three storage technologies in the trade panel to expand or compress your hold.',
  },
  {
    title: 'Find a new home',
    body: 'Fold to new sectors with J. Recover five Signal Relics to decode Earth 2.0, then make a safe landing to win. Survey Beacons are optional extra cargo.',
    hint: 'Pause at any time with Esc to review controls, difficulty, and settings.',
  },
]

export function TutorialOverlay({ step, onNext, onSkip }: { step: number; onNext: () => void; onSkip: () => void }) {
  const current = STEPS[step]

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-title"
      className="hud-tutorial"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 40,
        display: 'grid',
        placeItems: 'center',
        padding: 20,
        color: '#e8f6ff',
        fontFamily: 'system-ui, sans-serif',
        background: 'rgba(0, 3, 12, 0.76)',
        pointerEvents: 'auto',
      }}
    >
      <section style={{ width: 'min(520px, 100%)', padding: 24, border: '1px solid rgba(127,212,255,0.55)', borderRadius: 12, background: 'rgba(7,14,32,0.98)', boxSizing: 'border-box' }}>
        <div style={{ color: '#7fd4ff', fontSize: 11, letterSpacing: 3 }}>FLIGHT BRIEFING · {step + 1}/{STEPS.length}</div>
        <h2 id="tutorial-title" style={{ margin: '8px 0 12px', fontSize: 24 }}>{current.title}</h2>
        <p style={{ margin: 0, lineHeight: 1.55 }}>{current.body}</p>
        <p style={{ margin: '12px 0 22px', color: '#a8d8ff', fontSize: 13, lineHeight: 1.5 }}>{current.hint}</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <button type="button" onClick={onSkip} style={{ padding: '9px 12px', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, color: '#c8d5e6', background: 'transparent', cursor: 'pointer' }}>
            SKIP TUTORIAL
          </button>
          <button type="button" onClick={onNext} style={{ padding: '9px 16px', border: 0, borderRadius: 6, color: '#04111b', background: '#7fd4ff', fontWeight: 800, cursor: 'pointer' }}>
            {step === STEPS.length - 1 ? 'START VOYAGE' : 'NEXT'}
          </button>
        </div>
      </section>
    </div>
  )
}
