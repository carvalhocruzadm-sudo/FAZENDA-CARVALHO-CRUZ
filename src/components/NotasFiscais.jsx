import { useCallback, useEffect, useMemo, useState } from "react";

import { PERIODOS, noPeriodo } from "../lib/calculos";
import { SITUACOES_NFE, UNIDADES_VENDA, kgPorUnidade } from "../lib/esquema";
import { brl, data, nomeRef, numero } from "../lib/formato";
import { supabase, supabaseConfigurado } from "../lib/supabase";
import { Icone, Modal, SeletorPeriodo, TabelaSimples } from "./ui";

/**
 * Emissão de NF-e pelo Bling. Quem fala com o Bling é a função `bling` do
 * Supabase (as chaves ficam lá); esta tela só pede e mostra o resultado.
 * O resultado volta para o aparelho na tabela notas_fiscais, pela
 * sincronização normal.
 */

async function chamarBling(corpo) {
  if (!supabase) throw new Error("Precisa do Supabase configurado e de internet.");
  const { data: r, error } = await supabase.functions.invoke("bling", { body: corpo });
  if (error) {
    // A função devolve { erro } também nas respostas de erro HTTP.
    const detalhe = await error.context?.json?.().catch(() => null);
    throw new Error(detalhe?.erro ?? error.message);
  }
  if (r?.erro) throw new Error(r.erro);
  return r;
}

const igual = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
const AUTORIZADA = [5, 6, 7];
const ESPERANDO = [3, 8, 10];

/** Quantidade que vai na nota: a da venda menos o desconto em kg. */
function quantidadeDaNota(v, dados) {
  const kg = kgPorUnidade(v.unidade, dados.culturas.find((c) => c.id === v.cultura_id));
  return kg ? (Number(v.quantidade) || 0) - (Number(v.desconto_kg) || 0) / kg : Number(v.quantidade) || 0;
}

/** O que falta no cadastro para emitir (a função confere tudo de novo). */
function pendencias(venda, dados) {
  const falta = [];
  if (!venda.comprador) falta.push("o comprador na venda");
  if (!(Number(venda.preco_unitario) > 0)) falta.push("o preço na venda");
  const comp = dados.compradores.find((c) => c.ativo !== false && igual(c.nome, venda.comprador));
  if (venda.comprador && !comp) falta.push(`cadastrar “${venda.comprador}” em Compradores`);
  const cultura = dados.culturas.find((c) => c.id === venda.cultura_id);
  if (cultura && String(cultura.ncm ?? "").replace(/\D/g, "").length !== 8) falta.push(`NCM de ${cultura.nome} em Culturas`);
  return falta;
}

function SeloNota({ nota }) {
  if (!nota) return <span className="selo neutro">Sem nota</span>;
  const [rotulo, cor] = SITUACOES_NFE[nota.situacao] ?? ["No Bling", "neutro"];
  return <span className={`selo ${cor}`}>{rotulo}{nota.numero ? ` · nº ${nota.numero}` : ""}</span>;
}

// ─── Conexão ────────────────────────────────────────────────────────────────

