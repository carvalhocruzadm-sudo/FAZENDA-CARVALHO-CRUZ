-- ════════════════════════════════════════════════════════════════════════
-- Atualização das planilhas de 13/10/2026 (MILHO_2026) — só o que é novo.
-- 8 vendas novas, R$ 277,069.33:
--   4 cargas de milho para NEWTON (01 a 07/10/2026, Gameleira e Juerana)
--   4 cargas de silagem de 13/10/2026 (LAZARO, CLOVIS, THIAGO, COSME)
-- e a data do pagamento do LAZARO (R$ 10.000), que estava sem data.
--
-- Conferido linha a linha contra o que já está no sistema: VENDAS_LARANJA
-- 2025/2026, MILHO_2025 e SILAGEM 2025 já batem 100%, não entram de novo.
-- Cole tudo no SQL Editor do Supabase e clique em Run. Pode rodar de novo:
-- não duplica. Para desfazer só estas vendas:
--   delete from public.vendas where id in ('0758cade-0f84-5846-bef4-311fcbf656fd', '0abaeada-a5c9-5483-ac7e-27bba5cad71f', '58847ced-0685-5b9d-81ac-ff513085c4a8', 'a0c3e84f-52da-53c3-921c-51edebf79634', 'ab884f95-0dca-55a7-ac71-24d364160b77', 'c10148b5-e335-5642-a3b9-dd3dbf73b9e6', 'c843e35b-2ff1-5ae4-8e1a-25bf3b57e82d', 'ed9e0eb4-b210-5cb4-bd17-9cee329eeaa3');
-- ════════════════════════════════════════════════════════════════════════

begin;

-- Marca do que veio das planilhas (já existe se a importação do histórico rodou).
alter table public.vendas add column if not exists importado text;
alter table public.recebimentos add column if not exists importado text;

