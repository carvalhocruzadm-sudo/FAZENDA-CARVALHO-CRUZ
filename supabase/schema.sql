-- ════════════════════════════════════════════════════════════════════════
-- Fazenda Carvalho Cruz — estrutura do banco (Supabase / Postgres)
-- GERADO por scripts/gerar-schema.mjs a partir de src/lib/esquema.js.
-- Não edite à mão: mude o esquema e rode `npm run schema`.
--
-- Pode rodar quantas vezes quiser (SQL Editor → cole tudo → Run): cria o que
-- falta, acrescenta colunas novas e não apaga nada.
-- ════════════════════════════════════════════════════════════════════════

-- Culturas
create table if not exists public.culturas (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz
);
alter table public.culturas add column if not exists nome text;
alter table public.culturas add column if not exists grupo text;
alter table public.culturas add column if not exists tipo text;
alter table public.culturas add column if not exists unidade text;
alter table public.culturas add column if not exists peso_saca numeric;
alter table public.culturas add column if not exists produtividade text;
alter table public.culturas add column if not exists turma_colheita boolean;
alter table public.culturas add column if not exists custo_turma_ton numeric;
alter table public.culturas add column if not exists ativo boolean;
alter table public.culturas add column if not exists observacao text;
alter table public.culturas enable row level security;
drop policy if exists "equipe acessa culturas" on public.culturas;
create policy "equipe acessa culturas" on public.culturas
  for all to authenticated using (true) with check (true);

-- Fazendas
create table if not exists public.fazendas (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz
);
alter table public.fazendas add column if not exists nome text;
alter table public.fazendas add column if not exists municipio text;
alter table public.fazendas add column if not exists area_ha numeric;
alter table public.fazendas add column if not exists posse text;
alter table public.fazendas add column if not exists socio text;
alter table public.fazendas add column if not exists ativo boolean;
alter table public.fazendas add column if not exists observacao text;
alter table public.fazendas enable row level security;
drop policy if exists "equipe acessa fazendas" on public.fazendas;
create policy "equipe acessa fazendas" on public.fazendas
  for all to authenticated using (true) with check (true);

-- Talhões / sítios
create table if not exists public.talhoes (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz
);
alter table public.talhoes add column if not exists nome text;
alter table public.talhoes add column if not exists fazenda_id uuid;
alter table public.talhoes add column if not exists area_ha numeric;
alter table public.talhoes add column if not exists cultura_id uuid;
alter table public.talhoes add column if not exists variedade text;
alter table public.talhoes add column if not exists pes numeric;
alter table public.talhoes add column if not exists safra text;
alter table public.talhoes add column if not exists data_plantio date;
alter table public.talhoes add column if not exists previsao_colheita date;
alter table public.talhoes add column if not exists ativo boolean;
alter table public.talhoes add column if not exists observacao text;
alter table public.talhoes enable row level security;
drop policy if exists "equipe acessa talhoes" on public.talhoes;
create policy "equipe acessa talhoes" on public.talhoes
  for all to authenticated using (true) with check (true);

-- Funcionários
create table if not exists public.funcionarios (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz
);
alter table public.funcionarios add column if not exists nome text;
alter table public.funcionarios add column if not exists funcao text;
alter table public.funcionarios add column if not exists telefone text;
alter table public.funcionarios add column if not exists cpf text;
alter table public.funcionarios add column if not exists vinculo text;
alter table public.funcionarios add column if not exists salario numeric;
alter table public.funcionarios add column if not exists admissao date;
alter table public.funcionarios add column if not exists ativo boolean;
alter table public.funcionarios add column if not exists observacao text;
alter table public.funcionarios enable row level security;
drop policy if exists "equipe acessa funcionarios" on public.funcionarios;
create policy "equipe acessa funcionarios" on public.funcionarios
  for all to authenticated using (true) with check (true);

-- Usuários
create table if not exists public.usuarios (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz
);
alter table public.usuarios add column if not exists funcionario_id uuid;
alter table public.usuarios add column if not exists nome text;
alter table public.usuarios add column if not exists email text;
alter table public.usuarios add column if not exists perfil text;
alter table public.usuarios add column if not exists telefone text;
alter table public.usuarios add column if not exists ativo boolean;
alter table public.usuarios add column if not exists observacao text;
alter table public.usuarios enable row level security;
drop policy if exists "equipe acessa usuarios" on public.usuarios;
create policy "equipe acessa usuarios" on public.usuarios
  for all to authenticated using (true) with check (true);

