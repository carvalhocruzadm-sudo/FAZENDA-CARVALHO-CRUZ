import { useMemo, useState } from "react";

import { Icone, SeletorPeriodo, Stat } from "../components/ui";
import { PERIODOS, aReceber, diesel, entradasDoPeriodo, estoqueInsumos, noPeriodo, saidasDoPeriodo, situacaoRevisao, soma } from "../lib/calculos";
import { brl, data, nomeRef, numero } from "../lib/formato";
import { LANCAMENTOS } from "../lib/navegacao";

/** Data ISO daqui a `dias` (fora do componente: o painel se refaz quando os dados mudam). */
function diaISO(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

function saudacao() {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

function hojePorExtenso() {
  const t = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  return t.charAt(0).toUpperCase() + t.slice(1);
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

/** Cartão com título e, à direita, um link "Ver tudo". */
function Bloco({ titulo, icone, acao, children }) {
  return (
    <section className="cartao bloco">
      <header>
        <h2>{icone && <Icone nome={icone} tamanho={17} />} {titulo}</h2>
        {acao && <button className="link" onClick={acao[1]}>{acao[0]} <Icone nome="seta" tamanho={14} /></button>}
      </header>
      {children}
    </section>
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
    const estoque = estoqueInsumos(dados);
    const hojeIso = diaISO(0);
    const em7 = diaISO(7);
    const em30 = diaISO(30);

    // O que precisa de alguém olhar (as contas ficam no bloco delas).
    const alertas = [];
    const pendentes = dados.solicitacoes_produto.filter((x) => x.situacao === "pendente").length;
    if (pendentes) alertas.push({ tipo: "atencao", texto: `${pendentes} ${pendentes === 1 ? "entrada de produto esperando" : "entradas de produto esperando"} sua aprovação`, ir: ["estoque", "aprovar"] });
    for (const m of dados.maquinas.filter((x) => x.ativo !== false)) {
      const s = situacaoRevisao(dados, m);
      const un = m.medidor === "km" ? "km" : "h";
      if (s.estado === "vencida") alertas.push({ tipo: "ruim", texto: `${m.nome}: revisão vencida há ${numero(-s.faltam, 0)} ${un}`, ir: ["maquinas", "situacao"] });
      if (s.estado === "proxima") alertas.push({ tipo: "atencao", texto: `${m.nome}: revisão em ${numero(s.faltam, 0)} ${un}`, ir: ["maquinas", "situacao"] });
    }
    for (const x of estoque) {
      if (x.negativo) alertas.push({ tipo: "ruim", texto: `${x.insumo.nome}: estoque negativo (${numero(x.saldo)} ${x.insumo.unidade}) — falta lançar a compra`, ir: ["estoque", "estoque"] });
      else if (x.baixo) alertas.push({ tipo: "atencao", texto: `${x.insumo.nome}: estoque baixo (${numero(x.saldo)} ${x.insumo.unidade})`, ir: ["estoque", "estoque"] });
    }
    if (tanque.litrosEntrada && tanque.saldo < 0) alertas.push({ tipo: "ruim", texto: `Tanque de diesel negativo (${numero(tanque.saldo, 0)} L) — falta lançar compra`, ir: ["diesel", "diesel_entradas"] });
    alertas.sort((a, b) => (a.tipo === "ruim" ? 0 : 1) - (b.tipo === "ruim" ? 0 : 1));

    // Contas a pagar: vencidas e as dos próximos 30 dias.
    const contas = [
      ...dados.despesas.filter((d) => !d.pago && d.vencimento).map((d) => ({
        id: d.id, vencimento: d.vencimento, texto: d.descricao, quem: d.favorecido, valor: Number(d.valor) || 0, ir: ["financeiro", "despesas"],
      })),
      ...dados.insumo_entradas.filter((e) => e.pago === false && e.vencimento).map((e) => ({
        id: e.id, vencimento: e.vencimento, texto: `Boleto de ${nomeRef(dados, "insumos", e.insumo_id)}`, quem: e.fornecedor, valor: Number(e.valor) || 0, ir: ["estoque", "insumo_entradas"],
      })),
    ].filter((c) => c.vencimento <= em30).sort((a, b) => a.vencimento.localeCompare(b.vencimento))
      .map((c) => ({ ...c, situacao: c.vencimento < hojeIso ? "ruim" : c.vencimento <= em7 ? "atencao" : "neutro" }));

    // Últimas atividades no campo, como a linha do tempo do Aegro.
    const atividades = [
      ...dados.aplicacoes.map((a) => ({
        ...a, icone: "spray", ir: ["atividades", "aplicacoes"],
        titulo: `Aplicação: ${nomeRef(dados, "insumos", a.insumo_id)}`,
        detalhe: `${numero(a.quantidade)} ${dados.insumos.find((i) => i.id === a.insumo_id)?.unidade ?? ""} · ${nomeRef(dados, "talhoes", a.talhao_id)}`,
      })),
      ...dados.operacoes.map((o) => ({
        ...o, icone: "relogio", ir: ["atividades", "operacoes"],
        titulo: `${o.operacao || "Serviço"}: ${nomeRef(dados, "maquinas", o.maquina_id)}`,
        detalhe: [o.trabalhado ? `${numero(o.trabalhado, 1)} h/km` : null, o.talhao_id ? nomeRef(dados, "talhoes", o.talhao_id) : null, o.operador_id ? nomeRef(dados, "funcionarios", o.operador_id) : null].filter(Boolean).join(" · "),
      })),
      ...dados.colheitas.map((c) => ({
        ...c, icone: "cesto", ir: ["lavoura", "colheitas"],
        titulo: `Colheita: ${nomeRef(dados, "culturas", c.cultura_id)}`,
        detalhe: `${numero(c.quantidade)} ${c.unidade ?? ""} · ${nomeRef(dados, "talhoes", c.talhao_id)}`,
      })),
      ...dados.abastecimentos.map((a) => ({
        ...a, icone: "combustivel", ir: ["diesel", "abastecimentos"],
        titulo: `Abastecimento: ${nomeRef(dados, "maquinas", a.maquina_id)}`,
        detalhe: `${numero(a.litros, 0)} L · ${a.origem === "posto" ? "posto" : "tanque"}`,
      })),
    ].sort((a, b) => String(b.data ?? "").localeCompare(String(a.data ?? "")) || String(b.atualizado_em ?? "").localeCompare(String(a.atualizado_em ?? "")))
      .slice(0, 8);

    // A lavoura de hoje: área ativa por cultura.
    const lavoura = new Map();
    for (const t of dados.talhoes.filter((x) => x.ativo !== false)) {
      const nome = t.cultura_id ? nomeRef(dados, "culturas", t.cultura_id) : "Sem cultura";
      const x = lavoura.get(nome) ?? { nome, area: 0, talhoes: 0 };
      x.area += Number(t.area_ha) || 0;
      x.talhoes++;
      lavoura.set(nome, x);
    }

    const porCultura = {};
    for (const v of vendas) {
      const nome = nomeRef(dados, "culturas", v.cultura_id);
      porCultura[nome] = (porCultura[nome] ?? 0) + (Number(v.valor) || 0);
    }

    return {
      vendido: soma(vendas, (v) => v.valor), cargas: vendas.length, saidas, entradas,
      aReceber: soma(receber.filter((x) => x.saldo > 0), (x) => x.saldo), tanque, alertas, contas, atividades,
      valorEstoque: soma(estoque, (x) => x.valorEstoque),
      lavoura: [...lavoura.values()].sort((a, b) => b.area - a.area),
      porCultura: Object.entries(porCultura).map(([rotulo, valor]) => ({ rotulo, valor, cor: "var(--laranja)" })).sort((a, b) => b.valor - a.valor),
      porCategoria: Object.entries(saidas.porCategoria).map(([rotulo, valor]) => ({ rotulo, valor, cor: "var(--verde-claro)" })).sort((a, b) => b.valor - a.valor),
    };
  }, [dados, periodo]);

  const resultado = r.entradas.total - r.saidas.total;
  const areaTotal = soma(r.lavoura, (x) => x.area);
  const ir = ([secao, aba]) => irPara(secao, { aba });

  return (
    <>
      <div className="boas-vindas">
        <div>
          <h2>{saudacao()}!</h2>
          <small>{hojePorExtenso()}</small>
        </div>
        <SeletorPeriodo periodos={PERIODOS} valor={periodo} aoMudar={setPeriodo} />
      </div>

      <div className="grade grade-4">
        <Stat rotulo="Entrou no caixa" valor={brl(r.entradas.total)} sub="recebimentos + fretes + aditivos" />
        <Stat rotulo="Saiu do caixa" valor={brl(r.saidas.total)} sub="despesas + diesel + insumos + peças" cor="vermelho" />
        <Stat rotulo="Resultado de caixa" valor={brl(resultado)} cor={resultado < 0 ? "vermelho" : ""} />
        <Stat rotulo="Vendas (líquido)" valor={brl(r.vendido)} sub={`${r.cargas} ${r.cargas === 1 ? "carga" : "cargas"}`} cor="laranja" />
      </div>

      <div className="chips">
        <button onClick={() => irPara("vendas", { aba: "areceber" })}><small>A receber</small><b>{brl(r.aReceber)}</b></button>
        <button onClick={() => irPara("diesel")}><small>Diesel no tanque</small><b className={r.tanque.saldo < 0 ? "negativo" : ""}>{numero(r.tanque.saldo, 0)} L</b></button>
        <button onClick={() => irPara("estoque")}><small>Insumos em estoque</small><b>{brl(r.valorEstoque)}</b></button>
        <button onClick={() => irPara("lavoura")}><small>Área em produção</small><b>{numero(areaTotal, 1)} ha</b></button>
      </div>

      <div className="painel-grade">
        <Bloco titulo="Precisa da sua atenção" icone="alerta">
          {r.alertas.length === 0 ? <div className="vazio">Tudo em dia. 👍</div> : (
            <ul className="lista-alertas">
              {r.alertas.slice(0, 10).map((a, i) => (
                <li key={i} className="clicavel" onClick={() => ir(a.ir)}>
                  <span className={`ponto ${a.tipo}`} />
                  <span style={{ flex: 1 }}>{a.texto}</span>
                  <Icone nome="seta" tamanho={15} className="seta" />
                </li>
              ))}
            </ul>
          )}
        </Bloco>

        <Bloco titulo="Contas a pagar (30 dias)" icone="calendario" acao={["Ver despesas", () => irPara("financeiro", { aba: "despesas" })]}>
          {r.contas.length === 0 ? <div className="vazio">Nenhuma conta em aberto com vencimento.</div> : (
            <>
              <ul className="lista-alertas">
                {r.contas.slice(0, 8).map((c) => (
                  <li key={c.id} className="clicavel" onClick={() => ir(c.ir)}>
                    <span className={`selo ${c.situacao}`}>{c.situacao === "ruim" ? "Vencida" : data(c.vencimento).slice(0, 5)}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      {c.texto}{c.quem && <small className="cinza"> · {c.quem}</small>}
                    </span>
                    <b>{brl(c.valor)}</b>
                  </li>
                ))}
              </ul>
              <div className="total-linha"><span>Total</span><b>{brl(soma(r.contas, (c) => c.valor))}</b></div>
            </>
          )}
        </Bloco>

        <Bloco titulo="Lançar rápido" icone="mais">
          <div className="atalhos">
            {LANCAMENTOS.slice(0, 8).map(([rotulo, icone, secao, aba]) => (
              <button key={rotulo} onClick={() => irPara(secao, { aba, novo: true })}>
                <span className="lancar-icone"><Icone nome={icone} /></span>
                <span>{rotulo}</span>
              </button>
            ))}
          </div>
        </Bloco>

        <Bloco titulo="Últimas atividades no campo" icone="atividade" acao={["Ver todas", () => irPara("atividades")]}>
          {r.atividades.length === 0 ? <div className="vazio">Nenhuma atividade lançada ainda.</div> : (
            <ul className="linha-tempo">
              {r.atividades.map((a) => (
                <li key={`${a.icone}-${a.id}`} className="clicavel" onClick={() => ir(a.ir)}>
                  <span className="lancar-icone pequeno"><Icone nome={a.icone} tamanho={15} /></span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b>{a.titulo}</b>
                    <small>{a.detalhe}</small>
                  </span>
                  <small className="cinza">{data(a.data).slice(0, 5)}</small>
                </li>
              ))}
            </ul>
          )}
        </Bloco>

        <Bloco titulo="Lavoura hoje" icone="cultura" acao={["Ver talhões", () => irPara("lavoura")]}>
          {r.lavoura.length === 0 ? <div className="vazio">Cadastre os talhões em Safra e talhões.</div> : (
            <div style={{ display: "grid", gap: 10 }}>
              {r.lavoura.map((x) => (
                <div key={x.nome}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                    <span>{x.nome} <small className="cinza">· {x.talhoes} {x.talhoes === 1 ? "talhão" : "talhões"}</small></span>
                    <b>{numero(x.area, 1)} ha</b>
                  </div>
                  <div className="barra-h"><div style={{ width: `${areaTotal ? (x.area / areaTotal) * 100 : 0}%` }} /></div>
                </div>
              ))}
            </div>
          )}
        </Bloco>

        <Bloco titulo="Para onde foi o dinheiro" icone="grafico" acao={["Financeiro", () => irPara("financeiro")]}>
          <Barras itens={r.porCategoria.slice(0, 8)} />
        </Bloco>

        <Bloco titulo="Vendas por cultura" icone="venda" acao={["Vendas", () => irPara("vendas", { aba: "resumo" })]}>
          <Barras itens={r.porCultura} />
        </Bloco>
      </div>
    </>
  );
}
