import { useMemo, useState } from "react";

import Formulario from "../components/Formulario";
import { Foto } from "../components/Foto";
import { Icone, Modal, Stat } from "../components/ui";
import { ESQUEMA, FORMAS_PAGAMENTO, hoje, prepararRegistro, registroNovo } from "../lib/esquema";
import { brl, data } from "../lib/formato";

/**
 * Funcionários no mesmo formato da Folha de Pagamento da distribuidora:
 * escolhe o mês no topo, vê quem ainda não recebeu, os totais, as pessoas
 * (em cartões, com foto), o histórico de cada uma e a lista de pagamentos.
 *
 * O pagamento é uma despesa de "Salários" com `funcionario_id` — assim já
 * entra no Financeiro e no custo da fazenda, sem tabela nova.
 */

const VINCULOS = ESQUEMA.funcionarios.campos.vinculo.opcoes;
const rotuloVinculo = (v) => VINCULOS.find(([x]) => x === v)?.[1] ?? "—";
/** O tipo da despesa conforme o vínculo de quem recebe. */
const TIPO_DESPESA = { mensal: "Salário", diarista: "Diárias", temporario: "Temporário / safra" };
const corVinculo = (v) => (v === "mensal" ? "var(--verde)" : v === "diarista" ? "#2563a8" : "var(--laranja)");

const mesDe = (iso) => String(iso ?? "").slice(0, 7);
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const nomeDoMes = (m) => {
  const [a, n] = m.split("-");
  return `${MESES[Number(n) - 1]} de ${a}`;
};

const pagamentoVazio = () => ({ data: hoje(), funcionario_id: "", valor: "", horas: "", extras: "", forma_pagamento: "PIX", descricao: "" });

