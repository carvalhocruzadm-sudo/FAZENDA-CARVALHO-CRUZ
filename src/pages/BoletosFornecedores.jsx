import { useCallback, useState } from "react";

import { VerArquivos } from "../components/Arquivos";
import Formulario from "../components/Formulario";
import { Icone, Modal, TabelaSimples } from "../components/ui";
import { linkDoFornecedor, linkWhatsapp } from "../lib/boletos";
import { fornecedorPeloCnpj } from "../lib/codigos";
import { ESQUEMA, prepararRegistro, registroNovo } from "../lib/esquema";
import { brl, data } from "../lib/formato";

/**
 * Boletos que os fornecedores mandaram pelo link público. Aqui o escritório
 * confere o arquivo, escolhe a categoria e lança como despesa a pagar (com o
 * vencimento, e o Painel avisa quando estiver perto). Ou recusa, com o motivo.
 */

const SITUACAO = Object.fromEntries(ESQUEMA.boletos_fornecedor.campos.situacao.opcoes);
const SELO = { pendente: "atencao", lancado: "ok", recusado: "ruim" };
const CHAVE_ZAP = "fcc-whatsapp-boletos";

const soNumeros = (t) => String(t ?? "").replace(/\D/g, "");

/** A despesa já meio pronta: valor, vencimento, favorecido, a pagar por boleto. */
function rascunhoDespesa(b, dados) {
  const cadastrado = soNumeros(b.documento) ? fornecedorPeloCnpj(dados.contatos, soNumeros(b.documento)) : null;
  const anterior = dados.despesas.find((d) => d.favorecido && d.favorecido === (cadastrado || b.fornecedor));
  return {
    ...registroNovo("despesas"),
    data: b.data,
    categoria: anterior?.categoria ?? null,
    descricao: [`Boleto ${b.fornecedor}`, b.nota && `NF ${b.nota}`, b.descricao].filter(Boolean).join(" — "),
    valor: b.valor,
    forma_pagamento: "Boleto",
    favorecido: cadastrado || b.fornecedor,
    vencimento: b.vencimento,
    pago: false,
    nota: b.nota,
  };
}

function Conferir({ boleto, dados, salvar, aoFechar }) {
  const [despesa, setDespesa] = useState(() => rascunhoDespesa(boleto, dados));
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const lancar = async () => {
    const { reg, erro: falta } = prepararRegistro("despesas", despesa);
    if (falta) { setErro(falta); return; }
    setSalvando(true);
    try {
      const lancada = await salvar("despesas", reg);
      await salvar("boletos_fornecedor", { ...boleto, situacao: "lancado", despesa_id: lancada.id, resposta: null });
      aoFechar();
    } catch (err) {
      setErro(String(err?.message ?? err));
      setSalvando(false);
    }
  };

  const recusar = async () => {
    const motivo = window.prompt("Por que está recusando? (fica anotado aqui; avise o fornecedor)");
    if (motivo == null) return;
    setSalvando(true);
    await salvar("boletos_fornecedor", { ...boleto, situacao: "recusado", resposta: motivo.trim() || "Recusado" });
    aoFechar();
  };

  return (
    <Modal titulo="Conferir boleto do fornecedor" aoFechar={aoFechar} rodape={
      <>
        <button className="btn perigo" onClick={recusar} disabled={salvando}><Icone nome="fechar" /> Recusar</button>
        <span className="espaco" />
        <button className="btn" onClick={aoFechar}>Depois</button>
        <button className="btn primario" onClick={lancar} disabled={salvando}>
          <Icone nome="dinheiro" /> {salvando ? "Lançando…" : "Lançar como despesa a pagar"}
        </button>
      </>
    }>
      {erro && <div className="aviso">{erro}</div>}

      <h3>O que o fornecedor mandou</h3>
      <p className="descricao">
        <b>{boleto.fornecedor}</b>{boleto.documento && <> ({boleto.documento})</>} · enviado em {data(boleto.data)} · código <b>{boleto.envio}</b>
        {boleto.contato && <><br />Quem enviou: {boleto.contato}</>}
        <br /><b>{brl(boleto.valor)}</b>, vence <b>{data(boleto.vencimento)}</b>
        {boleto.nota && <> · NF {boleto.nota}</>}{boleto.descricao && <> · {boleto.descricao}</>}
        {boleto.codigo_boleto && <><br />Linha digitável: <code>{boleto.codigo_boleto}</code></>}
        {boleto.observacao && <><br />Recado: “{boleto.observacao}”</>}
      </p>
      <VerArquivos arquivos={boleto.arquivos} />

      <h3 style={{ marginTop: 18 }}>Despesa</h3>
      <p className="descricao">Confira, escolha a categoria e o centro de custo. Fica como não paga até você marcar.</p>
      <Formulario colecao="despesas" reg={despesa} setReg={setDespesa} dados={dados} />
    </Modal>
  );
}

