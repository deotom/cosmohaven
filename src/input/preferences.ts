export const CONTROL_DEFINITIONS = [
  { id: 'thrustForward', label: 'Thrust forward', code: 'KeyW', mode: 'pilot', flight: true },
  { id: 'thrustBackward', label: 'Thrust backward', code: 'KeyS', mode: 'pilot', flight: true },
  { id: 'yawLeft', label: 'Yaw left', code: 'KeyA', mode: 'pilot', flight: true },
  { id: 'yawRight', label: 'Yaw right', code: 'KeyD', mode: 'pilot', flight: true },
  { id: 'pitchDown', label: 'Pitch down', code: 'ArrowUp', mode: 'pilot', flight: true },
  { id: 'pitchUp', label: 'Pitch up', code: 'ArrowDown', mode: 'pilot', flight: true },
  { id: 'rollLeft', label: 'Roll left', code: 'KeyQ', mode: 'pilot', flight: true },
  { id: 'rollRight', label: 'Roll right', code: 'KeyE', mode: 'pilot', flight: true },
  { id: 'strafeUp', label: 'Strafe up', code: 'Space', mode: 'pilot', flight: true },
  { id: 'strafeDown', label: 'Strafe down', code: 'ShiftLeft', mode: 'pilot', flight: true },
  { id: 'harvest', label: 'Harvest', code: 'KeyF', mode: 'pilot', flight: true },
  { id: 'autopilot', label: 'Auto-pilot', code: 'KeyP', mode: 'pilot' },
  { id: 'waypoint', label: 'Next waypoint', code: 'KeyN', mode: 'all' },
  { id: 'targetCycle', label: 'Cycle target', code: 'KeyT', mode: 'pilot' },
  { id: 'arrivalOrbit', label: 'Enter orbit', code: 'KeyO', mode: 'pilot' },
  { id: 'arrivalLand', label: 'Start landing', code: 'KeyL', mode: 'pilot' },
  { id: 'fold', label: 'Space-Fold', code: 'KeyJ', mode: 'pilot' },
  { id: 'repair', label: 'Emergency repair', code: 'KeyR', mode: 'pilot' },
  { id: 'dock', label: 'Dock / undock', code: 'KeyE', mode: 'all' },
  { id: 'interior', label: 'Interior view', code: 'KeyV', mode: 'all' },
  { id: 'camera', label: 'Switch camera', code: 'KeyC', mode: 'pilot' },
  { id: 'upgradeHarvester', label: 'Upgrade harvester', code: 'KeyU', mode: 'all' },
  { id: 'upgradeAutopilot', label: 'Upgrade auto-pilot', code: 'KeyI', mode: 'all' },
  { id: 'selectHull', label: 'Select Hull', code: 'Digit1', mode: 'build' },
  { id: 'selectFood', label: 'Select Food Dispenser', code: 'Digit2', mode: 'build' },
  { id: 'selectArcade', label: 'Select Arcade', code: 'Digit3', mode: 'build' },
  { id: 'selectEngine', label: 'Select Engine Module', code: 'Digit4', mode: 'build' },
  { id: 'selectShield', label: 'Select Shield Generator', code: 'Digit5', mode: 'build' },
  { id: 'selectRepair', label: 'Select Repair Bay', code: 'Digit6', mode: 'build' },
  { id: 'cycleBlock', label: 'Cycle ship block', code: 'KeyQ', mode: 'build' },
] as const

export type ControlId = (typeof CONTROL_DEFINITIONS)[number]['id']
export type InputPreferences = {
  mouseSensitivity: number
  keyMap: Partial<Record<ControlId, string>>
}

export const DEFAULT_INPUT_PREFERENCES: InputPreferences = { mouseSensitivity: 1, keyMap: {} }

let preferences: InputPreferences = { ...DEFAULT_INPUT_PREFERENCES, keyMap: {} }

