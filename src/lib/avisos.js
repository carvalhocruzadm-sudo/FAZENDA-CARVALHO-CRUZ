/**
 * Avisos do campo: cada vez que alguém lança, altera ou apaga algo no Modo
 * Campo — ou lança um ticket da balança — nasce um registro em `avisos`
 * (vai para o sininho do escritório) e uma notificação no ntfy (vai para o
 * celular de quem assina o tópico).
 *
 * As vendas lançadas por essas telas são os tickets da balança e ganham
 * destaque.
 */

import { ESQUEMA } from "./esquema";
import { exibir } from "./formato";
import { notificarNtfy } from "./ntfy";

/** Em que tela do escritório cada coleção aparece (para o botão "Ver"). */
export const TELA_DA_COLECAO = {
  vendas: "ticket",
  operacoes: "atividades", revisoes: "maquinas", maquinas: "maquinas",
  abastecimentos: "diesel", diesel_entradas: "diesel",
  aplicacoes: "atividades", insumo_entradas: "quimicos", pulverizacoes: "atividades", insumos: "cadastros",
  fretes: "fretes", recebimentos: "vendas", colheitas: "lavoura", talhoes: "lavoura",
  despesas: "financeiro", entradas: "financeiro", funcionarios: "equipe", chuvas: "pluviometro",
};

const VERBO = { novo: "lançou", editado: "alterou", apagado: "apagou" };

const ehTicket = (colecao) => colecao === "vendas";

export function nomeDaColecao(colecao) {
  if (ehTicket(colecao)) return "Ticket da balança";
  const def = ESQUEMA[colecao];
  return def ? def.singular.charAt(0).toUpperCase() + def.singular.slice(1) : colecao;
}

export const textoDoAviso = (a) => `${a.pessoa ?? "Operador"} ${VERBO[a.acao] ?? "lançou"}: ${nomeDaColecao(a.colecao).toLowerCase()}`;

/** As colunas da lista, numa linha só: "16/10/2026 · Trator 02 · 8,5 h…". */
function resumir(colecao, reg, dados) {
  const def = ESQUEMA[colecao];
  if (!def) return "";
  return (def.colunas ?? [])
    .filter((c) => def.campos[c])
    .map((c) => exibir(def.campos[c], reg[c], dados))
    .filter((v) => v && v !== "—" && v !== "Não")
    .join(" · ");
}

/** Quem lançou: o operador do próprio lançamento ou, se não tiver, o dono do login. */
function quemLancou(reg, dados, email) {
  const idPessoa = reg.operador_id ?? reg.responsavel_id;
  const funcionario = idPessoa && dados.funcionarios?.find((f) => f.id === idPessoa);
  if (funcionario) return funcionario.nome;
  const usuario = email && dados.usuarios?.find((u) => String(u.email ?? "").trim().toLowerCase() === email.toLowerCase());
  return usuario?.nome ?? email ?? null;
}

function criarAviso({ colecao, reg, acao, dados, email }) {
  const ticket = ehTicket(colecao);
  const aviso = {
    momento: new Date().toISOString(),
    pessoa: quemLancou(reg, dados, email),
    email: email ?? null,
    colecao,
    registro_id: reg.id,
    acao,
    ticket,
    resumo: resumir(colecao, reg, dados),
    lido: false,
  };

  notificarNtfy({
    quem: aviso.pessoa ?? "Operador",
    titulo: textoDoAviso(aviso),
    linha: `${nomeDaColecao(colecao)}${acao === "novo" ? "" : ` (${VERBO[acao]})`}: ${aviso.resumo || "—"}`,
    mensagem: aviso.resumo || nomeDaColecao(colecao),
    tags: [acao === "apagado" ? "wastebasket" : ticket ? "receipt" : "tractor"],
    prioridade: ticket || acao === "apagado" ? 4 : 3,
  });

  return aviso;
}

/**
 * Embrulha o `salvar` de uma tela: grava o registro e, logo depois, o aviso.
 * Um aviso que falhar não atrapalha o lançamento.
 */
export function salvarComAviso(salvar, { dados, email }) {
  return async (colecao, reg) => {
    const novo = !reg.id || !(dados[colecao] ?? []).some((x) => x.id === reg.id);
    const item = await salvar(colecao, reg);
    if (colecao !== "avisos" && ESQUEMA.avisos) {
      try {
        await salvar("avisos", criarAviso({ colecao, reg: item, acao: novo ? "novo" : "editado", dados, email }));
      } catch { /* o lançamento já está guardado; só o aviso não saiu */ }
    }
    return item;
  };
}

/** O mesmo para o `remover`: guarda como era o registro e avisa que foi apagado. */
export function removerComAviso(remover, salvar, { dados, email }) {
  return async (colecao, id) => {
    const antigo = (dados[colecao] ?? []).find((x) => x.id === id);
    await remover(colecao, id);
    if (antigo && colecao !== "avisos") {
      try {
        await salvar("avisos", criarAviso({ colecao, reg: antigo, acao: "apagado", dados, email }));
      } catch { /* idem */ }
    }
  };
}
