/**
 * Contas da fazenda — tudo derivado dos lançamentos, nada guardado à parte.
 * Assim um lançamento corrigido corrige na hora o saldo, o custo e o alerta.
 */

import { kgPorUnidade } from "./esquema";

const n = (v) => Number(v) || 0;
const soma = (lista, f) => lista.reduce((t, x) => t + n(f(x)), 0);

// ─── Períodos ───────────────────────────────────────────────────────────────

export const PERIODOS = [
  ["mes", "Este mês"], ["mes_passado", "Mês passado"], ["ano", "Este ano"],
  ["safra", "Últimos 12 meses"], ["tudo", "Tudo"],
];

export function intervalo(periodo, base = new Date()) {
  const a = base.getFullYear(), m = base.getMonth();
  const iso = (d) => d.toISOString().slice(0, 10);
  switch (periodo) {
    case "mes": return [iso(new Date(Date.UTC(a, m, 1))), iso(new Date(Date.UTC(a, m + 1, 0)))];
    case "mes_passado": return [iso(new Date(Date.UTC(a, m - 1, 1))), iso(new Date(Date.UTC(a, m, 0)))];
    case "ano": return [`${a}-01-01`, `${a}-12-31`];
    case "safra": return [iso(new Date(Date.UTC(a - 1, m, base.getDate() + 1))), iso(new Date(Date.UTC(a, m, base.getDate())))];
    default: return [null, null];
  }
}

export function noPeriodo(lista, periodo) {
  const [de, ate] = intervalo(periodo);
  if (!de) return lista;
  return lista.filter((x) => x.data && x.data >= de && x.data <= ate);
}

// ─── Máquinas ───────────────────────────────────────────────────────────────

/** Maior horímetro/km conhecido da máquina, somando todos os lançamentos. */
export function ultimaLeitura(dados, maquinaId) {
  const m = dados.maquinas.find((x) => x.id === maquinaId);
  const leituras = [
    n(m?.leitura_inicial),
    ...dados.operacoes.filter((o) => o.maquina_id === maquinaId).map((o) => n(o.leitura_final)),
    ...dados.abastecimentos.filter((a) => a.maquina_id === maquinaId).map((a) => n(a.leitura)),
    ...dados.revisoes.filter((r) => r.maquina_id === maquinaId).map((r) => n(r.leitura)),
  ];
  return Math.max(0, ...leituras);
}

/**
 * Situação da revisão: a próxima é a última revisão programada (ou troca de
 * óleo) + o intervalo. Sem revisão lançada, conta da leitura do cadastro.
 */
export function situacaoRevisao(dados, maquina) {
  const intervaloRev = n(maquina.intervalo_revisao);
  const atual = ultimaLeitura(dados, maquina.id);
  if (!intervaloRev || maquina.medidor === "nenhum") return { atual, proxima: null, faltam: null, estado: "sem" };
  const ultimas = dados.revisoes
    .filter((r) => r.maquina_id === maquina.id && ["revisao", "oleo"].includes(r.tipo) && r.leitura != null)
    .map((r) => n(r.leitura));
  const base = ultimas.length ? Math.max(...ultimas) : n(maquina.leitura_inicial);
  const proxima = base + intervaloRev;
  const faltam = proxima - atual;
  const estado = faltam <= 0 ? "vencida" : faltam <= intervaloRev * 0.1 ? "proxima" : "ok";
  return { atual, proxima, faltam, estado };
}

// ─── Diesel ─────────────────────────────────────────────────────────────────

export function diesel(dados) {
  const entradas = dados.diesel_entradas;
  const litrosEntrada = soma(entradas, (e) => e.litros);
  const valorEntrada = soma(entradas, (e) => e.valor);
  const saidas = dados.abastecimentos.filter((a) => a.origem === "tanque");
  const litrosSaida = soma(saidas, (a) => a.litros);
  return {
    saldo: litrosEntrada - litrosSaida,
    precoMedio: litrosEntrada ? valorEntrada / litrosEntrada : 0,
    litrosEntrada, litrosSaida,
  };
}

/** Custo de um abastecimento: no posto é o que se pagou; do tanque, litros × preço médio. */
export function custoAbastecimento(a, precoMedio) {
  return a.origem === "posto" ? n(a.valor) : n(a.litros) * precoMedio;
}

