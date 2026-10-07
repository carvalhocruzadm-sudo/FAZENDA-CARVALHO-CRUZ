/**
 * Gera supabase/schema.sql a partir de src/lib/esquema.js — assim a tabela no
 * banco nunca fica com coluna diferente da tela. Rode `npm run schema` depois
 * de mexer no esquema e rode o SQL de novo no Supabase (ele só acrescenta).
 */
import { writeFileSync } from "node:fs";

import { ESQUEMA } from "../src/lib/esquema.js";
import { SEED } from "../src/lib/seed.js";

const TIPO_SQL = {
  texto: "text", textoLongo: "text", sugestao: "text", opcoes: "text",
  numero: "numeric", dinheiro: "numeric", data: "date", booleano: "boolean", ref: "uuid", fotos: "jsonb", itens: "jsonb",
};

const lit = (v) => (v == null ? "null" : typeof v === "number" || typeof v === "boolean" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

let sql = `-- ════════════════════════════════════════════════════════════════════════
-- Fazenda Carvalho Cruz — estrutura do banco (Supabase / Postgres)
-- GERADO por scripts/gerar-schema.mjs a partir de src/lib/esquema.js.
-- Não edite à mão: mude o esquema e rode \`npm run schema\`.
--
-- Pode rodar quantas vezes quiser (SQL Editor → cole tudo → Run): cria o que
-- falta, acrescenta colunas novas e não apaga nada.
-- ════════════════════════════════════════════════════════════════════════

`;

for (const [tabela, def] of Object.entries(ESQUEMA)) {
  sql += `-- ${def.titulo}\n`;
  sql += `create table if not exists public.${tabela} (\n  id uuid primary key default gen_random_uuid(),\n  criado_em timestamptz not null default now(),\n  atualizado_em timestamptz\n);\n`;
  for (const [coluna, campo] of Object.entries(def.campos)) {
    sql += `alter table public.${tabela} add column if not exists ${coluna} ${TIPO_SQL[campo.tipo]};\n`;
  }
  if (def.campos.data) sql += `create index if not exists ${tabela}_data_idx on public.${tabela} (data);\n`;
  sql += `alter table public.${tabela} enable row level security;
drop policy if exists "equipe acessa ${tabela}" on public.${tabela};
create policy "equipe acessa ${tabela}" on public.${tabela}
  for all to authenticated using (true) with check (true);\n\n`;
}

sql += `-- ─── Link do agrônomo (acesso sem login, só ao estoque de químicos) ────────
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
        'entrou', coalesce((select sum(e.quantidade) from public.insumo_entradas e where e.insumo_id = i.id), 0),
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

`;
sql += `-- ─── Cadastro inicial (tirado das planilhas) ───────────────────────────────\n`;
for (const [tabela, itens] of Object.entries(SEED)) {
  for (const item of itens) {
    const cols = Object.keys(item);
    sql += `insert into public.${tabela} (${cols.join(", ")}) values (${cols.map((c) => lit(item[c])).join(", ")}) on conflict (id) do nothing;\n`;
  }
}

writeFileSync(new URL("../supabase/schema.sql", import.meta.url), sql);
console.log("supabase/schema.sql gerado.");
