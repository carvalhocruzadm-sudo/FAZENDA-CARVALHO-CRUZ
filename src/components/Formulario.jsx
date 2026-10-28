import { useId, useMemo, useState } from "react";

import { ESQUEMA, campoObrigatorio, campoVisivel, culturaDoRegistro } from "../lib/esquema";
import { leitura } from "../lib/formato";
import { SEM_CULTURA, fazendaDoTalhao } from "../lib/talhoes";
import EscolhaTalhoes from "./EscolhaTalhoes";
import { CampoFoto } from "./Foto";
import { ImagemAmpliavel } from "./VerFoto";
import { CampoArquivo } from "./Comprovante";
import ConsultaProduto from "./ConsultaProduto";
import LeituraTicket from "./LeituraTicket";
import { Icone } from "./ui";

/**
 * Sugestões de um campo: a lista fixa (a da cultura escolhida, se o campo
 * tiver) + o que já foi digitado antes (só nessa cultura, se o campo pedir).
 */
function sugestoesDoCampo(campo, dados, cultura) {
  const fixas = (cultura && campo.sugestoesDaCultura?.(cultura)) ?? campo.sugestoes ?? [];
  if (!campo.sugestoesDe) return fixas;
  const [colecao, chave] = campo.sugestoesDe;
  const usadas = (dados[colecao] ?? [])
    .filter((x) => !cultura || !campo.historicoDaCultura || x.cultura_id === cultura.id)
    .map((x) => x[chave]).filter(Boolean);
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

/** Campo já usado (abre sozinho o botão do campo opcional). Zero conta como vazio. */
const temValor = (v) => (Array.isArray(v) ? v.length > 0 : v != null && v !== "" && v !== false && Number(v) !== 0);

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
          <ImagemAmpliavel src={f} alt={`Foto ${i + 1} do rótulo`} />
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
      // Horímetro/km: só se digitam números e o último vai depois da vírgula
      // (digitar 58946 vira 5.894,6), como no visor do trator.
      if (campo.leituraMedidor) {
        controle = (
          <input id={id} type="text" inputMode="numeric" value={leitura(valor)} readOnly={campo.somenteLeitura}
            onChange={(e) => {
              const digitos = e.target.value.replace(/\D/g, "");
              set(digitos ? (Number(digitos) / 10).toFixed(1) : "");
            }} placeholder="0,0" />
        );
        break;
      }
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
    case "opcoes": {
      // Só as opções que servem para a cultura escolhida (ex.: laranja não é vendida em saca).
      const cultura = campo.opcoesDaCultura && culturaDoRegistro(reg, dados);
      const permitidas = cultura && campo.opcoesDaCultura(cultura);
      const opcoes = permitidas
        ? campo.opcoes.filter(([v]) => v === valor || v === cultura.unidade || permitidas.includes(v))
        : campo.opcoes;
      controle = (
        <select id={id} value={valor ?? ""} onChange={(e) => set(e.target.value || null)}>
          {!obrig && <option value="">—</option>}
          {opcoes.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
        </select>
      );
      break;
    }
    case "ref": {
      const def = ESQUEMA[campo.colecao];
      const deProduto = campo.colecao === "insumos";
      const termo = achar.trim().toLowerCase();
      const opcoes = (dados[campo.colecao] ?? [])
        .filter((x) => x.id === valor || (x.ativo !== false && (!campo.filtro || campo.filtro(x, reg))))
        // Produto: dá para achar pelo nome, fabricante, tipo ou princípio ativo.
        .filter((x) => !deProduto || !termo || x.id === valor
          || [x.nome, x.fabricante, x.tipo, x.principio_ativo].some((v) => String(v ?? "").toLowerCase().includes(termo)))
        .sort(def.ordem ?? (() => 0));
      const rotuloOpcao = (x) => `${def.resumo?.(x) ?? x.nome}${deProduto && x.fabricante ? ` — ${x.fabricante}` : ""}`;
      const opcao = (x) => <option key={x.id} value={x.id}>{rotuloOpcao(x)}</option>;
      // Talhão: só os da cultura já escolhida, separados por fazenda.
      const deTalhao = campo.colecao === "talhoes";
      const lista = deTalhao && reg.cultura_id ? opcoes.filter((x) => x.id === valor || x.cultura_id === reg.cultura_id) : opcoes;
      const nomeFazenda = (x) => dados.fazendas?.find((f) => f.id === x.fazenda_id)?.nome || "Sem fazenda";
      const fazendas = deTalhao ? [...new Set(lista.map(nomeFazenda))].sort((a, b) => a.localeCompare(b, "pt-BR")) : [];
      controle = (
        <>
          {deProduto && (
            <input type="search" placeholder="Buscar produto ou fabricante…" value={achar} onChange={(e) => setAchar(e.target.value)} aria-label="Buscar produto" autoComplete="off" />
          )}
          <select id={id} value={valor ?? ""} onChange={(e) => set(e.target.value || null)}>
            <option value="">
              {lista.length ? "— escolha —" : termo ? "Nenhum produto encontrado" : deTalhao && opcoes.length ? "Nenhum talhão desta cultura" : `Nenhum ${def.singular} cadastrado`}
            </option>
            {deTalhao && fazendas.length > 1
              ? fazendas.map((f) => <optgroup key={f} label={f}>{lista.filter((x) => nomeFazenda(x) === f).map(opcao)}</optgroup>)
              : lista.map(opcao)}
          </select>
        </>
      );
      break;
    }
    case "refs": {
      const def = ESQUEMA[campo.colecao];
      const marcados = Array.isArray(valor) ? valor : [];
      const opcoes = (dados[campo.colecao] ?? [])
        .filter((x) => marcados.includes(x.id) || (x.ativo !== false && (!campo.filtro || campo.filtro(x, reg))))
        .sort(def.ordem ?? (() => 0));
      controle = (
        <div className="escolhas" id={id}>
          {opcoes.length === 0 && <small>Nenhum {def.singular} cadastrado.</small>}
          {opcoes.map((x) => {
            const ativa = marcados.includes(x.id);
            return (
              <button type="button" key={x.id} className={ativa ? "ativa" : ""} aria-pressed={ativa}
                onClick={() => set(ativa ? marcados.filter((m) => m !== x.id) : [...marcados, x.id])}>
                {ativa ? "✓ " : ""}{def.resumo?.(x) ?? x.nome}
              </button>
            );
          })}
        </div>
      );
      break;
    }
    case "arquivo":
      controle = <CampoArquivo id={id} colecao={colecao} valor={valor} set={set} />;
      break;
    case "sugestao": {
      const lista = sugestoesDoCampo(campo, dados, culturaDoRegistro(reg, dados));
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
 * nessa ordem. `escolha` (do useEscolhaTalhoes) troca cultura e talhão pela
 * escolha cultura → fazendas → talhões no lançamento novo.
 */
export default function Formulario({ colecao, reg, setReg, dados, contexto, somente, escolha }) {
  const def = ESQUEMA[colecao];
  // Botões dos campos opcionais que a pessoa abriu.
  const [abertos, setAbertos] = useState(() => new Set());

  const aoMudar = (chave, v) => {
    // Quem está digitando num opcional: ele fica aberto mesmo se o campo for apagado.
    const grupo = def.campos[chave]?.opcional;
    if (grupo && !abertos.has(grupo)) setAbertos((atual) => new Set(atual).add(grupo));
    setReg((atual) => {
      let novo = { ...atual, [chave]: v };
      const extra = def.aoMudar?.[chave]?.(novo, dados, contexto);
      if (extra) novo = { ...novo, ...extra };
      return { ...novo, ...(def.calcular?.(novo, dados) ?? {}) };
    });
  };

  // Vários campos de uma vez (leitura da foto do ticket), com os cálculos refeitos.
  const preencher = (patch) => setReg((atual) => {
    const novo = { ...atual, ...patch };
    return { ...novo, ...(def.calcular?.(novo, dados) ?? {}) };
  });

  // Fechar um opcional apaga o que foi digitado nele (os calculados se refazem).
  const alternar = (grupo, campos, aberto) => {
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (aberto) novo.delete(grupo); else novo.add(grupo);
      return novo;
    });
    if (aberto) preencher(Object.fromEntries(campos.map(([k]) => [k, null])));
  };

  // A cultura vem logo depois da data: é ela que decide o que mais se pergunta.
  const campos = useMemo(() => {
    if (somente) return somente.map((c) => [c, def.campos[c]]);
    const todos = Object.entries(def.campos);
    const cultura = todos.find(([c]) => c === "cultura_id");
    if (!cultura) return todos;
    const resto = todos.filter(([c]) => c !== "cultura_id");
    const depois = resto[0]?.[0] === "data" ? 1 : 0;
    return [...resto.slice(0, depois), cultura, ...resto.slice(depois)];
  }, [def, somente]);

  const comEscolha = escolha?.ativo(reg);
  // Campos que dependem da cultura só aparecem depois de escolhê-la.
  const temCultura = Boolean(def.campos.cultura_id && campoVisivel(def.campos.cultura_id, reg, dados));
  const faltaCultura = temCultura && !reg.cultura_id && campos.some(([, c]) => c.paraCultura);
  const visiveis = campos.filter(([, c]) => !c.oculto && campoVisivel(c, reg, dados) && !(faltaCultura && c.paraCultura));
  // A escolha entra no lugar do primeiro dos dois (cultura ou talhão); o outro some.
  const lugar = comEscolha && visiveis.find(([c]) => c === "cultura_id" || c === "talhao_id")?.[0];

  // Campos opcionais: ficam atrás de um botão e só aparecem quando ele é marcado
  // (ou quando já têm valor). Os abertos aparecem logo abaixo dos botões.
  const grupos = [];
  for (const [chave, campo] of visiveis) {
    if (!campo.opcional) continue;
    let g = grupos.find((x) => x.nome === campo.opcional);
    if (!g) grupos.push((g = { nome: campo.opcional, campos: [] }));
    g.campos.push([chave, campo]);
  }
  for (const g of grupos) {
    g.aberto = abertos.has(g.nome) || g.campos.some(([k, c]) => !c.somenteLeitura && temValor(reg[k]));
  }
  const principais = visiveis.filter(([, c]) => !c.opcional);
  const opcionaisAbertos = visiveis.filter(([, c]) => c.opcional && grupos.find((g) => g.nome === c.opcional).aberto);
  // Cultura sem talhão (laranja de terceiros) aparece sozinha; trocando por ela, a escolha acompanha.
  const mudarCampo = (chave, v) => {
    if (chave === "cultura_id" && escolha) escolha.props.setCultura(v ?? "");
    aoMudar(chave, v);
  };
  const mostrar = ([chave, c]) => <Campo key={chave} colecao={colecao} chave={chave} campo={c} reg={reg} dados={dados} aoMudar={mudarCampo} />;

  return (
    <div className="form">
      {colecao === "vendas" && reg.foto_ticket && (
        <div className="largo"><LeituraTicket reg={reg} dados={dados} preencher={preencher} /></div>
      )}
      {principais.map(([chave, c]) => {
        if (comEscolha && (chave === "cultura_id" || chave === "talhao_id")) {
          if (chave !== lugar) return null;
          return (
            <EscolhaTalhoes key="escolha-talhoes" culturas={dados.culturas}
              talhoes={dados.talhoes.filter((t) => t.ativo !== false || t.id in escolha.props.areas)}
              nomeFazenda={fazendaDoTalhao(dados)} cultura={escolha.props.cultura}
              aoMudarCultura={(c) => { escolha.props.setCultura(c); aoMudar("cultura_id", c && c !== SEM_CULTURA ? c : null); }}
              areas={escolha.props.areas} setAreas={escolha.props.setAreas} rotuloCultura={def.campos.cultura_id?.rotulo ?? "Cultura"}
              obrigatorio={campoObrigatorio(def.campos.talhao_id, reg)} todasCulturas />
          );
        }
        return mostrar([chave, c]);
      })}
      {grupos.length > 0 && (
        <div className="largo opcionais">
          <small>Mais informações (toque para abrir):</small>
          <div className="escolhas">
            {grupos.map((g) => (
              <button type="button" key={g.nome} className={g.aberto ? "ativa" : ""} aria-pressed={g.aberto}
                onClick={() => alternar(g.nome, g.campos, g.aberto)}>
                {g.aberto ? "✓ " : "+ "}{g.nome}
              </button>
            ))}
          </div>
        </div>
      )}
      {opcionaisAbertos.map(mostrar)}
      {faltaCultura && <small className="largo dica-cultura">Escolha a cultura para ver os campos dela.</small>}
      {colecao === "insumos" && <div className="largo"><ConsultaProduto reg={reg} setReg={setReg} /></div>}
    </div>
  );
}
