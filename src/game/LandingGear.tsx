import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { gearPose, gearState, type GearLayout } from './landingGear'
import { shipState } from './shipState'
import type { Block } from './types'
import { CELESTIAL_BODIES, gameStats } from './gameState'

function createLegs(count: number) {
  const group = new THREE.Group()
  const tube = new THREE.CylinderGeometry(0.09, 0.09, 1, 8)
  const rod = new THREE.CylinderGeometry(0.055, 0.055, 1, 8)
  const pad = new THREE.CylinderGeometry(0.25, 0.25, 0.08, 12)
  const metal = new THREE.MeshStandardMaterial({ color: '#8a93a6', metalness: 0.65, roughness: 0.35 })
  const chrome = new THREE.MeshStandardMaterial({ color: '#c6d7e6', metalness: 0.8, roughness: 0.25 })
  const light = new THREE.MeshStandardMaterial({ color: '#4dff88', emissive: '#4dff88', emissiveIntensity: 0.8 })
  const legs = Array.from({ length: count }, () => {
    const root = new THREE.Group()
    const arm = new THREE.Mesh(rod, metal)
    const upper = new THREE.Mesh(tube, metal)
    const lower = new THREE.Mesh(rod, chrome)
    const foot = new THREE.Mesh(pad, light)
    root.add(upper, lower, foot)
    group.add(root)
    group.add(arm)
    return { root, arm, upper, lower, foot }
  })
  return { group, legs, resources: [tube, rod, pad, metal, chrome, light], up: new THREE.Vector3(), rotation: new THREE.Quaternion(), axis: new THREE.Vector3(0, -1, 0) }
}

function animateGear(visual: ReturnType<typeof createLegs>, layout: GearLayout, blocks: readonly Block[]) {
  visual.group.visible = gearState.progress > 0
  if (!visual.group.visible) return
  const body = CELESTIAL_BODIES[gameStats.arrival.body]
  if (body) visual.up.copy(shipState.position).sub(new THREE.Vector3(...body.position)).normalize()
  else visual.up.set(0, 1, 0).applyQuaternion(shipState.quaternion)
  const pose = gearPose(layout, blocks, shipState.quaternion, visual.up, body?.radius ?? 10000)
  visual.rotation.setFromUnitVectors(visual.axis, pose.localDown)
  visual.legs.forEach((leg, i) => {
    const p = pose.legs[i]
    const compression = Math.max(0, p.height - gearState.altitude)
    const length = Math.max(0.12, p.length * gearState.progress - compression)
    const joint = p.anchor.clone().lerp(p.root, gearState.progress)
    const armVector = joint.clone().sub(p.anchor)
    leg.arm.position.copy(p.anchor).add(joint).multiplyScalar(0.5)
    leg.arm.scale.y = Math.max(0.001, armVector.length())
    if (armVector.lengthSq() > 1e-8) leg.arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), armVector.normalize())
    leg.root.position.copy(joint)
    leg.root.quaternion.copy(visual.rotation)
    leg.upper.scale.y = length * 0.55
    leg.upper.position.y = -length * 0.275
    leg.lower.scale.y = length * 0.65
    leg.lower.position.y = -length * 0.675
    leg.foot.position.y = -length + 0.04
  })
}

export function LandingGear({ layout, blocks }: { layout: GearLayout; blocks: readonly Block[] }) {
  const visual = useMemo(() => createLegs(layout.mounts.length), [layout.mounts.length])
  useEffect(() => () => visual.resources.forEach((resource) => resource.dispose()), [visual])
  useFrame(() => animateGear(visual, layout, blocks))
  return <primitive object={visual.group} />
}
