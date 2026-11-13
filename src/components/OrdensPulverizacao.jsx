import { useCallback, useMemo, useState } from "react";

import { emEmbalagens, itensDaOrdem } from "../lib/deposito";
import { ESQUEMA, prepararRegistro, registroNovo } from "../lib/esquema";
import { compartilharPdf, gerarPdfPulverizacao } from "../lib/pdfPulverizacao";
import { data as dataBR, nomeRef, numero } from "../lib/formato";
import { SEM_CULTURA, chaveCultura, fazendaDoTalhao, nomesTalhoesDaOrdem, talhoesDaOrdem } from "../lib/talhoes";
import { FotoProduto } from "./CampoUI";
import EscolhaTalhoes from "./EscolhaTalhoes";
import Formulario from "./Formulario";
import { Icone, Modal } from "./ui";

const n = (v) => Number(v) || 0;
const vazio = (v) => v == null || v === "";
const porPipa = (o) => o?.dose_por === "pipa";

/**
 * Refaz a dose e o total de um produto. Por ha: total = dose × área. Por pipa:
 * dose por ha = dose por pipa ÷ ha que a pipa faz, e total = dose por ha × área
 * (o mesmo que dose por pipa × número de pipas).
 */
function recalcular(i, o) {
  const area = n(o.area_ha);
  if (porPipa(o)) {
    const hpp = n(o.ha_por_pipa);
    let dosePipa = i.dose_pipa;
    if (dosePipa == null && !vazio(i.dose_ha) && hpp > 0) dosePipa = +(n(i.dose_ha) * hpp).toFixed(3);
    if (vazio(dosePipa) || !(hpp > 0)) return { ...i, dose_pipa: dosePipa };
    const doseHa = n(dosePipa) / hpp;
    return { ...i, dose_pipa: dosePipa, dose_ha: +doseHa.toFixed(3), quantidade: +(doseHa * area).toFixed(3) };
  }
  if (vazio(i.dose_ha)) return i;
  return { ...i, quantidade: +(n(i.dose_ha) * area).toFixed(3) };
}

const SELO = { aberta: ["atencao", "Esperando separar"], separada: ["ok", "Separada"], concluida: ["neutro", "Concluída"], cancelada: ["ruim", "Cancelada"] };

/**
 * Ordens de pulverização (escritório): o gerente escolhe a cultura, marca as
 * fazendas e os talhões (marcar a fazenda marca todos os talhões dela), o
 * trator e os produtos com a dose por ha. O total de cada produto é dose ×
 * soma das áreas. O tratorista vê a ordem no depósito (Modo Campo → Tirar do
 * depósito) e separa produto por produto, conferindo pela foto.
 */
