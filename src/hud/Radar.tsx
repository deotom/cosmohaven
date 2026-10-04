import { useEffect, useRef } from 'react'
import { HARVEST_SCAN_RANGE } from '../game/autopilot'
import { CELESTIAL_BODIES, gameStats, meteorTracks, type TargetKind } from '../game/gameState'
import { getSector } from '../game/sector'
import { shipState } from '../game/shipState'
import { scrapRegistry } from '../game/targets'
import { projectRadar, selectRadarContacts, type RadarContact } from './radarMath'

const DEFAULT_RANGE = HARVEST_SCAN_RANGE * 2 // 300 u: shows cargo before it enters harvest range.
const MAX_MARKERS = 128
// Gauge scale, not a physics limit: rounded above autopilot's 45 u/s approach cap.
const SPEED_SCALE = 50
const SIZE = 184
const CENTER = SIZE / 2
const RADIUS = 67

type Marker = RadarContact & { kind: TargetKind }
type MarkerStyle = { color: string; shape: 'circle' | 'square' | 'diamond' | 'triangle' | 'cross'; size: number }
// Add new kinds here when future systems supply them; the outer margins remain available for status arcs.
const MARKER_STYLES: Record<TargetKind, MarkerStyle> = {
  planet: { color: '#84afff', shape: 'circle', size: 4 },
  station: { color: '#4dffb8', shape: 'square', size: 4 },
  scrap: { color: '#ffd58a', shape: 'diamond', size: 2.5 },
  relic: { color: '#da91ff', shape: 'diamond', size: 4 },
  survey: { color: '#5ff0ff', shape: 'cross', size: 4 },
  meteor: { color: '#ff7979', shape: 'triangle', size: 3 },
}

function readMarkers(range: number): Marker[] {
  const markers: Marker[] = []
  const add = (key: string, kind: TargetKind, position: { x: number; y: number; z: number }) => {
    markers.push({ ...projectRadar(position, shipState.position, shipState.quaternion, range), key, kind,
      selected: gameStats.target?.key === key, priority: kind === 'planet' || kind === 'station' ? 2 : kind === 'meteor' ? 1 : 0 })
  }
  for (const body of CELESTIAL_BODIES) add(`planet:${body.name}`, 'planet', { x: body.position[0], y: body.position[1], z: body.position[2] })
  for (const station of getSector().stations) add(`station:${station.name}`, 'station', { x: station.position[0], y: station.position[1], z: station.position[2] })
  for (const [id, pickup] of scrapRegistry) add(`scrap:${id}`, pickup.kind, pickup.position)
  for (const [id, track] of meteorTracks) add(`meteor:${id}`, 'meteor', { x: track.position[0], y: track.position[1], z: track.position[2] })
  return selectRadarContacts(markers, MAX_MARKERS)
}

function drawMarker(ctx: CanvasRenderingContext2D, marker: Marker) {
  const style = MARKER_STYLES[marker.kind]
  const x = CENTER + marker.x * RADIUS
  const y = CENTER + marker.y * RADIUS
  const stem = -marker.height * 9
  const s = style.size
  ctx.strokeStyle = style.color
  ctx.fillStyle = style.color
  ctx.globalAlpha = marker.selected ? 1 : marker.clipped ? 0.6 : 0.9
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x, y + stem)
  ctx.stroke()
  ctx.save()
  ctx.translate(x, y + stem)
  ctx.beginPath()
  switch (style.shape) {
    case 'circle': ctx.arc(0, 0, s, 0, Math.PI * 2); break
    case 'square': ctx.rect(-s, -s, s * 2, s * 2); break
    case 'diamond': ctx.moveTo(0, -s); ctx.lineTo(s, 0); ctx.lineTo(0, s); ctx.lineTo(-s, 0); ctx.closePath(); break
    case 'triangle': ctx.moveTo(0, -s); ctx.lineTo(s, s); ctx.lineTo(-s, s); ctx.closePath(); break
    case 'cross': ctx.moveTo(-s, 0); ctx.lineTo(s, 0); ctx.moveTo(0, -s); ctx.lineTo(0, s); break
  }
  ctx.stroke()
  if (marker.selected) {
    ctx.globalAlpha = 1
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(0, 0, s + 4, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
}

function drawRadar(canvas: HTMLCanvasElement, range: number) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const pixels = Math.round(SIZE * dpr)
  if (canvas.width !== pixels) {
    canvas.width = pixels
    canvas.height = pixels
  }
  ctx.setTransform(pixels / SIZE, 0, 0, pixels / SIZE, 0, 0)
  ctx.clearRect(0, 0, SIZE, SIZE)
  ctx.globalAlpha = 1
  ctx.fillStyle = 'rgba(5, 14, 30, 0.64)'
  ctx.beginPath()
  ctx.arc(CENTER, CENTER, RADIUS, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(127, 212, 255, 0.3)'
  ctx.lineWidth = 1
  for (const radius of [RADIUS / 3, RADIUS * 2 / 3, RADIUS]) {
    ctx.beginPath()
    ctx.arc(CENTER, CENTER, radius, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.moveTo(CENTER - RADIUS, CENTER)
  ctx.lineTo(CENTER + RADIUS, CENTER)
  ctx.moveTo(CENTER, CENTER - RADIUS)
  ctx.lineTo(CENTER, CENTER + RADIUS)
  ctx.stroke()
  // Selected marker is drawn last so dense cargo cannot cover it.
  const markers = readMarkers(range)
  for (const marker of markers) if (!marker.selected) drawMarker(ctx, marker)
  for (const marker of markers) if (marker.selected) drawMarker(ctx, marker)
  ctx.globalAlpha = 1
  ctx.fillStyle = '#e1f5ff'
  ctx.beginPath()
  ctx.moveTo(CENTER, CENTER - 6)
  ctx.lineTo(CENTER + 4, CENTER + 4)
  ctx.lineTo(CENTER, CENTER + 2)
  ctx.lineTo(CENTER - 4, CENTER + 4)
  ctx.closePath()
  ctx.fill()
  const speed = shipState.velocity.length()
  const start = Math.PI * 0.8
  const sweep = Math.PI * 1.4
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.strokeStyle = 'rgba(127, 212, 255, 0.18)'
  ctx.beginPath()
  ctx.arc(CENTER, CENTER, RADIUS + 11, start, start + sweep)
  ctx.stroke()
  ctx.strokeStyle = speed > SPEED_SCALE ? '#ffc94d' : '#7fd4ff'
  ctx.beginPath()
  ctx.arc(CENTER, CENTER, RADIUS + 11, start, start + sweep * Math.min(1, speed / SPEED_SCALE))
  ctx.stroke()
  ctx.font = '12px ui-monospace, Consolas, monospace'
  ctx.textAlign = 'center'
  ctx.fillText(`${Math.round(speed)} u/s`, CENTER, SIZE - 5)
}

export function Radar({ range = DEFAULT_RANGE }: { range?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const element = canvas.current
    if (!element) return
    drawRadar(element, range)
    const interval = window.setInterval(() => drawRadar(element, range), 100)
    return () => window.clearInterval(interval)
  }, [range])

  return <canvas ref={canvas} className="hud-radar" role="img" aria-label="Ship-relative radar and speed in units per second" style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', width: SIZE, height: SIZE, pointerEvents: 'none' }} />
}
