import { useState } from "react";

import { AnexarArquivos } from "../components/Arquivos";
import { Icone } from "../components/ui";
import { novoId } from "../hooks/useDados";
import { codigoEnvio, linkWhatsapp, mensagemConfirmacao } from "../lib/boletos";
import { ESQUEMA, hoje, prepararRegistro, registroNovo } from "../lib/esquema";
import { brl } from "../lib/formato";
import { supabase, supabaseConfigurado } from "../lib/supabase";

/**
 * Página pública (sem login) que o fornecedor abre pelo link: preenche os
 * dados da empresa, anexa um ou mais boletos com valor e vencimento e envia.
 * O boleto cai em Financeiro → Boletos de fornecedores, esperando conferência.
 * No fim aparece a mensagem de confirmação para ele mandar pelo WhatsApp.
 */

const DEF = ESQUEMA.boletos_fornecedor;
const boletoVazio = () => ({ chave: novoId(), valor: "", vencimento: "", codigo_boleto: "", nota: "", descricao: "", arquivos: [] });

function Campo({ rotulo, obrigatorio, dica, children }) {
  return (
    <label className="campo">
      <span>{rotulo}{obrigatorio && <em> *</em>}</span>
      {children}
      {dica && <small>{dica}</small>}
    </label>
  );
}

function Boleto({ boleto, numero, aoMudar, aoRemover }) {
  // Digitar ou ler o código do boleto já preenche valor e vencimento.
  const mudar = (chave, v) => {
    let novo = { ...boleto, [chave]: v };
    if (chave === "codigo_boleto") novo = { ...novo, ...DEF.aoMudar.codigo_boleto(novo) };
    aoMudar(novo);
  };
  const campo = (chave, props = {}) => (
    <input value={boleto[chave] ?? ""} onChange={(e) => mudar(chave, e.target.value)} {...props} />
  );

  return (
    <div className="boleto">
      <header>
        <b>Boleto {numero}</b>
        {aoRemover && <button type="button" className="btn perigo" onClick={aoRemover}><Icone nome="lixo" tamanho={14} /> Tirar</button>}
      </header>
      <div className="form">
        <div className="campo largo">
          <span>Arquivo do boleto (foto ou PDF)<em> *</em></span>
          <AnexarArquivos valor={boleto.arquivos} aoMudar={(v) => mudar("arquivos", v)}
            aoLerCodigo={boleto.codigo_boleto ? undefined : (c) => mudar("codigo_boleto", c)} />
        </div>
        <Campo rotulo="Valor (R$)" obrigatorio>{campo("valor", { type: "number", inputMode: "decimal", step: "0.01", min: "0" })}</Campo>
        <Campo rotulo="Vencimento" obrigatorio>{campo("vencimento", { type: "date" })}</Campo>
        <Campo rotulo="Nº da nota fiscal">{campo("nota", { inputMode: "numeric" })}</Campo>
        <Campo rotulo="Referente a" dica="Ex.: adubo, peças, serviço">{campo("descricao")}</Campo>
        <div className="largo">
          <Campo rotulo="Linha digitável do boleto" dica="Opcional. Colando os números, o valor e o vencimento se preenchem sozinhos.">
            {campo("codigo_boleto", { inputMode: "numeric", autoComplete: "off" })}
          </Campo>
        </div>
      </div>
    </div>
  );
}

function Confirmacao({ enviados, whatsapp, novoEnvio }) {
  const texto = mensagemConfirmacao(enviados);
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try { await navigator.clipboard.writeText(texto); setCopiado(true); } catch { setCopiado(false); }
  };

  return (
    <div className="cartao">
      <div className="aviso ok"><b>Recebemos {enviados.length === 1 ? "o seu boleto" : `os seus ${enviados.length} boletos`}!</b></div>
      <p className="descricao">
        Para concluir, <b>mande esta confirmação pelo WhatsApp</b> para a Fazenda Carvalho Cruz:
      </p>
      <pre className="mensagem">{texto}</pre>
      <div className="acoes">
        <a className="btn primario" href={linkWhatsapp(whatsapp, texto)} target="_blank" rel="noreferrer">
          <Icone nome="exportar" /> Enviar confirmação pelo WhatsApp
        </a>
        <button type="button" className="btn" onClick={copiar}>{copiado ? "Copiado ✓" : "Copiar mensagem"}</button>
        <button type="button" className="btn" onClick={novoEnvio}><Icone nome="mais" /> Enviar outros boletos</button>
      </div>
    </div>
  );
}

