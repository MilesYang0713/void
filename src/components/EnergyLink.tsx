import { Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Vec3 } from '../types'

interface EnergyLinkProps {
  start?: Vec3
  end: Vec3
  color: string
  delay?: number
  opacity?: number
  lineWidth?: number
  sparkScale?: number
}

export default function EnergyLink({
  start = [0, 0, 0],
  end,
  color,
  delay = 0,
  opacity = 0.34,
  lineWidth = 0.8,
  sparkScale = 1,
}: EnergyLinkProps) {
  const sparkRef = useRef<THREE.Mesh>(null)
  const origin = useMemo(() => new THREE.Vector3(...start), [start])
  const finish = useMemo(() => new THREE.Vector3(...end), [end])

  useFrame(({ clock }) => {
    if (!sparkRef.current) return
    const elapsed = Math.max(0, clock.getElapsedTime() - delay)
    const progress = (elapsed * 0.24) % 1
    sparkRef.current.position.lerpVectors(origin, finish, progress)
    const pulse = (0.045 + Math.sin(elapsed * 7) * 0.012) * sparkScale
    sparkRef.current.scale.setScalar(pulse)
  })

  return (
    <group>
      <Line
        points={[origin, finish]}
        color={color}
        lineWidth={lineWidth}
        transparent
        opacity={opacity}
        depthWrite={false}
      />
      <mesh ref={sparkRef}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={Math.min(0.9, opacity * 2.4)}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  )
}
