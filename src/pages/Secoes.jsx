import { useMemo, useState } from "react";

import Crud from "../components/Crud";
import { Abas, Icone, SeletorPeriodo, Stat, TabelaSimples } from "../components/ui";
import {
  PERIODOS, aReceber, consumoPorMaquina, custos, diesel, entradasDoPeriodo, estoqueInsumos,
  noPeriodo, resumoFretes, resumoPlanejamento, saidasDoPeriodo, situacaoRevisao, soma,
} from "../lib/calculos";
import { ESQUEMA, hoje, prepararRegistro } from "../lib/esquema";
import { brl, data, nomeRef, numero } from "../lib/formato";
import { gerarPlanilhaAgronomo } from "../lib/planilhaAgronomo";

/**
 * Uma seção do menu = abas. Cada aba é uma coleção (vira a tela padrão de
 * cadastro) ou um relatório próprio.
 */
function Secao({ abas, props }) {
  const [atual, setAtual] = useState(abas[0][0]);
  const aba = abas.find(([id]) => id === atual) ?? abas[0];
  const [id, , conteudo] = aba;
  const Relatorio = typeof conteudo === "function" ? conteudo : null;
  return (
    <>
      <Abas abas={abas.map(([i, rotulo]) => [i, rotulo])} atual={id} aoTrocar={setAtual} />
      {Relatorio
        ? <Relatorio key={id} {...props} />
        : <Crud key={id} colecao={conteudo?.colecao ?? id} {...props} {...(conteudo ?? {})} />}
    </>
  );
}

const unidadeDe = (m) => (m.medidor === "km" ? "km" : "h");

// ─── Lavoura ────────────────────────────────────────────────────────────────

function Planejamento(props) {
  const { dados } = props;
  const resumo = resumoPlanejamento(dados);
  return (
    <>
      {resumo.length > 0 && (
        <div className="grade">
          {resumo.map((s) => (
            <Stat key={s.safra} rotulo={s.safra} valor={brl(s.total)}
              sub={s.porHa ? `${numero(s.hectares)} ha · ${brl(s.porHa)}/ha` : `${s.itens} itens`} />
          ))}
        </div>
      )}
      <Crud colecao="planejamento" {...props} />
    </>
  );
}

export function Lavoura(props) {
  return (
    <Secao props={props} abas={[
      ["talhoes", "Talhões / sítios"],
      ["colheitas", "Colheitas"],
      ["planejamento", "Planejamento da safra", Planejamento],
      ["fazendas", "Fazendas"],
      ["culturas", "Culturas"],
    ]} />
  );
}

// ─── Máquinas ───────────────────────────────────────────────────────────────

function SituacaoMaquinas({ dados }) {
  const [periodo, setPeriodo] = useState("mes");
  const consumo = new Map(consumoPorMaquina(dados, periodo).map((c) => [c.maquina.id, c]));
  const linhas = dados.maquinas
    .filter((m) => m.ativo !== false && m.medidor !== "nenhum")
    .map((m) => ({ m, s: situacaoRevisao(dados, m), c: consumo.get(m.id) }))
    .sort((a, b) => (a.s.faltam ?? Infinity) - (b.s.faltam ?? Infinity));
  const selo = { vencida: ["ruim", "Vencida"], proxima: ["atencao", "Próxima"], ok: ["ok", "Em dia"], sem: ["neutro", "Sem intervalo"] };
  return (
    <div className="cartao">
      <p className="descricao">
        Leitura atual = a maior entre cadastro, operações, abastecimentos e revisões. A próxima revisão é a última
        revisão/troca de óleo + o intervalo do cadastro.
      </p>
      <div className="barra"><span>Consumo no período:</span><SeletorPeriodo periodos={PERIODOS} valor={periodo} aoMudar={setPeriodo} /></div>
      <TabelaSimples
        vazio="Cadastre as máquinas na aba Cadastro."
        linhas={linhas.map((l) => ({ ...l, id: l.m.id }))}
        colunas={[
          { rotulo: "Máquina", valor: (l) => l.m.nome },
          { rotulo: "Leitura atual", num: true, valor: (l) => `${numero(l.s.atual, 1)} ${unidadeDe(l.m)}` },
          { rotulo: "Próxima revisão", num: true, valor: (l) => (l.s.proxima ? `${numero(l.s.proxima, 0)} ${unidadeDe(l.m)}` : "—") },
          { rotulo: "Faltam", num: true, valor: (l) => (l.s.faltam == null ? "—" : `${numero(l.s.faltam, 0)} ${unidadeDe(l.m)}`) },
          { rotulo: "Revisão", valor: (l) => <span className={`selo ${selo[l.s.estado][0]}`}>{selo[l.s.estado][1]}</span> },
          { rotulo: "Trabalhado", num: true, valor: (l) => (l.c ? `${numero(l.c.trabalhado, 1)} ${unidadeDe(l.m)}` : "—") },
          { rotulo: "Diesel", num: true, valor: (l) => (l.c ? `${numero(l.c.litros, 0)} L` : "—") },
          { rotulo: "Consumo", num: true, valor: (l) => (l.c?.media ? (l.m.medidor === "km" ? `${numero(l.c.media, 2)} km/L` : `${numero(l.c.media, 2)} L/h`) : "—") },
        ]}
      />
    </div>
  );
}