-- Máquinas e veículos
create table if not exists public.maquinas (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz
);
alter table public.maquinas add column if not exists nome text;
alter table public.maquinas add column if not exists categoria text;
alter table public.maquinas add column if not exists medidor text;
alter table public.maquinas add column if not exists marca text;
alter table public.maquinas add column if not exists modelo text;
alter table public.maquinas add column if not exists ano numeric;
alter table public.maquinas add column if not exists placa text;
alter table public.maquinas add column if not exists leitura_inicial numeric;
alter table public.maquinas add column if not exists intervalo_revisao numeric;
alter table public.maquinas add column if not exists valor numeric;
alter table public.maquinas add column if not exists ativo boolean;
alter table public.maquinas add column if not exists observacao text;
alter table public.maquinas enable row level security;
drop policy if exists "equipe acessa maquinas" on public.maquinas;
create policy "equipe acessa maquinas" on public.maquinas
  for all to authenticated using (true) with check (true);

-- Produtos químicos e insumos
create table if not exists public.insumos (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz
);
alter table public.insumos add column if not exists nome text;
alter table public.insumos add column if not exists fabricante text;
alter table public.insumos add column if not exists tipo text;
alter table public.insumos add column if not exists principio_ativo text;
alter table public.insumos add column if not exists unidade text;
alter table public.insumos add column if not exists tamanho_embalagem numeric;
alter table public.insumos add column if not exists qtd_embalagens numeric;
alter table public.insumos add column if not exists estoque_inicial numeric;
alter table public.insumos add column if not exists validade date;
alter table public.insumos add column if not exists custo_inicial numeric;
alter table public.insumos add column if not exists estoque_minimo numeric;
alter table public.insumos add column if not exists ativo boolean;
alter table public.insumos add column if not exists fotos_rotulo jsonb;
alter table public.insumos add column if not exists observacao text;
alter table public.insumos enable row level security;
drop policy if exists "equipe acessa insumos" on public.insumos;
create policy "equipe acessa insumos" on public.insumos
  for all to authenticated using (true) with check (true);

-- Links do agrônomo
create table if not exists public.links_agronomo (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz
);
alter table public.links_agronomo add column if not exists nome text;
alter table public.links_agronomo add column if not exists token text;
alter table public.links_agronomo add column if not exists ativo boolean;
alter table public.links_agronomo enable row level security;
drop policy if exists "equipe acessa links_agronomo" on public.links_agronomo;
create policy "equipe acessa links_agronomo" on public.links_agronomo
  for all to authenticated using (true) with check (true);

-- Aplicações do agrônomo
create table if not exists public.recomendacoes (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz
);
alter table public.recomendacoes add column if not exists data date;
alter table public.recomendacoes add column if not exists agronomo text;
alter table public.recomendacoes add column if not exists talhao_id uuid;
alter table public.recomendacoes add column if not exists cultura_id uuid;
alter table public.recomendacoes add column if not exists area_ha numeric;
alter table public.recomendacoes add column if not exists alvo text;
alter table public.recomendacoes add column if not exists calda_l_ha numeric;
alter table public.recomendacoes add column if not exists itens jsonb;
alter table public.recomendacoes add column if not exists observacao text;
alter table public.recomendacoes add column if not exists situacao text;
alter table public.recomendacoes add column if not exists link_id uuid;
create index if not exists recomendacoes_data_idx on public.recomendacoes (data);
alter table public.recomendacoes enable row level security;
drop policy if exists "equipe acessa recomendacoes" on public.recomendacoes;
create policy "equipe acessa recomendacoes" on public.recomendacoes
  for all to authenticated using (true) with check (true);

-- Horímetro / operações
create table if not exists public.operacoes (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz
);
alter table public.operacoes add column if not exists data date;
alter table public.operacoes add column if not exists maquina_id uuid;
alter table public.operacoes add column if not exists implemento_id uuid;
alter table public.operacoes add column if not exists operador_id uuid;
alter table public.operacoes add column if not exists operacao text;
alter table public.operacoes add column if not exists talhao_id uuid;
alter table public.operacoes add column if not exists cultura_id uuid;
alter table public.operacoes add column if not exists leitura_inicial numeric;
alter table public.operacoes add column if not exists leitura_final numeric;
alter table public.operacoes add column if not exists trabalhado numeric;
alter table public.operacoes add column if not exists destino text;
alter table public.operacoes add column if not exists observacao text;
create index if not exists operacoes_data_idx on public.operacoes (data);
alter table public.operacoes enable row level security;
drop policy if exists "equipe acessa operacoes" on public.operacoes;
create policy "equipe acessa operacoes" on public.operacoes
  for all to authenticated using (true) with check (true);

