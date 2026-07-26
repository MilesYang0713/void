import { Html } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { Vec3 } from '../types'

interface IdeaNodeProps {
  id: string
  title: string
  color: string
  targetPosition: Vec3
  initialPosition?: Vec3
  initialScale?: number
  targetScale?: number
  initialOpacity?: number
  targetOpacity?: number
  showLabel?: boolean
  labelDetail?: string
  active?: boolean
  delay?: number
  compact?: boolean
  particleCount?: number
  floatStrength?: number
  orbitStrength?: number
  motionSpeed?: number
  activityLevel?: number
  draggable?: boolean
  pressing?: boolean
  dragging?: boolean
  dropTarget?: boolean
  transitionDuration?: number
  transitionArc?: number
  transitionEffect?: 'none' | 'focus' | 'relation' | 'birth'
  positionDamping?: number
  interactionLabels?: {
    dropTarget: string
    dragging: string
    pressing: string
  }
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void
  onClick?: (worldPosition: Vec3, worldScale: number) => void
}

function createParticlePositions(id: string, count: number) {
  let seed = [...id].reduce((total, char) => total + char.charCodeAt(0), 0) || 1
  const random = () => {
    seed = (seed * 9301 + 49297) % 233280
    return seed / 233280
  }

  const positions = new Float32Array(count * 3)
  for (let index = 0; index < count; index += 1) {
    const radius = 0.13 + random() * 0.38
    const theta = random() * Math.PI * 2
    const phi = Math.acos(2 * random() - 1)
    positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta)
    positions[index * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta)
    positions[index * 3 + 2] = radius * Math.cos(phi)
  }
  return positions
}

function createGlowTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext('2d')

  if (context) {
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64)
    gradient.addColorStop(0, 'rgba(255,255,255,0.98)')
    gradient.addColorStop(0.16, 'rgba(255,255,255,0.55)')
    gradient.addColorStop(0.46, 'rgba(255,255,255,0.14)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, 128, 128)
  }

  return new THREE.CanvasTexture(canvas)
}

function easeInOutCubic(value: number) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2
}

