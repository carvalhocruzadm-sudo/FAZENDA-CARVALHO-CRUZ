import { useEffect, useRef, useState } from "react";

import { useFoto } from "../hooks/useFoto";
import { anexar } from "../lib/arquivos";
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

/** Diminui a foto da câmera (lado maior 1280 px, JPEG): ainda dá para ler o ticket. */
function reduzir(arquivo) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const escala = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * escala);
      canvas.height = Math.round(img.naturalHeight * escala);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => (b ? resolve(new File([b], "foto.jpg", { type: "image/jpeg" })) : reject(new Error("Não foi possível guardar a foto."))), "image/jpeg", 0.72);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Não foi possível abrir a foto.")); };
    img.src = url;
  });
}

/**
 * Botão que abre a câmera (no celular) ou a galeria. A foto, diminuída, fica
 * anexada esperando o "Salvar" do lançamento (ver lib/arquivos.js) e
 * `aoTirar` recebe o caminho dela.
 */
export function BotaoCamera({ aoTirar, colecao, className = "btn", children }) {
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
      aoTirar(anexar(colecao, await reduzir(arquivo)));
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
