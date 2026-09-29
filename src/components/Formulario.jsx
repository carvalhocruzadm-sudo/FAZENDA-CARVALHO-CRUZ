import { useId, useMemo, useState } from "react";

import { ESQUEMA, campoObrigatorio, campoVisivel } from "../lib/esquema";
import { formatarCoordenadas, lerCoordenadas, linkMapa, minhaPosicao } from "../lib/mapa";
import { CampoFoto } from "./Foto";

/** Sugestões de um campo: a lista fixa + o que já foi digitado antes. */
function sugestoesDoCampo(campo, dados) {
  const fixas = campo.sugestoes ?? [];
  if (!campo.sugestoesDe) return fixas;
  const [colecao, chave] = campo.sugestoesDe;
  const usadas = (dados[colecao] ?? []).map((x) => x[chave]).filter(Boolean);
  return [...new Set([...fixas, ...usadas])].sort((a, b) => String(a).localeCompare(String(b)));
}

/** Coordenadas de GPS: botão para pegar a posição do celular ou colar do Google Maps. */
function CampoLocal({ id, valor, set }) {
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState(null);
  const pegar = async () => {
    setBuscando(true);
    setErro(null);
    try {
      set(formatarCoordenadas(await minhaPosicao()));
    } catch (e) {
      setErro(e.message);
    } finally {
      setBuscando(false);
    }
  };
  // Link do Google Maps colado vira só as coordenadas.
  const aoSair = () => {
    const c = lerCoordenadas(valor);
    if (c) set(formatarCoordenadas(c));
  };
  const link = linkMapa(valor);
  return (
    <>
      <input id={id} type="text" value={valor ?? ""} onChange={(e) => set(e.target.value)} onBlur={aoSair} placeholder="-17.123456, -39.654321" />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn" onClick={pegar} disabled={buscando}>📍 {buscando ? "Procurando…" : "Pegar minha localização"}</button>
        {link && <a className="btn" href={link} target="_blank" rel="noreferrer">🗺️ Ver no mapa</a>}
      </div>
      {valor && !lerCoordenadas(valor) && <small className="negativo">Não entendi estas coordenadas. Use o formato “-17.12, -39.65” (link curto do Maps não serve).</small>}
      {erro && <small className="negativo">{erro}</small>}
    </>
  );
}

function Campo({ chave, campo, reg, dados, aoMudar, colecao }) {
  const id = useId();
  const valor = reg[chave];
  const obrig = campoObrigatorio(campo, reg);
  const largo = ["textoLongo", "local"].includes(campo.tipo);
  const somenteLeitura = typeof campo.somenteLeitura === "function" ? campo.somenteLeitura(reg) : campo.somenteLeitura;
  const set = (v) => aoMudar(chave, v);

  if (campo.tipo === "booleano") {
    return (
      <label className="campo check">
        <input type="checkbox" checked={Boolean(valor)} onChange={(e) => set(e.target.checked)} />
        <span>{campo.rotulo}</span>
      </label>
    );
  }

  let controle;
  switch (campo.tipo) {
    case "textoLongo":
      controle = <textarea id={id} rows={2} value={valor ?? ""} onChange={(e) => set(e.target.value)} />;
      break;
    case "numero":
    case "dinheiro":
      controle = (
        <input id={id} type="number" inputMode="decimal" step="any" value={valor ?? ""} readOnly={somenteLeitura}
          onChange={(e) => set(e.target.value)} placeholder={campo.tipo === "dinheiro" ? "R$" : ""} />
      );
      break;
    case "data":
      controle = <input id={id} type="date" value={valor ?? ""} onChange={(e) => set(e.target.value)} />;
      break;
    case "opcoes":
      controle = (
        <select id={id} value={valor ?? ""} onChange={(e) => set(e.target.value || null)}>
          {!obrig && <option value="">—</option>}
          {campo.opcoes.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
        </select>
      );
      break;
    case "ref": {
      const def = ESQUEMA[campo.colecao];
      const opcoes = (dados[campo.colecao] ?? [])
        .filter((x) => x.id === valor || (x.ativo !== false && (!campo.filtro || campo.filtro(x))))
        .sort(def.ordem ?? (() => 0));
      controle = (
        <select id={id} value={valor ?? ""} onChange={(e) => set(e.target.value || null)}>
          <option value="">{opcoes.length ? "— escolha —" : `Nenhum ${def.singular} cadastrado`}</option>
          {opcoes.map((x) => <option key={x.id} value={x.id}>{def.resumo?.(x) ?? x.nome}</option>)}
        </select>
      );
      break;
    }
    case "sugestao": {
      const lista = sugestoesDoCampo(campo, dados);
      controle = (
        <>
          <input id={id} list={`${id}-l`} value={valor ?? ""} onChange={(e) => set(e.target.value)} autoComplete="off" />
          <datalist id={`${id}-l`}>{lista.map((s) => <option key={s} value={s} />)}</datalist>
        </>
      );
      break;
    }
    case "foto":
      controle = <CampoFoto valor={valor} aoMudar={set} origem={`${colecao}.${chave}`} />;
      break;
    case "local":
      controle = <CampoLocal id={id} valor={valor} set={set} />;
      break;
    default:
      controle = <input id={id} type="text" value={valor ?? ""} readOnly={somenteLeitura} onChange={(e) => set(e.target.value)} />;
  }

  return (
    <div className={`campo ${largo ? "largo" : ""}`}>
      <span><label htmlFor={id}>{campo.rotulo}</label>{obrig && <em> *</em>}</span>
      {controle}
      {campo.dica && <small>{campo.dica}</small>}
    </div>
  );
}

/**
 * Formulário gerado do esquema. `reg` é o rascunho; cada mudança passa pelos
 * `aoMudar` do esquema (que completam outros campos) e os campos calculados
 * são refeitos para aparecer já preenchidos.
 */
export default function Formulario({ colecao, reg, setReg, dados, contexto }) {
  const def = ESQUEMA[colecao];

  const aoMudar = (chave, v) => {
    setReg((atual) => {
      let novo = { ...atual, [chave]: v };
      const extra = def.aoMudar?.[chave]?.(novo, dados, contexto);
      if (extra) novo = { ...novo, ...extra };
      return { ...novo, ...(def.calcular?.(novo, dados) ?? {}) };
    });
  };

  const campos = useMemo(() => Object.entries(def.campos), [def]);

  return (
    <div className="form">
      {campos.filter(([, c]) => campoVisivel(c, reg)).map(([chave, campo]) => (
        <Campo key={chave} chave={chave} campo={campo} reg={reg} dados={dados} aoMudar={aoMudar} colecao={colecao} />
      ))}
    </div>
  );
}
