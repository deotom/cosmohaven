import { Edges } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef, type RefObject } from 'react'
import * as THREE from 'three'
import type { GridPos } from './types'

const ORANGE = new THREE.Color(3, 1.6, 0.4)
const CYAN = new THREE.Color(0.4, 1.8, 2.4)

type PendingBlockProps = {
  pos: GridPos
  /** True for the block the drones are working on; the rest are waiting in the queue */
  active: boolean
  /** 0-1 assembly progress of the active block */
  progress: RefObject<number>
}

/** A hologram of a block that is queued or being assembled: it grows and scans while the drones work on it. */
export function PendingBlock({ pos, active, progress }: PendingBlockProps) {
  const group = useRef<THREE.Group>(null)
  const scan = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    const p = active ? progress.current : 0
    group.current?.scale.setScalar(active ? 0.25 + 0.75 * p : 1)
    if (scan.current) {
      scan.current.visible = active
      scan.current.position.y = -0.5 + ((clock.elapsedTime * 1.4) % 1)
    }
  })

  return (
    <group position={pos}>
      <group ref={group}>
        <mesh raycast={() => null}>
          <boxGeometry args={[0.96, 0.96, 0.96]} />
          <meshBasicMaterial color={active ? ORANGE : CYAN} transparent opacity={active ? 0.16 : 0.07} depthWrite={false} toneMapped={false} />
          <Edges color={active ? '#ffb347' : '#38e8ff'} />
        </mesh>
        <mesh ref={scan} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
          <planeGeometry args={[0.96, 0.96]} />
          <meshBasicMaterial color={ORANGE} transparent opacity={0.6} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  )
}