/** Consumo por máquina no período: litros, horas/km trabalhados e média. */
export function consumoPorMaquina(dados, periodo) {
  const abast = noPeriodo(dados.abastecimentos, periodo);
  const ops = noPeriodo(dados.operacoes, periodo);
  return dados.maquinas
    .filter((m) => m.medidor !== "nenhum")
    .map((m) => {
      const litros = soma(abast.filter((a) => a.maquina_id === m.id), (a) => a.litros);
      const trabalhado = soma(ops.filter((o) => o.maquina_id === m.id), (o) => o.trabalhado);
      const media = m.medidor === "km"
        ? (litros ? trabalhado / litros : null) // km/L
        : (trabalhado ? litros / trabalhado : null); // L/h
      return { maquina: m, litros, trabalhado, media };
    })
    .filter((x) => x.litros || x.trabalhado);
}

// ─── Químicos / insumos ─────────────────────────────────────────────────────

/**
 * Estoque de cada produto: quantidade inicial + entradas + balanços −
 * aplicações (a sobra que voltou da pulverização é aplicação negativa). O
 * custo médio só conta as entradas com preço: a que chegou pelo depósito e
 * ainda não foi conferida não o derruba.
 */
export function estoqueInsumos(dados) {
  const mapa = new Map();
  for (const i of dados.insumos) mapa.set(i.id, { insumo: i, entrada: 0, saida: 0, valorEntrada: 0, qtdComPreco: 0, ajuste: 0, qtdComCusto: 0, valorAjuste: 0 });
  for (const e of dados.insumo_entradas) {
    const x = mapa.get(e.insumo_id);
    if (!x) continue;
    x.entrada += n(e.quantidade);
    if (n(e.valor) > 0) { x.valorEntrada += n(e.valor); x.qtdComPreco += n(e.quantidade); }
  }
  // Quantidade que já existia quando o produto foi cadastrado (não é compra).
  for (const x of mapa.values()) {
    const q = n(x.insumo.estoque_inicial);
    x.ajuste += q;
    if (q > 0 && n(x.insumo.custo_inicial) > 0) {
      x.qtdComCusto += q;
      x.valorAjuste += q * n(x.insumo.custo_inicial);
    }
  }
  // Balanço: ajusta o saldo, mas não é compra (não entra nas despesas).
  for (const a of dados.insumo_ajustes ?? []) {
    const x = mapa.get(a.insumo_id);
    if (!x) continue;
    x.ajuste += n(a.quantidade);
    if (n(a.quantidade) > 0 && n(a.custo_unitario) > 0) {
      x.qtdComCusto += n(a.quantidade);
      x.valorAjuste += n(a.quantidade) * n(a.custo_unitario);
    }
  }
  for (const a of dados.aplicacoes) {
    const x = mapa.get(a.insumo_id);
    if (x) x.saida += n(a.quantidade);
  }
  return [...mapa.values()].map((x) => {
    const baseQtd = x.qtdComPreco + x.qtdComCusto;
    const custoMedio = baseQtd ? (x.valorEntrada + x.valorAjuste) / baseQtd : 0;
    const saldo = x.entrada + x.ajuste - x.saida;
    const minimo = n(x.insumo.estoque_minimo);
    return {
      ...x, saldo, custoMedio, valorEstoque: Math.max(0, saldo) * custoMedio,
      baixo: minimo > 0 && saldo <= minimo, negativo: saldo < 0,
    };
  });
}

// ─── Custos e resultado ─────────────────────────────────────────────────────

/**
 * Custo por cultura e por talhão no período, pelo que foi CONSUMIDO:
 *   despesas com centro de custo na cultura/talhão
 *   + químicos aplicados (quantidade × custo médio do produto)
 *   + diesel dos abastecimentos marcados com talhão/cultura
 * O que não tem cultura (despesa geral, revisões, diesel sem talhão) fica em
 * "Geral da fazenda".
 */
