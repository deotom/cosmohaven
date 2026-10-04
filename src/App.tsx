import { Canvas } from '@react-three/fiber'
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { CrewRegistration } from './CrewRegistration'
import type { CrewProfile } from './game/crewProfile'
import type { Difficulty } from './game/difficulty'
import { useDock } from './game/dock'
import { closeContextMenu } from './game/targetActions'
import { ContextMenu, TargetReticle } from './game/TargetSystem'
import { gameStats } from './game/gameState'
import { usePointerLock } from './game/usePointerLock'
import type { CameraView, GameMode, PlaceableBlockType } from './game/types'
import { handleGameKey } from './input/keymap'
import { ArrivalPanel } from './hud/ArrivalPanel'
import { ContractsPanel } from './hud/ContractsPanel'
import { HelpOverlay } from './hud/HelpOverlay'
import { TradePanel } from './hud/TradePanel'
import { buttonStyle } from './hud/styles'
import { useSampled } from './hud/useSampled'
import { ShipPanel } from './hud/ShipPanel'
import { CrewPanel, SystemsPanel } from './hud/SystemsPanel'
import { DockButton, DockPrompt } from './hud/Warnings'
import { dockedHasService } from './game/services'
import { ShipyardPanel } from './hud/ShipyardPanel'
import { PauseMenu } from './hud/PauseMenu'
import { StartMenu } from './hud/StartMenu'
import { TutorialOverlay } from './hud/TutorialOverlay'
import { markOnboardingSeen, readOnboardingStatus } from './hud/onboarding'
import { clearSaveSlot, createSaveSnapshot, readSaveSlot, resetNewGame, restoreSave, writeSaveSlot } from './game/saveGame'
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

function VictoryOverlay({ onPlayAgain }: { onPlayAgain: () => void }) {
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
        onClick={onPlayAgain}
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
        MAIN MENU
      </div>
    </div>
  )
}

