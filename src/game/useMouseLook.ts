import { useCallback, useEffect, useRef } from 'react'

/**
 * Accumulates raw mouse movement (in pixels) while the pointer is locked.
 * Returns a function that hands back the movement since its last call and resets it;
 * positive x is right, positive y is down.
 */
export function useMouseLook() {
  const delta = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!document.pointerLockElement) return
      delta.current.x += e.movementX
      delta.current.y += e.movementY
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  return useCallback(() => {
    const { x, y } = delta.current
    delta.current = { x: 0, y: 0 }
    return { x, y }
  }, [])
}
