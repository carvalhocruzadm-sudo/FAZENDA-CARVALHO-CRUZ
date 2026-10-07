import { useMemo, useState } from "react";

import { estoqueInsumos } from "../lib/calculos";
import { ESQUEMA } from "../lib/esquema";
import { brl, data, numero } from "../lib/formato";
import { Modal } from "./ui";

/** Janela com os detalhes de um produto: foto(s), dados do cadastro, saldo e últimos lançamentos. */
export default function DetalheProduto({ id, dados, aoFechar }) {
  const [ampliada, setAmpliada] = useState(null);
  const x = useMemo(() => estoqueInsumos(dados).find((e) => e.insumo.id === id), [dados, id]);
  if (!x) return null;
  const { insumo: p } = x;
  const tipos = Object.fromEntries(ESQUEMA.insumos.campos.tipo.opcoes);
  const fotos = p.fotos_rotulo ?? [];
  const ultimas = (lista) => lista.filter((l) => l.insumo_id === id)
    .sort((a, b) => String(b.data ?? "").localeCompare(String(a.data ?? ""))).slice(0, 5);
  const entradas = ultimas(dados.insumo_entradas ?? []);
  const aplicacoes = ultimas(dados.aplicacoes ?? []);
  const linha = (rotulo, valor) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "4px 0", borderBottom: "1px solid #eee" }}>
      <span style={{ color: "var(--texto-2)" }}>{rotulo}</span><b>{valor || "—"}</b>
    </div>
  );

  return (
    <Modal titulo={p.nome} aoFechar={aoFechar}>
      {fotos.length > 0 ? (
        <div className="fotos" style={{ marginBottom: 14 }}>
          {fotos.map((f, i) => (
            <div key={i} className="foto">
              <img src={f} alt={`Foto ${i + 1} de ${p.nome}`} style={{ cursor: "zoom-in" }} onClick={() => setAmpliada(f)} />
            </div>
          ))}
        </div>
      ) : (
        <p className="descricao">Este produto ainda não tem foto. Para incluir, abra a aba Produtos e edite o cadastro.</p>
      )}
      {ampliada && (
        <div className="modal-fundo" style={{ zIndex: 1000 }} onClick={() => setAmpliada(null)}>
          <img src={ampliada} alt="Foto ampliada" style={{ maxWidth: "95vw", maxHeight: "92vh", borderRadius: 8 }} />
        </div>
      )}

      {linha("Fabricante", p.fabricante)}
      {linha("Tipo", tipos[p.tipo])}
      {linha("Princípio ativo", p.principio_ativo)}
      {linha("Unidade", p.unidade)}
      {linha("Estoque mínimo", p.estoque_minimo != null ? `${numero(p.estoque_minimo)} ${p.unidade}` : "")}
      {linha("Entrou", `${numero(x.entrada)} ${p.unidade}`)}
      {linha("Aplicado", `${numero(x.saida)} ${p.unidade}`)}
      {linha("Saldo em estoque", `${numero(x.saldo)} ${p.unidade}`)}
      {linha("Custo médio", x.custoMedio ? `${brl(x.custoMedio)}/${p.unidade}` : "")}
      {linha("Valor em estoque", x.valorEstoque ? brl(x.valorEstoque) : "")}
      {p.observacao && <p style={{ marginTop: 10 }}>{p.observacao}</p>}

      {entradas.length > 0 && (
        <>
          <h3 style={{ marginTop: 16 }}>Últimas entradas</h3>
          {entradas.map((e) => linha(data(e.data), `${numero(e.quantidade)} ${p.unidade}${e.valor ? ` · ${brl(e.valor)}` : ""}`))}
        </>
      )}
      {aplicacoes.length > 0 && (
        <>
          <h3 style={{ marginTop: 16 }}>Últimas aplicações</h3>
          {aplicacoes.map((a) => linha(data(a.data), `${numero(a.quantidade)} ${p.unidade}`))}
        </>
      )}
    </Modal>
  );
}
