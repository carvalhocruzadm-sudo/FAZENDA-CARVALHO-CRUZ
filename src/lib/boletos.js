/**
 * Boletos que os fornecedores mandam pelo link público: o endereço do link,
 * o código de cada envio e a mensagem de confirmação para o WhatsApp.
 */

import { brl, data } from "./formato";

export const CAMINHO_ENVIO = "/enviar-boleto";

export const ehPaginaDeEnvio = () =>
  typeof window !== "undefined" && window.location.pathname.replace(/\/+$/, "") === CAMINHO_ENVIO;

const soNumeros = (t) => String(t ?? "").replace(/\D/g, "");

/** Número de WhatsApp com DDI: (11) 99999-0000 → 5511999990000. */
export function numeroWhatsapp(texto) {
  const n = soNumeros(texto);
  if (!n) return "";
  return n.length <= 11 ? `55${n}` : n;
}

/** Link que vai para o fornecedor. O WhatsApp da fazenda vai junto, para a confirmação chegar em você. */
export function linkDoFornecedor(whatsapp) {
  const zap = numeroWhatsapp(whatsapp);
  return `${window.location.origin}${CAMINHO_ENVIO}${zap ? `?zap=${zap}` : ""}`;
}

/** Código curto que aparece na mensagem e na tela de conferência (ex.: BL-7K2Q9M). */
export function codigoEnvio() {
  const letras = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const sorteio = crypto.getRandomValues(new Uint8Array(6));
  return `BL-${[...sorteio].map((b) => letras[b % letras.length]).join("")}`;
}

/** Texto da confirmação que o fornecedor manda pelo WhatsApp. */
export function mensagemConfirmacao(boletos) {
  const b0 = boletos[0];
  const total = boletos.reduce((s, b) => s + (Number(b.valor) || 0), 0);
  const linhas = [
    "*Boletos enviados — Fazenda Carvalho Cruz*",
    "",
    `Fornecedor: ${b0.fornecedor}${b0.documento ? ` (${b0.documento})` : ""}`,
    b0.contato && `Enviado por: ${b0.contato}`,
    `Código do envio: ${b0.envio}`,
    "",
    ...boletos.map((b, i) => {
      const extra = [b.nota && `NF ${b.nota}`, b.descricao].filter(Boolean).join(" · ");
      return `${i + 1}) ${brl(b.valor)} — vence ${data(b.vencimento)}${extra ? ` — ${extra}` : ""}`;
    }),
    "",
    boletos.length > 1 && `Total: ${brl(total)}`,
    `Enviado em ${new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`,
  ];
  return linhas.filter((l) => l !== false && l != null).join("\n");
}

export function linkWhatsapp(numero, texto) {
  return `https://wa.me/${numeroWhatsapp(numero)}?text=${encodeURIComponent(texto)}`;
}
