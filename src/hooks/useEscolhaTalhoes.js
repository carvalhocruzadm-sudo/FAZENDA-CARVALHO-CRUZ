import { useCallback, useState } from "react";

import { ESQUEMA, campoObrigatorio, campoVisivel, prepararRegistro } from "../lib/esquema";
import { SEM_CULTURA, chaveCultura, dividirPorTalhoes, fazendaDoTalhao, ordenarNome } from "../lib/talhoes";

const n = (v) => Number(v) || 0;

/**
 * Lançamento novo com talhão: cultura → fazendas → talhões (um, vários ou
 * todos). `iniciar(reg)` ao abrir o formulário; `props` vai para o
 * Formulario; `montar(rascunho)` devolve { regs, erro }: um registro por
 * talhão, com os números divididos pela área (ver `porTalhao` no esquema).
 * Editar um lançamento que já existe continua com um talhão só.
 */
export default function useEscolhaTalhoes(colecao, dados) {
  const def = ESQUEMA[colecao];
  const [cultura, setCultura] = useState("");
  const [areas, setAreas] = useState({});

  const ativo = useCallback((reg) => Boolean(def.porTalhao && reg && !reg.id && def.campos.talhao_id && campoVisivel(def.campos.talhao_id, reg)), [def]);

  const iniciar = useCallback((reg) => {
    const t = reg?.talhao_id && dados.talhoes.find((x) => x.id === reg.talhao_id);
    setCultura(reg?.cultura_id || (t ? chaveCultura(t) : ""));
    setAreas(t ? { [t.id]: t.area_ha ?? "" } : {});
  }, [dados.talhoes]);

  const marcados = () => {
    const fazenda = fazendaDoTalhao(dados);
    return dados.talhoes.filter((t) => t.id in areas && chaveCultura(t) === cultura)
      .sort((a, b) => ordenarNome(fazenda(a), fazenda(b)) || ordenarNome(a.nome, b.nome));
  };

  const montar = (rascunho) => {
    if (!ativo(rascunho)) {
      const { reg, erro } = prepararRegistro(colecao, rascunho, dados);
      return { regs: [reg], erro };
    }
    const ts = marcados();
    if (!ts.length && campoObrigatorio(def.campos.talhao_id, rascunho)) return { regs: [], erro: "Marque pelo menos um talhão." };
    const area = def.porTalhao.area;
    const base = {
      ...rascunho,
      talhao_id: ts[0]?.id ?? null,
      cultura_id: cultura && cultura !== SEM_CULTURA ? cultura : rascunho.cultura_id ?? null,
      ...(area && ts.length ? { [area]: ts.reduce((s, t) => s + n(areas[t.id]), 0) || null } : {}),
    };
    const pronto = prepararRegistro(colecao, base, dados);
    if (pronto.erro || ts.length < 2) return { regs: [pronto.reg], erro: pronto.erro };

    const partes = dividirPorTalhoes(def, pronto.reg, ts.map((t) => ({ talhao: t, area_ha: n(areas[t.id]) })))
      .map((p) => prepararRegistro(colecao, p, dados));
    return { regs: partes.map((p) => p.reg), erro: partes.find((p) => p.erro)?.erro ?? null };
  };

  return { ativo, iniciar, montar, props: { cultura, setCultura, areas, setAreas } };
}
