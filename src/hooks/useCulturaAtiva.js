import { createContext, useContext } from "react";

/**
 * A cultura escolhida no topo do sistema ("" = todas). As listas mostram só
 * os lançamentos dela e o lançamento novo já vem com ela.
 */
export const CulturaAtiva = createContext({ cultura: "", setCultura: () => {} });

export default function useCulturaAtiva() {
  return useContext(CulturaAtiva);
}

/** O registro é da cultura? (coleção sem cultura: sempre é) */
export function daCultura(def, reg, cultura) {
  if (!cultura) return true;
  if (def.campos.cultura_id) return reg.cultura_id === cultura;
  if (def.campos.culturas?.tipo === "refs") return !reg.culturas?.length || reg.culturas.includes(cultura);
  return true;
}
