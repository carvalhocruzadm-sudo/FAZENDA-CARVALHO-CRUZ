import { useCallback, useMemo, useState } from "react";

import { PERIODOS, noPeriodo, ultimaLeitura } from "../lib/calculos";
import { ESQUEMA, hoje, prepararRegistro, registroNovo } from "../lib/esquema";
import { exibir, numero } from "../lib/formato";
import Formulario from "./Formulario";
import { Icone, Modal, SeletorPeriodo } from "./ui";

/** Colunas que ganham total no rodapé da lista. */
const SOMAVEIS = new Set([
  "valor", "valor_bruto", "valor_desconto", "total", "litros", "quantidade", "trabalhado",
  "peso_liquido", "peso_kg", "km", "quantidade_total", "area_ha", "pes", "frete", "comissao",
]);

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
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const cab = colunas.map((c) => esc(def.campos[c].rotulo)).join(";");
  const corpo = linhas.map((l) => colunas.map((c) => {
    const campo = def.campos[c];
    const v = l[c];
    if (["numero", "dinheiro"].includes(campo.tipo)) return v == null ? "" : String(v).replace(".", ",");
    return esc(exibir(campo, v, dados));
  }).join(";"));
  const blob = new Blob(["﻿" + [cab, ...corpo].join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${nome}-${hoje()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
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
  const [periodo, setPeriodo] = useState(periodoInicial ?? (def.lancamento ? "mes" : "tudo"));
  const [rascunho, setRascunho] = useState(null);
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const colunas = colunasProp ?? def.colunas;
  const contexto = useMemo(() => ({ ultimaLeitura: (id) => ultimaLeitura(dados, id) }), [dados]);

  const linhas = useMemo(() => {
    let lista = dados[colecao] ?? [];
    if (filtro) lista = lista.filter(filtro);
    if (def.lancamento) lista = noPeriodo(lista, periodo);
    const termo = busca.trim().toLowerCase();
    if (termo) {
      lista = lista.filter((l) => colunas.some((c) => String(exibir(def.campos[c], l[c], dados)).toLowerCase().includes(termo)));
    }
    const ordem = def.ordem ?? ((a, b) => String(b.data ?? "").localeCompare(String(a.data ?? "")) || String(b.atualizado_em ?? "").localeCompare(String(a.atualizado_em ?? "")));
    return [...lista].sort(ordem);
  }, [dados, colecao, filtro, def, periodo, busca, colunas]);

  const abrir = useCallback((reg) => { setErro(null); setRascunho(reg); }, []);
  const novo = () => abrir({ ...registroNovo(colecao), ...(padrao ?? {}) });
  const repetir = (reg) => abrir({ ...reg, id: undefined, data: hoje() });
  const fechar = useCallback(() => setRascunho(null), []);

  const gravar = async () => {
    const { reg, erro: e } = prepararRegistro(colecao, rascunho, dados);
    if (e) { setErro(e); return; }
    setSalvando(true);
    try {
      await salvar(colecao, reg);
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
        <span className="espaco" />
        <button className="btn" onClick={() => exportarCSV(colecao, colunas, def, linhas, dados)} disabled={!linhas.length} title="Baixar planilha (CSV)">
          <Icone nome="exportar" /> Planilha
        </button>
        <button className="btn primario" onClick={novo}><Icone nome="mais" /> Novo</button>
      </div>

      {linhas.length === 0 ? (
        <div className="vazio">
          Nenhum registro {def.lancamento && periodo !== "tudo" ? "neste período" : ""}.{" "}
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
                {def.lancamento && <th />}
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
                  {def.lancamento && (
                    <td data-rotulo="">
                      <button className="btn icone" title="Repetir este lançamento" aria-label="Repetir"
                        onClick={(e) => { e.stopPropagation(); repetir(l); }}>
                        <Icone nome="mais" tamanho={15} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                {totais.map((t, i) => <td key={i} className={i ? "num" : ""}>{t}</td>)}
                {def.lancamento && <td />}
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
          <Formulario colecao={colecao} reg={rascunho} setReg={setRascunho} dados={dados} contexto={contexto} />
        </Modal>
      )}
    </div>
  );
}
