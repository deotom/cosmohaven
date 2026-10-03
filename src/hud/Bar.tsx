export function Bar({ label, value }: { label: string; value: number }) {
  const color = value < 25 ? '#ff5d5d' : value < 50 ? '#ffc94d' : '#4dffb8'
  return (
    <div style={{ marginTop: 4 }}>
      {label} <span style={{ float: 'right' }}>{Math.round(value)}</span>
      <div style={{ height: 6, background: 'rgba(255,255,255,0.12)', borderRadius: 3 }}>
        <div style={{ width: `${value}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
    </div>
  )
}

/** Samples a per-frame mutable object a few times a second so React doesn't re-render at 60fps. */
