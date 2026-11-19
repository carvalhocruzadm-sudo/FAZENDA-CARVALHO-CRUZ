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
  numero: "numeric", dinheiro: "numeric", data: "date", booleano: "boolean", ref: "uuid", refs: "jsonb", fotos: "jsonb", itens: "jsonb",
  arquivo: "text", foto: "text",
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

-- Conta do Modo Campo (o celular dos tratoristas): só vê os cadastros e só
-- lança abastecimento, horímetro, as saídas/entradas do depósito de químicos e
-- o ticket da balança (só quem está marcado em Usuários → "Lança ticket da
-- balança"; e só vê os tickets que ainda faltam completar, sem preço).
-- Perfil "Lançador de ticket": login só do ticket da balança e da chuva do
-- pluviômetro (não lança abastecimento nem depósito).
-- Marca-se pelo sistema, em Usuários → Perfil "Tratorista (Modo Campo)", ou
-- aqui (troque o e-mail):
--   update auth.users set raw_app_meta_data = raw_app_meta_data || '{"perfil":"campo"}'
--   where email = 'campo@fazenda.com';
-- security definer: lê a tabela de usuários sem passar pelas regras dela.
create or replace function public.eh_campo() returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'perfil', '') in ('campo', 'ticket') then return true; end if;
  if to_regclass('public.usuarios') is null then return false; end if;
  return exists (
    select 1 from public.usuarios u
    where lower(trim(u.email)) = lower(trim(auth.jwt() ->> 'email')) and u.perfil in ('campo', 'ticket') and coalesce(u.ativo, true)
  );
end $$;

-- O que o login de campo pode fazer no celular:
--   'ticket'        → login só do ticket da balança (perfil Lançador de ticket);
--   'campo_ticket'  → tratorista marcado em "Lança ticket da balança no celular";
--   'campo'         → tratorista (abastecimento e depósito);
--   null            → não é login de campo.
create or replace function public.acesso_campo() returns text
language plpgsql stable security definer set search_path = public as $$
declare
  meta text := coalesce(auth.jwt() -> 'app_metadata' ->> 'perfil', '');
  cad text;
  marcado boolean;
begin
  if meta = 'ticket' then return 'ticket'; end if;
  if to_regclass('public.usuarios') is not null then
    select u.perfil, coalesce(u.ticket_campo, false) into cad, marcado from public.usuarios u
    where lower(trim(u.email)) = lower(trim(auth.jwt() ->> 'email')) and u.perfil in ('campo', 'ticket') and coalesce(u.ativo, true)
    order by (u.perfil = 'ticket') desc limit 1;
  end if;
  if cad = 'ticket' then return 'ticket'; end if;
  if cad = 'campo' and marcado then return 'campo_ticket'; end if;
  if cad = 'campo' or meta = 'campo' then return 'campo'; end if;
  return null;
end $$;

-- Pode lançar o ticket da balança (regras da tabela de vendas)?
create or replace function public.campo_ticket() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.acesso_campo() in ('ticket', 'campo_ticket'), false);
$$;

`;

for (const [tabela, def] of Object.entries(ESQUEMA)) {
  sql += `-- ${def.titulo}\n`;
  sql += `create table if not exists public.${tabela} (\n  id uuid primary key default gen_random_uuid(),\n  criado_em timestamptz not null default now(),\n  atualizado_em timestamptz\n);\n`;
  for (const [coluna, campo] of Object.entries(def.campos)) {
    sql += `alter table public.${tabela} add column if not exists ${coluna} ${TIPO_SQL[campo.tipo]};\n`;
  }
  if (def.campos.data) sql += `create index if not exists ${tabela}_data_idx on public.${tabela} (data);\n`;
  // somenteServidor: quem grava é uma função do Supabase; a equipe só lê.
  sql += `alter table public.${tabela} enable row level security;
drop policy if exists "equipe acessa ${tabela}" on public.${tabela};
create policy "equipe acessa ${tabela}" on public.${tabela}
  ${def.somenteServidor
    // somenteServidor: quem grava é uma função do Supabase; o escritório só lê.
    ? "for select to authenticated using (not (select public.eh_campo()))"
    : "for all to authenticated using (not (select public.eh_campo())) with check (not (select public.eh_campo()))"};
