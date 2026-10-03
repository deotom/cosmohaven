import { getBlockCost, getCargoCapacity, getCargoVolume, RELICS_NEEDED, readGameStats } from '../game/gameState'
import { useSector } from '../game/sector'
import type { CameraView, GameMode, PlaceableBlockType } from '../game/types'
import { BLOCK_COLORS, BLOCK_LABELS, hudStyle } from './styles'
import { useSampled } from './useSampled'
import { controlHints } from '../input/keymap'

type ShipPanelProps = {
  mode: GameMode
  cameraView: CameraView
  interior: boolean
  mouseLocked: boolean
  selectedType: PlaceableBlockType
  blockCount: number
}

export function ShipPanel({ mode, cameraView, interior, mouseLocked, selectedType, blockCount }: ShipPanelProps) {
  const game = useSampled(readGameStats)
  const sector = useSector()
  const cost = getBlockCost(selectedType)
  const notice = game.notice

  return (
    <div className="hud-ship-panel" style={hudStyle}>
      <div style={{ fontWeight: 700, letterSpacing: 2, color: '#7fd4ff' }}>COSMOHAVEN · SHIPYARD</div>
      <div>Blocks: {blockCount} · Mass: {blockCount} t</div>
      <div style={{ color: '#ffd633' }}>Credits: {game.credits} HC</div>
      <div style={{ color: getCargoVolume() >= getCargoCapacity() ? '#ff8a8a' : '#9fd4ff' }}>
        Cargo: {game.cargo.scrap} Scrap · {game.cargo.relics} Relics ({getCargoVolume().toFixed(1)}/{getCargoCapacity()} units)
      </div>
      <div style={{ color: '#d6a8ff' }}>Sector: {sector.name}</div>
      <div style={{ color: '#5ff0ff' }}>
        Signal Relics: {game.relics}/{RELICS_NEEDED}
        {game.relicDistance !== null && ` · beacon ${Math.round(game.relicDistance).toLocaleString()} u`}
      </div>
      {game.relics >= RELICS_NEEDED && Number.isFinite(game.distanceToEarth) === false && (
        <div style={{ color: '#9fd4ff', fontWeight: 700 }}>EARTH 2.0 DECODED: fold [J] to reach it</div>
      )}
      {Number.isFinite(game.distanceToEarth) && <div>Earth 2.0: {Math.round(game.distanceToEarth).toLocaleString()} u away</div>}
      {game.well && (
        <div style={{ color: '#7fe3ff', fontSize: 12 }}>
          <div style={{ fontWeight: 700 }}>GRAVITY WELL DETECTED: {game.well.name}</div>
          <div style={{ opacity: 0.85 }}>
            Alt {Math.round(game.well.altitude).toLocaleString()} u · Speed {Math.round(game.well.speed)} · Orbit speed{' '}
            {Math.round(game.well.orbitSpeed)} u/s
          </div>
          {game.well.inAtmosphere && <div style={{ color: '#ffb36b', fontWeight: 700 }}>ATMOSPHERE: drag &amp; turbulence</div>}
        </div>
      )}
      <div style={{ color: game.hull < 35 ? '#ff5d5d' : game.hull < 70 ? '#ffc94d' : '#4dffb8' }}>Hull Integrity: {Math.round(game.hull)}%</div>
      <div>
        Status: <span style={{ color: mode === 'pilot' ? '#ffcc33' : '#7fd4ff' }}>{mode === 'pilot' ? 'IN FLIGHT' : 'DOCKED · SHIPYARD'}</span>
      </div>
      {interior && (
        <div>
          Camera: <span style={{ color: '#ffb36b' }}>INTERIOR (crew)</span> · drag to look, scroll to zoom
        </div>
      )}
      {mode === 'pilot' && !interior && (
        <div>
          Camera: <span style={{ color: '#ffcc33' }}>{cameraView === 'chase' ? 'CHASE' : 'ORBIT'}</span> · Mouse:{' '}
          <span style={{ color: mouseLocked ? '#4dffb8' : '#ffcc33' }}>
            {mouseLocked ? 'STEERING' : cameraView === 'chase' ? 'CLICK TO CAPTURE' : 'OFF (ORBIT)'}
          </span>
        </div>
      )}
      {mode === 'build' && (
        <div>
          Build: <span style={{ color: BLOCK_COLORS[selectedType] }}>{BLOCK_LABELS[selectedType]}</span> ·{' '}
          <span style={{ color: game.credits < cost ? '#ff5d5d' : '#ffd633' }}>Cost: {cost} HC</span>
        </div>
      )}
      <div style={{ marginTop: 8, opacity: 0.8 }}>
        {controlHints(mode).map((hint) => (
          <div key={hint}>{hint}</div>
        ))}
        {mode === 'build' ? (
          <>
            Click a block face — queue a block (drones build it)
            <br />
            Shift+click a block — dismantle it (50% back)
            <br />
            Drag — orbit camera · Scroll — zoom
          </>
        ) : (
          <>
            Mouse — steer: left / right yaw, up / down pitch
            <br />
            (click to capture, Esc to release)
            <br />
            Ships can only be built at a drydock!
            <br />
            Find 5 Signal Relics to unlock Earth 2.0!
          </>
        )}
      </div>
      {notice && (
        <div
          style={{
            marginTop: 8,
            fontWeight: 700,
            color: notice.kind === 'warning' ? '#ff5d5d' : '#ffd633',
          }}
        >
          {notice.text}
        </div>
      )}
    </div>
  )
}