export function Maquinas(props) {
  return (
    <Secao props={props} abas={[
      ["situacao", "Situação e revisões", SituacaoMaquinas],
      ["operacoes", "Horímetro / operações"],
      ["revisoes", "Revisões feitas"],
      ["maquinas", "Inventário"],
    ]} />
  );
}

// ─── Diesel ─────────────────────────────────────────────────────────────────

function ConsumoDiesel({ dados }) {
  const [periodo, setPeriodo] = useState("mes");
  const lista = consumoPorMaquina(dados, periodo);
  return (
    <div className="cartao">
      <div className="barra"><SeletorPeriodo periodos={PERIODOS} valor={periodo} aoMudar={setPeriodo} /></div>
      <TabelaSimples
        vazio="Nenhum abastecimento ou operação no período."
        linhas={lista.map((x) => ({ ...x, id: x.maquina.id }))}
        colunas={[
          { rotulo: "Máquina", valor: (x) => x.maquina.nome },
          { rotulo: "Litros", num: true, valor: (x) => numero(x.litros, 1) },
          { rotulo: "Trabalhado", num: true, valor: (x) => `${numero(x.trabalhado, 1)} ${unidadeDe(x.maquina)}` },
          { rotulo: "Média", num: true, valor: (x) => (x.media ? (x.maquina.medidor === "km" ? `${numero(x.media, 2)} km/L` : `${numero(x.media, 2)} L/h`) : "—") },
        ]}
        rodape={["Total", numero(soma(lista, (x) => x.litros), 1)]}
      />
    </div>
  );
}

export function Diesel(props) {
  const d = diesel(props.dados);
  return (
    <>
      <div className="grade">
        <Stat rotulo="No tanque agora" valor={`${numero(d.saldo, 0)} L`} cor={d.saldo < 0 ? "vermelho" : ""} />
        <Stat rotulo="Preço médio pago" valor={d.precoMedio ? `${brl(d.precoMedio)}/L` : "—"} cor="cinza" />
        <Stat rotulo="Total comprado" valor={`${numero(d.litrosEntrada, 0)} L`} cor="cinza" />
        <Stat rotulo="Total abastecido do tanque" valor={`${numero(d.litrosSaida, 0)} L`} cor="cinza" />
      </div>
      <Secao props={props} abas={[
        ["abastecimentos", "Abastecimentos"],
        ["diesel_entradas", "Compras (entrada no tanque)"],
        ["consumo", "Consumo por máquina", ConsumoDiesel],
      ]} />
    </>
  );
}

// ─── Químicos ───────────────────────────────────────────────────────────────

