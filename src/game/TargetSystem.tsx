import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type CSSProperties, type RefObject } from 'react'
import * as THREE from 'three'
import { gameStats, setTarget } from './gameState'
import { shipState } from './shipState'
import { actionsFor, runAction, useContextMenu } from './targetActions'
import { cycleTarget, shipPositionRef, targetScreen } from './targetScreen'
import { createTargetState, kindLabel, resolveTarget } from './targets'

const projected = new THREE.Vector3()
const relative = new THREE.Vector3()

/**
 * Projects the locked target to screen coordinates each frame and works out its telemetry. Lives inside the
 * Canvas because it needs the camera; it renders nothing.
 */
export function TargetTracker({ shipPosition }: { shipPosition: RefObject<THREE.Vector3> }) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const state = useMemo(() => createTargetState(), [])

  useFrame(() => {
    shipPositionRef.current.copy(shipPosition.current)
    const ref = gameStats.target
    if (!ref || !resolveTarget(ref, state)) {
      if (ref) setTarget(null) // it's gone: collected, expired, or left behind by a fold
      targetScreen.active = false
      return
    }

    relative.copy(state.position).sub(shipPosition.current)
    const distance = relative.length()
    // Closing speed: how fast the gap is shrinking (negative when moving apart)
    const closing = -(relative.clone().normalize().dot(state.velocity.clone().sub(shipState.velocity)))
    const relativeSpeed = state.velocity.clone().sub(shipState.velocity).length()

    projected.copy(state.position).project(camera)
    const behind = projected.z > 1
    let x = (projected.x * 0.5 + 0.5) * size.width
    let y = (-projected.y * 0.5 + 0.5) * size.height
    if (behind) {
      x = size.width - x
      y = size.height - y
    }
    const margin = 60
    const offscreen = behind || x < margin || x > size.width - margin || y < margin || y > size.height - margin

    targetScreen.active = true
    targetScreen.x = THREE.MathUtils.clamp(x, margin, size.width - margin)
    targetScreen.y = THREE.MathUtils.clamp(y, margin, size.height - margin)
    targetScreen.offscreen = offscreen
    targetScreen.name = ref.name
    targetScreen.kind = kindLabel[ref.kind]
    targetScreen.distance = distance
    targetScreen.relativeSpeed = relativeSpeed
    targetScreen.eta = closing > 0.5 ? distance / closing : Infinity
  })

  // Middle-click cycles targets
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 1) return
      e.preventDefault()
      cycleTarget()
    }
    window.addEventListener('mousedown', onMouseDown)
    return () => window.removeEventListener('mousedown', onMouseDown)
  }, [])

  return null
}

const formatEta = (seconds: number) => (Number.isFinite(seconds) ? (seconds < 600 ? `${seconds.toFixed(0)} s` : `${(seconds / 60).toFixed(1)} min`) : '—')

/** The tracking bracket and live telemetry, drawn over the canvas. Positions are updated directly on the DOM, not through React. */
export function TargetReticle() {
  const box = useRef<HTMLDivElement>(null)
  const label = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let frame = 0
    const update = () => {
      const el = box.current
      const text = label.current
      if (el && text) {
        el.style.display = targetScreen.active ? 'block' : 'none'
        if (targetScreen.active) {
          el.style.transform = `translate(${targetScreen.x}px, ${targetScreen.y}px)`
          el.style.opacity = targetScreen.offscreen ? '0.65' : '1'
          const actions = gameStats.target ? actionsFor(gameStats.target.kind) : []
          text.textContent =
            `${targetScreen.kind}: ${targetScreen.name}\n` +
            `Dist ${Math.round(targetScreen.distance).toLocaleString()} u · Rel ${targetScreen.relativeSpeed.toFixed(1)} u/s · ETA ${formatEta(targetScreen.eta)}\n` +
            actions.map((a, i) => `[${i + 1}] ${a.label}`).join('  ') +
            (targetScreen.offscreen ? '\n(off screen)' : '')
        }
      }
      frame = requestAnimationFrame(update)
    }
    frame = requestAnimationFrame(update)
    return () => cancelAnimationFrame(frame)
  }, [])

  const corner = (rotate: number): CSSProperties => ({
    position: 'absolute',
    width: 14,
    height: 14,
    borderTop: '2px solid #ff6a4d',
    borderLeft: '2px solid #ff6a4d',
    transform: `rotate(${rotate}deg)`,
    filter: 'drop-shadow(0 0 4px #ff6a4d)',
  })

  return (
    <div ref={box} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', display: 'none' }}>
      <div style={{ position: 'absolute', left: -30, top: -30, width: 60, height: 60 }}>
        <div style={{ ...corner(0), left: 0, top: 0 }} />
        <div style={{ ...corner(90), right: 0, top: 0 }} />
        <div style={{ ...corner(270), left: 0, bottom: 0 }} />
        <div style={{ ...corner(180), right: 0, bottom: 0 }} />
      </div>
      <div
        ref={label}
        style={{
          position: 'absolute',
          left: 40,
          top: -28,
          whiteSpace: 'pre',
          font: '12px/1.45 ui-monospace, Consolas, monospace',
          color: '#ffb8a8',
          background: 'rgba(30, 8, 8, 0.65)',
          border: '1px solid rgba(255,106,77,0.5)',
          borderRadius: 6,
          padding: '4px 8px',
        }}
      />
    </div>
  )
}

/** The tactical menu that opens beside a clicked object, one button per contextual auto-pilot action. */
export function ContextMenu() {
  const menu = useContextMenu()
  if (!menu.open || !menu.target) return null
  const actions = actionsFor(menu.target.kind)
  const radius = 78
  const spread = Math.min(Math.PI * 1.1, 0.9 * actions.length)
  const start = -Math.PI / 2 - spread / 2 + (actions.length === 1 ? spread / 2 : 0)

  return (
    <div style={{ position: 'absolute', left: menu.x, top: menu.y, width: 0, height: 0 }}>
      <div
        style={{
          position: 'absolute',
          left: -radius - 20,
          top: -radius - 20,
          width: (radius + 20) * 2,
          height: (radius + 20) * 2,
          borderRadius: '50%',
          border: '1px solid rgba(80,200,255,0.35)',
          boxShadow: '0 0 30px rgba(60,160,255,0.18) inset',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: -60,
          top: -12,
          width: 120,
          textAlign: 'center',
          font: '11px ui-monospace, Consolas, monospace',
          color: '#7fe3ff',
          letterSpacing: 1,
          pointerEvents: 'none',
        }}
      >
        {kindLabel[menu.target.kind]}
        <div style={{ color: '#fff', fontWeight: 700 }}>{menu.target.name}</div>
      </div>
      {actions.map((action, i) => {
        const angle = actions.length === 1 ? -Math.PI / 2 : start + (spread / (actions.length - 1)) * i
        return (
          <div
            key={action.id}
            role="button"
            onClick={() => menu.target && runAction(action.id, menu.target)}
            style={{
              position: 'absolute',
              left: Math.cos(angle) * radius - 62,
              top: Math.sin(angle) * radius - 15,
              width: 124,
              padding: '6px 4px',
              textAlign: 'center',
              cursor: 'pointer',
              font: '12px/1.2 ui-monospace, Consolas, monospace',
              color: '#dff6ff',
              background: 'rgba(8, 20, 40, 0.88)',
              border: '1px solid rgba(80,200,255,0.65)',
              borderRadius: 16,
              boxShadow: '0 0 14px rgba(60,170,255,0.3)',
              pointerEvents: 'auto',
            }}
          >
            [{i + 1}] {action.label}
          </div>
        )
      })}
    </div>
  )
}

