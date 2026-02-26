import styles from './DesignSystem.module.css'

export default function StepIndicator({ step, active }: { step: number; active: boolean }) {
  return <span className={`${styles.badge} ${active ? styles.badgeActive : ''}`}>{step}</span>
}
