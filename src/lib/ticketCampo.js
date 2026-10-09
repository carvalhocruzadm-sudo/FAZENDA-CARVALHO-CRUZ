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

import { dividirQuantidade } from "./talhoes";

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
