import { useRef, useState, useCallback, useEffect } from 'react'

export default function TiltCard({
  children,
  tiltMax = 15,
  scale = 1.03,
  duration = 0.1,
  perspective = 1000,
  className = '',
  style = {},
  onTiltChange,
}) {
  const containerRef = useRef(null)
  const [tilt, setTilt] = useState({ x: 0, y: 0, z: 0 })
  const [isHovered, setIsHovered] = useState(false)
  const rafRef = useRef(null)

  const handleMouseMove = useCallback(
    (e) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        const rect = containerRef.current?.getBoundingClientRect()
        if (!rect) return

        const width = rect.width
        const height = rect.height
        const left = rect.left
        const top = rect.top

        const mouseX = e.clientX - left
        const mouseY = e.clientY - top

        const percentX = (mouseX / width - 0.5) * 2
        const percentY = (mouseY / height - 0.5) * 2

        const tiltX = percentY * tiltMax
        const tiltY = -percentX * tiltMax
        const tiltZ = percentX * 2

        setTilt({ x: tiltX, y: tiltY, z: tiltZ })

        if (onTiltChange) {
          onTiltChange({ x: tiltX, y: tiltY, z: tiltZ })
        }
      })
    },
    [tiltMax, onTiltChange]
  )

  const handleMouseLeave = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    setIsHovered(false)
    setTilt({ x: 0, y: 0, z: 0 })
    if (onTiltChange) onTiltChange({ x: 0, y: 0, z: 0 })
  }, [onTiltChange])

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    el.addEventListener('mousemove', handleMouseMove)
    el.addEventListener('mouseleave', handleMouseLeave)
    el.addEventListener('mouseenter', handleMouseEnter)

    return () => {
      el.removeEventListener('mousemove', handleMouseMove)
      el.removeEventListener('mouseleave', handleMouseLeave)
      el.removeEventListener('mouseenter', handleMouseEnter)
    }
  }, [handleMouseMove, handleMouseLeave, handleMouseEnter])

  const transformStyle = {
    transform: `perspective(${perspective}px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) rotateZ(${tilt.z}deg) ${isHovered ? `scale(${scale})` : 'scale(1)'}`,
    transition: isHovered
      ? `${duration}s ease-out`
      : '0.5s cubic-bezier(0.23, 1, 0.32, 1)',
    transformStyle: 'preserve-3d',
    willChange: 'transform',
  }

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ ...transformStyle, ...style }}
    >
      {children}
    </div>
  )
}
