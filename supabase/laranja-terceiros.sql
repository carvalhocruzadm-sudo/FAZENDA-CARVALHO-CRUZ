-- ════════════════════════════════════════════════════════════════════════
-- Laranja de terceiros: compra e revenda de laranja de outros produtores,
-- separada da laranja dos sítios da fazenda (cultura "Laranja").
--
-- Vão para "Laranja de terceiros" as despesas da categoria Compra de laranja
-- e as que têm "laranja" ou "lima" no tipo ou na descrição (cera, frete,
-- boleto da laranja, sacos, carrego...). Ficam na laranja da fazenda as de
-- produção própria: mudas, arrendamento, Murta, turma/colheita/tirada/panha/
-- cata, limpeza, adubos e sementes.
--
-- Vale para TODOS os lançamentos do banco (planilhas, WhatsApp e app).
-- Cole no SQL Editor do Supabase e clique em Run. Pode rodar de novo quando quiser.
-- ════════════════════════════════════════════════════════════════════════

begin;

-- 1) A cultura nova (centro de custo)
insert into public.culturas (id, nome, tipo, unidade, ativo, observacao)
values ('00000000-0000-4000-8000-000000000008', 'Laranja de terceiros', 'agricola', 't', true,
        'Compra e revenda de laranja de outros produtores')
on conflict (id) do nothing;

-- 2) Antes: o que vai mudar
select data, categoria, tipo, descricao, valor
  from public.despesas
 where (categoria = 'Compra de laranja'
        or (coalesce(tipo, '') || ' ' || coalesce(descricao, '')) ~* '(laranja|\mlima\M)')
   and not (coalesce(tipo, '') || ' ' || coalesce(descricao, '')) ~* '(muda|arrend|murta|turma|colheita|tirada|panha|\mcata\M|limpeza)'
   and coalesce(categoria, '') not in ('Arrendamentos', 'Sementes', 'Adubos')
   and cultura_id is distinct from '00000000-0000-4000-8000-000000000008'
 order by data;

-- 3) Passa para Laranja de terceiros
update public.despesas
   set centro = 'cultura', cultura_id = '00000000-0000-4000-8000-000000000008', talhao_id = null, atualizado_em = now()
 where (categoria = 'Compra de laranja'
        or (coalesce(tipo, '') || ' ' || coalesce(descricao, '')) ~* '(laranja|\mlima\M)')
   and not (coalesce(tipo, '') || ' ' || coalesce(descricao, '')) ~* '(muda|arrend|murta|turma|colheita|tirada|panha|\mcata\M|limpeza)'
   and coalesce(categoria, '') not in ('Arrendamentos', 'Sementes', 'Adubos')
   and cultura_id is distinct from '00000000-0000-4000-8000-000000000008';

commit;

-- 4) Depois: total de cada laranja por categoria
select c.nome as centro, d.categoria, count(*) as despesas, sum(d.valor) as total
  from public.despesas d join public.culturas c on c.id = d.cultura_id
 where d.cultura_id in ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000008')
 group by 1, 2 order by 1, 4 desc;
