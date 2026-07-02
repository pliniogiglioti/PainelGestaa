-- Permite que administradores globais do sistema visualizem todo o Lab Control,
-- mesmo quando nao possuem um vinculo em empresa_membros para a empresa.
-- is_empresa_admin() ja contempla tanto admin da empresa quanto profiles.role = 'admin'.

drop policy if exists "admins can view labs" on public.labs;
create policy "admins can view labs"
  on public.labs for select
  using (public.is_empresa_admin(empresa_id));

drop policy if exists "admins can view lab envios" on public.lab_envios;
create policy "admins can view lab envios"
  on public.lab_envios for select
  using (public.is_empresa_admin(empresa_id));

drop policy if exists "admins can view lab kanban colunas" on public.lab_kanban_colunas;
create policy "admins can view lab kanban colunas"
  on public.lab_kanban_colunas for select
  using (public.is_empresa_admin(empresa_id));

drop policy if exists "admins can view lab dentistas" on public.lab_dentistas;
create policy "admins can view lab dentistas"
  on public.lab_dentistas for select
  using (public.is_empresa_admin(empresa_id));

drop policy if exists "admins can view lab etiquetas" on public.lab_etiquetas;
create policy "admins can view lab etiquetas"
  on public.lab_etiquetas for select
  using (public.is_empresa_admin(empresa_id));

drop policy if exists "admins can view lab formas envio" on public.lab_formas_envio;
create policy "admins can view lab formas envio"
  on public.lab_formas_envio for select
  using (public.is_empresa_admin(empresa_id));

drop policy if exists "admins can view lab historico" on public.lab_historico;
create policy "admins can view lab historico"
  on public.lab_historico for select
  using (public.is_empresa_admin(empresa_id));

drop policy if exists "admins can view lab anexos" on public.lab_anexos;
create policy "admins can view lab anexos"
  on public.lab_anexos for select
  using (public.is_empresa_admin(empresa_id));

drop policy if exists "admins can view lab tipos servico" on public.lab_tipos_servico;
create policy "admins can view lab tipos servico"
  on public.lab_tipos_servico for select
  using (public.is_empresa_admin(empresa_id));

drop policy if exists "admins can view lab precos" on public.lab_precos;
create policy "admins can view lab precos"
  on public.lab_precos for select
  using (
    exists (
      select 1
      from public.labs
      where labs.id = lab_precos.lab_id
        and public.is_empresa_admin(labs.empresa_id)
    )
  );

drop policy if exists "admins can view lab envio etiquetas" on public.lab_envio_etiquetas;
create policy "admins can view lab envio etiquetas"
  on public.lab_envio_etiquetas for select
  using (
    exists (
      select 1
      from public.lab_envios e
      where e.id = lab_envio_etiquetas.envio_id
        and public.is_empresa_admin(e.empresa_id)
    )
  );
