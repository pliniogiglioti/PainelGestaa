import { useEffect, useRef, useState } from 'react'

const EXIT_MS = 200

export default function ModalTransition({
  open,
  children,
}: {
  open: boolean
  children: React.ReactNode
}) {
  const [rendered, setRendered] = useState(open)
  const [closing, setClosing]   = useState(false)
  const openRef = useRef(open)

  useEffect(() => {
    if (open === openRef.current) return
    openRef.current = open

    if (open) {
      setClosing(false)
      setRendered(true)
    } else {
      setClosing(true)
      const t = setTimeout(() => {
        setRendered(false)
        setClosing(false)
      }, EXIT_MS)
      return () => clearTimeout(t)
    }
  }, [open])

  if (!rendered) return null

  return (
    <div data-modal-closing={closing || undefined} style={{ display: 'contents' }}>
      {children}
    </div>
  )
}
