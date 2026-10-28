/**
 * O sistema é organizado pelas culturas: cada cultura tem a sua tela
 * (talhões, atividades, colheita e vendas, custos, planejamento e
 * indicadores) e o que é da fazenda toda (dinheiro, estoque, diesel,
 * máquinas) fica nas telas gerais, que mostram todas as culturas juntas.
 *
 * A tela de uma cultura tem o id "cultura:<id da cultura>".
 */

import { ESQUEMA } from "./esquema";

export const telaDaCultura = (id) => `cultura:${id}`;
export const culturaDaTela = (tela) => (String(tela ?? "").startsWith("cultura:") ? tela.slice(8) : null);

/**
 * Coleções com cultura que NÃO entram no recorte: as compras de produto
 * têm "comprado para a cultura", mas o estoque e o custo médio são da
 * fazenda toda (senão o custo das aplicações sai errado).
 */
const FORA_DO_RECORTE = new Set(["culturas", "insumo_entradas"]);

/**
 * Os dados só desta cultura: cada coleção que tem cultura fica só com os
 * registros dela (talhões, vendas, aplicações, despesas da cultura…). O
 * resto (produtos, máquinas, pessoas, fazendas) continua inteiro.
 */
export function dadosDaCultura(dados, cultura) {
  const saida = { ...dados };
  for (const [colecao, def] of Object.entries(ESQUEMA)) {
    const lista = dados[colecao];
    if (!lista || FORA_DO_RECORTE.has(colecao)) continue;
    if (def.campos.cultura_id) saida[colecao] = lista.filter((r) => r.cultura_id === cultura);
    else if (def.campos.culturas?.tipo === "refs") saida[colecao] = lista.filter((r) => !r.culturas?.length || r.culturas.includes(cultura));
  }
  return saida;
}

/** Onde cada lançamento fica dentro da tela da cultura: [aba, sub-aba]. */
const NA_CULTURA = {
  talhoes: ["talhoes", "talhoes"], safras: ["talhoes", "safras"],
  aplicacoes: ["atividades", "aplicacoes"], operacoes: ["atividades", "operacoes"],
  abastecimentos: ["atividades", "abastecimentos"], pulverizacoes: ["atividades", "ordens"],
  vendas: ["vendas", "vendas"], colheitas: ["vendas", "colheitas"], recebimentos: ["vendas", "recebimentos"],
  despesas: ["custos", "despesas"], planejamento: ["planejamento"],
};

/** Sem cultura, o lançamento é visto nas telas gerais da fazenda: [tela, aba]. */
const NA_FAZENDA = {
  aplicacoes: ["quimicos", "aplicacoes"], pulverizacoes: ["quimicos", "ordens"], insumo_entradas: ["quimicos", "insumo_entradas"],
  insumos: ["cadastros", "insumos"], operacoes: ["maquinas", "operacoes"], revisoes: ["maquinas", "revisoes"],
  maquinas: ["cadastros", "maquinas"], abastecimentos: ["diesel", "abastecimentos"], diesel_entradas: ["diesel", "diesel_entradas"],
  fretes: ["fretes", "fretes"], recebimentos: ["comercial", "recebimentos"], vendas: ["comercial", "tickets"],
  despesas: ["financeiro", "despesas"], entradas: ["financeiro", "entradas"], funcionarios: ["equipe"],
  chuvas: ["pluviometro", "chuvas"], talhoes: ["cadastros", "fazendas"], boletos: ["boletos"],
};

/**
 * Para onde levar quem quer ver um registro (aviso do campo, pendência):
 * { tela, aba, sub }. Com cultura, vai para a tela da cultura.
 */
export function destinoDoRegistro(colecao, reg) {
  const cultura = reg?.cultura_id;
  if (cultura && NA_CULTURA[colecao]) {
    const [aba, sub] = NA_CULTURA[colecao];
    return { tela: telaDaCultura(cultura), aba, sub };
  }
  const [tela, aba] = NA_FAZENDA[colecao] ?? ["inicio"];
  return { tela, aba };
}

/** Um desenho para cada cultura no menu (pelo nome; se não achar, pelo tipo). */
const EMOJI_NOME = [[/abóbora|abobora/i, "🎃"], [/amendoim/i, "🥜"], [/milho verde/i, "🌽"], [/milho/i, "🌽"], [/laranja|limão|limao|tangerina/i, "🍊"],
  [/silagem|capim/i, "🌾"], [/soja|feij/i, "🫘"], [/confinamento|gado|boi/i, "🐂"]];
const EMOJI_GRUPO = { citros: "🍊", graos: "🌽", hortalicas: "🥬", forragem: "🌾", pecuaria: "🐂" };

export function emojiDaCultura(c) {
  return EMOJI_NOME.find(([re]) => re.test(c?.nome ?? ""))?.[1] ?? EMOJI_GRUPO[c?.grupo] ?? "🌱";
}

/** Culturas ativas, em ordem alfabética. */
export const culturasAtivas = (dados) => (dados.culturas ?? [])
  .filter((c) => c.ativo !== false)
  .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