export default function Funcionarios({ dados, salvar, remover }) {
  const [mes, setMes] = useState(() => mesDe(hoje()));
  const [filtro, setFiltro] = useState("todos");
  const [aberta, setAberta] = useState(null);
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [pessoa, setPessoa] = useState(null);
  const [pagamento, setPagamento] = useState(null);
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const funcionarios = useMemo(() => [...dados.funcionarios].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")), [dados.funcionarios]);
  const ativos = funcionarios.filter((f) => f.ativo !== false);
  const porId = useMemo(() => new Map(dados.funcionarios.map((f) => [f.id, f])), [dados.funcionarios]);
  const vinculoDe = (p) => porId.get(p.funcionario_id)?.vinculo ?? "";
  const nomeDe = (p) => porId.get(p.funcionario_id)?.nome ?? (p.favorecido || "(apagado)");
  /** O combinado da pessoa (salário do mês ou valor da diária), para já vir no pagamento. */
  const salarioDe = (id) => {
    const s = porId.get(id)?.salario;
    return s == null || s === "" ? "" : String(s);
  };

  // Pagamento = despesa ligada a um funcionário.
  const todosPagamentos = useMemo(() => dados.despesas.filter((d) => d.funcionario_id), [dados.despesas]);
  const mesAtual = mesDe(hoje());
  const meses = useMemo(
    () => [...new Set([mesAtual, ...todosPagamentos.map((p) => mesDe(p.data)).filter(Boolean)])].sort().reverse(),
    [todosPagamentos, mesAtual],
  );
  const doMes = mes === "todos" ? todosPagamentos : todosPagamentos.filter((p) => mesDe(p.data) === mes);
  const ordenados = [...doMes].sort((a, b) => String(b.data).localeCompare(String(a.data)) || String(b.atualizado_em ?? "").localeCompare(String(a.atualizado_em ?? "")));
  const filtrados = filtro === "todos" ? ordenados : ordenados.filter((p) => vinculoDe(p) === filtro);

  const soma = (lista) => lista.reduce((s, p) => s + (Number(p.valor) || 0), 0);
  const totalGeral = soma(doMes);
  const totalMesAtual = soma(todosPagamentos.filter((p) => mesDe(p.data) === mesAtual));
  const totalMensal = soma(doMes.filter((p) => vinculoDe(p) === "mensal"));
  const totalDiarias = soma(doMes.filter((p) => vinculoDe(p) !== "mensal"));

  /** Mensalista ativo sem nenhum pagamento no mês. Diarista fica de fora: só recebe quando trabalha. */
  const semPagamento = useMemo(() => {
    if (mes === "todos") return [];
    const pagos = new Set(todosPagamentos.filter((p) => mesDe(p.data) === mes).map((p) => p.funcionario_id));
    return ativos.filter((f) => f.vinculo === "mensal" && !pagos.has(f.id));
  }, [mes, todosPagamentos, ativos]);

  /** Quanto cada pessoa recebeu no mês escolhido (ou em todos). */
  const historico = (() => {
    const mapa = new Map();
    for (const p of doMes) {
      const linha = mapa.get(p.funcionario_id) ?? { id: p.funcionario_id, nome: nomeDe(p), vinculo: vinculoDe(p), total: 0, pagamentos: [] };
      linha.total += Number(p.valor) || 0;
      linha.pagamentos.push(p);
      mapa.set(p.funcionario_id, linha);
    }
    return [...mapa.values()].sort((a, b) => b.total - a.total);
  })();

  // ── Cadastro da pessoa ──
  const abrirPessoa = (reg) => { setErro(null); setPessoa(reg); };
  const gravarPessoa = async () => {
    const { reg, erro: e } = prepararRegistro("funcionarios", pessoa, dados);
    if (e) { setErro(e); return; }
    setSalvando(true);
    try {
      await salvar("funcionarios", reg);
      setPessoa(null);
    } catch (err) {
      setErro(String(err?.message ?? err));
    } finally {
      setSalvando(false);
    }
  };
  const apagarPessoa = async () => {
    const usos = Object.entries(ESQUEMA).reduce((t, [colecao, def]) => t + Object.entries(def.campos)
      .filter(([, c]) => c.tipo === "ref" && c.colecao === "funcionarios")
      .reduce((s, [chave]) => s + (dados[colecao] ?? []).filter((x) => x[chave] === pessoa.id).length, 0), 0);
    if (usos) {
      setErro(`Não dá para apagar: este funcionário aparece em ${usos} lançamento(s). Marque "Ativo" como Não — o histórico continua.`);
      return;
    }
    if (!window.confirm(`Apagar ${pessoa.nome}?`)) return;
    await remover("funcionarios", pessoa.id);
    setPessoa(null);
  };

  // ── Pagamento ──
  const abrirPagamento = (id = ativos[0]?.id ?? "") => {
    setErro(null);
    setPagamento({ ...pagamentoVazio(), funcionario_id: id, valor: salarioDe(id) });
  };
  const base = Number(pagamento?.valor) || 0;
  const extras = Number(pagamento?.extras) || 0;
  const totalPagamento = base + extras;
  const gravarPagamento = async () => {
    const f = porId.get(pagamento.funcionario_id);
    if (!f) { setErro("Escolha a pessoa."); return; }
    if (!pagamento.data) { setErro("Preencha a data."); return; }
    if (base < 0 || extras < 0 || totalPagamento <= 0) { setErro("Preencha o valor."); return; }
    const horas = Number(pagamento.horas) || 0;
    const partes = [
      `${TIPO_DESPESA[f.vinculo] ?? "Salário"} — ${f.nome}`,
      extras > 0 && `${brl(base)} + horas extras ${brl(extras)}${horas ? ` (${horas}h)` : ""}`,
      pagamento.descricao.trim(),
    ].filter(Boolean);
    const { reg, erro: e } = prepararRegistro("despesas", {
      ...registroNovo("despesas"),
      data: pagamento.data,
      categoria: "Salários",
      tipo: TIPO_DESPESA[f.vinculo] ?? "Salário",
      descricao: partes.join(" · "),
      valor: totalPagamento,
      forma_pagamento: pagamento.forma_pagamento,
      favorecido: f.nome,
      funcionario_id: f.id,
      centro: "geral",
      pago: true,
    }, dados);
    if (e) { setErro(e); return; }
    setSalvando(true);
    try {
      await salvar("despesas", reg);
      setPagamento(null);
    } catch (err) {
      setErro(String(err?.message ?? err));
    } finally {
      setSalvando(false);
    }
  };
  const apagarPagamento = async (p) => {
    if (!window.confirm(`Remover o pagamento de ${brl(p.valor)} a ${nomeDe(p)} em ${data(p.data)}?`)) return;
    await remover("despesas", p.id);
  };

  const pessoasNaTela = mostrarInativos ? funcionarios : ativos;
  const inativos = funcionarios.length - ativos.length;
  const nomeMes = mes === "todos" ? "todos os meses" : nomeDoMes(mes);

  return (
    <>
      <div className="barra" style={{ alignItems: "flex-end" }}>
        <div>
          <h2 style={{ fontSize: 16 }}>Folha de {nomeMes}</h2>
          <p className="descricao" style={{ margin: "3px 0 0" }}>Escolha o mês para ver os pagamentos e quem ainda não recebeu.</p>
        </div>
        <span className="espaco" />
        <label className="campo" style={{ minWidth: 180 }}>
          <span>Mês</span>
          <select value={mes} onChange={(e) => { setMes(e.target.value); setAberta(null); }}>
            {meses.map((m) => <option key={m} value={m}>{nomeDoMes(m)}</option>)}
            <option value="todos">Todos os meses</option>
          </select>
        </label>
      </div>

      {semPagamento.length > 0 && (
        <div className="aviso info" role="alert">
          <b>⚠ {semPagamento.length === 1 ? "1 mensalista sem pagamento" : `${semPagamento.length} mensalistas sem pagamento`} em {nomeMes}:</b>
          <div className="chips" style={{ marginTop: 6 }}>
            {semPagamento.map((f) => (
              <button key={f.id} className="chip" onClick={() => abrirPagamento(f.id)} title="Registrar o pagamento">{f.nome}</button>
            ))}
          </div>
        </div>
      )}

      <div className="grade">
        <Stat rotulo="Folha total" valor={brl(totalGeral)} sub={`${doMes.length} pagamento(s)`} cor="laranja" />
        <Stat rotulo={`Em ${nomeDoMes(mesAtual)}`} valor={brl(totalMesAtual)} sub="mês corrente" />
        <Stat rotulo="Diaristas e safra" valor={brl(totalDiarias)} sub="pago por dia / serviço" cor="cinza" />
        <Stat rotulo="Mensalistas" valor={brl(totalMensal)} sub="registrados / fixos" />
      </div>

      {/* Quem recebe */}
      <div className="cartao">
        <div className="barra">
          <div>
            <h2 style={{ margin: 0 }}>Funcionários</h2>
            <p className="descricao" style={{ margin: "3px 0 0" }}>{ESQUEMA.funcionarios.descricao} Toque na pessoa para editar.</p>
          </div>
          <span className="espaco" />
          {inativos > 0 && (
            <button className="btn" onClick={() => setMostrarInativos((x) => !x)}>
              {mostrarInativos ? "Esconder inativos" : `Mostrar inativos (${inativos})`}
            </button>
          )}
          <button className="btn primario" onClick={() => abrirPessoa(registroNovo("funcionarios"))}><Icone nome="mais" /> Novo funcionário</button>
        </div>
        {pessoasNaTela.length === 0 ? (
          <div className="vazio">Nenhum funcionário cadastrado.</div>
        ) : (
          <div className="pessoas">
            {pessoasNaTela.map((f) => (
              <button key={f.id} className={`pessoa${f.ativo === false ? " inativa" : ""}`} onClick={() => abrirPessoa({ ...f })} title="Editar">
                <Foto caminho={f.foto} alt={f.nome} ampliar className="rosto" reserva={<div className="rosto vazio">{f.nome.slice(0, 1)}</div>} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="nome">
                    {f.nome}
                    <span className={`selo ${f.ativo === false ? "neutro" : "ok"}`}>{f.ativo === false ? "Inativo" : "Ativo"}</span>
                  </div>
                  <div style={{ color: corVinculo(f.vinculo), fontSize: 12, fontWeight: 600, marginTop: 2 }}>
                    {f.funcao ? `${f.funcao} · ` : ""}{rotuloVinculo(f.vinculo)}
                  </div>
                  {f.salario != null && f.salario !== "" && (
                    <div style={{ fontSize: 12.5, marginTop: 2 }}>
                      {brl(f.salario)}<span style={{ color: "var(--texto-2)" }}>{f.vinculo === "mensal" ? " / mês" : " / diária"}</span>
                    </div>
                  )}
                  {(f.telefone || f.lanca_ticket) && (
                    <div style={{ fontSize: 11.5, color: "var(--texto-2)", marginTop: 2 }}>
                      {[f.telefone, f.lanca_ticket && "lança ticket"].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Pagamentos */}
      <div className="barra" style={{ marginTop: 16 }}>
        <div className="chips">
          {[["todos", "Todos"], ...VINCULOS].map(([v, r]) => (
            <button key={v} className={`chip${filtro === v ? " ativo" : ""}`} onClick={() => setFiltro(v)}>{r}</button>
          ))}
        </div>
        <span className="espaco" />
        <button className="btn primario" onClick={() => abrirPagamento()} disabled={!ativos.length}><Icone nome="dinheiro" /> Registrar pagamento</button>
      </div>

      {/* Histórico: quanto cada pessoa recebeu no mês */}
      <div className="cartao">
        <h2 style={{ marginBottom: 3 }}>Histórico por mês</h2>
        <p className="descricao">Quanto cada pessoa recebeu. Toque no nome para ver os pagamentos.</p>
        {historico.map((l) => (
          <div key={l.id} className="linha-historico">
            <button className="cabeca" onClick={() => setAberta((a) => (a === l.id ? null : l.id))}>
              <span>
                <b style={{ fontWeight: 600 }}>{l.nome}</b>
                <small style={{ color: corVinculo(l.vinculo), marginLeft: 8 }}>{rotuloVinculo(l.vinculo)}</small>
                <small style={{ color: "var(--texto-2)", marginLeft: 8 }}>{l.pagamentos.length} {l.pagamentos.length === 1 ? "pagamento" : "pagamentos"}</small>
              </span>
              <b style={{ color: "var(--laranja)", whiteSpace: "nowrap" }}>{brl(l.total)}</b>
            </button>
            {aberta === l.id && (
              <div style={{ padding: "0 0 10px 12px" }}>
                {[...l.pagamentos].sort((a, b) => String(b.data).localeCompare(String(a.data))).map((p) => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5, color: "var(--texto-2)", padding: "3px 0" }}>
                    <span>{data(p.data)} — {p.descricao}</span>
                    <span style={{ color: "var(--texto)", whiteSpace: "nowrap" }}>{brl(p.valor)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {historico.length > 0 ? (
          <div className="linha-historico total">
            <span>Total {mes === "todos" ? "geral" : `de ${nomeMes}`}</span>
            <span style={{ color: "var(--laranja)" }}>{brl(soma(doMes))}</span>
          </div>
        ) : (
          <div className="vazio">Nenhum pagamento em {nomeMes}.</div>
        )}
      </div>

      <div className="cartao">
        {filtrados.length === 0 ? (
          <div className="vazio">
            Nenhum pagamento{mes === "todos" ? "" : ` em ${nomeMes}`}{filtro !== "todos" ? ` para ${rotuloVinculo(filtro).toLowerCase()}` : ""}.
          </div>
        ) : (
          <div className="tabela cartoes">
            <table>
              <thead>
                <tr><th>Data</th><th>Nome</th><th>Vínculo</th><th>Descrição</th><th>Forma</th><th className="num">Valor</th><th /></tr>
              </thead>
              <tbody>
                {filtrados.map((p) => (
                  <tr key={p.id}>
                    <td data-rotulo="Data">{data(p.data)}</td>
                    <td data-rotulo="Nome">{nomeDe(p)}</td>
                    <td data-rotulo="Vínculo" style={{ color: corVinculo(vinculoDe(p)) }}>{rotuloVinculo(vinculoDe(p))}</td>
                    <td data-rotulo="Descrição" style={{ whiteSpace: "normal" }}>{p.descricao || "—"}</td>
                    <td data-rotulo="Forma">{p.forma_pagamento || "—"}</td>
                    <td data-rotulo="Valor" className="num"><b style={{ color: "var(--laranja)" }}>{brl(p.valor)}</b></td>
                    <td data-rotulo="" className="acoes">
                      <button className="btn icone" title="Remover pagamento" aria-label="Remover" onClick={() => apagarPagamento(p)}>
                        <Icone nome="lixo" tamanho={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td>{filtrados.length} {filtrados.length === 1 ? "pagamento" : "pagamentos"}</td><td /><td /><td /><td /><td className="num">{brl(soma(filtrados))}</td><td /></tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {pessoa && (
        <Modal
          titulo={pessoa.id ? `Editar — ${pessoa.nome}` : "Novo funcionário"}
          aoFechar={() => setPessoa(null)}
          rodape={
            <>
              {pessoa.id && <button className="btn perigo" onClick={apagarPessoa}><Icone nome="lixo" /> Apagar</button>}
              <span className="espaco" />
              <button className="btn" onClick={() => setPessoa(null)}>Cancelar</button>
              <button className="btn primario" onClick={gravarPessoa} disabled={salvando}>
                <Icone nome="editar" /> {salvando ? "Salvando…" : "Salvar"}
              </button>
            </>
          }
        >
          {erro && <div className="aviso">{erro}</div>}
          <Formulario colecao="funcionarios" reg={pessoa} setReg={setPessoa} dados={dados} contexto={{}} />
        </Modal>
      )}

      {pagamento && (
        <Modal
          titulo="Registrar pagamento"
          aoFechar={() => setPagamento(null)}
          rodape={
            <>
              <span className="espaco" />
              <button className="btn" onClick={() => setPagamento(null)}>Cancelar</button>
              <button className="btn primario" onClick={gravarPagamento} disabled={salvando}>
                <Icone nome="dinheiro" /> {salvando ? "Salvando…" : `Registrar ${brl(totalPagamento)}`}
              </button>
            </>
          }
        >
          {erro && <div className="aviso">{erro}</div>}
          <div className="form">
            <label className="campo">
              <span>Data <em>*</em></span>
              <input type="date" value={pagamento.data} onChange={(e) => setPagamento((p) => ({ ...p, data: e.target.value }))} />
            </label>
            <label className="campo">
              <span>Pessoa <em>*</em></span>
              <select value={pagamento.funcionario_id}
                onChange={(e) => { const id = e.target.value; setPagamento((p) => ({ ...p, funcionario_id: id, valor: salarioDe(id) })); }}>
                <option value="">— escolha —</option>
                {ativos.map((f) => <option key={f.id} value={f.id}>{f.nome} ({rotuloVinculo(f.vinculo)})</option>)}
              </select>
            </label>
            <label className="campo">
              <span>{porId.get(pagamento.funcionario_id)?.vinculo === "mensal" ? "Salário" : "Diária / serviço"} (R$) <em>*</em></span>
              <input type="number" min="0" step="0.01" inputMode="decimal" value={pagamento.valor} placeholder="0,00"
                onChange={(e) => setPagamento((p) => ({ ...p, valor: e.target.value }))} />
              <small>Já vem com o combinado do cadastro — dá para mudar.</small>
            </label>
            <label className="campo">
              <span>Forma de pagamento</span>
              <select value={pagamento.forma_pagamento} onChange={(e) => setPagamento((p) => ({ ...p, forma_pagamento: e.target.value }))}>
                {FORMAS_PAGAMENTO.map((f) => <option key={f}>{f}</option>)}
              </select>
            </label>
            <label className="campo">
              <span>Horas extras (quantas)</span>
              <input type="number" min="0" step="0.5" inputMode="decimal" value={pagamento.horas} placeholder="0"
                onChange={(e) => setPagamento((p) => ({ ...p, horas: e.target.value }))} />
            </label>
            <label className="campo">
              <span>Valor das horas extras (R$)</span>
              <input type="number" min="0" step="0.01" inputMode="decimal" value={pagamento.extras} placeholder="0,00"
                onChange={(e) => setPagamento((p) => ({ ...p, extras: e.target.value }))} />
            </label>
            <label className="campo largo">
              <span>Observação</span>
              <input value={pagamento.descricao} placeholder="Ex.: adiantamento, 13º, férias…"
                onChange={(e) => setPagamento((p) => ({ ...p, descricao: e.target.value }))} />
            </label>
          </div>
          <p className="descricao" style={{ margin: "12px 0 0" }}>
            Total: <b>{brl(totalPagamento)}</b>. Entra como despesa de Salários no Financeiro.
          </p>
        </Modal>
      )}
    </>
  );
}
