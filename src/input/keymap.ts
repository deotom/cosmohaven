import type { Dispatch, SetStateAction } from 'react'
import { nextTask, nextWaypoint, toggleAutopilot } from '../game/autopilot'
import { requestDockToggle } from '../game/dock'
import { FOLD_COST, REPAIR_COST, emergencyRepair, gameStats, notify, requestArrival } from '../game/gameState'
import { requestFold } from '../game/fold'
import { upgrade } from '../game/upgrades'
import { actionsFor, closeContextMenu, runAction } from '../game/targetActions'
import { cycleTarget } from '../game/targetScreen'
import type { CameraView, GameMode, PlaceableBlockType } from '../game/types'
import { BLOCK_ORDER } from '../hud/styles'
import { controlLabel, getControlCode, type ControlId } from './preferences'

type BindingMode = GameMode | 'all'
type KeyAction =
  | 'message'
  | 'dock'
  | 'interior'
  | 'upgradeHarvester'
  | 'upgradeAutopilot'
  | 'waypoint'
  | 'camera'
  | 'autopilot'
  | 'taskCycle'
  | 'targetCycle'
  | 'arrivalOrbit'
  | 'arrivalLand'
  | 'closeMenu'
  | 'targetAction'
  | 'fold'
  | 'repair'
  | 'selectHull'
  | 'selectFood'
  | 'selectArcade'
  | 'cycleBlock'
  | 'flight'

type Binding = {
  code: string
  key: string
  mode: BindingMode
  action: KeyAction
  hint?: string
  shift?: boolean
  flight?: boolean
  unavailableAfterVictory?: boolean
  control?: ControlId
}

export const KEY_BINDINGS: readonly Binding[] = [
  { code: 'KeyM', key: 'M', mode: 'all', action: 'message', hint: 'Ships can only be modified at a drydock' },
  { code: 'KeyE', key: 'E', mode: 'all', action: 'dock', hint: 'Dock / undock', control: 'dock' },
  { code: 'KeyV', key: 'V', mode: 'all', action: 'interior', hint: 'Toggle interior view', control: 'interior' },
  { code: 'KeyU', key: 'U', mode: 'all', action: 'upgradeHarvester', hint: 'Upgrade Harvester', control: 'upgradeHarvester' },
  { code: 'KeyI', key: 'I', mode: 'all', action: 'upgradeAutopilot', hint: 'Upgrade Auto-Pilot', control: 'upgradeAutopilot' },
  { code: 'KeyN', key: 'N', mode: 'all', action: 'waypoint', hint: 'Next waypoint', control: 'waypoint' },
  { code: 'KeyC', key: 'C', mode: 'pilot', action: 'camera', hint: 'Switch chase / orbit camera', control: 'camera' },
  { code: 'KeyF', key: 'F', mode: 'pilot', action: 'flight', hint: 'Hold to harvest Scrap', flight: true, control: 'harvest' },
  { code: 'KeyP', key: 'P', mode: 'pilot', action: 'autopilot', hint: 'Toggle Auto-Pilot', shift: false, unavailableAfterVictory: true, control: 'autopilot' },
  { code: 'KeyP', key: 'Shift+P', mode: 'pilot', action: 'taskCycle', hint: 'Cycle Auto-Pilot task', shift: true, unavailableAfterVictory: true, control: 'autopilot' },
  { code: 'KeyT', key: 'T', mode: 'pilot', action: 'targetCycle', hint: 'Cycle target', control: 'targetCycle' },
  { code: 'KeyO', key: 'O', mode: 'pilot', action: 'arrivalOrbit', hint: 'Enter orbit', control: 'arrivalOrbit' },
  { code: 'KeyL', key: 'L', mode: 'pilot', action: 'arrivalLand', hint: 'Initiate landing', control: 'arrivalLand' },
  { code: 'Escape', key: 'Esc', mode: 'pilot', action: 'closeMenu' },
  { code: 'Digit1-4', key: '1–4', mode: 'pilot', action: 'targetAction', hint: 'Run locked-target action' },
  { code: 'KeyJ', key: 'J', mode: 'pilot', action: 'fold', hint: `Space-Fold (${FOLD_COST} Scrap)`, unavailableAfterVictory: true, control: 'fold' },
  { code: 'KeyR', key: 'R', mode: 'pilot', action: 'repair', hint: `Emergency repair (${REPAIR_COST} Scrap)`, unavailableAfterVictory: true, control: 'repair' },
  { code: 'Digit1', key: '1', mode: 'build', action: 'selectHull', hint: 'Select Hull', control: 'selectHull' },
  { code: 'Digit2', key: '2', mode: 'build', action: 'selectFood', hint: 'Select Food Dispenser', control: 'selectFood' },
  { code: 'Digit3', key: '3', mode: 'build', action: 'selectArcade', hint: 'Select Arcade', control: 'selectArcade' },
  { code: 'KeyQ', key: 'Q', mode: 'build', action: 'cycleBlock', hint: 'Cycle block selection', control: 'cycleBlock' },
  { code: 'KeyW', key: 'W', mode: 'pilot', action: 'flight', hint: 'Thrust forward', flight: true, control: 'thrustForward' },
  { code: 'KeyS', key: 'S', mode: 'pilot', action: 'flight', hint: 'Thrust backward', flight: true, control: 'thrustBackward' },
  { code: 'KeyA', key: 'A', mode: 'pilot', action: 'flight', hint: 'Yaw left', flight: true, control: 'yawLeft' },
  { code: 'KeyD', key: 'D', mode: 'pilot', action: 'flight', hint: 'Yaw right', flight: true, control: 'yawRight' },
  { code: 'ArrowUp', key: '↑', mode: 'pilot', action: 'flight', hint: 'Pitch nose down', flight: true, control: 'pitchDown' },
  { code: 'ArrowDown', key: '↓', mode: 'pilot', action: 'flight', hint: 'Pitch nose up', flight: true, control: 'pitchUp' },
  { code: 'ArrowLeft', key: '←', mode: 'pilot', action: 'flight', flight: true },
  { code: 'ArrowRight', key: '→', mode: 'pilot', action: 'flight', flight: true },
  { code: 'KeyQ', key: 'Q', mode: 'pilot', action: 'flight', hint: 'Roll left', flight: true, control: 'rollLeft' },
  { code: 'KeyE', key: 'E', mode: 'pilot', action: 'flight', hint: 'Roll right', flight: true, control: 'rollRight' },
  { code: 'Space', key: 'Space', mode: 'pilot', action: 'flight', hint: 'Strafe up / landing throttle up', flight: true, control: 'strafeUp' },
  { code: 'ShiftLeft', key: 'Shift', mode: 'pilot', action: 'flight', hint: 'Strafe down / landing throttle down', flight: true, control: 'strafeDown' },
  { code: 'ShiftRight', key: 'Shift', mode: 'pilot', action: 'flight', flight: true, control: 'strafeDown' },
]

