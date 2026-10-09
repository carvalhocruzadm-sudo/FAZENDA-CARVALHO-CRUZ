/**
 * Turmas de colheita: quanto cada uma colheu e tem a receber por semana
 * (segunda a domingo). A conta sai das vendas: peso (t) × valor por tonelada
 * da turma em cada carga. Os pagamentos ficam em pagamentos_turmas, com a
 * semana que pagaram.
 *
 * A venda guarda o nome da turma (texto); o cadastro é ligado pelo nome,
 * sem diferença de maiúscula, minúscula ou espaço.
 */

import { segundaDaSemana } from "./esquema";

const n = (v) => Number(v) || 0;
export const chaveTurma = (nome) => String(nome ?? "").trim().toLowerCase();

/** "2026-10-05" + dias. */
export function somarDias(iso, dias) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Uma linha por turma (as cadastradas ativas e as que aparecem nas vendas da
 * semana), com as cargas da semana, o que tem a pagar, o que já foi pago e o
 * que falta. `aPagar` conta só as cargas com valor por tonelada;
 * `semValor` são os kg das cargas que estão sem ele (falta conferir).
 */
export function turmasDaSemana(dados, segunda) {
  const domingo = somarDias(segunda, 6);
  const linhas = new Map();
  const linha = (nome, turma = null) => {
    const k = chaveTurma(nome);
    if (!linhas.has(k)) {
      linhas.set(k, { chave: k, nome: turma?.nome ?? String(nome).trim(), turma, cargas: [], bags: 0, kg: 0, aPagar: 0, semValor: 0, pago: 0, pagamentos: [] });
    }
    const l = linhas.get(k);
    if (turma && !l.turma) { l.turma = turma; l.nome = turma.nome; }
    return l;
  };

  for (const t of dados.turmas ?? []) if (t.ativo !== false) linha(t.nome, t);
  for (const v of dados.vendas) {
    if (!v.turma || !v.data || v.data < segunda || v.data > domingo) continue;
    const cadastro = (dados.turmas ?? []).find((t) => chaveTurma(t.nome) === chaveTurma(v.turma));
    const l = linha(v.turma, cadastro);
    const kg = n(v.peso_liquido);
    l.cargas.push(v);
    l.bags += n(v.volumes);
    l.kg += kg;
    if (v.custo_ton == null || v.custo_ton === "") l.semValor += kg;
    else l.aPagar += (kg / 1000) * n(v.custo_ton);
  }
  for (const p of dados.pagamentos_turmas ?? []) {
    if (segundaDaSemana(p.semana ?? p.data) !== segunda) continue;
    const turma = (dados.turmas ?? []).find((t) => t.id === p.turma_id);
    if (!turma) continue;
    const l = linha(turma.nome, turma);
    l.pago += n(p.valor);
    l.pagamentos.push(p);
  }

  return [...linhas.values()]
    .map((l) => ({ ...l, aPagar: +l.aPagar.toFixed(2), falta: +(l.aPagar - l.pago).toFixed(2) }))
    .sort((a, b) => b.kg - a.kg || a.nome.localeCompare(b.nome, "pt-BR"));
}