export default function EnviarBoleto() {
  const whatsapp = new URLSearchParams(window.location.search).get("zap") ?? "";
  const [empresa, setEmpresa] = useState({ fornecedor: "", documento: "", contato: "" });
  const [boletos, setBoletos] = useState(() => [boletoVazio()]);
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [enviados, setEnviados] = useState(null);

  const mudarEmpresa = (chave) => (e) => { setErro(null); setEmpresa((x) => ({ ...x, [chave]: e.target.value })); };
  const mudarBoleto = (i, novo) => { setErro(null); setBoletos((l) => l.map((b, j) => (j === i ? novo : b))); };

  const enviar = async (e) => {
    e.preventDefault();
    setErro(null);

    const envio = codigoEnvio();
    const registros = [];
    for (const [i, b] of boletos.entries()) {
      // Só as colunas da tabela (a "chave" da tela não vai para o banco).
      const dadosBoleto = Object.fromEntries(Object.keys(DEF.campos).filter((k) => k in b).map((k) => [k, b[k]]));
      const { reg, erro: falta } = prepararRegistro("boletos_fornecedor", {
        ...registroNovo("boletos_fornecedor"), ...empresa, ...dadosBoleto,
        id: novoId(), envio, data: hoje(), situacao: "pendente",
      });
      if (falta) { setErro(boletos.length > 1 ? `Boleto ${i + 1} — ${falta}` : falta); return; }
      if (!(reg.valor > 0)) { setErro(`Boleto ${i + 1} — o valor precisa ser maior que zero.`); return; }
      registros.push(reg);
    }

    setEnviando(true);
    try {
      // Um por vez: com vários PDFs, um envio só ficaria grande demais.
      for (const [i, reg] of registros.entries()) {
        const { error } = await supabase.from("boletos_fornecedor").insert(reg);
        if (error) throw new Error(`Não foi possível enviar o boleto ${i + 1}: ${error.message}`);
      }
      setEnviados(registros);
      window.scrollTo(0, 0);
    } catch (err) {
      setErro(navigator.onLine ? String(err.message ?? err) : "Sem internet. Conecte e toque em Enviar de novo.");
    }
    setEnviando(false);
  };

  const novoEnvio = () => {
    setBoletos([boletoVazio()]);
    setEnviados(null);
    window.scrollTo(0, 0);
  };

  const total = boletos.reduce((s, b) => s + (Number(b.valor) || 0), 0);

  return (
    <div className="publico">
      <div className="cabeca">
        <img src="/logo-fazenda.png" alt="Fazenda Carvalho Cruz" />
        <h2>Envio de boletos</h2>
        <p className="descricao" style={{ margin: "6px 0 0" }}>Fazenda Carvalho Cruz</p>
      </div>

      {!supabaseConfigurado ? (
        <div className="cartao"><div className="aviso">Este endereço ainda não está recebendo boletos. Fale com a fazenda.</div></div>
      ) : enviados ? (
        <Confirmacao enviados={enviados} whatsapp={whatsapp} novoEnvio={novoEnvio} />
      ) : (
        <form className="cartao" onSubmit={enviar}>
          <p className="descricao">
            Anexe aqui os boletos para pagamento. Eles chegam direto no sistema da fazenda. No fim, mande a
            confirmação pelo WhatsApp.
          </p>

          <h3>Sua empresa</h3>
          <div className="form" style={{ marginBottom: 18 }}>
            <Campo rotulo="Nome da empresa" obrigatorio>
              <input value={empresa.fornecedor} onChange={mudarEmpresa("fornecedor")} autoComplete="organization" required />
            </Campo>
            <Campo rotulo="CNPJ / CPF">
              <input value={empresa.documento} onChange={mudarEmpresa("documento")} inputMode="numeric" />
            </Campo>
            <Campo rotulo="Seu nome e telefone">
              <input value={empresa.contato} onChange={mudarEmpresa("contato")} autoComplete="name" />
            </Campo>
          </div>

          <h3>Boletos</h3>
          {boletos.map((b, i) => (
            <Boleto key={b.chave} boleto={b} numero={i + 1} aoMudar={(novo) => mudarBoleto(i, novo)}
              aoRemover={boletos.length > 1 ? () => setBoletos((l) => l.filter((_, j) => j !== i)) : undefined} />
          ))}
          <button type="button" className="btn" onClick={() => setBoletos((l) => [...l, boletoVazio()])}>
            <Icone nome="mais" /> Mais um boleto
          </button>

          {erro && <div className="aviso" style={{ marginTop: 14 }}>{erro}</div>}
          <div className="acoes">
            <button className="btn primario" disabled={enviando} style={{ flex: 1 }}>
              <Icone nome="exportar" /> {enviando ? "Enviando…" : `Enviar ${boletos.length === 1 ? "boleto" : `${boletos.length} boletos`}${total ? ` — ${brl(total)}` : ""}`}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