export function custos(dados, periodo) {
  const custoMedio = new Map(estoqueInsumos(dados).map((x) => [x.insumo.id, x.custoMedio]));
  const { precoMedio } = diesel(dados);
  const talhaoPorId = new Map(dados.talhoes.map((t) => [t.id, t]));

  const linhas = []; // { cultura_id, talhao_id, origem, valor }
  for (const d of noPeriodo(dados.despesas, periodo)) {
    linhas.push({ cultura_id: d.centro === "geral" ? null : d.cultura_id, talhao_id: d.centro === "talhao" ? d.talhao_id : null, origem: d.categoria || "Despesa", valor: n(d.valor) });
  }
  for (const a of noPeriodo(dados.aplicacoes, periodo)) {
    linhas.push({ cultura_id: a.cultura_id ?? talhaoPorId.get(a.talhao_id)?.cultura_id ?? null, talhao_id: a.talhao_id, origem: "Químicos/insumos aplicados", valor: n(a.quantidade) * (custoMedio.get(a.insumo_id) ?? 0) });
  }
  for (const a of noPeriodo(dados.abastecimentos, periodo)) {
    linhas.push({ cultura_id: a.cultura_id ?? talhaoPorId.get(a.talhao_id)?.cultura_id ?? null, talhao_id: a.talhao_id ?? null, origem: "Diesel", valor: custoAbastecimento(a, precoMedio) });
  }
  for (const r of noPeriodo(dados.revisoes, periodo)) {
    linhas.push({ cultura_id: null, talhao_id: null, origem: "Manutenção de máquinas", valor: n(r.valor) });
  }

  const vendas = noPeriodo(dados.vendas, periodo);
  const colheitas = noPeriodo(dados.colheitas, periodo);

  const porCultura = new Map();
  const chaveC = (id) => id ?? "geral";
  const obterC = (id) => {
    const k = chaveC(id);
    if (!porCultura.has(k)) porCultura.set(k, { cultura_id: id ?? null, custo: 0, receita: 0, porOrigem: {} });
    return porCultura.get(k);
  };
  for (const l of linhas) {
    const c = obterC(l.cultura_id);
    c.custo += l.valor;
    c.porOrigem[l.origem] = (c.porOrigem[l.origem] ?? 0) + l.valor;
  }
  for (const v of vendas) obterC(v.cultura_id).receita += n(v.valor);

  const porTalhao = dados.talhoes.map((t) => {
    const custo = soma(linhas.filter((l) => l.talhao_id === t.id), (l) => l.valor);
    const vendido = vendas.filter((v) => v.talhao_id === t.id);
    const receita = soma(vendido, (v) => v.valor);
    const cultura = dados.culturas.find((c) => c.id === t.cultura_id);
    const kg = kgColhidos(dados, colheitas.filter((c) => c.talhao_id === t.id), vendido);
    const area = n(t.area_ha);
    return { talhao: t, custo, receita, kg, custoHa: area ? custo / area : null, produtividade: produtividade(cultura, t, kg) };
  });

  const custoTotal = soma(linhas, (l) => l.valor);
  const receitaTotal = soma(vendas, (v) => v.valor);
  return {
    porCultura: [...porCultura.values()].sort((a, b) => b.custo - a.custo),
    porTalhao,
    custoTotal, receitaTotal, resultado: receitaTotal - custoTotal,
  };
}

// ─── Financeiro (caixa) ─────────────────────────────────────────────────────

const CATEGORIA_DO_INSUMO = {
  adubo: "Adubos", corretivo: "Adubos", foliar: "Adubos", semente: "Sementes",
  racao: "Alimentação", medicamento: "Produtos químicos",
};

/**
 * Todas as saídas de dinheiro do período, nas categorias da planilha
 * FINANCEIRO: as despesas lançadas + compras de diesel (Combustíveis) +
 * compras de químicos/adubos + abastecimento em posto + revisões (Peças).
 */
export function saidasDoPeriodo(dados, periodo) {
  const tipoInsumo = new Map(dados.insumos.map((i) => [i.id, i.tipo]));
  const linhas = [
    ...noPeriodo(dados.despesas, periodo).map((d) => ({ data: d.data, categoria: d.categoria || "Outros", descricao: d.descricao, favorecido: d.favorecido, valor: n(d.valor), origem: "despesas", id: d.id })),
    ...noPeriodo(dados.diesel_entradas, periodo).map((d) => ({ data: d.data, categoria: "Combustíveis", descricao: `Diesel ${n(d.litros)} L (tanque)`, favorecido: d.fornecedor, valor: n(d.valor), origem: "diesel_entradas", id: d.id })),
    ...noPeriodo(dados.abastecimentos, periodo).filter((a) => a.origem === "posto").map((a) => ({ data: a.data, categoria: "Combustíveis", descricao: `Posto ${n(a.litros)} L`, favorecido: a.posto, valor: n(a.valor), origem: "abastecimentos", id: a.id })),
    ...noPeriodo(dados.insumo_entradas, periodo).map((e) => ({ data: e.data, categoria: CATEGORIA_DO_INSUMO[tipoInsumo.get(e.insumo_id)] ?? "Produtos químicos", descricao: "Compra de insumo", favorecido: e.fornecedor, valor: n(e.valor), origem: "insumo_entradas", id: e.id })),
    ...noPeriodo(dados.revisoes, periodo).map((r) => ({ data: r.data, categoria: "Peças", descricao: r.descricao || "Revisão / manutenção", favorecido: r.oficina, valor: n(r.valor), origem: "revisoes", id: r.id })),
  ];
  const porCategoria = {};
  for (const l of linhas) porCategoria[l.categoria] = (porCategoria[l.categoria] ?? 0) + l.valor;
  return { linhas, porCategoria, total: soma(linhas, (l) => l.valor) };
}

