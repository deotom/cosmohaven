import { Canvas, useFrame } from '@react-three/fiber'
import { useRef, useState, type CSSProperties } from 'react'
import type * as THREE from 'three'
import { Character, type CharacterPose } from './game/Character'
import { ROLES, crewProfile, type CrewProfile, type RoleId } from './game/crewProfile'
import { DEFAULT_LOOK, SPECIES, SPECIES_OPTIONS, type Look, type SpeciesId } from './game/species'

/** The chosen character, turning slowly on the spot so every feature can be seen. */
function Preview({ species, look }: { species: SpeciesId; look: Look }) {
  const pose = useRef<CharacterPose>({ walk: 0, activity: 'none' })
  const spinner = useRef<THREE.Group>(null)
  useFrame((_, dt) => {
    if (spinner.current) spinner.current.rotation.y += dt * 0.7
  })
  return (
    <group position={[0, -0.66, 0]} scale={1.3}>
      {/* A soft round stage for the character to stand on */}
      <mesh position={[0, -0.035, 0]} receiveShadow>
        <cylinderGeometry args={[0.46, 0.5, 0.07, 48]} />
        <meshToonMaterial color="#fff1d6" />
      </mesh>
      <mesh position={[0, -0.075, 0]}>
        <cylinderGeometry args={[0.56, 0.58, 0.04, 48]} />
        <meshToonMaterial color="#ffd9b0" />
      </mesh>
      <group ref={spinner}>
        <Character pose={pose} species={species} look={look} />
      </group>
    </group>
  )
}

const card: CSSProperties = {
  background: 'rgba(8, 14, 32, 0.78)',
  border: '1px solid rgba(110, 170, 255, 0.35)',
  borderRadius: 14,
  boxShadow: '0 0 60px rgba(70, 120, 255, 0.18)',
  backdropFilter: 'blur(6px)',
}

const label: CSSProperties = { fontSize: 12, letterSpacing: 3, color: '#7fd4ff', marginBottom: 8, fontWeight: 700 }

const chipStyle = (selected: boolean): CSSProperties => ({
  padding: '5px 12px',
  borderRadius: 16,
  cursor: 'pointer',
  fontSize: 13,
  color: selected ? '#021014' : '#dbeaff',
  background: selected ? '#7fe3ff' : 'rgba(255,255,255,0.07)',
  border: selected ? '1px solid #bff4ff' : '1px solid rgba(255,255,255,0.16)',
})

/**
 * Crew registration: choose a name, a species with its own look options and racial passives, and a starting
 * specialty. A live 3D preview shows the result.
 */