insert into public.vendas (id, data, comprador, cultura_id, safra, talhao_id, classificacao, placa, tipo_carro, peso_entrada, peso_saida, peso_liquido, unidade, quantidade, preco_unitario, valor_bruto, valor_desconto, valor, volumes, observacao, importado) values ('c10148b5-e335-5642-a3b9-dd3dbf73b9e6', '2026-10-01', 'NEWTON', '00000000-0000-4000-8000-000000000001', 'Milho 2026', '00000000-0000-4000-8200-000000000013', 'Grão', 'RQX0H78', '9 EIXO', 0.0, 72360.0, 72360.0, 'sc60', 1206.0, 72.0, 86832.0, 0, 86832.0, 1206.0, null, 'MILHO_2026/VENDAS') on conflict (id) do nothing;
insert into public.vendas (id, data, comprador, cultura_id, safra, talhao_id, classificacao, placa, tipo_carro, peso_entrada, peso_saida, peso_liquido, unidade, quantidade, preco_unitario, valor_bruto, valor_desconto, valor, volumes, observacao, importado) values ('ab884f95-0dca-55a7-ac71-24d364160b77', '2026-10-06', 'NEWTON', '00000000-0000-4000-8000-000000000001', 'Milho 2026', '00000000-0000-4000-8200-000000000013', 'Grão', 'RQX0H78', '9 EIXO', 17160.0, 52720.0, 35560.0, 'sc60', 592.666667, 72.0, 42672.0, 0, 42672.0, 592.666667, null, 'MILHO_2026/VENDAS') on conflict (id) do nothing;
insert into public.vendas (id, data, comprador, cultura_id, safra, talhao_id, classificacao, placa, tipo_carro, peso_entrada, peso_saida, peso_liquido, unidade, quantidade, preco_unitario, valor_bruto, valor_desconto, valor, volumes, observacao, importado) values ('0abaeada-a5c9-5483-ac7e-27bba5cad71f', '2026-10-06', 'NEWTON', '00000000-0000-4000-8000-000000000001', 'Milho 2026', '00000000-0000-4000-8200-000000000014', 'Grão', 'RQX0H78', '9 EIXO', 9580.0, 46040.0, 36460.0, 'sc60', 607.666667, 72.0, 43752.0, 0, 43752.0, 607.666667, null, 'MILHO_2026/VENDAS') on conflict (id) do nothing;
insert into public.vendas (id, data, comprador, cultura_id, safra, talhao_id, classificacao, placa, tipo_carro, peso_entrada, peso_saida, peso_liquido, unidade, quantidade, preco_unitario, valor_bruto, valor_desconto, valor, volumes, observacao, importado) values ('c843e35b-2ff1-5ae4-8e1a-25bf3b57e82d', '2026-10-07', 'NEWTON', '00000000-0000-4000-8000-000000000001', 'Milho 2026', '00000000-0000-4000-8200-000000000014', 'Grão', 'RRD6A01', '9 EIXO', 0.0, 74360.0, 74360.0, 'sc60', 1239.333333, 70.0, 86753.33333, 0, 86753.33333, 1239.333333, null, 'MILHO_2026/VENDAS') on conflict (id) do nothing;
insert into public.vendas (id, data, comprador, cultura_id, safra, classificacao, peso_entrada, peso_saida, peso_liquido, volumes, valor_bruto, valor_desconto, frete_cobrado, comissao, valor, observacao, unidade, quantidade, preco_unitario, importado) values ('a0c3e84f-52da-53c3-921c-51edebf79634', '2026-10-13', 'LAZARO', '00000000-0000-4000-8000-000000000005', 'Silagem 2026', 'Silagem', 0, 20000.0, 20000.0, 1000.0, 10000.0, 0, null, null, 10000.0, null, 'saco', 1000.0, 10.0, 'MILHO_2026/SILAGEM') on conflict (id) do nothing;
insert into public.vendas (id, data, comprador, cultura_id, safra, classificacao, peso_entrada, peso_saida, peso_liquido, volumes, valor_bruto, valor_desconto, frete_cobrado, comissao, valor, observacao, unidade, quantidade, preco_unitario, importado) values ('0758cade-0f84-5846-bef4-311fcbf656fd', '2026-10-13', 'clovis', '00000000-0000-4000-8000-000000000005', 'Silagem 2026', 'Silagem', 0, 2100.0, 2100.0, 105.0, 1260.0, 0, null, null, 1260.0, null, 'saco', 105.0, 12.0, 'MILHO_2026/SILAGEM') on conflict (id) do nothing;
insert into public.vendas (id, data, comprador, cultura_id, safra, classificacao, peso_entrada, peso_saida, peso_liquido, volumes, valor_bruto, valor_desconto, frete_cobrado, comissao, valor, observacao, unidade, quantidade, preco_unitario, importado) values ('58847ced-0685-5b9d-81ac-ff513085c4a8', '2026-10-13', 'THIAGO', '00000000-0000-4000-8000-000000000005', 'Silagem 2026', 'Silagem', 0, 2000.0, 2000.0, 100.0, 1400.0, 0, null, null, 1400.0, null, 'saco', 100.0, 14.0, 'MILHO_2026/SILAGEM') on conflict (id) do nothing;
insert into public.vendas (id, data, comprador, cultura_id, safra, classificacao, peso_entrada, peso_saida, peso_liquido, volumes, valor_bruto, valor_desconto, frete_cobrado, comissao, valor, observacao, unidade, quantidade, preco_unitario, importado) values ('ed9e0eb4-b210-5cb4-bd17-9cee329eeaa3', '2026-10-13', 'COSME', '00000000-0000-4000-8000-000000000005', 'Silagem 2026', 'Silagem', 0, 8000.0, 8000.0, 400.0, 4400.0, 0, null, null, 4400.0, null, 'saco', 400.0, 11.0, 'MILHO_2026/SILAGEM') on conflict (id) do nothing;

-- Pagamento do LAZARO (silagem 2026): a planilha não tem a data; usa a da carga.
update public.recebimentos set data = '2026-10-13', atualizado_em = now()
  where id = 'ca0ddc1e-edda-5ab9-83b6-78f65fa69592' and data = '2026-12-31';

commit;