export default function OrdensPulverizacao({ dados, salvar, remover }) {
  const [filtro, setFiltro] = useState("ativas");
  const [ordem, setOrdem] = useState(null); // rascunho do cabeçalho
  const [itens, setItens] = useState([]); // rascunho dos produtos
  const [cultura, setCultura] = useState(""); // cultura escolhida (ou SEM_CULTURA)
  const [areas, setAreas] = useState({}); // talhão marcado → área a pulverizar nele (ha)
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [gerandoPdf, setGerandoPdf] = useState(false);

  const lista = useMemo(() => dados.pulverizacoes
    .filter((o) => filtro === "todas" || ["aberta", "separada", null, undefined].includes(o.situacao))
    .sort((a, b) => String(b.data).localeCompare(String(a.data))), [dados.pulverizacoes, filtro]);

  const abrir = (o) => {
    setErro(null);
    setOrdem(o ? { ...o } : registroNovo("pulverizacoes"));
    const doTalhao = o && talhoesDaOrdem(dados, o);
    setCultura(o ? (o.cultura_id || (doTalhao.length ? chaveCultura(doTalhao[0].talhao) : "")) : "");
    setAreas(o ? Object.fromEntries(doTalhao.map((x) => [x.talhao.id, x.area_ha || x.talhao.area_ha || ""])) : {});
    setItens(o ? dados.pulverizacao_itens.filter((i) => i.pulverizacao_id === o.id).map((i) => ({ ...i })) : [{ insumo_id: null, dose_ha: null, dose_pipa: null, quantidade: null }]);
  };
  const fechar = useCallback(() => setOrdem(null), []);

  // Mudou a área, o "dose por" ou os ha da pipa: refaz o total dos produtos.
  const setOrdemComArea = (f) => setOrdem((atual) => {
    const novo = typeof f === "function" ? f(atual) : f;
    if (n(novo.area_ha) !== n(atual?.area_ha) || novo.dose_por !== atual?.dose_por || n(novo.ha_por_pipa) !== n(atual?.ha_por_pipa)) {
      setItens((its) => its.map((i) => recalcular(i, novo)));
    }
    return novo;
  });

  // Talhões que dá para marcar: os ativos e os que já estão na ordem.
  const talhoesAtivos = useMemo(() => dados.talhoes.filter((t) => t.ativo !== false || t.id in areas), [dados.talhoes, areas]);
  const marcados = (a) => talhoesAtivos.filter((t) => t.id in a && chaveCultura(t) === cultura);

  // Marcou/desmarcou talhão ou mudou a área: a área da ordem é a soma.
  const mudarAreas = (f) => {
    const novo = typeof f === "function" ? f(areas) : f;
    setAreas(novo);
    const total = marcados(novo).reduce((s, t) => s + n(novo[t.id]), 0);
    setOrdemComArea((o) => ({ ...o, area_ha: +total.toFixed(2) }));
  };
  const mudarCultura = (c) => {
    setCultura(c);
    setOrdem((o) => ({ ...o, cultura_id: c && c !== SEM_CULTURA ? c : null }));
  };

  const mudarItem = (k, patch) => setItens((its) => its.map((i, j) => {
    if (j !== k) return i;
    const novo = { ...i, ...patch };
    if ("dose_ha" in patch || "dose_pipa" in patch) return recalcular(novo, ordem);
    return novo;
  }));

  // Planejamento da mesma cultura, por safra e fase.
  const doPlanejamento = useMemo(() => {
    if (!ordem) return [];
    const grupos = new Map();
    for (const p of dados.planejamento.filter((x) => !ordem.cultura_id || x.cultura_id === ordem.cultura_id)) {
      const k = `${p.safra ?? ""} · ${p.fase ?? ""}`;
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(p);
    }
    return [...grupos.entries()];
  }, [dados.planejamento, ordem]);

  const copiarPlanejamento = (k) => {
    const linhas = doPlanejamento.find(([g]) => g === k)?.[1] ?? [];
    setItens((its) => [
      ...its.filter((i) => i.insumo_id),
      ...linhas.map((p) => recalcular({ insumo_id: p.insumo_id, dose_ha: p.dose_ha, dose_pipa: null, quantidade: null }, ordem)),
    ]);
  };

  const gravar = async () => {
    if (!cultura) { setErro("Escolha a cultura."); return; }
    const ts = marcados(areas);
    if (!ts.length) { setErro("Marque pelo menos um talhão."); return; }
    const semArea = ts.find((t) => !(n(areas[t.id]) > 0));
    if (semArea) { setErro(`Informe a área a pulverizar no talhão ${semArea.nome} (ha).`); return; }
    if (porPipa(ordem) && !(n(ordem.ha_por_pipa) > 0)) { setErro("Informe quantos ha uma pipa faz."); return; }
    const { reg, erro: e } = prepararRegistro("pulverizacoes", {
      ...ordem, talhao_id: ts[0].id, talhoes: ts.map((t) => ({ talhao_id: t.id, area_ha: n(areas[t.id]) })),
    });
    if (e) { setErro(e); return; }
    const validos = itens.filter((i) => i.insumo_id);
    if (!validos.length) { setErro("Coloque pelo menos um produto."); return; }
    if (validos.some((i) => !(n(i.quantidade) > 0))) { setErro("Todo produto precisa de dose ou quantidade."); return; }
    setSalvando(true);
    try {
      const salva = await salvar("pulverizacoes", reg);
      const antes = dados.pulverizacao_itens.filter((i) => i.pulverizacao_id === salva.id);
      for (const i of validos) {
        const p = prepararRegistro("pulverizacao_itens", { ...i, dose_pipa: porPipa(ordem) ? i.dose_pipa : null, pulverizacao_id: salva.id });
        if (p.erro) throw new Error(p.erro);
        await salvar("pulverizacao_itens", p.reg);
      }
      for (const velho of antes.filter((a) => !validos.some((i) => i.id === a.id))) await remover("pulverizacao_itens", velho.id);
      setOrdem(null);
    } catch (err) {
      setErro(String(err?.message ?? err));
    } finally {
      setSalvando(false);
    }
  };

  const apagar = async () => {
    if (dados.aplicacoes.some((a) => a.pulverizacao_id === ordem.id)) {
      setErro("Esta ordem já teve produto separado no depósito. Em vez de apagar, mude a Situação para Cancelada.");
      return;
    }
    if (!window.confirm("Apagar esta ordem de pulverização?")) return;
    for (const i of dados.pulverizacao_itens.filter((x) => x.pulverizacao_id === ordem.id)) await remover("pulverizacao_itens", i.id);
    await remover("pulverizacoes", ordem.id);
    setOrdem(null);
  };

  // PDF da ordem gravada (com as fotos dos produtos) para o WhatsApp dos operadores.
  const mandarPdf = async () => {
    const gravada = dados.pulverizacoes.find((x) => x.id === ordem.id);
    if (!gravada) return;
    setGerandoPdf(true);
    try {
      const pdf = await gerarPdfPulverizacao(dados, gravada);
      const r = await compartilharPdf(pdf, gravada.titulo || "Ordem de pulverização");
      if (r === "baixado") window.alert(`O PDF "${pdf.nome}" foi baixado. Abra o WhatsApp e anexe o arquivo na conversa dos operadores.`);
    } catch (err) {
      setErro(`Não deu para gerar o PDF: ${err?.message ?? err}`);
    } finally {
      setGerandoPdf(false);
    }
  };

  const produtos = dados.insumos.filter((i) => i.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome));
  const separados = ordem?.id ? itensDaOrdem(dados, ordem.id) : [];

  return (
    <div className="cartao">
      <p className="descricao">{ESQUEMA.pulverizacoes.descricao}</p>
      <div className="barra">
        <select className="entrada" style={{ width: "auto" }} value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Mostrar">
          <option value="ativas">Abertas e separadas</option>
          <option value="todas">Todas</option>
        </select>
        <span className="espaco" />
        <button className="btn primario" onClick={() => abrir(null)}><Icone nome="mais" /> Nova ordem</button>
      </div>

      {!lista.length ? <div className="vazio">Nenhuma ordem de pulverização.</div> : (
        <div className="tabela cartoes">
          <table>
            <thead><tr><th>Título</th><th>Data</th><th>Talhões</th><th className="num">Área</th><th>Trator</th><th>Produtos</th><th>Separados</th><th>Situação</th></tr></thead>
            <tbody>
              {lista.map((o) => {
                const its = itensDaOrdem(dados, o.id);
                const [cls, rot] = SELO[o.situacao] ?? SELO.aberta;
                return (
                  <tr key={o.id} className="clicavel" onClick={() => abrir(o)}>
                    <td data-rotulo="Título" style={{ whiteSpace: "normal" }}><b>{o.titulo || "—"}</b></td>
                    <td data-rotulo="Data">{dataBR(o.data)}</td>
                    <td data-rotulo="Talhão" style={{ whiteSpace: "normal" }}>{nomesTalhoesDaOrdem(dados, o)}</td>
                    <td data-rotulo="Área" className="num">{numero(o.area_ha)} ha</td>
                    <td data-rotulo="Trator">{nomeRef(dados, "maquinas", o.maquina_id)}</td>
                    <td data-rotulo="Produtos" style={{ whiteSpace: "normal" }}>{its.map((x) => x.insumo.nome).join(", ")}</td>
                    <td data-rotulo="Separados">{its.filter((x) => x.separado).length} de {its.length}</td>
                    <td data-rotulo="Situação"><span className={`selo ${cls}`}>{rot}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {ordem && (
        <Modal titulo={ordem.id ? (ordem.titulo || "Ordem de pulverização") : "Nova ordem de pulverização"} aoFechar={fechar}
          rodape={(
            <>
              {ordem.id && <button className="btn perigo" onClick={apagar}><Icone nome="lixo" /> Apagar</button>}
              {ordem.id && (
                <button className="btn" onClick={mandarPdf} disabled={gerandoPdf} title="PDF com as fotos dos produtos (o que está salvo)">
                  <Icone nome="exportar" /> {gerandoPdf ? "Gerando…" : "PDF / WhatsApp"}
                </button>
              )}
              <span className="espaco" />
              <button className="btn" onClick={fechar}>Cancelar</button>
              <button className="btn primario" onClick={gravar} disabled={salvando}><Icone nome="editar" /> {salvando ? "Salvando…" : "Salvar"}</button>
            </>
          )}>
          {erro && <div className="aviso">{erro}</div>}
          <Formulario colecao="pulverizacoes" reg={ordem} setReg={setOrdemComArea} dados={dados} somente={["titulo", "data"]} />
          <div className="form" style={{ marginTop: 12 }}>
            <EscolhaTalhoes culturas={dados.culturas} talhoes={talhoesAtivos} nomeFazenda={fazendaDoTalhao(dados)}
              cultura={cultura} aoMudarCultura={mudarCultura} areas={areas} setAreas={mudarAreas} />
          </div>
          <div style={{ marginTop: 12 }}>
            <Formulario colecao="pulverizacoes" reg={ordem} setReg={setOrdemComArea} dados={dados}
              somente={["maquina_id", "operador_id", "situacao", "observacao"]} />
          </div>

          <h3 style={{ fontSize: 15, margin: "20px 0 10px" }}>Produtos</h3>
          <Formulario colecao="pulverizacoes" reg={ordem} setReg={setOrdemComArea} dados={dados} somente={["dose_por", "ha_por_pipa"]} />
          {porPipa(ordem) && n(ordem.ha_por_pipa) > 0 && n(ordem.area_ha) > 0 && (
            <p className="descricao" style={{ margin: "8px 0 10px" }}>
              {numero(ordem.area_ha)} ha ÷ {numero(ordem.ha_por_pipa)} ha por pipa = <b>{numero(n(ordem.area_ha) / n(ordem.ha_por_pipa), 1)} pipas</b>
            </p>
          )}
          {doPlanejamento.length > 0 && (
            <select className="entrada" style={{ marginBottom: 10 }} value="" onChange={(e) => e.target.value && copiarPlanejamento(e.target.value)}>
              <option value="">Copiar os produtos do Planejamento da safra…</option>
              {doPlanejamento.map(([k, linhas]) => <option key={k} value={k}>{k} ({linhas.length} produtos)</option>)}
            </select>
          )}
          <div className="itens-ordem">
            {itens.map((i, k) => {
              const insumo = dados.insumos.find((x) => x.id === i.insumo_id);
              const feito = separados.find((x) => x.item.id === i.id)?.separado;
              return (
                <div key={i.id ?? `novo-${k}`} className="item-ordem">
                  <FotoProduto insumo={insumo} className="mini" ampliar />
                  <label className="campo"><span>Produto</span>
                    <select value={i.insumo_id ?? ""} onChange={(e) => mudarItem(k, { insumo_id: e.target.value || null })}>
                      <option value="">— escolha —</option>
                      {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome} ({p.unidade})</option>)}
                    </select>
                  </label>
                  {porPipa(ordem) ? (
                    <label className="campo"><span>Dose por pipa</span>
                      <input type="number" inputMode="decimal" step="any" value={i.dose_pipa ?? ""} onChange={(e) => mudarItem(k, { dose_pipa: e.target.value })} />
                    </label>
                  ) : (
                    <label className="campo"><span>Dose por ha</span>
                      <input type="number" inputMode="decimal" step="any" value={i.dose_ha ?? ""} onChange={(e) => mudarItem(k, { dose_ha: e.target.value })} />
                    </label>
                  )}
                  <label className="campo"><span>Total {insumo ? `(${insumo.unidade})` : ""}</span>
                    <input type="number" inputMode="decimal" step="any" value={i.quantidade ?? ""} onChange={(e) => mudarItem(k, { quantidade: e.target.value })} />
                  </label>
                  <small className="item-embalagem">
                    {insumo && n(i.quantidade) > 0 ? `No depósito: ${emEmbalagens(insumo, i.quantidade).texto}` : ""}
                    {feito ? " · ✅ já separado" : ""}
                  </small>
                  <button className="btn icone" onClick={() => setItens((its) => its.filter((_, j) => j !== k))} aria-label="Tirar produto"><Icone nome="lixo" tamanho={15} /></button>
                </div>
              );
            })}
          </div>
          <button className="btn" onClick={() => setItens((its) => [...its, { insumo_id: null, dose_ha: null, quantidade: null }])}>
            <Icone nome="mais" /> Mais um produto
          </button>
        </Modal>
      )}
    </div>
  );
}
