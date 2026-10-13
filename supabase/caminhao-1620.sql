-- ════════════════════════════════════════════════════════════════════════
-- Toda despesa com "1620" no tipo ou na descrição é do caminhão (MB 1620).
-- Liga essas despesas ao caminhão, em TODOS os lançamentos do banco: os
-- importados das planilhas e do WhatsApp e os lançados à mão no app.
-- Cole no SQL Editor do Supabase e clique em Run. Pode rodar de novo quando quiser.
-- (Só olha o número 1620 sozinho: valores como 21620 ou R$ 1.620 não contam.)
-- ════════════════════════════════════════════════════════════════════════

-- 1) Antes: quais despesas com 1620 ainda não estão ligadas ao caminhão
select data, tipo, descricao, valor, maquina_id
  from public.despesas
 where (coalesce(tipo, '') ~ '(^|[^0-9])1620([^0-9]|$)' or coalesce(descricao, '') ~ '(^|[^0-9])1620([^0-9]|$)')
   and maquina_id is distinct from '00000000-0000-4000-8300-000000000001'
 order by data;

-- 2) Liga ao caminhão
update public.despesas
   set maquina_id = '00000000-0000-4000-8300-000000000001', atualizado_em = now()
 where (coalesce(tipo, '') ~ '(^|[^0-9])1620([^0-9]|$)' or coalesce(descricao, '') ~ '(^|[^0-9])1620([^0-9]|$)')
   and maquina_id is distinct from '00000000-0000-4000-8300-000000000001'
   and exists (select 1 from public.maquinas where id = '00000000-0000-4000-8300-000000000001');

-- 3) Depois: total por ano das despesas do caminhão com 1620
select extract(year from data::date) as ano, count(*) as despesas, sum(valor) as total
  from public.despesas
 where maquina_id = '00000000-0000-4000-8300-000000000001'
   and (coalesce(tipo, '') ~ '(^|[^0-9])1620([^0-9]|$)' or coalesce(descricao, '') ~ '(^|[^0-9])1620([^0-9]|$)')
 group by 1 order by 1;
