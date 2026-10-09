import { useCallback, useMemo, useState } from "react";

import { PERIODOS, noPeriodo, ultimaLeitura } from "../lib/calculos";
import useEscolhaTalhoes from "../hooks/useEscolhaTalhoes";
import { ESQUEMA, hoje, registroNovo } from "../lib/esquema";
import { baixarCSV, exibir, numero } from "../lib/formato";
import Formulario from "./Formulario";
import { Icone, Modal, SeletorPeriodo } from "./ui";

/** Colunas que ganham total no rodapé da lista. */
const SOMAVEIS = new Set([
  "valor", "valor_bruto", "valor_desconto", "total", "litros", "quantidade", "trabalhado",
  "peso_liquido", "peso_kg", "km", "quantidade_total", "area_ha", "pes", "frete", "comissao",
]);

/** Tipos de coluna que viram filtro de caixinha quando a coleção não define `filtros`. */
const FILTRAVEIS = new Set(["ref", "opcoes", "booleano", "sugestao"]);

/** Quem aponta para este registro (para não apagar um talhão que tem lançamentos). */
function referencias(dados, colecao, id) {
  let total = 0;
  for (const [outra, def] of Object.entries(ESQUEMA)) {
    for (const [chave, campo] of Object.entries(def.campos)) {
      if (campo.tipo === "ref" && campo.colecao === colecao) {
        total += (dados[outra] ?? []).filter((x) => x[chave] === id).length;
      }
    }
  }
  return total;
}

function exportarCSV(nome, colunas, def, linhas, dados) {
  const corpo = linhas.map((l) => colunas.map((c) => {
    const campo = def.campos[c];
    const v = l[c];
    if (["numero", "dinheiro"].includes(campo.tipo)) return v == null ? "" : Number(v);
    return exibir(campo, v, dados);
  }));
  baixarCSV(`${nome}-${hoje()}.csv`, [colunas.map((c) => def.campos[c].rotulo), ...corpo]);
}

/**
 * Tela padrão de uma coleção: busca, período (nos lançamentos), lista com
 * total no rodapé, formulário para incluir/editar, repetir e apagar.
 * `filtro` restringe a lista (ex.: só os abastecimentos de posto) e
 * `padrao` preenche o registro novo.
 */
