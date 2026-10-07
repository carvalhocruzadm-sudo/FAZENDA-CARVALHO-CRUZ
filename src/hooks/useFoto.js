import { useEffect, useState } from "react";

import { enderecoDoArquivo } from "../lib/arquivos";

// O link da nuvem vale 1 hora; guardamos por 50 minutos para não pedir de novo
// a cada vez que a tela se refaz (a do motorista mostra várias fotos).
const VALIDADE = 50 * 60 * 1000;
const enderecos = new Map();

async function endereco(caminho) {
  const guardado = enderecos.get(caminho);
  if (guardado && Date.now() - guardado.em < VALIDADE) return guardado.url;
  const url = await enderecoDoArquivo(caminho);
  enderecos.set(caminho, { url, em: Date.now() });
  return url;
}

/** Endereço da foto anexada (do formulário, do aparelho ou da nuvem). */
export function useFoto(caminho) {
  const [estado, setEstado] = useState({ caminho: null, src: null, erro: null });
  useEffect(() => {
    if (!caminho) return undefined;
    let vivo = true;
    endereco(caminho)
      .then((src) => vivo && setEstado({ caminho, src, erro: null }))
      .catch((e) => vivo && setEstado({ caminho, src: null, erro: String(e?.message ?? e) }));
    return () => { vivo = false; };
  }, [caminho]);
  if (!caminho) return { src: null, carregando: false, erro: null };
  return estado.caminho === caminho ? { ...estado, carregando: false } : { src: null, carregando: true, erro: null };
}