function EstoqueQuimicos({ dados }) {
  const lista = estoqueInsumos(dados).filter((x) => x.insumo.ativo !== false || x.saldo);
  const tipos = Object.fromEntries(ESQUEMA.insumos.campos.tipo.opcoes);
  const [exportando, setExportando] = useState(false);
  const exportar = async () => {
    setExportando(true);
    try {
      const linhas = [...lista].sort((a, b) => a.insumo.nome.localeCompare(b.insumo.nome)).map((x) => ({
        produto: x.insumo.nome, fabricante: x.insumo.fabricante ?? "", tipo: tipos[x.insumo.tipo] ?? "", principio: x.insumo.principio_ativo ?? "",
        unidade: x.insumo.unidade, entrou: x.entrada + x.ajuste, aplicado: x.saida, saldo: x.saldo,
        minimo: x.insumo.estoque_minimo ?? "", situacao: x.negativo ? "Negativo" : x.baixo ? "Baixo" : "OK",
        custo: Number(x.custoMedio.toFixed(2)), valor: Number(x.valorEstoque.toFixed(2)),
        observacao: x.insumo.observacao ?? "", fotos: x.insumo.fotos_rotulo ?? [],
      }));
      await gerarPlanilhaAgronomo(`estoque-agronomo-${hoje()}.xlsx`, linhas);
    } finally {
      setExportando(false);
    }
  };
  return (
    <div className="cartao">
      <div className="barra">
        <p className="descricao" style={{ margin: 0 }}>Saldo = quantidade inicial + entradas − aplicações. O custo médio vem das entradas.</p>
        <span className="espaco" />
        <button className="btn" onClick={exportar} disabled={!lista.length || exportando} title="Baixar planilha do estoque para o agrônomo">
          <Icone nome="exportar" /> {exportando ? "Gerando…" : "Planilha para o agrônomo"}
        </button>
      </div>
      <TabelaSimples
        vazio="Cadastre os produtos na aba Produtos e lance as entradas."
        linhas={lista.sort((a, b) => a.insumo.nome.localeCompare(b.insumo.nome)).map((x) => ({ ...x, id: x.insumo.id }))}
        colunas={[
          { rotulo: "Produto", valor: (x) => x.insumo.nome },
          { rotulo: "Fabricante", valor: (x) => x.insumo.fabricante ?? "—" },
          { rotulo: "Tipo", valor: (x) => tipos[x.insumo.tipo] ?? "—" },
          { rotulo: "Entrou", num: true, valor: (x) => numero(x.entrada) },
          { rotulo: "Inicial / balanço", num: true, valor: (x) => (x.ajuste ? numero(x.ajuste) : "—") },
          { rotulo: "Aplicado", num: true, valor: (x) => numero(x.saida) },
          { rotulo: "Saldo", num: true, valor: (x) => <b className={x.saldo < 0 ? "negativo" : ""}>{numero(x.saldo)} {x.insumo.unidade}</b> },
          { rotulo: "Situação", valor: (x) => (x.negativo ? <span className="selo ruim">Negativo</span> : x.baixo ? <span className="selo atencao">Baixo</span> : <span className="selo ok">OK</span>) },
          { rotulo: "Custo médio", num: true, valor: (x) => (x.custoMedio ? `${brl(x.custoMedio)}/${x.insumo.unidade}` : "—") },
          { rotulo: "Valor em estoque", num: true, valor: (x) => brl(x.valorEstoque) },
        ]}
        rodape={["Total", "", "", "", "", "", "", "", "", brl(soma(lista, (x) => x.valorEstoque))]}
      />
    </div>
  );
}

const lerNumero = (t) => {
  const v = Number(String(t).trim().replace(",", "."));
  return String(t).trim() === "" || Number.isNaN(v) ? null : v;
};

