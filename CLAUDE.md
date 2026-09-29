# Fazenda Carvalho Cruz — notas para o Claude

- App React + Vite + PWA offline (IndexedDB + fila) + Supabase. Tudo em português do Brasil, inclusive nomes de variáveis e comentários.
- O usuário não é programador: explique em passos simples, sem jargão.
- `src/lib/esquema.js` é a fonte de verdade das tabelas. Depois de mudar: `npm run schema` (regenera `supabase/schema.sql`) e, se criar coleção nova, suba `DB_VERSAO` em `src/lib/db.js`.
- Chaves dos registros = nomes das colunas no banco (sem mapeamento).
- Antes de enviar: `npm run lint` e `npm run build`.
- Sistema irmão: lbtc25-ui/distribuidora-carvalho-cruz (a distribuidora de hortifrútis), mesmo padrão de código.
