import { useSyncExternalStore } from 'react'
import { setTask } from './autopilot'
import { getDock } from './dock'
import {
  canAddCargo,
  CELESTIAL_BODIES,
  gameStats,
  notify,
  requestArrival,
  setAutopilot,
  setTarget,
  type TargetKind,
  type TargetRef,
} from './gameState'
import { scrapRegistry } from './targets'

// ---------- The context menu's open/closed state, as a small external store ----------

export type MenuState = { open: boolean; x: number; y: number; target: TargetRef | null }

let menu: MenuState = { open: false, x: 0, y: 0, target: null }
const listeners = new Set<() => void>()

const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
export const getMenu = () => menu
export const useContextMenu = () => useSyncExternalStore(subscribe, getMenu)

export function openContextMenu(target: TargetRef, x: number, y: number) {
  menu = { open: true, x, y, target }
  emit()
}

export function closeContextMenu() {
  if (!menu.open) return
  menu = { ...menu, open: false }
  emit()
}

// ---------- What can be done to each kind of object ----------

export type MenuAction = { id: string; label: string }

const ACTIONS: Record<TargetKind, MenuAction[]> = {
  scrap: [
    { id: 'harvest-single', label: 'Harvest Single' },
    { id: 'harvest-sweep', label: 'Auto-Sweep Area' },
  ],
  relic: [
    { id: 'harvest-single', label: 'Harvest Single' },
    { id: 'harvest-sweep', label: 'Auto-Sweep Area' },
  ],
  planet: [
    { id: 'orbit', label: 'Enter Orbit' },
    { id: 'land', label: 'Initiate Landing' },
    { id: 'scan', label: 'Scan' },
  ],
  station: [{ id: 'dock', label: 'Dock at Shipyard' }],
  meteor: [{ id: 'evade', label: 'Lock Threat / Evasion' }],
}

export const actionsFor = (kind: TargetKind) => ACTIONS[kind]

const idOf = (target: TargetRef) => Number(target.key.split(':')[1])

function engage() {
  setAutopilot({ engaged: true, status: 'Engaging' })
}

/**
 * Carries out a context-menu action: locks the target and switches the auto-pilot into the matching task
 * (HARVEST, ORBIT, LAND, DOCK, or HOLD for a threat), aimed at that specific object.
 */
export function runAction(actionId: string, target: TargetRef) {
  closeContextMenu()
  setTarget(target)

  if (actionId === 'scan') {
    const body = CELESTIAL_BODIES.find((b) => b.name === target.name)
    if (body) {
      const surfaceGravity = body.gm / body.radius ** 2
      const orbitSpeed = Math.sqrt(body.gm / (body.radius + body.atmosphereHeight + 40))
      notify(
        `${body.name}: radius ${Math.round(body.radius)} u · surface gravity ${surfaceGravity.toFixed(1)} u/s² · low-orbit speed ${Math.round(orbitSpeed)} u/s · atmosphere ${Math.round(body.atmosphereHeight)} u deep`,
        'gain',
        7000,
      )
    }
    return
  }

  if (getDock().phase !== 'free') {
    notify('Undock first: the auto-pilot only flies a ship in open space', 'warning', 2500)
    return
  }

  const bodyIndex = CELESTIAL_BODIES.findIndex((b) => b.name === target.name)
  switch (actionId) {
    case 'harvest-single':
    case 'harvest-sweep': {
      const pickup = scrapRegistry.get(idOf(target))
      if (!pickup) {
        notify('That is already gone', 'warning')
        return
      }
      if (!canAddCargo(pickup.relic ? 'relics' : 'scrap')) {
        notify('Cargo hold full · sell cargo at a Trade Relay', 'warning', 2500)
        return
      }
      setTask('harvest', { sweep: actionId === 'harvest-sweep', harvestId: idOf(target) })
      engage()
      notify(
        actionId === 'harvest-sweep'
          ? 'Auto-pilot: sweeping the area for cargo'
          : 'Auto-pilot: harvesting that target',
        'gain',
        2500,
      )
      return
    }
    case 'orbit':
    case 'land': {
      const choice = actionId === 'orbit' ? 'orbit' : 'land'
      setTask(choice, { destination: Math.max(0, bodyIndex), intent: choice })
      engage()
      // Already inside this planet's sphere of influence? Start straight away; otherwise it flies there first
      if (gameStats.arrival.phase !== 'none' && gameStats.arrival.body === bodyIndex) {
        setAutopilot({ intent: 'choose' })
        requestArrival(choice)
      } else {
        notify(`Auto-pilot: flying to ${target.name} to ${choice === 'orbit' ? 'enter orbit' : 'land'}`, 'gain', 3000)
      }
      return
    }
    case 'dock':
      setTask('dock')
      engage()
      notify(`Auto-pilot: docking at ${target.name}`, 'gain', 2500)
      return
    case 'evade':
      setTask('hold')
      engage()
      notify('Threat locked: holding position and evading', 'gain', 2500)
  }
}