export default function App() {
  const [blockCount, setBlockCount] = useState(1)
  const [selectedType, setSelectedType] = useState<PlaceableBlockType>('hull')
  const [started, setStarted] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [saveSlot, setSaveSlot] = useState(readSaveSlot)
  const [saveError, setSaveError] = useState<string | null>(saveSlot.error)
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [tutorialStep, setTutorialStep] = useState(0)
  const [paused, setPaused] = useState(false)
  const [difficulty, setDifficulty] = useState(gameStats.difficulty)
  const [initialPreferences] = useState(loadInputPreferences)
  const [inputPreferences, setInputPreferences] = useState(initialPreferences.preferences)
  const [settingsError, setSettingsError] = useState<string | null>(initialPreferences.error)
  // Building is only possible docked at a drydock, so the mode follows the docking state
  const dock = useDock()
  const mode: GameMode = dock.phase === 'docked' ? 'build' : 'pilot'
  const [cameraView, setCameraView] = useState<CameraView>('chase')
  const [interior, setInterior] = useState(false)
  const [tradeOpen, setTradeOpen] = useState(false)
  const [contractsOpen, setContractsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
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
  const changeDifficulty = useCallback((next: Difficulty) => {
    gameStats.difficulty = next
    setDifficulty(next)
  }, [])

  const finishTutorial = () => {
    const error = markOnboardingSeen()
    if (error) setSaveError(error)
    setTutorialOpen(false)
  }

  const advanceTutorial = () => {
    if (tutorialStep >= 3) finishTutorial()
    else setTutorialStep((step) => step + 1)
  }

  const continueGame = () => {
    if (!saveSlot.save) return
    try {
      restoreSave(saveSlot.save)
      setDifficulty(saveSlot.save.difficulty)
      setVictory(saveSlot.save.game.victory)
      setFrozen(saveSlot.save.game.victory)
      setPaused(false)
      setTradeOpen(false)
      setContractsOpen(false)
      setHelpOpen(false)
      setInterior(false)
      setCameraView('chase')
      setTutorialStep(0)
      const onboarding = readOnboardingStatus()
      setTutorialOpen(!onboarding.seen)
      setSaveError(onboarding.error)
      setRegistering(false)
      setStarted(true)
    } catch (error) {
      console.error('Failed to restore saved game', error)
      setSaveError(error instanceof Error ? error.message : 'Failed to restore saved game')
    }
  }

  const startNewGame = (profile: CrewProfile) => {
    const clearError = clearSaveSlot()
    resetNewGame(profile)
    setSaveSlot({ save: null, error: null })
    setSaveError(clearError)
    setDifficulty(gameStats.difficulty)
    setVictory(false)
    setFrozen(false)
    setPaused(false)
    setTradeOpen(false)
    setContractsOpen(false)
    setHelpOpen(false)
    setInterior(false)
    setCameraView('chase')
    setSelectedType('hull')
    setTutorialStep(0)
    const onboarding = readOnboardingStatus()
    setTutorialOpen(!onboarding.seen)
    setRegistering(false)
    setStarted(true)
    if (onboarding.error) setSaveError(onboarding.error)
  }

  useEffect(() => {
    if (!started) return
    const saveNow = () => {
      try {
        const snapshot = createSaveSnapshot()
        const error = writeSaveSlot(snapshot)
        if (error) {
          setSaveError(error)
        } else {
          setSaveError(null)
        }
      } catch (error) {
        console.error('Failed to create autosave snapshot', error)
        setSaveError(error instanceof Error ? error.message : 'Failed to create autosave snapshot')
      }
    }
    const interval = window.setInterval(saveNow, 1000)
    window.addEventListener('pagehide', saveNow)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('pagehide', saveNow)
    }
  }, [started])

  useEffect(() => {
    if (!victory) return
    const id = setTimeout(() => setFrozen(true), 2500)
    return () => clearTimeout(id)
  }, [victory])

  // Mouse steering grabs the pointer in pilot mode; orbit view needs the cursor for drag-to-look
  const mouseLocked = usePointerLock(started && mode === 'pilot' && cameraView === 'chase' && !interior && !victory && !paused && !tutorialOpen)

  const toggleCameraView = () => setCameraView((v) => (v === 'chase' ? 'orbit' : 'chase'))

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!started) return
      if (tutorialOpen) {
        if (event.code === 'Escape' && !event.repeat) {
          event.preventDefault()
          finishTutorial()
        }
        return
      }
      if (event.code === 'Escape' && !event.repeat && !victory) {
        event.preventDefault()
        closeContextMenu()
        setPaused((value) => !value)
        return
      }
      if (paused) return
      handleGameKey(event, { started, mode, victory, setInterior, setCameraView, setSelectedType, toggleHelp: () => setHelpOpen((open) => !open) })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, paused, victory, started, tutorialOpen])

  if (!started && !registering) {
    return <StartMenu save={saveSlot.save} error={saveError} onContinue={continueGame} onNewGame={() => setRegistering(true)} />
  }

  if (!started) {
    return (
      <CrewRegistration
        onStart={startNewGame}
        onCancel={() => setRegistering(false)}
      />
    )
  }

  return (
    <>
      {/* flat: no built-in tone mapping, the post-processing stack does it after the bloom */}
      <Canvas frameloop={paused || tutorialOpen ? 'never' : 'always'} shadows="percentage" flat gl={{ antialias: false }} onPointerMissed={() => closeContextMenu()} camera={{ position: [6, 5, 9], fov: 60, far: 10000 }} dpr={[1, 1.5]}>
        <Suspense fallback={null}>
          <Scene
            onBlockCountChange={setBlockCount}
            selectedType={selectedType}
            mode={mode}
            cameraView={cameraView}
            interior={interior}
            docked={mode === 'build'}
            paused={paused || frozen || tutorialOpen}
            onVictory={() => setVictory(true)}
          />
        </Suspense>
      </Canvas>

      <ShipPanel mode={mode} cameraView={cameraView} interior={interior} mouseLocked={mouseLocked} selectedType={selectedType} blockCount={blockCount} />
      {saveError && (
        <div role="alert" style={{ position: 'absolute', left: 16, top: 140, maxWidth: 360, padding: 10, border: '1px solid #ff7979', borderRadius: 6, color: '#ffb5b5', background: 'rgba(40,0,0,0.8)', fontSize: 12 }}>
          Autosave error: {saveError}
        </div>
      )}

      <div
        className="hud-right-stack"
        style={{ position: 'absolute', top: 16, right: 16, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 'calc(100vh - 32px)', overflow: 'hidden' }}
      >
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
          left: 16,
          width: 'calc(100vw - 32px)',
          bottom: 20,
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: 12,
          pointerEvents: 'none',
        }}
      >
        <DockButton />
        <div role="button" onClick={() => setTradeOpen((open) => !open)} style={buttonStyle}>
          {mode === 'build' ? 'DRYDOCK TRADE' : 'TRADE RELAY'}
        </div>
        {mode === 'build' && dockedHasService('contracts') && (
          <div role="button" onClick={() => setContractsOpen((open) => !open)} style={buttonStyle}>
            CONTRACTS
          </div>
        )}
        <div role="button" onClick={() => setHelpOpen((open) => !open)} style={buttonStyle}>
          HELP [?]
        </div>
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

      {tradeOpen && <TradePanel onClose={() => setTradeOpen(false)} />}
      {contractsOpen && mode === 'build' && <ContractsPanel onClose={() => setContractsOpen(false)} />}
      {helpOpen && <HelpOverlay mode={mode} onClose={() => setHelpOpen(false)} />}
      {tutorialOpen && <TutorialOverlay step={tutorialStep} onNext={advanceTutorial} onSkip={finishTutorial} />}
      {paused && (
        <PauseMenu
          preferences={inputPreferences}
          difficulty={difficulty}
          settingsError={settingsError}
          onResume={() => setPaused(false)}
          onDifficultyChange={changeDifficulty}
          onSensitivityChange={changeMouseSensitivity}
          onAssignControl={changeControl}
          onResetControls={resetControls}
        />
      )}
      {victory && (
        <VictoryOverlay
          onPlayAgain={() => {
            setVictory(false)
            setFrozen(false)
            setStarted(false)
            setRegistering(false)
            setSaveSlot(readSaveSlot())
          }}
        />
      )}
    </>
  )
}
