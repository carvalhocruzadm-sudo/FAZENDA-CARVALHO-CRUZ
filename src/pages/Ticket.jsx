import { useMemo, useState } from "react";

import EscolhaTalhoes from "../components/EscolhaTalhoes";
import { Icone, TabelaSimples } from "../components/ui";
import { ESQUEMA, hoje, prepararRegistro, registroNovo } from "../lib/esquema";
import { brl, data, nomeRef, numero } from "../lib/formato";
import { dividirPorTalhoes, fazendaDoTalhao } from "../lib/talhoes";
import { chaveTurma } from "../lib/turmas";

/**
 * Lançamento rápido do ticket da balança que o Sinvaldo manda no grupo do
 * WhatsApp. Abre direto pelo link /ticket (fixado no grupo) e grava uma venda
 * sem comprador e sem preço — quem controla a venda completa depois.
 */

export const LINK_TICKET = "/ticket";

const vazio = () => ({ data: hoje(), cultura_id: null, peso: "", turma: "", custo_ton: "", observacao: "" });

export default function Ticket({ dados, salvar }) {
  const [f, setF] = useState(vazio);
  const [erro, setErro] = useState(null);
  const [salvo, setSalvo] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [areas, setAreas] = useState({}); // talhões marcados → área (divide o peso quando são vários)

  const set = (chave, v) => { setSalvo(null); setErro(null); setF((a) => ({ ...a, [chave]: v })); };

  const culturas = useMemo(
    () => dados.culturas.filter((c) => c.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome)),
    [dados.culturas],
  );
  const cultura = dados.culturas.find((c) => c.id === f.cultura_id);
  // Turma e valor por tonelada só aparecem se o cadastro da cultura disser que a colheita é por turma.
  const porTurma = Boolean(cultura?.turma_colheita);

  // Os talhões da cultura escolhida, por fazenda (marcar a fazenda marca todos os talhões dela).
  const ativos = useMemo(() => dados.talhoes.filter((t) => t.ativo !== false), [dados.talhoes]);
  const talhoes = ativos.filter((t) => f.cultura_id && t.cultura_id === f.cultura_id);
  const marcados = talhoes.filter((t) => t.id in areas)
    .sort((a, b) => fazendaDoTalhao(dados)(a).localeCompare(fazendaDoTalhao(dados)(b), "pt-BR") || ESQUEMA.talhoes.ordem(a, b));

  // As turmas do cadastro (ativas) e as que já aparecem nas vendas.
  const turmas = useMemo(
    () => [...new Set([
      ...(dados.turmas ?? []).filter((t) => t.ativo !== false).map((t) => t.nome.trim()),
      ...dados.vendas.map((v) => v.turma).filter(Boolean),
    ])].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [dados.turmas, dados.vendas],
  );

  const padraoDaCultura = (id) => {
    const v = dados.culturas.find((c) => c.id === id)?.custo_turma_ton;
    return v == null ? "" : String(v);
  };

  const escolherCultura = (id) => {
    setSalvo(null); setErro(null);
    if (f.cultura_id !== id) setAreas({});
    setF((a) => (a.cultura_id === id ? a : { ...a, cultura_id: id, custo_ton: padraoDaCultura(id) }));
  };

  // A turma traz o valor por tonelada do cadastro de Turmas; sem ele, o último
  // que ela cobrou; turma nova fica com o valor padrão do cadastro da cultura.
  const escolherTurma = (nome) => {
    set("turma", nome);
    const cadastro = (dados.turmas ?? []).find((t) => chaveTurma(t.nome) === chaveTurma(nome))?.valor_ton;
    if (cadastro != null) { setF((a) => ({ ...a, custo_ton: String(cadastro) })); return; }
    const ultima = dados.vendas
      .filter((v) => v.turma === nome && v.custo_ton != null)
      .sort((a, b) => String(b.data).localeCompare(String(a.data)))[0];
    if (ultima) setF((a) => ({ ...a, custo_ton: String(ultima.custo_ton) }));
    else if (!f.custo_ton) setF((a) => ({ ...a, custo_ton: padraoDaCultura(a.cultura_id) }));
  };

  const toneladas = (Number(f.peso) || 0) / 1000;

  const gravar = async (e) => {
    e.preventDefault();
    if (!cultura) { setErro("Escolha a venda de quê."); return; }
    if (!(Number(f.peso) > 0)) { setErro("Preencha o peso do ticket."); return; }
    if (talhoes.length && !marcados.length) { setErro("Marque o talhão (ou os talhões) desta carga."); return; }
    if (porTurma && !f.turma.trim()) { setErro("Preencha a turma de colheita."); return; }

    const { reg, erro: e2 } = prepararRegistro("vendas", {
      ...registroNovo("vendas"),
      data: f.data,
      cultura_id: cultura.id,
      unidade: cultura.unidade || "t",
      talhao_id: marcados[0]?.id ?? null,
      peso_liquido: f.peso,
      turma: porTurma ? f.turma : null,
      custo_ton: porTurma ? f.custo_ton : null,
      observacao: f.observacao,
    }, dados);
    if (e2) { setErro(e2); return; }
    // Carga de vários talhões: uma venda por talhão, com o peso dividido pela área.
    const partes = marcados.length > 1
      ? dividirPorTalhoes(ESQUEMA.vendas, reg, marcados.map((t) => ({ talhao: t, area_ha: Number(areas[t.id]) || 0 }))).map((p) => prepararRegistro("vendas", p, dados))
      : [{ reg }];
    const e3 = partes.find((p) => p.erro)?.erro;
    if (e3) { setErro(e3); return; }

    setSalvando(true);
    try {
      for (const p of partes) await salvar("vendas", p.reg);
      setSalvo({ ...reg, talhoes: marcados.map((t) => t.nome).join(", ") });
      // Mantém data, cultura, talhão e turma: o normal é lançar vários tickets do mesmo dia.
      setF((a) => ({ ...a, peso: "", observacao: "" }));
      window.scrollTo(0, 0);
    } catch (err) {
      setErro(String(err?.message ?? err));
    } finally {
      setSalvando(false);
    }
  };

  const copiarLink = async () => {
    try {
      await navigator.clipboard.writeText(location.origin + LINK_TICKET);
      setCopiado(true);
    } catch {
      window.prompt("Copie o link:", location.origin + LINK_TICKET);
    }
  };

  const ultimos = [...dados.vendas]
    .sort((a, b) => String(b.atualizado_em ?? "").localeCompare(String(a.atualizado_em ?? "")))
    .slice(0, 8);

  return (
    <>
      <form className="cartao ticket" onSubmit={gravar}>
        <p className="descricao">
          Lance aqui cada ticket da balança que chega no grupo. A venda fica em <b>Vendas → Cargas vendidas</b>,
          sem comprador e sem preço, para completar depois.
        </p>

        {salvo && (
          <div className="aviso ok">
            Ticket salvo: {nomeRef(dados, "culturas", salvo.cultura_id)} · {numero(salvo.peso_liquido / 1000, 3)} t
            {salvo.talhoes && <> · {salvo.talhoes}</>}. Pode lançar o próximo.
          </div>
        )}
        {erro && <div className="aviso">{erro}</div>}

        <div className="campo">
          <span>Venda de quê? <em>*</em></span>
          <div className="escolhas">
            {culturas.map((c) => (
              <button type="button" key={c.id} className={f.cultura_id === c.id ? "ativa" : ""} onClick={() => escolherCultura(c.id)}>
                {c.nome}
              </button>
            ))}
          </div>
        </div>

        <div className="form">
          <label className="campo"><span>Data <em>*</em></span>
            <input type="date" value={f.data} onChange={(e) => set("data", e.target.value)} required />
          </label>
          <label className="campo"><span>Peso líquido do ticket (kg) <em>*</em></span>
            <input type="number" inputMode="decimal" step="any" min="0" value={f.peso} onChange={(e) => set("peso", e.target.value)} />
            {toneladas > 0 && <small>= {numero(toneladas, 3)} toneladas</small>}
          </label>
          <EscolhaTalhoes culturas={dados.culturas} talhoes={ativos} nomeFazenda={fazendaDoTalhao(dados)}
            cultura={f.cultura_id ?? ""} aoMudarCultura={() => {}} areas={areas} setAreas={(x) => { setSalvo(null); setAreas(x); }}
            obrigatorio={talhoes.length > 0} mostrarCultura={false} />

          {porTurma && (
            <>
              <label className="campo"><span>Turma de colheita <em>*</em></span>
                <input list="ticket-turmas" value={f.turma} onChange={(e) => escolherTurma(e.target.value)} autoComplete="off" />
                <datalist id="ticket-turmas">{turmas.map((t) => <option key={t} value={t} />)}</datalist>
              </label>
              <label className="campo"><span>Valor da turma por tonelada</span>
                <input type="number" inputMode="decimal" step="any" min="0" placeholder="R$" value={f.custo_ton} onChange={(e) => set("custo_ton", e.target.value)} />
                {toneladas > 0 && Number(f.custo_ton) > 0 && <small>Colheita desta carga: {brl(toneladas * Number(f.custo_ton))}</small>}
              </label>
            </>
          )}

          <label className="campo largo"><span>Observação</span>
            <textarea rows={2} value={f.observacao} onChange={(e) => set("observacao", e.target.value)} />
          </label>
        </div>

        <button className="btn primario grande" disabled={salvando}>
          <Icone nome="mais" /> {salvando ? "Salvando…" : "Salvar ticket"}
        </button>
      </form>

      <div className="cartao">
        <h2>Últimas cargas lançadas</h2>
        <TabelaSimples
          vazio="Nenhuma venda lançada ainda."
          linhas={ultimos}
          colunas={[
            { rotulo: "Data", valor: (v) => data(v.data) },
            { rotulo: "Venda de", valor: (v) => nomeRef(dados, "culturas", v.cultura_id) },
            { rotulo: "Talhão", valor: (v) => nomeRef(dados, "talhoes", v.talhao_id) },
            { rotulo: "Peso (t)", num: true, valor: (v) => numero((Number(v.peso_liquido) || 0) / 1000, 3) },
            { rotulo: "Turma", valor: (v) => v.turma || "—" },
            { rotulo: "R$/t turma", num: true, valor: (v) => (v.custo_ton != null ? brl(v.custo_ton) : "—") },
          ]}
        />
      </div>

      <div className="cartao">
        <h2>Link para o grupo do WhatsApp</h2>
        <p className="descricao">
          Fixe este link na conversa com o Sinvaldo. Tocando nele, o sistema abre direto nesta tela
          (no primeiro acesso do celular, pede o login).
        </p>
        <div className="barra">
          <code className="link-ticket">{location.origin + LINK_TICKET}</code>
          <button type="button" className="btn" onClick={copiarLink}>{copiado ? "Copiado!" : "Copiar link"}</button>
        </div>
      </div>
    </>
  );
}
