import { useEffect, useRef, useState } from "react";

import { useFoto } from "../hooks/useFoto";
import { guardarFoto } from "../lib/fotos";
import { Icone } from "./ui";

/** A foto em tela cheia; toque em qualquer lugar para fechar. */
export function VisorFoto({ id, aoFechar }) {
  const { src, carregando, erro } = useFoto(id);
  useEffect(() => {
    const esc = (e) => e.key === "Escape" && aoFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aoFechar]);
  return (
    <div className="visor-foto" onClick={aoFechar} role="dialog" aria-label="Foto">
      {src ? <img src={src} alt="" /> : <span>{carregando ? "Carregando foto…" : erro}</span>}
      <button className="btn icone" aria-label="Fechar"><Icone nome="fechar" /></button>
    </div>
  );
}

/** Miniatura que abre a foto grande ao tocar. */
export function Miniatura({ id, tamanho = 72 }) {
  const { src, carregando } = useFoto(id);
  const [aberta, setAberta] = useState(false);
  if (!id) return null;
  return (
    <>
      <button type="button" className="miniatura" style={{ width: tamanho, height: tamanho }}
        onClick={(e) => { e.stopPropagation(); setAberta(true); }} aria-label="Ver foto">
        {src ? <img src={src} alt="" /> : <span>{carregando ? "…" : "📷"}</span>}
      </button>
      {aberta && <VisorFoto id={id} aoFechar={() => setAberta(false)} />}
    </>
  );
}

/** Botão pequeno "📷 Ver" para listas e relatórios. */
export function BotaoFoto({ id }) {
  const [aberta, setAberta] = useState(false);
  if (!id) return "—";
  return (
    <>
      <button type="button" className="btn" style={{ padding: "3px 9px" }} onClick={(e) => { e.stopPropagation(); setAberta(true); }}>📷 Ver</button>
      {aberta && <VisorFoto id={id} aoFechar={() => setAberta(false)} />}
    </>
  );
}

/**
 * Botão que abre a câmera (no celular) ou a galeria, diminui a foto, guarda e
 * devolve o id em `aoTirar`. `children` é o conteúdo do botão.
 */
export function BotaoCamera({ aoTirar, origem, className = "btn", children }) {
  const entrada = useRef(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState(null);

  const escolheu = async (e) => {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    setOcupado(true);
    setErro(null);
    try {
      aoTirar(await guardarFoto(arquivo, origem));
    } catch (err) {
      setErro(String(err?.message ?? err));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <>
      <button type="button" className={className} disabled={ocupado} onClick={() => entrada.current?.click()}>
        {ocupado ? "Guardando foto…" : children}
      </button>
      <input ref={entrada} type="file" accept="image/*" capture="environment" hidden onChange={escolheu} />
      {erro && <small className="negativo">{erro}</small>}
    </>
  );
}

/** Campo de foto do formulário padrão. */
export function CampoFoto({ valor, aoMudar, origem }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <Miniatura id={valor} />
      <BotaoCamera aoTirar={aoMudar} origem={origem}>📷 {valor ? "Trocar foto" : "Tirar / escolher foto"}</BotaoCamera>
      {valor && <button type="button" className="btn perigo" onClick={() => aoMudar(null)}>Tirar</button>}
    </div>
  );
}