export default function Crud({ colecao, dados, salvar, remover, filtro, padrao, colunas: colunasProp, periodoInicial }) {
  const def = ESQUEMA[colecao];
  const [busca, setBusca] = useState("");
  const [escolhas, setEscolhas] = useState({});
  const [periodo, setPeriodo] = useState(periodoInicial ?? (def.lancamento ? "mes" : "tudo"));
  const [rascunho, setRascunho] = useState(null);
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const colunas = colunasProp ?? def.colunas;
  const contexto = useMemo(() => ({ ultimaLeitura: (id) => ultimaLeitura(dados, id) }), [dados]);

  // Lista antes dos filtros de caixinha (fazenda, cultura…), para montar as opções deles.
  const base = useMemo(() => {
    let lista = dados[colecao] ?? [];
    if (filtro) lista = lista.filter(filtro);
    if (def.lancamento) lista = noPeriodo(lista, periodo);
    return lista;
  }, [dados, colecao, filtro, def, periodo]);

  /** Filtros de caixinha: cada um lista os valores que aparecem (ex.: as fazendas que têm talhão). */
  const filtros = useMemo(() => (def.filtros ?? colunas.filter((c) => FILTRAVEIS.has(def.campos[c].tipo))).map((c) => {
    const campo = def.campos[c];
    const valores = [...new Set(base.map((l) => String(exibir(campo, l[c], dados))))]
      .sort((a, b) => (a === "—") - (b === "—") || a.localeCompare(b, "pt-BR", { numeric: true }));
    return { c, campo, valores };
  }).filter((f) => f.valores.length > 1 || escolhas[f.c]), [def, colunas, base, dados, escolhas]);

  const linhas = useMemo(() => {
    let lista = base;
    for (const [c, v] of Object.entries(escolhas)) {
      if (v) lista = lista.filter((l) => String(exibir(def.campos[c], l[c], dados)) === v);
    }
    const termo = busca.trim().toLowerCase();
    if (termo) {
      // Linhas que apontam para um produto também são achadas pelo fabricante e pelo princípio ativo dele.
      const insumos = new Map((dados.insumos ?? []).map((i) => [i.id, i]));
      const extra = (l) => colunas
        .filter((c) => def.campos[c].tipo === "ref" && def.campos[c].colecao === "insumos")
        .map((c) => insumos.get(l[c])).filter(Boolean)
        .map((i) => `${i.fabricante ?? ""} ${i.principio_ativo ?? ""}`).join(" ");
      lista = lista.filter((l) => extra(l).toLowerCase().includes(termo)
        || colunas.some((c) => String(exibir(def.campos[c], l[c], dados)).toLowerCase().includes(termo)));
    }
    const ordem = def.ordem ?? ((a, b) => String(b.data ?? "").localeCompare(String(a.data ?? "")) || String(b.atualizado_em ?? "").localeCompare(String(a.atualizado_em ?? "")));
    return [...lista].sort(ordem);
  }, [base, escolhas, dados, def, busca, colunas]);

  const temFiltro = Object.values(escolhas).some(Boolean);

  const escolha = useEscolhaTalhoes(colecao, dados);
  const { iniciar } = escolha;
  const abrir = useCallback((reg) => { setErro(null); setRascunho(reg); iniciar(reg); }, [iniciar]);
  const novo = () => abrir({ ...registroNovo(colecao), ...(padrao ?? {}) });
  const repetir = (reg) => abrir({ ...reg, id: undefined, data: hoje() });
  const fechar = useCallback(() => setRascunho(null), []);

  const gravar = async () => {
    const { regs, erro: e } = escolha.montar(rascunho);
    if (e) { setErro(e); return; }
    setSalvando(true);
    try {
      for (const reg of regs) await salvar(colecao, reg);
      setRascunho(null);
    } catch (err) {
      setErro(String(err?.message ?? err));
    } finally {
      setSalvando(false);
    }
  };

  const apagar = async () => {
    const usos = referencias(dados, colecao, rascunho.id);
    if (usos) {
      setErro(`Não dá para apagar: este ${def.singular} aparece em ${usos} lançamento(s). Marque como inativo.`);
      return;
    }
    if (!window.confirm(`Apagar este ${def.singular}?`)) return;
    await remover(colecao, rascunho.id);
    setRascunho(null);
  };

  const totais = colunas.map((c, i) => {
    if (i === 0) return `${linhas.length} ${linhas.length === 1 ? "registro" : "registros"}`;
    if (!SOMAVEIS.has(c)) return "";
    const campo = def.campos[c];
    const t = linhas.reduce((s, l) => s + (Number(l[c]) || 0), 0);
    return campo.tipo === "dinheiro" ? exibir({ tipo: "dinheiro" }, t) : numero(t, campo.casas ?? 2);
  });

  return (
    <div className="cartao">
      {def.descricao && <p className="descricao">{def.descricao}</p>}
      <div className="barra">
        <input className="entrada busca" placeholder="Buscar…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar" />
        {def.lancamento && <SeletorPeriodo periodos={PERIODOS} valor={periodo} aoMudar={setPeriodo} />}
        {filtros.map(({ c, campo, valores }) => (
          <select key={c} className={`entrada filtro${escolhas[c] ? " ativo" : ""}`} value={escolhas[c] ?? ""}
            onChange={(e) => setEscolhas((x) => ({ ...x, [c]: e.target.value }))} aria-label={`Filtrar por ${campo.rotulo}`}>
            <option value="">{campo.rotulo}: todos</option>
            {valores.map((v) => <option key={v} value={v}>{v === "—" ? "(em branco)" : v}</option>)}
          </select>
        ))}
        {temFiltro && <button className="btn" onClick={() => setEscolhas({})}>Limpar filtros</button>}
        <span className="espaco" />
        <button className="btn" onClick={() => exportarCSV(colecao, colunas, def, linhas, dados)} disabled={!linhas.length} title="Baixar planilha (CSV)">
          <Icone nome="exportar" /> Planilha
        </button>
        <button className="btn primario" onClick={novo}><Icone nome="mais" /> Novo</button>
      </div>

      {linhas.length === 0 ? (
        <div className="vazio">
          Nenhum registro {temFiltro ? "com esses filtros" : def.lancamento && periodo !== "tudo" ? "neste período" : ""}.{" "}
          <button className="btn" onClick={novo} style={{ marginLeft: 8 }}>Lançar {def.singular}</button>
        </div>
      ) : (
        <div className="tabela cartoes">
          <table>
            <thead>
              <tr>
                {colunas.map((c) => {
                  const campo = def.campos[c];
                  return <th key={c} className={["numero", "dinheiro"].includes(campo.tipo) ? "num" : ""}>{campo.rotulo}</th>;
                })}
                <th />
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id} className="clicavel" onClick={() => abrir({ ...l })}>
                  {colunas.map((c) => {
                    const campo = def.campos[c];
                    return (
                      <td key={c} data-rotulo={campo.rotulo} className={["numero", "dinheiro"].includes(campo.tipo) ? "num" : ""}>
                        {exibir(campo, l[c], dados)}
                      </td>
                    );
                  })}
                  <td data-rotulo="" className="acoes">
                    <button className="btn icone" title={`Editar este ${def.singular}`} aria-label="Editar"
                      onClick={(e) => { e.stopPropagation(); abrir({ ...l }); }}>
                      <Icone nome="editar" tamanho={15} />
                    </button>
                    {def.lancamento && (
                      <button className="btn icone" title="Repetir este lançamento" aria-label="Repetir"
                        onClick={(e) => { e.stopPropagation(); repetir(l); }}>
                        <Icone nome="mais" tamanho={15} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                {totais.map((t, i) => <td key={i} className={i ? "num" : ""}>{t}</td>)}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {rascunho && (
        <Modal
          titulo={`${rascunho.id ? "Editar" : "Lançar"} ${def.singular}`}
          aoFechar={fechar}
          rodape={
            <>
              {rascunho.id && <button className="btn perigo" onClick={apagar}><Icone nome="lixo" /> Apagar</button>}
              <span className="espaco" />
              <button className="btn" onClick={fechar}>Cancelar</button>
              <button className="btn primario" onClick={gravar} disabled={salvando}>
                <Icone nome="editar" /> {salvando ? "Salvando…" : "Salvar"}
              </button>
            </>
          }
        >
          {erro && <div className="aviso">{erro}</div>}
          <Formulario colecao={colecao} reg={rascunho} setReg={setRascunho} dados={dados} contexto={contexto} escolha={escolha} />
        </Modal>
      )}
    </div>
  );
}
