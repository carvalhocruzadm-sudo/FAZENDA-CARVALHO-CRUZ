import { useState } from "react";

import { abrirArquivo, ehPdf, lerArquivo } from "../lib/arquivos";
import { lerCodigoDaFoto } from "../lib/codigos";
import { Icone } from "./ui";

const MAX_ARQUIVOS = 4;

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
 * Anexar fotos ou PDFs. Numa foto nova procura o código de barras do boleto e
 * entrega os números em `aoLerCodigo`.
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
      aoMudar([...arquivos, ...novos]);
      if (aoLerCodigo) {
        for (const f of novos.filter((x) => !ehPdf(x))) {
          const codigo = await lerCodigoDaFoto(f, [44, 47]);
          if (codigo) { aoLerCodigo(codigo); break; }
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
