/**
 * O que precisa de alguém olhar na fazenda — usado no Início e no Painel.
 * Cada item diz para qual tela (e aba) levar: { tipo, texto, ir, aba }.
 * `tipo`: "ruim" (vencido, negativo) ou "atencao" (está chegando a hora).
 */

import { diesel, estoqueInsumos, situacaoRevisao } from "./calculos";
import { brl, data, leitura, numero } from "./formato";
import { nomesTalhoesDaOrdem } from "./talhoes";

/** Data ISO daqui a `dias`. */
export function diaISO(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Máquinas, estoque, aprovações, ordens e diesel (sem as contas). */
export function pendencias(dados) {
  const lista = [];
  const tanque = diesel(dados);
  const aConferir = dados.insumo_entradas.filter((e) => e.a_conferir).length;
  if (aConferir) lista.push({ tipo: "atencao", texto: `${aConferir} entrada(s) de produto lançada(s) no depósito esperando sua aprovação`, ir: "quimicos", aba: "aprovar" });
  const ticketsCampo = dados.vendas.filter((v) => v.a_conferir).length;
  if (ticketsCampo) lista.push({ tipo: "atencao", texto: `${ticketsCampo} ticket(s) da balança lançado(s) pelos funcionários aguardando aprovação`, ir: "ticket" });
  for (const o of dados.pulverizacoes.filter((x) => x.situacao === "aberta")) {
    lista.push({ tipo: "atencao", texto: `${o.titulo ? `${o.titulo} — ` : ""}Pulverização em ${nomesTalhoesDaOrdem(dados, o)} (${data(o.data)}) esperando separar no depósito`, ir: "atividades", aba: "ordens" });
  }
  for (const m of dados.maquinas.filter((x) => x.ativo !== false)) {
    const s = situacaoRevisao(dados, m);
    const un = m.medidor === "km" ? "km" : "h";
    if (s.estado === "vencida") lista.push({ tipo: "ruim", texto: `${m.nome}: revisão vencida há ${leitura(-s.faltam)} ${un}`, ir: "maquinas", aba: "situacao" });
    if (s.estado === "proxima") lista.push({ tipo: "atencao", texto: `${m.nome}: revisão em ${leitura(s.faltam)} ${un}`, ir: "maquinas", aba: "situacao" });
  }
  for (const x of estoqueInsumos(dados)) {
    if (x.negativo) lista.push({ tipo: "ruim", texto: `${x.insumo.nome}: estoque negativo (${numero(x.saldo)} ${x.insumo.unidade}) — falta lançar entrada`, ir: "quimicos", aba: "estoque" });
    else if (x.baixo) lista.push({ tipo: "atencao", texto: `${x.insumo.nome}: estoque baixo (${numero(x.saldo)} ${x.insumo.unidade})`, ir: "quimicos", aba: "estoque" });
  }
  if (tanque.litrosEntrada && tanque.saldo < 0) lista.push({ tipo: "ruim", texto: `Tanque de diesel negativo (${numero(tanque.saldo, 0)} L) — falta lançar compra`, ir: "diesel", aba: "diesel_entradas" });
  return lista;
}

/**
 * Contas em aberto com vencimento até `dias` à frente (e as já vencidas):
 * despesas não pagas e a programação de pagamentos (boletos, PIX…).
 */
export function contasAPagar(dados, dias = 30) {
  const hojeIso = diaISO(0);
  const em7 = diaISO(7);
  const limite = diaISO(dias);
  return [
    ...dados.despesas.filter((d) => !d.pago && d.vencimento).map((d) => ({
      id: d.id, vencimento: d.vencimento, texto: d.descricao, quem: d.favorecido, valor: Number(d.valor) || 0, ir: "financeiro", aba: "despesas",
    })),
    ...dados.boletos.filter((b) => !b.pago && b.vencimento).map((b) => ({
      id: b.id, vencimento: b.vencimento, texto: b.empresa, quem: b.forma_pagamento || "Boleto", valor: Number(b.valor) || 0, ir: "boletos",
    })),
  ].filter((c) => c.vencimento <= limite)
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
    .map((c) => ({ ...c, tipo: c.vencimento < hojeIso ? "ruim" : c.vencimento <= em7 ? "atencao" : "neutro" }));
}

/** As contas do jeito de aviso (vencidas e as dos próximos 7 dias), para o Painel. */
export function avisosDeContas(dados) {
  return contasAPagar(dados, 7).map((c) => ({
    tipo: c.tipo,
    texto: c.ir === "boletos"
      ? `${c.tipo === "ruim" ? "Pagamento vencido" : "Pagamento vence"} ${data(c.vencimento)}: ${c.texto} — ${brl(c.valor)} (${c.quem})`
      : `${c.tipo === "ruim" ? "Conta vencida" : "Vence"} ${data(c.vencimento)}: ${c.texto} — ${brl(c.valor)}`,
    ir: c.ir, aba: c.aba,
  }));
}
