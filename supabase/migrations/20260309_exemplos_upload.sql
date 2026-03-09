-- Tabela de exemplos de upload configuráveis pelo admin.
-- Cada registro guarda o nome do modelo e os cabeçalhos normalizados do arquivo,
-- usados para validar se um arquivo enviado pelo usuário tem estrutura compatível.
-- O campo `arquivo` aponta para um arquivo estático em /public/exemplos/ (download link).

CREATE TABLE IF NOT EXISTS public.exemplos_upload (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       TEXT        NOT NULL UNIQUE,
  arquivo    TEXT        NULL,                   -- ex: "exemplo.xlsx" (para link de download)
  cabecalhos TEXT[]      NOT NULL DEFAULT '{}',  -- cabeçalhos normalizados do arquivo
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.exemplos_upload ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado pode ler
CREATE POLICY "exemplos_upload leitura autenticados"
  ON public.exemplos_upload FOR SELECT
  TO authenticated USING (true);

-- Apenas admin pode inserir, atualizar e deletar
CREATE POLICY "exemplos_upload escrita admin"
  ON public.exemplos_upload FOR ALL
  TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );
