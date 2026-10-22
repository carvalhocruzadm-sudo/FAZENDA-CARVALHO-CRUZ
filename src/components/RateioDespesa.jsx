import { brl } from "../lib/formato";
import { linhasDoRateio } from "../lib/rateio";
import { ordenarNome } from "../lib/talhoes";

const n = (v) => Number(v) || 0;

/**
 * Dividir a despesa entre várias culturas e/ou fazendas (ou todas). Cada
 * combinação marcada vira uma despesa com a sua parte do valor e o mesmo
 * comprovante. Com uma só marcada, é uma despesa normal.
 */
export default function RateioDespesa({ rateio, setRateio, total, dados, comCulturas }) {
  const culturas = (dados.culturas ?? []).filter((c) => c.ativo !== false).sort((a, b) => ordenarNome(a.nome, b.nome));
  const fazendas = (dados.fazendas ?? []).filter((f) => f.ativo !== false).sort((a, b) => ordenarNome(a.nome, b.nome));
  const linhas = linhasDoRateio(rateio, total, dados);
  const soma = linhas.reduce((s, l) => s + n(l.valor), 0);
  const diferenca = Math.round((n(total) - soma) * 100) / 100;

  // Marcar/desmarcar refaz a divisão automática (o que foi digitado à mão é descartado).
  const alternar = (campo, id) => setRateio((r) => ({
    ...r, manual: null, [campo]: r[campo].includes(id) ? r[campo].filter((x) => x !== id) : [...r[campo], id],
  }));
  const todas = (campo, lista) => setRateio((r) => ({
    ...r, manual: null, [campo]: r[campo].length === lista.length ? [] : lista.map((x) => x.id),
  }));
  const nome = (lista, id) => lista.find((x) => x.id === id)?.nome ?? "—";

  const fichas = (campo, lista, rotulo) => (
    <div className="campo largo" style={{ marginBottom: 12 }}>
      <span>{rotulo}</span>
      <div className="fichas">
        {lista.length > 1 && (
          <button type="button" className={`ficha ${rateio[campo].length === lista.length ? "ativa" : ""}`} onClick={() => todas(campo, lista)}>
            Todas
          </button>
        )}
        {lista.map((x) => (
          <button key={x.id} type="button" className={`ficha ${rateio[campo].includes(x.id) ? "ativa" : ""}`} onClick={() => alternar(campo, x.id)}>
            {x.nome}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ marginBottom: 14 }}>
      {comCulturas && fichas("culturas", culturas, "Culturas (marque uma ou várias)")}
      {fichas("fazendas", fazendas, "Fazendas (marque uma, várias ou todas)")}

      {linhas.length > 1 && (
        <div className="cartao" style={{ padding: 12 }}>
          <div className="barra" style={{ marginBottom: 8 }}>
            <b>Dividir {brl(total)} em {linhas.length} despesas</b>
            <span className="espaco" />
            <button type="button" className={`ficha ${rateio.modo === "igual" && !rateio.manual ? "ativa" : ""}`}
              onClick={() => setRateio((r) => ({ ...r, modo: "igual", manual: null }))}>Igual</button>
            <button type="button" className={`ficha ${rateio.modo === "area" && !rateio.manual ? "ativa" : ""}`}
              onClick={() => setRateio((r) => ({ ...r, modo: "area", manual: null }))}>Pela área (ha)</button>
          </div>
          {linhas.map((l) => (
            <div key={l.chave} className="barra" style={{ marginBottom: 6 }}>
              <span style={{ flex: 1, minWidth: 140 }}>
                {[l.cultura && nome(culturas, l.cultura), l.fazenda && nome(fazendas, l.fazenda)].filter(Boolean).join(" · ")}
              </span>
              <input type="number" inputMode="decimal" step="0.01" style={{ width: 130 }} aria-label="Valor desta parte"
                value={l.valor}
                onChange={(e) => setRateio((r) => ({
                  ...r,
                  manual: { ...Object.fromEntries(linhas.map((x) => [x.chave, x.valor])), [l.chave]: e.target.value },
                }))} />
            </div>
          ))}
          {Math.abs(diferenca) >= 0.01 && (
            <small className="negativo">
              A soma das partes ({brl(soma)}) está {diferenca > 0 ? `faltando ${brl(diferenca)}` : `passando ${brl(-diferenca)}`} do valor do comprovante.
            </small>
          )}
        </div>
      )}
    </div>
  );
}
