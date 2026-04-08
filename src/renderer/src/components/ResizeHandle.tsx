import { useState, useCallback, useEffect } from 'react'

interface ResizeHandleProps {
  side: 'left' | 'right'
  onResize: (delta: number) => void
}

export function ResizeHandle({ side, onResize }: ResizeHandleProps): React.JSX.Element {
  const [isDragging, setIsDragging] = useState(false)
  const [startX, setStartX] = useState(0)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true)
    setStartX(e.clientX)
    e.preventDefault()
  }, [])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent): void => {
      const delta = side === 'right' ? e.clientX - startX : startX - e.clientX
      setStartX(e.clientX)
      onResize(delta)
    }

    const handleMouseUp = (): void => setIsDragging(false)

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, startX, side, onResize])

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`w-1 flex-shrink-0 cursor-col-resize hover:bg-electric-cyan/20 active:bg-electric-cyan/30 transition-colors ${
        isDragging ? 'bg-electric-cyan/30' : ''
      }`}
    />
  )
}
