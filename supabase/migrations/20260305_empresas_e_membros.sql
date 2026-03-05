-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Empresas e membros
--
-- Cria as tabelas:
--   • empresas        — cadastro de empresas (multi-tenant)
--   • empresa_membros — relação N:N entre usuários e empresas
--
-- Regras de acesso (RLS):
--   • Usuário só enxerga empresas das quais é membro
--   • Usuário pode criar empresa (vira admin automaticamente via trigger)
--   • Admin do sistema (profiles.role = 'admin') enxerga tudo
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. TABELA: empresas ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.empresas (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        TEXT        NOT NULL,
  cnpj        TEXT        DEFAULT NULL,
  logo_url    TEXT        DEFAULT NULL,
  created_by  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  ativo       BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.empresas IS
  'Cadastro de empresas. Cada usuário pode pertencer a uma ou mais empresas.';

CREATE INDEX IF NOT EXISTS idx_empresas_created_by
  ON public.empresas (created_by);

ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;

-- Membros enxergam a empresa
CREATE POLICY "Membro enxerga empresa"
  ON public.empresas FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.empresa_membros em
      WHERE em.empresa_id = id
        AND em.user_id    = auth.uid()
    )
  );

-- Qualquer usuário autenticado pode criar uma empresa
CREATE POLICY "Usuario cria empresa"
  ON public.empresas FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Admin da empresa (role = 'admin' em empresa_membros) pode atualizar
CREATE POLICY "Admin empresa pode atualizar"
  ON public.empresas FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.empresa_membros em
      WHERE em.empresa_id = id
        AND em.user_id    = auth.uid()
        AND em.role       = 'admin'
    )
  );

-- Admin do sistema vê tudo
CREATE POLICY "Admin sistema enxerga todas empresas"
  ON public.empresas FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id   = auth.uid()
        AND p.role = 'admin'
    )
  );


-- ── 2. TABELA: empresa_membros ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.empresa_membros (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID        NOT NULL REFERENCES public.empresas(id)  ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id)        ON DELETE CASCADE,
  role        TEXT        NOT NULL DEFAULT 'admin'
                          CHECK (role IN ('admin', 'membro')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (empresa_id, user_id)
);

COMMENT ON TABLE public.empresa_membros IS
  'Relação N:N entre usuários e empresas. role: admin = dono/gestor, membro = acesso leitura.';

CREATE INDEX IF NOT EXISTS idx_empresa_membros_user_id
  ON public.empresa_membros (user_id);

CREATE INDEX IF NOT EXISTS idx_empresa_membros_empresa_id
  ON public.empresa_membros (empresa_id);

ALTER TABLE public.empresa_membros ENABLE ROW LEVEL SECURITY;

-- Usuário vê seus próprios vínculos
CREATE POLICY "Usuario ve seus vinculos"
  ON public.empresa_membros FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Admin do sistema vê todos os vínculos
CREATE POLICY "Admin sistema ve todos vinculos"
  ON public.empresa_membros FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id   = auth.uid()
        AND p.role = 'admin'
    )
  );

-- Usuário pode inserir seu próprio vínculo (ao criar empresa)
CREATE POLICY "Usuario insere proprio vinculo"
  ON public.empresa_membros FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Admin de empresa pode adicionar membros
CREATE POLICY "Admin empresa adiciona membro"
  ON public.empresa_membros FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.empresa_membros em
      WHERE em.empresa_id = empresa_id
        AND em.user_id    = auth.uid()
        AND em.role       = 'admin'
    )
  );

-- Admin de empresa pode remover membros
CREATE POLICY "Admin empresa remove membro"
  ON public.empresa_membros FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.empresa_membros em
      WHERE em.empresa_id = empresa_membros.empresa_id
        AND em.user_id    = auth.uid()
        AND em.role       = 'admin'
    )
  );


-- ── 3. TRIGGER: ao criar empresa, já vincula o criador como admin ─────────────

CREATE OR REPLACE FUNCTION public.fn_auto_vincular_criador()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.empresa_membros (empresa_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'admin')
  ON CONFLICT (empresa_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_vincular_criador ON public.empresas;

CREATE TRIGGER trg_auto_vincular_criador
  AFTER INSERT ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.fn_auto_vincular_criador();


-- ── 4. BACKFILL: vincula criadores de empresas existentes ─────────────────────
-- Garante que empresas criadas antes desta migration também apareçam para seus donos.

INSERT INTO public.empresa_membros (empresa_id, user_id, role)
SELECT id, created_by, 'admin'
FROM   public.empresas
WHERE  created_by IS NOT NULL
ON CONFLICT (empresa_id, user_id) DO NOTHING;