export function CrewRegistration({ onStart }: { onStart: (profile: CrewProfile) => void }) {
  const [name, setName] = useState(crewProfile.name)
  const [species, setSpecies] = useState<SpeciesId>(crewProfile.species)
  const [look, setLook] = useState<Look>({ ...DEFAULT_LOOK, ...crewProfile.look })
  const [role, setRole] = useState<RoleId>(crewProfile.role)

  const chosen = SPECIES[species]
  const start = () => onStart({ name: name.trim() || 'Nova', role, species, look })

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        color: '#dbeaff',
        fontFamily: 'system-ui, sans-serif',
        background: 'radial-gradient(ellipse at 30% 20%, #1b2350 0%, #070a1a 55%, #02030a 100%)',
        overflow: 'auto',
      }}
    >
      <div style={{ ...card, display: 'flex', flexWrap: 'wrap', gap: 28, padding: 30, maxWidth: 1040, width: '100%', margin: 'auto' }}>
        <div style={{ flex: '1 1 440px', minWidth: 300 }}>
          <div style={{ fontSize: 13, letterSpacing: 6, color: '#7fd4ff' }}>COSMOHAVEN</div>
          <h1 style={{ margin: '4px 0 18px', fontSize: 32, letterSpacing: 1 }}>Crew Registration</h1>

          <div style={label}>CREW NAME</div>
          <input
            value={name}
            maxLength={16}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && start()}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '9px 14px',
              fontSize: 18,
              color: '#fff',
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(140,190,255,0.4)',
              borderRadius: 8,
              outline: 'none',
              marginBottom: 18,
            }}
          />

          <div style={label}>SPECIES</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {Object.values(SPECIES).map((s) => (
              <div
                key={s.id}
                role="button"
                onClick={() => setSpecies(s.id)}
                style={{
                  flex: '1 1 150px',
                  padding: '8px 12px',
                  borderRadius: 10,
                  cursor: 'pointer',
                  background: s.id === species ? 'rgba(80,150,255,0.25)' : 'rgba(255,255,255,0.05)',
                  border: s.id === species ? '1px solid #7fd4ff' : '1px solid rgba(255,255,255,0.14)',
                }}
              >
                <div style={{ fontWeight: 700 }}>{s.name}</div>
                <div style={{ opacity: 0.65, fontSize: 12 }}>{s.tagline}</div>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 16, padding: '8px 12px', borderRadius: 8, background: 'rgba(77,255,184,0.07)', border: '1px solid rgba(77,255,184,0.25)' }}>
            {chosen.traits.map((t) => (
              <div key={t} style={{ color: '#4dffb8', fontSize: 13 }}>
                ✦ {t}
              </div>
            ))}
          </div>

          {SPECIES_OPTIONS[species].map((option) => (
            <div key={option.key} style={{ marginBottom: 14 }}>
              <div style={label}>{option.label}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                {option.choices.map((choice) =>
                  choice.swatch ? (
                    <div
                      key={choice.id}
                      role="button"
                      title={choice.label}
                      onClick={() => setLook((l) => ({ ...l, [option.key]: choice.id }))}
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: '50%',
                        cursor: 'pointer',
                        background: choice.swatch,
                        border: look[option.key] === choice.id ? '3px solid #fff' : '2px solid rgba(255,255,255,0.25)',
                        boxShadow: look[option.key] === choice.id ? `0 0 12px ${choice.swatch}` : 'none',
                      }}
                    />
                  ) : (
                    <div key={choice.id} role="button" onClick={() => setLook((l) => ({ ...l, [option.key]: choice.id }))} style={chipStyle(look[option.key] === choice.id)}>
                      {choice.label}
                    </div>
                  ),
                )}
              </div>
            </div>
          ))}

          <div style={label}>STARTING SPECIALTY</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 22 }}>
            {Object.values(ROLES).map((r) => (
              <div
                key={r.id}
                role="button"
                onClick={() => setRole(r.id)}
                style={{
                  flex: '1 1 140px',
                  padding: '8px 12px',
                  borderRadius: 10,
                  cursor: 'pointer',
                  background: r.id === role ? 'rgba(80,150,255,0.25)' : 'rgba(255,255,255,0.05)',
                  border: r.id === role ? '1px solid #7fd4ff' : '1px solid rgba(255,255,255,0.14)',
                }}
              >
                <div style={{ fontWeight: 700 }}>{r.name}</div>
                <div style={{ color: '#4dffb8', fontSize: 12 }}>{r.bonus}</div>
              </div>
            ))}
          </div>

          <div
            role="button"
            onClick={start}
            style={{
              textAlign: 'center',
              padding: '13px 20px',
              fontWeight: 800,
              letterSpacing: 3,
              fontSize: 16,
              cursor: 'pointer',
              borderRadius: 10,
              background: 'linear-gradient(90deg, #2563eb, #7c3aed)',
              boxShadow: '0 0 24px rgba(100,120,255,0.5)',
            }}
          >
            REPORT TO THE DRYDOCK
          </div>
        </div>

        <div style={{ flex: '1 1 280px', minWidth: 240, minHeight: 420, borderRadius: 12, overflow: 'hidden', background: 'radial-gradient(circle at 50% 30%, #ffefd2 0%, #ffcfae 55%, #f5a99f 100%)' }}>
          <Canvas camera={{ position: [0, 0.25, 3.3], fov: 35 }}>
            {/* Soft, warm, even lighting: the cosy look comes from gentle ambient light and a mild key */}
            <ambientLight intensity={1.6} color="#fff3e0" />
            <hemisphereLight args={['#cfeaff', '#ffd9b8', 1.1]} />
            <directionalLight position={[2, 3, 3]} intensity={3.2} color="#ffe9c9" />
            <directionalLight position={[-3, 1, -2]} intensity={0.6} color="#ffc9d8" />
            <Preview species={species} look={look} />
          </Canvas>
        </div>
      </div>
    </div>
  )
}
