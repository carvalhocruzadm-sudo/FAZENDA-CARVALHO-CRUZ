/**
 * Indicadores do Painel — por cultura, por fazenda, por talhão e por mês.
 *
 * Tudo sai dos lançamentos (vendas, colheitas, recebimentos, despesas…), com
 * os mesmos filtros para todas as abas: período, cultura e fazenda.
 *
 * Produção (kg) de um talhão = o MAIOR entre o peso das cargas vendidas
 * (pesagem) e o que foi lançado em Colheitas. Assim quem lança só a venda,
 * ou só a colheita, vê a produção — e quem lança os dois não conta duas vezes.
 *
 * kg/pé da fazenda e da cultura só conta os pés dos talhões que produziram no
 * período: pomar novo (ainda sem colheita) não puxa a média para baixo. O
 * mesmo vale para t/ha e R$/ha: só a área dos talhões que produziram.
 */
import { UNIDADES_VENDA } from "./esquema";
import { entradasDoPeriodo, linhasDeCusto, noPeriodo, saidasDoPeriodo } from "./calculos";

const n = (v) => Number(v) || 0;
const KG_POR_UNIDADE = Object.fromEntries(UNIDADES_VENDA.map(([v, , kg]) => [v, kg]));

/** Caixa de laranja (40,8 kg) e saca de milho (60 kg), como nas planilhas. */
export const KG_CAIXA = 40.8;
export const KG_SACA = 60;

export const NOMES_MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const mesLegivel = (chave) => {
  const [a, m] = chave.split("-");
  return `${NOMES_MESES[Number(m) - 1]}/${a.slice(2)}`;
};

/** Peso de uma carga: a pesagem; sem pesagem, quantidade × kg da unidade. */
export function kgDaVenda(v) {
  if (n(v.peso_liquido)) return n(v.peso_liquido);
  const kg = KG_POR_UNIDADE[v.unidade];
  return kg ? n(v.quantidade) * kg : 0;
}

export function kgDaColheita(c) {
  const kg = KG_POR_UNIDADE[c.unidade];
  return kg ? n(c.quantidade) * kg : 0;
}

/** Anos que têm algum lançamento, do mais novo para o mais velho. */
export function anosComDados(dados) {
  const anos = new Set();
  for (const col of ["vendas", "despesas", "recebimentos", "colheitas"]) {
    for (const x of dados[col] ?? []) if (x.data) anos.add(x.data.slice(0, 4));
  }
  return [...anos].sort().reverse();
}

