import { ESQUEMA } from "./esquema";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const brl = (v) => moeda.format(Number(v) || 0);

export const numero = (v, casas = 2) =>
  v == null || v === "" ? "—" : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: casas }).format(Number(v));

export const data = (iso) => {
  if (!iso) return "—";
  const [a, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};

/** Nome legível de um registro de outra coleção (o talhão, a máquina…). */
export function nomeRef(dados, colecao, id) {
  if (!id) return "—";
  const r = dados[colecao]?.find((x) => x.id === id);
  return r ? ESQUEMA[colecao].resumo?.(r) ?? r.nome ?? id : "(apagado)";
}

/** Valor de um campo do jeito que aparece na tabela. */
export function exibir(campo, valor, dados) {
  if (valor == null || valor === "") return "—";
  switch (campo.tipo) {
    case "dinheiro": return campo.casas > 2
      ? `R$ ${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: campo.casas }).format(valor)}`
      : brl(valor);
    case "numero": return numero(valor, campo.casas ?? 2);
    case "data": return data(valor);
    case "booleano": return valor ? "Sim" : "Não";
    case "opcoes": return campo.opcoes.find(([v]) => v === valor)?.[1] ?? valor;
    case "ref": return nomeRef(dados, campo.colecao, valor);
    case "foto": return "📷 Foto";
    case "local": return "📍 Marcado";
    default: return String(valor);
  }
}
