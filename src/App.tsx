import { Canvas } from '@react-three/fiber'
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { CrewRegistration } from './CrewRegistration'
import { setCrewProfile } from './game/crewProfile'
import { useDock } from './game/dock'
import { closeContextMenu } from './game/targetActions'
import { ContextMenu, TargetReticle } from './game/TargetSystem'
import { gameStats } from './game/gameState'
import { usePointerLock } from './game/usePointerLock'
import type { CameraView, GameMode, PlaceableBlockType } from './game/types'
import { handleGameKey } from './input/keymap'
import { ArrivalPanel } from './hud/ArrivalPanel'
import { buttonStyle } from './hud/styles'
import { useSampled } from './hud/useSampled'
import { ShipPanel } from './hud/ShipPanel'
import { CrewPanel, SystemsPanel } from './hud/SystemsPanel'
import { DockButton, DockPrompt } from './hud/Warnings'
import { ShipyardPanel } from './hud/ShipyardPanel'
import { PauseMenu } from './hud/PauseMenu'
import {
  assignControlCode,
  readInputPreferences,
  resetKeyBindings,
  restoreInputPreferences,
  setMouseSensitivity,
  type ControlId,
  type InputPreferences,
} from './input/preferences'

const Scene = lazy(() => import('./scene/Scene'))
const INPUT_PREFERENCES_KEY = 'cosmohaven.input-preferences.v1'

function loadInputPreferences(): { preferences: InputPreferences; error: string | null } {
  try {
    const raw = window.localStorage.getItem(INPUT_PREFERENCES_KEY)
    return { preferences: raw ? restoreInputPreferences(JSON.parse(raw)) : readInputPreferences(), error: null }
  } catch (error) {
    console.error('Failed to load saved input preferences', error)
    return {
      preferences: readInputPreferences(),
      error: error instanceof Error ? error.message : 'Failed to load saved input preferences',
    }
  }
}

const readFold = () => ({ ...gameStats.fold })

/** A violet-white flash that builds while the fold drive charges and fades out on arrival. */
function FoldOverlay() {
  const fold = useSampled(readFold, 50)
  const opacity = fold.phase === 'charging' ? fold.charge ** 2 * 0.92 : fold.phase === 'arriving' ? 1 - fold.charge : 0

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        opacity,
        transition: 'opacity 0.1s linear',
        background:
          'radial-gradient(circle at center, rgba(255,255,255,0.95) 0%, rgba(190,150,255,0.85) 35%, rgba(60,20,130,0.92) 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 'clamp(20px, 4vw, 48px)',
        fontWeight: 800,
        letterSpacing: 6,
        textShadow: '0 0 24px #8a5cff',
      }}
    >
      {fold.phase === 'charging' && `SPACE-FOLD ${Math.round(fold.charge * 100)}%`}
    </div>
  )
}

function VictoryOverlay() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        padding: 24,
        textAlign: 'center',
        background: 'radial-gradient(circle, rgba(2,10,30,0.55) 0%, rgba(0,0,0,0.92) 100%)',
        animation: 'fade-in 2.5s ease-out both',
        color: '#e8f6ff',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div
        style={{
          fontSize: 'clamp(32px, 6vw, 84px)',
          fontWeight: 800,
          lineHeight: 1.1,
          textShadow: '0 0 30px #3a8dff, 0 0 80px #3fd07a',
          animation: 'fade-in 2s ease-out 1.2s both',
        }}
      >
        Victory: Colony Established on Earth 2.0!
      </div>
      <div style={{ fontSize: 'clamp(14px, 2vw, 22px)', opacity: 0.85, animation: 'fade-in 2s ease-out 2.2s both' }}>
        The crew of the CosmoHaven has found a new home.
      </div>
      <div
        role="button"
        onClick={() => window.location.reload()}
        style={{
          padding: '12px 28px',
          border: '1px solid rgba(160,210,255,0.6)',
          borderRadius: 8,
          cursor: 'pointer',
          letterSpacing: 2,
          fontWeight: 700,
          animation: 'fade-in 2s ease-out 3s both',
        }}
      >
        PLAY AGAIN
      </div>
    </div>
  )
}