/** Conferência: o usuário informa quanto TEM de cada produto; o sistema grava a diferença. */
function BalancoEstoque({ dados, salvar }) {
  const lista = estoqueInsumos(dados).filter((x) => x.insumo.ativo !== false)
    .sort((a, b) => a.insumo.nome.localeCompare(b.insumo.nome));
  const [dataBalanco, setDataBalanco] = useState(hoje());
  const [contagem, setContagem] = useState({});
  const [custos, setCustos] = useState({});
  const [gravando, setGravando] = useState(false);
  const [msg, setMsg] = useState(null);

  const linhas = lista.map((x) => {
    const contado = lerNumero(contagem[x.insumo.id] ?? "");
    const dif = contado == null ? null : +(contado - x.saldo).toFixed(3);
    return { ...x, id: x.insumo.id, contado, dif };
  });
  const pendentes = linhas.filter((x) => x.dif);

  const gravar = async () => {
    setGravando(true);
    setMsg(null);
    try {
      for (const x of pendentes) {
        const { reg, erro } = prepararRegistro("insumo_ajustes", {
          data: dataBalanco, insumo_id: x.insumo.id, contado: x.contado, quantidade: x.dif,
          custo_unitario: x.dif > 0 ? lerNumero(custos[x.insumo.id] ?? "") : null,
          observacao: "Balanço de estoque",
        });
        if (erro) { setMsg(erro); return; }
        await salvar("insumo_ajustes", reg);
      }
      setContagem({});
      setCustos({});
      setMsg(`Balanço gravado: ${pendentes.length} produto(s) ajustado(s).`);
    } finally {
      setGravando(false);
    }
  };

  return (
    <div className="cartao">
      <p className="descricao">
        Digite em “Contagem” quanto você tem hoje de cada produto. Deixe em branco o que não quiser mexer.
        Use esta aba para conferir o estoque depois (a quantidade inicial já se informa ao cadastrar o produto). O sistema grava só a diferença — isso não conta como compra nem como despesa.
        As próximas compras entram pela aba “Entradas / compras”.
      </p>
      <div className="barra">
        <label className="campo" style={{ maxWidth: 180 }}><span>Data do balanço</span>
          <input type="date" value={dataBalanco} onChange={(e) => setDataBalanco(e.target.value)} />
        </label>
        <span className="espaco" />
        <button className="btn primario" onClick={gravar} disabled={!pendentes.length || gravando || !dataBalanco}>
          {gravando ? "Gravando…" : `Gravar balanço (${pendentes.length})`}
        </button>
      </div>
      {msg && <div className="aviso">{msg}</div>}
      <TabelaSimples
        vazio="Cadastre os produtos na aba Produtos primeiro."
        linhas={linhas}
        colunas={[
          { rotulo: "Produto", valor: (x) => x.insumo.nome },
          { rotulo: "No sistema", num: true, valor: (x) => `${numero(x.saldo)} ${x.insumo.unidade}` },
          { rotulo: "Contagem", valor: (x) => (
            <input inputMode="decimal" style={{ width: 110 }} placeholder={x.insumo.unidade}
              value={contagem[x.insumo.id] ?? ""} onChange={(e) => setContagem((c) => ({ ...c, [x.insumo.id]: e.target.value }))} />
          ) },
          { rotulo: "Diferença", num: true, valor: (x) => (x.dif == null ? "—" : <b className={x.dif < 0 ? "negativo" : ""}>{x.dif > 0 ? "+" : ""}{numero(x.dif)}</b>) },
          { rotulo: "Custo por unidade (opcional)", valor: (x) => (x.dif > 0 ? (
            <input inputMode="decimal" style={{ width: 110 }} placeholder="R$"
              value={custos[x.insumo.id] ?? ""} onChange={(e) => setCustos((c) => ({ ...c, [x.insumo.id]: e.target.value }))} />
          ) : "—") },
        ]}
      />
    </div>
  );
}

export function Quimicos(props) {
  return (
    <Secao props={props} abas={[
      ["estoque", "Estoque", EstoqueQuimicos],
      ["balanco", "Balanço / conferência", BalancoEstoque],
      ["insumo_ajustes", "Histórico de balanços"],
      ["aplicacoes", "Aplicações / saídas"],
      ["insumo_entradas", "Entradas / compras"],
      ["insumos", "Produtos"],
    ]} />
  );
}

// ─── Vendas ─────────────────────────────────────────────────────────────────

