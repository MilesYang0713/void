import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

interface DustLayerProps {
  count: number
  radiusMin: number
  radiusMax: number
  size: number
  opacity: number
  speed: number
}

function DustLayer({ count, radiusMin, radiusMax, size, opacity, speed }: DustLayerProps) {
  const pointsRef = useRef<THREE.Points>(null)
  const { positions, colors } = useMemo(() => {
    const positionValues = new Float32Array(count * 3)
    const colorValues = new Float32Array(count * 3)
    const purple = new THREE.Color('#c4b5fd')
    const blue = new THREE.Color('#7dd3fc')

    for (let index = 0; index < count; index += 1) {
      const radius = radiusMin + Math.random() * (radiusMax - radiusMin)
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      positionValues[index * 3] = radius * Math.sin(phi) * Math.cos(theta)
      positionValues[index * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta)
      positionValues[index * 3 + 2] = radius * Math.cos(phi)

      const color = purple.clone().lerp(blue, Math.random() * 0.72)
      colorValues[index * 3] = color.r
      colorValues[index * 3 + 1] = color.g
      colorValues[index * 3 + 2] = color.b
    }

    return { positions: positionValues, colors: colorValues }
  }, [count, radiusMax, radiusMin])

  useFrame((_, delta) => {
    if (!pointsRef.current) return
    pointsRef.current.rotation.y += delta * speed
    pointsRef.current.rotation.x += delta * speed * 0.28
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        vertexColors
        size={size}
        transparent
        opacity={opacity}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

export default function AmbientDust() {
  return (
    <>
      <DustLayer count={760} radiusMin={4} radiusMax={12} size={0.018} opacity={0.32} speed={0.006} />
      <DustLayer count={340} radiusMin={9} radiusMax={19} size={0.032} opacity={0.18} speed={-0.0028} />
    </>
  )
}
