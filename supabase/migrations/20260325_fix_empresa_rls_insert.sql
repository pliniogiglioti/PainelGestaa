-- =============================================================================
-- Correção: Política RLS de INSERT para usuários comuns na tabela empresas
--
-- Problema: usuários com role='user' recebem erro "new row violates row-level
-- security policy for table 'empresa'" ao tentar criar uma empresa.
--
-- Causas possíveis:
--   1. A política "Usuario cria empresa" foi removida ou corrompida
--   2. O trigger fn_auto_vincular_criador falha ao inserir em empresa_membros,
--      causando rollback da transação inteira
--
-- Esta migration:
--   - Recria explicitamente a política de INSERT para todos os autenticados
--   - Recria o trigger com SET search_path = public (boas práticas Supabase)
--   - Garante que a política de INSERT em empresa_membros permite auto-vínculo
-- =============================================================================

-- ── 1. Recriar política de INSERT na tabela empresas ─────────────────────────

DROP POLICY IF EXISTS "Usuario cria empresa" ON public.empresas;

CREATE POLICY "Usuario cria empresa"
  ON public.empresas FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());


-- ── 2. Recriar política de INSERT (auto-vínculo) em empresa_membros ──────────
-- Garante que o próprio usuário pode inserir seu vínculo ao criar empresa,
-- caso o trigger não esteja rodando com SECURITY DEFINER adequado.

DROP POLICY IF EXISTS "Usuario insere proprio vinculo" ON public.empresa_membros;

CREATE POLICY "Usuario insere proprio vinculo"
  ON public.empresa_membros FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());


-- ── 3. Recriar função do trigger com SET search_path (boas práticas) ─────────

CREATE OR REPLACE FUNCTION public.fn_auto_vincular_criador()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.empresa_membros (empresa_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'admin')
  ON CONFLICT (empresa_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Recriar trigger para garantir que aponta para a função atualizada
DROP TRIGGER IF EXISTS trg_auto_vincular_criador ON public.empresas;

CREATE TRIGGER trg_auto_vincular_criador
  AFTER INSERT ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.fn_auto_vincular_criador();
