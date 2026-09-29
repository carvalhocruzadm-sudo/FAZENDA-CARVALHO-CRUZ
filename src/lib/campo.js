/**
 * Regras do Modo Campo — as telas com foto e botão grande que os tratoristas
 * usam pelo QR code. Aqui fica só a conta; as telas estão em pages/Campo.jsx.
 */

import { ultimaLeitura } from "./calculos";
import { OPERACOES } from "./esquema";

const n = (v) => Number(v) || 0;

/** Desenho de cada serviço (quem não lê reconhece pela figura). */
const FIGURA_SERVICO = {
  "Gradagem": "🚜", "Aração": "⛏️", "Subsolagem": "🪨", "Plantio": "🌱", "Pulverização": "💦",
  "Adubação": "🧪", "Roçagem": "✂️", "Colheita": "🌽", "Ensilagem": "🌾", "Transporte": "🚚",
  "Distribuição de ração": "🐄", "Terraplanagem": "🏗️", "Serviço geral": "🔧",
};

export const figuraServico = (nome) => FIGURA_SERVICO[nome] ?? "🔧";

/** Os serviços da lista padrão + os que já foram lançados no escritório. */
export function servicos(dados) {
  const usados = dados.operacoes.map((o) => o.operacao).filter(Boolean);
  return [...new Set([...OPERACOES, ...usados])];
}

/** Máquinas que abastecem no PA: as que têm horímetro. */
export const maquinasDoPA = (dados) => dados.maquinas
  .filter((m) => m.ativo !== false && m.medidor === "horas")
  .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));

/** Tratoristas e operadores primeiro; depois o resto da equipe ativa. */
export function operadores(dados) {
  const ehOperador = (f) => /tratorista|operador|motorista/i.test(f.funcao ?? "");
  return dados.funcionarios
    .filter((f) => f.ativo !== false)
    .sort((a, b) => ehOperador(b) - ehOperador(a) || a.nome.localeCompare(b.nome));
}

/** Converte o que foi digitado no teclado ("1234,5") em número. */
export const paraNumero = (texto) => (texto === "" || texto == null ? null : Number(String(texto).replace(",", ".")));

/**
 * Divide `total` entre os talhões pela área (ha). Se algum talhão não tem
 * área cadastrada, divide em partes iguais. Arredonda em 1 casa e a última
 * parte leva a sobra, para a soma bater exatamente.
 */
export function dividirPorArea(total, talhoes) {
  const areas = talhoes.map((t) => n(t.area_ha));
  const pesos = areas.every((a) => a > 0) ? areas : talhoes.map(() => 1);
  const somaPesos = pesos.reduce((a, b) => a + b, 0);
  let resto = total;
  return pesos.map((p, i) => {
    if (i === pesos.length - 1) return +resto.toFixed(1);
    const parte = +((total * p) / somaPesos).toFixed(1);
    resto -= parte;
    return parte;
  });
}

/** A máquina já tem alguma leitura de horímetro registrada? */
function temLeitura(dados, maquina) {
  return n(maquina.leitura_inicial) > 0
    || dados.operacoes.some((o) => o.maquina_id === maquina.id)
    || dados.abastecimentos.some((a) => a.maquina_id === maquina.id && a.leitura != null)
    || dados.revisoes.some((r) => r.maquina_id === maquina.id && r.leitura != null);
}

/**
 * Transforma o que o tratorista informou no PA nos lançamentos do sistema:
 *   - um abastecimento (saída do tanque) por talhão, com os litros divididos
 *     pela área — assim o diesel vira custo de cada talhão;
 *   - uma operação (horímetro) por talhão, com as horas divididas pela área:
 *     as leituras vão em sequência (1000→1006, 1006→1010) para o horímetro
 *     da máquina continuar certinho.
 *
 * As horas trabalhadas são o horímetro de agora − a última leitura conhecida.
 *
 * @param r { maquina_id, operador_id, operacao, talhoes: [id], leitura, litros, foto_leitura, foto_bomba }
 * @returns {{ abastecimentos, operacoes, anterior, horas, aviso, consumo }}
 */
export function lancamentosDoPA(dados, r, data) {
  const maquina = dados.maquinas.find((m) => m.id === r.maquina_id);
  const talhoes = r.talhoes.map((id) => dados.talhoes.find((t) => t.id === id)).filter(Boolean);
  const final = n(r.leitura);
  const litros = n(r.litros);
  const primeira = !temLeitura(dados, maquina);
  const anterior = primeira ? null : ultimaLeitura(dados, maquina.id);
  const horas = anterior == null ? null : +(final - anterior).toFixed(1);

  let aviso = null;
  if (primeira) aviso = "Primeira leitura do horímetro desta máquina: as horas começam a ser contadas a partir do próximo abastecimento.";
  else if (horas < 0) aviso = `CONFERIR: o horímetro informado (${final}) é menor que o último registrado (${anterior}). As horas não foram lançadas.`;
  else if (horas > 24) aviso = `CONFERIR: ${horas} horas desde o último registro (${anterior}). É muito para um dia.`;

  const partesLitros = dividirPorArea(litros, talhoes);
  const base = { data, maquina_id: maquina.id, operador_id: r.operador_id };
  const obs = ["Lançado no PA (QR code)", talhoes.length > 1 ? `dividido entre ${talhoes.map((t) => t.nome).join(", ")} pela área` : null, aviso]
    .filter(Boolean).join(" · ");

  const abastecimentos = talhoes.map((t, i) => ({
    ...base, origem: "tanque", litros: partesLitros[i], leitura: final,
    talhao_id: t.id, cultura_id: t.cultura_id ?? null,
    foto_leitura: r.foto_leitura ?? null, foto_bomba: r.foto_bomba ?? null, observacao: obs,
  }));

  const operacoes = [];
  if (horas != null && horas >= 0) {
    const partesHoras = dividirPorArea(horas, talhoes);
    let leitura = anterior;
    talhoes.forEach((t, i) => {
      const fim = i === talhoes.length - 1 ? final : +(leitura + partesHoras[i]).toFixed(1);
      operacoes.push({
        ...base, operacao: r.operacao, talhao_id: t.id, cultura_id: t.cultura_id ?? null,
        leitura_inicial: leitura, leitura_final: fim, observacao: obs,
      });
      leitura = fim;
    });
  }

  const consumo = horas > 0 ? litros / horas : null;
  return { abastecimentos, operacoes, anterior, horas, aviso, consumo };
}

/** Fala o texto em voz alta (para quem não lê). Silencioso se o celular não tiver voz. */
export function falar(texto) {
  try {
    const voz = window.speechSynthesis;
    if (!voz || !texto) return;
    voz.cancel();
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = "pt-BR";
    u.rate = 0.95;
    const pt = voz.getVoices().find((v) => v.lang?.toLowerCase().startsWith("pt"));
    if (pt) u.voice = pt;
    voz.speak(u);
  } catch { /* sem voz: segue só com as figuras */ }
}

export function vibrar(padrao = 80) {
  try { navigator.vibrate?.(padrao); } catch { /* aparelho sem vibração */ }
}
