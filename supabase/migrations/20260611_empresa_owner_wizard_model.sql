-- Guarda o modelo completo do assistente de configuração (OwnerWizard) por empresa
ALTER TABLE public.empresa_precificacao_config
  ADD COLUMN IF NOT EXISTS owner_wizard_model JSONB;
