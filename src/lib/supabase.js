import { createClient } from "@supabase/supabase-js";

// Aceita a URL colada com sobras ("/rest/v1/", barra no fim, espaços): o
// cliente do Supabase monta os caminhos sozinho e, com sobra, o servidor
// responde "Invalid path specified in request URL".
const url = String(import.meta.env.VITE_SUPABASE_URL ?? "")
  .trim()
  .replace(/\/+$/, "")
  .replace(/\/(rest|auth)\/v1$/, "");
const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();

/**
 * Sem as variáveis o app roda em "modo demonstração": tudo funciona só neste
 * aparelho (IndexedDB) e nada vai para a nuvem.
 */
export const supabaseConfigurado = Boolean(url && anonKey);

export const supabase = supabaseConfigurado
  ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;
