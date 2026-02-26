import { ButtonHTMLAttributes } from 'react'
import styles from './DesignSystem.module.css'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary'
}

export default function DesignButton({ variant = 'default', className = '', ...props }: Props) {
  const variantClass = variant === 'primary' ? styles.buttonPrimary : styles.button
  return <button {...props} className={`${variantClass} ${className}`.trim()} />
}
