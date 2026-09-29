import { useEffect, useState } from "react";

import { lerFoto } from "../lib/fotos";

/** Carrega a imagem de uma foto (do aparelho ou da nuvem). */
export function useFoto(id) {
  const [estado, setEstado] = useState({ id: null, src: null, erro: null });
  useEffect(() => {
    if (!id) return undefined;
    let vivo = true;
    lerFoto(id)
      .then((src) => vivo && setEstado({ id, src, erro: src ? null : "Foto ainda não chegou da nuvem" }))
      .catch((e) => vivo && setEstado({ id, src: null, erro: String(e?.message ?? e) }));
    return () => { vivo = false; };
  }, [id]);
  if (!id) return { src: null, carregando: false, erro: null };
  return estado.id === id ? { ...estado, carregando: false } : { src: null, carregando: true, erro: null };
}
