import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Points, PointMaterial } from '@react-three/drei'
import * as THREE from 'three'

export default function ParticleSystem({ count = 500, speed = 0.3 }) {
  const pointsRef = useRef()

  const particles = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const sizes = new Float32Array(count)

    for (let i = 0; i < count; i++) {
      const r = 5 + Math.random() * 15
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      positions[i * 3 + 2] = r * Math.cos(phi)

      const brightness = 0.3 + Math.random() * 0.7
      colors[i * 3] = 0.9 * brightness
      colors[i * 3 + 1] = 0.32 * brightness
      colors[i * 3 + 2] = 0 * brightness

      sizes[i] = Math.random() * 3 + 0.5
    }

    return { positions, colors, sizes }
  }, [count])

  useFrame((state, delta) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y += delta * speed * 0.15
      pointsRef.current.rotation.x += delta * speed * 0.05
      pointsRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.2) * 0.5
    }
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={particles.positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={count}
          array={particles.colors}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-size"
          count={count}
          array={particles.sizes}
          itemSize={1}
        />
      </bufferGeometry>
      <pointMaterial
        vertexColors
        size={0.08}
        sizeAttenuation
        transparent
        opacity={0.6}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  )
}
