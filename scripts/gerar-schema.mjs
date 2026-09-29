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
  numero: "numeric", dinheiro: "numeric", data: "date", booleano: "boolean", ref: "uuid", foto: "text",
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

-- Conta do Modo Campo: um usuário com perfil "campo" (o celular dos
-- tratoristas) só vê os cadastros e só lança abastecimento, horímetro e
-- as saídas/entradas do depósito de químicos.
-- Para marcar um usuário como campo (troque o e-mail):
--   update auth.users set raw_app_meta_data = raw_app_meta_data || '{"perfil":"campo"}'
--   where email = 'campo@fazenda.com';
create or replace function public.eh_campo() returns boolean
  language sql stable
  as $$ select coalesce(auth.jwt() -> 'app_metadata' ->> 'perfil', '') = 'campo' $$;

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
  for all to authenticated using (not public.eh_campo()) with check (not public.eh_campo());
drop policy if exists "campo le ${tabela}" on public.${tabela};
drop policy if exists "campo lanca ${tabela}" on public.${tabela};
drop policy if exists "campo corrige ${tabela}" on public.${tabela};\n`;
  // campoSql: as linhas que a conta de campo pode ver e corrigir (ex.: só as que ela lançou).
  const linhas = def.campoSql ? `public.eh_campo() and ${def.campoSql}` : "public.eh_campo()";
  if (def.campo) {
    sql += `create policy "campo le ${tabela}" on public.${tabela}
  for select to authenticated using (${linhas});\n`;
  }
  if (def.campo === "grava") {
    sql += `create policy "campo lanca ${tabela}" on public.${tabela}
  for insert to authenticated with check (${linhas});
create policy "campo corrige ${tabela}" on public.${tabela}
  for update to authenticated using (${linhas}) with check (${linhas});\n`;
  }
  sql += "\n";
}

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
  for delete to authenticated using (bucket_id = 'fotos' and not public.eh_campo());

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
