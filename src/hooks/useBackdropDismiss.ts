import { useRef } from 'react'
import type { MouseEvent, PointerEvent } from 'react'

export function useBackdropDismiss(onClose: () => void, disabled = false) {
  const pointerStartedOnBackdropRef = useRef(false)

  const handleBackdropPointerDown = (event: PointerEvent<HTMLElement>) => {
    pointerStartedOnBackdropRef.current = event.target === event.currentTarget
  }

  const handleBackdropClick = (event: MouseEvent<HTMLElement>) => {
    const clickedBackdrop = event.target === event.currentTarget
    const shouldClose = !disabled && clickedBackdrop && pointerStartedOnBackdropRef.current

    pointerStartedOnBackdropRef.current = false

    if (shouldClose) {
      onClose()
    }
  }

  return {
    handleBackdropPointerDown,
    handleBackdropClick,
  }
}
