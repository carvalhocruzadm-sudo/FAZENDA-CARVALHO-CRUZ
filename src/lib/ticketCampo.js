/**
 * A conta do ticket da balança lançado no celular (Modo Campo → Ticket).
 *
 * Laranja (cultura colhida por turma) vem em bags: o peso do ticket ÷ total
 * de bags dá o peso de cada bag. Cada talhão fica com o peso dos bags que
 * saíram dele, e cada turma com o peso dos bags que ela colheu (para pagar
 * pelo valor por tonelada dela).
 *
 * Como o ticket não diz qual turma colheu em qual talhão, a carga é repartida
 * na proporção: talhão com 60% dos bags × turma com 50% dos bags = 30% do
 * peso numa linha. Assim a soma por talhão e a soma por turma batem certinho.
 *
 * Cultura sem bags (milho, silagem…) em vários talhões: divide pela área.
 */

import { ESQUEMA, LARANJA_TERCEIROS, prepararRegistro, registroNovo } from "./esquema";
import { dividirQuantidade } from "./talhoes";
import { chaveTurma, culturasDaTurma } from "./turmas";

const n = (v) => Number(v) || 0;

/** Divide `total` pelos pesos, com `casas` decimais; a última parte leva a sobra para a soma bater. */
export function repartir(total, pesos, casas = 1) {
  const soma = pesos.reduce((a, b) => a + n(b), 0);
  let resto = n(total);
  return pesos.map((p, i) => {
    if (i === pesos.length - 1) return +resto.toFixed(casas);
    const parte = soma ? +((n(total) * n(p)) / soma).toFixed(casas) : 0;
    resto -= parte;
    return parte;
  });
}

/**
 * @param r {
 *   talhoes: [{ id, nome, area_ha, cultura_id }],
 *   bagsTalhao: { [talhao_id]: número },   // só quando a carga vem em bags; sem talhão: { carga: número }
 *   turmas: [{ nome, bags, valor }],       // vazio = turma não informada
 *   peso: kg do ticket,
 * }
 * @returns {{ linhas: [{ talhao, turma, peso_liquido, volumes, custo_ton }], totalBags, kgPorBag, porTurma: [{ nome, bags, kg, valor, pagar }], porTalhao: [{ talhao, bags, kg }] }}
 */
export function repartirTicket({ talhoes, bagsTalhao, turmas, peso, emBags }) {
  const total = n(peso);
  const bags = talhoes.length ? talhoes.map((t) => n(bagsTalhao?.[t.id])) : [n(bagsTalhao?.carga)];
  const totalBags = emBags ? bags.reduce((a, b) => a + b, 0) : 0;
  const kgPorBag = totalBags > 0 ? total / totalBags : null;

  // Peso de cada talhão: pelos bags; sem bags, pela área.
  const pesoTalhao = !talhoes.length ? [total]
    : emBags ? repartir(total, bags) : dividirQuantidade(total, talhoes, 1);
  const listaTalhoes = talhoes.length ? talhoes : [null];
  const listaTurmas = turmas.length ? turmas : [null];
  const bagsTurmas = listaTurmas.map((k) => n(k?.bags));
  const somaTurmas = bagsTurmas.reduce((a, b) => a + b, 0);

  const linhas = [];
  listaTalhoes.forEach((t, i) => {
    // Cada talhão reparte o peso (e os bags) dele entre as turmas, na proporção dos bags de cada turma.
    const pesosTurma = somaTurmas > 0 ? bagsTurmas : listaTurmas.map(() => 1);
    const kgs = repartir(pesoTalhao[i], pesosTurma);
    const vols = emBags ? repartir(bags[i], pesosTurma, 1) : listaTurmas.map(() => null);
    listaTurmas.forEach((k, j) => {
      linhas.push({
        talhao: t, turma: k?.nome ?? null, custo_ton: k ? (k.valor === "" || k.valor == null ? null : n(k.valor)) : null,
        peso_liquido: kgs[j], volumes: vols[j],
      });
    });
  });

  const porTurma = turmas.map((k) => {
    const kg = linhas.filter((l) => l.turma === k.nome).reduce((a, l) => a + l.peso_liquido, 0);
    return { nome: k.nome, bags: n(k.bags), kg, valor: n(k.valor), pagar: (kg / 1000) * n(k.valor) };
  });
  const porTalhao = talhoes.map((t, i) => ({ talhao: t, bags: bags[i], kg: pesoTalhao[i] }));

  return { linhas, totalBags, kgPorBag, porTurma, porTalhao };
}

// ─── O que o celular e o computador usam igual ──────────────────────────────

/** "Sem fazenda" para os talhões que não têm fazenda no cadastro. */
export const SEM_FAZENDA = "sem";

/**
 * O que muda conforme a cultura: os talhões dela (nenhum marcado com ela =
 * todos), as fazendas desses talhões e as turmas conhecidas.
 */