function AReceber({ dados }) {
  const lista = aReceber(dados);
  return (
    <div className="cartao">
      <p className="descricao">Por comprador: tudo o que foi vendido (valor líquido) menos tudo o que ele já pagou.</p>
      <TabelaSimples
        vazio="Nenhuma venda lançada."
        linhas={lista.map((x) => ({ ...x, id: x.comprador }))}
        colunas={[
          { rotulo: "Comprador", valor: (x) => x.comprador || "—" },
          { rotulo: "Cargas", num: true, valor: (x) => x.cargas },
          { rotulo: "Vendido", num: true, valor: (x) => brl(x.vendido) },
          { rotulo: "Recebido", num: true, valor: (x) => brl(x.recebido) },
          { rotulo: "Falta receber", num: true, valor: (x) => <b className={x.saldo > 0.009 ? "negativo" : "positivo"}>{brl(x.saldo)}</b> },
        ]}
        rodape={["Total", soma(lista, (x) => x.cargas), brl(soma(lista, (x) => x.vendido)), brl(soma(lista, (x) => x.recebido)), brl(soma(lista, (x) => x.saldo))]}
      />
    </div>
  );
}

function VendasPorCultura({ dados }) {
  const [periodo, setPeriodo] = useState("ano");
  const vendas = noPeriodo(dados.vendas, periodo);
  const mapa = new Map();
  for (const v of vendas) {
    const k = `${v.cultura_id}|${v.classificacao ?? ""}`;
    if (!mapa.has(k)) mapa.set(k, { id: k, cultura_id: v.cultura_id, classificacao: v.classificacao, peso: 0, quantidade: 0, unidade: v.unidade, bruto: 0, liquido: 0, cargas: 0 });
    const x = mapa.get(k);
    x.peso += Number(v.peso_liquido) || 0; x.quantidade += Number(v.quantidade) || 0;
    x.bruto += Number(v.valor_bruto) || 0; x.liquido += Number(v.valor) || 0; x.cargas++;
  }
  const lista = [...mapa.values()].sort((a, b) => b.liquido - a.liquido);
  const un = Object.fromEntries(ESQUEMA.vendas.campos.unidade.opcoes);
  return (
    <div className="cartao">
      <div className="barra"><SeletorPeriodo periodos={PERIODOS} valor={periodo} aoMudar={setPeriodo} /></div>
      <TabelaSimples
        linhas={lista}
        colunas={[
          { rotulo: "Cultura", valor: (x) => nomeRef(dados, "culturas", x.cultura_id) },
          { rotulo: "Tipo", valor: (x) => x.classificacao || "—" },
          { rotulo: "Cargas", num: true, valor: (x) => x.cargas },
          { rotulo: "Peso (t)", num: true, valor: (x) => numero(x.peso / 1000, 2) },
          { rotulo: "Quantidade", num: true, valor: (x) => `${numero(x.quantidade, 1)} ${un[x.unidade] ?? ""}` },
          { rotulo: "Preço médio", num: true, valor: (x) => (x.quantidade ? brl(x.bruto / x.quantidade) : "—") },
          { rotulo: "Bruto", num: true, valor: (x) => brl(x.bruto) },
          { rotulo: "Líquido", num: true, valor: (x) => brl(x.liquido) },
        ]}
        rodape={["Total", "", soma(lista, (x) => x.cargas), numero(soma(lista, (x) => x.peso) / 1000, 2), "", "", brl(soma(lista, (x) => x.bruto)), brl(soma(lista, (x) => x.liquido))]}
      />
    </div>
  );
}

export function Vendas(props) {
  return (
    <>
      <div className="aviso info">A emissão de NF-e pelo sistema é a próxima etapa. Por enquanto, anote o número da nota em cada venda.</div>
      <Secao props={props} abas={[
        ["vendas", "Cargas vendidas"],
        ["recebimentos", "Recebimentos"],
        ["areceber", "A receber", AReceber],
        ["resumo", "Resumo por cultura", VendasPorCultura],
      ]} />
    </>
  );
}

// ─── Caminhões / fretes ─────────────────────────────────────────────────────

