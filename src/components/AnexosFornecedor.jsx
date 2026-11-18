import { useState } from "react";

import { abrirArquivo, ehPdf, lerArquivo } from "../lib/anexos";
import { Icone } from "./ui";

const MAX_ARQUIVOS = 4;
const pdfOriginal = (a) => a.type === "application/pdf" || /\.pdf$/i.test(a.name ?? "");

/** Miniatura de uma foto ou de um PDF; tocar abre o arquivo inteiro. */
function Miniatura({ arquivo, indice, aoRemover }) {
  return (
    <div className="foto">
      <button type="button" className="miniatura" onClick={() => abrirArquivo(arquivo)} title="Abrir">
        {ehPdf(arquivo)
          ? <span className="pdf"><Icone nome="lista" tamanho={28} /> PDF {indice + 1}</span>
          : <img src={arquivo} alt={`Arquivo ${indice + 1}`} />}
      </button>
      {aoRemover && (
        <button type="button" className="btn icone perigo" aria-label="Remover arquivo" onClick={aoRemover}>
          <Icone nome="lixo" tamanho={14} />
        </button>
      )}
    </div>
  );
}

/** Só para ver (tela de conferência). */
export function VerArquivos({ arquivos }) {
  if (!arquivos?.length) return <small>Nenhum arquivo.</small>;
  return <div className="fotos">{arquivos.map((a, i) => <Miniatura key={i} arquivo={a} indice={i} />)}</div>;
}

/**
 * Anexar fotos ou PDFs do boleto. Num PDF novo procura o código do boleto e
 * entrega o que leu (linha digitável, valor, vencimento) e a lista de
 * arquivos já com o novo em `aoLerCodigo(lido, arquivos)`.
 */
export function AnexarArquivos({ valor, aoMudar, aoLerCodigo }) {
  const arquivos = valor ?? [];
  const [erro, setErro] = useState(null);
  const [lendo, setLendo] = useState(false);

  const adicionar = async (e) => {
    const escolhidos = [...e.target.files].slice(0, MAX_ARQUIVOS - arquivos.length);
    e.target.value = "";
    setErro(null);
    setLendo(true);
    try {
      const novos = await Promise.all(escolhidos.map((a) => lerArquivo(a)));
      const lista = [...arquivos, ...novos];
      aoMudar(lista);
      if (aoLerCodigo) {
        // O leitor de PDF é pesado: só carrega quando precisa.
        const { lerBoletosDoPdf } = await import("../lib/boletoPdf");
        for (const pdf of escolhidos.filter(pdfOriginal)) {
          const [achado] = await lerBoletosDoPdf(pdf).catch(() => []);
          if (achado) { aoLerCodigo(achado.lido, lista); break; }
        }
      }
    } catch (err) {
      setErro(err.message);
    }
    setLendo(false);
  };

  return (
    <div className="fotos">
      {arquivos.map((a, i) => (
        <Miniatura key={i} arquivo={a} indice={i} aoRemover={() => aoMudar(arquivos.filter((_, j) => j !== i))} />
      ))}
      {arquivos.length < MAX_ARQUIVOS && (
        <label className="btn foto-nova">
          <Icone nome="mais" /> Foto ou PDF do boleto
          <input type="file" accept="image/*,application/pdf,.pdf" multiple hidden onChange={adicionar} />
        </label>
      )}
      {lendo && <small>Lendo o arquivo…</small>}
      {erro && <small className="negativo">{erro}</small>}
    </div>
  );
}

const MAX_DE_UMA_VEZ = 20;

/**
 * Vários boletos de uma vez: cada arquivo vira um boleto. Num PDF o código é
 * lido (e um PDF com vários boletos vira vários); um .zip (do WhatsApp Web)
 * é aberto e cada PDF de dentro entra. `aoAdicionar([{ arquivos, lido }])`,
 * com `lido` null quando não deu para ler o código.
 */
export function AnexarVarios({ aoAdicionar }) {
  const [lendo, setLendo] = useState(null);
  const [erros, setErros] = useState([]);

  const adicionar = async (e) => {
    const escolhidos = [...e.target.files];
    e.target.value = "";
    if (!escolhidos.length) return;
    setErros([]);
    setLendo("Abrindo os arquivos…");
    const { abrirZips, lerBoletosDoPdf } = await import("../lib/boletoPdf");
    const { pdfs: arquivos, problemas } = await abrirZips(escolhidos);
    const falhas = problemas.map((p) => `${p.arquivo}: ${p.erro}`);
    const novos = [];
    for (const [i, arquivo] of arquivos.slice(0, MAX_DE_UMA_VEZ).entries()) {
      setLendo(`Lendo ${i + 1} de ${Math.min(arquivos.length, MAX_DE_UMA_VEZ)}…`);
      try {
        const conteudo = await lerArquivo(arquivo);
        const achados = pdfOriginal(arquivo) ? await lerBoletosDoPdf(arquivo).catch(() => []) : [];
        if (!achados.length) novos.push({ arquivos: [conteudo], lido: null });
        for (const a of achados) novos.push({ arquivos: [conteudo], lido: a.lido });
      } catch (err) {
        falhas.push(err.message);
      }
    }
    if (arquivos.length > MAX_DE_UMA_VEZ) falhas.push(`Entraram só os ${MAX_DE_UMA_VEZ} primeiros. Mande o resto num segundo envio.`);
    setErros(falhas);
    setLendo(null);
    if (novos.length) aoAdicionar(novos);
  };

  return (
    <div className="varios">
      <label className={`btn primario ${lendo ? "desligado" : ""}`}>
        <Icone nome="importar" /> {lendo ?? "Anexar vários boletos de uma vez"}
        <input type="file" accept="image/*,application/pdf,.pdf,application/zip,.zip" multiple hidden disabled={Boolean(lendo)} onChange={adicionar} />
      </label>
      <small>Escolha todos os arquivos juntos (foto, PDF ou .zip). Cada um vira um boleto; no PDF o valor e o vencimento se preenchem sozinhos.</small>
      {erros.map((t, i) => <small key={i} className="negativo">{t}</small>)}
    </div>
  );
}
