import { useCallback, useMemo, useState } from "react";

import { Foto } from "./Foto";
import Formulario from "./Formulario";
import { Icone, Modal, Stat, TabelaSimples } from "./ui";
import useEscolhaTalhoes from "../hooks/useEscolhaTalhoes";
import { intervalo } from "../lib/calculos";
import { hoje, prepararRegistro } from "../lib/esquema";
import { brl, data, nomeRef, numero } from "../lib/formato";

/**
 * Os tickets / cargas vendidas num lugar só, fáceis de ler: filtro de
 * período, de cultura e de situação, os totais em cima e as cargas
 * separadas por dia (com o total de cada dia).
 *
 * Situação de cada carga:
 *   - Aguardando aprovação: lançada por funcionário (`a_conferir`). O
 *     escritório confere pela foto e aprova, edita ou apaga;
 *   - Falta preço: aprovada, mas ainda sem comprador ou preço;
 *   - Completa.
 */

const PERIODOS_TICKET = [
  ["hoje", "Hoje"], ["7dias", "Últimos 7 dias"], ["mes", "Este mês"],
  ["mes_passado", "Mês passado"], ["ano", "Este ano"], ["tudo", "Tudo"],
];

const SITUACOES = [["todas", "Todas"], ["aprovar", "Aguardando aprovação"], ["preco", "Falta preço"], ["completas", "Completas"]];

function situacao(v) {
  if (v.a_conferir) return "aprovar";
  if (!v.comprador || !(Number(v.preco_unitario) > 0)) return "preco";
  return "completas";
}

const SELOS = {
  aprovar: <span className="selo atencao">Aguardando aprovação</span>,
  preco: <span className="selo neutro">Falta preço</span>,
  completas: <span className="selo ok">Completa</span>,
};

