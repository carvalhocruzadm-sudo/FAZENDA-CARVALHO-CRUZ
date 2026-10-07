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
    case "fotos": return `${valor.length} ${valor.length === 1 ? "foto" : "fotos"}`;
    case "booleano": return valor ? "Sim" : "Não";
    case "opcoes": return campo.opcoes.find(([v]) => v === valor)?.[1] ?? valor;
    case "ref": return nomeRef(dados, campo.colecao, valor);
    default: return String(valor);
  }
}

/** Baixa uma planilha (CSV com ";" e acentos certos, abre direto no Excel). `linhas`: lista de listas, a primeira é o cabeçalho. */
export function baixarCSV(nomeArquivo, linhas) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const texto = linhas.map((l) => l.map((v) => (typeof v === "number" ? String(v).replace(".", ",") : esc(v))).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + texto], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(a.href);
}
