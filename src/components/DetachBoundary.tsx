import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Language } from '../i18n'
import { UI_TEXT } from '../i18n'

interface DetachBoundaryProps {
  radius: number
  color: string
  progress: number
  ready: boolean
  language: Language
}

export default function DetachBoundary({ radius, color, progress, ready, language }: DetachBoundaryProps) {
  const copy = UI_TEXT[language]
  const ringRef = useRef<THREE.Mesh>(null)
  const innerRingRef = useRef<THREE.Mesh>(null)
  const ringMaterialRef = useRef<THREE.MeshBasicMaterial>(null)
  const innerMaterialRef = useRef<THREE.MeshBasicMaterial>(null)
  const discMaterialRef = useRef<THREE.MeshBasicMaterial>(null)
  const rippleRefs = useRef<Array<THREE.Mesh | null>>([])
  const rippleMaterialRefs = useRef<Array<THREE.MeshBasicMaterial | null>>([])
  const clamped = THREE.MathUtils.clamp(progress, 0, 1)
  const readyColor = useMemo(() => new THREE.Color('#f5d0fe'), [])
  const baseColor = useMemo(() => new THREE.Color(color), [color])
  const mixedColor = useMemo(() => baseColor.clone(), [baseColor])

  useFrame(({ clock }, delta) => {
    const elapsed = clock.getElapsedTime()
    mixedColor.copy(baseColor).lerp(readyColor, ready ? 0.72 : clamped * 0.3)

    if (ringRef.current) {
      ringRef.current.rotation.z += delta * (ready ? 0.24 : 0.075)
      const pulse = 1 + Math.sin(elapsed * (ready ? 4.8 : 2.1)) * (ready ? 0.018 : 0.006)
      ringRef.current.scale.setScalar(pulse)
    }
    if (innerRingRef.current) {
      innerRingRef.current.rotation.z -= delta * (ready ? 0.18 : 0.055)
    }
    if (ringMaterialRef.current) {
      ringMaterialRef.current.color.copy(mixedColor)
      ringMaterialRef.current.opacity = 0.12 + clamped * 0.34 + (ready ? 0.22 : 0)
    }
    if (innerMaterialRef.current) {
      innerMaterialRef.current.color.copy(mixedColor)
      innerMaterialRef.current.opacity = 0.055 + clamped * 0.18 + (ready ? 0.1 : 0)
    }
    if (discMaterialRef.current) {
      discMaterialRef.current.color.copy(mixedColor)
      discMaterialRef.current.opacity = 0.008 + clamped * 0.024 + (ready ? 0.022 : 0)
    }

    rippleRefs.current.forEach((mesh, index) => {
      const material = rippleMaterialRefs.current[index]
      if (!mesh || !material) return
      const phase = (elapsed * (ready ? 0.72 : 0.4) + index / rippleRefs.current.length) % 1
      const scale = 0.7 + phase * 0.31
      mesh.scale.setScalar(scale)
      material.color.copy(mixedColor)
      material.opacity = (1 - phase) * (0.04 + clamped * 0.16 + (ready ? 0.1 : 0))
    })
  })

  return (
    <group position={[0, 0, -0.18]}>
      <mesh>
        <circleGeometry args={[radius, 128]} />
        <meshBasicMaterial
          ref={discMaterialRef}
          color={color}
          transparent
          opacity={0.01}
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <mesh ref={ringRef}>
        <torusGeometry args={[radius, ready ? 0.038 : 0.024, 10, 180]} />
        <meshBasicMaterial
          ref={ringMaterialRef}
          color={color}
          transparent
          opacity={0.14}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <mesh ref={innerRingRef}>
        <torusGeometry args={[radius * 0.87, 0.012, 8, 160]} />
        <meshBasicMaterial
          ref={innerMaterialRef}
          color={color}
          transparent
          opacity={0.07}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {[0, 1, 2, 3].map((index) => (
        <mesh
          key={index}
          ref={(mesh) => {
            rippleRefs.current[index] = mesh
          }}
        >
          <torusGeometry args={[radius, 0.009, 8, 160]} />
          <meshBasicMaterial
            ref={(material) => {
              rippleMaterialRefs.current[index] = material
            }}
            color={color}
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}

      <Html center position={[0, -radius - 0.34, 0]} distanceFactor={8.2} style={{ pointerEvents: 'none' }}>
        <div className={`detach-boundary-label ${ready ? 'detach-boundary-label--ready' : ''}`}>
          <span className="detach-boundary-label__wave" />
          <strong>{ready ? copy.detachBoundaryReady : copy.detachBoundary}</strong>
          <small>{ready ? copy.detachBoundaryReadyHint : copy.detachBoundaryHint}</small>
        </div>
      </Html>
    </group>
  )
}