/** Lista de meses "aaaa-mm" de `de` até `ate`, sem buracos. */
function mesesEntre(de, ate) {
  const lista = [];
  let [a, m] = de.split("-").map(Number);
  const [af, mf] = ate.split("-").map(Number);
  while (a < af || (a === af && m <= mf)) {
    lista.push(`${a}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; a++; }
  }
  return lista;
}

/**
 * Monta todos os números do Painel.
 * filtros: { periodo, cultura (id ou ""), fazenda (id ou "") }
 */
export function indicadores(dados, { periodo, cultura, fazenda }) {
  const talhaoPorId = new Map(dados.talhoes.map((t) => [t.id, t]));
  const fazendaDoTalhao = (id) => talhaoPorId.get(id)?.fazenda_id ?? null;
  const passaCultura = (id) => !cultura || id === cultura;
  const passaFazenda = (id) => !fazenda || id === fazenda;

  const vendas = noPeriodo(dados.vendas, periodo)
    .filter((v) => passaCultura(v.cultura_id) && passaFazenda(fazendaDoTalhao(v.talhao_id)));
  const colheitas = noPeriodo(dados.colheitas, periodo)
    .filter((c) => passaCultura(c.cultura_id) && passaFazenda(fazendaDoTalhao(c.talhao_id)));
  const recebimentos = noPeriodo(dados.recebimentos, periodo).filter((r) => passaCultura(r.cultura_id));
  const custosLinhas = linhasDeCusto(dados, periodo)
    .filter((l) => (!cultura || l.cultura_id === cultura) && (!fazenda || l.fazenda_id === fazenda));

  // ─── Por talhão ─────────────────────────────────────────────────────────
  const porTalhao = new Map();
  const obterT = (id) => {
    const k = id ?? "sem";
    if (!porTalhao.has(k)) {
      const t = talhaoPorId.get(id) ?? null;
      porTalhao.set(k, {
        id: k, talhao: t, nome: t?.nome ?? "Sem talhão informado", fazenda_id: t?.fazenda_id ?? null,
        culturas: new Set(), area: n(t?.area_ha), pes: n(t?.pes),
        cargas: 0, kgVendido: 0, kgColhido: 0, bruto: 0, liquido: 0, custo: 0, porClassificacao: {},
      });
    }
    return porTalhao.get(k);
  };
  // Os talhões cadastrados aparecem mesmo sem lançamento (para ver quem não produziu).
  for (const t of dados.talhoes) {
    if (t.ativo === false || !passaFazenda(t.fazenda_id) || !passaCultura(t.cultura_id)) continue;
    obterT(t.id).culturas.add(t.cultura_id);
  }
  for (const v of vendas) {
    const x = obterT(v.talhao_id);
    const kg = kgDaVenda(v);
    x.culturas.add(v.cultura_id);
    x.cargas++; x.kgVendido += kg; x.bruto += n(v.valor_bruto); x.liquido += n(v.valor);
    const cl = v.classificacao || "Sem tipo";
    x.porClassificacao[cl] = (x.porClassificacao[cl] ?? 0) + kg;
  }
  for (const c of colheitas) {
    const x = obterT(c.talhao_id);
    x.culturas.add(c.cultura_id);
    x.kgColhido += kgDaColheita(c);
  }
  for (const l of custosLinhas) if (l.talhao_id) obterT(l.talhao_id).custo += l.valor;

  const completar = (x) => {
    const kg = Math.max(x.kgVendido, x.kgColhido);
    return {
      ...x, kg,
      kgPe: x.pes ? kg / x.pes : null,
      cxPe: x.pes ? kg / KG_CAIXA / x.pes : null,
      tHa: x.area ? kg / 1000 / x.area : null,
      scHa: x.area ? kg / KG_SACA / x.area : null,
      receitaHa: x.area ? x.liquido / x.area : null,
      custoHa: x.area ? x.custo / x.area : null,
      precoT: kg ? x.liquido / (kg / 1000) : null,
      resultado: x.liquido - x.custo,
    };
  };
  const talhoes = [...porTalhao.values()].map((x) => completar({ ...x, culturas: [...x.culturas].filter(Boolean) }));

  // ─── Por fazenda (soma dos talhões + despesas lançadas na fazenda) ──────
  const porFazenda = new Map();
  for (const t of talhoes) {
    const k = t.fazenda_id ?? "sem";
    if (!porFazenda.has(k)) {
      const f = dados.fazendas.find((x) => x.id === t.fazenda_id);
      porFazenda.set(k, {
        id: k, fazenda: f ?? null, nome: f?.nome ?? "Sem fazenda informada", talhoes: 0,
        area: 0, pes: 0, cargas: 0, kgVendido: 0, kgColhido: 0, kg: 0, kgComPe: 0, pesProdutivos: 0, kgComArea: 0, areaProdutiva: 0, liquidoComArea: 0, bruto: 0, liquido: 0, custo: 0, porClassificacao: {},
      });
    }
    const x = porFazenda.get(k);
    if (t.talhao) x.talhoes++;
    x.area += t.area; x.pes += t.pes; x.cargas += t.cargas;
    x.kgVendido += t.kgVendido; x.kgColhido += t.kgColhido; x.kg += t.kg;
    if (t.pes && t.kg) { x.kgComPe += t.kg; x.pesProdutivos += t.pes; }
    if (t.area && t.kg) { x.kgComArea += t.kg; x.areaProdutiva += t.area; x.liquidoComArea += t.liquido; }
    x.bruto += t.bruto; x.liquido += t.liquido; x.custo += t.custo;
    for (const [c, kg] of Object.entries(t.porClassificacao)) x.porClassificacao[c] = (x.porClassificacao[c] ?? 0) + kg;
  }
  // Despesa lançada na fazenda mas sem talhão também é custo da fazenda.
  for (const l of custosLinhas) {
    if (l.talhao_id || !l.fazenda_id) continue;
    const x = porFazenda.get(l.fazenda_id);
    if (x) x.custo += l.valor;
  }
  const fazendas = [...porFazenda.values()].map((x) => ({
    ...x,
    kgPe: x.pesProdutivos ? x.kgComPe / x.pesProdutivos : null,
    cxPe: x.pesProdutivos ? x.kgComPe / KG_CAIXA / x.pesProdutivos : null,
    tHa: x.areaProdutiva ? x.kgComArea / 1000 / x.areaProdutiva : null,
    scHa: x.areaProdutiva ? x.kgComArea / KG_SACA / x.areaProdutiva : null,
    receitaHa: x.areaProdutiva ? x.liquidoComArea / x.areaProdutiva : null,
    custoHa: x.area ? x.custo / x.area : null,
    precoT: x.kg ? x.liquido / (x.kg / 1000) : null,
    resultado: x.liquido - x.custo,
  }));

  // ─── Por cultura ────────────────────────────────────────────────────────
  const porCultura = new Map();
  const obterC = (id) => {
    const k = id ?? "geral";
    if (!porCultura.has(k)) {
      const c = dados.culturas.find((x) => x.id === id);
      porCultura.set(k, {
        id: k, cultura: c ?? null, nome: c?.nome ?? "Geral da fazenda (sem cultura)", unidade: c?.unidade ?? null,
        cargas: 0, kg: 0, quantidade: 0, bruto: 0, desconto: 0, liquido: 0, recebido: 0, custo: 0,
        area: 0, pes: 0, kgComPe: 0, pesProdutivos: 0, kgComArea: 0, areaProdutiva: 0, liquidoComArea: 0, porClassificacao: {}, porOrigem: {},
      });
    }
    return porCultura.get(k);
  };
  for (const v of vendas) {
    const x = obterC(v.cultura_id);
    const kg = kgDaVenda(v);
    x.cargas++; x.kg += kg; x.quantidade += n(v.quantidade);
    x.bruto += n(v.valor_bruto); x.desconto += n(v.valor_desconto); x.liquido += n(v.valor);
    const cl = v.classificacao || "Sem tipo";
    x.porClassificacao[cl] = (x.porClassificacao[cl] ?? 0) + kg;
  }
  for (const r of recebimentos) if (r.cultura_id) obterC(r.cultura_id).recebido += n(r.valor);
  for (const l of custosLinhas) {
    const x = obterC(l.cultura_id);
    x.custo += l.valor;
    x.porOrigem[l.origem] = (x.porOrigem[l.origem] ?? 0) + l.valor;
  }
  // Área e pés: dos talhões que estão hoje com a cultura.
  for (const t of dados.talhoes) {
    if (t.ativo === false || !t.cultura_id || !passaFazenda(t.fazenda_id) || !porCultura.has(t.cultura_id)) continue;
    const x = porCultura.get(t.cultura_id);
    x.area += n(t.area_ha); x.pes += n(t.pes);
  }
  for (const t of talhoes) {
    if (!t.pes || !t.kg || t.culturas.length !== 1 || !porCultura.has(t.culturas[0])) continue;
    const x = porCultura.get(t.culturas[0]);
    x.kgComPe += t.kg; x.pesProdutivos += t.pes;
  }
  for (const t of talhoes) {
    if (!t.area || !t.kg || t.culturas.length !== 1 || !porCultura.has(t.culturas[0])) continue;
    const x = porCultura.get(t.culturas[0]);
    x.kgComArea += t.kg; x.areaProdutiva += t.area; x.liquidoComArea += t.liquido;
  }
  const culturas = [...porCultura.values()].map((x) => ({
    ...x,
    precoMedio: x.quantidade ? x.bruto / x.quantidade : null,
    precoT: x.kg ? x.liquido / (x.kg / 1000) : null,
    aReceber: x.liquido - x.recebido,
    resultado: x.liquido - x.custo,
    margem: x.liquido ? ((x.liquido - x.custo) / x.liquido) * 100 : null,
    kgPe: x.pesProdutivos ? x.kgComPe / x.pesProdutivos : null,
    cxPe: x.pesProdutivos ? x.kgComPe / KG_CAIXA / x.pesProdutivos : null,
    tHa: x.areaProdutiva ? x.kgComArea / 1000 / x.areaProdutiva : null,
    receitaHa: x.areaProdutiva ? x.liquidoComArea / x.areaProdutiva : null,
  })).sort((a, b) => b.liquido - a.liquido || b.custo - a.custo);

  // ─── Por mês ────────────────────────────────────────────────────────────
  const saidas = saidasDoPeriodo(dados, periodo);
  const entradas = {
    recebimentos: noPeriodo(dados.recebimentos, periodo),
    fretes: noPeriodo(dados.fretes, periodo),
    outras: noPeriodo(dados.entradas, periodo),
  };
  const chavesMes = [
    ...vendas, ...colheitas, ...custosLinhas, ...saidas.linhas,
    ...entradas.recebimentos, ...entradas.fretes, ...entradas.outras,
  ].map((x) => x.data?.slice(0, 7)).filter(Boolean).sort();
  // Meses futuros (conta lançada com data adiante) não entram no gráfico vazio.
  const mesAtual = new Date().toISOString().slice(0, 7);
  const ultimoMes = chavesMes.length ? (chavesMes[chavesMes.length - 1] > mesAtual ? mesAtual : chavesMes[chavesMes.length - 1]) : null;
  const meses = chavesMes.length && chavesMes[0] <= ultimoMes ? mesesEntre(chavesMes[0], ultimoMes) : [];
  const porMes = new Map(meses.map((m) => [m, {
    id: m, mes: m, cargas: 0, kg: 0, liquido: 0, custo: 0, recebido: 0, entrou: 0, saiu: 0,
    porTalhao: {}, porCategoria: {}, porCultura: {},
  }]));
  const mes = (d) => porMes.get(d?.slice(0, 7));
  for (const v of vendas) {
    const x = mes(v.data); if (!x) continue;
    const kg = kgDaVenda(v);
    x.cargas++; x.kg += kg; x.liquido += n(v.valor);
    const t = v.talhao_id ?? "sem";
    x.porTalhao[t] = (x.porTalhao[t] ?? 0) + kg;
    const c = v.cultura_id ?? "geral";
    x.porCultura[c] = (x.porCultura[c] ?? 0) + n(v.valor);
  }
  for (const l of custosLinhas) { const x = mes(l.data); if (x) x.custo += l.valor; }
  for (const r of recebimentos) { const x = mes(r.data); if (x) x.recebido += n(r.valor); }
  // Caixa (entradas e saídas de dinheiro): é da fazenda toda, só o período filtra.
  for (const r of [...entradas.recebimentos, ...entradas.fretes, ...entradas.outras]) { const x = mes(r.data); if (x) x.entrou += n(r.valor); }
  for (const l of saidas.linhas) {
    const x = mes(l.data); if (!x) continue;
    x.saiu += l.valor;
    x.porCategoria[l.categoria] = (x.porCategoria[l.categoria] ?? 0) + l.valor;
  }
  let acumulado = 0;
  const mesesLista = [...porMes.values()].map((x) => {
    acumulado += x.entrou - x.saiu;
    return { ...x, caixa: x.entrou - x.saiu, acumulado };
  });

  // ─── Compradores ────────────────────────────────────────────────────────
  const porComprador = new Map();
  const chave = (s) => String(s || "").trim().toUpperCase();
  const obterComprador = (nome) => {
    const k = chave(nome);
    if (!porComprador.has(k)) porComprador.set(k, { id: k, nome: String(nome || "").trim() || "(sem nome)", cargas: 0, kg: 0, liquido: 0, recebido: 0 });
    return porComprador.get(k);
  };
  for (const v of vendas) {
    const x = obterComprador(v.comprador);
    x.cargas++; x.kg += kgDaVenda(v); x.liquido += n(v.valor);
  }
  for (const r of recebimentos) obterComprador(r.comprador).recebido += n(r.valor);
  const compradores = [...porComprador.values()]
    .map((x) => ({ ...x, precoT: x.kg ? x.liquido / (x.kg / 1000) : null, saldo: x.liquido - x.recebido }))
    .filter((x) => x.cargas || x.recebido);

  // ─── Favorecidos (para quem a fazenda mais pagou) ───────────────────────
  const porFavorecido = new Map();
  for (const l of saidas.linhas) {
    const k = chave(l.favorecido) || "(sem favorecido)";
    if (!porFavorecido.has(k)) porFavorecido.set(k, { id: k, nome: String(l.favorecido || "").trim() || "(sem favorecido)", valor: 0, vezes: 0, categorias: {} });
    const x = porFavorecido.get(k);
    x.valor += l.valor; x.vezes++;
    x.categorias[l.categoria] = (x.categorias[l.categoria] ?? 0) + l.valor;
  }

  const ent = entradasDoPeriodo(dados, periodo);
  return {
    vendas, talhoes, fazendas, culturas, meses: mesesLista, compradores,
    favorecidos: [...porFavorecido.values()],
    saidas, entradas: ent,
    totais: {
      cargas: vendas.length,
      kg: talhoes.reduce((t, x) => t + x.kg, 0),
      liquido: vendas.reduce((t, v) => t + n(v.valor), 0),
      bruto: vendas.reduce((t, v) => t + n(v.valor_bruto), 0),
      custo: custosLinhas.reduce((t, l) => t + l.valor, 0),
      recebido: recebimentos.reduce((t, r) => t + n(r.valor), 0),
    },
  };
}
