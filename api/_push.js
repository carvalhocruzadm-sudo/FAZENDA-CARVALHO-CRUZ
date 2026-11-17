/**
 * O que as funções de notificação têm em comum: acesso ao banco com a chave
 * de serviço (só existe aqui no servidor, nunca vai para o app), o par de
 * chaves do push e o envio para os aparelhos inscritos.
 */
import { createClient } from "@supabase/supabase-js";
import * as webpush from "web-push";

const url = String(process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "")
  .trim().replace(/\/+$/, "").replace(/\/(rest|auth)\/v1$/, "");
const chaveServico = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

export const FALTA_CONFIGURAR = !url || !chaveServico
  ? "Falta cadastrar SUPABASE_SERVICE_ROLE_KEY nas variáveis do Vercel (veja o README, seção Notificações)."
  : null;

let cliente;
export function banco() {
  cliente ??= createClient(url, chaveServico, { auth: { persistSession: false, autoRefreshToken: false } });
  return cliente;
}

/**
 * O par de chaves que identifica a fazenda para o serviço de push do celular.
 * É criado sozinho na primeira vez e fica guardado no banco (tabela
 * push_config, que só a chave de serviço enxerga).
 */
export async function chavesPush() {
  const db = banco();
  const ler = () => db.from("push_config").select("chave_publica, chave_privada").eq("id", 1).maybeSingle();
  let { data, error } = await ler();
  if (error) throw new Error(`Tabela push_config: ${error.message}. Rode de novo o supabase/schema.sql no Supabase.`);
  if (!data?.chave_publica) {
    const novas = webpush.generateVAPIDKeys();
    // Se duas chamadas chegarem juntas, vale a primeira que gravou.
    await db.from("push_config").upsert({ id: 1, chave_publica: novas.publicKey, chave_privada: novas.privateKey }, { onConflict: "id", ignoreDuplicates: true });
    ({ data, error } = await ler());
    if (error || !data?.chave_publica) throw new Error("Não consegui guardar as chaves do push no banco.");
  }
  return { publica: data.chave_publica, privada: data.chave_privada };
}

/**
 * Manda os avisos para os aparelhos. Aparelho que desinstalou o app ou
 * desligou a notificação sai da lista. Devolve quantos envios deram certo.
 */
export async function enviar(inscricoes, avisos) {
  const { publica, privada } = await chavesPush();
  const opcoes = { vapidDetails: { subject: "mailto:contato@fazendacarvalhocruz.com.br", publicKey: publica, privateKey: privada }, TTL: 60 * 60 * 12 };
  let enviados = 0;
  const mortos = [];
  const erros = [];
  await Promise.all(inscricoes.map(async (i) => {
    for (const aviso of avisos) {
      try {
        await webpush.sendNotification({ endpoint: i.endpoint, keys: i.chaves }, JSON.stringify(aviso), opcoes);
        enviados += 1;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) { mortos.push(i.endpoint); return; }
        erros.push(`${e.statusCode ?? ""} ${e.body || e.message}`.trim());
      }
    }
  }));
  if (mortos.length) await banco().from("push_inscricoes").delete().in("endpoint", mortos);
  return { enviados, removidos: mortos.length, erros };
}
