ALTER TABLE dre_lancamentos
  ADD COLUMN IF NOT EXISTS data_lancamento DATE;

UPDATE dre_lancamentos
  SET data_lancamento = created_at::date
  WHERE data_lancamento IS NULL;
