/**
 * Aplicações do agrônomo: quando ele marca vários talhões, cada talhão vira um
 * registro (para a baixa cair no talhão certo), mas na tela elas aparecem
 * juntas, uma linha por aplicação.
 */

/** Mesma aplicação = mesmo grupo_id. As antigas (sem grupo) juntam pelo que foi enviado junto. */
export function chaveGrupo(r) {
  if (r.grupo_id) return r.grupo_id;
  const produtos = (r.itens ?? []).map((i) => `${i.insumo_id}:${i.dose_ha}`).join(",");
  return [r.link_id, r.data, r.agronomo, r.alvo, r.calda_l_ha, r.cultura_id, produtos].join("|");
}

const SOMA_SITUACAO = (situacoes) => {
  const unicas = [...new Set(situacoes)];
  if (unicas.length === 1) return unicas[0];
  // Uma parte já aplicada e outra ainda aberta.
  return unicas.some((s) => s === "nova" || s === "aprovada") ? "parcial" : unicas.includes("aplicada") ? "aplicada" : unicas[0];
};

/**
 * `lista` de recomendações → [{ chave, recs, nome, data, agronomo, alvo, area_ha, situacao, itens, ... }]
 * Os itens somam o total de todos os talhões.
 */
export function agruparRecomendacoes(lista) {
  const grupos = new Map();
  for (const r of lista) {
    const k = chaveGrupo(r);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(r);
  }
  return [...grupos.entries()].map(([chave, recs]) => {
    const primeira = recs[0];
    const itens = (primeira.itens ?? []).map((i, n) => ({
      ...i, total: +recs.reduce((s, r) => s + (Number(r.itens?.[n]?.total) || 0), 0).toFixed(3),
    }));
    return {
      ...primeira, chave, recs, itens,
      nome: recs.find((r) => r.nome)?.nome ?? null,
      area_ha: +recs.reduce((s, r) => s + (Number(r.area_ha) || 0), 0).toFixed(2),
      situacao: SOMA_SITUACAO(recs.map((r) => r.situacao)),
      criado_em: recs.map((r) => r.criado_em).filter(Boolean).sort()[0] ?? primeira.criado_em,
    };
  });
}

/** O agrônomo passou a dose por pipa (tanque cheio) em vez de por hectare. */
export const porPipa = (r) => r?.dose_por === "pipa";

/** Quantas aplicações (não talhões) estão esperando. */
export const contarNovas = (recomendacoes) => agruparRecomendacoes(recomendacoes).filter((g) => g.recs.some((r) => r.situacao === "nova")).length;
