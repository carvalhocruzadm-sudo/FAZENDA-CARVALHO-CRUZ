import { useCallback, useMemo, useState } from "react";

import { emEmbalagens, itensDaOrdem } from "../lib/deposito";
import { ESQUEMA, prepararRegistro, registroNovo } from "../lib/esquema";
import { data as dataBR, nomeRef, numero } from "../lib/formato";
import { FotoProduto } from "./CampoUI";
import Formulario from "./Formulario";
import { Icone, Modal } from "./ui";

const n = (v) => Number(v) || 0;
const SELO = { aberta: ["atencao", "Esperando separar"], separada: ["ok", "Separada"], concluida: ["neutro", "Concluída"], cancelada: ["ruim", "Cancelada"] };

/**
 * Ordens de pulverização (escritório): o gerente escolhe talhão, trator e os
 * produtos com a dose por ha. O total de cada produto é dose × área. O
 * tratorista vê a ordem no depósito pelo QR-1 e confere produto por produto.
 */
export default function OrdensPulverizacao({ dados, salvar, remover }) {
  const [filtro, setFiltro] = useState("ativas");
  const [ordem, setOrdem] = useState(null); // rascunho do cabeçalho
  const [itens, setItens] = useState([]); // rascunho dos produtos
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const lista = useMemo(() => dados.pulverizacoes
    .filter((o) => filtro === "todas" || ["aberta", "separada", null, undefined].includes(o.situacao))
    .sort((a, b) => String(b.data).localeCompare(String(a.data))), [dados.pulverizacoes, filtro]);

  const abrir = (o) => {
    setErro(null);
    setOrdem(o ? { ...o } : registroNovo("pulverizacoes"));
    setItens(o ? dados.pulverizacao_itens.filter((i) => i.pulverizacao_id === o.id).map((i) => ({ ...i })) : [{ insumo_id: null, dose_ha: null, quantidade: null }]);
  };
  const fechar = useCallback(() => setOrdem(null), []);

  // Mudou a área: refaz o total dos produtos que têm dose.
  const setOrdemComArea = (f) => setOrdem((atual) => {
    const novo = typeof f === "function" ? f(atual) : f;
    if (n(novo.area_ha) !== n(atual?.area_ha)) {
      setItens((its) => its.map((i) => (i.dose_ha != null && i.dose_ha !== "" ? { ...i, quantidade: +(n(i.dose_ha) * n(novo.area_ha)).toFixed(3) } : i)));
    }
    return novo;
  });

  const mudarItem = (k, patch) => setItens((its) => its.map((i, j) => {
    if (j !== k) return i;
    const novo = { ...i, ...patch };
    if ("dose_ha" in patch) novo.quantidade = patch.dose_ha === "" ? i.quantidade : +(n(patch.dose_ha) * n(ordem.area_ha)).toFixed(3);
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
      ...linhas.map((p) => ({ insumo_id: p.insumo_id, dose_ha: p.dose_ha, quantidade: +(n(p.dose_ha) * n(ordem.area_ha)).toFixed(3) })),
    ]);
  };

  const gravar = async () => {
    const { reg, erro: e } = prepararRegistro("pulverizacoes", ordem);
    if (e) { setErro(e); return; }
    const validos = itens.filter((i) => i.insumo_id);
    if (!validos.length) { setErro("Coloque pelo menos um produto."); return; }
    if (validos.some((i) => !(n(i.quantidade) > 0))) { setErro("Todo produto precisa de dose ou quantidade."); return; }
    setSalvando(true);
    try {
      const salva = await salvar("pulverizacoes", reg);
      const antes = dados.pulverizacao_itens.filter((i) => i.pulverizacao_id === salva.id);
      for (const i of validos) {
        const p = prepararRegistro("pulverizacao_itens", { ...i, pulverizacao_id: salva.id });
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
            <thead><tr><th>Data</th><th>Talhão</th><th className="num">Área</th><th>Trator</th><th>Produtos</th><th>Separados</th><th>Situação</th></tr></thead>
            <tbody>
              {lista.map((o) => {
                const its = itensDaOrdem(dados, o.id);
                const [cls, rot] = SELO[o.situacao] ?? SELO.aberta;
                return (
                  <tr key={o.id} className="clicavel" onClick={() => abrir(o)}>
                    <td data-rotulo="Data">{dataBR(o.data)}</td>
                    <td data-rotulo="Talhão">{nomeRef(dados, "talhoes", o.talhao_id)}</td>
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
        <Modal titulo={ordem.id ? "Ordem de pulverização" : "Nova ordem de pulverização"} aoFechar={fechar}
          rodape={(
            <>
              {ordem.id && <button className="btn perigo" onClick={apagar}><Icone nome="lixo" /> Apagar</button>}
              <span className="espaco" />
              <button className="btn" onClick={fechar}>Cancelar</button>
              <button className="btn primario" onClick={gravar} disabled={salvando}><Icone nome="editar" /> {salvando ? "Salvando…" : "Salvar"}</button>
            </>
          )}>
          {erro && <div className="aviso">{erro}</div>}
          <Formulario colecao="pulverizacoes" reg={ordem} setReg={setOrdemComArea} dados={dados} />

          <h3 style={{ fontSize: 15, margin: "20px 0 10px" }}>Produtos</h3>
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
                  <FotoProduto insumo={insumo} className="mini" />
                  <label className="campo"><span>Produto</span>
                    <select value={i.insumo_id ?? ""} onChange={(e) => mudarItem(k, { insumo_id: e.target.value || null })}>
                      <option value="">— escolha —</option>
                      {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome} ({p.unidade})</option>)}
                    </select>
                  </label>
                  <label className="campo"><span>Dose por ha</span>
                    <input type="number" inputMode="decimal" step="any" value={i.dose_ha ?? ""} onChange={(e) => mudarItem(k, { dose_ha: e.target.value })} />
                  </label>
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
