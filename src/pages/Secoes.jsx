import { useMemo, useState } from "react";

import Crud from "../components/Crud";
import { BotaoFoto } from "../components/Foto";
import { Abas, SeletorPeriodo, Stat, TabelaSimples } from "../components/ui";
import {
  PERIODOS, aConferir, aReceber, consumoCaminhao, consumoPorMaquina, custos, diesel, entradasDoPeriodo, estoqueInsumos,
  noPeriodo, resumoFretes, resumoPlanejamento, saidasDoPeriodo, situacaoRevisao, soma,
} from "../lib/calculos";
import { ESQUEMA } from "../lib/esquema";
import { brl, data, nomeRef, numero } from "../lib/formato";

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
  return (
    <div className="cartao">
      <p className="descricao">Saldo = entradas − aplicações. O custo médio vem das entradas e é o que vai para o custo do talhão.</p>
      <TabelaSimples
        vazio="Cadastre os produtos na aba Produtos e lance as entradas."
        linhas={lista.sort((a, b) => a.insumo.nome.localeCompare(b.insumo.nome)).map((x) => ({ ...x, id: x.insumo.id }))}
        colunas={[
          { rotulo: "Produto", valor: (x) => x.insumo.nome },
          { rotulo: "Tipo", valor: (x) => tipos[x.insumo.tipo] ?? "—" },
          { rotulo: "Entrou", num: true, valor: (x) => numero(x.entrada) },
          { rotulo: "Aplicado", num: true, valor: (x) => numero(x.saida) },
          { rotulo: "Saldo", num: true, valor: (x) => <b className={x.saldo < 0 ? "negativo" : ""}>{numero(x.saldo)} {x.insumo.unidade}</b> },
          { rotulo: "Situação", valor: (x) => (x.negativo ? <span className="selo ruim">Negativo</span> : x.baixo ? <span className="selo atencao">Baixo</span> : <span className="selo ok">OK</span>) },
          { rotulo: "Custo médio", num: true, valor: (x) => (x.custoMedio ? `${brl(x.custoMedio)}/${x.insumo.unidade}` : "—") },
          { rotulo: "Valor em estoque", num: true, valor: (x) => brl(x.valorEstoque) },
        ]}
        rodape={["Total", "", "", "", "", "", "", brl(soma(lista, (x) => x.valorEstoque))]}
      />
    </div>
  );
}

