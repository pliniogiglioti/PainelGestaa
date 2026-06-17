alter table empresa_precos
  add column if not exists importado boolean not null default false;

comment on column empresa_precos.importado is 'Indica que o item foi criado via importação de planilha (.xlsx)';