function Conexao({ conexao, recarregar }) {
  const [naturezas, setNaturezas] = useState(null);
  const [erro, setErro] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  // O aplicativo do Bling pode não ter a permissão de ler as naturezas de
  // operação: aí a natureza é informada pelo número dela.
  const [semLista, setSemLista] = useState(false);
  const [manual, setManual] = useState({ id: "", nome: "" });

  useEffect(() => {
    if (!conexao?.conectado) return;
    chamarBling({ acao: "naturezas" }).then((r) => setNaturezas(r.naturezas)).catch(() => setSemLista(true));
  }, [conexao?.conectado]);

  const conectar = async () => {
    setErro(null); setOcupado(true);
    // Abre a aba antes da resposta: o navegador do celular bloqueia janela
    // aberta depois de esperar a internet.
    const aba = window.open("", "_blank");
    try {
      const { url } = await chamarBling({ acao: "link" });
      if (aba) aba.location.href = url; else window.location.href = url;
    } catch (e) {
      aba?.close();
      setErro(e.message);
    } finally {
      setOcupado(false);
    }
  };

  const gravarNatureza = async (id, nome) => {
    setErro(null);
    try {
      await chamarBling({ acao: "configurar", natureza_id: id, natureza_nome: nome });
      recarregar();
    } catch (e) { setErro(e.message); }
  };

  const escolher = (id) => {
    const n = naturezas.find((x) => String(x.id) === id);
    gravarNatureza(n ? n.id : null, n?.descricao ?? null);
  };

  const gravarManual = () => {
    const id = Number(manual.id.replace(/\D/g, ""));
    if (!id) { setErro("Digite o número da natureza de operação."); return; }
    gravarNatureza(id, manual.nome.trim() || `Natureza nº ${id}`);
  };

  if (!conexao) return <div className="vazio">Verificando a conexão com o Bling…</div>;

  return (
    <div className="cartao">
      <div className="barra">
        <b>Bling:</b>
        {conexao.conectado ? <span className="selo ok">Conectado</span> : <span className="selo ruim">Não conectado</span>}
        <span className="espaco" />
        <button className="btn" onClick={conectar} disabled={ocupado}>
          <Icone nome="nuvem" /> {conexao.conectado ? "Conectar de novo" : "Conectar ao Bling"}
        </button>
        <button className="btn" onClick={recarregar}><Icone nome="sync" /> Já autorizei</button>
      </div>
      {!conexao.conectado && (
        <p className="descricao">
          Clique em <b>Conectar ao Bling</b>, entre com o usuário do Bling e clique em <b>Autorizar</b>. Depois volte
          aqui e clique em <b>Já autorizei</b>.
        </p>
      )}
      {conexao.conectado && semLista && (
        <div className="form">
          <p className="descricao largo">
            O aplicativo do Bling não deixa listar as naturezas de operação: informe o número dela. No Bling, abra
            <b> Preferências → Naturezas de operação</b>, clique na de venda da produção e copie o número que aparece no
            fim do endereço da página (ex.: …/<b>15103123</b>).
            {conexao.natureza_id && <> Hoje está usando: <b>{conexao.natureza_nome}</b> (nº {conexao.natureza_id}).</>}
          </p>
          <div className="campo">
            <span><label htmlFor="nat-id">Número da natureza</label><em> *</em></span>
            <input id="nat-id" inputMode="numeric" value={manual.id} onChange={(e) => setManual((m) => ({ ...m, id: e.target.value }))} />
          </div>
          <div className="campo">
            <span><label htmlFor="nat-nome">Nome (para lembrar)</label></span>
            <input id="nat-nome" value={manual.nome} placeholder="Venda de produção" onChange={(e) => setManual((m) => ({ ...m, nome: e.target.value }))} />
          </div>
          <div className="campo"><span>&nbsp;</span><button className="btn primario" onClick={gravarManual}>Guardar natureza</button></div>
        </div>
      )}
      {conexao.conectado && !semLista && (
        <div className="form">
          <div className="campo largo">
            <span><label htmlFor="natureza">Natureza de operação das vendas</label><em> *</em></span>
            <select id="natureza" value={conexao.natureza_id ?? ""} onChange={(e) => escolher(e.target.value)} disabled={!naturezas}>
              <option value="">{naturezas ? "— escolha —" : "Carregando…"}</option>
              {(naturezas ?? []).map((x) => <option key={x.id} value={x.id}>{x.descricao}</option>)}
            </select>
            <small>Cadastrada no Bling pelo contador (ex.: “Venda de produção do estabelecimento”). É ela que define CFOP e impostos.</small>
          </div>
        </div>
      )}
      {erro && <div className="aviso">{erro}</div>}
    </div>
  );
}

// ─── Emitir ─────────────────────────────────────────────────────────────────

