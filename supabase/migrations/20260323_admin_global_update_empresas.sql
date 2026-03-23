-- Permite que admins globais atualizem empresas.
-- Problema: a UI já exibe o botão de edição para profiles.role = 'admin',
-- mas a tabela public.empresas só tinha policy de UPDATE para admins da própria empresa.
-- Resultado: o front permitia abrir o modal, porém o banco negava o UPDATE via RLS.

DROP POLICY IF EXISTS "Admin sistema atualiza todas empresas" ON public.empresas;

CREATE POLICY "Admin sistema atualiza todas empresas"
  ON public.empresas FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
  );