-- Revisões e manutenções
create table if not exists public.revisoes (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz
);
alter table public.revisoes add column if not exists data date;
alter table public.revisoes add column if not exists maquina_id uuid;
alter table public.revisoes add column if not exists tipo text;
alter table public.revisoes add column if not exists leitura numeric;
alter table public.revisoes add column if not exists descricao text;
alter table public.revisoes add column if not exists oficina text;
alter table public.revisoes add column if not exists valor numeric;
create index if not exists revisoes_data_idx on public.revisoes (data);
alter table public.revisoes enable row level security;
drop policy if exists "equipe acessa revisoes" on public.revisoes;
create policy "equipe acessa revisoes" on public.revisoes
  for all to authenticated using (true) with check (true);

-- Compras de diesel
create table if not exists public.diesel_entradas (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz
);
alter table public.diesel_entradas add column if not exists data date;
alter table public.diesel_entradas add column if not exists litros numeric;
alter table public.diesel_entradas add column if not exists preco_litro numeric;
alter table public.diesel_entradas add column if not exists valor numeric;
alter table public.diesel_entradas add column if not exists fornecedor text;
alter table public.diesel_entradas add column if not exists nota text;
create index if not exists diesel_entradas_data_idx on public.diesel_entradas (data);
alter table public.diesel_entradas enable row level security;
drop policy if exists "equipe acessa diesel_entradas" on public.diesel_entradas;
create policy "equipe acessa diesel_entradas" on public.diesel_entradas
  for all to authenticated using (true) with check (true);

-- Abastecimentos
create table if not exists public.abastecimentos (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz
);
alter table public.abastecimentos add column if not exists data date;
alter table public.abastecimentos add column if not exists origem text;
alter table public.abastecimentos add column if not exists maquina_id uuid;
alter table public.abastecimentos add column if not exists operador_id uuid;
alter table public.abastecimentos add column if not exists litros numeric;
alter table public.abastecimentos add column if not exists leitura numeric;
alter table public.abastecimentos add column if not exists talhao_id uuid;
alter table public.abastecimentos add column if not exists cultura_id uuid;
alter table public.abastecimentos add column if not exists posto text;
alter table public.abastecimentos add column if not exists preco_litro numeric;
alter table public.abastecimentos add column if not exists valor numeric;
alter table public.abastecimentos add column if not exists observacao text;
create index if not exists abastecimentos_data_idx on public.abastecimentos (data);
alter table public.abastecimentos enable row level security;
drop policy if exists "equipe acessa abastecimentos" on public.abastecimentos;
create policy "equipe acessa abastecimentos" on public.abastecimentos
  for all to authenticated using (true) with check (true);

-- Entradas de químicos/insumos
create table if not exists public.insumo_entradas (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz
);
alter table public.insumo_entradas add column if not exists data date;
alter table public.insumo_entradas add column if not exists insumo_id uuid;
alter table public.insumo_entradas add column if not exists quantidade numeric;
alter table public.insumo_entradas add column if not exists valor numeric;
alter table public.insumo_entradas add column if not exists cultura_id uuid;
alter table public.insumo_entradas add column if not exists fornecedor text;
alter table public.insumo_entradas add column if not exists nota text;
alter table public.insumo_entradas add column if not exists lote text;
alter table public.insumo_entradas add column if not exists validade date;
create index if not exists insumo_entradas_data_idx on public.insumo_entradas (data);
alter table public.insumo_entradas enable row level security;
drop policy if exists "equipe acessa insumo_entradas" on public.insumo_entradas;
create policy "equipe acessa insumo_entradas" on public.insumo_entradas
  for all to authenticated using (true) with check (true);

-- Balanço / conferência de estoque
create table if not exists public.insumo_ajustes (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz
);
alter table public.insumo_ajustes add column if not exists data date;
alter table public.insumo_ajustes add column if not exists insumo_id uuid;
alter table public.insumo_ajustes add column if not exists contado numeric;
alter table public.insumo_ajustes add column if not exists quantidade numeric;
alter table public.insumo_ajustes add column if not exists custo_unitario numeric;
alter table public.insumo_ajustes add column if not exists observacao text;
create index if not exists insumo_ajustes_data_idx on public.insumo_ajustes (data);
alter table public.insumo_ajustes enable row level security;
drop policy if exists "equipe acessa insumo_ajustes" on public.insumo_ajustes;
create policy "equipe acessa insumo_ajustes" on public.insumo_ajustes
  for all to authenticated using (true) with check (true);

-- Aplicações / saídas
create table if not exists public.aplicacoes (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz
);
alter table public.aplicacoes add column if not exists data date;
alter table public.aplicacoes add column if not exists insumo_id uuid;
alter table public.aplicacoes add column if not exists quantidade numeric;
alter table public.aplicacoes add column if not exists talhao_id uuid;
alter table public.aplicacoes add column if not exists cultura_id uuid;
alter table public.aplicacoes add column if not exists dose_ha numeric;
alter table public.aplicacoes add column if not exists area_aplicada numeric;
alter table public.aplicacoes add column if not exists responsavel_id uuid;
alter table public.aplicacoes add column if not exists maquina_id uuid;
alter table public.aplicacoes add column if not exists observacao text;
create index if not exists aplicacoes_data_idx on public.aplicacoes (data);
alter table public.aplicacoes enable row level security;
drop policy if exists "equipe acessa aplicacoes" on public.aplicacoes;
create policy "equipe acessa aplicacoes" on public.aplicacoes
  for all to authenticated using (true) with check (true);

