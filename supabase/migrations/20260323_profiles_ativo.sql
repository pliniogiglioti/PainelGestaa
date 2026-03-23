-- Adiciona flag de ativação de usuários na tabela profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

UPDATE public.profiles
SET ativo = true
WHERE ativo IS NULL;
