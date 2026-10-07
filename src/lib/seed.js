/**
 * Cadastro inicial, tirado das planilhas da fazenda (CADASTROS de
 * VENDAS_LARANJA e PLANEJAMENTO do milho). Os ids são fixos e iguais aos do
 * supabase/schema.sql, para o modo demonstração e a nuvem baterem.
 */

const id = (grupo, n) => `00000000-0000-4000-${grupo}-${String(n).padStart(12, "0")}`;

export const CULTURAS = [
  // nome, tipo de cultura, unidade, peso da saca, produtividade, turma de colheita
  ["Milho", "graos", "sc60", null, "sc_ha", false],
  ["Laranja", "citros", "t", null, "kg_pe", true],
  ["Abóbora", "hortalicas", "kg", null, "t_ha", false],
  ["Amendoim", "graos", "sc60", null, "sc_ha", false],
  ["Silagem", "forragem", "saco", null, "t_ha", false],
  ["Milho verde", "hortalicas", "unidade", null, "nenhuma", false],
  ["Confinamento", "pecuaria", "arroba", null, "nenhuma", false],
].map(([nome, grupo, unidade, peso_saca, produtividade, turma_colheita], i) => ({
  id: id("8000", i + 1), nome, grupo, tipo: grupo === "pecuaria" ? "pecuaria" : "agricola", unidade, peso_saca,
  produtividade, turma_colheita, custo_turma_ton: null, ativo: true, observacao: null,
}));

const [MILHO, LARANJA] = CULTURAS.map((c) => c.id);

export const FAZENDAS = [
  ["São Raimundo", "propria", null, null],
  ["Murtinha", "propria", null, null],
  ["Triunfo / Juerana", "propria", null, null],
  ["Águas Claras", "sociedade", "Gilberto", 25],
].map(([nome, posse, socio, area], i) => ({
  id: id("8100", i + 1), nome, posse, socio, area_ha: area, municipio: null, ativo: true, observacao: null,
}));

const [SAO_RAIMUNDO, MURTINHA, TRIUNFO, AGUAS_CLARAS] = FAZENDAS.map((f) => f.id);

export const TALHOES = [
  ["Galpão", SAO_RAIMUNDO, 6.6, 4059, LARANJA],
  ["Meio", SAO_RAIMUNDO, 5.8, 3567, LARANJA],
  ["Gilton", SAO_RAIMUNDO, 24.2, 14883, LARANJA],
  ["Faria", SAO_RAIMUNDO, 8.5, 5227, LARANJA],
  ["Barragem", SAO_RAIMUNDO, 8, 4920, LARANJA],
  ["Coqueiro", SAO_RAIMUNDO, 8.9, 5473, LARANJA],
  ["Espinho", MURTINHA, 12, 7380, LARANJA],
  ["Murta", MURTINHA, 3.4, 2091, LARANJA],
  ["Tanque", MURTINHA, 5.9, 3628, LARANJA],
  ["Canabrava", MURTINHA, 6.5, 3997, LARANJA],
  ["George", MURTINHA, 32.76, 20147, LARANJA],
  ["Triunfo", TRIUNFO, 28.2, 16000, LARANJA],
  ["Gameleira", TRIUNFO, null, null, MILHO],
  ["Juerana", TRIUNFO, null, null, MILHO],
  ["Águas Claras", AGUAS_CLARAS, 25, null, MILHO],
].map(([nome, fazenda_id, area_ha, pes, cultura_id], i) => ({
  id: id("8200", i + 1), nome, fazenda_id, area_ha, pes, cultura_id,
  variedade: null, safra: null, data_plantio: null, previsao_colheita: null, ativo: true, observacao: null,
}));

export const SEED = { culturas: CULTURAS, fazendas: FAZENDAS, talhoes: TALHOES };
