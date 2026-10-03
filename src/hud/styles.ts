import type { CSSProperties } from 'react'
import type { PlaceableBlockType } from '../game/types'

export const hudStyle: CSSProperties = {
  position: 'absolute',
  top: 16,
  left: 16,
  padding: '12px 16px',
  color: '#cfe8ff',
  font: '13px/1.6 ui-monospace, Consolas, monospace',
  background: 'rgba(5, 10, 25, 0.6)',
  border: '1px solid rgba(80, 160, 255, 0.3)',
  borderRadius: 8,
  pointerEvents: 'none',
  userSelect: 'none',
}

export const buttonStyle: CSSProperties = {
  ...hudStyle,
  position: 'static',
  pointerEvents: 'auto',
  cursor: 'pointer',
  fontWeight: 700,
  letterSpacing: 2,
}

export const panelStyle: CSSProperties = { ...hudStyle, position: 'static', top: undefined, left: undefined, minWidth: 260 }

export const upgradeButtonStyle: CSSProperties = {
  marginTop: 4,
  padding: '3px 8px',
  border: '1px solid rgba(160,210,255,0.35)',
  borderRadius: 4,
  cursor: 'pointer',
  pointerEvents: 'auto',
}

export const BLOCK_LABELS: Record<PlaceableBlockType, string> = { hull: 'Hull', food: 'Food Dispenser', arcade: 'Arcade' }
export const BLOCK_COLORS: Record<PlaceableBlockType, string> = { hull: '#fff', food: '#4dffb8', arcade: '#f08cff' }
export const BLOCK_ORDER: PlaceableBlockType[] = ['hull', 'food', 'arcade']