function ResumoFretes({ dados }) {
  const [periodo, setPeriodo] = useState("ano");
  const lista = resumoFretes(dados, periodo);
  return (
    <div className="cartao">
      <p className="descricao">Como a planilha FRETES: faturamento dos fretes, diesel (posto ou tanque) e demais custos do caminhão (despesas e revisões lançadas com ele).</p>
      <div className="barra"><SeletorPeriodo periodos={PERIODOS} valor={periodo} aoMudar={setPeriodo} /></div>
      <TabelaSimples
        vazio="Cadastre os caminhões no Inventário de máquinas (categoria Caminhão)."
        linhas={lista.map((x) => ({ ...x, id: x.caminhao.id }))}
        colunas={[
          { rotulo: "Caminhão", valor: (x) => x.caminhao.nome },
          { rotulo: "Viagens", num: true, valor: (x) => x.viagens },
          { rotulo: "Km", num: true, valor: (x) => numero(x.km, 0) },
          { rotulo: "Faturamento", num: true, valor: (x) => brl(x.faturamento) },
          { rotulo: "R$/km", num: true, valor: (x) => (x.porKm ? brl(x.porKm) : "—") },
          { rotulo: "Diesel", num: true, valor: (x) => `${brl(x.combustivel)} (${numero(x.litros, 0)} L)` },
          { rotulo: "Outros custos", num: true, valor: (x) => brl(x.outros) },
          { rotulo: "Resultado", num: true, valor: (x) => <b className={x.resultado < 0 ? "negativo" : "positivo"}>{brl(x.resultado)}</b> },
        ]}
      />
    </div>
  );
}

export function Fretes(props) {
  const caminhoes = useMemo(() => new Set(props.dados.maquinas.filter((m) => m.categoria === "caminhao").map((m) => m.id)), [props.dados.maquinas]);
  const soCaminhao = useMemo(() => (a) => caminhoes.has(a.maquina_id), [caminhoes]);
  return (
    <Secao props={props} abas={[
      ["resumo", "Resumo", ResumoFretes],
      ["fretes", "Fretes"],
      ["abast", "Abastecimentos", { colecao: "abastecimentos", filtro: soCaminhao, padrao: { origem: "posto" } }],
      ["custos", "Custos do caminhão", { colecao: "despesas", filtro: (d) => caminhoes.has(d.maquina_id) }],
    ]} />
  );
}

// ─── Financeiro ─────────────────────────────────────────────────────────────

function ResumoFinanceiro({ dados }) {
  const [periodo, setPeriodo] = useState("mes");
  const s = saidasDoPeriodo(dados, periodo);
  const e = entradasDoPeriodo(dados, periodo);
  const cats = Object.entries(s.porCategoria).sort((a, b) => b[1] - a[1]);
  const res = e.total - s.total;
  return (
    <>
      <div className="barra"><SeletorPeriodo periodos={PERIODOS} valor={periodo} aoMudar={setPeriodo} /></div>
      <div className="grade">
        <Stat rotulo="Receita (entradas)" valor={brl(e.total)} sub={`recebido ${brl(e.recebido)} · fretes ${brl(e.fretes)} · outras ${brl(e.outras)}`} />
        <Stat rotulo="Despesas totais" valor={brl(s.total)} cor="vermelho" />
        <Stat rotulo="Resultado" valor={brl(res)} cor={res < 0 ? "vermelho" : ""} />
      </div>
      <div className="grade-2">
        <div className="cartao">
          <h2>Despesas por categoria</h2>
          <TabelaSimples
            vazio="Nenhuma saída no período."
            linhas={cats.map(([c, v]) => ({ id: c, c, v }))}
            colunas={[
              { rotulo: "Categoria", valor: (x) => x.c },
              { rotulo: "Valor", num: true, valor: (x) => brl(x.v) },
              { rotulo: "%", num: true, valor: (x) => `${numero((x.v / (s.total || 1)) * 100, 1)}%` },
            ]}
            rodape={["Total", brl(s.total), "100%"]}
          />
        </div>
        <div className="cartao">
          <h2>Todas as saídas do período</h2>
          <TabelaSimples
            vazio="Nenhuma saída no período."
            linhas={[...s.linhas].sort((a, b) => String(b.data).localeCompare(String(a.data))).slice(0, 200)}
            colunas={[
              { rotulo: "Data", valor: (x) => data(x.data) },
              { rotulo: "Categoria", valor: (x) => x.categoria },
              { rotulo: "Descrição", valor: (x) => x.descricao || "—" },
              { rotulo: "Favorecido", valor: (x) => x.favorecido || "—" },
              { rotulo: "Valor", num: true, valor: (x) => brl(x.valor) },
            ]}
          />
        </div>
      </div>
    </>
  );
}