export function readInputPreferences(): InputPreferences {
  return { mouseSensitivity: preferences.mouseSensitivity, keyMap: { ...preferences.keyMap } }
}

export function restoreInputPreferences(value: unknown): InputPreferences {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid saved input preferences')
  const data = value as Record<string, unknown>
  if (typeof data.mouseSensitivity !== 'number' || !Number.isFinite(data.mouseSensitivity) || data.mouseSensitivity < 0.25 || data.mouseSensitivity > 2) {
    throw new Error('Saved mouse sensitivity is outside the supported range')
  }
  if (typeof data.keyMap !== 'object' || data.keyMap === null || Array.isArray(data.keyMap)) throw new Error('Invalid saved key bindings')

  const next: InputPreferences = { mouseSensitivity: data.mouseSensitivity, keyMap: {} }
  for (const [id, code] of Object.entries(data.keyMap)) {
    if (!CONTROL_DEFINITIONS.some((control) => control.id === id) || typeof code !== 'string' || !isBindableCode(code)) {
      throw new Error(`Invalid saved key binding for ${id}`)
    }
    next.keyMap[id as ControlId] = code
  }
  for (let index = 0; index < CONTROL_DEFINITIONS.length; index++) {
    const control = CONTROL_DEFINITIONS[index]
    const code = next.keyMap[control.id] ?? control.code
    for (const other of CONTROL_DEFINITIONS.slice(index + 1)) {
      const otherCode = next.keyMap[other.id] ?? other.code
      const sameMode = control.mode === 'all' || other.mode === 'all' || control.mode === other.mode
      if (sameMode && code === otherCode && (control.code !== code || other.code !== code)) {
        throw new Error(`${controlLabel(code)} is assigned to multiple controls`)
      }
    }
  }
  preferences = next
  return readInputPreferences()
}

export function setMouseSensitivity(value: number): InputPreferences {
  if (!Number.isFinite(value) || value < 0.25 || value > 2) throw new RangeError('Mouse sensitivity must be between 0.25 and 2')
  preferences.mouseSensitivity = value
  return readInputPreferences()
}

export function getMouseSensitivity() {
  return preferences.mouseSensitivity
}

export function getControlCode(id: ControlId): string {
  return preferences.keyMap[id] ?? CONTROL_DEFINITIONS.find((control) => control.id === id)!.code
}

export function controlLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code === 'ArrowUp') return '↑'
  if (code === 'ArrowDown') return '↓'
  if (code === 'ArrowLeft') return '←'
  if (code === 'ArrowRight') return '→'
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift'
  if (code === 'Space') return 'Space'
  return code
}

export function isBindableCode(code: string) {
  return /^Key[A-Z]$/.test(code) || /^Digit[0-9]$/.test(code) || /^Arrow(Up|Down|Left|Right)$/.test(code) || code === 'Space' || code === 'ShiftLeft' || code === 'ShiftRight'
}

export function assignControlCode(id: ControlId, code: string): InputPreferences {
  if (!isBindableCode(code)) throw new Error('Choose a letter, number, arrow, Space, or Shift key')
  const target = CONTROL_DEFINITIONS.find((control) => control.id === id)!
  const conflict = CONTROL_DEFINITIONS.find((control) => {
    if (control.id === id || getControlCode(control.id) !== code) return false
    if (control.mode !== 'all' && target.mode !== 'all' && control.mode !== target.mode) return false
    return control.code !== code || target.code !== code
  })
  if (conflict) throw new Error(`${controlLabel(code)} is already assigned to ${conflict.label}`)
  preferences.keyMap[id] = code
  return readInputPreferences()
}

export function resetInputPreferences(): InputPreferences {
  preferences = { ...DEFAULT_INPUT_PREFERENCES, keyMap: {} }
  return readInputPreferences()
}

export function resetKeyBindings(): InputPreferences {
  preferences.keyMap = {}
  return readInputPreferences()
}
