import { useMemo, useState } from "react";

import { Icone, SeletorPeriodo, Stat } from "../components/ui";
import { PERIODOS, aReceber, diesel, entradasDoPeriodo, estoqueInsumos, noPeriodo, saidasDoPeriodo, situacaoRevisao, soma } from "../lib/calculos";
import { brl, data, nomeRef, numero } from "../lib/formato";
import { nomesTalhoesDaOrdem } from "../lib/talhoes";

/** Data ISO daqui a `dias` (fora do componente: o painel se refaz quando os dados mudam). */
function diaISO(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

function Barras({ itens }) {
  const max = Math.max(1, ...itens.map((i) => i.valor));
  if (!itens.length) return <div className="vazio">Nada lançado no período.</div>;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {itens.map((i) => (
        <div key={i.rotulo}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
            <span>{i.rotulo}</span><b>{brl(i.valor)}</b>
          </div>
          <div className="barra-h"><div style={{ width: `${(i.valor / max) * 100}%`, background: i.cor }} /></div>
        </div>
      ))}
    </div>
  );
}

export default function Painel({ dados, irPara }) {
  const [periodo, setPeriodo] = useState("mes");

  const r = useMemo(() => {
    const vendas = noPeriodo(dados.vendas, periodo);
    const saidas = saidasDoPeriodo(dados, periodo);
    const entradas = entradasDoPeriodo(dados, periodo);
    const receber = aReceber(dados);
    const tanque = diesel(dados);
    const hojeIso = diaISO(0);
    const em7 = diaISO(7);

    const alertas = [];
    for (const m of dados.maquinas.filter((x) => x.ativo !== false)) {
      const s = situacaoRevisao(dados, m);
      const un = m.medidor === "km" ? "km" : "h";
      if (s.estado === "vencida") alertas.push({ tipo: "ruim", texto: `${m.nome}: revisão vencida há ${numero(-s.faltam, 0)} ${un}`, ir: "maquinas" });
      if (s.estado === "proxima") alertas.push({ tipo: "atencao", texto: `${m.nome}: revisão em ${numero(s.faltam, 0)} ${un}`, ir: "maquinas" });
    }
    for (const x of estoqueInsumos(dados)) {
      if (x.negativo) alertas.push({ tipo: "ruim", texto: `${x.insumo.nome}: estoque negativo (${numero(x.saldo)} ${x.insumo.unidade}) — falta lançar entrada`, ir: "quimicos" });
      else if (x.baixo) alertas.push({ tipo: "atencao", texto: `${x.insumo.nome}: estoque baixo (${numero(x.saldo)} ${x.insumo.unidade})`, ir: "quimicos" });
    }
    const aConferir = dados.insumo_entradas.filter((e) => e.a_conferir).length;
    if (aConferir) alertas.push({ tipo: "atencao", texto: `${aConferir} entrada(s) de produto lançada(s) no depósito sem preço — falta conferir`, ir: "quimicos" });
    for (const o of dados.pulverizacoes.filter((x) => x.situacao === "aberta")) {
      alertas.push({ tipo: "atencao", texto: `Pulverização em ${nomesTalhoesDaOrdem(dados, o)} (${data(o.data)}) esperando separar no depósito`, ir: "quimicos" });
    }
    if (tanque.litrosEntrada && tanque.saldo < 0) alertas.push({ tipo: "ruim", texto: `Tanque de diesel negativo (${numero(tanque.saldo, 0)} L) — falta lançar compra`, ir: "diesel" });
    for (const d of dados.despesas.filter((x) => !x.pago && x.vencimento)) {
      if (d.vencimento < hojeIso) alertas.push({ tipo: "ruim", texto: `Conta vencida ${data(d.vencimento)}: ${d.descricao} — ${brl(d.valor)}`, ir: "financeiro" });
      else if (d.vencimento <= em7) alertas.push({ tipo: "atencao", texto: `Vence ${data(d.vencimento)}: ${d.descricao} — ${brl(d.valor)}`, ir: "financeiro" });
    }

    const porCultura = {};
    for (const v of vendas) {
      const nome = nomeRef(dados, "culturas", v.cultura_id);
      porCultura[nome] = (porCultura[nome] ?? 0) + (Number(v.valor) || 0);
    }

    return {
      vendido: soma(vendas, (v) => v.valor), cargas: vendas.length, saidas, entradas,
      aReceber: soma(receber.filter((x) => x.saldo > 0), (x) => x.saldo), tanque, alertas,
      porCultura: Object.entries(porCultura).map(([rotulo, valor]) => ({ rotulo, valor, cor: "var(--laranja)" })).sort((a, b) => b.valor - a.valor),
      porCategoria: Object.entries(saidas.porCategoria).map(([rotulo, valor]) => ({ rotulo, valor })).sort((a, b) => b.valor - a.valor),
    };
  }, [dados, periodo]);

  const resultado = r.entradas.total - r.saidas.total;

  return (
    <>
      <div className="barra">
        <SeletorPeriodo periodos={PERIODOS} valor={periodo} aoMudar={setPeriodo} />
      </div>
      <div className="grade">
        <Stat rotulo="Vendas (líquido)" valor={brl(r.vendido)} sub={`${r.cargas} ${r.cargas === 1 ? "carga" : "cargas"}`} cor="laranja" />
        <Stat rotulo="Entrou no caixa" valor={brl(r.entradas.total)} sub="recebimentos + fretes + aditivos" />
        <Stat rotulo="Saiu do caixa" valor={brl(r.saidas.total)} sub="despesas + diesel + insumos + peças" cor="vermelho" />
        <Stat rotulo="Resultado de caixa" valor={brl(resultado)} cor={resultado < 0 ? "vermelho" : ""} />
        <Stat rotulo="A receber (total)" valor={brl(r.aReceber)} sub="vendas − recebimentos" cor="laranja" />
        <Stat rotulo="Diesel no tanque" valor={`${numero(r.tanque.saldo, 0)} L`} sub={r.tanque.precoMedio ? `preço médio ${brl(r.tanque.precoMedio)}/L` : "sem compras lançadas"} cor="cinza" />
      </div>

      <div className="grade-2">
        <div className="cartao">
          <h2>Avisos</h2>
          {r.alertas.length === 0 ? <div className="vazio">Tudo em dia.</div> : (
            <ul className="lista-alertas">
              {r.alertas.slice(0, 15).map((a, i) => (
                <li key={i}>
                  <span className={`selo ${a.tipo}`}><Icone nome="alerta" tamanho={12} /></span>
                  <span style={{ flex: 1 }}>{a.texto}</span>
                  <button className="btn" onClick={() => irPara(a.ir)}>Ver</button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="cartao">
          <h2>Saídas por categoria</h2>
          <Barras itens={r.porCategoria.map((x) => ({ ...x, cor: "var(--verde-claro)" }))} />
        </div>
        <div className="cartao">
          <h2>Vendas por cultura</h2>
          <Barras itens={r.porCultura} />
        </div>
      </div>
    </>
  );
}
