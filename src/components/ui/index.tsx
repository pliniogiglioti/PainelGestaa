import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { useBackdropDismiss } from '../../hooks/useBackdropDismiss'
import styles from './ui.module.css'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

type ButtonVariant = 'secondary' | 'primary' | 'danger' | 'ghost'
type ControlSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ControlSize
}

export function Button({
  className,
  variant = 'secondary',
  size = 'md',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={cx(
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'danger' && styles.buttonDanger,
        variant === 'ghost' && styles.buttonGhost,
        size === 'sm' && styles.buttonSm,
        size === 'lg' && styles.buttonLg,
        className,
      )}
    />
  )
}

interface IconButtonProps extends ButtonProps {
  label: string
}

export function IconButton({ label, className, size = 'md', ...props }: IconButtonProps) {
  return (
    <Button
      {...props}
      size={size}
      className={cx(
        styles.iconButton,
        size === 'sm' && styles.iconButtonSm,
        size === 'lg' && styles.iconButtonLg,
        className,
      )}
      aria-label={label}
      title={props.title ?? label}
    />
  )
}

interface FieldProps extends LabelHTMLAttributes<HTMLLabelElement> {
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
}

export function Field({ label, hint, error, children, className, ...props }: FieldProps) {
  return (
    <label {...props} className={cx(styles.field, className)}>
      {label && <span className={styles.label}>{label}</span>}
      {children}
      {error ? <span className={cx(styles.hint, styles.error)}>{error}</span> : null}
      {!error && hint ? <span className={styles.hint}>{hint}</span> : null}
    </label>
  )
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(styles.control, className)} />
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(styles.control, styles.select, className)} />
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(styles.control, styles.textarea, className)} />
}

type BadgeTone = 'neutral' | 'gold' | 'success' | 'warning' | 'danger'

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: BadgeTone
  className?: string
}) {
  return (
    <span
      className={cx(
        styles.badge,
        tone === 'gold' && styles.badgeGold,
        tone === 'success' && styles.badgeSuccess,
        tone === 'warning' && styles.badgeWarning,
        tone === 'danger' && styles.badgeDanger,
        className,
      )}
    >
      {children}
    </span>
  )
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: Array<{ value: T; label: ReactNode }>
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div className={cx(styles.tabs, className)} role="tablist">
      {tabs.map(tab => (
        <button
          key={tab.value}
          type="button"
          className={cx(styles.tab, value === tab.value && styles.tabActive)}
          role="tab"
          aria-selected={value === tab.value}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cx(styles.emptyState, className)}>
      {icon && <div className={styles.emptyIcon}>{icon}</div>}
      <h3 className={styles.emptyTitle}>{title}</h3>
      {description && <p className={styles.emptyDescription}>{description}</p>}
      {action}
    </div>
  )
}

export function Modal({
  title,
  onClose,
  children,
  wide = false,
  className,
  bodyClassName,
}: {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  wide?: boolean
  className?: string
  bodyClassName?: string
}) {
  const backdropDismiss = useBackdropDismiss(onClose)

  return (
    <div
      className={styles.overlay}
      onPointerDown={backdropDismiss.handleBackdropPointerDown}
      onClick={backdropDismiss.handleBackdropClick}
      >
        <div className={cx(styles.modal, wide && styles.modalWide, className)} onClick={event => event.stopPropagation()}>
          <div className={styles.modalHeader}>
            <h2 className={styles.modalTitle}>{title}</h2>
            <IconButton label="Fechar" variant="ghost" size="sm" onClick={onClose}>
              x
            </IconButton>
          </div>
          <div className={cx(styles.modalBody, bodyClassName)}>{children}</div>
        </div>
      </div>
  )
}
