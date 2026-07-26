import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { RelationTransition } from '../types'

interface RelationTransitionEffectProps {
  transition: RelationTransition
}

function easeInOutCubic(value: number) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2
}

function createGlowTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (context) {
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64)
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(0.18, 'rgba(255,255,255,.64)')
    gradient.addColorStop(0.5, 'rgba(255,255,255,.16)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, 128, 128)
  }
  return new THREE.CanvasTexture(canvas)
}

export default function RelationTransitionEffect({ transition }: RelationTransitionEffectProps) {
  const carrierRef = useRef<THREE.Group>(null)
  const coreMaterialRef = useRef<THREE.MeshStandardMaterial>(null)
  const shellMaterialRef = useRef<THREE.MeshBasicMaterial>(null)
  const auraRef = useRef<THREE.Sprite>(null)
  const auraMaterialRef = useRef<THREE.SpriteMaterial>(null)
  const geometryRef = useRef<THREE.BufferGeometry>(null)
  const lineMaterialRef = useRef<THREE.LineBasicMaterial>(null)
  const sourceRingRefs = useRef<Array<THREE.Mesh | null>>([])
  const sourceMaterialRefs = useRef<Array<THREE.MeshBasicMaterial | null>>([])
  const targetRingRefs = useRef<Array<THREE.Mesh | null>>([])
  const targetMaterialRefs = useRef<Array<THREE.MeshBasicMaterial | null>>([])
  const trailRefs = useRef<Array<THREE.Sprite | null>>([])
  const trailMaterialRefs = useRef<Array<THREE.SpriteMaterial | null>>([])
  const bornAtRef = useRef<number | null>(null)

  const source = useMemo(() => new THREE.Vector3(...transition.sourcePosition), [transition.sourcePosition])
  const target = useMemo(() => new THREE.Vector3(...transition.targetPosition), [transition.targetPosition])
  const delta = useMemo(() => target.clone().sub(source), [source, target])
  const distance = source.distanceTo(target)
  const curve = useMemo(() => {
    const arch = transition.kind === 'detach'
      ? Math.min(2.7, 0.85 + distance * 0.24)
      : Math.min(2.0, 0.55 + distance * 0.17)
    const c1 = source.clone().addScaledVector(delta, 0.28)
    const c2 = source.clone().addScaledVector(delta, 0.72)
    c1.y += arch
    c2.y += arch * 0.62
    c1.z -= Math.min(1.15, 0.22 + distance * 0.08)
    c2.z -= Math.min(0.8, 0.12 + distance * 0.045)
    return new THREE.CubicBezierCurve3(source, c1, c2, target)
  }, [delta, distance, source, target, transition.kind])
  const points = useMemo(() => curve.getPoints(120), [curve])
  const curvePositions = useMemo(() => {
    const result = new Float32Array(points.length * 3)
    points.forEach((point, index) => {
      result[index * 3] = point.x
      result[index * 3 + 1] = point.y
      result[index * 3 + 2] = point.z
    })
    return result
  }, [points])
  const glowTexture = useMemo(createGlowTexture, [])
  const carrierPosition = useMemo(() => new THREE.Vector3(), [])
  const trailPosition = useMemo(() => new THREE.Vector3(), [])
  const duration = transition.kind === 'nest' ? 2.15 : 2.35

  useFrame(({ clock }, deltaTime) => {
    const elapsed = clock.getElapsedTime()
    if (bornAtRef.current === null) bornAtRef.current = elapsed
    const life = elapsed - (bornAtRef.current ?? elapsed)
    const progress = THREE.MathUtils.clamp(life / duration, 0, 1)
    const moveProgress = easeInOutCubic(THREE.MathUtils.clamp((progress - 0.045) / 0.77, 0, 1))
    const travelEnvelope = Math.sin(Math.PI * THREE.MathUtils.clamp(progress / 0.88, 0, 1))
    const arrivalProgress = THREE.MathUtils.clamp((progress - 0.66) / 0.34, 0, 1)
    const fadeOut = 1 - THREE.MathUtils.smoothstep(progress, 0.82, 1)

    curve.getPoint(moveProgress, carrierPosition)
    if (carrierRef.current) {
      carrierRef.current.position.copy(carrierPosition)
      carrierRef.current.rotation.y += deltaTime * 2.45
      carrierRef.current.rotation.x += deltaTime * 0.76
      const baseScale = THREE.MathUtils.lerp(transition.sourceScale, transition.targetScale, moveProgress)
      const pulse = 1 + Math.sin(Math.PI * moveProgress) * (transition.kind === 'nest' ? 0.2 : 0.12)
      const dissolve = transition.kind === 'nest'
        ? THREE.MathUtils.lerp(1, 0.24, arrivalProgress)
        : THREE.MathUtils.lerp(1, 1.08, arrivalProgress)
      carrierRef.current.scale.setScalar(Math.max(0.025, baseScale * pulse * dissolve))
    }

    if (geometryRef.current) {
      geometryRef.current.setDrawRange(0, Math.max(2, Math.floor(points.length * moveProgress)))
    }
    if (lineMaterialRef.current) {
      lineMaterialRef.current.opacity = travelEnvelope * 0.5 * fadeOut
    }
    if (coreMaterialRef.current) {
      coreMaterialRef.current.opacity = fadeOut * (transition.kind === 'nest' ? 0.9 : 0.96)
      coreMaterialRef.current.emissiveIntensity = 4.2 + travelEnvelope * 4.8
    }
    if (shellMaterialRef.current) {
      shellMaterialRef.current.opacity = fadeOut * (0.22 + travelEnvelope * 0.24)
    }
    if (auraRef.current) {
      const auraScale = 2.2 + travelEnvelope * 1.5 + arrivalProgress * 0.7
      auraRef.current.scale.set(auraScale, auraScale, 1)
    }
    if (auraMaterialRef.current) {
      auraMaterialRef.current.opacity = fadeOut * (0.28 + travelEnvelope * 0.34)
    }

    trailRefs.current.forEach((trail, index) => {
      const material = trailMaterialRefs.current[index]
      if (!trail || !material) return
      const lag = 0.035 + index * 0.045
      const trailProgress = THREE.MathUtils.clamp(moveProgress - lag, 0, 1)
      curve.getPoint(trailProgress, trailPosition)
      trail.position.copy(trailPosition)
      const localEnvelope = Math.sin(Math.PI * THREE.MathUtils.clamp((moveProgress - trailProgress) / 0.24, 0, 1))
      const scale = 0.28 + index * 0.08 + localEnvelope * 0.45
      trail.scale.set(scale, scale, 1)
      material.opacity = fadeOut * Math.max(0, 0.34 - index * 0.055) * travelEnvelope
    })

    sourceRingRefs.current.forEach((ring, index) => {
      const material = sourceMaterialRefs.current[index]
      if (!ring || !material) return
      const ringProgress = THREE.MathUtils.clamp((progress * 2.15) - index * 0.1, 0, 1)
      ring.scale.setScalar(0.42 + ringProgress * (2.4 + index * 0.45))
      ring.rotation.z += deltaTime * (0.42 + index * 0.18)
      material.opacity = (1 - ringProgress) * (0.48 - index * 0.08)
    })

    targetRingRefs.current.forEach((ring, index) => {
      const material = targetMaterialRefs.current[index]
      if (!ring || !material) return
      const ringProgress = THREE.MathUtils.clamp((progress - 0.6 - index * 0.035) / 0.36, 0, 1)
      const pulse = Math.sin(Math.PI * ringProgress)
      ring.scale.setScalar(0.38 + ringProgress * (2.45 + index * 0.5))
      ring.rotation.z -= deltaTime * (0.35 + index * 0.14)
      material.opacity = pulse * (0.72 - index * 0.11)
    })
  })

  return (
    <group>
      <line>
        <bufferGeometry ref={geometryRef}>
          <bufferAttribute attach="attributes-position" args={[curvePositions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial
          ref={lineMaterialRef}
          color={transition.targetColor ?? transition.color}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </line>

      {[0, 1, 2, 3].map((index) => (
        <sprite
          key={`trail-${index}`}
          ref={(sprite) => {
            trailRefs.current[index] = sprite
          }}
          position={transition.sourcePosition}
        >
          <spriteMaterial
            ref={(material) => {
              trailMaterialRefs.current[index] = material
            }}
            map={glowTexture}
            color={transition.color}
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </sprite>
      ))}

      <group ref={carrierRef} position={transition.sourcePosition}>
        <sprite ref={auraRef}>
          <spriteMaterial
            ref={auraMaterialRef}
            map={glowTexture}
            color={transition.color}
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </sprite>
        <mesh>
          <sphereGeometry args={[0.48, 56, 56]} />
          <meshStandardMaterial
            ref={coreMaterialRef}
            color={transition.color}
            emissive={transition.color}
            emissiveIntensity={5}
            roughness={0.16}
            metalness={0.08}
            transparent
            opacity={0}
          />
        </mesh>
        <mesh scale={1.18}>
          <icosahedronGeometry args={[0.5, 2]} />
          <meshBasicMaterial
            ref={shellMaterialRef}
            color={transition.targetColor ?? transition.color}
            wireframe
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      </group>

      {[0, 1, 2].map((index) => (
        <mesh
          key={`source-ring-${index}`}
          ref={(mesh) => {
            sourceRingRefs.current[index] = mesh
          }}
          position={transition.sourcePosition}
          rotation={[0.08 * index, 0.16 * index, index * 0.42]}
        >
          <torusGeometry args={[0.58 + index * 0.08, 0.017 - index * 0.003, 8, 120]} />
          <meshBasicMaterial
            ref={(material) => {
              sourceMaterialRefs.current[index] = material
            }}
            color={transition.color}
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}

      {[0, 1, 2].map((index) => (
        <mesh
          key={`target-ring-${index}`}
          ref={(mesh) => {
            targetRingRefs.current[index] = mesh
          }}
          position={transition.targetPosition}
          rotation={[0.1 * index, 0.22 * index, index * 0.5]}
        >
          <torusGeometry args={[0.62 + index * 0.09, 0.021 - index * 0.003, 8, 128]} />
          <meshBasicMaterial
            ref={(material) => {
              targetMaterialRefs.current[index] = material
            }}
            color={transition.targetColor ?? '#ffffff'}
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  )
}
