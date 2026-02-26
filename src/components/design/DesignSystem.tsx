import { ReactNode } from 'react'
import styles from './DesignSystem.module.css'

type ButtonVariant = 'ghost' | 'primary' | 'pill'

interface DesignButtonProps {
  children: ReactNode
  onClick?: () => void
  variant?: ButtonVariant
  active?: boolean
  title?: string
  className?: string
  type?: 'button' | 'submit' | 'reset'
}

export function DesignButton({
  children,
  onClick,
  variant = 'ghost',
  active = false,
  title,
  className = '',
  type = 'button',
}: DesignButtonProps) {
  const variantClass = variant === 'primary'
    ? styles.buttonPrimary
    : variant === 'pill'
      ? styles.buttonPill
      : styles.buttonGhost

  return (
    <button
      className={`${styles.buttonBase} ${variantClass} ${active ? styles.buttonActive : ''} ${className}`}
      onClick={onClick}
      title={title}
      type={type}
    >
      {children}
    </button>
  )
}

interface DesignIconButtonProps {
  children: ReactNode
  onClick: () => void
  title: string
  className?: string
}

export function DesignIconButton({ children, onClick, title, className = '' }: DesignIconButtonProps) {
  return (
    <button type="button" className={`${styles.iconButton} ${className}`} onClick={onClick} title={title}>
      {children}
    </button>
  )
}

export function DesignCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`${styles.card} ${className}`}>{children}</section>
}

export function DesignBadge({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`${styles.badge} ${className}`}>{children}</span>
}

export function SectionTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h3 className={`${styles.sectionTitle} ${className}`}>{children}</h3>
}