/** Entradas de dinheiro: recebimentos de vendas + fretes + outras entradas. */
export function entradasDoPeriodo(dados, periodo) {
  const recebido = soma(noPeriodo(dados.recebimentos, periodo), (r) => r.valor);
  const fretes = soma(noPeriodo(dados.fretes, periodo), (f) => f.valor);
  const outras = soma(noPeriodo(dados.entradas, periodo), (e) => e.valor);
  return { recebido, fretes, outras, total: recebido + fretes + outras };
}

/** Quanto cada comprador ainda deve: vendas líquidas − recebimentos (tudo, sem período). */
export function aReceber(dados) {
  const mapa = new Map();
  const chave = (nome) => String(nome || "").trim().toUpperCase();
  const obter = (nome) => {
    const k = chave(nome);
    if (!mapa.has(k)) mapa.set(k, { comprador: String(nome || "").trim(), vendido: 0, recebido: 0, cargas: 0 });
    return mapa.get(k);
  };
  for (const v of dados.vendas) { const x = obter(v.comprador); x.vendido += n(v.valor); x.cargas++; }
  for (const r of dados.recebimentos) obter(r.comprador).recebido += n(r.valor);
  return [...mapa.values()].map((x) => ({ ...x, saldo: x.vendido - x.recebido })).sort((a, b) => b.saldo - a.saldo);
}

/** Fretes do caminhão: faturamento, diesel e custos por caminhão. */
export function resumoFretes(dados, periodo) {
  const { precoMedio } = diesel(dados);
  const caminhoes = dados.maquinas.filter((m) => m.categoria === "caminhao");
  return caminhoes.map((c) => {
    const fretes = noPeriodo(dados.fretes, periodo).filter((f) => f.caminhao_id === c.id);
    const faturamento = soma(fretes, (f) => f.valor);
    const km = soma(fretes, (f) => f.km);
    const abast = noPeriodo(dados.abastecimentos, periodo).filter((a) => a.maquina_id === c.id);
    const litros = soma(abast, (a) => a.litros);
    const combustivel = soma(abast, (a) => custoAbastecimento(a, precoMedio));
    const outros = soma(noPeriodo(dados.despesas, periodo).filter((d) => d.maquina_id === c.id), (d) => d.valor)
      + soma(noPeriodo(dados.revisoes, periodo).filter((r) => r.maquina_id === c.id), (r) => r.valor);
    return { caminhao: c, viagens: fretes.length, faturamento, km, litros, combustivel, outros, resultado: faturamento - combustivel - outros, porKm: km ? faturamento / km : null };
  });
}

/** Planejado × realizado por safra: o planejamento soma dose × ha × preço. */
export function resumoPlanejamento(dados) {
  const mapa = new Map();
  for (const p of dados.planejamento) {
    const k = p.safra || "(sem safra)";
    if (!mapa.has(k)) mapa.set(k, { safra: k, cultura_id: p.cultura_id, total: 0, porFase: {}, haPorFazenda: {}, itens: 0 });
    const x = mapa.get(k);
    x.total += n(p.total);
    x.porFase[p.fase] = (x.porFase[p.fase] ?? 0) + n(p.total);
    // Cada fazenda entra uma vez com a sua área (os itens repetem o hectare).
    const f = p.fazenda_id ?? "-";
    x.haPorFazenda[f] = Math.max(x.haPorFazenda[f] ?? 0, n(p.hectares));
    x.itens++;
  }
  return [...mapa.values()].map((x) => {
    const hectares = soma(Object.values(x.haPorFazenda), (h) => h);
    return { ...x, hectares, porHa: hectares ? x.total / hectares : null };
  });
}

// ─── Produtividade ──────────────────────────────────────────────────────────

/**
 * Quilos colhidos num talhão: pelas colheitas lançadas; se não houver
 * nenhuma, pelo peso das cargas vendidas (os tickets da balança). Nunca soma
 * os dois, senão a mesma carga contaria duas vezes.
 */
