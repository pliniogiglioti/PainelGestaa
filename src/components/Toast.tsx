import { useEffect, useRef } from 'react'
import styles from './Toast.module.css'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

interface ToastProps {
  message: string
  type?: ToastType
  duration?: number
  onClose: () => void
}

const TITLES: Record<ToastType, string> = {
  success: 'Sucesso',
  error: 'Erro',
  warning: 'Atenção',
  info: 'Informação',
}

export default function Toast({ message, type = 'info', duration = 4500, onClose }: ToastProps) {
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const timeout = window.setTimeout(() => onCloseRef.current(), duration)
    return () => window.clearTimeout(timeout)
  }, [duration, message])

  return (
    <div className={`${styles.toast} ${styles[type]}`} role={type === 'error' ? 'alert' : 'status'} aria-live="polite">
      <span className={styles.icon} aria-hidden="true">
        {type === 'success' ? '✓' : type === 'error' ? '!' : type === 'warning' ? '!' : 'i'}
      </span>
      <div className={styles.content}>
        <strong>{TITLES[type]}</strong>
        <span>{message}</span>
      </div>
      <button type="button" className={styles.close} onClick={onClose} aria-label="Fechar notificação">×</button>
      <span className={styles.progress} style={{ animationDuration: `${duration}ms` }} aria-hidden="true" />
    </div>
  )
}
