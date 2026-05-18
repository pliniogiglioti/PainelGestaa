CREATE TABLE IF NOT EXISTS public.lab_colaborador_permissoes (
  empresa_id uuid NOT NULL,
  user_id uuid NOT NULL,
  permissoes text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, user_id),
  CONSTRAINT lab_colaborador_permissoes_membro_fk
    FOREIGN KEY (empresa_id, user_id)
    REFERENCES public.empresa_membros (empresa_id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT lab_colaborador_permissoes_keys_check
    CHECK (
      permissoes <@ ARRAY[
        'novo_laboratorio',
        'editar_laboratorios',
        'lista_precos',
        'arquivados',
        'feriados',
        'gerenciar_precos',
        'excluir_envio',
        'marcar_pago'
      ]::text[]
    )
);

CREATE INDEX IF NOT EXISTS lab_colaborador_permissoes_user_id_idx
  ON public.lab_colaborador_permissoes (user_id);

ALTER TABLE public.lab_colaborador_permissoes ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_lab_control_permission(
  p_empresa_id uuid,
  p_user_id uuid,
  p_permission text
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_empresa_admin(p_empresa_id)
    OR (
      p_user_id = auth.uid()
      AND EXISTS (
      SELECT 1
      FROM public.lab_colaborador_permissoes lcp
      WHERE lcp.empresa_id = p_empresa_id
        AND lcp.user_id = p_user_id
        AND p_permission = ANY(lcp.permissoes)
      )
    );
$$;

DROP POLICY IF EXISTS "lab_colaborador_permissoes_select" ON public.lab_colaborador_permissoes;
CREATE POLICY "lab_colaborador_permissoes_select"
  ON public.lab_colaborador_permissoes
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_empresa_admin(empresa_id)
  );

DROP POLICY IF EXISTS "lab_colaborador_permissoes_insert" ON public.lab_colaborador_permissoes;
CREATE POLICY "lab_colaborador_permissoes_insert"
  ON public.lab_colaborador_permissoes
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_empresa_admin(empresa_id));

DROP POLICY IF EXISTS "lab_colaborador_permissoes_update" ON public.lab_colaborador_permissoes;
CREATE POLICY "lab_colaborador_permissoes_update"
  ON public.lab_colaborador_permissoes
  FOR UPDATE
  TO authenticated
  USING (public.is_empresa_admin(empresa_id))
  WITH CHECK (public.is_empresa_admin(empresa_id));

DROP POLICY IF EXISTS "lab_colaborador_permissoes_delete" ON public.lab_colaborador_permissoes;
CREATE POLICY "lab_colaborador_permissoes_delete"
  ON public.lab_colaborador_permissoes
  FOR DELETE
  TO authenticated
  USING (public.is_empresa_admin(empresa_id));

DROP POLICY IF EXISTS "admins can insert labs" ON public.labs;
DROP POLICY IF EXISTS "admins and permitted users can insert labs" ON public.labs;
CREATE POLICY "admins and permitted users can insert labs"
  ON public.labs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_empresa_admin(empresa_id)
    OR public.has_lab_control_permission(empresa_id, auth.uid(), 'novo_laboratorio')
  );

DROP POLICY IF EXISTS "admins can update labs" ON public.labs;
DROP POLICY IF EXISTS "admins and permitted users can update labs" ON public.labs;
CREATE POLICY "admins and permitted users can update labs"
  ON public.labs
  FOR UPDATE
  TO authenticated
  USING (
    public.is_empresa_admin(empresa_id)
    OR public.has_lab_control_permission(empresa_id, auth.uid(), 'editar_laboratorios')
    OR public.has_lab_control_permission(empresa_id, auth.uid(), 'feriados')
  )
  WITH CHECK (
    public.is_empresa_admin(empresa_id)
    OR public.has_lab_control_permission(empresa_id, auth.uid(), 'editar_laboratorios')
    OR public.has_lab_control_permission(empresa_id, auth.uid(), 'feriados')
  );

DROP POLICY IF EXISTS "admins can manage precos" ON public.lab_precos;
DROP POLICY IF EXISTS "admins and permitted users can manage precos" ON public.lab_precos;
CREATE POLICY "admins and permitted users can manage precos"
  ON public.lab_precos
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.labs
      WHERE labs.id = lab_precos.lab_id
        AND (
          public.is_empresa_admin(labs.empresa_id)
          OR public.has_lab_control_permission(labs.empresa_id, auth.uid(), 'lista_precos')
          OR public.has_lab_control_permission(labs.empresa_id, auth.uid(), 'gerenciar_precos')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.labs
      WHERE labs.id = lab_precos.lab_id
        AND (
          public.is_empresa_admin(labs.empresa_id)
          OR public.has_lab_control_permission(labs.empresa_id, auth.uid(), 'lista_precos')
          OR public.has_lab_control_permission(labs.empresa_id, auth.uid(), 'gerenciar_precos')
        )
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_colaborador_permissoes TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_lab_control_permission(uuid, uuid, text) TO authenticated;
