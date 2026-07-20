import { Canvas } from "@react-three/fiber";
import Seed from "./Seed";

export default function Universe() {
  return (
    <Canvas
      camera={{
        position: [0, 0, 5],
        fov: 60,
      }}
    >
      {/* 环境光 */}
      <ambientLight intensity={1.2} />

      {/* 点光源 */}
      <pointLight position={[5, 5, 5]} intensity={20} />

      <Seed />
    </Canvas>
  );
}