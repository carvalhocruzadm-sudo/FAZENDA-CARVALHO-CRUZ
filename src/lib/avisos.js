/**
 * Avisos do campo: cada vez que o operador lança, altera ou apaga algo no
 * celular de campo, nasce um registro em `avisos` (vai para o sininho do
 * escritório) e uma notificação no ntfy (vai para o celular de quem assina).
 *
 * Os fretes do motorista são os "tickets" e ganham destaque.
 */

import { ESQUEMA } from "./esquema";
import { exibir } from "./formato";
import { notificarNtfy } from "./ntfy";

/** Coleções que contam como ticket. */
export const COLECOES_TICKET = new Set(["fretes"]);

/** Em que tela do escritório cada coleção aparece (para o botão "Ver"). */
export const TELA_DA_COLECAO = {
  operacoes: "maquinas", revisoes: "maquinas", maquinas: "maquinas",
  abastecimentos: "diesel", diesel_entradas: "diesel",
  fretes: "fretes", vendas: "vendas", recebimentos: "vendas", colheitas: "lavoura", talhoes: "lavoura",
  aplicacoes: "quimicos", insumo_entradas: "quimicos", insumos: "quimicos",
  despesas: "financeiro", entradas: "financeiro", funcionarios: "equipe",
};

const VERBO = { novo: "lançou", editado: "alterou", apagado: "apagou" };

export const nomeDaColecao = (colecao) => {
  if (COLECOES_TICKET.has(colecao)) return "Ticket de frete";
  const def = ESQUEMA[colecao];
  return def ? def.singular.charAt(0).toUpperCase() + def.singular.slice(1) : colecao;
};

/** As colunas da lista, numa linha só: "16/10/2026 · Trator MF · 8,5 h…". */
function resumir(colecao, reg, dados) {
  const def = ESQUEMA[colecao];
  return def.colunas
    .map((c) => exibir(def.campos[c], reg[c], dados))
    .filter((v) => v && v !== "—")
    .join(" · ");
}

/** Monta o aviso, devolve o registro para gravar e manda a notificação no celular. */
export function criarAviso({ colecao, reg, acao, pessoa, dados }) {
  const ticket = COLECOES_TICKET.has(colecao);
  const aviso = {
    momento: new Date().toISOString(),
    pessoa: pessoa?.nome ?? null,
    colecao,
    registro_id: reg.id,
    acao,
    ticket,
    resumo: resumir(colecao, reg, dados),
    lido: false,
  };

  notificarNtfy({
    titulo: textoDoAviso(aviso),
    mensagem: aviso.resumo || nomeDaColecao(colecao),
    tags: [acao === "apagado" ? "wastebasket" : ticket ? "ticket" : "tractor"],
    prioridade: ticket || acao === "apagado" ? 4 : 3,
  });

  return aviso;
}

export const textoDoAviso = (a) => `${a.pessoa ?? "Operador"} ${VERBO[a.acao] ?? "lançou"}: ${nomeDaColecao(a.colecao).toLowerCase()}`;
