-- =============================================================================
-- CORREÇÃO URGENTE: Reverter RLS na tabela profiles
-- A migration anterior habilitou RLS na tabela profiles causando
-- bloqueio de todos os acessos. Este script restaura o estado original.
-- =============================================================================

-- Remove as políticas problemáticas que criamos
DROP POLICY IF EXISTS "Usuario le proprio profile"  ON public.profiles;
DROP POLICY IF EXISTS "Admin le todos profiles"     ON public.profiles;

-- Desabilita RLS na tabela profiles (estado original)
-- Sem RLS, todos os usuários autenticados podem ler profiles normalmente
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
