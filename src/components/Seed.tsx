import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

export default function Seed() {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;

    const t = clock.getElapsedTime();

    // 上下漂浮
    meshRef.current.position.y = Math.sin(t) * 0.2;

    // 缓慢旋转
    meshRef.current.rotation.y += 0.003;
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.5, 64, 64]} />

      <meshStandardMaterial
        color="#A855F7"
        emissive="#7B2CBF"
        emissiveIntensity={3}
      />
    </mesh>
  );
}