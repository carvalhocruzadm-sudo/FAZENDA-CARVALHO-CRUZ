import { useMemo, useState } from "react";

import { Icone, TabelaSimples } from "../components/ui";
import { ESQUEMA, hoje, prepararRegistro, registroNovo } from "../lib/esquema";
import { brl, data, nomeRef, numero } from "../lib/formato";

/**
 * Lançamento rápido do ticket da balança que o Sinvaldo manda no grupo do
 * WhatsApp. Abre direto pelo link /ticket (fixado no grupo) e grava uma venda
 * sem comprador e sem preço — quem controla a venda completa depois.
 */

export const LINK_TICKET = "/ticket";

const ehLaranja = (cultura) => /laranja/i.test(cultura?.nome ?? "");

const vazio = () => ({ data: hoje(), cultura_id: null, peso: "", talhao_id: null, turma: "", custo_ton: "", observacao: "" });

export default function Ticket({ dados, salvar }) {
  const [f, setF] = useState(vazio);
  const [erro, setErro] = useState(null);
  const [salvo, setSalvo] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const set = (chave, v) => { setSalvo(null); setErro(null); setF((a) => ({ ...a, [chave]: v })); };

  const culturas = useMemo(
    () => dados.culturas.filter((c) => c.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome)),
    [dados.culturas],
  );
  const cultura = dados.culturas.find((c) => c.id === f.cultura_id);
  const laranja = ehLaranja(cultura);

  // Os talhões da cultura escolhida; se nenhum estiver marcado com ela, todos.
  const talhoes = useMemo(() => {
    const ativos = dados.talhoes.filter((t) => t.ativo !== false).sort(ESQUEMA.talhoes.ordem);
    const daCultura = ativos.filter((t) => t.cultura_id === f.cultura_id);
    return daCultura.length ? daCultura : ativos;
  }, [dados.talhoes, f.cultura_id]);

  const turmas = useMemo(
    () => [...new Set(dados.vendas.map((v) => v.turma).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [dados.vendas],
  );

  const escolherCultura = (id) => {
    set("cultura_id", id);
    setF((a) => ({ ...a, talhao_id: dados.talhoes.some((t) => t.id === a.talhao_id && t.cultura_id === id) ? a.talhao_id : null }));
  };

  // A turma já usada antes traz o último valor por tonelada que ela cobrou.
  const escolherTurma = (nome) => {
    set("turma", nome);
    const ultima = dados.vendas
      .filter((v) => v.turma === nome && v.custo_ton != null)
      .sort((a, b) => String(b.data).localeCompare(String(a.data)))[0];
    if (ultima) setF((a) => ({ ...a, custo_ton: String(ultima.custo_ton) }));
  };

  const toneladas = (Number(f.peso) || 0) / 1000;

  const gravar = async (e) => {
    e.preventDefault();
    if (!cultura) { setErro("Escolha a venda de quê."); return; }
    if (!(Number(f.peso) > 0)) { setErro("Preencha o peso do ticket."); return; }
    if (talhoes.length && !f.talhao_id) { setErro("Escolha o talhão."); return; }
    if (laranja && !f.turma.trim()) { setErro("Preencha a turma de colheita."); return; }

    const { reg, erro: e2 } = prepararRegistro("vendas", {
      ...registroNovo("vendas"),
      data: f.data,
      cultura_id: cultura.id,
      unidade: cultura.unidade || "t",
      talhao_id: f.talhao_id,
      peso_liquido: f.peso,
      turma: laranja ? f.turma : null,
      custo_ton: laranja ? f.custo_ton : null,
      observacao: f.observacao,
    });
    if (e2) { setErro(e2); return; }

    setSalvando(true);
    try {
      await salvar("vendas", reg);
      setSalvo(reg);
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
            {salvo.talhao_id && <> · {nomeRef(dados, "talhoes", salvo.talhao_id)}</>}. Pode lançar o próximo.
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
          <label className="campo"><span>Talhão {talhoes.length > 0 && <em>*</em>}</span>
            <select value={f.talhao_id ?? ""} onChange={(e) => set("talhao_id", e.target.value || null)}>
              <option value="">{talhoes.length ? "— escolha —" : "Nenhum talhão cadastrado"}</option>
              {talhoes.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </label>

          {laranja && (
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