export function Quimicos(props) {
  return (
    <Secao props={props} abas={[
      ["estoque", "Estoque", EstoqueQuimicos],
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
  const total = (f) => soma(lista, f);
  const lucro = total((x) => x.resultado);
  return (
    <>
      <div className="barra"><SeletorPeriodo periodos={PERIODOS} valor={periodo} aoMudar={setPeriodo} /></div>
      <p className="descricao">
        O caminhão como empresa à parte: fatura com os fretes (para a Carvalho Cruz ou para terceiros) e paga o diesel
        (posto ou tanque), as despesas e as revisões lançadas com ele. O que sobra é o lucro. O km vem do painel nos
        abastecimentos (ou dos fretes, se não tiver).
      </p>
      <div className="grade">
        <Stat rotulo="Faturamento" valor={brl(total((x) => x.faturamento))} sub={`Carvalho Cruz ${brl(total((x) => x.daCasa))} · terceiros ${brl(total((x) => x.terceiros))}`} />
        <Stat rotulo="Despesas" valor={brl(total((x) => x.combustivel + x.outros))} sub={`diesel ${brl(total((x) => x.combustivel))} · outros ${brl(total((x) => x.outros))}`} cor="vermelho" />
        <Stat rotulo="Lucro" valor={brl(lucro)} cor={lucro < 0 ? "vermelho" : ""} />
        <Stat rotulo="Viagens" valor={total((x) => x.viagens)} sub={total((x) => x.semValor) ? `${total((x) => x.semValor)} sem valor do frete` : "todas com valor"} cor={total((x) => x.semValor) ? "laranja" : "cinza"} />
      </div>
      <div className="cartao">
        <TabelaSimples
          vazio="Cadastre os caminhões no Inventário de máquinas (categoria Caminhão)."
          linhas={lista.map((x) => ({ ...x, id: x.caminhao.id }))}
          colunas={[
            { rotulo: "Caminhão", valor: (x) => x.caminhao.nome },
            { rotulo: "Viagens", num: true, valor: (x) => x.viagens },
            { rotulo: "Km", num: true, valor: (x) => numero(x.km, 0) },
            { rotulo: "Fretes Carvalho Cruz", num: true, valor: (x) => brl(x.daCasa) },
            { rotulo: "Fretes terceiros", num: true, valor: (x) => brl(x.terceiros) },
            { rotulo: "R$/km", num: true, valor: (x) => (x.porKm ? brl(x.porKm) : "—") },
            { rotulo: "Diesel", num: true, valor: (x) => `${brl(x.combustivel)} (${numero(x.litros, 0)} L)` },
            { rotulo: "km/L", num: true, valor: (x) => (x.kmL ? numero(x.kmL, 2) : "—") },
            { rotulo: "Outros custos", num: true, valor: (x) => brl(x.outros) },
            { rotulo: "Lucro", num: true, valor: (x) => <b className={x.resultado < 0 ? "negativo" : "positivo"}>{brl(x.resultado)}</b> },
          ]}
        />
      </div>
    </>
  );
}

function ConsumoCaminhao({ dados }) {
  const caminhoes = dados.maquinas.filter((m) => m.categoria === "caminhao");
  const [periodo, setPeriodo] = useState("ano");
  const [escolhido, setEscolhido] = useState(null);
  const caminhao = caminhoes.find((c) => c.id === escolhido) ?? caminhoes[0];
  if (!caminhao) return <div className="vazio">Cadastre os caminhões no Inventário de máquinas (categoria Caminhão).</div>;
  const c = consumoCaminhao(dados, caminhao.id, periodo);
  return (
    <>
      <div className="barra">
        {caminhoes.length > 1 && (
          <select className="entrada" style={{ width: "auto" }} value={caminhao.id} onChange={(e) => setEscolhido(e.target.value)} aria-label="Caminhão">
            {caminhoes.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
          </select>
        )}
        <SeletorPeriodo periodos={PERIODOS} valor={periodo} aoMudar={setPeriodo} />
      </div>
      <p className="descricao">
        Litros ÷ km rodado, abastecimento por abastecimento: o diesel posto num abastecimento é o que o caminhão gastou
        desde o anterior. Para a conta sair, o abastecimento precisa do km do painel e dos litros — confira pela foto do
        ticket e do painel que o motorista tirou.
      </p>
      <div className="grade">
        <Stat rotulo="Km rodados" valor={`${numero(c.km, 0)} km`} />
        <Stat rotulo="Litros (com km)" valor={`${numero(c.litros, 0)} L`} cor="cinza" />
        <Stat rotulo="Média" valor={c.media ? `${numero(c.media, 2)} km/L` : "—"} sub={c.media ? `${numero(1 / c.media, 3)} L por km` : "falta km ou litros"} />
      </div>
      <div className="cartao">
        <TabelaSimples
          vazio="Nenhum abastecimento deste caminhão no período."
          linhas={c.linhas.map((l) => ({ ...l, id: l.abast.id }))}
          colunas={[
            { rotulo: "Data", valor: (l) => data(l.abast.data) },
            { rotulo: "Onde", valor: (l) => (l.abast.origem === "tanque" ? "Tanque da fazenda" : l.abast.posto || "Posto") },
            { rotulo: "Km no painel", num: true, valor: (l) => (l.abast.leitura != null ? numero(l.abast.leitura, 0) : <span className="selo atencao">falta</span>) },
            { rotulo: "Km rodados", num: true, valor: (l) => (l.km != null ? numero(l.km, 0) : "—") },
            { rotulo: "Litros", num: true, valor: (l) => (l.litros ? numero(l.litros, 1) : <span className="selo atencao">falta</span>) },
            { rotulo: "km/L", num: true, valor: (l) => (l.kmL ? <b>{numero(l.kmL, 2)}</b> : "—") },
            { rotulo: "Ticket", valor: (l) => <BotaoFoto id={l.abast.foto_ticket_id} /> },
            { rotulo: "Painel", valor: (l) => <BotaoFoto id={l.abast.foto_painel_id} /> },
            { rotulo: "Conferido", valor: (l) => (l.abast.conferido === false ? <span className="selo atencao">Conferir</span> : <span className="selo ok">Sim</span>) },
          ]}
        />
      </div>
    </>
  );
}

export function Fretes(props) {
  const { dados, irPara } = props;
  const caminhoes = useMemo(() => new Set(dados.maquinas.filter((m) => m.categoria === "caminhao").map((m) => m.id)), [dados.maquinas]);
  const soCaminhao = useMemo(() => (a) => caminhoes.has(a.maquina_id), [caminhoes]);
  const pendente = aConferir(dados);
  const nAbast = pendente.abastecimentos.filter(soCaminhao).length;
  return (
    <>
      {(pendente.viagens.length > 0 || nAbast > 0) && (
        <div className="aviso info">
          O motorista lançou {pendente.viagens.length > 0 && <b>🚚 {pendente.viagens.length} viagem(ns)</b>}
          {pendente.viagens.length > 0 && nAbast > 0 && " e "}
          {nAbast > 0 && <b>⛽ {nAbast} abastecimento(s)</b>} que esperam conferência. Abra cada um, coloque o valor do
          frete (ou os litros e o preço pela foto do ticket) e marque <b>Conferido</b>.
        </div>
      )}
      <div className="barra">
        <span className="espaco" />
        <button className="btn" onClick={() => irPara("motorista")}>🚚 Abrir o modo motorista neste aparelho</button>
      </div>
      <Secao props={props} abas={[
        ["resumo", "Resumo e lucro", ResumoFretes],
        ["fretes", "Viagens / fretes"],
        ["abast", "Abastecimentos", { colecao: "abastecimentos", filtro: soCaminhao, padrao: { origem: "posto" } }],
        ["consumo", "Consumo km/L", ConsumoCaminhao],
        ["custos", "Custos do caminhão", { colecao: "despesas", filtro: (d) => caminhoes.has(d.maquina_id) }],
        ["locais", "Locais das rotas"],
        ["cargas", "Cargas"],
      ]} />
    </>
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