drop policy if exists "campo le ${tabela}" on public.${tabela};
drop policy if exists "campo lanca ${tabela}" on public.${tabela};
drop policy if exists "campo corrige ${tabela}" on public.${tabela};\n`;
  // campoSql: as linhas que a conta de campo pode ver e corrigir (ex.: só as que ela lançou).
  const linhas = def.campoSql ? `(select public.eh_campo()) and ${def.campoSql}` : "(select public.eh_campo())";
  if (def.campo) {
    sql += `create policy "campo le ${tabela}" on public.${tabela}
  for select to authenticated using (${linhas});\n`;
  }
  if (def.campo === "grava") {
    // O login só de ticket grava só onde a regra da tabela já pede o ticket
    // (vendas) ou onde a tabela vale para ele também (ticketTambem: avisos).
    const grava = def.campoSql?.includes("campo_ticket") || def.ticketTambem ? linhas : `${linhas} and (select public.acesso_campo()) is distinct from 'ticket'`;
    sql += `create policy "campo lanca ${tabela}" on public.${tabela}
  for insert to authenticated with check (${grava});
create policy "campo corrige ${tabela}" on public.${tabela}
  for update to authenticated using (${grava}) with check (${grava});\n`;
  }
  if (def.envioPublico) {
    // Link público (fornecedor sem login): só pode criar registro novo, ainda
    // pendente e de tamanho razoável. Não lê, não muda e não apaga nada.
    sql += `drop policy if exists "publico envia ${tabela}" on public.${tabela};
create policy "publico envia ${tabela}" on public.${tabela}
  for insert to anon with check (situacao = 'pendente' and boleto_id is null and coalesce(pg_column_size(arquivos), 0) < 8000000);
grant insert on public.${tabela} to anon;\n`;
  }
  sql += "\n";
}

sql += `-- Conexão com o Bling (emissão de NF-e). Guarda as chaves de acesso: fica
-- trancada (RLS sem nenhuma regra), só a função "bling" do Supabase lê e grava.
create table if not exists public.bling_conexao (
  id int primary key default 1 check (id = 1),
  access_token text,
  refresh_token text,
  expira_em timestamptz,
  estado text,
  natureza_id bigint,
  natureza_nome text,
  atualizado_em timestamptz default now()
);
alter table public.bling_conexao enable row level security;

-- Assessor pelo WhatsApp (só a função whatsapp-comprovantes usa; RLS sem regras).
-- Conversa: as últimas mensagens de cada número, para ele lembrar do assunto.
create table if not exists public.whatsapp_conversa (
  id bigint generated always as identity primary key,
  numero text not null,
  papel text not null,
  texto text not null,
  criado_em timestamptz not null default now()
);
create index if not exists whatsapp_conversa_numero_idx on public.whatsapp_conversa (numero, criado_em);
alter table public.whatsapp_conversa enable row level security;
-- Legenda mandada antes do comprovante ("almoço 1620"), usada no próximo que chegar.
create table if not exists public.whatsapp_recados (
  id bigint generated always as identity primary key,
  numero text not null,
  texto text not null,
  criado_em timestamptz not null default now()
);
alter table public.whatsapp_recados enable row level security;
-- Lançamento ou correção que espera a pessoa responder SIM (um por número).
create table if not exists public.whatsapp_pendentes (
  numero text primary key,
  acao text not null,
  tabela text not null,
  registro jsonb not null,
  resumo text,
  criado_em timestamptz not null default now()
);
alter table public.whatsapp_pendentes enable row level security;
create unique index if not exists notas_fiscais_venda_idx on public.notas_fiscais (venda_id);

`;

sql += `-- ─── Notificações de contas vencendo ───────────────────────────────────────
-- Aparelhos que pediram para receber os avisos (um por linha).
create table if not exists public.push_inscricoes (
  endpoint text primary key,
  chaves jsonb not null,
  usuario_id uuid default auth.uid(),
  aparelho text,
  criado_em timestamptz not null default now()
);
alter table public.push_inscricoes enable row level security;
drop policy if exists "equipe acessa push_inscricoes" on public.push_inscricoes;
create policy "equipe acessa push_inscricoes" on public.push_inscricoes
  for all to authenticated using (not (select public.eh_campo())) with check (not (select public.eh_campo()));

