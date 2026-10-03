import { getDock } from '../game/dock'
import {
  getCargoCapacity,
  getCargoSaleValue,
  getCargoVolume,
  getStorageTechCost,
  purchaseStorageTech,
  readGameStats,
  sellCargo,
  STORAGE_TECHS,
  type StorageTechId,
} from '../game/gameState'
import { panelStyle } from './styles'
import { useSampled } from './useSampled'

export function TradePanel({ onClose }: { onClose: () => void }) {
  const game = useSampled(readGameStats)
  const atDrydock = getDock().phase === 'docked'
  const payout = getCargoSaleValue(atDrydock)

  return (
    <div
      role="dialog"
      aria-label="Cargo trading"
      className="hud-trade-panel"
      style={{
        ...panelStyle,
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(460px, calc(100vw - 32px))',
        maxHeight: '80vh',
        overflowY: 'auto',
        boxSizing: 'border-box',
        zIndex: 20,
        pointerEvents: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ fontWeight: 700, letterSpacing: 2, color: '#ffd58a' }}>{atDrydock ? 'DRYDOCK EXCHANGE' : 'TRADE RELAY'}</div>
        <div role="button" aria-label="Close trade panel" onClick={onClose} style={{ cursor: 'pointer', pointerEvents: 'auto', color: '#9fd4ff' }}>
          CLOSE
        </div>
      </div>
      <div style={{ marginTop: 8 }}>Wallet: {game.credits} HC</div>
      <div>
        Cargo hold: {getCargoVolume().toFixed(1)} / {getCargoCapacity()} units · {game.cargo.scrap} Scrap · {game.cargo.relics} Relics · {game.cargo.surveyData} Survey Data
      </div>
      <div style={{ marginTop: 6, opacity: 0.8 }}>
        Scrap: {atDrydock ? 20 : 18} HC/unit · Survey Data: {atDrydock ? 50 : 45} HC/unit
      </div>
      <div
        role="button"
        aria-disabled={payout === 0}
        onClick={() => payout > 0 && sellCargo(atDrydock)}
        style={{
          marginTop: 10,
          padding: '8px 10px',
          cursor: payout > 0 ? 'pointer' : 'default',
          pointerEvents: 'auto',
          color: payout > 0 ? '#021014' : '#8a98a8',
          background: payout > 0 ? '#4dffb8' : 'rgba(255,255,255,0.08)',
          borderRadius: 5,
          fontWeight: 700,
          textAlign: 'center',
        }}
      >
        SELL CARGO · {payout} HC
      </div>
      <div style={{ marginTop: 14, fontWeight: 700, color: '#8bdcff' }}>Cargo Technologies</div>
      <div style={{ fontSize: 11, opacity: 0.75 }}>Owned technologies can be switched freely; buying a new one replaces the active system.</div>
      {(Object.keys(STORAGE_TECHS) as StorageTechId[]).map((id) => {
        const technology = STORAGE_TECHS[id]
        const owned = game.ownedStorageTechs.includes(id)
        const active = game.storageTech === id
        const cost = getStorageTechCost(id)
        return (
          <div
            key={id}
            role="button"
            aria-label={`${technology.name}: ${technology.description}${active ? ', active' : ''}`}
            onClick={() => !active && purchaseStorageTech(id)}
            style={{
              marginTop: 7,
              padding: '7px 9px',
              border: `1px solid ${active ? '#4dffb8' : 'rgba(160,210,255,0.3)'}`,
              borderRadius: 5,
              cursor: active ? 'default' : 'pointer',
              pointerEvents: 'auto',
              opacity: !owned && game.credits < cost ? 0.55 : 1,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <strong>{technology.name}</strong>
              <span style={{ color: active ? '#4dffb8' : '#ffd633' }}>{active ? 'ACTIVE' : owned ? 'OWNED · SWITCH' : `${cost} HC`}</span>
            </div>
            <div style={{ fontSize: 11, opacity: 0.8 }}>{technology.description}</div>
          </div>
        )
      })}
    </div>
  )
}
