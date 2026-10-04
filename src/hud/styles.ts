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
  boxSizing: 'border-box',
  maxHeight: 'calc(100vh - 32px)',
  overflow: 'hidden',
}

export const buttonStyle: CSSProperties = {
  ...hudStyle,
  position: 'static',
  pointerEvents: 'auto',
  cursor: 'pointer',
  fontWeight: 700,
  letterSpacing: 2,
  whiteSpace: 'nowrap',
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

export const BLOCK_LABELS: Record<PlaceableBlockType, string> = {
  hull: 'Hull',
  food: 'Food Dispenser',
  arcade: 'Arcade',
  engine: 'Engine Module',
  shield: 'Shield Generator',
  repair: 'Repair Bay',
}
export const BLOCK_DESCRIPTIONS: Record<PlaceableBlockType, string> = {
  hull: 'Structural room. Protects the ship and keeps it operational.',
  food: 'Crew use this dispenser to restore Hunger.',
  arcade: 'Crew use this room to restore Sanity.',
  engine: 'Each module adds 25% thrust, up to four modules.',
  shield: 'Each module reduces impact damage by 20%, up to three modules.',
  repair: 'Crew repair 5 hull per second here when hull is below 75%.',
}
export const BLOCK_COLORS: Record<PlaceableBlockType, string> = {
  hull: '#fff',
  food: '#4dffb8',
  arcade: '#f08cff',
  engine: '#ff9e48',
  shield: '#65d9ff',
  repair: '#ffe26b',
}
export const BLOCK_ORDER: PlaceableBlockType[] = ['hull', 'food', 'arcade', 'engine', 'shield', 'repair']