export default function App() {
  const [blockCount, setBlockCount] = useState(1)
  const [selectedType, setSelectedType] = useState<PlaceableBlockType>('hull')
  const [started, setStarted] = useState(false)
  const [paused, setPaused] = useState(false)
  const [initialPreferences] = useState(loadInputPreferences)
  const [inputPreferences, setInputPreferences] = useState(initialPreferences.preferences)
  const [settingsError, setSettingsError] = useState<string | null>(initialPreferences.error)
  // Building is only possible docked at a drydock, so the mode follows the docking state
  const dock = useDock()
  const mode: GameMode = dock.phase === 'docked' ? 'build' : 'pilot'
  const [cameraView, setCameraView] = useState<CameraView>('chase')
  const [interior, setInterior] = useState(false)
  const [victory, setVictory] = useState(false)
  // Physics keeps running briefly after victory so the ship (now heavily damped) glides to a stop
  const [frozen, setFrozen] = useState(false)
  const persistInputPreferences = useCallback((next: InputPreferences) => {
    setInputPreferences(next)
    try {
      window.localStorage.setItem(INPUT_PREFERENCES_KEY, JSON.stringify(next))
      setSettingsError(null)
    } catch (error) {
      console.error('Failed to save input preferences', error)
      setSettingsError(error instanceof Error ? error.message : 'Failed to save input preferences')
    }
  }, [])
  const changeMouseSensitivity = useCallback((value: number) => {
    persistInputPreferences(setMouseSensitivity(value))
  }, [persistInputPreferences])
  const changeControl = useCallback((id: ControlId, code: string) => {
    persistInputPreferences(assignControlCode(id, code))
  }, [persistInputPreferences])
  const resetControls = useCallback(() => {
    persistInputPreferences(resetKeyBindings())
  }, [persistInputPreferences])

  useEffect(() => {
    if (!victory) return
    const id = setTimeout(() => setFrozen(true), 2500)
    return () => clearTimeout(id)
  }, [victory])

  // Mouse steering grabs the pointer in pilot mode; orbit view needs the cursor for drag-to-look
  const mouseLocked = usePointerLock(mode === 'pilot' && cameraView === 'chase' && !interior && !victory && !paused)

  const toggleCameraView = () => setCameraView((v) => (v === 'chase' ? 'orbit' : 'chase'))

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!started) return
      if (event.code === 'Escape' && !event.repeat && !victory) {
        event.preventDefault()
        closeContextMenu()
        setPaused((value) => !value)
        return
      }
      if (paused) return
      handleGameKey(event, { started, mode, victory, setInterior, setCameraView, setSelectedType })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, paused, victory, started])

  if (!started) {
    return (
      <CrewRegistration
        onStart={(profile) => {
          setCrewProfile(profile)
          setStarted(true)
        }}
      />
    )
  }

  return (
    <>
      {/* flat: no built-in tone mapping, the post-processing stack does it after the bloom */}
      <Canvas frameloop={paused ? 'never' : 'always'} shadows="percentage" flat gl={{ antialias: false }} onPointerMissed={() => closeContextMenu()} camera={{ position: [6, 5, 9], fov: 60, far: 10000 }} dpr={[1, 1.5]}>
        <Suspense fallback={null}>
          <Scene
            onBlockCountChange={setBlockCount}
            selectedType={selectedType}
            mode={mode}
            cameraView={cameraView}
            interior={interior}
            docked={mode === 'build'}
            paused={paused || frozen}
            onVictory={() => setVictory(true)}
          />
        </Suspense>
      </Canvas>

      <ShipPanel mode={mode} cameraView={cameraView} interior={interior} mouseLocked={mouseLocked} selectedType={selectedType} blockCount={blockCount} />

      <div className="hud-right-stack" style={{ position: 'absolute', top: 16, right: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <CrewPanel />
        <SystemsPanel />
      </div>

      {mode === 'build' && <ShipyardPanel selectedType={selectedType} onSelect={setSelectedType} />}
      <DockPrompt />
      <ArrivalPanel />
      <TargetReticle />
      <ContextMenu />

      <div
        className="hud-bottom-controls"
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 20,
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 12,
        }}
      >
        <DockButton />
        {!victory && <div role="button" onClick={() => setPaused(true)} style={buttonStyle}>PAUSE [Esc]</div>}
        <div role="button" onClick={() => setInterior((v) => !v)} style={buttonStyle}>
          VIEW: {interior ? 'INTERIOR' : 'EXTERIOR'} [V]
        </div>
        {mode === 'pilot' && !interior && (
          <div role="button" onClick={toggleCameraView} style={buttonStyle}>
            CAMERA: {cameraView === 'chase' ? 'CHASE' : 'ORBIT'} [C]
          </div>
        )}
      </div>

      <FoldOverlay />

      {paused && (
        <PauseMenu
          preferences={inputPreferences}
          settingsError={settingsError}
          onResume={() => setPaused(false)}
          onSensitivityChange={changeMouseSensitivity}
          onAssignControl={changeControl}
          onResetControls={resetControls}
        />
      )}
      {victory && <VictoryOverlay />}
    </>
  )
}
