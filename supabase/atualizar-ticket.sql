-- Atualização do ticket com bags e turmas: cole no Supabase (SQL Editor → New query → Run).
-- Pode rodar mais de uma vez; não apaga nada.

-- Funcionários que aparecem no "Quem é você?" do ticket
alter table public.funcionarios add column if not exists lanca_ticket boolean;