-- Despesas
create table if not exists public.despesas (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz
);
alter table public.despesas add column if not exists data date;
alter table public.despesas add column if not exists categoria text;
alter table public.despesas add column if not exists tipo text;
alter table public.despesas add column if not exists descricao text;
alter table public.despesas add column if not exists valor numeric;
alter table public.despesas add column if not exists forma_pagamento text;
alter table public.despesas add column if not exists favorecido text;
alter table public.despesas add column if not exists fazenda_id uuid;
alter table public.despesas add column if not exists centro text;
alter table public.despesas add column if not exists cultura_id uuid;
alter table public.despesas add column if not exists talhao_id uuid;
alter table public.despesas add column if not exists maquina_id uuid;
alter table public.despesas add column if not exists funcionario_id uuid;
alter table public.despesas add column if not exists litros numeric;
alter table public.despesas add column if not exists vencimento date;
alter table public.despesas add column if not exists pago boolean;
alter table public.despesas add column if not exists nota text;
create index if not exists despesas_data_idx on public.despesas (data);
alter table public.despesas enable row level security;
drop policy if exists "equipe acessa despesas" on public.despesas;
create policy "equipe acessa despesas" on public.despesas
  for all to authenticated using (true) with check (true);

-- Outras entradas
create table if not exists public.entradas (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz
);
alter table public.entradas add column if not exists data date;
alter table public.entradas add column if not exists tipo text;
alter table public.entradas add column if not exists origem text;
alter table public.entradas add column if not exists valor numeric;
alter table public.entradas add column if not exists descricao text;
create index if not exists entradas_data_idx on public.entradas (data);
alter table public.entradas enable row level security;
drop policy if exists "equipe acessa entradas" on public.entradas;
create policy "equipe acessa entradas" on public.entradas
  for all to authenticated using (true) with check (true);

-- Colheitas
create table if not exists public.colheitas (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz
);
alter table public.colheitas add column if not exists data date;
alter table public.colheitas add column if not exists talhao_id uuid;
alter table public.colheitas add column if not exists cultura_id uuid;
alter table public.colheitas add column if not exists quantidade numeric;
alter table public.colheitas add column if not exists unidade text;
alter table public.colheitas add column if not exists responsavel_id uuid;
alter table public.colheitas add column if not exists observacao text;
create index if not exists colheitas_data_idx on public.colheitas (data);
alter table public.colheitas enable row level security;
drop policy if exists "equipe acessa colheitas" on public.colheitas;
create policy "equipe acessa colheitas" on public.colheitas
  for all to authenticated using (true) with check (true);

-- Vendas da produção
create table if not exists public.vendas (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz
);
alter table public.vendas add column if not exists data date;
alter table public.vendas add column if not exists comprador text;
alter table public.vendas add column if not exists cultura_id uuid;
alter table public.vendas add column if not exists safra text;
alter table public.vendas add column if not exists talhao_id uuid;
alter table public.vendas add column if not exists classificacao text;
alter table public.vendas add column if not exists placa text;
alter table public.vendas add column if not exists tipo_carro text;
alter table public.vendas add column if not exists peso_entrada numeric;
alter table public.vendas add column if not exists peso_saida numeric;
alter table public.vendas add column if not exists peso_liquido numeric;
alter table public.vendas add column if not exists volumes numeric;
alter table public.vendas add column if not exists desconto_kg numeric;
alter table public.vendas add column if not exists unidade text;
alter table public.vendas add column if not exists quantidade numeric;
alter table public.vendas add column if not exists preco_unitario numeric;
alter table public.vendas add column if not exists valor_bruto numeric;
alter table public.vendas add column if not exists valor_desconto numeric;
alter table public.vendas add column if not exists turma text;
alter table public.vendas add column if not exists custo_ton numeric;
alter table public.vendas add column if not exists frete_cobrado numeric;
alter table public.vendas add column if not exists frete numeric;
alter table public.vendas add column if not exists comissao numeric;
alter table public.vendas add column if not exists juros numeric;
alter table public.vendas add column if not exists valor numeric;
alter table public.vendas add column if not exists motorista_id uuid;
alter table public.vendas add column if not exists caminhao_id uuid;
alter table public.vendas add column if not exists vencimento date;
alter table public.vendas add column if not exists nota_fiscal text;
alter table public.vendas add column if not exists observacao text;
create index if not exists vendas_data_idx on public.vendas (data);
alter table public.vendas enable row level security;
drop policy if exists "equipe acessa vendas" on public.vendas;
create policy "equipe acessa vendas" on public.vendas
  for all to authenticated using (true) with check (true);