export function daCultura(dados, culturaId) {
  const cultura = dados.culturas.find((c) => c.id === culturaId);
  const emBags = Boolean(cultura?.turma_colheita);
  // Laranja de terceiros: não tem fazenda nem talhão, pergunta o proprietário.
  if (culturaId === LARANJA_TERCEIROS) {
    return { cultura, emBags, deTerceiros: true, talhoes: [], fazendas: [], proprietarios: proprietarios(dados), turmas: emBags && cultura ? turmasDaCultura(dados, cultura) : [] };
  }
  const ativos = dados.talhoes.filter((t) => t.ativo !== false).sort(ESQUEMA.talhoes.ordem);
  const daC = ativos.filter((t) => t.cultura_id === culturaId);
  const talhoes = daC.length ? daC : ativos;
  const ids = new Set(talhoes.map((t) => t.fazenda_id ?? SEM_FAZENDA));
  const fazendas = dados.fazendas
    .filter((f) => ids.has(f.id))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }))
    .map((f) => ({ id: f.id, nome: f.nome }));
  if (ids.has(SEM_FAZENDA)) fazendas.push({ id: SEM_FAZENDA, nome: "Outros talhões" });
  return { cultura, emBags, talhoes, fazendas, turmas: emBags && cultura ? turmasDaCultura(dados, cultura) : [] };
}

/** Os proprietários de laranja de terceiros já lançados, os mais recentes primeiro. */
export function proprietarios(dados) {
  const ultima = {};
  for (const v of dados.vendas) {
    const nome = String(v.proprietario ?? "").trim();
    if (nome && String(v.data ?? "") >= String(ultima[nome] ?? "")) ultima[nome] = v.data ?? "";
  }
  return Object.keys(ultima).sort((a, b) => String(ultima[b]).localeCompare(String(ultima[a])) || a.localeCompare(b, "pt-BR"));
}

/**
 * As turmas da cultura: as do cadastro de Turmas de colheita (desta cultura
 * ou sem cultura), a lista antiga da cultura e as dos tickets já lançados,
 * as que colheram por último primeiro.
 */
export function turmasDaCultura(dados, cultura) {
  // Laranja de terceiros é colhida pelas mesmas turmas da laranja (as das culturas de citros).
  const aceitas = new Set([cultura.id]);
  if (cultura.id === LARANJA_TERCEIROS) {
    for (const c of dados.culturas) if (c.grupo === cultura.grupo && c.turma_colheita) aceitas.add(c.id);
  }
  const ultima = {};
  for (const t of dados.turmas ?? []) {
    const delas = culturasDaTurma(t);
    if (t.ativo !== false && (!delas.length || delas.some((id) => aceitas.has(id)))) ultima[t.nome.trim()] = "";
  }
  for (const nome of String(cultura.turmas ?? "").split(",").map((x) => x.trim()).filter(Boolean)) ultima[nome] = "";
  for (const v of dados.vendas) {
    if (v.cultura_id === cultura.id && v.turma && String(v.data ?? "") >= String(ultima[v.turma] ?? "")) ultima[v.turma] = v.data ?? "";
  }
  return Object.keys(ultima).sort((a, b) => String(ultima[b]).localeCompare(String(ultima[a])) || a.localeCompare(b, "pt-BR"));
}

/** A turma no cadastro de Turmas de colheita, pelo nome. */
export const turmaDoCadastro = (dados, nome) => (dados.turmas ?? []).find((t) => chaveTurma(t.nome) === chaveTurma(nome));

/**
 * O valor por tonelada que já vem preenchido: o último que a turma cobrou;
 * sem histórico, o padrão da cultura. Muda a cada colheita, por isso não fica
 * no cadastro da turma.
 */
export function ultimoValorDaTurma(dados, cultura, nome) {
  const ultima = dados.vendas
    .filter((v) => v.turma === nome && v.custo_ton != null)
    .sort((a, b) => String(b.data).localeCompare(String(a.data)))[0];
  return ultima ? ultima.custo_ton : cultura?.custo_turma_ton ?? null;
}

/**
 * As vendas de um ticket (uma por talhão e por turma, de `repartirTicket`),
 * sem comprador e sem preço. `aConferir`: fica esperando a aprovação do
 * escritório. `extras`: campos iguais em todas as linhas (placa, pesos da
 * balança…). Devolve { regs } ou { erro }.
 */
export function registrosDoTicket(dados, { cultura, emBags, linhas, data, foto, observacao, aConferir, extras }) {
  const regs = [];
  for (const l of linhas) {
    const { reg, erro } = prepararRegistro("vendas", {
      ...registroNovo("vendas"),
      data,
      cultura_id: l.talhao?.cultura_id ?? cultura.id,
      unidade: cultura.unidade || "t",
      talhao_id: l.talhao?.id ?? null,
      peso_liquido: l.peso_liquido,
      volumes: l.volumes,
      turma: emBags ? l.turma : null,
      custo_ton: emBags ? l.custo_ton ?? cultura.custo_turma_ton ?? null : null,
      a_conferir: Boolean(aConferir),
      foto_ticket: foto ?? null,
      observacao,
      // Da foto do ticket ou digitado: placa, tipo de carro, comprador… (e tara/bruto se a carga não foi repartida).
      ...extras,
    }, dados);
    if (erro) return { erro };
    regs.push(reg);
  }
  return { regs };
}
