import { useEffect, useState } from 'react'
import {
  CONTRACT_LABELS,
  MAX_ACTIVE_CONTRACTS,
  abandonContract,
  acceptContract,
  completeContract,
  contractHave,
  contractReady,
  currentBoard,
  type Contract,
} from '../game/contracts'
import { readGameStats } from '../game/gameState'
import { dockedStation } from '../game/services'
import { panelStyle } from './styles'
import { useSampled } from './useSampled'

const actionStyle = (enabled: boolean, color = '#4dffb8') => ({
  padding: '5px 10px',
  borderRadius: 5,
  fontWeight: 700,
  textAlign: 'center' as const,
  cursor: enabled ? 'pointer' : 'default',
  pointerEvents: 'auto' as const,
  color: enabled ? '#021014' : '#8a98a8',
  background: enabled ? color : 'rgba(255,255,255,0.08)',
})

const describe = (contract: Contract) => `${contract.amount} ${CONTRACT_LABELS[contract.kind]}`

/** The station's contracts board: take work, hand in cargo, drop a job. Offers come from the board's current round. */
export function ContractsPanel({ onClose }: { onClose: () => void }) {
  const game = useSampled(readGameStats)
  // Dropping a job cannot be undone by the player, so it takes a second press (and the prompt times out)
  const [confirmDrop, setConfirmDrop] = useState<string | null>(null)
  useEffect(() => {
    if (confirmDrop === null) return
    const timer = setTimeout(() => setConfirmDrop(null), 3000)
    return () => clearTimeout(timer)
  }, [confirmDrop])
  const station = dockedStation()
  const board = currentBoard()
  const full = game.contracts.active.length >= MAX_ACTIVE_CONTRACTS

  return (
    <div
      role="dialog"
      aria-label="Contracts board"
      className="hud-contracts-panel"
      style={{
        ...panelStyle,
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(480px, calc(100vw - 32px))',
        maxHeight: '80vh',
        overflowY: 'auto',
        boxSizing: 'border-box',
        zIndex: 20,
        pointerEvents: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ fontWeight: 700, letterSpacing: 2, color: '#ffd58a' }}>CONTRACTS · {station?.name ?? 'No station'}</div>
        <div role="button" aria-label="Close contracts board" onClick={onClose} style={{ cursor: 'pointer', pointerEvents: 'auto', color: '#9fd4ff' }}>
          CLOSE
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        Wallet: {game.credits} HC · Completed: {game.contracts.completed}
      </div>

      <div style={{ marginTop: 12, fontWeight: 700, color: '#8bdcff' }}>
        Your contracts ({game.contracts.active.length}/{MAX_ACTIVE_CONTRACTS})
      </div>
      {game.contracts.active.length === 0 && <div style={{ opacity: 0.7 }}>None yet. Take one from the board below.</div>}
      {game.contracts.active.map((contract) => {
        const ready = contractReady(contract)
        const confirming = confirmDrop === contract.id
        return (
          <div
            key={contract.id}
            style={{ marginTop: 7, padding: '7px 9px', border: `1px solid ${ready ? '#4dffb8' : 'rgba(160,210,255,0.3)'}`, borderRadius: 5 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <strong>Deliver {describe(contract)}</strong>
              <span style={{ color: '#ffd633' }}>{contract.reward} HC</span>
            </div>
            <div style={{ fontSize: 11, opacity: 0.8 }}>
              {contract.client} · hold: {Math.min(contractHave(contract), contract.amount)}/{contract.amount}
              {ready && <span style={{ color: '#4dffb8' }}> · ready to hand in</span>}
            </div>
            <div
              role="button"
              aria-disabled={!ready}
              onClick={() => ready && completeContract(contract.id)}
              style={{ ...actionStyle(ready), marginTop: 6 }}
            >
              {ready ? `HAND IN · +${contract.reward} HC` : 'NOT ENOUGH CARGO YET'}
            </div>
            <div
              role="button"
              onClick={() => {
                if (confirming) {
                  abandonContract(contract.id)
                  setConfirmDrop(null)
                } else setConfirmDrop(contract.id)
              }}
              style={{ marginTop: 8, fontSize: 11, textAlign: 'right', cursor: 'pointer', pointerEvents: 'auto', color: confirming ? '#ff9a9a' : '#8a98a8' }}
            >
              {confirming ? 'Press again to give up this contract' : 'give up'}
            </div>
          </div>
        )
      })}

      <div style={{ marginTop: 14, fontWeight: 700, color: '#8bdcff' }}>On the board</div>
      {board.length === 0 && <div style={{ opacity: 0.7 }}>Nothing left right now. Finish a job and new work will be posted.</div>}
      {board.map((contract) => (
        <div key={contract.id} style={{ marginTop: 7, padding: '7px 9px', border: '1px solid rgba(160,210,255,0.2)', borderRadius: 5 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <strong>Deliver {describe(contract)}</strong>
            <span style={{ color: '#ffd633' }}>{contract.reward} HC</span>
          </div>
          <div style={{ fontSize: 11, opacity: 0.8 }}>{contract.client}</div>
          <div role="button" aria-disabled={full} onClick={() => !full && acceptContract(contract.id)} style={{ ...actionStyle(!full), marginTop: 6 }}>
            {full ? 'CONTRACT LIMIT REACHED' : 'ACCEPT'}
          </div>
        </div>
      ))}
    </div>
  )
}
