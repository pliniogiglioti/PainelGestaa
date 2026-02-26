import { InputHTMLAttributes } from 'react'
import styles from './DesignSystem.module.css'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string
}

export default function DesignInput({ label, className = '', ...props }: Props) {
  return (
    <div className={styles.inputWrap}>
      <label>{label}</label>
      <input {...props} className={`${styles.input} ${className}`.trim()} />
    </div>
  )
}
