import { useState, useEffect } from 'react';
import type { OwnerV8Model, OwnerSettings } from '../components/vendas/types';
import {
  loadOwnerV8Model,
  saveOwnerV8Model,
  applyOwnerV8Model,
} from '../components/vendas/ownerModel';
import { SellerWorld } from '../components/vendas/SellerWorld';
import { OwnerWizard } from '../components/vendas/OwnerWizard';
import styles from '../components/vendas/Vendas.module.css';

interface VendasPageProps {
  onVoltar: () => void;
}

export default function VendasPage({ onVoltar }: VendasPageProps) {
  const [ownerModel, setOwnerModel] = useState<OwnerV8Model>(() => loadOwnerV8Model());
  const [ownerSettings, setOwnerSettings] = useState<OwnerSettings>(() => applyOwnerV8Model(loadOwnerV8Model()));
  const [wizardOpen, setWizardOpen] = useState(false);

  useEffect(() => {
    if (!ownerModel.completed) {
      setWizardOpen(true);
    }
  }, []);

  function handleSaveWizard(model: OwnerV8Model) {
    saveOwnerV8Model(model);
    const settings = applyOwnerV8Model(model);
    setOwnerModel(model);
    setOwnerSettings(settings);
    setWizardOpen(false);
  }

  return (
    <div className={styles.vendasRoot}>
      {/* Back button */}
      <button
        onClick={onVoltar}
        style={{
          position: 'fixed',
          top: 16,
          left: 16,
          zIndex: 30,
          padding: '6px 14px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          color: 'var(--text-muted)',
          fontSize: 13,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        ← Voltar
      </button>

      <SellerWorld
        ownerSettings={ownerSettings}
        onOpenOwnerWizard={() => setWizardOpen(true)}
      />

      {wizardOpen && (
        <OwnerWizard
          model={ownerModel}
          onSave={handleSaveWizard}
          onClose={() => setWizardOpen(false)}
        />
      )}
    </div>
  );
}
