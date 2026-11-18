-- Aplicações do agrônomo → ordens de pulverização: guarda em qual ordem cada aplicação virou.
-- Cole no SQL Editor do Supabase e clique em Run (pode rodar mais de uma vez).
alter table public.recomendacoes add column if not exists pulverizacao_id uuid;
