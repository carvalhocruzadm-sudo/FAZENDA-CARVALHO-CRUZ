/**
 * Escolha de talhões por cultura e fazenda, e a divisão de uma ordem que
 * pega vários talhões (cada talhão fica com a parte dele, pela área).
 */

import { numero } from "./formato";

const n = (v) => Number(v) || 0;

export const ordenarNome = (a, b) => String(a).localeCompare(String(b), "pt-BR", { numeric: true });

export const SEM_CULTURA = "__sem";
export const chaveCultura = (t) => t.cultura_id || SEM_CULTURA;

/** Culturas que têm talhão (e "Sem cultura definida", se houver talhão sem). */
export function culturasComTalhao(culturas, talhoes) {
  return [
    ...culturas.filter((c) => talhoes.some((t) => t.cultura_id === c.id)).sort((a, b) => ordenarNome(a.nome, b.nome)),
    ...(talhoes.some((t) => !t.cultura_id) ? [{ id: SEM_CULTURA, nome: "Sem cultura definida" }] : []),
  ];
}

/** Nome da fazenda de um talhão do cadastro (que guarda fazenda_id). */
export const fazendaDoTalhao = (dados) => (t) => dados.fazendas.find((f) => f.id === t.fazenda_id)?.nome || "Sem fazenda";

/**
 * Os talhões de uma ordem de pulverização: [{ talhao, area_ha }]. Ordem
 * antiga (de um talhão só) usa o talhao_id e a área dela.
 */
export function talhoesDaOrdem(dados, ordem) {
  const lista = ordem?.talhoes?.length ? ordem.talhoes : ordem?.talhao_id ? [{ talhao_id: ordem.talhao_id, area_ha: ordem.area_ha }] : [];
  return lista.map((x) => ({ talhao: dados.talhoes.find((t) => t.id === x.talhao_id) ?? { id: x.talhao_id, nome: "Talhão" }, area_ha: n(x.area_ha) }));
}

/** "Gameleira, Galpão" — os nomes dos talhões da ordem. */
export const nomesTalhoesDaOrdem = (dados, ordem) => talhoesDaOrdem(dados, ordem).map((x) => x.talhao.nome).join(", ") || "—";

/** Divide uma quantidade entre os talhões pela área (sem área: partes iguais). A última parte leva o arredondamento. */
export function dividirQuantidade(total, partes, casas = 3) {
  const pesos = partes.every((p) => n(p.area_ha) > 0) ? partes.map((p) => n(p.area_ha)) : partes.map(() => 1);
  const soma = pesos.reduce((a, b) => a + b, 0);
  let resto = n(total);
  return pesos.map((p, i) => {
    if (i === pesos.length - 1) return +resto.toFixed(casas);
    const parte = +((n(total) * p) / soma).toFixed(casas);
    resto -= parte;
    return parte;
  });
}

/**
 * Um lançamento que pegou vários talhões vira um por talhão, com os números
 * divididos pela área (o `porTalhao` do esquema diz quais). `reg` já passou
 * pelo prepararRegistro (as contas estão feitas); cada parte passa de novo.
 * `partes` = [{ talhao, area_ha }]. Devolve os registros brutos.
 */
export function dividirPorTalhoes(def, reg, partes) {
  const regra = def.porTalhao ?? {};
  const nomes = partes.map((x) => x.talhao.nome).join(", ");
  const divididos = Object.fromEntries((regra.dividir ?? []).map((c) => [c, reg[c] == null ? null : dividirQuantidade(reg[c], partes, def.campos[c]?.casas ?? 2)]));
  const horas = regra.leituras ? dividirQuantidade(n(reg.leitura_final) - n(reg.leitura_inicial), partes, 1) : null;
  let leitura = n(reg.leitura_inicial);
  const extras = regra.zerar?.some((c) => reg[c] != null)
    ? ` (${regra.zerar.filter((c) => reg[c] != null).map((c) => `${def.campos[c].rotulo}: ${numero(reg[c], 1)}`).join(", ")})` : "";
  const nota = `Dividido entre ${nomes} pela área${extras}`;

  return partes.map((x, i) => {
    const parte = { ...reg, id: undefined, talhao_id: x.talhao.id, cultura_id: x.talhao.cultura_id ?? reg.cultura_id ?? null };
    for (const [c, valores] of Object.entries(divididos)) parte[c] = valores?.[i] ?? null;
    for (const c of regra.zerar ?? []) parte[c] = null;
    if (regra.area) parte[regra.area] = x.area_ha || null;
    if (horas) {
      const fim = i === partes.length - 1 ? n(reg.leitura_final) : +(leitura + horas[i]).toFixed(1);
      parte.leitura_inicial = leitura;
      parte.leitura_final = fim;
      leitura = fim;
    }
    if ("observacao" in def.campos) parte.observacao = [reg.observacao, nota].filter(Boolean).join(" · ");
    return parte;
  });
}
