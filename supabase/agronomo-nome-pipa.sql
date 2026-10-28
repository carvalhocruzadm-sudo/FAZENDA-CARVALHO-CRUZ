-- Aplicações do agrônomo: nome, dose por ha ou por pipa e uma linha por aplicação.
-- Cole tudo no SQL Editor do Supabase e clique em Run (pode rodar mais de uma vez).
alter table public.recomendacoes add column if not exists nome text;
alter table public.recomendacoes add column if not exists grupo_id text;
alter table public.recomendacoes add column if not exists dose_por text;
alter table public.recomendacoes add column if not exists ha_por_pipa numeric;

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
        select id, criado_em, nome, grupo_id, data, agronomo, talhao_id, cultura_id, area_ha, alvo, calda_l_ha, dose_por, ha_por_pipa, itens, observacao, situacao
        from public.recomendacoes where link_id = v_link order by criado_em desc limit 50) r), '[]'::jsonb)
  );
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
  insert into public.recomendacoes (id, atualizado_em, nome, grupo_id, data, agronomo, talhao_id, cultura_id, area_ha, alvo, calda_l_ha, dose_por, ha_por_pipa, itens, observacao, situacao, link_id)
  values (
    v_id, now(),
    left(p_dados ->> 'nome', 120),
    left(p_dados ->> 'grupo_id', 60),
    coalesce(nullif(p_dados ->> 'data', '')::date, current_date),
    left(p_dados ->> 'agronomo', 120),
    nullif(p_dados ->> 'talhao_id', '')::uuid,
    nullif(p_dados ->> 'cultura_id', '')::uuid,
    nullif(p_dados ->> 'area_ha', '')::numeric,
    left(p_dados ->> 'alvo', 200),
    nullif(p_dados ->> 'calda_l_ha', '')::numeric,
    case when p_dados ->> 'dose_por' = 'pipa' then 'pipa' else 'ha' end,
    nullif(p_dados ->> 'ha_por_pipa', '')::numeric,
    v_itens,
    left(p_dados ->> 'observacao', 2000),
    'nova', v_link
  );
  return v_id;
end $$;

grant execute on function public.agronomo_estoque(text), public.agronomo_fotos(text, uuid), public.agronomo_enviar(text, jsonb) to anon, authenticated;