/** O link que se manda para os fornecedores, com o WhatsApp que recebe as confirmações. */
function LinkParaFornecedores() {
  const [zap, setZap] = useState(() => {
    try { return localStorage.getItem(CHAVE_ZAP) ?? ""; } catch { return ""; }
  });
  const [copiado, setCopiado] = useState(false);
  const link = linkDoFornecedor(zap);

  const mudarZap = (v) => {
    setZap(v);
    setCopiado(false);
    try { localStorage.setItem(CHAVE_ZAP, v); } catch { /* sem armazenamento: só não lembra o número */ }
  };
  const copiar = async () => {
    try { await navigator.clipboard.writeText(link); setCopiado(true); } catch { window.prompt("Copie o link:", link); }
  };
  const convite = `Olá! Para enviar boletos para pagamento à Fazenda Carvalho Cruz, use este link:\n${link}`;

  return (
    <div className="cartao">
      <h2>Link para os fornecedores</h2>
      <p className="descricao">
        Mande este link para os fornecedores. Eles anexam o boleto (foto ou PDF), informam valor e vencimento, e no
        fim recebem uma mensagem pronta para mandar no seu WhatsApp confirmando o envio. Não precisam de senha.
      </p>
      <div className="form" style={{ alignItems: "end" }}>
        <label className="campo">
          <span>Seu WhatsApp (recebe as confirmações)</span>
          <input value={zap} onChange={(e) => mudarZap(e.target.value)} inputMode="tel" placeholder="(73) 99999-0000" />
        </label>
        <label className="campo largo">
          <span>Link</span>
          <input value={link} readOnly onFocus={(e) => e.target.select()} />
        </label>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
        <button className="btn primario" onClick={copiar}>{copiado ? "Copiado ✓" : "Copiar link"}</button>
        <a className="btn" href={linkWhatsapp("", convite)} target="_blank" rel="noreferrer"><Icone nome="exportar" /> Mandar o link pelo WhatsApp</a>
        <a className="btn" href={link} target="_blank" rel="noreferrer">Ver como o fornecedor vê</a>
      </div>
    </div>
  );
}

export default function BoletosFornecedores({ dados, salvar }) {
  const [aberto, setAberto] = useState(null);
  const fechar = useCallback(() => setAberto(null), []);

  const todos = dados.boletos_fornecedor;
  const pendentes = todos.filter((b) => b.situacao === "pendente")
    .sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)));
  const resolvidos = todos.filter((b) => b.situacao !== "pendente")
    .sort((a, b) => String(b.atualizado_em ?? "").localeCompare(String(a.atualizado_em ?? ""))).slice(0, 50);

  const colunas = [
    { rotulo: "Enviado", valor: (b) => data(b.data) },
    { rotulo: "Fornecedor", valor: (b) => b.fornecedor },
    { rotulo: "Nota", valor: (b) => b.nota || "—" },
    { rotulo: "Vencimento", valor: (b) => data(b.vencimento) },
    { rotulo: "Valor", num: true, valor: (b) => brl(b.valor) },
    { rotulo: "Código", valor: (b) => b.envio || "—" },
    { rotulo: "Situação", valor: (b) => <span className={`selo ${SELO[b.situacao] ?? "neutro"}`}>{SITUACAO[b.situacao] ?? b.situacao}</span> },
  ];

  return (
    <>
      <div className="cartao">
        <p className="descricao">
          Boletos que os fornecedores mandaram pelo link. Abra, confira o arquivo e lance como despesa a pagar.
        </p>
        <TabelaSimples
          vazio="Nenhum boleto esperando conferência."
          linhas={pendentes}
          colunas={[...colunas, { rotulo: "", valor: (b) => <button className="btn primario" onClick={() => setAberto(b)}>Conferir</button> }]}
        />
      </div>
      <LinkParaFornecedores />
      {resolvidos.length > 0 && (
        <div className="cartao">
          <h2>Já conferidos</h2>
          <TabelaSimples linhas={resolvidos} colunas={[
            ...colunas,
            { rotulo: "Arquivo", valor: (b) => <VerArquivos arquivos={b.arquivos} /> },
            { rotulo: "Motivo", valor: (b) => b.resposta || "—" },
          ]} />
        </div>
      )}
      {aberto && <Conferir key={aberto.id} boleto={aberto} dados={dados} salvar={salvar} aoFechar={fechar} />}
    </>
  );
}
