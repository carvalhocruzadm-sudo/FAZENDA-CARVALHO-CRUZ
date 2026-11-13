/**
 * O que precisa de alguém olhar — usado no Início, na tela de cada cultura e
 * no Painel. Cada item diz para onde levar: { tipo, texto, ir, aba, sub }
 * (`ir` = tela; o que é de uma cultura leva para a tela da cultura).
 * `tipo`: "ruim" (vencido, negativo) ou "atencao" (está chegando a hora).
 */

import { diesel, estoqueInsumos, situacaoRevisao } from "./calculos";
import { brl, data, leitura, nomeRef, numero } from "./formato";
import { destinoDoRegistro, telaDaCultura } from "./porCultura";
import { nomesTalhoesDaOrdem } from "./talhoes";

/** Data ISO daqui a `dias`. */
export function diaISO(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

const destino = (colecao, reg) => {
  const d = destinoDoRegistro(colecao, reg);
  return { ir: d.tela, aba: d.aba, sub: d.sub };
};

/** Tickets e ordens de pulverização esperando alguém (por cultura). */
export function pendenciasDasCulturas(dados) {
  const lista = [];
  const tickets = new Map();
  for (const v of dados.vendas.filter((x) => x.a_conferir)) tickets.set(v.cultura_id, (tickets.get(v.cultura_id) ?? 0) + 1);
  for (const [cultura, qtd] of tickets) {
    lista.push({
      tipo: "atencao", texto: `${qtd} ticket(s) da balança de ${nomeRef(dados, "culturas", cultura)} aguardando aprovação`,
      ...(cultura ? { ir: telaDaCultura(cultura), aba: "vendas", sub: "ticket" } : { ir: "comercial", aba: "tickets" }),
    });
  }
  for (const o of dados.pulverizacoes.filter((x) => x.situacao === "aberta")) {
    lista.push({
      tipo: "atencao", texto: `${o.titulo ? `${o.titulo} — ` : ""}Pulverização em ${nomesTalhoesDaOrdem(dados, o)} (${data(o.data)}) esperando separar no depósito`,
      ...destino("pulverizacoes", o),
    });
  }
  return lista;
}

/** Tudo o que precisa de atenção (sem as contas): culturas + máquinas, estoque e diesel. */
export function pendencias(dados) {
  const lista = [];
  const tanque = diesel(dados);
  const aConferir = dados.insumo_entradas.filter((e) => e.a_conferir).length;
  if (aConferir) lista.push({ tipo: "atencao", texto: `${aConferir} entrada(s) de produto lançada(s) no depósito esperando sua aprovação`, ir: "quimicos", aba: "aprovar" });
  lista.push(...pendenciasDasCulturas(dados));
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
      id: d.id, vencimento: d.vencimento, texto: d.descricao, quem: d.favorecido, valor: Number(d.valor) || 0, boleto: false, ...destino("despesas", d),
    })),
    ...(dados.boletos ?? []).filter((b) => !b.pago && b.vencimento).map((b) => ({
      id: b.id, vencimento: b.vencimento, texto: b.empresa, quem: b.forma_pagamento || "Boleto", valor: Number(b.valor) || 0, boleto: true, ir: "boletos",
    })),
  ].filter((c) => c.vencimento <= limite)
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
    .map((c) => ({ ...c, tipo: c.vencimento < hojeIso ? "ruim" : c.vencimento <= em7 ? "atencao" : "neutro" }));
}

/** As contas do jeito de aviso (vencidas e as dos próximos 7 dias), para o Painel. */
export function avisosDeContas(dados) {
  return contasAPagar(dados, 7).map((c) => ({
    tipo: c.tipo,
    texto: c.boleto
      ? `${c.tipo === "ruim" ? "Pagamento vencido" : "Pagamento vence"} ${data(c.vencimento)}: ${c.texto} — ${brl(c.valor)} (${c.quem})`
      : `${c.tipo === "ruim" ? "Conta vencida" : "Vence"} ${data(c.vencimento)}: ${c.texto} — ${brl(c.valor)}`,
    ir: c.ir, aba: c.aba, sub: c.sub,
  }));
}

/** O que foi feito no campo por último: aplicações, serviços, colheitas, abastecimentos e cargas. */
export function ultimasAtividades(dados, limite = 8) {
  const unidade = (id) => dados.insumos.find((i) => i.id === id)?.unidade ?? "";
  const talhao = (id) => (id ? nomeRef(dados, "talhoes", id) : null);
  return [
    ...dados.aplicacoes.map((a) => ({
      reg: a, colecao: "aplicacoes", icone: "spray",
      titulo: `Aplicação: ${nomeRef(dados, "insumos", a.insumo_id)}`,
      detalhe: [`${numero(a.quantidade)} ${unidade(a.insumo_id)}`, talhao(a.talhao_id)].filter(Boolean).join(" · "),
    })),
    ...dados.operacoes.map((o) => ({
      reg: o, colecao: "operacoes", icone: "relogio",
      titulo: `${o.operacao || "Serviço"}: ${nomeRef(dados, "maquinas", o.maquina_id)}`,
      detalhe: [o.trabalhado ? `${leitura(o.trabalhado)} h` : null, talhao(o.talhao_id), o.operador_id ? nomeRef(dados, "funcionarios", o.operador_id) : null].filter(Boolean).join(" · "),
    })),
    ...dados.colheitas.map((c) => ({
      reg: c, colecao: "colheitas", icone: "cesto",
      titulo: `Colheita: ${nomeRef(dados, "culturas", c.cultura_id)}`,
      detalhe: [`${numero(c.quantidade)} ${c.unidade ?? ""}`, talhao(c.talhao_id)].filter(Boolean).join(" · "),
    })),
    ...dados.abastecimentos.map((a) => ({
      reg: a, colecao: "abastecimentos", icone: "combustivel",
      titulo: `Abastecimento: ${nomeRef(dados, "maquinas", a.maquina_id)}`,
      detalhe: `${numero(a.litros, 0)} L · ${a.origem === "posto" ? "posto" : "tanque"}`,
    })),
    ...dados.vendas.map((v) => ({
      reg: v, colecao: "vendas", icone: "venda",
      titulo: `Carga: ${nomeRef(dados, "culturas", v.cultura_id)}${v.comprador ? ` → ${v.comprador}` : ""}`,
      detalhe: [v.peso_liquido ? `${numero(v.peso_liquido / 1000, 2)} t` : null, talhao(v.talhao_id), v.valor ? brl(v.valor) : null].filter(Boolean).join(" · "),
    })),
  ].sort((a, b) => String(b.reg.data ?? "").localeCompare(String(a.reg.data ?? "")) || String(b.reg.atualizado_em ?? "").localeCompare(String(a.reg.atualizado_em ?? "")))
    .slice(0, limite)
    .map((x) => ({ ...x, id: `${x.colecao}-${x.reg.id}`, data: x.reg.data, ...destino(x.colecao, x.reg) }));
}
