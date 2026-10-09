/**
 * Regras do depósito de químicos no Modo Campo: ordens de pulverização,
 * separação conferida pela foto e entradas (compra e sobra).
 */

import { numero } from "./formato";
import { dividirQuantidade, talhoesDaOrdem } from "./talhoes";

const n = (v) => Number(v) || 0;

const plural = (qtd, palavra) => {
  const p = String(palavra || "embalagem").toLowerCase();
  if (qtd === 1) return p;
  if (/ão$/.test(p)) return p.replace(/ão$/, "ões");
  if (/[aeiou]$/.test(p)) return `${p}s`;
  return `${p}es`;
};

/**
 * Quantidade em embalagens, que é como o tratorista pega no depósito:
 * 15 L em galão de 5 L → 3 galões. Sobra quebrada vira "e mais 2 L".
 */
export function emEmbalagens(insumo, quantidade) {
  const q = Math.abs(n(quantidade));
  const tam = n(insumo?.tamanho_embalagem);
  const un = insumo?.unidade || "";
  const tipo = insumo?.embalagem_tipo || "embalagem";
  if (!tam) return { cheias: 0, resto: q, texto: `${numero(q)} ${un}`, fala: `${numero(q)} ${un}` };
  const cheias = Math.floor(q / tam + 1e-9);
  const resto = +(q - cheias * tam).toFixed(3);
  const partes = [];
  if (cheias) partes.push(`${cheias} ${plural(cheias, tipo)} de ${numero(tam)} ${un}`);
  if (resto) partes.push(`${cheias ? "e mais " : ""}${numero(resto)} ${un}`);
  const texto = partes.join(" ") || `0 ${un}`;
  return { cheias, resto, texto, fala: texto };
}

/** Ordens esperando separação no depósito. */
export const ordensAbertas = (dados) => dados.pulverizacoes
  .filter((o) => o.situacao === "aberta" || !o.situacao)
  .sort((a, b) => String(a.data).localeCompare(String(b.data)));

/** Ordens que já saíram (para lançar a sobra que voltou). */
export const ordensSeparadas = (dados) => dados.pulverizacoes
  .filter((o) => o.situacao === "separada" || o.situacao === "concluida")
  .sort((a, b) => String(b.data).localeCompare(String(a.data)))
  .slice(0, 20);

/**
 * Os produtos de uma ordem, cada um com o produto do cadastro e se já foi
 * separado (já existe a saída dele para esta ordem).
 */
export function itensDaOrdem(dados, ordemId) {
  return dados.pulverizacao_itens
    .filter((i) => i.pulverizacao_id === ordemId)
    .map((item) => ({
      item,
      insumo: dados.insumos.find((x) => x.id === item.insumo_id),
      separado: dados.aplicacoes.some((a) => a.pulverizacao_id === ordemId && a.insumo_id === item.insumo_id && n(a.quantidade) > 0),
    }))
    .filter((x) => x.insumo)
    .sort((a, b) => a.insumo.nome.localeCompare(b.insumo.nome));
}

/**
 * Uma linha por talhão da ordem, com a parte da quantidade que cabe a ele
 * (dividida pela área), para o custo cair no talhão certo.
 */
function porTalhao(dados, ordem, quantidade, linha) {
  const talhoes = talhoesDaOrdem(dados, ordem);
  const partes = dividirQuantidade(quantidade, talhoes);
  const varios = talhoes.length > 1 ? ` · dividido entre ${talhoes.map((x) => x.talhao.nome).join(", ")} pela área` : "";
  return talhoes.map((x, i) => ({
    ...linha, quantidade: partes[i], pulverizacao_id: ordem.id,
    talhao_id: x.talhao.id, cultura_id: x.talhao.cultura_id ?? ordem.cultura_id ?? null,
    observacao: linha.observacao + varios,
    area_aplicada: linha.area_aplicada === undefined ? x.area_ha || null : linha.area_aplicada,
  }));
}

/** As saídas do estoque de um produto separado para a ordem (uma por talhão). */
export function saidaDaSeparacao(dados, ordem, item, operadorId, data) {
  return porTalhao(dados, ordem, n(item.quantidade), {
    data, insumo_id: item.insumo_id, dose_ha: item.dose_ha ?? null,
    responsavel_id: operadorId, maquina_id: ordem.maquina_id ?? null,
    observacao: "Separado no depósito (Modo Campo)",
  });
}

/** A sobra que voltou: aplicação negativa, para o estoque subir e o custo do talhão ficar certo. */
export function sobraDaOrdem(dados, ordem, insumoId, quantidade, operadorId, data) {
  return porTalhao(dados, ordem, -Math.abs(n(quantidade)), {
    data, insumo_id: insumoId, area_aplicada: null, dose_ha: null,
    responsavel_id: operadorId, maquina_id: ordem.maquina_id ?? null,
    observacao: "Sobra que voltou da pulverização (lançada no depósito)",
  });
}