-- Chaves do envio e o último dia avisado. Sem regra de acesso de propósito:
-- só o servidor (chave de serviço) lê e grava aqui.
create table if not exists public.push_config (
  id int primary key default 1 check (id = 1),
  chave_publica text,
  chave_privada text,
  ultimo_dia date,
  ultima_semana date
);
alter table public.push_config enable row level security;

`;

sql += `-- ─── Avisos pelo ntfy (app gratuito ntfy, Android e iPhone) ───────────────
-- Quem se inscreve no tópico (no app ntfy: "+" e digita o tópico) recebe:
--   • "Novo pagamento" toda vez que entra conta na Programação de pagamentos
--     (pelo escritório, pelo Modo Campo ou pelo assessor do WhatsApp);
--   • às 7h (Brasília), as contas que vencem no dia e ainda não foram pagas.
-- Quem manda é o próprio banco (extensões pg_net e pg_cron), então funciona
-- mesmo com o app fechado e com o pagamento lançado offline (avisa quando subir).
-- O que é rodado aqui no SQL Editor (importações) não avisa.
--
-- Trocar o tópico:  update privado.ntfy_config set topico = 'OUTRO-TOPICO' where id = 1;
-- Desligar:         update privado.ntfy_config set ativo = false where id = 1;
-- Testar agora:     select privado.ntfy_enviar('Teste', 'Se chegou, o ntfy está funcionando.');
-- Testar o do dia:  select privado.ntfy_avisar_vencimentos(true);
create extension if not exists pg_net;
create schema if not exists privado;
revoke all on schema privado from public, anon, authenticated;

create table if not exists privado.ntfy_config (
  id int primary key default 1 check (id = 1),
  ativo boolean not null default true,
  servidor text not null default 'https://ntfy.sh',
  topico text,
  url_app text,
  ultimo_dia date
);
insert into privado.ntfy_config (id, topico) values (1, 'FAZENDA-CC') on conflict (id) do nothing;
alter table privado.ntfy_config enable row level security;
revoke all on privado.ntfy_config from public, anon, authenticated;

-- 1234.5 → "R$ 1.234,50"
create or replace function privado.ntfy_brl(v numeric) returns text
language sql immutable set search_path = '' as $$
  select 'R$ ' || translate(to_char(coalesce(v, 0), 'FM999,999,999,990.00'), ',.', '.,');
$$;

-- 2026-11-19 → "qui 19/11"
create or replace function privado.ntfy_dia(d date) returns text
language sql immutable set search_path = '' as $$
  select (array['dom','seg','ter','qua','qui','sex','sáb'])[extract(dow from d)::int + 1] || ' ' || to_char(d, 'DD/MM');
$$;

create or replace function privado.ntfy_enviar(titulo text, mensagem text, etiqueta text default 'money_with_wings')
returns void language plpgsql security definer set search_path = '' as $$
declare
  cfg privado.ntfy_config;
  corpo jsonb;