function Custos({ dados }) {
  const [periodo, setPeriodo] = useState("ano");
  const c = custos(dados, periodo);
  return (
    <>
      <div className="barra"><SeletorPeriodo periodos={PERIODOS} valor={periodo} aoMudar={setPeriodo} /></div>
      <p className="descricao">
        Custo pelo que foi consumido: despesas com centro de custo + químicos aplicados (a custo médio) + diesel
        dos abastecimentos com talhão/cultura. O que não tem cultura fica em "Geral da fazenda".
      </p>
      <div className="grade">
        <Stat rotulo="Receita de vendas (líquida)" valor={brl(c.receitaTotal)} />
        <Stat rotulo="Custo total" valor={brl(c.custoTotal)} cor="vermelho" />
        <Stat rotulo="Resultado" valor={brl(c.resultado)} cor={c.resultado < 0 ? "vermelho" : ""} />
      </div>
      <div className="cartao">
        <h2>Por cultura</h2>
        <TabelaSimples
          linhas={c.porCultura.map((x) => ({ ...x, id: x.cultura_id ?? "geral" }))}
          colunas={[
            { rotulo: "Cultura", valor: (x) => (x.cultura_id ? nomeRef(dados, "culturas", x.cultura_id) : "Geral da fazenda") },
            { rotulo: "Principais custos", valor: (x) => Object.entries(x.porOrigem).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([o, v]) => `${o} ${brl(v)}`).join(" · ") },
            { rotulo: "Custo", num: true, valor: (x) => brl(x.custo) },
            { rotulo: "Receita", num: true, valor: (x) => brl(x.receita) },
            { rotulo: "Resultado", num: true, valor: (x) => <b className={x.receita - x.custo < 0 ? "negativo" : "positivo"}>{brl(x.receita - x.custo)}</b> },
          ]}
        />
      </div>
      <div className="cartao">
        <h2>Por talhão</h2>
        <TabelaSimples
          linhas={c.porTalhao.filter((x) => x.custo || x.receita || x.producao).map((x) => ({ ...x, id: x.talhao.id }))}
          vazio="Nenhum custo, venda ou colheita lançado com talhão no período."
          colunas={[
            { rotulo: "Talhão", valor: (x) => x.talhao.nome },
            { rotulo: "Cultura", valor: (x) => nomeRef(dados, "culturas", x.talhao.cultura_id) },
            { rotulo: "Área", num: true, valor: (x) => (x.talhao.area_ha ? `${numero(x.talhao.area_ha)} ha` : "—") },
            { rotulo: "Custo", num: true, valor: (x) => brl(x.custo) },
            { rotulo: "Custo/ha", num: true, valor: (x) => (x.custoHa != null ? brl(x.custoHa) : "—") },
            { rotulo: "Colhido", num: true, valor: (x) => (x.producao ? numero(x.producao) : "—") },
            { rotulo: "Receita", num: true, valor: (x) => brl(x.receita) },
          ]}
        />
      </div>
    </>
  );
}

export function Financeiro(props) {
  return (
    <Secao props={props} abas={[
      ["resumo", "Resumo do mês", ResumoFinanceiro],
      ["despesas", "Despesas"],
      ["entradas", "Outras entradas"],
      ["custos", "Custo por cultura e talhão", Custos],
    ]} />
  );
}

export function Equipe(props) {
  return <Crud colecao="funcionarios" {...props} />;
}
