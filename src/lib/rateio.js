/**
 * Rateio de uma despesa entre várias culturas e/ou fazendas: cada combinação
 * marcada vira uma despesa com a sua parte do valor (ver components/RateioDespesa).
 */

import { chaveCultura } from "./talhoes";

const n = (v) => Number(v) || 0;

/** Rateio vazio: nenhuma cultura/fazenda marcada, divisão igual. */
export const RATEIO_VAZIO = { culturas: [], fazendas: [], modo: "igual", manual: null };

/** As combinações marcadas: uma linha por cultura × fazenda (o que não foi marcado fica `null`). */
function combinacoes({ culturas, fazendas }) {
  const cs = culturas.length ? culturas : [null];
  const fs = fazendas.length ? fazendas : [null];
  return cs.flatMap((cultura) => fs.map((fazenda) => ({ chave: `${cultura ?? "-"}|${fazenda ?? "-"}`, cultura, fazenda })));
}

/** Hectares de uma linha: talhões daquela cultura e/ou fazenda (a fazenda sozinha usa a área dela, se tiver). */
function hectares(dados, { cultura, fazenda }) {
  const ts = (dados.talhoes ?? []).filter((t) => t.ativo !== false
    && (!cultura || chaveCultura(t) === cultura) && (!fazenda || t.fazenda_id === fazenda));
  const soma = ts.reduce((s, t) => s + n(t.area_ha), 0);
  if (soma || cultura || !fazenda) return soma;
  return n(dados.fazendas?.find((f) => f.id === fazenda)?.area_ha);
}

/** Reparte `total` (em centavos, sem sobra) pelos pesos; o arredondamento fica na última linha. */
function repartir(total, pesos) {
  const centavos = Math.round(n(total) * 100);
  const somaPesos = pesos.reduce((s, p) => s + p, 0);
  let usado = 0;
  return pesos.map((p, i) => {
    if (i === pesos.length - 1) return (centavos - usado) / 100;
    const parte = Math.round((centavos * p) / somaPesos);
    usado += parte;
    return parte / 100;
  });
}

/**
 * As linhas do rateio com o valor de cada uma: `[{ chave, cultura, fazenda, valor }]`.
 * Divisão igual, pela área (cai para igual se nenhuma linha tiver área) ou
 * os valores digitados (`manual`).
 */
export function linhasDoRateio(rateio, total, dados) {
  const linhas = combinacoes(rateio);
  let pesos = linhas.map(() => 1);
  if (rateio.modo === "area") {
    const areas = linhas.map((l) => hectares(dados, l));
    if (areas.some((a) => a > 0)) pesos = areas;
  }
  const auto = repartir(total, pesos);
  return linhas.map((l, i) => ({ ...l, valor: rateio.manual?.[l.chave] ?? auto[i] }));
}

