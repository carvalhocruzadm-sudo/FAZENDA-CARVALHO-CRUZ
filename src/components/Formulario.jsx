import { useId, useMemo, useState } from "react";

import { lerCodigoDaFoto } from "../lib/codigos";
import { ESQUEMA, campoObrigatorio, campoVisivel } from "../lib/esquema";
import ConsultaProduto from "./ConsultaProduto";
import { Icone } from "./ui";

/** Sugestões de um campo: a lista fixa + o que já foi digitado antes. */
function sugestoesDoCampo(campo, dados) {
  const fixas = campo.sugestoes ?? [];
  if (!campo.sugestoesDe) return fixas;
  // Uma fonte [coleção, coluna] ou várias, cada uma com filtro opcional.
  const fontes = Array.isArray(campo.sugestoesDe[0]) ? campo.sugestoesDe : [campo.sugestoesDe];
  const usadas = fontes.flatMap(([colecao, chave, filtro]) =>
    (dados[colecao] ?? []).filter((x) => !filtro || filtro(x)).map((x) => x[chave]).filter(Boolean));
  return [...new Set([...fixas, ...usadas])].sort((a, b) => String(a).localeCompare(String(b)));
}

/** Reduz a foto (lado maior 1000 px, JPEG) para caber no registro e sincronizar rápido. */
function reduzirFoto(arquivo, ladoMaior = 1000) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, ladoMaior / Math.max(img.width, img.height));
      const tela = document.createElement("canvas");
      tela.width = Math.round(img.width * escala);
      tela.height = Math.round(img.height * escala);
      tela.getContext("2d").drawImage(img, 0, 0, tela.width, tela.height);
      URL.revokeObjectURL(url);
      resolve(tela.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Não consegui abrir essa foto.")); };
    img.src = url;
  });
}

const MAX_FOTOS = 6;

/** `aoLerCodigo` recebe os números do código de barras achado numa foto nova (nota, boleto). */
function Fotos({ valor, aoMudar, ladoMaior, tamanhosCodigo, aoLerCodigo }) {
  const fotos = valor ?? [];
  const [erro, setErro] = useState(null);
  const [lendo, setLendo] = useState(false);

  const adicionar = async (e) => {
    const arquivos = [...e.target.files].slice(0, MAX_FOTOS - fotos.length);
    e.target.value = "";
    try {
      const novas = await Promise.all(arquivos.map((a) => reduzirFoto(a, ladoMaior)));
      setErro(null);
      aoMudar([...fotos, ...novas]);
      if (aoLerCodigo) {
        setLendo(true);
        for (const f of novas) {
          const codigo = await lerCodigoDaFoto(f, tamanhosCodigo);
          if (codigo) { aoLerCodigo(codigo); break; }
        }
        setLendo(false);
      }
    } catch (err) {
      setErro(err.message);
      setLendo(false);
    }
  };

  return (
    <div className="fotos">
      {fotos.map((f, i) => (
        <div key={i} className="foto">
          <a href={f} target="_blank" rel="noreferrer"><img src={f} alt={`Foto ${i + 1}`} /></a>
          <button type="button" className="btn icone perigo" aria-label="Remover foto" onClick={() => aoMudar(fotos.filter((_, j) => j !== i))}>
            <Icone nome="lixo" tamanho={14} />
          </button>
        </div>
      ))}
      {fotos.length < MAX_FOTOS && (
        <label className="btn foto-nova">
          <Icone nome="mais" /> Tirar / escolher foto
          <input type="file" accept="image/*" multiple hidden onChange={adicionar} />
        </label>
      )}
      {lendo && <small>Procurando o código de barras…</small>}
      {erro && <small className="negativo">{erro}</small>}
    </div>
  );
}

function Campo({ chave, campo, reg, dados, aoMudar }) {
  const id = useId();
  const valor = reg[chave];
  const obrig = campoObrigatorio(campo, reg);
  const largo = campo.tipo === "textoLongo" || campo.tipo === "fotos";
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
    case "fotos": {
      const [alvo, tamanhos] = campo.lerCodigo ?? [];
      controle = (
        <Fotos valor={valor} aoMudar={set} ladoMaior={campo.ladoMaior} tamanhosCodigo={tamanhos}
          aoLerCodigo={alvo && !reg[alvo] ? (codigo) => aoMudar(alvo, codigo) : undefined} />
      );
      break;
    }
    case "numero":
    case "dinheiro":
      controle = (
        <input id={id} type="number" inputMode="decimal" step="any" value={valor ?? ""} readOnly={campo.somenteLeitura}
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
        .filter((x) => x.id === valor || (x.ativo !== false && (!campo.filtro || campo.filtro(x, reg))))
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
    default:
      controle = <input id={id} type="text" value={valor ?? ""} readOnly={campo.somenteLeitura} onChange={(e) => set(e.target.value)} />;
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
 * são refeitos para aparecer já preenchidos. `ocultar` esconde campos que a
 * tela que usa o formulário preenche sozinha.
 */
export default function Formulario({ colecao, reg, setReg, dados, contexto, ocultar }) {
  const def = ESQUEMA[colecao];

  const aoMudar = (chave, v) => {
    setReg((atual) => {
      let novo = { ...atual, [chave]: v };
      const extra = def.aoMudar?.[chave]?.(novo, dados, contexto);
      if (extra) novo = { ...novo, ...extra };
      return { ...novo, ...(def.calcular?.(novo, dados) ?? {}) };
    });
  };

  const campos = useMemo(() => Object.entries(def.campos).filter(([k, c]) => !c.oculto && !ocultar?.includes(k)), [def, ocultar]);

  return (
    <div className="form">
      {campos.filter(([, c]) => campoVisivel(c, reg)).map(([chave, campo]) => (
        <Campo key={chave} chave={chave} campo={campo} reg={reg} dados={dados} aoMudar={aoMudar} />
      ))}
      {colecao === "insumos" && <div className="largo"><ConsultaProduto reg={reg} setReg={setReg} /></div>}
    </div>
  );
}