-- Recebimentos
create table if not exists public.recebimentos (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz
);
alter table public.recebimentos add column if not exists data date;
alter table public.recebimentos add column if not exists comprador text;
alter table public.recebimentos add column if not exists cultura_id uuid;
alter table public.recebimentos add column if not exists valor numeric;
alter table public.recebimentos add column if not exists forma_pagamento text;
alter table public.recebimentos add column if not exists observacao text;
create index if not exists recebimentos_data_idx on public.recebimentos (data);
alter table public.recebimentos enable row level security;
drop policy if exists "equipe acessa recebimentos" on public.recebimentos;
create policy "equipe acessa recebimentos" on public.recebimentos
  for all to authenticated using (true) with check (true);

-- Fretes do caminhão
create table if not exists public.fretes (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz
);
alter table public.fretes add column if not exists data date;
alter table public.fretes add column if not exists caminhao_id uuid;
alter table public.fretes add column if not exists motorista_id uuid;
alter table public.fretes add column if not exists contratante text;
alter table public.fretes add column if not exists produto text;
alter table public.fretes add column if not exists origem text;
alter table public.fretes add column if not exists destino text;
alter table public.fretes add column if not exists peso_kg numeric;
alter table public.fretes add column if not exists preco_ton numeric;
alter table public.fretes add column if not exists valor numeric;
alter table public.fretes add column if not exists km numeric;
alter table public.fretes add column if not exists observacao text;
create index if not exists fretes_data_idx on public.fretes (data);
alter table public.fretes enable row level security;
drop policy if exists "equipe acessa fretes" on public.fretes;
create policy "equipe acessa fretes" on public.fretes
  for all to authenticated using (true) with check (true);

-- Planejamento da safra
create table if not exists public.planejamento (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz
);
alter table public.planejamento add column if not exists safra text;
alter table public.planejamento add column if not exists cultura_id uuid;
alter table public.planejamento add column if not exists fazenda_id uuid;
alter table public.planejamento add column if not exists fase text;
alter table public.planejamento add column if not exists insumo_id uuid;
alter table public.planejamento add column if not exists dose_ha numeric;
alter table public.planejamento add column if not exists hectares numeric;
alter table public.planejamento add column if not exists quantidade_total numeric;
alter table public.planejamento add column if not exists preco_unitario numeric;
alter table public.planejamento add column if not exists total numeric;
alter table public.planejamento enable row level security;
drop policy if exists "equipe acessa planejamento" on public.planejamento;
create policy "equipe acessa planejamento" on public.planejamento
  for all to authenticated using (true) with check (true);

-- ─── Link do agrônomo (acesso sem login, só ao estoque de químicos) ────────
-- O agrônomo não tem senha: abre o link com o código. Estas funções conferem o
-- código e devolvem SÓ o estoque (sem preços, vendas ou financeiro). As tabelas
-- continuam fechadas para quem não está logado.
create or replace function public.agronomo_confere(p_token text) returns uuid
language sql security definer set search_path = public stable as $$
  select id from public.links_agronomo where token = p_token and coalesce(ativo, true) limit 1;
$$;
revoke all on function public.agronomo_confere(text) from public, anon, authenticated;

create or replace function public.agronomo_estoque(p_token text) returns jsonb
language plpgsql security definer set search_path = public stable as $$
declare v_link uuid := public.agronomo_confere(p_token);
begin
  if v_link is null then raise exception 'Link inválido ou desativado'; end if;
  return jsonb_build_object(
    'agronomo', (select nome from public.links_agronomo where id = v_link),
    'gerado_em', now(),
    'produtos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'nome', i.nome, 'fabricante', i.fabricante, 'tipo', i.tipo,
        'principio_ativo', i.principio_ativo, 'unidade', i.unidade,
        'estoque_minimo', i.estoque_minimo, 'ativo', i.ativo, 'observacao', i.observacao,
        'tem_fotos', case when jsonb_typeof(i.fotos_rotulo) = 'array' then jsonb_array_length(i.fotos_rotulo) > 0 else false end,
        'validade', i.validade, 'estoque_inicial', coalesce(i.estoque_inicial, 0),
        'entrou', coalesce((select sum(e.quantidade) from public.insumo_entradas e where e.insumo_id = i.id), 0)
                + coalesce(i.estoque_inicial, 0)
                + coalesce((select sum(j.quantidade) from public.insumo_ajustes j where j.insumo_id = i.id), 0),
        'aplicado', coalesce((select sum(a.quantidade) from public.aplicacoes a where a.insumo_id = i.id), 0)
      )) from public.insumos i), '[]'::jsonb),
    'lotes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'insumo_id', e.insumo_id, 'data', e.data, 'quantidade', e.quantidade, 'lote', e.lote, 'validade', e.validade
      )) from public.insumo_entradas e where e.lote is not null or e.validade is not null), '[]'::jsonb),
    'talhoes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'nome', t.nome, 'area_ha', t.area_ha, 'cultura_id', t.cultura_id,
        'fazenda', (select f.nome from public.fazendas f where f.id = t.fazenda_id)
      )) from public.talhoes t where coalesce(t.ativo, true)), '[]'::jsonb),
    'culturas', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome)) from public.culturas c where coalesce(c.ativo, true)), '[]'::jsonb),
    'minhas', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.criado_em desc) from (
        select id, criado_em, data, agronomo, talhao_id, cultura_id, area_ha, alvo, calda_l_ha, itens, observacao, situacao
        from public.recomendacoes where link_id = v_link order by criado_em desc limit 50) r), '[]'::jsonb)
  );
