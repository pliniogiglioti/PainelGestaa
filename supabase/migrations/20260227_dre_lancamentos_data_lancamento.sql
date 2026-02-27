-- Add data_lancamento column to dre_lancamentos
-- This stores the business date of the entry (separate from created_at which is the system timestamp)

ALTER TABLE dre_lancamentos
  ADD COLUMN IF NOT EXISTS data_lancamento DATE;

-- For existing rows, default to the date portion of created_at
UPDATE dre_lancamentos
  SET data_lancamento = created_at::date
  WHERE data_lancamento IS NULL;
