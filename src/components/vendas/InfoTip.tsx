import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './Vendas.module.css';

// Ícone "(i)" com tooltip explicativo, para uso em rótulos de campos complexos.
// O texto é renderizado via portal em document.body para não ficar preso
// (cortado) por containers com overflow: hidden/auto, como os cards de plano.
export function InfoTip({ text }: { text: string }) {
  const [coords, setCoords] = useState<{ left: number; bottom: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  const show = () => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setCoords({ left: Math.max(8, rect.right - 230), bottom: window.innerHeight - rect.top + 8 });
  };
  const hide = () => setCoords(null);

  return (
    <span ref={ref} className={styles.ownerInfoTip} tabIndex={0}
      onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      <span className={styles.ownerInfoIcon} aria-hidden="true">i</span>
      {coords && createPortal(
        <span className={styles.ownerInfoTooltip} role="tooltip"
          style={{ left: coords.left, bottom: coords.bottom }}>
          {text}
        </span>,
        document.body
      )}
    </span>
  );
}