end $$;

create or replace function public.agronomo_fotos(p_token text, p_insumo uuid) returns jsonb
language plpgsql security definer set search_path = public stable as $$
begin
  if public.agronomo_confere(p_token) is null then raise exception 'Link inválido ou desativado'; end if;
  return coalesce((select fotos_rotulo from public.insumos where id = p_insumo), '[]'::jsonb);
end $$;

create or replace function public.agronomo_enviar(p_token text, p_dados jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_link uuid := public.agronomo_confere(p_token);
  v_id uuid := gen_random_uuid();
  v_itens jsonb := coalesce(p_dados -> 'itens', '[]'::jsonb);
begin
  if v_link is null then raise exception 'Link inválido ou desativado'; end if;
  if jsonb_typeof(v_itens) <> 'array' or jsonb_array_length(v_itens) = 0 or jsonb_array_length(v_itens) > 40 then
    raise exception 'Escolha de 1 a 40 produtos';
  end if;
  insert into public.recomendacoes (id, atualizado_em, data, agronomo, talhao_id, cultura_id, area_ha, alvo, calda_l_ha, itens, observacao, situacao, link_id)
  values (
    v_id, now(),
    coalesce(nullif(p_dados ->> 'data', '')::date, current_date),
    left(p_dados ->> 'agronomo', 120),
    nullif(p_dados ->> 'talhao_id', '')::uuid,
    nullif(p_dados ->> 'cultura_id', '')::uuid,
    nullif(p_dados ->> 'area_ha', '')::numeric,
    left(p_dados ->> 'alvo', 200),
    nullif(p_dados ->> 'calda_l_ha', '')::numeric,
    v_itens,
    left(p_dados ->> 'observacao', 2000),
    'nova', v_link
  );
  return v_id;
end $$;

grant execute on function public.agronomo_estoque(text), public.agronomo_fotos(text, uuid), public.agronomo_enviar(text, jsonb) to anon, authenticated;

-- ─── Cadastro inicial (tirado das planilhas) ───────────────────────────────
insert into public.culturas (id, nome, grupo, tipo, unidade, peso_saca, produtividade, turma_colheita, custo_turma_ton, ativo, observacao) values ('00000000-0000-4000-8000-000000000001', 'Milho', 'graos', 'agricola', 'sc60', null, 'sc_ha', false, null, true, null) on conflict (id) do nothing;
insert into public.culturas (id, nome, grupo, tipo, unidade, peso_saca, produtividade, turma_colheita, custo_turma_ton, ativo, observacao) values ('00000000-0000-4000-8000-000000000002', 'Laranja', 'citros', 'agricola', 't', null, 'kg_pe', true, null, true, null) on conflict (id) do nothing;
insert into public.culturas (id, nome, grupo, tipo, unidade, peso_saca, produtividade, turma_colheita, custo_turma_ton, ativo, observacao) values ('00000000-0000-4000-8000-000000000003', 'Abóbora', 'hortalicas', 'agricola', 'kg', null, 't_ha', false, null, true, null) on conflict (id) do nothing;
insert into public.culturas (id, nome, grupo, tipo, unidade, peso_saca, produtividade, turma_colheita, custo_turma_ton, ativo, observacao) values ('00000000-0000-4000-8000-000000000004', 'Amendoim', 'graos', 'agricola', 'sc60', null, 'sc_ha', false, null, true, null) on conflict (id) do nothing;
insert into public.culturas (id, nome, grupo, tipo, unidade, peso_saca, produtividade, turma_colheita, custo_turma_ton, ativo, observacao) values ('00000000-0000-4000-8000-000000000005', 'Silagem', 'forragem', 'agricola', 'saco', null, 't_ha', false, null, true, null) on conflict (id) do nothing;
insert into public.culturas (id, nome, grupo, tipo, unidade, peso_saca, produtividade, turma_colheita, custo_turma_ton, ativo, observacao) values ('00000000-0000-4000-8000-000000000006', 'Milho verde', 'hortalicas', 'agricola', 'unidade', null, 'nenhuma', false, null, true, null) on conflict (id) do nothing;
insert into public.culturas (id, nome, grupo, tipo, unidade, peso_saca, produtividade, turma_colheita, custo_turma_ton, ativo, observacao) values ('00000000-0000-4000-8000-000000000007', 'Confinamento', 'pecuaria', 'pecuaria', 'arroba', null, 'nenhuma', false, null, true, null) on conflict (id) do nothing;
insert into public.fazendas (id, nome, posse, socio, area_ha, municipio, ativo, observacao) values ('00000000-0000-4000-8100-000000000001', 'São Raimundo', 'propria', null, null, null, true, null) on conflict (id) do nothing;
insert into public.fazendas (id, nome, posse, socio, area_ha, municipio, ativo, observacao) values ('00000000-0000-4000-8100-000000000002', 'Murtinha', 'propria', null, null, null, true, null) on conflict (id) do nothing;
insert into public.fazendas (id, nome, posse, socio, area_ha, municipio, ativo, observacao) values ('00000000-0000-4000-8100-000000000003', 'Triunfo / Juerana', 'propria', null, null, null, true, null) on conflict (id) do nothing;
insert into public.fazendas (id, nome, posse, socio, area_ha, municipio, ativo, observacao) values ('00000000-0000-4000-8100-000000000004', 'Águas Claras', 'sociedade', 'Gilberto', 25, null, true, null) on conflict (id) do nothing;
insert into public.talhoes (id, nome, fazenda_id, area_ha, pes, cultura_id, variedade, safra, data_plantio, previsao_colheita, ativo, observacao) values ('00000000-0000-4000-8200-000000000001', 'Galpão', '00000000-0000-4000-8100-000000000001', 6.6, 4059, '00000000-0000-4000-8000-000000000002', null, null, null, null, true, null) on conflict (id) do nothing;
insert into public.talhoes (id, nome, fazenda_id, area_ha, pes, cultura_id, variedade, safra, data_plantio, previsao_colheita, ativo, observacao) values ('00000000-0000-4000-8200-000000000002', 'Meio', '00000000-0000-4000-8100-000000000001', 5.8, 3567, '00000000-0000-4000-8000-000000000002', null, null, null, null, true, null) on conflict (id) do nothing;
insert into public.talhoes (id, nome, fazenda_id, area_ha, pes, cultura_id, variedade, safra, data_plantio, previsao_colheita, ativo, observacao) values ('00000000-0000-4000-8200-000000000003', 'Gilton', '00000000-0000-4000-8100-000000000001', 24.2, 14883, '00000000-0000-4000-8000-000000000002', null, null, null, null, true, null) on conflict (id) do nothing;
insert into public.talhoes (id, nome, fazenda_id, area_ha, pes, cultura_id, variedade, safra, data_plantio, previsao_colheita, ativo, observacao) values ('00000000-0000-4000-8200-000000000004', 'Faria', '00000000-0000-4000-8100-000000000001', 8.5, 5227, '00000000-0000-4000-8000-000000000002', null, null, null, null, true, null) on conflict (id) do nothing;
insert into public.talhoes (id, nome, fazenda_id, area_ha, pes, cultura_id, variedade, safra, data_plantio, previsao_colheita, ativo, observacao) values ('00000000-0000-4000-8200-000000000005', 'Barragem', '00000000-0000-4000-8100-000000000001', 8, 4920, '00000000-0000-4000-8000-000000000002', null, null, null, null, true, null) on conflict (id) do nothing;
insert into public.talhoes (id, nome, fazenda_id, area_ha, pes, cultura_id, variedade, safra, data_plantio, previsao_colheita, ativo, observacao) values ('00000000-0000-4000-8200-000000000006', 'Coqueiro', '00000000-0000-4000-8100-000000000001', 8.9, 5473, '00000000-0000-4000-8000-000000000002', null, null, null, null, true, null) on conflict (id) do nothing;
insert into public.talhoes (id, nome, fazenda_id, area_ha, pes, cultura_id, variedade, safra, data_plantio, previsao_colheita, ativo, observacao) values ('00000000-0000-4000-8200-000000000007', 'Espinho', '00000000-0000-4000-8100-000000000002', 12, 7380, '00000000-0000-4000-8000-000000000002', null, null, null, null, true, null) on conflict (id) do nothing;
insert into public.talhoes (id, nome, fazenda_id, area_ha, pes, cultura_id, variedade, safra, data_plantio, previsao_colheita, ativo, observacao) values ('00000000-0000-4000-8200-000000000008', 'Murta', '00000000-0000-4000-8100-000000000002', 3.4, 2091, '00000000-0000-4000-8000-000000000002', null, null, null, null, true, null) on conflict (id) do nothing;
insert into public.talhoes (id, nome, fazenda_id, area_ha, pes, cultura_id, variedade, safra, data_plantio, previsao_colheita, ativo, observacao) values ('00000000-0000-4000-8200-000000000009', 'Tanque', '00000000-0000-4000-8100-000000000002', 5.9, 3628, '00000000-0000-4000-8000-000000000002', null, null, null, null, true, null) on conflict (id) do nothing;
insert into public.talhoes (id, nome, fazenda_id, area_ha, pes, cultura_id, variedade, safra, data_plantio, previsao_colheita, ativo, observacao) values ('00000000-0000-4000-8200-000000000010', 'Canabrava', '00000000-0000-4000-8100-000000000002', 6.5, 3997, '00000000-0000-4000-8000-000000000002', null, null, null, null, true, null) on conflict (id) do nothing;
insert into public.talhoes (id, nome, fazenda_id, area_ha, pes, cultura_id, variedade, safra, data_plantio, previsao_colheita, ativo, observacao) values ('00000000-0000-4000-8200-000000000011', 'George', '00000000-0000-4000-8100-000000000002', 32.76, 20147, '00000000-0000-4000-8000-000000000002', null, null, null, null, true, null) on conflict (id) do nothing;
insert into public.talhoes (id, nome, fazenda_id, area_ha, pes, cultura_id, variedade, safra, data_plantio, previsao_colheita, ativo, observacao) values ('00000000-0000-4000-8200-000000000012', 'Triunfo', '00000000-0000-4000-8100-000000000003', 28.2, 16000, '00000000-0000-4000-8000-000000000002', null, null, null, null, true, null) on conflict (id) do nothing;
insert into public.talhoes (id, nome, fazenda_id, area_ha, pes, cultura_id, variedade, safra, data_plantio, previsao_colheita, ativo, observacao) values ('00000000-0000-4000-8200-000000000013', 'Gameleira', '00000000-0000-4000-8100-000000000003', null, null, '00000000-0000-4000-8000-000000000001', null, null, null, null, true, null) on conflict (id) do nothing;
insert into public.talhoes (id, nome, fazenda_id, area_ha, pes, cultura_id, variedade, safra, data_plantio, previsao_colheita, ativo, observacao) values ('00000000-0000-4000-8200-000000000014', 'Juerana', '00000000-0000-4000-8100-000000000003', null, null, '00000000-0000-4000-8000-000000000001', null, null, null, null, true, null) on conflict (id) do nothing;
insert into public.talhoes (id, nome, fazenda_id, area_ha, pes, cultura_id, variedade, safra, data_plantio, previsao_colheita, ativo, observacao) values ('00000000-0000-4000-8200-000000000015', 'Águas Claras', '00000000-0000-4000-8100-000000000004', 25, null, '00000000-0000-4000-8000-000000000001', null, null, null, null, true, null) on conflict (id) do nothing;

-- ─── Tipo de cultura, medida de produtividade e turma nas culturas antigas ─
update public.culturas set grupo = 'graos', unidade = 'sc60', peso_saca = null, produtividade = 'sc_ha', turma_colheita = false where id = '00000000-0000-4000-8000-000000000001' and grupo is null;
update public.culturas set grupo = 'citros', unidade = 't', peso_saca = null, produtividade = 'kg_pe', turma_colheita = true where id = '00000000-0000-4000-8000-000000000002' and grupo is null;
update public.culturas set grupo = 'hortalicas', unidade = 'kg', peso_saca = null, produtividade = 't_ha', turma_colheita = false where id = '00000000-0000-4000-8000-000000000003' and grupo is null;
update public.culturas set grupo = 'graos', unidade = 'sc60', peso_saca = null, produtividade = 'sc_ha', turma_colheita = false where id = '00000000-0000-4000-8000-000000000004' and grupo is null;
update public.culturas set grupo = 'forragem', unidade = 'saco', peso_saca = null, produtividade = 't_ha', turma_colheita = false where id = '00000000-0000-4000-8000-000000000005' and grupo is null;
update public.culturas set grupo = 'hortalicas', unidade = 'unidade', peso_saca = null, produtividade = 'nenhuma', turma_colheita = false where id = '00000000-0000-4000-8000-000000000006' and grupo is null;
update public.culturas set grupo = 'pecuaria', unidade = 'arroba', peso_saca = null, produtividade = 'nenhuma', turma_colheita = false where id = '00000000-0000-4000-8000-000000000007' and grupo is null;
