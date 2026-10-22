import { useMemo, useState } from "react";

import { Abas, Icone, Stat } from "../components/ui";
import { PERIODOS, aReceber, diesel, estoqueInsumos, intervalo, situacaoRevisao, soma } from "../lib/calculos";
import { brl, baixarCSV, data, leitura, numero } from "../lib/formato";
import { KG_CAIXA, NOMES_MESES, anosComDados, indicadores, mesLegivel } from "../lib/indicadores";
import { nomesTalhoesDaOrdem } from "../lib/talhoes";
import useCulturaAtiva from "../hooks/useCulturaAtiva";

/** Data ISO daqui a `dias` (fora do componente: o painel se refaz quando os dados mudam). */
function diaISO(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

// ─── Formatos ───────────────────────────────────────────────────────────────

const toneladas = (kg) => `${numero(kg / 1000, 1)} t`;
const ou = (f) => (v) => (v == null || !Number.isFinite(v) ? "—" : f(v));
const F = {
  brl: ou(brl),
  t: ou(toneladas),
  kg: ou((v) => `${numero(v, 0)} kg`),
  n0: ou((v) => numero(v, 0)),
  n1: ou((v) => numero(v, 1)),
  n2: ou((v) => numero(v, 2)),
  pct: ou((v) => `${numero(v, 1)}%`),
  ha: ou((v) => `${numero(v, 1)} ha`),
};

// Cores dos gráficos: verde = entrou / produção; laranja = saiu / custo.
const COR_A = "#2f8a5e";
const COR_B = "#d9622b";

// ─── Gráficos ───────────────────────────────────────────────────────────────

/** Barras deitadas, uma por item, do maior para o menor (rankings). */
function Ranking({ itens, formato = F.brl, cor = COR_A, limite = 12 }) {
  const lista = itens.filter((i) => Number.isFinite(i.valor) && i.valor > 0).slice(0, limite);
  const max = Math.max(1, ...lista.map((i) => i.valor));
  if (!lista.length) return <div className="vazio">Nada para mostrar com esses filtros.</div>;
  return (
    <ol className="ranking">
      {lista.map((i, pos) => (
        <li key={`${pos}-${i.rotulo}`} title={`${i.rotulo}: ${formato(i.valor)}${i.sub ? ` · ${i.sub}` : ""}`}>
          <span className="pos">{pos + 1}º</span>
          <div className="corpo">
            <div className="linha"><span>{i.rotulo}</span><b>{formato(i.valor)}</b></div>
            <div className="barra-h"><div style={{ width: `${(i.valor / max) * 100}%`, background: cor }} /></div>
            {i.sub && <small>{i.sub}</small>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * Colunas por mês. `series`: [{ nome, cor, valor(item) }]. Com uma série só
 * não tem legenda (o título do cartão já diz o que é).
 */
/** Embaixo da coluna só o mês; o ano aparece na primeira coluna e em janeiro. */
const rotuloCurto = (i, k) => (k === 0 || i.mes.endsWith("-01") ? mesLegivel(i.mes) : NOMES_MESES[Number(i.mes.slice(5)) - 1]);

function Colunas({ itens, series, formato = F.brl, rotulo = (i) => mesLegivel(i.mes), curto = rotuloCurto }) {
  const [foco, setFoco] = useState(null);
  if (!itens.length) return <div className="vazio">Nada lançado no período.</div>;
  const max = Math.max(1, ...itens.flatMap((i) => series.map((s) => s.valor(i) || 0)));
  const atual = foco != null ? itens[foco] : null;
  return (
    <div className="colunas">
      {series.length > 1 && (
        <div className="legenda">
          {series.map((s) => <span key={s.nome}><i style={{ background: s.cor }} />{s.nome}</span>)}
        </div>
      )}
      <div className="dica-grafico" aria-live="polite">
        {atual ? (
          <><b>{rotulo(atual)}</b>{series.map((s) => <span key={s.nome}>{series.length > 1 && <i style={{ background: s.cor }} />}{series.length > 1 ? `${s.nome}: ` : ""}{formato(s.valor(atual) || 0)}</span>)}</>
        ) : <span className="apagado">Toque numa coluna para ver o valor</span>}
      </div>
      <div className="area" style={{ gridTemplateColumns: `repeat(${itens.length}, minmax(${series.length > 1 ? 22 : 14}px, 1fr))` }} onMouseLeave={() => setFoco(null)}>
        {itens.map((i, k) => (
          <button key={i.id ?? k} type="button" className={`grupo ${foco === k ? "foco" : ""}`}
            onMouseEnter={() => setFoco(k)} onFocus={() => setFoco(k)} onClick={() => setFoco(k)}
            aria-label={`${rotulo(i)}: ${series.map((s) => `${s.nome} ${formato(s.valor(i) || 0)}`).join(", ")}`}>
            <span className="pilha">
              {series.map((s) => (
                <span key={s.nome} className="col" style={{ height: `${Math.max(0, (s.valor(i) || 0) / max) * 100}%`, background: s.cor }} />
              ))}
            </span>
            <small>{curto(i, k)}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Barra empilhada única (participação: tipos de laranja, origem dos custos…). */
function Participacao({ partes, formato = F.t }) {
  const total = soma(partes, (p) => p.valor);
  if (!total) return <div className="vazio">Nada para mostrar.</div>;
  const cores = ["#2f8a5e", "#d9622b", "#3b6fb6", "#a4549c", "#8a7a1f", "#4d9aa6", "#b84b5c", "#6b6b60"];
  return (
    <div className="participacao">
      <div className="faixa">
        {partes.map((p, i) => <span key={p.rotulo} title={`${p.rotulo}: ${formato(p.valor)} (${numero((p.valor / total) * 100, 1)}%)`} style={{ width: `${(p.valor / total) * 100}%`, background: cores[i % cores.length] }} />)}
      </div>
      <ul>
        {partes.map((p, i) => (
          <li key={p.rotulo}><i style={{ background: cores[i % cores.length] }} />{p.rotulo}<b>{formato(p.valor)}</b><span>{numero((p.valor / total) * 100, 1)}%</span></li>
        ))}
      </ul>
    </div>
  );
}

// ─── Tabela com ordenação e "baixar planilha" ───────────────────────────────

/**
 * colunas: [{ rotulo, v(linha) → valor cru (ordena e vai para a planilha), f(valor) → texto,
 *             fl(linha) → texto, quando cada linha tem um formato (R$, t, nº…) }]
 * Clicar no título da coluna ordena (de novo inverte).
 */
function Tabela({ titulo, arquivo, colunas, linhas, rodape, ordemInicial, vazio = "Nada para mostrar com esses filtros." }) {
  const [ordem, setOrdem] = useState(ordemInicial ?? null); // [índice, desc]
  const ordenadas = useMemo(() => {
    if (!ordem) return linhas;
    const [i, desc] = ordem;
    const v = colunas[i].v;
    return [...linhas].sort((a, b) => {
      const x = v(a), y = v(b);
      if (x == null || x === "") return 1;
      if (y == null || y === "") return -1;
      const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR", { numeric: true });
      return desc ? -r : r;
    });
  }, [linhas, colunas, ordem]);

  const baixar = () => baixarCSV(`${arquivo || titulo}.csv`, [
    colunas.map((c) => c.rotulo),
    ...ordenadas.map((l) => colunas.map((c) => {
      const x = c.v(l);
      return typeof x === "number" ? +x.toFixed(4) : x ?? "";
    })),
  ]);

  return (
    <div className="cartao">
      <div className="cabeca">
        <h2>{titulo}</h2>
        {linhas.length > 0 && <button className="btn" onClick={baixar} title="Baixar esta tabela para abrir no Excel"><Icone nome="exportar" tamanho={15} /> Planilha</button>}
      </div>
      {!linhas.length ? <div className="vazio">{vazio}</div> : (
        <div className="tabela cartoes">
          <table>
            <thead>
              <tr>
                {colunas.map((c, i) => {
                  const ativa = ordem?.[0] === i;
                  return (
                    <th key={i} className={c.f ? "num ordenavel" : "ordenavel"}
                      onClick={() => setOrdem(ativa ? [i, !ordem[1]] : [i, Boolean(c.f)])}>
                      {c.rotulo}{ativa ? (ordem[1] ? " ▼" : " ▲") : ""}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {ordenadas.map((l, k) => (
                <tr key={l.id ?? k}>
                  {colunas.map((c, i) => <td key={i} data-rotulo={c.rotulo} className={c.f ? "num" : ""}>{c.fl ? c.fl(l) : c.f ? c.f(c.v(l)) : (c.v(l) ?? "—")}</td>)}
                </tr>
              ))}
            </tbody>
            {rodape && <tfoot><tr>{colunas.map((c, i) => <td key={i} className={c.f ? "num" : ""}>{rodape[i] ?? ""}</td>)}</tr></tfoot>}
          </table>
        </div>
      )}
    </div>
  );
}

const somaF = (lista, campo, f) => f(soma(lista, (x) => x[campo]));

/** Período: os atalhos (este mês, este ano…), cada ano inteiro e cada mês. */
function SeletorPeriodoPainel({ anos, valor, aoMudar, rotulo = "Período" }) {
  return (
    <select className="entrada" value={valor} onChange={(e) => aoMudar(e.target.value)} aria-label={rotulo}>
      <optgroup label="Período">
        {PERIODOS.map(([v, rot]) => <option key={v} value={v}>{rot}</option>)}
      </optgroup>
      {anos.length > 0 && (
        <optgroup label="Ano inteiro">
          {anos.map((a) => <option key={a} value={a}>Ano {a}</option>)}
        </optgroup>
      )}
      {anos.map((a) => (
        <optgroup key={`m${a}`} label={`Meses de ${a}`}>
          {NOMES_MESES.map((m, i) => <option key={m} value={`${a}-${String(i + 1).padStart(2, "0")}`}>{m}/{a}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

/** Nome do período para os títulos ("Ano 2025", "out/2025", "Este mês"…). */
function nomePeriodo(p) {
  if (/^\d{4}$/.test(p)) return `Ano ${p}`;
  if (/^\d{4}-\d{2}$/.test(p)) return mesLegivel(p);
  return PERIODOS.find(([v]) => v === p)?.[1] ?? p;
}

/** Do bruto ao líquido, como o DASHBOARD da planilha de laranja. */
function BrutoAoLiquido({ t }) {
  const linhas = [
    ["Venda bruta", t.bruto, ""],
    ["Descontos (refugo)", -t.desconto, ""],
    ["Custo de colheita / carregamento", -t.custoColheita, ""],
    ["Juros / antecipação", -t.juros, ""],
    ["Frete e comissão", -t.outrosDescontos, ""],
    ["Venda líquida", t.liquido, "total"],
  ].filter(([, v, tipo]) => tipo || Math.abs(v) >= 0.01);
  const porT = (v) => (t.kg ? `${brl(v / (t.kg / 1000))}/t` : "");
  return (
    <table className="cascata">
      <tbody>
        {linhas.map(([rot, v, tipo]) => (
          <tr key={rot} className={tipo}>
            <td>{rot}</td>
            <td className={`num ${v < 0 ? "negativo" : ""}`}>{brl(v)}</td>
            <td className="num apagado">{porT(Math.abs(v))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Abas ───────────────────────────────────────────────────────────────────

function Resumo({ dados, r, irPara }) {
  const alertas = useMemo(() => {
    const lista = [];
    const hojeIso = diaISO(0);
    const em7 = diaISO(7);
    const tanque = diesel(dados);
    for (const m of dados.maquinas.filter((x) => x.ativo !== false)) {
      const s = situacaoRevisao(dados, m);
      const un = m.medidor === "km" ? "km" : "h";
      if (s.estado === "vencida") lista.push({ tipo: "ruim", texto: `${m.nome}: revisão vencida há ${leitura(-s.faltam)} ${un}`, ir: "maquinas" });
      if (s.estado === "proxima") lista.push({ tipo: "atencao", texto: `${m.nome}: revisão em ${leitura(s.faltam)} ${un}`, ir: "maquinas" });
    }
    for (const x of estoqueInsumos(dados)) {
      if (x.negativo) lista.push({ tipo: "ruim", texto: `${x.insumo.nome}: estoque negativo (${numero(x.saldo)} ${x.insumo.unidade}) — falta lançar entrada`, ir: "quimicos" });
      else if (x.baixo) lista.push({ tipo: "atencao", texto: `${x.insumo.nome}: estoque baixo (${numero(x.saldo)} ${x.insumo.unidade})`, ir: "quimicos" });
    }
    const aConferir = dados.insumo_entradas.filter((e) => e.a_conferir).length;
    if (aConferir) lista.push({ tipo: "atencao", texto: `${aConferir} entrada(s) de produto lançada(s) no depósito sem preço — falta conferir`, ir: "quimicos" });
    const ticketsCampo = dados.vendas.filter((v) => v.a_conferir).length;
    if (ticketsCampo) lista.push({ tipo: "atencao", texto: `${ticketsCampo} ticket(s) da balança lançado(s) pelos funcionários aguardando aprovação`, ir: "ticket" });
    for (const o of dados.pulverizacoes.filter((x) => x.situacao === "aberta")) {
      lista.push({ tipo: "atencao", texto: `${o.titulo ? `${o.titulo} — ` : ""}Pulverização em ${nomesTalhoesDaOrdem(dados, o)} (${data(o.data)}) esperando separar no depósito`, ir: "quimicos" });
    }
    if (tanque.litrosEntrada && tanque.saldo < 0) lista.push({ tipo: "ruim", texto: `Tanque de diesel negativo (${numero(tanque.saldo, 0)} L) — falta lançar compra`, ir: "diesel" });
    for (const d of dados.despesas.filter((x) => !x.pago && x.vencimento)) {
      if (d.vencimento < hojeIso) lista.push({ tipo: "ruim", texto: `Conta vencida ${data(d.vencimento)}: ${d.descricao} — ${brl(d.valor)}`, ir: "financeiro" });
      else if (d.vencimento <= em7) lista.push({ tipo: "atencao", texto: `Vence ${data(d.vencimento)}: ${d.descricao} — ${brl(d.valor)}`, ir: "financeiro" });
    }
    for (const b of dados.boletos.filter((x) => !x.pago && x.vencimento)) {
      if (b.vencimento < hojeIso) lista.push({ tipo: "ruim", texto: `Pagamento vencido ${data(b.vencimento)}: ${b.empresa} — ${brl(b.valor)} (${b.forma_pagamento || "Boleto"})`, ir: "boletos" });
      else if (b.vencimento <= em7) lista.push({ tipo: "atencao", texto: `Pagamento vence ${data(b.vencimento)}: ${b.empresa} — ${brl(b.valor)} (${b.forma_pagamento || "Boleto"})`, ir: "boletos" });
    }
    return lista;
  }, [dados]);

  const tanque = diesel(dados);
  const totalReceber = soma(aReceber(dados).filter((x) => x.saldo > 0), (x) => x.saldo);
  const caixa = r.entradas.total - r.saidas.total;
  const resultado = r.totais.liquido - r.totais.custo;
  const categorias = Object.entries(r.saidas.porCategoria).map(([rotulo, valor]) => ({ rotulo, valor })).sort((a, b) => b.valor - a.valor);

  return (
    <>
      <div className="grade">
        <Stat rotulo="Vendas (líquido)" valor={brl(r.totais.liquido)} sub={`${r.totais.cargas} ${r.totais.cargas === 1 ? "carga" : "cargas"} · ${toneladas(r.totais.kg)}`} cor="laranja" />
        <Stat rotulo="Venda bruta" valor={brl(r.totais.bruto)} sub={r.totais.kg ? `preço bruto ${brl(r.totais.bruto / (r.totais.kg / 1000))}/t` : undefined} />
        <Stat rotulo="Preço médio líquido" valor={r.totais.kg ? `${brl(r.totais.liquido / (r.totais.kg / 1000))}/t` : "—"} sub="depois de descontos, colheita e juros" />
        <Stat rotulo="Custo apropriado" valor={brl(r.totais.custo)} sub="despesas (inclusive retiradas e investimentos) + químicos + diesel" cor="vermelho" />
        <Stat rotulo="Resultado (vendas − custo)" valor={brl(resultado)} cor={resultado < 0 ? "vermelho" : ""} sub={r.totais.liquido ? `margem ${numero((resultado / r.totais.liquido) * 100, 1)}%` : undefined} />
        <Stat rotulo="Entrou no caixa" valor={brl(r.entradas.total)} sub="recebimentos + fretes + aditivos" />
        <Stat rotulo="Saiu do caixa" valor={brl(r.saidas.total)} sub="despesas + diesel + insumos + peças" cor="vermelho" />
        <Stat rotulo="Saldo de caixa" valor={brl(caixa)} cor={caixa < 0 ? "vermelho" : ""} />
        <Stat rotulo="A receber (total)" valor={brl(totalReceber)} sub="vendas − recebimentos, tudo" cor="laranja" />
        <Stat rotulo="Diesel no tanque" valor={`${numero(tanque.saldo, 0)} L`} sub={tanque.precoMedio ? `preço médio ${brl(tanque.precoMedio)}/L` : "sem compras lançadas"} cor="cinza" />
      </div>

      <div className="grade-2">
        <div className="cartao">
          <h2>Vendas por mês (R$ líquido)</h2>
          <Colunas itens={r.meses} series={[{ nome: "Vendas", cor: COR_A, valor: (m) => m.liquido }]} />
        </div>
        <div className="cartao">
          <h2>Caixa por mês: entrou × saiu</h2>
          <Colunas itens={r.meses} series={[
            { nome: "Entrou", cor: COR_A, valor: (m) => m.entrou },
            { nome: "Saiu", cor: COR_B, valor: (m) => m.saiu },
          ]} />
        </div>
        <div className="cartao">
          <h2>Das vendas: do bruto ao líquido</h2>
          <BrutoAoLiquido t={r.totais} />
        </div>
        <div className="cartao">
          <h2>Avisos</h2>
          {alertas.length === 0 ? <div className="vazio">Tudo em dia.</div> : (
            <ul className="lista-alertas">
              {alertas.slice(0, 15).map((a, i) => (
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
          <h2>Vendas por cultura</h2>
          <Ranking itens={r.culturas.map((c) => ({ rotulo: c.nome, valor: c.liquido, sub: `${c.cargas} cargas · ${toneladas(c.kg)}` }))} cor="var(--laranja)" />
        </div>
        <div className="cartao">
          <h2>Saídas por categoria</h2>
          <Ranking itens={categorias} cor={COR_B} limite={20} />
        </div>
        <div className="cartao">
          <h2>Talhões que mais produziram</h2>
          <Ranking itens={r.talhoes.map((t) => ({ rotulo: t.nome, valor: t.kg, sub: t.kgPe ? `${numero(t.kgPe, 1)} kg/pé · ${numero(t.cxPe, 2)} cx/pé` : t.tHa ? `${numero(t.tHa, 1)} t/ha` : undefined }))} formato={F.t} limite={8} />
        </div>
      </div>
    </>
  );
}

function PorCultura({ r }) {
  const comTipo = r.culturas.filter((c) => Object.keys(c.porClassificacao).length > 1);
  return (
    <>
      <p className="descricao">
        Uma linha por cultura. <b>Custo</b> = despesas lançadas na cultura ou nos talhões dela + químicos aplicados + diesel com talhão.
        O que foi gasto sem cultura (salário, peças, taxas…) fica em “Geral da fazenda”. Área e pés são dos talhões que estão hoje com a cultura.
      </p>
      <Tabela titulo="Resultado por cultura" arquivo="painel-por-cultura" linhas={r.culturas} colunas={[
        { rotulo: "Cultura", v: (x) => x.nome },
        { rotulo: "Cargas", v: (x) => x.cargas, f: F.n0 },
        { rotulo: "Peso", v: (x) => x.kg, f: F.t },
        { rotulo: "Preço médio", v: (x) => x.precoT, f: ou((v) => `${brl(v)}/t`) },
        { rotulo: "Bruto", v: (x) => x.bruto, f: F.brl },
        { rotulo: "Descontos", v: (x) => x.desconto, f: F.brl },
        { rotulo: "Colheita/carreg.", v: (x) => x.custoColheita, f: F.brl },
        { rotulo: "Juros", v: (x) => x.juros, f: F.brl },
        { rotulo: "Líquido", v: (x) => x.liquido, f: F.brl },
        { rotulo: "Recebido", v: (x) => x.recebido, f: F.brl },
        { rotulo: "A receber", v: (x) => x.aReceber, f: F.brl },
        { rotulo: "Custo", v: (x) => x.custo, f: F.brl },
        { rotulo: "Resultado", v: (x) => x.resultado, f: F.brl },
        { rotulo: "Margem", v: (x) => x.margem, f: F.pct },
        { rotulo: "Área", v: (x) => x.area || null, f: F.ha },
        { rotulo: "t/ha", v: (x) => x.tHa, f: F.n1 },
        { rotulo: "kg/pé", v: (x) => x.kgPe, f: F.n1 },
        { rotulo: "R$/ha", v: (x) => x.receitaHa, f: F.brl },
      ]} rodape={["Total", somaF(r.culturas, "cargas", F.n0), somaF(r.culturas, "kg", F.t), "", somaF(r.culturas, "bruto", F.brl), somaF(r.culturas, "desconto", F.brl), somaF(r.culturas, "custoColheita", F.brl), somaF(r.culturas, "juros", F.brl), somaF(r.culturas, "liquido", F.brl), somaF(r.culturas, "recebido", F.brl), somaF(r.culturas, "aReceber", F.brl), somaF(r.culturas, "custo", F.brl), somaF(r.culturas, "resultado", F.brl)]} />

      <div className="grade-2" style={{ marginTop: 16 }}>
        {comTipo.map((c) => (
          <div className="cartao" key={c.id}>
            <h2>{c.nome}: peso por tipo / classificação</h2>
            <Participacao partes={Object.entries(c.porClassificacao).map(([rotulo, valor]) => ({ rotulo, valor })).sort((a, b) => b.valor - a.valor)} />
          </div>
        ))}
        {r.culturas.filter((c) => c.custo > 0).map((c) => (
          <div className="cartao" key={`custo-${c.id}`}>
            <h2>{c.nome}: de onde vem o custo</h2>
            <Participacao formato={F.brl} partes={Object.entries(c.porOrigem).map(([rotulo, valor]) => ({ rotulo, valor })).sort((a, b) => b.valor - a.valor)} />
          </div>
        ))}
      </div>
    </>
  );
}

/** kg/pé e t/ha comparam safras: avisa quando o período junta mais de um ano. */
function AvisoVariosAnos({ r }) {
  const anos = new Set(r.vendas.map((v) => v.data?.slice(0, 4)).filter(Boolean));
  if (anos.size <= 1) return null;
  return <div className="aviso info">O período escolhido junta {anos.size} anos ({[...anos].sort().join(", ")}): kg/pé e t/ha somam as safras. Para comparar uma safra, escolha um ano só no filtro de período.</div>;
}

function PorFazenda({ r }) {
  const lista = r.fazendas.filter((f) => f.talhoes || f.kg || f.custo);
  return (
    <>
      <p className="descricao">
        Soma dos talhões de cada fazenda. <b>kg/pé</b> = peso produzido ÷ nº de pés (só dos talhões com pés cadastrados);
        <b> cx/pé</b> usa a caixa de {numero(KG_CAIXA, 1)} kg. Talhão que não produziu no período (pomar novo) não entra na média de kg/pé, t/ha e R$/ha.
        Carga vendida sem talhão aparece em “Sem fazenda informada”.
      </p>
      <AvisoVariosAnos r={r} />
      <div className="grade-2">
        <div className="cartao">
          <h2>Produção por fazenda</h2>
          <Ranking itens={lista.map((f) => ({ rotulo: f.nome, valor: f.kg, sub: `${f.talhoes} talhões · ${f.cargas} cargas` }))} formato={F.t} />
        </div>
        <div className="cartao">
          <h2>kg por pé, por fazenda</h2>
          <Ranking itens={lista.map((f) => ({ rotulo: f.nome, valor: f.kgPe, sub: f.pes ? `${numero(f.pes, 0)} pés · ${numero(f.cxPe, 2)} cx/pé` : undefined }))} formato={ou((v) => `${numero(v, 1)} kg/pé`)} cor="var(--laranja)" />
        </div>
      </div>
      <div style={{ marginTop: 16 }}>
        <Tabela titulo="Resultado por fazenda" arquivo="painel-por-fazenda" linhas={lista} ordemInicial={[5, true]} colunas={[
          { rotulo: "Fazenda", v: (x) => x.nome },
          { rotulo: "Talhões", v: (x) => x.talhoes, f: F.n0 },
          { rotulo: "Área", v: (x) => x.area || null, f: F.ha },
          { rotulo: "Pés", v: (x) => x.pes || null, f: F.n0 },
          { rotulo: "Cargas", v: (x) => x.cargas, f: F.n0 },
          { rotulo: "Produção", v: (x) => x.kg, f: F.t },
          { rotulo: "kg/pé", v: (x) => x.kgPe, f: F.n1 },
          { rotulo: "cx/pé", v: (x) => x.cxPe, f: F.n2 },
          { rotulo: "t/ha", v: (x) => x.tHa, f: F.n1 },
          { rotulo: "sc/ha", v: (x) => x.scHa, f: F.n1 },
          { rotulo: "R$/t", v: (x) => x.precoT, f: F.brl },
          { rotulo: "Vendas", v: (x) => x.liquido, f: F.brl },
          { rotulo: "R$/ha", v: (x) => x.receitaHa, f: F.brl },
          { rotulo: "Custo", v: (x) => x.custo, f: F.brl },
          { rotulo: "Custo/ha", v: (x) => x.custoHa, f: F.brl },
          { rotulo: "Resultado", v: (x) => x.resultado, f: F.brl },
        ]} rodape={["Total", somaF(lista, "talhoes", F.n0), somaF(lista, "area", F.ha), somaF(lista, "pes", F.n0), somaF(lista, "cargas", F.n0), somaF(lista, "kg", F.t), "", "", "", "", "", somaF(lista, "liquido", F.brl), "", somaF(lista, "custo", F.brl), "", somaF(lista, "resultado", F.brl)]} />
      </div>
    </>
  );
}

function PorTalhao({ dados, r }) {
  const nomeFazenda = (id) => dados.fazendas.find((f) => f.id === id)?.nome ?? "—";
  const nomeCulturas = (ids) => ids.map((id) => dados.culturas.find((c) => c.id === id)?.nome).filter(Boolean).join(", ") || "—";
  const tipos = [...new Set(r.talhoes.flatMap((t) => Object.keys(t.porClassificacao)))].filter((t) => t !== "Grão" && t !== "Silagem").sort();
  return (
    <>
      <p className="descricao">
        <b>Produção</b> = o maior entre o peso das cargas vendidas daquele talhão e o lançado em Colheitas (não soma os dois).
        Clique no título de qualquer coluna para ordenar — vira um ranking. O botão <b>Planilha</b> baixa a tabela para o Excel.
      </p>
      <AvisoVariosAnos r={r} />
      <Tabela titulo="Talhão por talhão" arquivo="painel-por-talhao" linhas={r.talhoes} ordemInicial={[6, true]} colunas={[
        { rotulo: "Talhão", v: (x) => x.nome },
        { rotulo: "Fazenda", v: (x) => nomeFazenda(x.fazenda_id) },
        { rotulo: "Cultura", v: (x) => nomeCulturas(x.culturas) },
        { rotulo: "Área", v: (x) => x.area || null, f: F.ha },
        { rotulo: "Pés", v: (x) => x.pes || null, f: F.n0 },
        { rotulo: "Cargas", v: (x) => x.cargas, f: F.n0 },
        { rotulo: "Produção", v: (x) => x.kg, f: F.t },
        { rotulo: "kg/pé", v: (x) => x.kgPe, f: F.n1 },
        { rotulo: "cx/pé", v: (x) => x.cxPe, f: F.n2 },
        { rotulo: "t/ha", v: (x) => x.tHa, f: F.n1 },
        { rotulo: "sc/ha", v: (x) => x.scHa, f: F.n1 },
        ...tipos.map((tipo) => ({ rotulo: `% ${tipo}`, v: (x) => (x.kgVendido && tipos.some((t) => x.porClassificacao[t]) ? ((x.porClassificacao[tipo] ?? 0) / x.kgVendido) * 100 : null), f: F.pct })),
        { rotulo: "R$/t", v: (x) => x.precoT, f: F.brl },
        { rotulo: "Vendas", v: (x) => x.liquido, f: F.brl },
        { rotulo: "R$/ha", v: (x) => x.receitaHa, f: F.brl },
        { rotulo: "Custo", v: (x) => x.custo, f: F.brl },
        { rotulo: "Resultado", v: (x) => x.resultado, f: F.brl },
      ]} rodape={["Total", "", "", somaF(r.talhoes, "area", F.ha), somaF(r.talhoes, "pes", F.n0), somaF(r.talhoes, "cargas", F.n0), somaF(r.talhoes, "kg", F.t), ...Array(4 + tipos.length).fill(""), "", somaF(r.talhoes, "liquido", F.brl), "", somaF(r.talhoes, "custo", F.brl), somaF(r.talhoes, "resultado", F.brl)]} />
    </>
  );
}

function Rankings({ r }) {
  const aviso = <AvisoVariosAnos r={r} />;
  const comPe = r.talhoes.filter((t) => t.talhao && t.kgPe);
  const comArea = r.talhoes.filter((t) => t.talhao && t.tHa);
  return (
    <>
      {aviso}
      <div className="grade-2">
        <div className="cartao">
          <h2>Talhões: kg por pé</h2>
          <Ranking itens={[...comPe].sort((a, b) => b.kgPe - a.kgPe).map((t) => ({ rotulo: t.nome, valor: t.kgPe, sub: `${numero(t.cxPe, 2)} cx/pé · ${numero(t.pes, 0)} pés · ${toneladas(t.kg)}` }))} formato={ou((v) => `${numero(v, 1)} kg/pé`)} limite={30} />
        </div>
        <div className="cartao">
          <h2>Talhões: toneladas por hectare</h2>
          <Ranking itens={[...comArea].sort((a, b) => b.tHa - a.tHa).map((t) => ({ rotulo: t.nome, valor: t.tHa, sub: `${numero(t.area, 1)} ha · ${numero(t.scHa, 0)} sc/ha` }))} formato={ou((v) => `${numero(v, 1)} t/ha`)} limite={30} />
        </div>
        <div className="cartao">
          <h2>Talhões: faturamento líquido</h2>
          <Ranking itens={[...r.talhoes].sort((a, b) => b.liquido - a.liquido).map((t) => ({ rotulo: t.nome, valor: t.liquido, sub: t.receitaHa ? `${brl(t.receitaHa)}/ha` : undefined }))} cor="var(--laranja)" limite={30} />
        </div>
        <div className="cartao">
          <h2>Talhões: preço médio recebido (R$/t)</h2>
          <Ranking itens={r.talhoes.filter((t) => t.precoT).sort((a, b) => b.precoT - a.precoT).map((t) => ({ rotulo: t.nome, valor: t.precoT, sub: `${t.cargas} cargas` }))} cor="var(--laranja)" limite={30} />
        </div>
        <div className="cartao">
          <h2>Compradores: quem mais comprou</h2>
          <Ranking itens={[...r.compradores].sort((a, b) => b.liquido - a.liquido).map((c) => ({ rotulo: c.nome, valor: c.liquido, sub: `${c.cargas} cargas · ${toneladas(c.kg)}${c.precoT ? ` · ${brl(c.precoT)}/t` : ""}` }))} limite={15} />
        </div>
        <div className="cartao">
          <h2>Compradores: quem mais deve (no período)</h2>
          <Ranking itens={[...r.compradores].sort((a, b) => b.saldo - a.saldo).map((c) => ({ rotulo: c.nome, valor: c.saldo, sub: `vendido ${brl(c.liquido)} · recebido ${brl(c.recebido)}` }))} cor={COR_B} limite={15} />
        </div>
        <div className="cartao">
          <h2>Para quem a fazenda mais pagou</h2>
          <Ranking itens={[...r.favorecidos].sort((a, b) => b.valor - a.valor).map((f) => ({ rotulo: f.nome, valor: f.valor, sub: `${f.vezes} pagamentos · ${Object.entries(f.categorias).sort((a, b) => b[1] - a[1])[0][0]}` }))} cor={COR_B} limite={15} />
        </div>
        <div className="cartao">
          <h2>Maiores despesas do período</h2>
          <Ranking itens={[...r.saidas.linhas].sort((a, b) => b.valor - a.valor).slice(0, 15).map((l) => ({ rotulo: `${data(l.data)} · ${l.descricao || l.categoria}`, valor: l.valor, sub: [l.categoria, l.favorecido].filter(Boolean).join(" · ") }))} cor={COR_B} limite={15} />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <Tabela titulo="Compradores" arquivo="painel-compradores" linhas={r.compradores} ordemInicial={[3, true]} colunas={[
            { rotulo: "Comprador", v: (x) => x.nome },
            { rotulo: "Cargas", v: (x) => x.cargas, f: F.n0 },
            { rotulo: "Peso", v: (x) => x.kg, f: F.t },
            { rotulo: "Vendido", v: (x) => x.liquido, f: F.brl },
            { rotulo: "R$/t", v: (x) => x.precoT, f: F.brl },
            { rotulo: "Recebido", v: (x) => x.recebido, f: F.brl },
            { rotulo: "Saldo", v: (x) => x.saldo, f: F.brl },
          ]} rodape={["Total", somaF(r.compradores, "cargas", F.n0), somaF(r.compradores, "kg", F.t), somaF(r.compradores, "liquido", F.brl), "", somaF(r.compradores, "recebido", F.brl), somaF(r.compradores, "saldo", F.brl)]} />
        </div>
      </div>
    </>
  );
}

function PorMes({ dados, r }) {
  const meses = r.meses;
  // Talhões que tiveram carga no período, do que mais produziu para o que menos.
  const talhoesMes = [...new Set(meses.flatMap((m) => Object.keys(m.porTalhao)))]
    .map((id) => ({ id, nome: id === "sem" ? "Sem talhão" : dados.talhoes.find((t) => t.id === id)?.nome ?? "(apagado)", total: soma(meses, (m) => m.porTalhao[id]) }))
    .sort((a, b) => b.total - a.total);
  const categorias = [...new Set(meses.flatMap((m) => Object.keys(m.porCategoria)))]
    .map((c) => ({ c, total: soma(meses, (m) => m.porCategoria[c]) }))
    .sort((a, b) => b.total - a.total);
  const linhasTalhao = talhoesMes.map((t) => ({ id: t.id, nome: t.nome, total: t.total, ...Object.fromEntries(meses.map((m) => [m.mes, m.porTalhao[t.id] ?? 0])) }));
  const linhasCategoria = categorias.map(({ c, total }) => ({ id: c, nome: c, total, ...Object.fromEntries(meses.map((m) => [m.mes, m.porCategoria[c] ?? 0])) }));
  const vazioZero = (f) => (v) => (v ? f(v) : "—");

  return (
    <>
      <div className="grade-2">
        <div className="cartao">
          <h2>Toneladas vendidas por mês</h2>
          <Colunas itens={meses} series={[{ nome: "Peso", cor: COR_A, valor: (m) => m.kg }]} formato={F.t} />
        </div>
        <div className="cartao">
          <h2>Vendas × custo apropriado, por mês</h2>
          <Colunas itens={meses} series={[
            { nome: "Vendas", cor: COR_A, valor: (m) => m.liquido },
            { nome: "Custo", cor: COR_B, valor: (m) => m.custo },
          ]} />
        </div>
      </div>
      <div style={{ marginTop: 16 }}>
        <Tabela titulo="Mês a mês" arquivo="painel-por-mes" linhas={meses} colunas={[
          { rotulo: "Mês", v: (x) => x.mes, f: (v) => mesLegivel(v) },
          { rotulo: "Cargas", v: (x) => x.cargas, f: F.n0 },
          { rotulo: "Peso", v: (x) => x.kg, f: F.t },
          { rotulo: "Vendas", v: (x) => x.liquido, f: F.brl },
          { rotulo: "R$/t", v: (x) => (x.kg ? x.liquido / (x.kg / 1000) : null), f: F.brl },
          { rotulo: "Custo", v: (x) => x.custo, f: F.brl },
          { rotulo: "Vendas − custo", v: (x) => x.liquido - x.custo, f: F.brl },
          { rotulo: "Recebido", v: (x) => x.recebido, f: F.brl },
          { rotulo: "Entrou (caixa)", v: (x) => x.entrou, f: F.brl },
          { rotulo: "Saiu (caixa)", v: (x) => x.saiu, f: F.brl },
          { rotulo: "Saldo do mês", v: (x) => x.caixa, f: F.brl },
          { rotulo: "Acumulado", v: (x) => x.acumulado, f: F.brl },
        ]} rodape={["Total", somaF(meses, "cargas", F.n0), somaF(meses, "kg", F.t), somaF(meses, "liquido", F.brl), "", somaF(meses, "custo", F.brl), F.brl(soma(meses, (m) => m.liquido - m.custo)), somaF(meses, "recebido", F.brl), somaF(meses, "entrou", F.brl), somaF(meses, "saiu", F.brl), somaF(meses, "caixa", F.brl), ""]} />
      </div>
      <div style={{ marginTop: 16 }}>
        <Tabela titulo="Produção por talhão e mês (toneladas)" arquivo="painel-talhao-por-mes" linhas={linhasTalhao} vazio="Nenhuma carga no período." colunas={[
          { rotulo: "Talhão", v: (x) => x.nome },
          ...meses.map((m) => ({ rotulo: mesLegivel(m.mes), v: (x) => x[m.mes] / 1000, f: vazioZero((v) => numero(v, 1)) })),
          { rotulo: "Total", v: (x) => x.total / 1000, f: (v) => numero(v, 1) },
        ]} rodape={["Total", ...meses.map((m) => numero(m.kg / 1000, 1)), numero(soma(meses, (m) => m.kg) / 1000, 1)]} />
      </div>
      <div style={{ marginTop: 16 }}>
        <Tabela titulo="Saídas de caixa por categoria e mês" arquivo="painel-despesas-por-mes" linhas={linhasCategoria} vazio="Nenhuma saída no período." colunas={[
          { rotulo: "Categoria", v: (x) => x.nome },
          ...meses.map((m) => ({ rotulo: mesLegivel(m.mes), v: (x) => x[m.mes], f: vazioZero(brl) })),
          { rotulo: "Total", v: (x) => x.total, f: brl },
        ]} rodape={["Total", ...meses.map((m) => brl(m.saiu)), brl(soma(meses, (m) => m.saiu))]} />
      </div>
    </>
  );
}

/**
 * Compara dois períodos com os mesmos filtros de cultura e fazenda, como a aba
 * COMPARATIVO da planilha. O período A é o do filtro de cima.
 */
function Comparativo({ dados, r, filtros, anos }) {
  // Começa no ano anterior ao do filtro de cima (ou no outro ano com dados).
  const [periodoB, setPeriodoB] = useState(() => {
    const anterior = /^\d{4}$/.test(filtros.periodo) ? String(Number(filtros.periodo) - 1) : null;
    return anos.includes(anterior) ? anterior : anos.find((a) => a !== filtros.periodo) ?? "mes_passado";
  });
  const b = useMemo(() => indicadores(dados, { ...filtros, periodo: periodoB }), [dados, filtros, periodoB]);
  const a = r;
  const nA = nomePeriodo(filtros.periodo), nB = nomePeriodo(periodoB);
  const porT = (x) => (x.kg ? x.bruto / (x.kg / 1000) : null);
  const porTLiq = (x) => (x.kg ? x.liquido / (x.kg / 1000) : null);
  const ind = [
    ["Volume vendido", (x) => x.totais.kg, F.t],
    ["Cargas", (x) => x.totais.cargas, F.n0],
    ["Venda bruta", (x) => x.totais.bruto, F.brl],
    ["Descontos (refugo)", (x) => x.totais.desconto, F.brl],
    ["Venda após desconto", (x) => x.totais.bruto - x.totais.desconto, F.brl],
    ["Preço bruto (R$/t)", (x) => porT(x.totais), F.brl],
    ["Custo de colheita / carregamento", (x) => x.totais.custoColheita, F.brl],
    ["Juros / antecipação", (x) => x.totais.juros, F.brl],
    ["Venda líquida", (x) => x.totais.liquido, F.brl],
    ["Preço líquido (R$/t)", (x) => porTLiq(x.totais), F.brl],
    ["Recebido dos compradores", (x) => x.totais.recebido, F.brl],
    ["Custo apropriado", (x) => x.totais.custo, F.brl],
    ["Entrou no caixa", (x) => x.totais.entradas, F.brl],
    ["Saiu do caixa", (x) => x.totais.saidas, F.brl],
  ].map(([nome, v, f]) => ({ id: nome, nome, a: v(a), b: v(b), f }));
  const varia = (x) => (x.a && x.b != null ? ((x.b - x.a) / Math.abs(x.a)) * 100 : null);

  const juntar = (la, lb, chave) => {
    const m = new Map();
    for (const x of la) m.set(x[chave], { id: x[chave], nome: x.nome, a: x, b: null });
    for (const x of lb) {
      if (m.has(x[chave])) m.get(x[chave]).b = x;
      else m.set(x[chave], { id: x[chave], nome: x.nome, a: null, b: x });
    }
    return [...m.values()];
  };
  const culturas = juntar(a.culturas.filter((c) => c.cargas), b.culturas.filter((c) => c.cargas), "id");
  const talhoes = juntar(a.talhoes.filter((t) => t.talhao && t.kg), b.talhoes.filter((t) => t.talhao && t.kg), "id");
  const dif = (fa, fb) => (x) => (fa(x) != null && fb(x) != null ? fb(x) - fa(x) : null);

  return (
    <>
      <div className="barra filtros-painel">
        <span>Comparar <b>{nA}</b> (filtro de cima) com</span>
        <SeletorPeriodoPainel anos={anos} valor={periodoB} aoMudar={setPeriodoB} rotulo="Período B" />
      </div>
      <p className="descricao">
        Mesma cultura e fazenda nos dois lados. Mês em andamento ainda não está fechado: compare com cuidado.
        Em 2025 a planilha de laranja não separava o custo de colheita e os juros como em 2026 — para comparar safras, use a venda bruta e o preço bruto.
      </p>
      <Tabela titulo={`${nA} × ${nB}`} arquivo="painel-comparativo" linhas={ind} colunas={[
        { rotulo: "Indicador", v: (x) => x.nome },
        { rotulo: nA, v: (x) => x.a, f: F.n2, fl: (x) => x.f(x.a) },
        { rotulo: nB, v: (x) => x.b, f: F.n2, fl: (x) => x.f(x.b) },
        { rotulo: "Diferença", v: (x) => (x.a != null && x.b != null ? x.b - x.a : null), f: F.n2, fl: (x) => (x.a != null && x.b != null ? x.f(x.b - x.a) : "—") },
        { rotulo: "Variação", v: varia, f: F.pct },
      ]} />
      <div style={{ marginTop: 16 }}>
        <Tabela titulo="Por cultura" arquivo="painel-comparativo-culturas" linhas={culturas} vazio="Nenhuma venda nos dois períodos." colunas={[
          { rotulo: "Cultura", v: (x) => x.nome },
          { rotulo: `Peso ${nA}`, v: (x) => x.a?.kg ?? null, f: F.t },
          { rotulo: `Peso ${nB}`, v: (x) => x.b?.kg ?? null, f: F.t },
          { rotulo: `Bruto ${nA}`, v: (x) => x.a?.bruto ?? null, f: F.brl },
          { rotulo: `Bruto ${nB}`, v: (x) => x.b?.bruto ?? null, f: F.brl },
          { rotulo: `R$/t bruto ${nA}`, v: (x) => (x.a ? porT(x.a) : null), f: F.brl },
          { rotulo: `R$/t bruto ${nB}`, v: (x) => (x.b ? porT(x.b) : null), f: F.brl },
          { rotulo: "Variação do bruto", v: (x) => (x.a?.bruto && x.b ? ((x.b.bruto - x.a.bruto) / x.a.bruto) * 100 : null), f: F.pct },
        ]} />
      </div>
      <div style={{ marginTop: 16 }}>
        <Tabela titulo="Por talhão: produção e kg/pé" arquivo="painel-comparativo-talhoes" linhas={talhoes} ordemInicial={[2, true]} vazio="Nenhuma produção nos dois períodos." colunas={[
          { rotulo: "Talhão", v: (x) => x.nome },
          { rotulo: `Produção ${nA}`, v: (x) => x.a?.kg ?? null, f: F.t },
          { rotulo: `Produção ${nB}`, v: (x) => x.b?.kg ?? null, f: F.t },
          { rotulo: `kg/pé ${nA}`, v: (x) => x.a?.kgPe ?? null, f: F.n1 },
          { rotulo: `kg/pé ${nB}`, v: (x) => x.b?.kgPe ?? null, f: F.n1 },
          { rotulo: "Diferença kg/pé", v: dif((x) => x.a?.kgPe ?? null, (x) => x.b?.kgPe ?? null), f: F.n1 },
          { rotulo: `t/ha ${nA}`, v: (x) => x.a?.tHa ?? null, f: F.n1 },
          { rotulo: `t/ha ${nB}`, v: (x) => x.b?.tHa ?? null, f: F.n1 },
        ]} />
      </div>
    </>
  );
}

// ─── Painel ─────────────────────────────────────────────────────────────────

const ABAS = [
  ["resumo", "Resumo", Resumo], ["cultura", "Por cultura", PorCultura], ["fazenda", "Por fazenda", PorFazenda],
  ["talhao", "Por talhão", PorTalhao], ["rankings", "Rankings", Rankings], ["mes", "Por mês", PorMes],
  ["comparativo", "Comparativo", Comparativo],
];

function lerAba() {
  try { return localStorage.getItem("painel-aba") || "resumo"; } catch { return "resumo"; }
}

export default function Painel({ dados, irPara }) {
  const anos = useMemo(() => anosComDados(dados), [dados]);
  const [periodo, setPeriodo] = useState(() => anos[0] ?? "ano");
  // A cultura é a escolhida no alto da tela (vale para o app todo).
  const { cultura } = useCulturaAtiva();
  const [fazenda, setFazenda] = useState("");
  const [aba, setAba] = useState(lerAba);

  const trocarAba = (id) => {
    setAba(id);
    try { localStorage.setItem("painel-aba", id); } catch { /* sem armazenamento: só não lembra a aba */ }
  };

  const filtros = useMemo(() => ({ periodo, cultura, fazenda }), [periodo, cultura, fazenda]);
  const r = useMemo(() => indicadores(dados, filtros), [dados, filtros]);
  const [de, ate] = intervalo(periodo);
  const Conteudo = (ABAS.find(([id]) => id === aba) ?? ABAS[0])[2];

  return (
    <>
      <div className="barra filtros-painel">
        <SeletorPeriodoPainel anos={anos} valor={periodo} aoMudar={setPeriodo} />
        <select className="entrada" value={fazenda} onChange={(e) => setFazenda(e.target.value)} aria-label="Fazenda">
          <option value="">Todas as fazendas</option>
          {dados.fazendas.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
        </select>
        <span className="espaco" />
        <small className="apagado">{de ? `${data(de)} a ${data(ate)}` : "Todo o histórico"}</small>
      </div>

      <Abas abas={ABAS.map(([id, rot]) => [id, rot])} atual={aba} aoTrocar={trocarAba} />
      <Conteudo dados={dados} r={r} irPara={irPara} filtros={filtros} anos={anos} />
    </>
  );
}
