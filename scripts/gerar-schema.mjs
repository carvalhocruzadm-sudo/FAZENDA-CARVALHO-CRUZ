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
  numero: "numeric", dinheiro: "numeric", data: "date", booleano: "boolean", ref: "uuid", fotos: "jsonb",
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
  // somenteServidor: quem grava é uma função do Supabase; a equipe só lê.
  sql += `alter table public.${tabela} enable row level security;
drop policy if exists "equipe acessa ${tabela}" on public.${tabela};
create policy "equipe acessa ${tabela}" on public.${tabela}
  ${def.somenteServidor ? "for select to authenticated using (true)" : "for all to authenticated using (true) with check (true)"};\n\n`;
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
create unique index if not exists notas_fiscais_venda_idx on public.notas_fiscais (venda_id);

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