const bindingCode = (binding: Binding) =>
  binding.control && !(binding.control === 'strafeDown' && binding.code === 'ShiftRight')
    ? getControlCode(binding.control)
    : binding.code
const bindingLabel = (binding: Binding) => (binding.control ? controlLabel(bindingCode(binding)) : binding.key)

export const controlHints = (mode: GameMode) =>
  KEY_BINDINGS.filter((binding) => (binding.mode === 'all' || binding.mode === mode) && binding.hint).map(
    (binding) => `${binding.shift ? `Shift+${bindingLabel(binding)}` : bindingLabel(binding)} — ${binding.hint}`,
  )

type KeymapContext = {
  started: boolean
  mode: GameMode
  victory: boolean
  setInterior: Dispatch<SetStateAction<boolean>>
  setCameraView: Dispatch<SetStateAction<CameraView>>
  setSelectedType: Dispatch<SetStateAction<PlaceableBlockType>>
}

export function handleGameKey(event: KeyboardEvent, context: KeymapContext) {
  if (event.repeat || !context.started || (event.target as HTMLElement | null)?.tagName === 'INPUT') return

  const binding = KEY_BINDINGS.find(
    (item) =>
      (bindingCode(item) === event.code || (item.code === 'Digit1-4' && /^Digit[1-4]$/.test(event.code))) &&
      (item.mode === 'all' || item.mode === context.mode) &&
      (item.shift === undefined || item.shift === event.shiftKey),
  )
  if (!binding || (binding.unavailableAfterVictory && context.victory)) return

  switch (binding.action) {
    case 'message':
      notify('Ships can only be modified while docked at a drydock', 'warning', 3000)
      break
    case 'dock':
      requestDockToggle()
      break
    case 'interior':
      context.setInterior((interior) => !interior)
      break
    case 'upgradeHarvester':
      upgrade('harvester')
      break
    case 'upgradeAutopilot':
      upgrade('autopilot')
      break
    case 'waypoint':
      nextWaypoint()
      break
    case 'camera':
      context.setCameraView((view) => (view === 'chase' ? 'orbit' : 'chase'))
      break
    case 'autopilot':
      toggleAutopilot()
      break
    case 'taskCycle':
      nextTask()
      break
    case 'targetCycle':
      cycleTarget()
      break
    case 'arrivalOrbit':
      requestArrival('orbit')
      break
    case 'arrivalLand':
      requestArrival('land')
      break
    case 'closeMenu':
      closeContextMenu()
      break
    case 'targetAction': {
      const target = gameStats.target
      const action = target ? actionsFor(target.kind)[Number(event.code.slice(-1)) - 1] : undefined
      if (target && action) runAction(action.id, target)
      break
    }
    case 'fold':
      requestFold()
      break
    case 'repair':
      emergencyRepair()
      break
    case 'selectHull':
      context.setSelectedType('hull')
      break
    case 'selectFood':
      context.setSelectedType('food')
      break
    case 'selectArcade':
      context.setSelectedType('arcade')
      break
    case 'cycleBlock':
      context.setSelectedType((selected) => BLOCK_ORDER[(BLOCK_ORDER.indexOf(selected) + 1) % BLOCK_ORDER.length])
      break
    case 'flight':
      break
  }
}

export const flightKeyCodes = () => new Set(KEY_BINDINGS.filter((binding) => binding.flight).map(bindingCode))