export function kgColhidos(dados, colheitas, vendas) {
  const culturaDe = (id) => dados.culturas.find((c) => c.id === id);
  if (colheitas.length) {
    return soma(colheitas, (c) => n(c.quantidade) * (kgPorUnidade(c.unidade, culturaDe(c.cultura_id)) ?? 0));
  }
  return soma(vendas, (v) => v.peso_liquido ?? n(v.quantidade) * (kgPorUnidade(v.unidade, culturaDe(v.cultura_id)) ?? 0));
}

/**
 * Produtividade na medida escolhida no cadastro da cultura (t/ha, sc/ha,
 * kg/pé…). Devolve { valor, sigla } ou null quando falta área, nº de pés ou peso.
 */
export function produtividade(cultura, talhao, kg) {
  if (!cultura || !kg) return null;
  const area = n(talhao.area_ha), pes = n(talhao.pes);
  const saca = n(cultura.peso_saca) || 60;
  switch (cultura.produtividade) {
    case "t_ha": return area ? { valor: kg / 1000 / area, sigla: "t/ha" } : null;
    case "sc_ha": return area ? { valor: kg / saca / area, sigla: "sc/ha" } : null;
    case "kg_ha": return area ? { valor: kg / area, sigla: "kg/ha" } : null;
    case "kg_pe": return pes ? { valor: kg / pes, sigla: "kg/pé" } : null;
    case "cx_pe": return pes ? { valor: kg / 40.8 / pes, sigla: "cx/pé" } : null;
    default: return null;
  }
}

// ─── Por fazenda / talhão ───────────────────────────────────────────────────

/**
 * Tudo o que aconteceu em cada lugar, uma linha por lançamento: despesas,
 * químicos aplicados, diesel, operações de máquina, colheitas e vendas.
 * A fazenda vem do próprio lançamento (despesa) ou do talhão dele. Custo dos
 * químicos e do diesel do tanque pelo custo médio, como em `custos`.
 * O que não tem talhão nem fazenda (revisão, despesa geral sem fazenda) fica
 * de fora — está em Financeiro.
 */
export function lancamentosPorLocal(dados, periodo) {
  const custoMedio = new Map(estoqueInsumos(dados).map((x) => [x.insumo.id, x.custoMedio]));
  const { precoMedio } = diesel(dados);
  const talhaoPorId = new Map(dados.talhoes.map((t) => [t.id, t]));
  const linha = (tipo, colecao, r, extra) => ({
    id: `${colecao}:${r.id}`, tipo, colecao, reg: r, data: r.data,
    talhao_id: r.talhao_id ?? null,
    fazenda_id: r.fazenda_id ?? talhaoPorId.get(r.talhao_id)?.fazenda_id ?? null,
    custo: 0, receita: 0, ...extra,
  });
  const linhas = [
    ...noPeriodo(dados.despesas, periodo).map((d) => linha("Despesa", "despesas", { ...d, talhao_id: d.centro === "talhao" ? d.talhao_id : null }, { custo: n(d.valor) })),
    ...noPeriodo(dados.aplicacoes, periodo).map((a) => linha("Aplicação", "aplicacoes", a, { custo: n(a.quantidade) * (custoMedio.get(a.insumo_id) ?? 0) })),
    ...noPeriodo(dados.abastecimentos, periodo).filter((a) => a.talhao_id).map((a) => linha("Diesel", "abastecimentos", a, { custo: custoAbastecimento(a, precoMedio) })),
    ...noPeriodo(dados.operacoes, periodo).filter((o) => o.talhao_id).map((o) => linha("Operação", "operacoes", o)),
    ...noPeriodo(dados.colheitas, periodo).map((c) => linha("Colheita", "colheitas", c)),
    ...noPeriodo(dados.vendas, periodo).filter((v) => v.talhao_id).map((v) => linha("Venda", "vendas", v, { receita: n(v.valor) })),
  ];
  return linhas
    .filter((l) => l.fazenda_id || l.talhao_id)
    .sort((a, b) => String(b.data ?? "").localeCompare(String(a.data ?? "")));
}

/** Totais de um conjunto de lançamentos (de uma fazenda ou de um talhão). */
export function totaisLocal(linhas) {
  const colhido = linhas.filter((l) => l.colecao === "colheitas");
  const ops = linhas.filter((l) => l.colecao === "operacoes");
  const custo = soma(linhas, (l) => l.custo);
  const receita = soma(linhas, (l) => l.receita);
  return {
    custo, receita, resultado: receita - custo,
    producao: soma(colhido, (l) => l.reg.quantidade), unidade: colhido[0]?.reg.unidade ?? null,
    horas: soma(ops, (l) => l.reg.trabalhado), operacoes: ops.length,
    ultima: linhas[0]?.data ?? null,
  };
}

export { soma };