function Emitir({ venda, nota, dados, conexao, salvar, sincronizarAgora, aoFechar }) {
  const [observacoes, setObservacoes] = useState("");
  const [estado, setEstado] = useState({ ocupado: false, erro: null, nota });
  const falta = pendencias(venda, dados);
  const un = Object.fromEntries(UNIDADES_VENDA.map(([v, r]) => [v, r]));
  const atual = estado.nota;
  const esperando = atual && ESPERANDO.includes(Number(atual.situacao));
  const autorizada = atual && AUTORIZADA.includes(Number(atual.situacao));

  /** Nota autorizada: anota o número na venda (como antes era feito à mão). */
  const anotarNumero = async (n) => {
    if (AUTORIZADA.includes(Number(n.situacao)) && n.numero && venda.nota_fiscal !== n.numero) {
      await salvar("vendas", { ...venda, nota_fiscal: n.numero });
    }
  };

  const executar = async (acao) => {
    setEstado((s) => ({ ...s, ocupado: true, erro: null }));
    try {
      // A função lê a venda da nuvem: manda antes o que está na fila.
      await sincronizarAgora();
      const { nota: n } = await chamarBling({ acao, venda_id: venda.id, observacoes });
      await anotarNumero(n);
      await sincronizarAgora();
      setEstado({ ocupado: false, erro: null, nota: n });
    } catch (e) {
      setEstado((s) => ({ ...s, ocupado: false, erro: e.message }));
    }
  };

  return (
    <Modal titulo="Nota fiscal da venda" aoFechar={aoFechar}
      rodape={(
        <>
          <span className="espaco" />
          <button className="btn" onClick={aoFechar}>Fechar</button>
          {esperando && <button className="btn" onClick={() => executar("consultar")} disabled={estado.ocupado}><Icone nome="sync" /> Ver se já autorizou</button>}
          {!autorizada && !esperando && (
            <button className="btn primario" onClick={() => executar("emitir")}
              disabled={estado.ocupado || falta.length > 0 || !conexao?.conectado || !conexao?.natureza_id}>
              <Icone nome="entrada" /> {estado.ocupado ? "Enviando…" : atual ? "Emitir de novo" : "Emitir NF-e"}
            </button>
          )}
        </>
      )}>
      <TabelaSimples
        linhas={[
          ["Data da venda", data(venda.data)],
          ["Comprador", venda.comprador],
          ["Produto", [nomeRef(dados, "culturas", venda.cultura_id), venda.classificacao].filter(Boolean).join(" - ")],
          ["Quantidade na nota", `${numero(quantidadeDaNota(venda, dados), 3)} ${un[venda.unidade] ?? ""}`],
          ["Preço", brl(venda.preco_unitario)],
          ["Valor da mercadoria", brl(quantidadeDaNota(venda, dados) * (Number(venda.preco_unitario) || 0))],
          ...(Number(venda.frete_cobrado) ? [["Frete cobrado", brl(venda.frete_cobrado)]] : []),
          ["Natureza de operação", conexao?.natureza_nome ?? "—"],
        ].map(([r, v]) => ({ id: r, r, v }))}
        colunas={[{ rotulo: "Item", valor: (l) => l.r }, { rotulo: "Valor", valor: (l) => l.v }]}
      />
      {!conexao?.conectado && <div className="aviso">Conecte ao Bling primeiro (no alto da aba Notas fiscais).</div>}
      {conexao?.conectado && !conexao.natureza_id && <div className="aviso">Escolha a natureza de operação no alto da aba Notas fiscais.</div>}
      {falta.length > 0 && <div className="aviso">Falta: {falta.join("; ")}.</div>}

      {atual && (
        <div className={`aviso ${autorizada ? "ok" : "info"}`}>
          <SeloNota nota={atual} />{" "}
          {autorizada && <>NF-e autorizada pela SEFAZ.{" "}</>}
          {esperando && <>A SEFAZ ainda está processando. Espere um pouco e clique em “Ver se já autorizou”.{" "}</>}
          {atual.mensagem && <><br />{atual.mensagem}</>}
          {atual.link_danfe && <><br /><a href={atual.link_danfe} target="_blank" rel="noreferrer">Abrir o DANFE (PDF da nota)</a></>}
        </div>
      )}
      {estado.erro && <div className="aviso">{estado.erro}</div>}

      {!autorizada && !esperando && (
        <div className="form">
          <div className="campo largo">
            <span><label htmlFor="obs-nf">Informações complementares (opcional)</label></span>
            <textarea id="obs-nf" rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
            <small>Saem no rodapé da nota. O vencimento da venda entra sozinho.</small>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Aba ────────────────────────────────────────────────────────────────────

export default function NotasFiscais({ dados, salvar, sincronizarAgora }) {
  const [periodo, setPeriodo] = useState("mes");
  const [conexao, setConexao] = useState(null);
  const [erroConexao, setErroConexao] = useState(null);
  const [aberta, setAberta] = useState(null);
  const fechar = useCallback(() => setAberta(null), []);

  const verificar = useCallback(() => {
    setErroConexao(null);
    chamarBling({ acao: "situacao" }).then(setConexao).catch((e) => setErroConexao(e.message));
  }, []);

  useEffect(() => {
    if (!supabaseConfigurado) return;
    chamarBling({ acao: "situacao" }).then(setConexao).catch((e) => setErroConexao(e.message));
  }, []);

  const notaDe = useMemo(() => new Map(dados.notas_fiscais.map((n) => [n.venda_id, n])), [dados.notas_fiscais]);
  const vendas = useMemo(
    () => [...noPeriodo(dados.vendas, periodo)].sort((a, b) => String(b.data).localeCompare(String(a.data))),
    [dados.vendas, periodo],
  );

  if (!supabaseConfigurado) {
    return <div className="cartao"><div className="aviso info">A emissão de NF-e precisa do sistema ligado ao Supabase (na nuvem).</div></div>;
  }

  const vendaAberta = aberta && dados.vendas.find((v) => v.id === aberta);

  return (
    <>
      {erroConexao
        ? <div className="cartao"><div className="aviso">Não consegui falar com o Bling: {erroConexao}</div></div>
        : <Conexao conexao={conexao} recarregar={verificar} />}

      <div className="cartao">
        <p className="descricao">
          Escolha a venda e clique em <b>Nota</b>. A nota sai com o comprador do cadastro de Compradores, o NCM da cultura e a
          quantidade da venda (já tirado o desconto em kg).
        </p>
        <div className="barra"><SeletorPeriodo periodos={PERIODOS} valor={periodo} aoMudar={setPeriodo} /></div>
        <TabelaSimples
          vazio="Nenhuma venda neste período."
          linhas={vendas}
          colunas={[
            { rotulo: "Data", valor: (v) => data(v.data) },
            { rotulo: "Comprador", valor: (v) => v.comprador },
            { rotulo: "Cultura", valor: (v) => nomeRef(dados, "culturas", v.cultura_id) },
            { rotulo: "Valor", num: true, valor: (v) => brl(quantidadeDaNota(v, dados) * (Number(v.preco_unitario) || 0) + (Number(v.frete_cobrado) || 0)) },
            {
              rotulo: "NF-e",
              valor: (v) => {
                const n = notaDe.get(v.id);
                if (!n && v.nota_fiscal) return <span className="selo neutro">nº {v.nota_fiscal} (fora do Bling)</span>;
                if (!n && pendencias(v, dados).length) return <span className="selo atencao">Falta cadastro</span>;
                return <SeloNota nota={n} />;
              },
            },
            {
              rotulo: "",
              valor: (v) => {
                const n = notaDe.get(v.id);
                return (
                  <span style={{ display: "inline-flex", gap: 6 }}>
                    {n?.link_danfe && <a className="btn" href={n.link_danfe} target="_blank" rel="noreferrer">DANFE</a>}
                    <button className="btn" onClick={() => setAberta(v.id)}><Icone nome="lista" /> Nota</button>
                  </span>
                );
              },
            },
          ]}
        />
      </div>

      {vendaAberta && (
        <Emitir key={vendaAberta.id} venda={vendaAberta} nota={notaDe.get(vendaAberta.id)} dados={dados} conexao={conexao}
          salvar={salvar} sincronizarAgora={sincronizarAgora} aoFechar={fechar} />
      )}
    </>
  );
}
