/**
 * Contas a pagar que estão vencendo: o que vai escrito em cada notificação.
 * Sem banco nem internet aqui dentro, só a conta — dá para testar sozinho.
 */

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brl = (v) => moeda.format(Number(v) || 0);
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** Data de hoje (AAAA-MM-DD) no horário de Brasília, não no do servidor. */
export function hojeEmBrasilia(agora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

export function horaEmBrasilia(agora = new Date()) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(agora));
}

export function somarDias(iso, dias) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

const diaDaSemana = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();

/** A segunda-feira da semana de `iso` (a semana vai de segunda a domingo). */
export function segundaDaSemana(iso) {
  return somarDias(iso, -((diaDaSemana(iso) + 6) % 7));
}

const diaCurto = (iso) => `${DIAS[diaDaSemana(iso)]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Junta as despesas não pagas e a programação de pagamentos (boletos, PIX…)
 * em aberto, com vencimento, numa lista só: { vencimento, valor, texto, tela }.
 * Mesma regra de contasAPagar em src/lib/pendencias.js.
 */
export function contasEmAberto({ despesas = [], boletos = [] }) {
  const contas = [];
  for (const d of despesas) {
    if (d.pago || !d.vencimento) continue;
    contas.push({
      vencimento: d.vencimento, valor: Number(d.valor) || 0, tela: "financeiro",
      texto: `${d.descricao || d.tipo || d.categoria || "Despesa"}${d.favorecido ? ` (${d.favorecido})` : ""}`,
    });
  }
  for (const b of boletos) {
    if (b.pago || !b.vencimento) continue;
    contas.push({
      vencimento: b.vencimento, valor: Number(b.valor) || 0, tela: "boletos",
      texto: `${b.empresa || b.descricao || "Pagamento"} (${b.forma_pagamento || "Boleto"})`,
    });
  }
  return contas.sort((a, b) => a.vencimento.localeCompare(b.vencimento) || b.valor - a.valor);
}

const total = (lista) => lista.reduce((s, c) => s + c.valor, 0);
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

function linhas(lista, comDia, maximo = 6) {
  const l = lista.slice(0, maximo).map((c) => `${comDia ? `${diaCurto(c.vencimento)} · ` : ""}${c.texto} — ${brl(c.valor)}`);
  if (lista.length > maximo) l.push(`+ ${plural(lista.length - maximo, "outra", "outras")}`);
  return l;
}

/** Aviso do dia: o que vence hoje. `null` quando não vence nada. */
export function avisoDoDia(contas, hoje) {
  const lista = contas.filter((c) => c.vencimento === hoje);
  if (!lista.length) return null;
  return {
    titulo: `Vence hoje: ${plural(lista.length, "conta", "contas")} — ${brl(total(lista))}`,
    corpo: linhas(lista, false).join("\n"),
    tag: `vence-hoje-${hoje}`,
    tela: lista.every((c) => c.tela === lista[0].tela) ? lista[0].tela : "boletos",
  };
}

/**
 * Aviso da semana: o que vence de hoje até domingo, e quanto já está vencido.
 * `null` quando não há nada a pagar (a não ser com `sempre`, usado no teste).
 */
export function avisoDaSemana(contas, hoje, { sempre = false } = {}) {
  const domingo = somarDias(segundaDaSemana(hoje), 6);
  const lista = contas.filter((c) => c.vencimento >= hoje && c.vencimento <= domingo);
  const vencidas = contas.filter((c) => c.vencimento < hoje);
  if (!lista.length && !vencidas.length && !sempre) return null;
  const corpo = linhas(lista, true);
  if (vencidas.length) corpo.push(`Já ${vencidas.length === 1 ? "vencida" : "vencidas"}: ${plural(vencidas.length, "conta", "contas")} — ${brl(total(vencidas))}`);
  return {
    titulo: lista.length
      ? `Contas da semana: ${plural(lista.length, "vence", "vencem")} — ${brl(total(lista))}`
      : "Nenhuma conta vence esta semana",
    corpo: corpo.join("\n"),
    tag: `semana-${segundaDaSemana(hoje)}`,
    tela: "boletos",
  };
}
