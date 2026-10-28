import { numero } from "../lib/formato";
import { SEM_CULTURA, chaveCultura, culturasComTalhao, ordenarNome as ordenar } from "../lib/talhoes";

/**
 * Cultura primeiro, depois as fazendas e os talhões dela (um, vários ou todos).
 * Marcar a fazenda marca todos os talhões dela. `areas` é { talhao_id: ha }:
 * talhão marcado já vem com a área do cadastro e dá para mudar.
 * `nomeFazenda(t)` diz a fazenda de cada talhão. `todasCulturas` lista
 * também as culturas sem talhão (venda, despesa da cultura…);
 * `mostrarCultura={false}` quando a tela já perguntou a cultura.
 */
export default function EscolhaTalhoes({
  culturas, talhoes, nomeFazenda, cultura, aoMudarCultura, areas, setAreas,
  rotuloCultura = "Cultura da aplicação", obrigatorio = true, todasCulturas = false, mostrarCultura = true,
}) {
  const comTalhao = culturasComTalhao(culturas, talhoes);
  const opcoes = todasCulturas
    ? [...culturas.filter((c) => c.ativo !== false || c.id === cultura).sort((a, b) => ordenar(a.nome, b.nome)), ...comTalhao.filter((c) => c.id === SEM_CULTURA)]
    : comTalhao;
  const daCultura = talhoes.filter((t) => cultura && chaveCultura(t) === cultura)
    .sort((a, b) => ordenar(nomeFazenda(a), nomeFazenda(b)) || ordenar(a.nome, b.nome));
  const fazendas = [...new Set(daCultura.map(nomeFazenda))].sort(ordenar);
  const marcados = daCultura.filter((t) => t.id in areas);
  const area = marcados.reduce((s, t) => s + (Number(areas[t.id]) || 0), 0);

  const marcar = (lista, sim) => setAreas((a) => {
    const n = { ...a };
    for (const t of lista) {
      if (!sim) delete n[t.id];
      else if (!(t.id in n)) n[t.id] = t.area_ha ?? "";
    }
    return n;
  });

  return (
    <>
      {mostrarCultura && <div className="campo largo">
        <span><label>{rotuloCultura}</label>{obrigatorio && <em> *</em>}</span>
        <select value={cultura} onChange={(e) => { aoMudarCultura(e.target.value); setAreas({}); }}>
          <option value="">— escolha a cultura —</option>
          {opcoes.map((c) => <option key={c.id} value={c.id}>{c.nome} ({talhoes.filter((t) => chaveCultura(t) === c.id).length} talhões)</option>)}
        </select>
      </div>}
      <div className="campo largo">
        <span><label>Fazendas e talhões</label>{obrigatorio && <em> *</em>}</span>
        {!cultura ? <div className="escolha-talhoes vazio">Escolha a cultura primeiro</div> : !daCultura.length ? <div className="escolha-talhoes vazio">Nenhum talhão desta cultura</div> : (
          <div className="escolha-talhoes">
            <div className="barra">
              <button type="button" className="btn" onClick={() => marcar(daCultura, true)}>Marcar todos</button>
              <button type="button" className="btn" onClick={() => marcar(daCultura, false)} disabled={!marcados.length}>Desmarcar</button>
              <span className="espaco" />
              <b>{marcados.length} {marcados.length === 1 ? "talhão" : "talhões"} · {numero(area)} ha</b>
            </div>
            {fazendas.map((nome) => {
              const ts = daCultura.filter((t) => nomeFazenda(t) === nome);
              const todos = ts.every((t) => t.id in areas);
              const algum = ts.some((t) => t.id in areas);
              return (
                <div key={nome} className="grupo-fazenda">
                  <label className="marca fazenda">
                    <input type="checkbox" checked={todos} onChange={() => marcar(ts, !todos)}
                      ref={(el) => { if (el) el.indeterminate = algum && !todos; }} />
                    <b>{nome}</b> <small>({ts.length} {ts.length === 1 ? "talhão" : "talhões"} · marcar a fazenda inteira)</small>
                  </label>
                  {ts.map((t) => (
                    <div key={t.id} className="linha-talhao">
                      <label className="marca">
                        <input type="checkbox" checked={t.id in areas} onChange={() => marcar([t], !(t.id in areas))} />
                        {t.nome}{t.area_ha ? <small> ({numero(t.area_ha)} ha)</small> : ""}
                      </label>
                      {t.id in areas && (
                        <span className="com-unidade">
                          <input type="number" inputMode="decimal" step="any" aria-label={`Área a aplicar em ${t.nome}`}
                            value={areas[t.id]} onChange={(e) => setAreas((x) => ({ ...x, [t.id]: e.target.value }))} />
                          <i>ha</i>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
