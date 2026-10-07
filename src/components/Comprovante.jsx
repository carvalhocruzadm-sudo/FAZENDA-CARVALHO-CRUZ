import { useEffect, useState } from "react";

import { anexar, ehPdf, enderecoDoArquivo } from "../lib/arquivos";
import { Icone } from "./ui";

/** Mostra o comprovante: a foto na tela ou um botão para abrir o PDF. */
export function PreviaComprovante({ caminho }) {
  const [estado, setEstado] = useState({ url: null, erro: null });

  useEffect(() => {
    let vivo = true;
    let url = null;
    enderecoDoArquivo(caminho)
      .then((u) => { url = u; if (vivo) setEstado({ url: u, erro: null }); })
      .catch((e) => vivo && setEstado({ url: null, erro: String(e?.message ?? e) }));
    return () => {
      vivo = false;
      if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
    };
  }, [caminho]);

  if (estado.erro) return <small className="negativo">{estado.erro}</small>;
  if (!estado.url) return <small>Carregando comprovante…</small>;
  if (ehPdf(caminho)) {
    return <a className="btn" href={estado.url} target="_blank" rel="noreferrer"><Icone nome="exportar" /> Abrir o PDF</a>;
  }
  return (
    <a href={estado.url} target="_blank" rel="noreferrer" title="Abrir em tamanho real">
      <img src={estado.url} alt="Comprovante" className="previa-comprovante" />
    </a>
  );
}

/** Campo "arquivo" do formulário: anexar, ver e trocar o comprovante. */
export function CampoArquivo({ id, colecao, valor, set }) {
  const [ver, setVer] = useState(false);
  const escolher = (e) => {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    set(anexar(colecao, arquivo));
    setVer(true);
  };
  return (
    <>
      <div className="barra" style={{ marginBottom: 0 }}>
        <label className="btn" htmlFor={id}><Icone nome="mais" /> {valor ? "Trocar" : "Anexar foto ou PDF"}</label>
        <input id={id} type="file" accept="image/*,application/pdf" onChange={escolher} hidden />
        {valor && <button type="button" className="btn" onClick={() => setVer((v) => !v)}>{ver ? "Esconder" : "Ver"}</button>}
        {valor && <button type="button" className="btn perigo" onClick={() => { set(null); setVer(false); }}>Tirar</button>}
      </div>
      {valor && ver && <PreviaComprovante caminho={valor} />}
    </>
  );
}
