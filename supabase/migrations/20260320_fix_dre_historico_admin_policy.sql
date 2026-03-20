-- =============================================================================
-- Migration: Adiciona acesso de admin global ao dre_classificacao_historico
--
-- Problema: a policy "Membro gerencia histórico da empresa" só permite acesso
-- via empresa_membros. Admins globais (profiles.role = 'admin') que entram em
-- uma empresa de outro usuário não conseguem ler/gravar o histórico de
-- classificações, quebrando a comparação automática da DRE.
--
-- Solução: adicionar policy separada permitindo admin global fazer ALL na tabela.
-- =============================================================================

DROP POLICY IF EXISTS "Admin global gerencia historico dre" ON public.dre_classificacao_historico;

CREATE POLICY "Admin global gerencia historico dre"
  ON public.dre_classificacao_historico FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
