import { useDock } from '../game/dock'
import { getBlockCost, readGameStats } from '../game/gameState'
import { getSector } from '../game/sector'
import type { PlaceableBlockType } from '../game/types'
import { controlLabel, getControlCode, type ControlId } from '../input/preferences'
import { Bar } from './Bar'
import { BLOCK_COLORS, BLOCK_DESCRIPTIONS, BLOCK_LABELS, BLOCK_ORDER, hudStyle } from './styles'
import { useSampled } from './useSampled'

const BLOCK_CONTROLS: Record<PlaceableBlockType, ControlId> = {
  hull: 'selectHull',
  food: 'selectFood',
  arcade: 'selectArcade',
  engine: 'selectEngine',
  shield: 'selectShield',
  repair: 'selectRepair',
}

export function ShipyardPanel({ selectedType, onSelect }: { selectedType: PlaceableBlockType; onSelect: (type: PlaceableBlockType) => void }) {
  const game = useSampled(readGameStats)
  const dock = useDock()
  const station = getSector().stations[dock.stationId]

  return (
    <div className="hud-shipyard-panel" style={{ ...hudStyle, top: undefined, bottom: 90, width: 270 }}>
      <div style={{ fontWeight: 700, letterSpacing: 2, color: '#ffb347' }}>SHIPYARD ASSEMBLY</div>
      <div style={{ opacity: 0.75, fontSize: 12 }}>{station?.name ?? 'Drydock'} · bay 1</div>

      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {BLOCK_ORDER.map((type) => (
          <div
            key={type}
            role="button"
            aria-label={`${BLOCK_LABELS[type]}: ${BLOCK_DESCRIPTIONS[type]}`}
            title={BLOCK_DESCRIPTIONS[type]}
            onClick={() => onSelect(type)}
            style={{
              pointerEvents: 'auto',
              cursor: 'pointer',
              padding: '5px 10px',
              borderRadius: 6,
              display: 'flex',
              justifyContent: 'space-between',
              border: type === selectedType ? `1px solid ${BLOCK_COLORS[type]}` : '1px solid rgba(255,255,255,0.12)',
              background: type === selectedType ? 'rgba(255,255,255,0.1)' : 'transparent',
              color: BLOCK_COLORS[type],
            }}
          >
            <span>
              [{controlLabel(getControlCode(BLOCK_CONTROLS[type]))}] {BLOCK_LABELS[type]}
            </span>
            <span style={{ color: game.scrap < getBlockCost(type) ? '#ff5d5d' : '#ffd633' }}>{getBlockCost(type)}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 8 }}>
        Assembly queue: {game.construction.length === 0 ? <span style={{ opacity: 0.6 }}>idle</span> : game.construction.length}
      </div>
      {game.construction.slice(0, 4).map((item, i) => (
        <div key={i} style={{ marginTop: 3 }}>
          <div style={{ fontSize: 12, opacity: 0.85 }}>
            {i === 0 ? 'Building' : 'Queued'}: {BLOCK_LABELS[item.type]}
          </div>
          {i === 0 && <Bar label="" value={item.progress * 100} />}
        </div>
      ))}
    </div>
  )
}
