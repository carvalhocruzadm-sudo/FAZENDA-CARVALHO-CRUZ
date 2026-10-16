import { useEffect, useState } from "react";

import { salvarFotoNova, urlDaFoto } from "../lib/fotos";

function useUrlFoto(caminho) {
  const [res, setRes] = useState({ caminho: null, url: null });
  useEffect(() => {
    if (!caminho) return undefined;
    let vivo = true;
    urlDaFoto(caminho).then((url) => vivo && setRes({ caminho, url }));
    return () => { vivo = false; };
  }, [caminho]);
  return caminho && res.caminho === caminho ? res.url : null;
}

/** Mostra a foto guardada em `caminho`; sem foto, mostra `reserva`. */
export function Foto({ caminho, alt = "", className, reserva = null }) {
  const url = useUrlFoto(caminho);
  if (!url) return reserva;
  return <img src={url} alt={alt} className={className} draggable={false} />;
}

/**
 * Botão que abre a câmera (ou a galeria) e devolve o caminho da foto já
 * guardada no aparelho. `camera`: "environment" (traseira), "user" (frontal)
 * ou nada para deixar escolher da galeria.
 */
export function BotaoFoto({ aoTirar, lado, camera, className, children }) {
  const [trabalhando, setTrabalhando] = useState(false);
  const [erro, setErro] = useState(null);

  const escolher = async (e) => {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    setTrabalhando(true);
    setErro(null);
    try {
      aoTirar(await salvarFotoNova(arquivo, lado));
    } catch (err) {
      setErro(String(err?.message ?? err));
    } finally {
      setTrabalhando(false);
    }
  };

  return (
    <>
      <label className={className} aria-busy={trabalhando}>
        <input type="file" accept="image/*" capture={camera} onChange={escolher} hidden />
        {trabalhando ? "Guardando foto…" : children}
      </label>
      {erro && <small style={{ color: "var(--vermelho)" }}>{erro}</small>}
    </>
  );
}

/** Campo de foto dos formulários do escritório. */
export function CampoFoto({ valor, aoMudar, lado }) {
  return (
    <div className="campo-foto">
      <Foto caminho={valor} className="miniatura" reserva={<div className="miniatura vazia">📷</div>} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
        <BotaoFoto aoTirar={aoMudar} lado={lado} className="btn">{valor ? "Trocar foto" : "Tirar / escolher foto"}</BotaoFoto>
        {valor && <button type="button" className="btn perigo" onClick={() => aoMudar(null)}>Tirar a foto</button>}
      </div>
    </div>
  );
}