function deAte(periodo) {
  if (periodo === "hoje") return [hoje(), hoje()];
  if (periodo === "7dias") {
    const d = new Date(`${hoje()}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 6);
    return [d.toISOString().slice(0, 10), hoje()];
  }
  return intervalo(periodo);
}

const toneladas = (v) => (Number(v.peso_liquido) || 0) / 1000;

/** "Lançado no celular (Modo Campo) por Fulano · …" → "Fulano". */
const quemLancou = (v) => /Lançado (?:no celular \(Modo Campo\)|no computador) por ([^·]+)/.exec(v.observacao ?? "")?.[1]?.trim() ?? "—";

export default function PainelTickets({ dados, salvar, remover, periodoInicial = "7dias" }) {
  const [periodo, setPeriodo] = useState(periodoInicial);
  const [cultura, setCultura] = useState("todas");
  const [filtro, setFiltro] = useState("todas");
  const [foto, setFoto] = useState(null);
  const [rascunho, setRascunho] = useState(null);
  const [erro, setErro] = useState(null);
  const [trabalhando, setTrabalhando] = useState(false);

  const escolha = useEscolhaTalhoes("vendas", dados);

  const doPeriodo = useMemo(() => {
    const [de, ate] = deAte(periodo);
    return dados.vendas.filter((v) => !de || (v.data && v.data >= de && v.data <= ate));
  }, [dados.vendas, periodo]);

  // Os aguardando aprovação de qualquer data (para o aviso no alto).
  const pendentes = dados.vendas.filter((v) => v.a_conferir);

  // Só as culturas que têm carga no período.
  const culturas = useMemo(() => {
    const ids = [...new Set(doPeriodo.map((v) => v.cultura_id).filter(Boolean))];
    return ids.map((id) => [id, nomeRef(dados, "culturas", id)]).sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [doPeriodo, dados]);

  const lista = doPeriodo
    .filter((v) => cultura === "todas" || v.cultura_id === cultura)
    .filter((v) => filtro === "todas" || situacao(v) === filtro)
    .sort((a, b) => String(b.data).localeCompare(String(a.data))
      || String(b.criado_em ?? "").localeCompare(String(a.criado_em ?? "")));

  const totalT = lista.reduce((s, v) => s + toneladas(v), 0);
  const aAprovar = lista.filter((v) => v.a_conferir);
  const vendido = lista.filter((v) => Number(v.preco_unitario) > 0).reduce((s, v) => s + (Number(v.valor) || 0), 0);

  // Agrupa por dia, do mais novo para o mais velho.
  const dias = [];
  for (const v of lista) {
    const ultimo = dias[dias.length - 1];
    if (ultimo?.data === v.data) ultimo.cargas.push(v);
    else dias.push({ data: v.data, cargas: [v] });
  }

  const aprovar = async (vendas) => {
    if (vendas.length > 1 && !window.confirm(`Aprovar ${vendas.length} tickets?`)) return;
    setTrabalhando(true);
    setErro(null);
    try {
      for (const v of vendas) {
        const { reg, erro: e } = prepararRegistro("vendas", { ...v, a_conferir: false }, dados);
        if (e) throw new Error(e);
        await salvar("vendas", reg);
      }
    } catch (err) {
      setErro(String(err?.message ?? err));
    } finally {
      setTrabalhando(false);
    }
  };

  const apagar = async (v) => {
    const texto = `${nomeRef(dados, "culturas", v.cultura_id)} · ${numero(toneladas(v), 3)} t · ${data(v.data)}`;
    if (!window.confirm(`Apagar este ticket?\n${texto}`)) return;
    setErro(null);
    try {
      await remover("vendas", v.id);
      setRascunho((r) => (r?.id === v.id ? null : r));
    } catch (err) {
      setErro(String(err?.message ?? err));
    }
  };

  const { iniciar } = escolha;
  const editar = useCallback((v) => { setErro(null); setRascunho(v); iniciar(v); }, [iniciar]);
  const fechar = useCallback(() => setRascunho(null), []);

  const gravarEdicao = async () => {
    const { regs, erro: e } = escolha.montar(rascunho);
    if (e) { setErro(e); return; }
    setTrabalhando(true);
    try {
      for (const reg of regs) await salvar("vendas", reg);
      setRascunho(null);
    } catch (err) {
      setErro(String(err?.message ?? err));
    } finally {
      setTrabalhando(false);
    }
  };

  const talhao = (v) => {
    if (!v.talhao_id) return "—";
    const t = dados.talhoes.find((x) => x.id === v.talhao_id);
    const fazenda = t && dados.fazendas.find((f) => f.id === t.fazenda_id)?.nome;
    return [fazenda, t?.nome ?? "(excluído)"].filter(Boolean).join(" · ");
  };

  const colunas = [
    { rotulo: "Venda de", valor: (v) => <b>{nomeRef(dados, "culturas", v.cultura_id)}</b> },
    { rotulo: "Fazenda · talhão", valor: talhao },
    {
      rotulo: "Peso", num: true,
      valor: (v) => <div>{numero(toneladas(v), 3)} t{v.volumes ? <><br /><small>{numero(v.volumes, 0)} bags</small></> : null}</div>,
    },
    { rotulo: "Turma", valor: (v) => v.turma ? <div>{v.turma}{v.custo_ton != null && <><br /><small>{brl(v.custo_ton)}/t</small></>}</div> : "—" },
    { rotulo: "Lançado por", valor: quemLancou },
    {
      rotulo: "Comprador · valor",
      // Sem preço o valor sai negativo (só o custo da turma): mostra só quando tem preço.
      valor: (v) => (v.comprador || Number(v.preco_unitario) > 0
        ? <div>{v.comprador || "—"}{Number(v.preco_unitario) > 0 && <><br /><small>{brl(v.valor)}</small></>}</div>
        : "—"),
    },
    { rotulo: "Situação", valor: (v) => SELOS[situacao(v)] },
    {
      rotulo: "Ações",
      valor: (v) => (
        <div className="acoes-ticket">
          {v.foto_ticket && <button type="button" className="btn" onClick={() => setFoto(v.foto_ticket)} title="Ver a foto do ticket">📷</button>}
          {v.a_conferir && (
            <button type="button" className="btn primario" onClick={() => aprovar([v])} disabled={trabalhando}>✓ Aprovar</button>
          )}
          <button type="button" className="btn" onClick={() => editar(v)} title="Editar" aria-label="Editar"><Icone nome="editar" /></button>
          <button type="button" className="btn perigo" onClick={() => apagar(v)} title="Apagar" aria-label="Apagar"><Icone nome="lixo" /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="cartao">
      <h2>Tickets lançados</h2>

      {pendentes.length > 0 && filtro !== "aprovar" && (
        <div className="aviso">
          <b>{pendentes.length} ticket(s) dos funcionários aguardando a sua aprovação.</b>{" "}
          <button type="button" className="btn" onClick={() => { setFiltro("aprovar"); setPeriodo("tudo"); setCultura("todas"); }}>
            Ver e aprovar
          </button>
        </div>
      )}
      {erro && !rascunho && <div className="aviso">{erro}</div>}

      <div className="campo">
        <span>Período</span>
        <div className="escolhas">
          {PERIODOS_TICKET.map(([id, rotulo]) => (
            <button type="button" key={id} className={periodo === id ? "ativa" : ""} onClick={() => setPeriodo(id)}>{rotulo}</button>
          ))}
        </div>
      </div>

      {culturas.length > 1 && (
        <div className="campo" style={{ marginTop: 10 }}>
          <span>Venda de</span>
          <div className="escolhas">
            <button type="button" className={cultura === "todas" ? "ativa" : ""} onClick={() => setCultura("todas")}>Todas</button>
            {culturas.map(([id, nome]) => (
              <button type="button" key={id} className={cultura === id ? "ativa" : ""} onClick={() => setCultura(id)}>{nome}</button>
            ))}
          </div>
        </div>
      )}

      <div className="campo" style={{ marginTop: 10, marginBottom: 16 }}>
        <span>Situação</span>
        <div className="escolhas">
          {SITUACOES.map(([id, rotulo]) => (
            <button type="button" key={id} className={filtro === id ? "ativa" : ""} onClick={() => setFiltro(id)}>{rotulo}</button>
          ))}
        </div>
      </div>

      <div className="grade">
        <Stat rotulo="Cargas" valor={lista.length} />
        <Stat rotulo="Peso total" valor={`${numero(totalT, 2)} t`} />
        <Stat rotulo="Aguardando aprovação" valor={aAprovar.length} cor={aAprovar.length ? "laranja" : "cinza"}
          sub={aAprovar.length ? "Confira a foto e aprove" : "Nada para aprovar"} />
        <Stat rotulo="Vendido (líquido)" valor={brl(vendido)} cor="cinza" />
      </div>

      {aAprovar.length > 1 && (
        <div className="barra">
          <button type="button" className="btn primario" onClick={() => aprovar(aAprovar)} disabled={trabalhando}>
            ✓ Aprovar todos os {aAprovar.length} mostrados
          </button>
        </div>
      )}

      {dias.length === 0 && <div className="vazio">Nenhum ticket neste período.</div>}
      {dias.map((d) => (
        <div key={d.data ?? "sem"} style={{ marginBottom: 18 }}>
          <h3 style={{ margin: "6px 0 8px", fontSize: 15 }}>
            {d.data ? data(d.data) : "Sem data"}
            <small style={{ color: "var(--texto-2)", fontWeight: 400 }}>
              {" "}· {d.cargas.length} {d.cargas.length === 1 ? "carga" : "cargas"} · {numero(d.cargas.reduce((s, v) => s + toneladas(v), 0), 2)} t
            </small>
          </h3>
          <TabelaSimples linhas={d.cargas} colunas={colunas} />
        </div>
      ))}

      {foto && (
        <Modal titulo="Foto do ticket" aoFechar={() => setFoto(null)}>
          <Foto caminho={foto} alt="Foto do ticket da balança" className="foto-ticket-grande"
            reserva={<div className="vazio">Carregando a foto…</div>} />
        </Modal>
      )}

      {rascunho && (
        <Modal
          titulo="Editar ticket"
          aoFechar={fechar}
          rodape={
            <>
              <button className="btn perigo" onClick={() => apagar(rascunho)}><Icone nome="lixo" /> Apagar</button>
              <span className="espaco" />
              <button className="btn" onClick={fechar}>Cancelar</button>
              <button className="btn primario" onClick={gravarEdicao} disabled={trabalhando}>
                <Icone nome="editar" /> {trabalhando ? "Salvando…" : "Salvar"}
              </button>
            </>
          }
        >
          {erro && <div className="aviso">{erro}</div>}
          {rascunho.foto_ticket && (
            <Foto caminho={rascunho.foto_ticket} alt="Foto do ticket" className="foto-ticket-edicao" />
          )}
          <Formulario colecao="vendas" reg={rascunho} setReg={setRascunho} dados={dados} contexto={{}} escolha={escolha} />
        </Modal>
      )}
    </div>
  );
}
