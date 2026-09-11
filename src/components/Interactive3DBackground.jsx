import { useRef, useState, useCallback, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid, Stars } from '@react-three/drei'
import ParticleSystem from './ParticleSystem.jsx'

export default function Interactive3DBackground({ children }) {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const containerRef = useRef(null)

  const handleMouseMove = useCallback((e) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 2
    const y = (e.clientY / window.innerHeight - 0.5) * 2
    setMousePos({ x, y })
  }, [])

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [handleMouseMove])

  const style = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    zIndex: 0,
    pointerEvents: 'none',
    transform: `perspective(1000px) rotateX(${mousePos.y * 3}deg) rotateY(${mousePos.x * 3}deg)`,
    transition: 'transform 0.1s ease-out',
  }

  return (
    <>
      <div ref={containerRef} style={style}>
        <Canvas
          camera={{ position: [0, 0, 8], fov: 60 }}
          gl={{ alpha: true, antialias: true }}
          style={{ background: 'transparent' }}
        >
          <fog attach="fog" color="#ffffff" near={15} far={40} />
          <ambientLight intensity={0.4} />
          <directionalLight position={[10, 10, 5]} intensity={0.3} />
          <pointLight position={[-5, 5, 5]} intensity={0.2} color="#e65100" />
          <Grid
            args={[20, 20]}
            position={[0, -3, 0]}
            cellSize={0.5}
            cellThickness={0.5}
            cellColor="#e65100"
            sectionSize={2}
            sectionThickness={1}
            sectionColor="#e65100"
            fadeDistance={15}
            fadeStrength={1}
            followCamera={false}
            infiniteGrid={false}
            opacity={0.15}
          />
          <Stars
            radius={30}
            depth={60}
            count={200}
            factor={4}
            saturation={0}
            fade={true}
            speed={0.5}
          />
          <ParticleSystem count={300} speed={0.3} />
          <OrbitControls
            enableZoom={false}
            enablePan={false}
            enableDamping={true}
            dampingFactor={0.05}
            autoRotate={true}
            autoRotateSpeed={0.3}
            maxPolarAngle={Math.PI / 2.2}
            minPolarAngle={Math.PI / 3}
          />
        </Canvas>
      </div>
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
    </>
  )
}
