-- Atualização do ticket da balança: cole tudo no Supabase (SQL Editor → New query → Run).
-- Pode rodar mais de uma vez; não apaga nada.

-- Campos novos
alter table public.vendas add column if not exists a_conferir boolean;
alter table public.vendas add column if not exists foto_ticket text;
alter table public.culturas add column if not exists turmas text;
alter table public.usuarios add column if not exists ticket_campo boolean;
alter table public.pulverizacoes add column if not exists talhoes jsonb;

-- Quem é login de campo / de ticket
create or replace function public.eh_campo() returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'perfil', '') in ('campo', 'ticket') then return true; end if;
  if to_regclass('public.usuarios') is null then return false; end if;
  return exists (
    select 1 from public.usuarios u
    where lower(trim(u.email)) = lower(trim(auth.jwt() ->> 'email')) and u.perfil in ('campo', 'ticket') and coalesce(u.ativo, true)
  );
end $$;

create or replace function public.acesso_campo() returns text
language plpgsql stable security definer set search_path = public as $$
declare
  meta text := coalesce(auth.jwt() -> 'app_metadata' ->> 'perfil', '');
  cad text;
  marcado boolean;
begin
  if meta = 'ticket' then return 'ticket'; end if;
  if to_regclass('public.usuarios') is not null then
    select u.perfil, coalesce(u.ticket_campo, false) into cad, marcado from public.usuarios u
    where lower(trim(u.email)) = lower(trim(auth.jwt() ->> 'email')) and u.perfil in ('campo', 'ticket') and coalesce(u.ativo, true)
    order by (u.perfil = 'ticket') desc limit 1;
  end if;
  if cad = 'ticket' then return 'ticket'; end if;
  if cad = 'campo' and marcado then return 'campo_ticket'; end if;
  if cad = 'campo' or meta = 'campo' then return 'campo'; end if;
  return null;
end $$;

create or replace function public.campo_ticket() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.acesso_campo() in ('ticket', 'campo_ticket'), false);
$$;

drop policy if exists "campo lanca operacoes" on public.operacoes;
create policy "campo lanca operacoes" on public.operacoes
  for insert to authenticated with check ((select public.eh_campo()) and (select public.acesso_campo()) is distinct from 'ticket');
drop policy if exists "campo corrige operacoes" on public.operacoes;
create policy "campo corrige operacoes" on public.operacoes
  for update to authenticated using ((select public.eh_campo()) and (select public.acesso_campo()) is distinct from 'ticket') with check ((select public.eh_campo()) and (select public.acesso_campo()) is distinct from 'ticket');
drop policy if exists "campo lanca abastecimentos" on public.abastecimentos;
create policy "campo lanca abastecimentos" on public.abastecimentos
  for insert to authenticated with check ((select public.eh_campo()) and (select public.acesso_campo()) is distinct from 'ticket');
drop policy if exists "campo corrige abastecimentos" on public.abastecimentos;
create policy "campo corrige abastecimentos" on public.abastecimentos
  for update to authenticated using ((select public.eh_campo()) and (select public.acesso_campo()) is distinct from 'ticket') with check ((select public.eh_campo()) and (select public.acesso_campo()) is distinct from 'ticket');
drop policy if exists "campo lanca insumo_entradas" on public.insumo_entradas;
create policy "campo lanca insumo_entradas" on public.insumo_entradas
  for insert to authenticated with check ((select public.eh_campo()) and a_conferir = true and (select public.acesso_campo()) is distinct from 'ticket');
drop policy if exists "campo corrige insumo_entradas" on public.insumo_entradas;
create policy "campo corrige insumo_entradas" on public.insumo_entradas
  for update to authenticated using ((select public.eh_campo()) and a_conferir = true and (select public.acesso_campo()) is distinct from 'ticket') with check ((select public.eh_campo()) and a_conferir = true and (select public.acesso_campo()) is distinct from 'ticket');
drop policy if exists "campo lanca aplicacoes" on public.aplicacoes;
create policy "campo lanca aplicacoes" on public.aplicacoes
  for insert to authenticated with check ((select public.eh_campo()) and (select public.acesso_campo()) is distinct from 'ticket');
drop policy if exists "campo corrige aplicacoes" on public.aplicacoes;
create policy "campo corrige aplicacoes" on public.aplicacoes
  for update to authenticated using ((select public.eh_campo()) and (select public.acesso_campo()) is distinct from 'ticket') with check ((select public.eh_campo()) and (select public.acesso_campo()) is distinct from 'ticket');
drop policy if exists "campo lanca pulverizacoes" on public.pulverizacoes;
create policy "campo lanca pulverizacoes" on public.pulverizacoes
  for insert to authenticated with check ((select public.eh_campo()) and (select public.acesso_campo()) is distinct from 'ticket');
drop policy if exists "campo corrige pulverizacoes" on public.pulverizacoes;
create policy "campo corrige pulverizacoes" on public.pulverizacoes
  for update to authenticated using ((select public.eh_campo()) and (select public.acesso_campo()) is distinct from 'ticket') with check ((select public.eh_campo()) and (select public.acesso_campo()) is distinct from 'ticket');
drop policy if exists "campo le vendas" on public.vendas;
create policy "campo le vendas" on public.vendas
  for select to authenticated using ((select public.eh_campo()) and a_conferir = true and (select public.campo_ticket()));
drop policy if exists "campo lanca vendas" on public.vendas;
create policy "campo lanca vendas" on public.vendas
  for insert to authenticated with check ((select public.eh_campo()) and a_conferir = true and (select public.campo_ticket()));
drop policy if exists "campo corrige vendas" on public.vendas;
create policy "campo corrige vendas" on public.vendas
  for update to authenticated using ((select public.eh_campo()) and a_conferir = true and (select public.campo_ticket())) with check ((select public.eh_campo()) and a_conferir = true and (select public.campo_ticket()));