begin
  select * into cfg from privado.ntfy_config where id = 1;
  if cfg is null or not cfg.ativo or coalesce(trim(cfg.topico), '') = '' then return; end if;
  corpo := jsonb_build_object('topic', trim(cfg.topico), 'title', titulo, 'message', mensagem, 'tags', jsonb_build_array(etiqueta));
  if nullif(trim(cfg.url_app), '') is not null then
    corpo := corpo || jsonb_build_object('click', rtrim(trim(cfg.url_app), '/') || '/boletos');
  end if;
  perform net.http_post(
    url := rtrim(coalesce(nullif(trim(cfg.servidor), ''), 'https://ntfy.sh'), '/') || '/',
    body := corpo,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
end $$;
revoke all on function privado.ntfy_enviar(text, text, text) from public, anon, authenticated;

-- Pagamento novo. Um aviso por envio: vários pagamentos que sobem juntos
-- (pagamento recorrente, fila do offline) viram um aviso só.
create or replace function privado.ntfy_boleto_novo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  qtd int;
  soma numeric;
  b record;
  quem text;
  lista text;
begin
  -- Só o que vem pelo app / funções do Supabase; o SQL Editor não tem login.
  if coalesce(current_setting('request.jwt.claims', true), '') = '' then return null; end if;
  begin
    select count(*), sum(valor) into qtd, soma from novos;
    if qtd = 0 then return null; end if;

    select nullif(trim(u.nome), '') into quem from public.usuarios u
     where lower(trim(u.email)) = lower(trim(auth.jwt() ->> 'email')) limit 1;
    quem := coalesce(quem, nullif(auth.jwt() ->> 'email', ''));

    if qtd = 1 then
      select * into b from novos;
      perform privado.ntfy_enviar(
        'Novo pagamento: ' || coalesce(nullif(trim(b.empresa), ''), 'empresa não informada') || ' — ' || privado.ntfy_brl(b.valor),
        concat_ws(E'\\n',
          'Vence ' || coalesce(privado.ntfy_dia(b.vencimento), 'sem data') || ' · ' || coalesce(nullif(trim(b.forma_pagamento), ''), 'Boleto'),
          nullif(trim(b.descricao), ''),
          case when b.a_conferir then 'Lido no depósito — falta conferir' end,
          case when b.pago then 'Já lançado como pago' end,
          'Lançado por ' || quem),
        'new');
    else
      select string_agg(coalesce(privado.ntfy_dia(x.vencimento), 'sem data') || ' · ' || coalesce(nullif(trim(x.empresa), ''), 'Pagamento') || ' — ' || privado.ntfy_brl(x.valor), E'\\n' order by x.vencimento nulls last)
        into lista from (select * from novos order by vencimento nulls last limit 8) x;
      perform privado.ntfy_enviar(
        qtd || ' pagamentos novos — ' || privado.ntfy_brl(soma),
        concat_ws(E'\\n', lista, case when qtd > 8 then '+ ' || (qtd - 8) || ' outros' end, 'Lançado por ' || quem),
        'new');
    end if;
  exception when others then
    -- O aviso nunca pode impedir o pagamento de ser gravado.
    raise warning 'aviso ntfy de pagamento novo falhou: %', sqlerrm;
  end;
  return null;
end $$;
revoke all on function privado.ntfy_boleto_novo() from public, anon, authenticated;

drop trigger if exists boletos_ntfy_novo on public.boletos;
create trigger boletos_ntfy_novo after insert on public.boletos
  referencing new table as novos
  for each statement execute function privado.ntfy_boleto_novo();

-- Contas que vencem hoje (Programação de pagamentos + despesas com vencimento
-- ainda não pagas — a mesma regra da notificação do aparelho). Uma vez por dia;
-- forcar = true manda de novo (para testar).
create or replace function privado.ntfy_avisar_vencimentos(forcar boolean default false)
returns text language plpgsql security definer set search_path = '' as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  qtd int;
  soma numeric;
  lista text;
  atras int;
  atras_soma numeric;
begin
  if not forcar then
    update privado.ntfy_config set ultimo_dia = hoje where id = 1 and (ultimo_dia is null or ultimo_dia < hoje);
    if not found then return 'já avisado hoje'; end if;
  end if;

  create temp table if not exists ntfy_contas (vencimento date, valor numeric, texto text) on commit drop;
  truncate pg_temp.ntfy_contas;
  insert into pg_temp.ntfy_contas
    select b.vencimento, coalesce(b.valor, 0),
           coalesce(nullif(trim(b.empresa), ''), nullif(trim(b.descricao), ''), 'Pagamento') || ' (' || coalesce(nullif(trim(b.forma_pagamento), ''), 'Boleto') || ')'
      from public.boletos b where not coalesce(b.pago, false) and b.vencimento <= hoje
    union all
    select d.vencimento, coalesce(d.valor, 0),
           coalesce(nullif(trim(d.descricao), ''), nullif(trim(d.tipo), ''), nullif(trim(d.categoria), ''), 'Despesa') || coalesce(' (' || nullif(trim(d.favorecido), '') || ')', '')
      from public.despesas d where not coalesce(d.pago, false) and d.vencimento <= hoje;

  select count(*), sum(valor) into qtd, soma from pg_temp.ntfy_contas where vencimento = hoje;
  if qtd = 0 then return 'nada vence hoje'; end if;
  select string_agg(texto || ' — ' || privado.ntfy_brl(valor), E'\\n' order by valor desc) into lista
    from (select * from pg_temp.ntfy_contas where vencimento = hoje order by valor desc limit 10) x;
  select count(*), sum(valor) into atras, atras_soma from pg_temp.ntfy_contas where vencimento < hoje;

  perform privado.ntfy_enviar(
    'Vence hoje: ' || qtd || case when qtd = 1 then ' conta — ' else ' contas — ' end || privado.ntfy_brl(soma),
    concat_ws(E'\\n', lista,
      case when qtd > 10 then '+ ' || (qtd - 10) || ' outras' end,
      case when atras > 0 then 'Já vencidas e não pagas: ' || atras || ' — ' || privado.ntfy_brl(atras_soma) end),
    'alarm_clock');
  return 'avisado: ' || qtd;
end $$;
revoke all on function privado.ntfy_avisar_vencimentos(boolean) from public, anon, authenticated;

-- Agenda o aviso do dia: '0 10 * * *' em UTC = todo dia às 7h em Brasília.
do $ntfy$
begin
  begin
    create extension if not exists pg_cron with schema pg_catalog;
  exception when others then
    raise warning 'pg_cron indisponível (%): ligue em Database → Extensions → pg_cron e rode de novo.', sqlerrm;
    return;
  end;
  perform cron.unschedule(jobid) from cron.job where jobname = 'ntfy-vencimentos-dia';
  perform cron.schedule('ntfy-vencimentos-dia', '0 10 * * *', 'select privado.ntfy_avisar_vencimentos();');
end $ntfy$;

`;

sql += `-- ─── Fotos (Storage) ──────────────────────────────────────────────────────
-- Bucket privado: só quem tem login vê. O Modo Campo tira e vê fotos, mas não apaga.
insert into storage.buckets (id, name, public) values ('fotos', 'fotos', false) on conflict (id) do nothing;
drop policy if exists "equipe ve fotos" on storage.objects;
create policy "equipe ve fotos" on storage.objects
  for select to authenticated using (bucket_id = 'fotos');
drop policy if exists "equipe envia fotos" on storage.objects;
create policy "equipe envia fotos" on storage.objects
  for insert to authenticated with check (bucket_id = 'fotos');
drop policy if exists "equipe troca fotos" on storage.objects;
create policy "equipe troca fotos" on storage.objects
  for update to authenticated using (bucket_id = 'fotos') with check (bucket_id = 'fotos');
drop policy if exists "escritorio apaga fotos" on storage.objects;
create policy "escritorio apaga fotos" on storage.objects
  for delete to authenticated using (bucket_id = 'fotos' and not (select public.eh_campo()));

`;

sql += `-- ─── Comprovantes (fotos e PDFs anexados às despesas) ──────────────────────
-- Pasta privada no Storage: só quem tem login no app vê e envia (a conta do
-- Modo Campo não vê os comprovantes).
insert into storage.buckets (id, name, public) values ('comprovantes', 'comprovantes', false) on conflict (id) do nothing;
drop policy if exists "equipe acessa comprovantes" on storage.objects;
create policy "equipe acessa comprovantes" on storage.objects
  for all to authenticated using (bucket_id = 'comprovantes' and not (select public.eh_campo()))
  with check (bucket_id = 'comprovantes' and not (select public.eh_campo()));

`;

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

`;
sql += `-- ─── Cadastro inicial (tirado das planilhas) ───────────────────────────────\n`;
for (const [tabela, itens] of Object.entries(SEED)) {
  for (const item of itens) {
    const cols = Object.keys(item);
    sql += `insert into public.${tabela} (${cols.join(", ")}) values (${cols.map((c) => lit(item[c])).join(", ")}) on conflict (id) do nothing;\n`;
  }
}

// Culturas cadastradas antes de existir o "tipo de cultura": recebem os
// padrões do cadastro inicial uma vez só (quem já preencheu não é tocado).
sql += `\n-- ─── Tipo de cultura, medida de produtividade e turma nas culturas antigas ─\n`;
for (const c of SEED.culturas) {
  sql += `update public.culturas set grupo = ${lit(c.grupo)}, unidade = ${lit(c.unidade)}, peso_saca = ${lit(c.peso_saca)}, produtividade = ${lit(c.produtividade)}, turma_colheita = ${lit(c.turma_colheita)} where id = ${lit(c.id)} and grupo is null;\n`;
}

writeFileSync(new URL("../supabase/schema.sql", import.meta.url), sql);
console.log("supabase/schema.sql gerado.");