export default function IdeaNode({
  id,
  title,
  color,
  targetPosition,
  initialPosition = targetPosition,
  initialScale = 0.001,
  targetScale = 1,
  initialOpacity = 0,
  targetOpacity = 1,
  showLabel = false,
  labelDetail,
  active = false,
  delay = 0,
  compact = false,
  particleCount = compact ? 24 : 70,
  floatStrength = 0.025,
  orbitStrength = 0.018,
  motionSpeed = 0.72,
  activityLevel = 0.2,
  draggable = false,
  pressing = false,
  dragging = false,
  dropTarget = false,
  transitionDuration = 1.05,
  transitionArc = 0,
  transitionEffect = 'none',
  positionDamping = 6.5,
  interactionLabels = {
    dropTarget: 'Release to nest here',
    dragging: 'Release to place',
    pressing: 'Preparing to move',
  },
  onPointerDown,
  onClick,
}: IdeaNodeProps) {
  const groupRef = useRef<THREE.Group>(null)
  const shellRef = useRef<THREE.Mesh>(null)
  const particlesRef = useRef<THREE.Points>(null)
  const auraRef = useRef<THREE.Sprite>(null)
  const ringsRef = useRef<THREE.Group>(null)
  const transitionRingARef = useRef<THREE.Mesh>(null)
  const transitionRingBRef = useRef<THREE.Mesh>(null)
  const transitionRingAMaterialRef = useRef<THREE.MeshBasicMaterial>(null)
  const transitionRingBMaterialRef = useRef<THREE.MeshBasicMaterial>(null)
  const coreMaterialRef = useRef<THREE.MeshStandardMaterial>(null)
  const shellMaterialRef = useRef<THREE.MeshBasicMaterial>(null)
  const auraMaterialRef = useRef<THREE.SpriteMaterial>(null)
  const particleMaterialRef = useRef<THREE.PointsMaterial>(null)
  const [hovered, setHovered] = useState(false)
  const bornAt = useRef<number | null>(null)

  const normalizedActivity = THREE.MathUtils.clamp(activityLevel, 0, 1)
  const energyRingCount = normalizedActivity > 0.82 ? 3 : normalizedActivity > 0.58 ? 2 : normalizedActivity > 0.34 ? 1 : 0
  const target = useMemo(() => new THREE.Vector3(...targetPosition), [targetPosition])
  const initial = useMemo(() => new THREE.Vector3(...initialPosition), [initialPosition])
  const animatedTarget = useMemo(() => new THREE.Vector3(), [])
  const transitionPosition = useMemo(() => new THREE.Vector3(), [])
  const worldPosition = useMemo(() => new THREE.Vector3(), [])
  const worldScale = useMemo(() => new THREE.Vector3(), [])
  const particlePositions = useMemo(
    () => createParticlePositions(id, particleCount),
    [id, particleCount],
  )
  const glowTexture = useMemo(() => createGlowTexture(), [])
  const motionPhase = useMemo(
    () => [...id].reduce((total, char) => total + char.charCodeAt(0) * 0.017, 0),
    [id],
  )

  useFrame(({ clock }, delta) => {
    const group = groupRef.current
    if (!group) return

    const elapsed = clock.getElapsedTime()
    if (bornAt.current === null) bornAt.current = elapsed
    const birthTime = bornAt.current ?? elapsed
    const life = Math.max(0, elapsed - birthTime - delay)
    const rawProgress = THREE.MathUtils.clamp(life / Math.max(0.12, transitionDuration), 0, 1)
    const entrance = easeInOutCubic(rawProgress)
    const positionSmooth = 1 - Math.exp(-Math.max(0.1, positionDamping) * delta)
    const visualSmooth = 1 - Math.exp(-6.5 * delta)

    animatedTarget.copy(target)
    animatedTarget.x += Math.cos(elapsed * motionSpeed * 0.76 + motionPhase) * orbitStrength
    animatedTarget.y += Math.sin(elapsed * motionSpeed + motionPhase) * floatStrength
    animatedTarget.z += Math.sin(elapsed * motionSpeed * 0.58 + motionPhase * 1.7) * orbitStrength * 0.72

    if (rawProgress < 1) {
      transitionPosition.lerpVectors(initial, animatedTarget, entrance)
      const arcEnvelope = Math.sin(Math.PI * entrance)
      transitionPosition.y += arcEnvelope * transitionArc
      transitionPosition.z -= arcEnvelope * Math.abs(transitionArc) * 0.32
      group.position.copy(transitionPosition)
    } else {
      group.position.lerp(animatedTarget, positionSmooth)
    }

    const activePulse = 0.022 + normalizedActivity * 0.018
    const breathing = 1 + Math.sin(elapsed * (1.65 + normalizedActivity * 0.5) + motionPhase) * activePulse
    const transitionScale = THREE.MathUtils.lerp(initialScale, targetScale, entrance)
    const relationPulse = transitionEffect === 'relation' && rawProgress < 1
      ? 1 + Math.sin(Math.PI * rawProgress) * 0.12
      : 1
    const desiredScale = Math.max(0.001, transitionScale * relationPulse * breathing * (dragging ? 1.08 : dropTarget ? 1.11 : pressing ? 1.04 : 1))
    const scale = THREE.MathUtils.lerp(group.scale.x, desiredScale, visualSmooth)
    group.scale.setScalar(scale)

    group.rotation.y += delta * (compact ? 0.26 : 0.23 + normalizedActivity * 0.18)
    group.rotation.x = Math.sin(elapsed * 0.35 + motionPhase) * (0.07 + normalizedActivity * 0.035)

    if (shellRef.current) {
      shellRef.current.rotation.y -= delta * (compact ? 0.43 : 0.36 + normalizedActivity * 0.22)
      shellRef.current.rotation.z += delta * (compact ? 0.25 : 0.2 + normalizedActivity * 0.12)
    }
    if (particlesRef.current) {
      particlesRef.current.rotation.y += delta * (compact ? 0.54 : 0.46 + normalizedActivity * 0.22)
      particlesRef.current.rotation.x -= delta * (0.17 + normalizedActivity * 0.08)
    }
    if (ringsRef.current) {
      ringsRef.current.rotation.y += delta * (0.16 + normalizedActivity * 0.24)
      ringsRef.current.rotation.x = Math.sin(elapsed * 0.28 + motionPhase) * 0.32
      ringsRef.current.rotation.z -= delta * 0.08
    }

    const transitionEnvelope = rawProgress < 1 ? Math.sin(Math.PI * rawProgress) : 0
    const effectStrength = transitionEffect === 'relation' ? 1 : transitionEffect === 'birth' ? 0.76 : transitionEffect === 'focus' ? 0.48 : 0

    if (auraRef.current) {
      const auraPulse = 2.18
        + normalizedActivity * 0.74
        + Math.sin(elapsed * 1.35 + motionPhase) * (0.08 + normalizedActivity * 0.08)
        + transitionEnvelope * effectStrength * 0.92
      auraRef.current.scale.set(auraPulse, auraPulse, 1)
    }

    if (transitionRingARef.current && transitionRingAMaterialRef.current) {
      const ringProgress = THREE.MathUtils.clamp(rawProgress * 1.25, 0, 1)
      transitionRingARef.current.scale.setScalar(0.65 + ringProgress * 1.75)
      transitionRingARef.current.rotation.z += delta * 0.72
      transitionRingAMaterialRef.current.opacity = (1 - ringProgress) * effectStrength * 0.55
    }
    if (transitionRingBRef.current && transitionRingBMaterialRef.current) {
      const ringProgress = THREE.MathUtils.clamp((rawProgress - 0.18) * 1.4, 0, 1)
      transitionRingBRef.current.scale.setScalar(0.7 + ringProgress * 2.05)
      transitionRingBRef.current.rotation.x += delta * 0.46
      transitionRingBMaterialRef.current.opacity = (1 - ringProgress) * effectStrength * 0.34
    }

    const opacity = THREE.MathUtils.lerp(initialOpacity, targetOpacity, entrance)
    const interactionBoost = dropTarget ? 2.35 : active || hovered || pressing || dragging ? 1.35 : 0
    const transitionBoost = transitionEnvelope * effectStrength * 3.2
    if (coreMaterialRef.current) {
      coreMaterialRef.current.opacity = THREE.MathUtils.lerp(coreMaterialRef.current.opacity, opacity, visualSmooth)
      const desiredIntensity = (compact ? 1.55 : 1.8) + normalizedActivity * (compact ? 2.7 : 5.4) + interactionBoost + transitionBoost
      coreMaterialRef.current.emissiveIntensity = THREE.MathUtils.lerp(
        coreMaterialRef.current.emissiveIntensity,
        desiredIntensity,
        visualSmooth,
      )
    }
    if (shellMaterialRef.current) {
      shellMaterialRef.current.opacity = THREE.MathUtils.lerp(
        shellMaterialRef.current.opacity,
        opacity * ((dropTarget ? 0.5 : active || hovered || pressing || dragging ? 0.31 : compact ? 0.13 : 0.17) + normalizedActivity * 0.13 + transitionEnvelope * effectStrength * 0.12),
        visualSmooth,
      )
    }
    if (auraMaterialRef.current) {
      auraMaterialRef.current.opacity = THREE.MathUtils.lerp(
        auraMaterialRef.current.opacity,
        opacity * ((dropTarget ? 0.62 : active || hovered || pressing || dragging ? 0.38 : compact ? 0.13 : 0.19) + normalizedActivity * 0.3 + transitionEnvelope * effectStrength * 0.22),
        visualSmooth,
      )
    }
    if (particleMaterialRef.current) {
      particleMaterialRef.current.opacity = THREE.MathUtils.lerp(
        particleMaterialRef.current.opacity,
        opacity * ((compact ? 0.56 : 0.72) + normalizedActivity * 0.28),
        visualSmooth,
      )
      particleMaterialRef.current.size = THREE.MathUtils.lerp(
        particleMaterialRef.current.size,
        (compact ? 0.027 : 0.025) + normalizedActivity * (compact ? 0.014 : 0.02) + transitionEnvelope * effectStrength * 0.012,
        visualSmooth,
      )
    }
  })

  return (
    <group
      ref={groupRef}
      position={initialPosition}
      scale={initialScale}
      onPointerDown={(event) => {
        if (!onPointerDown) return
        onPointerDown(event)
      }}
      onClick={(event) => {
        event.stopPropagation()
        if (!onClick || !groupRef.current) return
        groupRef.current.getWorldPosition(worldPosition)
        groupRef.current.getWorldScale(worldScale)
        onClick([worldPosition.x, worldPosition.y, worldPosition.z], worldScale.x)
      }}
      onPointerOver={(event) => {
        event.stopPropagation()
        setHovered(true)
        document.body.style.cursor = draggable ? 'grab' : 'pointer'
      }}
      onPointerOut={() => {
        setHovered(false)
        if (!dragging) document.body.style.cursor = 'default'
      }}
    >
      <sprite ref={auraRef} scale={[2.35, 2.35, 1]}>
        <spriteMaterial
          ref={auraMaterialRef}
          map={glowTexture}
          color={color}
          transparent
          opacity={initialOpacity * (0.19 + normalizedActivity * 0.3)}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>

      <mesh>
        <sphereGeometry args={[0.48, compact ? 28 : 64, compact ? 28 : 64]} />
        <meshStandardMaterial
          ref={coreMaterialRef}
          color={color}
          emissive={color}
          emissiveIntensity={(compact ? 1.55 : 1.8) + normalizedActivity * 4.6}
          roughness={0.2}
          metalness={0.1}
          transparent
          opacity={initialOpacity}
        />
      </mesh>

      <mesh ref={shellRef} scale={1.16}>
        <icosahedronGeometry args={[0.5, compact ? 1 : 3]} />
        <meshBasicMaterial
          ref={shellMaterialRef}
          color={color}
          wireframe
          transparent
          opacity={initialOpacity * (0.17 + normalizedActivity * 0.13)}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <points ref={particlesRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[particlePositions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          ref={particleMaterialRef}
          color="#ffffff"
          size={(compact ? 0.027 : 0.025) + normalizedActivity * 0.016}
          transparent
          opacity={initialOpacity * ((compact ? 0.56 : 0.72) + normalizedActivity * 0.28)}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      {energyRingCount > 0 && (
        <group ref={ringsRef}>
          <mesh rotation={[Math.PI / 2.8, 0.2, 0.4]}>
            <torusGeometry args={[0.66, 0.009, 8, 80]} />
            <meshBasicMaterial color={color} transparent opacity={0.16 + normalizedActivity * 0.2} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
          {energyRingCount > 1 && (
            <mesh rotation={[0.25, Math.PI / 2.3, -0.8]}>
              <torusGeometry args={[0.72, 0.007, 8, 80]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.08 + normalizedActivity * 0.15} depthWrite={false} blending={THREE.AdditiveBlending} />
            </mesh>
          )}
          {energyRingCount > 2 && (
            <mesh rotation={[-0.7, 0.42, Math.PI / 2]}>
              <torusGeometry args={[0.79, 0.006, 8, 80]} />
              <meshBasicMaterial color={color} transparent opacity={0.1 + normalizedActivity * 0.14} depthWrite={false} blending={THREE.AdditiveBlending} />
            </mesh>
          )}
        </group>
      )}

      {transitionEffect !== 'none' && (
        <group>
          <mesh ref={transitionRingARef} rotation={[Math.PI / 2.5, 0.15, 0.4]}>
            <torusGeometry args={[0.63, 0.018, 8, 96]} />
            <meshBasicMaterial ref={transitionRingAMaterialRef} color={color} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
          <mesh ref={transitionRingBRef} rotation={[-0.45, Math.PI / 2.2, -0.25]}>
            <torusGeometry args={[0.71, 0.011, 8, 96]} />
            <meshBasicMaterial ref={transitionRingBMaterialRef} color="#ffffff" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
        </group>
      )}

      {(showLabel || hovered || active || pressing || dragging) && targetOpacity > 0.2 && (
        <Html center position={[0, -0.88, 0]} distanceFactor={8.5} style={{ pointerEvents: 'none' }}>
          <div className={`node-label ${active || dragging || dropTarget ? 'node-label--active' : ''}`}>
            <span>{title}</span>
            {dropTarget ? <small>{interactionLabels.dropTarget}</small> : dragging ? <small>{interactionLabels.dragging}</small> : pressing ? <small>{interactionLabels.pressing}</small> : labelDetail && <small>{labelDetail}</small>}
          </div>
        </Html>
      )}
    </group>
  )
}
