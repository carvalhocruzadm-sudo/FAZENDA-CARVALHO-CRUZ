-- ════════════════════════════════════════════════════════════════════════
-- Corrige o horímetro do TRATOR 02: algumas leituras foram digitadas sem a
-- vírgula (58946 em vez de 5894,6). Toda leitura do TRATOR 02 acima de
-- 10.000 h é dividida por 10, em abastecimentos, operações (e as horas
-- trabalhadas são refeitas), revisões e no cadastro da máquina.
-- Cole no SQL Editor do Supabase e clique em Run. Pode rodar de novo: o que
-- já foi corrigido fica abaixo de 10.000 e não muda mais.
-- ════════════════════════════════════════════════════════════════════════

-- 1) Antes: as leituras que vão mudar
select 'abastecimento' as onde, a.data, a.leitura as antes, round(a.leitura / 10, 1) as depois
  from public.abastecimentos a join public.maquinas m on m.id = a.maquina_id
 where upper(trim(m.nome)) = 'TRATOR 02' and a.leitura >= 10000
union all
select 'operação (final)', o.data, o.leitura_final, round(o.leitura_final / 10, 1)
  from public.operacoes o join public.maquinas m on m.id = o.maquina_id
 where upper(trim(m.nome)) = 'TRATOR 02' and (o.leitura_final >= 10000 or o.leitura_inicial >= 10000)
union all
select 'revisão', r.data, r.leitura, round(r.leitura / 10, 1)
  from public.revisoes r join public.maquinas m on m.id = r.maquina_id
 where upper(trim(m.nome)) = 'TRATOR 02' and r.leitura >= 10000
order by 2;

-- 2) Corrige
update public.abastecimentos a
   set leitura = round(a.leitura / 10, 1), atualizado_em = now()
  from public.maquinas m
 where m.id = a.maquina_id and upper(trim(m.nome)) = 'TRATOR 02' and a.leitura >= 10000;

update public.operacoes o
   set leitura_inicial = case when o.leitura_inicial >= 10000 then round(o.leitura_inicial / 10, 1) else o.leitura_inicial end,
       leitura_final   = case when o.leitura_final   >= 10000 then round(o.leitura_final   / 10, 1) else o.leitura_final   end,
       atualizado_em = now()
  from public.maquinas m
 where m.id = o.maquina_id and upper(trim(m.nome)) = 'TRATOR 02'
   and (o.leitura_inicial >= 10000 or o.leitura_final >= 10000);

-- Horas trabalhadas = final − inicial (nunca negativa), como o app calcula
update public.operacoes o
   set trabalhado = greatest(0, round(coalesce(o.leitura_final, 0) - coalesce(o.leitura_inicial, 0), 1)), atualizado_em = now()
  from public.maquinas m
 where m.id = o.maquina_id and upper(trim(m.nome)) = 'TRATOR 02'
   and o.trabalhado is distinct from greatest(0, round(coalesce(o.leitura_final, 0) - coalesce(o.leitura_inicial, 0), 1));

update public.revisoes r
   set leitura = round(r.leitura / 10, 1), atualizado_em = now()
  from public.maquinas m
 where m.id = r.maquina_id and upper(trim(m.nome)) = 'TRATOR 02' and r.leitura >= 10000;

update public.maquinas
   set leitura_inicial = round(leitura_inicial / 10, 1), atualizado_em = now()
 where upper(trim(nome)) = 'TRATOR 02' and leitura_inicial >= 10000;

-- 3) Depois: todas as leituras do TRATOR 02, da mais nova para a mais antiga
select 'abastecimento' as onde, a.data, a.leitura, null::numeric as trabalhado
  from public.abastecimentos a join public.maquinas m on m.id = a.maquina_id
 where upper(trim(m.nome)) = 'TRATOR 02'
union all
select 'operação', o.data, o.leitura_final, o.trabalhado
  from public.operacoes o join public.maquinas m on m.id = o.maquina_id
 where upper(trim(m.nome)) = 'TRATOR 02'
order by 2 desc;
