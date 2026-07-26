import { OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'

interface CameraRigProps {
  focused: boolean
  enabled?: boolean
  returningToVoid?: boolean
}

export default function CameraRig({ focused, enabled = true, returningToVoid = false }: CameraRigProps) {
  const controlsRef = useRef<any>(null)
  const { camera } = useThree()
  const lookTarget = useRef(new THREE.Vector3())
  const desiredPosition = useRef(new THREE.Vector3())

  useFrame((_, delta) => {
    const controls = controlsRef.current
    if (!controls) return

    const targetSmooth = 1 - Math.pow(returningToVoid ? 0.035 : 0.0015, delta)
    const cameraSmooth = 1 - Math.pow(returningToVoid ? 0.08 : 0.006, delta)

    lookTarget.current.set(0, 0, 0)
    controls.target.lerp(lookTarget.current, targetSmooth)

    if (enabled) {
      const direction = camera.position.clone().sub(controls.target).normalize()
      const desiredDistance = focused ? 5.1 : 8.2
      desiredPosition.current.copy(direction).multiplyScalar(desiredDistance).add(controls.target)
      camera.position.lerp(desiredPosition.current, cameraSmooth)
    }

    controls.update()
  })

  return (
    <OrbitControls
      ref={controlsRef}
      enabled={enabled}
      enablePan={false}
      enableDamping
      dampingFactor={returningToVoid ? 0.045 : 0.065}
      rotateSpeed={0.42}
      zoomSpeed={0.55}
      minDistance={3.8}
      maxDistance={12.5}
    />
  )
}
