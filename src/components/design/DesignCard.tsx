import { ReactNode } from 'react'
import styles from './DesignSystem.module.css'

export default function DesignCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`${styles.card} ${className}`.trim()}>{children}</section>
}
