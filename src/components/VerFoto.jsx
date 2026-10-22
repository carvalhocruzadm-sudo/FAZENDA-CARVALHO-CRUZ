import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { Icone } from "./ui";

/** Foto em tela cheia por cima de tudo. Fecha no X, tocando fora ou no Esc. */
export function JanelaFoto({ src, alt, aoFechar }) {
  useEffect(() => {
    // Captura antes do Modal de baixo: o Esc fecha só a foto, não o formulário.
    const esc = (e) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      aoFechar();
    };
    window.addEventListener("keydown", esc, true);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", esc, true);
      document.body.style.overflow = overflow;
    };
  }, [aoFechar]);

  const parar = (e) => e.stopPropagation();
  return createPortal(
    <div className="janela-foto" role="dialog" aria-modal="true" aria-label={alt || "Foto"}
      onClick={(e) => { e.stopPropagation(); aoFechar(); }} onMouseDown={parar}>
      <img src={src} alt={alt} onClick={parar} />
      <button type="button" className="btn icone fechar" aria-label="Fechar" onClick={(e) => { e.stopPropagation(); aoFechar(); }}>
        <Icone nome="fechar" />
      </button>
    </div>,
    document.body,
  );
}

/** Imagem que abre grande ao tocar. Funciona até dentro de botões e cartões. */
export function ImagemAmpliavel({ src, alt = "", className }) {
  const [aberta, setAberta] = useState(false);
  const abrir = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setAberta(true);
  };
  return (
    <>
      <img src={src} alt={alt} className={`${className ?? ""} ampliavel`.trim()} draggable={false}
        role="button" tabIndex={0} title="Ver a foto grande" onClick={abrir}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && abrir(e)} />
      {aberta && <JanelaFoto src={src} alt={alt} aoFechar={() => setAberta(false)} />}
    </>
  );
}
