import { useCallback, useState } from "react";

import { VerArquivos } from "../components/AnexosFornecedor";
import Formulario from "../components/Formulario";
import { Icone, Modal, TabelaSimples } from "../components/ui";
import { ehPdf } from "../lib/anexos";
import { formatarLinha, lerCodigoBoleto } from "../lib/boleto";
import { linkDoFornecedor, linkWhatsapp } from "../lib/linkFornecedor";
import { ESQUEMA, prepararRegistro, registroNovo } from "../lib/esquema";
import { brl, data } from "../lib/formato";

/**
 * Boletos que os fornecedores mandaram pelo link público. Aqui o escritório
 * confere o arquivo e passa para a Programação de pagamentos (com o
 * vencimento; o pagamento e a despesa seguem dali). Ou recusa, com o motivo.
 */

const SITUACAO = Object.fromEntries(ESQUEMA.boletos_fornecedor.campos.situacao.opcoes);
const SELO = { pendente: "atencao", lancado: "ok", recusado: "ruim" };
const CHAVE_ZAP = "fcc-whatsapp-boletos";

const soNumeros = (t) => String(t ?? "").replace(/\D/g, "");

/** Nome do fornecedor como está no cadastro (pelo CNPJ), senão o que ele digitou. */
function nomeDoFornecedor(b, dados) {
  const doc = soNumeros(b.documento);
  const c = doc && (dados.contatos ?? []).find((x) => soNumeros(x.documento) === doc);
  return c ? c.fantasia || c.nome : b.fornecedor;
}

/** O pagamento já meio pronto: empresa, valor, vencimento, código e categoria do último igual. */
function rascunhoPagamento(b, dados) {
  const empresa = nomeDoFornecedor(b, dados);
  const anterior = [...(dados.boletos ?? [])].reverse().find((x) => x.empresa === empresa && x.categoria);
  const lido = b.linha_digitavel ? lerCodigoBoleto(b.linha_digitavel) : { erro: true };
  return {
    ...registroNovo("boletos"),
    empresa,
    descricao: [b.nota && `NF ${b.nota}`, b.descricao].filter(Boolean).join(" — ") || null,
    valor: b.valor,
    vencimento: b.vencimento,
    forma_pagamento: "Boleto",
    categoria: anterior?.categoria ?? null,
    linha_digitavel: lido.erro ? b.linha_digitavel : formatarLinha(lido.linha_digitavel),
    banco: lido.erro ? null : lido.banco,
    // Foto vai junto para a programação; o PDF fica aqui (abre pelo "Já conferidos").
    fotos: (b.arquivos ?? []).filter((a) => !ehPdf(a)),
    observacao: [`Enviado pelo fornecedor pelo link (código ${b.envio})`, b.contato && `por ${b.contato}`].filter(Boolean).join(" "),
  };
}

function Conferir({ boleto, dados, salvar, aoFechar }) {
  const [pagamento, setPagamento] = useState(() => rascunhoPagamento(boleto, dados));
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const lancar = async () => {
    const { reg, erro: falta } = prepararRegistro("boletos", pagamento, dados);
    if (falta) { setErro(falta); return; }
    setSalvando(true);
    try {
      const lancado = await salvar("boletos", reg);
      await salvar("boletos_fornecedor", { ...boleto, situacao: "lancado", boleto_id: lancado.id, resposta: null });
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
          <Icone nome="calendario" /> {salvando ? "Lançando…" : "Pôr na programação de pagamentos"}
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
        {boleto.linha_digitavel && <><br />Linha digitável: <code>{boleto.linha_digitavel}</code></>}
        {boleto.observacao && <><br />Recado: “{boleto.observacao}”</>}
      </p>
      <VerArquivos arquivos={boleto.arquivos} />

      <h3 style={{ marginTop: 18 }}>Programação de pagamentos</h3>
      <p className="descricao">Confira a empresa, o valor e o vencimento e escolha a categoria. Fica a pagar até você dar baixa.</p>
      <Formulario colecao="boletos" reg={pagamento} setReg={setPagamento} dados={dados} />
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
          Boletos que os fornecedores mandaram pelo link. Abra, confira o arquivo e ponha na programação de pagamentos.
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
