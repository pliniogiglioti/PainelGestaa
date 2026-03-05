-- =============================================================================
-- Migration: Re-seed completo do Plano de Contas DRE
-- Garante que TODOS os grupos e classificações do public/ia/plano_de_contas_dre.md
-- existam no banco e estejam ativos.
-- ON CONFLICT DO UPDATE SET ativo = true — reativa qualquer item desativado.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. GRUPOS
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.dre_grupos (nome, tipo, ativo) VALUES
  ('Receitas Operacionais',           'receita', true),
  ('Receitas Financeiras',            'receita', true),
  ('Deduções de Receita',             'despesa', true),
  ('Impostos sobre Faturamento',      'despesa', true),
  ('Despesas Operacionais',           'despesa', true),
  ('Despesas com Pessoal',            'despesa', true),
  ('Despesas Administrativas',        'despesa', true),
  ('Despesas Comerciais e Marketing', 'despesa', true),
  ('Despesas com TI',                 'despesa', true),
  ('Despesas Financeiras',            'despesa', true),
  ('Investimentos',                   'despesa', true)
ON CONFLICT (nome, tipo) DO UPDATE SET ativo = true;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CLASSIFICAÇÕES — RECEITAS
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.dre_classificacoes (nome, tipo, ativo) VALUES
  -- 1. Receitas Operacionais
  ('Receita Dinheiro',                              'receita', true),
  ('Receita Cartão',                                'receita', true),
  ('Receita Financeiras',                           'receita', true),
  ('Receita PIX / Transferências',                  'receita', true),
  ('Receita Subadquirência (BT)',                   'receita', true),
  -- 11. Receitas Financeiras
  ('Rendimento de Aplicação Financeira',            'receita', true),
  ('Descontos Obtidos',                             'receita', true)
ON CONFLICT (nome) DO UPDATE SET ativo = true;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CLASSIFICAÇÕES — DESPESAS
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.dre_classificacoes (nome, tipo, ativo) VALUES
  -- 2. Deduções de Receita
  ('Vendas Canceladas / Devoluções',                'despesa', true),
  ('Tarifa de Cartão / Aluguel de POS',             'despesa', true),
  ('Tarifa de Cartão / Antecipação',                'despesa', true),
  ('Tarifa de Cartão / Padrão',                     'despesa', true),

  -- 3. Impostos sobre Faturamento
  ('Impostos sobre Receitas - Simples Nacional',    'despesa', true),
  ('Impostos sobre Receitas - Lucro Presumido',     'despesa', true),

  -- 4. Despesas Operacionais
  ('OP Gratificações',                              'despesa', true),
  ('Custo de Materiais e Insumos',                  'despesa', true),
  ('Serviços Terceiros PF (dentistas)',              'despesa', true),
  ('Serviços Técnicos para Laboratórios',           'despesa', true),
  ('Royalties e Assistência Técnica',               'despesa', true),
  ('Fundo Nacional de Marketing',                   'despesa', true),

  -- 6. Despesas com Pessoal
  ('Pró-labore',                                    'despesa', true),
  ('Salários e Ordenados',                          'despesa', true),
  ('13° Salário',                                   'despesa', true),
  ('Rescisões',                                     'despesa', true),
  ('INSS',                                          'despesa', true),
  ('FGTS',                                          'despesa', true),
  ('Outras Despesas Com Funcionários',              'despesa', true),
  ('Vale Transporte',                               'despesa', true),
  ('Vale Refeição',                                 'despesa', true),
  ('Combustível',                                   'despesa', true),

  -- 7. Despesas Administrativas
  ('Adiantamento a Fornecedor',                     'despesa', true),
  ('Energia Elétrica',                              'despesa', true),
  ('Água e Esgoto',                                 'despesa', true),
  ('Aluguel',                                       'despesa', true),
  ('Manutenção e Conservação Predial',              'despesa', true),
  ('Telefonia',                                     'despesa', true),
  ('Uniformes',                                     'despesa', true),
  ('Manutenção e Reparos',                          'despesa', true),
  ('Seguros',                                       'despesa', true),
  ('Uber e Táxi',                                   'despesa', true),
  ('Copa e Cozinha',                                'despesa', true),
  ('Cartórios',                                     'despesa', true),
  ('Viagens e Estadias',                            'despesa', true),
  ('Material de Escritório',                        'despesa', true),
  ('Estacionamento',                                'despesa', true),
  ('Material de Limpeza',                           'despesa', true),
  ('Bens de Pequeno Valor',                         'despesa', true),
  ('Custas Processuais',                            'despesa', true),
  ('Outras Despesas',                               'despesa', true),
  ('Consultoria',                                   'despesa', true),
  ('Contabilidade',                                 'despesa', true),
  ('Jurídico',                                      'despesa', true),
  ('Limpeza',                                       'despesa', true),
  ('Segurança e Vigilância',                        'despesa', true),
  ('Serviço de Motoboy',                            'despesa', true),
  ('IOF',                                           'despesa', true),
  ('Taxas e Emolumentos',                           'despesa', true),
  ('Multa e Juros s/ Contas Pagas em Atraso',       'despesa', true),
  ('Exames Ocupacionais',                           'despesa', true),

  -- 8. Despesas Comerciais e Marketing
  ('Refeições e Lanches',                           'despesa', true),
  ('Outras Despesas com Vendas',                    'despesa', true),
  ('Agência e Assessoria',                          'despesa', true),
  ('Produção de Material',                          'despesa', true),
  ('Marketing Digital',                             'despesa', true),
  ('Feiras e Eventos',                              'despesa', true),

  -- 9. Despesas com TI
  ('Internet',                                      'despesa', true),
  ('Informática e Software',                        'despesa', true),
  ('Hospedagem de Dados',                           'despesa', true),
  ('Sistema de Gestão',                             'despesa', true),

  -- 12. Despesas Financeiras
  ('Despesas Bancárias',                            'despesa', true),
  ('Depreciação e Amortização',                     'despesa', true),
  ('Juros Passivos',                                'despesa', true),
  ('Financiamentos / Empréstimos',                  'despesa', true),

  -- 14. Investimentos
  ('Investimento - Máquinas e Equipamentos',        'despesa', true),
  ('Investimento - Computadores e Periféricos',     'despesa', true),
  ('Investimento - Móveis e Utensílios',            'despesa', true),
  ('Investimento - Instalações de Terceiros',       'despesa', true),
  ('Dividendos e Despesas dos Sócios',              'despesa', true)
ON CONFLICT (nome) DO UPDATE SET ativo = true;
