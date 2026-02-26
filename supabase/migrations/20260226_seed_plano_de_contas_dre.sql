-- =============================================================================
-- Migration: Seed completo do Plano de Contas DRE
-- Baseado em public/ia/plano_de_contas_dre.md
-- Popula dre_grupos e dre_classificacoes com todos os grupos e sub-contas.
-- Usa ON CONFLICT DO NOTHING — não sobrescreve dados existentes.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. GRUPOS (dre_grupos)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.dre_grupos (nome, tipo) VALUES
  ('Receitas Operacionais',           'receita'),
  ('Receitas Financeiras',            'receita'),
  ('Deduções de Receita',             'despesa'),
  ('Impostos sobre Faturamento',      'despesa'),
  ('Despesas Operacionais',           'despesa'),
  ('Despesas com Pessoal',            'despesa'),
  ('Despesas Administrativas',        'despesa'),
  ('Despesas Comerciais e Marketing', 'despesa'),
  ('Despesas com TI',                 'despesa'),
  ('Despesas Financeiras',            'despesa'),
  ('Investimentos',                   'despesa')
ON CONFLICT (nome, tipo) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CLASSIFICAÇÕES — RECEITAS (dre_classificacoes)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.dre_classificacoes (nome, tipo) VALUES
  -- 1. Receitas Operacionais
  ('Receita Dinheiro',                              'receita'),
  ('Receita Cartão',                                'receita'),
  ('Receita Financeiras',                           'receita'),
  ('Receita PIX / Transferências',                  'receita'),
  ('Receita Subadquirência (BT)',                   'receita'),
  -- 11. Receitas Financeiras
  ('Rendimento de Aplicação Financeira',            'receita'),
  ('Descontos Obtidos',                             'receita')
ON CONFLICT (nome) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CLASSIFICAÇÕES — DESPESAS (dre_classificacoes)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.dre_classificacoes (nome, tipo) VALUES
  -- 2. Deduções de Receita
  ('Vendas Canceladas / Devoluções',                'despesa'),
  ('Tarifa de Cartão / Aluguel de POS',             'despesa'),
  ('Tarifa de Cartão / Antecipação',                'despesa'),
  ('Tarifa de Cartão / Padrão',                     'despesa'),

  -- 3. Impostos sobre Faturamento
  ('Impostos sobre Receitas - Simples Nacional',    'despesa'),
  ('Impostos sobre Receitas - Lucro Presumido',     'despesa'),

  -- 4. Despesas Operacionais
  ('OP Gratificações',                              'despesa'),
  ('Custo de Materiais e Insumos',                  'despesa'),
  ('Serviços Terceiros PF (dentistas)',              'despesa'),
  ('Serviços Técnicos para Laboratórios',           'despesa'),
  ('Royalties e Assistência Técnica',               'despesa'),
  ('Fundo Nacional de Marketing',                   'despesa'),

  -- 6. Despesas com Pessoal
  ('Pró-labore',                                    'despesa'),
  ('Salários e Ordenados',                          'despesa'),
  ('13° Salário',                                   'despesa'),
  ('Rescisões',                                     'despesa'),
  ('INSS',                                          'despesa'),
  ('FGTS',                                          'despesa'),
  ('Outras Despesas Com Funcionários',              'despesa'),
  ('Vale Transporte',                               'despesa'),
  ('Vale Refeição',                                 'despesa'),
  ('Combustível',                                   'despesa'),

  -- 7. Despesas Administrativas
  ('Adiantamento a Fornecedor',                     'despesa'),
  ('Energia Elétrica',                              'despesa'),
  ('Água e Esgoto',                                 'despesa'),
  ('Aluguel',                                       'despesa'),
  ('Manutenção e Conservação Predial',              'despesa'),
  ('Telefonia',                                     'despesa'),
  ('Uniformes',                                     'despesa'),
  ('Manutenção e Reparos',                          'despesa'),
  ('Seguros',                                       'despesa'),
  ('Uber e Táxi',                                   'despesa'),
  ('Copa e Cozinha',                                'despesa'),
  ('Cartórios',                                     'despesa'),
  ('Viagens e Estadias',                            'despesa'),
  ('Material de Escritório',                        'despesa'),
  ('Estacionamento',                                'despesa'),
  ('Material de Limpeza',                           'despesa'),
  ('Bens de Pequeno Valor',                         'despesa'),
  ('Custas Processuais',                            'despesa'),
  ('Outras Despesas',                               'despesa'),
  ('Consultoria',                                   'despesa'),
  ('Contabilidade',                                 'despesa'),
  ('Jurídico',                                      'despesa'),
  ('Limpeza',                                       'despesa'),
  ('Segurança e Vigilância',                        'despesa'),
  ('Serviço de Motoboy',                            'despesa'),
  ('IOF',                                           'despesa'),
  ('Taxas e Emolumentos',                           'despesa'),
  ('Multa e Juros s/ Contas Pagas em Atraso',       'despesa'),
  ('Exames Ocupacionais',                           'despesa'),

  -- 8. Despesas Comerciais e Marketing
  ('Refeições e Lanches',                           'despesa'),
  ('Outras Despesas com Vendas',                    'despesa'),
  ('Agência e Assessoria',                          'despesa'),
  ('Produção de Material',                          'despesa'),
  ('Marketing Digital',                             'despesa'),
  ('Feiras e Eventos',                              'despesa'),

  -- 9. Despesas com TI
  ('Internet',                                      'despesa'),
  ('Informática e Software',                        'despesa'),
  ('Hospedagem de Dados',                           'despesa'),
  ('Sistema de Gestão',                             'despesa'),

  -- 12. Despesas Financeiras
  ('Despesas Bancárias',                            'despesa'),
  ('Depreciação e Amortização',                     'despesa'),
  ('Juros Passivos',                                'despesa'),
  ('Financiamentos / Empréstimos',                  'despesa'),

  -- 14. Investimentos
  ('Investimento - Máquinas e Equipamentos',        'despesa'),
  ('Investimento - Computadores e Periféricos',     'despesa'),
  ('Investimento - Móveis e Utensílios',            'despesa'),
  ('Investimento - Instalações de Terceiros',       'despesa'),
  ('Dividendos e Despesas dos Sócios',              'despesa')
ON CONFLICT (nome) DO NOTHING;
