import { Stars } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

function createNebulaTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const context = canvas.getContext('2d')

  if (context) {
    context.clearRect(0, 0, 512, 512)
    const gradient = context.createRadialGradient(256, 256, 4, 256, 256, 250)
    gradient.addColorStop(0, 'rgba(255,255,255,0.72)')
    gradient.addColorStop(0.18, 'rgba(255,255,255,0.28)')
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.08)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, 512, 512)

    context.globalCompositeOperation = 'destination-out'
    for (let index = 0; index < 36; index += 1) {
      const x = 100 + Math.random() * 312
      const y = 100 + Math.random() * 312
      const radius = 18 + Math.random() * 62
      const cut = context.createRadialGradient(x, y, 0, x, y, radius)
      cut.addColorStop(0, 'rgba(0,0,0,0.34)')
      cut.addColorStop(1, 'rgba(0,0,0,0)')
      context.fillStyle = cut
      context.fillRect(0, 0, 512, 512)
    }
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function NebulaClouds() {
  const groupRef = useRef<THREE.Group>(null)
  const texture = useMemo(() => createNebulaTexture(), [])

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const elapsed = clock.getElapsedTime()
    groupRef.current.rotation.z = Math.sin(elapsed * 0.025) * 0.045
    groupRef.current.rotation.y = Math.cos(elapsed * 0.018) * 0.025
  })

  return (
    <group ref={groupRef}>
      <sprite position={[-7.5, 3.4, -18]} scale={[16, 10, 1]}>
        <spriteMaterial
          map={texture}
          color="#7c3aed"
          transparent
          opacity={0.105}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          rotation={0.38}
        />
      </sprite>
      <sprite position={[7.2, -3.2, -20]} scale={[18, 11, 1]}>
        <spriteMaterial
          map={texture}
          color="#1d4ed8"
          transparent
          opacity={0.08}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          rotation={-0.52}
        />
      </sprite>
      <sprite position={[1.5, 6.2, -24]} scale={[22, 12, 1]}>
        <spriteMaterial
          map={texture}
          color="#c026d3"
          transparent
          opacity={0.055}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          rotation={1.1}
        />
      </sprite>
    </group>
  )
}

function GalaxyBand() {
  const pointsRef = useRef<THREE.Points>(null)
  const { positions, colors } = useMemo(() => {
    const count = 1600
    const positionValues = new Float32Array(count * 3)
    const colorValues = new Float32Array(count * 3)
    const colorA = new THREE.Color('#8b5cf6')
    const colorB = new THREE.Color('#38bdf8')
    const colorC = new THREE.Color('#f0abfc')

    for (let index = 0; index < count; index += 1) {
      const arm = index % 3
      const radius = 2.5 + Math.pow(Math.random(), 0.72) * 13
      const angle = radius * 0.62 + arm * (Math.PI * 2 / 3) + (Math.random() - 0.5) * 0.75
      const spread = (Math.random() - 0.5) * (0.28 + radius * 0.045)

      positionValues[index * 3] = Math.cos(angle) * radius
      positionValues[index * 3 + 1] = spread * 1.7
      positionValues[index * 3 + 2] = Math.sin(angle) * radius - 12

      const mixed = colorA.clone().lerp(colorB, Math.random())
      mixed.lerp(colorC, Math.random() * 0.28)
      colorValues[index * 3] = mixed.r
      colorValues[index * 3 + 1] = mixed.g
      colorValues[index * 3 + 2] = mixed.b
    }

    return { positions: positionValues, colors: colorValues }
  }, [])

  useFrame((_, delta) => {
    if (!pointsRef.current) return
    pointsRef.current.rotation.y += delta * 0.0022
    pointsRef.current.rotation.z += delta * 0.0007
  })

  return (
    <points ref={pointsRef} rotation={[0.42, 0.2, -0.24]}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        vertexColors
        size={0.032}
        transparent
        opacity={0.42}
        depthWrite={false}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

export default function CosmicBackdrop() {
  return (
    <>
      <Stars radius={95} depth={55} count={4400} factor={2.05} saturation={0.18} fade speed={0.18} />
      <Stars radius={42} depth={24} count={850} factor={4.4} saturation={0.35} fade speed={0.42} />
      <NebulaClouds />
      <GalaxyBand />
    </>
  )
}
