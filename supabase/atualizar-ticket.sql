-- Atualização: ticket com bags e turmas + aba Turmas de colheita.
-- Cole tudo no Supabase (SQL Editor → New query → Run). Pode rodar mais de uma vez; não apaga nada.

-- Funcionários que aparecem no "Quem é você?" do ticket
alter table public.funcionarios add column if not exists lanca_ticket boolean;

-- Turmas de colheita
create table if not exists public.turmas (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz
);
alter table public.turmas add column if not exists nome text;
alter table public.turmas add column if not exists encarregado text;
alter table public.turmas add column if not exists telefone text;
alter table public.turmas add column if not exists pix text;
alter table public.turmas add column if not exists cpf text;
alter table public.turmas add column if not exists cultura_id uuid;
alter table public.turmas add column if not exists valor_ton numeric;
alter table public.turmas add column if not exists foto text;
alter table public.turmas add column if not exists ativo boolean;
alter table public.turmas add column if not exists observacao text;
alter table public.turmas enable row level security;
drop policy if exists "equipe acessa turmas" on public.turmas;
create policy "equipe acessa turmas" on public.turmas
  for all to authenticated using (not (select public.eh_campo())) with check (not (select public.eh_campo()));
drop policy if exists "campo le turmas" on public.turmas;
drop policy if exists "campo lanca turmas" on public.turmas;
drop policy if exists "campo corrige turmas" on public.turmas;
create policy "campo le turmas" on public.turmas
  for select to authenticated using ((select public.eh_campo()));

-- Pagamentos das turmas
create table if not exists public.pagamentos_turmas (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz
);
alter table public.pagamentos_turmas add column if not exists data date;
alter table public.pagamentos_turmas add column if not exists turma_id uuid;
alter table public.pagamentos_turmas add column if not exists semana date;
alter table public.pagamentos_turmas add column if not exists valor numeric;
alter table public.pagamentos_turmas add column if not exists forma text;
alter table public.pagamentos_turmas add column if not exists observacao text;
create index if not exists pagamentos_turmas_data_idx on public.pagamentos_turmas (data);
alter table public.pagamentos_turmas enable row level security;
drop policy if exists "equipe acessa pagamentos_turmas" on public.pagamentos_turmas;
create policy "equipe acessa pagamentos_turmas" on public.pagamentos_turmas
  for all to authenticated using (not (select public.eh_campo())) with check (not (select public.eh_campo()));
drop policy if exists "campo le pagamentos_turmas" on public.pagamentos_turmas;
drop policy if exists "campo lanca pagamentos_turmas" on public.pagamentos_turmas;
drop policy if exists "campo corrige pagamentos_turmas" on public.pagamentos_turmas;
