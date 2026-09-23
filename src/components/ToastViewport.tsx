import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { TOAST_EVENT, toast } from '../lib/toast'
import type { ToastNotification } from '../lib/toast'
import Toast from './Toast'
import styles from './Toast.module.css'

const MAX_VISIBLE_TOASTS = 4

export default function ToastViewport() {
  const [notifications, setNotifications] = useState<ToastNotification[]>([])

  useEffect(() => {
    const handleToast = (event: Event) => {
      const notification = (event as CustomEvent<ToastNotification>).detail
      setNotifications(current => [...current, notification].slice(-MAX_VISIBLE_TOASTS))
    }

    window.addEventListener(TOAST_EVENT, handleToast)
    const handleUnhandledError = (event: ErrorEvent) => {
      const message = event.error instanceof Error ? event.error.message : event.message
      if (message) toast.error(message, 'Ocorreu um erro inesperado.')
    }
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const message = event.reason instanceof Error ? event.reason.message : event.reason
      if (message) toast.error(message, 'Ocorreu um erro inesperado.')
    }

    window.addEventListener('error', handleUnhandledError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    return () => {
      window.removeEventListener(TOAST_EVENT, handleToast)
      window.removeEventListener('error', handleUnhandledError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])

  const closeToast = (id: number) => {
    setNotifications(current => current.filter(notification => notification.id !== id))
  }

  if (notifications.length === 0) return null

  return createPortal(
    <div className={styles.viewport} aria-label="Notificações">
      {notifications.map(notification => (
        <Toast
          key={notification.id}
          type={notification.type}
          message={notification.message}
          duration={notification.duration}
          onClose={() => closeToast(notification.id)}
        />
      ))}
    </div>,
    document.body,
  )
}
