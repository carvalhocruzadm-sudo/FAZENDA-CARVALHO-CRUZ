import { useId, useMemo, useState } from "react";

import { ESQUEMA, campoObrigatorio, campoVisivel } from "../lib/esquema";
import { CampoFoto } from "./Foto";
import { CampoArquivo } from "./Comprovante";
import ConsultaProduto from "./ConsultaProduto";
import { Icone } from "./ui";

/** Sugestões de um campo: a lista fixa + o que já foi digitado antes. */
function sugestoesDoCampo(campo, dados) {
  const fixas = campo.sugestoes ?? [];
  if (!campo.sugestoesDe) return fixas;
  const [colecao, chave] = campo.sugestoesDe;
  const usadas = (dados[colecao] ?? []).map((x) => x[chave]).filter(Boolean);
  return [...new Set([...fixas, ...usadas])].sort((a, b) => String(a).localeCompare(String(b)));
}

/** Reduz a foto (lado maior 800 px, JPEG) para caber no registro e sincronizar rápido. */
function reduzirFoto(arquivo) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, 800 / Math.max(img.width, img.height));
      const tela = document.createElement("canvas");
      tela.width = Math.round(img.width * escala);
      tela.height = Math.round(img.height * escala);
      tela.getContext("2d").drawImage(img, 0, 0, tela.width, tela.height);
      URL.revokeObjectURL(url);
      resolve(tela.toDataURL("image/jpeg", 0.6));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Não consegui abrir essa foto.")); };
    img.src = url;
  });
}

const MAX_FOTOS = 6;

function Fotos({ valor, aoMudar }) {
  const fotos = valor ?? [];
  const [erro, setErro] = useState(null);

  const adicionar = async (e) => {
    const arquivos = [...e.target.files].slice(0, MAX_FOTOS - fotos.length);
    e.target.value = "";
    try {
      const novas = await Promise.all(arquivos.map(reduzirFoto));
      setErro(null);
      aoMudar([...fotos, ...novas]);
    } catch (err) {
      setErro(err.message);
    }
  };

  return (
    <div className="fotos">
      {fotos.map((f, i) => (
        <div key={i} className="foto">
          <a href={f} target="_blank" rel="noreferrer"><img src={f} alt={`Foto ${i + 1} do rótulo`} /></a>
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
      {erro && <small className="negativo">{erro}</small>}
    </div>
  );
}

function Campo({ colecao, chave, campo, reg, dados, aoMudar }) {
  const id = useId();
  const [achar, setAchar] = useState("");
  const valor = reg[chave];
  const obrig = campoObrigatorio(campo, reg);
  const largo = ["textoLongo", "fotos", "foto", "arquivo"].includes(campo.tipo);
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
    case "fotos":
      controle = <Fotos valor={valor} aoMudar={set} />;
      break;
    case "numero":
    case "dinheiro":
      controle = (
        <input id={id} type="number" inputMode="decimal" step="any" value={valor ?? ""} readOnly={campo.somenteLeitura}
          onChange={(e) => set(e.target.value)} placeholder={campo.tipo === "dinheiro" ? "R$" : ""} />
      );
      break;
    case "foto":
      controle = <CampoFoto valor={valor} aoMudar={set} lado={campo.lado} />;
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
      const deProduto = campo.colecao === "insumos";
      const termo = achar.trim().toLowerCase();
      const opcoes = (dados[campo.colecao] ?? [])
        .filter((x) => x.id === valor || (x.ativo !== false && (!campo.filtro || campo.filtro(x))))
        // Produto: dá para achar pelo nome, fabricante, tipo ou princípio ativo.
        .filter((x) => !deProduto || !termo || x.id === valor
          || [x.nome, x.fabricante, x.tipo, x.principio_ativo].some((v) => String(v ?? "").toLowerCase().includes(termo)))
        .sort(def.ordem ?? (() => 0));
      const rotuloOpcao = (x) => `${def.resumo?.(x) ?? x.nome}${deProduto && x.fabricante ? ` — ${x.fabricante}` : ""}`;
      controle = (
        <>
          {deProduto && (
            <input type="search" placeholder="Buscar produto ou fabricante…" value={achar} onChange={(e) => setAchar(e.target.value)} aria-label="Buscar produto" autoComplete="off" />
          )}
          <select id={id} value={valor ?? ""} onChange={(e) => set(e.target.value || null)}>
            <option value="">{opcoes.length ? "— escolha —" : termo ? "Nenhum produto encontrado" : `Nenhum ${def.singular} cadastrado`}</option>
            {opcoes.map((x) => <option key={x.id} value={x.id}>{rotuloOpcao(x)}</option>)}
          </select>
        </>
      );
      break;
    }
    case "arquivo":
      controle = <CampoArquivo id={id} colecao={colecao} valor={valor} set={set} />;
      break;
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
 * são refeitos para aparecer já preenchidos. `somente` mostra só esses campos,
 * nessa ordem.
 */
export default function Formulario({ colecao, reg, setReg, dados, contexto, somente }) {
  const def = ESQUEMA[colecao];

  const aoMudar = (chave, v) => {
    setReg((atual) => {
      let novo = { ...atual, [chave]: v };
      const extra = def.aoMudar?.[chave]?.(novo, dados, contexto);
      if (extra) novo = { ...novo, ...extra };
      return { ...novo, ...(def.calcular?.(novo, dados) ?? {}) };
    });
  };

  const campos = useMemo(
    () => (somente ? somente.map((c) => [c, def.campos[c]]) : Object.entries(def.campos)),
    [def, somente]
  );

  return (
    <div className="form">
      {campos.filter(([, c]) => campoVisivel(c, reg)).map(([chave, campo]) => (
        <Campo key={chave} colecao={colecao} chave={chave} campo={campo} reg={reg} dados={dados} aoMudar={aoMudar} />
      ))}
      {colecao === "insumos" && <div className="largo"><ConsultaProduto reg={reg} setReg={setReg} /></div>}
    </div>
  );
}
