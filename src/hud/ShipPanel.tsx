import { CONTRACT_LABELS, contractHave } from '../game/contracts'
import { getBlockCost, getCargoCapacity, getCargoVolume, RELICS_NEEDED, readGameStats } from '../game/gameState'
import { useSector } from '../game/sector'
import { shipState } from '../game/shipState'
import type { CameraView, GameMode, PlaceableBlockType } from '../game/types'
import { BLOCK_COLORS, BLOCK_LABELS, hudStyle } from './styles'
import { useSampled } from './useSampled'

type ShipPanelProps = {
  mode: GameMode
  cameraView: CameraView
  interior: boolean
  mouseLocked: boolean
  selectedType: PlaceableBlockType
  blockCount: number
}

const readSpeed = () => Math.round(shipState.velocity.length())

/**
 * The always-on ship readout. It shows only what is needed at a glance; everything else is contextual (it appears
 * when it applies) or lives in the help overlay ([?]) so the view of the scene stays clear.
 */
export function ShipPanel({ mode, cameraView, interior, mouseLocked, selectedType, blockCount }: ShipPanelProps) {
  const game = useSampled(readGameStats)
  const speed = useSampled(readSpeed, 250)
  const sector = useSector()
  const cost = getBlockCost(selectedType)
  const notice = game.notice
  const held = [
    game.cargo.scrap > 0 && `${game.cargo.scrap} Scrap`,
    game.cargo.relics > 0 && `${game.cargo.relics} Relics`,
    game.cargo.surveyData > 0 && `${game.cargo.surveyData} Data`,
  ].filter(Boolean)
  const hullColor = game.hull < 35 ? '#ff5d5d' : game.hull < 70 ? '#ffc94d' : '#4dffb8'

  return (
    <div className="hud-ship-panel" style={hudStyle}>
      <div style={{ fontWeight: 700, letterSpacing: 2, color: mode === 'pilot' ? '#ffcc33' : '#7fd4ff' }}>
        {mode === 'pilot' ? `IN FLIGHT · ${speed} u/s` : 'DOCKED · SHIPYARD'}
      </div>
      <div>
        <span style={{ color: hullColor }}>Hull {Math.round(game.hull)}%</span> · <span style={{ color: '#ffd633' }}>{game.credits} HC</span>
      </div>
      <div style={{ color: getCargoVolume() >= getCargoCapacity() ? '#ff8a8a' : '#9fd4ff' }}>
        Cargo {getCargoVolume().toFixed(0)}/{getCargoCapacity()}
        {held.length > 0 && ` · ${held.join(' · ')}`}
      </div>
      <div style={{ color: '#d6a8ff' }}>{sector.name}</div>
      {game.contracts.active.map((contract) => (
        <div key={contract.id} style={{ color: contractHave(contract) >= contract.amount ? '#4dffb8' : '#ffd58a' }}>
          Contract {Math.min(contractHave(contract), contract.amount)}/{contract.amount} {CONTRACT_LABELS[contract.kind]} → {contract.reward} HC
        </div>
      ))}
      {game.sideEvent.status === 'available' && <div style={{ color: '#c88bff' }}>Optional: recover {game.sideEvent.name}</div>}
      {(game.relics > 0 || game.relicDistance !== null) && (
        <div style={{ color: '#5ff0ff' }}>
          Signal Relics {game.relics}/{RELICS_NEEDED}
          {game.relicDistance !== null && ` · beacon ${Math.round(game.relicDistance).toLocaleString()} u`}
        </div>
      )}
      {game.relics >= RELICS_NEEDED && Number.isFinite(game.distanceToEarth) === false && (
        <div style={{ color: '#9fd4ff', fontWeight: 700 }}>EARTH 2.0 DECODED: fold [J] to reach it</div>
      )}
      {Number.isFinite(game.distanceToEarth) && <div>Earth 2.0: {Math.round(game.distanceToEarth).toLocaleString()} u away</div>}
      {game.well && (
        <div style={{ color: '#7fe3ff', fontSize: 12 }}>
          <div style={{ fontWeight: 700 }}>GRAVITY WELL: {game.well.name}</div>
          <div style={{ opacity: 0.85 }}>
            Alt {Math.round(game.well.altitude).toLocaleString()} u · Orbit speed {Math.round(game.well.orbitSpeed)} u/s
          </div>
          {game.well.inAtmosphere && <div style={{ color: '#ffb36b', fontWeight: 700 }}>ATMOSPHERE: drag &amp; turbulence</div>}
        </div>
      )}
      {interior && <div style={{ opacity: 0.8 }}>Interior view · drag to look, scroll to zoom</div>}
      {mode === 'pilot' && !interior && cameraView === 'chase' && !mouseLocked && (
        <div style={{ color: '#ffcc33' }}>Click the scene to steer</div>
      )}
      {mode === 'build' && (
        <div>
          {blockCount} blocks · <span style={{ color: BLOCK_COLORS[selectedType] }}>{BLOCK_LABELS[selectedType]}</span> ·{' '}
          <span style={{ color: game.credits < cost ? '#ff5d5d' : '#ffd633' }}>{cost} HC</span>
        </div>
      )}
      {notice && (
        <div style={{ marginTop: 6, fontWeight: 700, color: notice.kind === 'warning' ? '#ff5d5d' : '#ffd633' }}>{notice.text}</div>
      )}
    </div>
  )
}
