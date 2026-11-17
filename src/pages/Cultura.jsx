import { useMemo, useState } from "react";

import OrdensPulverizacao from "../components/OrdensPulverizacao";
import { Icone, Stat, TabelaSimples } from "../components/ui";
import { produtividade, soma } from "../lib/calculos";
import { brl, data, nomeRef, numero } from "../lib/formato";
import { anosComDados, indicadores } from "../lib/indicadores";
import { DA_CULTURA } from "../lib/navegacao";
import { contasAPagar, pendenciasDasCulturas, ultimasAtividades } from "../lib/pendencias";
import Painel, { SeletorPeriodoPainel } from "./Painel";
import { Abastecimentos, Custos, Planejamento, PorFazenda, Secao } from "./Secoes";
import Ticket from "./Ticket";

const toneladas = (kg) => `${numero(kg / 1000, 1)} t`;

/** Cartão com título e, à direita, um link para a parte completa. */
function Bloco({ titulo, icone, acao, children }) {
  return (
    <section className="cartao bloco">
      <header>
        <h2>{icone && <Icone nome={icone} tamanho={17} />} {titulo}</h2>
        {acao && <button className="ver-mais" onClick={acao[1]}>{acao[0]} <Icone nome="direita" tamanho={14} /></button>}
      </header>
      {children}
    </section>
  );
}

/**
 * As telas que já existem para a fazenda toda, aqui recebendo só os dados
 * desta cultura (talhões, vendas, aplicações, despesas… dela).
 */
const doRecorte = (Tela) => function TelaDaCultura(p) { return <Tela {...p} dados={p.dadosCultura} />; };
const PorFazendaDaCultura = doRecorte(PorFazenda);
const PlanejamentoDaCultura = doRecorte(Planejamento);
const CustosDaCultura = doRecorte(Custos);
const OrdensDaCultura = doRecorte(OrdensPulverizacao);
const TicketDaCultura = doRecorte(Ticket);

/** Visão geral da cultura: números, o que falta, talhões e o que foi feito por último. */
function VisaoGeral({ dados, dadosCultura, cultura, irPara, lancar }) {
  const anos = useMemo(() => anosComDados(dadosCultura), [dadosCultura]);
  const [periodo, setPeriodo] = useState(() => anos[0] ?? "ano");
  const r = useMemo(() => indicadores(dados, { periodo, cultura: cultura.id, fazenda: "" }), [dados, periodo, cultura.id]);

  const talhoes = dadosCultura.talhoes.filter((t) => t.ativo !== false);
  const area = soma(talhoes, (t) => t.area_ha);
  const resultado = r.totais.liquido - r.totais.custo;
  const atencao = [
    ...pendenciasDasCulturas(dadosCultura),
    ...contasAPagar(dadosCultura, 30).map((c) => ({
      tipo: c.tipo, texto: `${c.tipo === "ruim" ? "Conta vencida" : "Vence"} ${data(c.vencimento)}: ${c.texto} — ${brl(c.valor)}`, aba: c.aba, sub: c.sub,
    })),
  ];
  const atividades = ultimasAtividades(dadosCultura, 8);
  const linhasTalhao = r.talhoes.filter((t) => t.talhao).sort((a, b) => b.kg - a.kg || a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));
  const ir = (x) => irPara(undefined, { aba: x.aba, sub: x.sub });

  return (
    <>
      <div className="barra barra-cultura">
        <SeletorPeriodoPainel anos={anos} valor={periodo} aoMudar={setPeriodo} />
        <span className="espaco" />
        <button className="btn primario" onClick={lancar}><Icone nome="mais" /> Lançar em {cultura.nome}</button>
      </div>

      <div className="grade grade-5">
        <Stat rotulo="Área" valor={`${numero(area, 1)} ha`} sub={`${talhoes.length} ${talhoes.length === 1 ? "talhão" : "talhões"}`} cor="cinza" />
        <Stat rotulo="Produção" valor={toneladas(r.totais.kg)} sub={`${r.totais.cargas} ${r.totais.cargas === 1 ? "carga" : "cargas"}`} />
        <Stat rotulo="Vendas (líquido)" valor={brl(r.totais.liquido)} sub={r.totais.kg ? `${brl(r.totais.liquido / (r.totais.kg / 1000))}/t` : undefined} cor="laranja" />
        <Stat rotulo="Custo" valor={brl(r.totais.custo)} sub={area ? `${brl(r.totais.custo / area)}/ha` : "despesas + químicos + diesel"} cor="vermelho" />
        <Stat rotulo="Resultado" valor={brl(resultado)} cor={resultado < 0 ? "vermelho" : ""} sub={r.totais.liquido ? `margem ${numero((resultado / r.totais.liquido) * 100, 1)}%` : undefined} />
      </div>

      <div className="painel-grade">
        <Bloco titulo="Precisa da sua atenção" icone="alerta">
          {atencao.length === 0 ? <div className="vazio">Tudo em dia nesta cultura.</div> : (
            <ul className="lista-alertas">
              {atencao.slice(0, 10).map((a, i) => (
                <li key={i} className="clicavel" onClick={() => ir(a)}>
                  <span className={`ponto ${a.tipo}`} />
                  <span style={{ flex: 1 }}>{a.texto}</span>
                  <Icone nome="direita" tamanho={15} className="seta" />
                </li>
              ))}
            </ul>
          )}
        </Bloco>

        <Bloco titulo={`Lançar em ${cultura.nome}`} icone="mais">
          <div className="atalhos">
            {DA_CULTURA.slice(0, 8).map(([rotulo, icone, aba, sub, , formulario]) => (
              <button key={rotulo} onClick={() => irPara(undefined, { aba, sub, novo: formulario })}>
                <span className="lancar-icone"><Icone nome={icone} /></span>
                <span>{rotulo}</span>
              </button>
            ))}
          </div>
        </Bloco>

        <Bloco titulo="Talhões" icone="mapa" acao={["Ver todos", () => irPara(undefined, { aba: "talhoes" })]}>
          <TabelaSimples
            vazio="Nenhum talhão com esta cultura. Cadastre na aba Talhões."
            linhas={linhasTalhao.slice(0, 12)}
            colunas={[
              { rotulo: "Talhão", valor: (t) => t.nome },
              { rotulo: "Fazenda", valor: (t) => nomeRef(dados, "fazendas", t.fazenda_id) },
              { rotulo: "Área", num: true, valor: (t) => (t.area ? `${numero(t.area, 1)} ha` : "—") },
              { rotulo: "Produção", num: true, valor: (t) => (t.kg ? toneladas(t.kg) : "—") },
              {
                rotulo: "Produtividade", num: true,
                valor: (t) => { const p = produtividade(cultura, t.talhao, t.kg); return p ? `${numero(p.valor, 1)} ${p.sigla}` : "—"; },
              },
              { rotulo: "Resultado", num: true, valor: (t) => (t.liquido || t.custo ? <span className={t.resultado < 0 ? "negativo" : "positivo"}>{brl(t.resultado)}</span> : "—") },
            ]}
          />
        </Bloco>

        <Bloco titulo="Últimas atividades" icone="atividade" acao={["Atividades", () => irPara(undefined, { aba: "atividades" })]}>
          {atividades.length === 0 ? <div className="vazio">Nada lançado ainda nesta cultura.</div> : (
            <ul className="linha-tempo">
              {atividades.map((a) => (
                <li key={a.id} className="clicavel" onClick={() => ir(a)}>
                  <span className="lancar-icone pequeno"><Icone nome={a.icone} tamanho={15} /></span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b>{a.titulo}</b>
                    <small>{a.detalhe}</small>
                  </span>
                  <small className="apagado">{data(a.data).slice(0, 5)}</small>
                </li>
              ))}
            </ul>
          )}
        </Bloco>
      </div>
    </>
  );
}

/** Abas dentro de uma aba (Talhões, Atividades, Colheita e vendas, Custos). */
const comSubAbas = (abas) => function SubAbas(p) { return <Secao sub props={p} abas={abas} />; };

const Talhoes = comSubAbas([
  ["talhoes", "Talhões"],
  ["porfazenda", "Por fazenda / talhão", PorFazendaDaCultura],
  ["safras", "Safras (variedade e plantio)"],
]);

const Atividades = comSubAbas([
  ["aplicacoes", "Aplicações de produto"],
  ["operacoes", "Horímetro / serviços"],
  ["abastecimentos", "Abastecimentos", Abastecimentos],
  ["ordens", "Ordens de pulverização", OrdensDaCultura],
]);

const Vendas = comSubAbas([
  ["vendas", "Cargas vendidas"],
  ["ticket", "Lançar ticket da balança", TicketDaCultura],
  ["colheitas", "Colheitas"],
  ["recebimentos", "Recebimentos"],
]);

/** Despesa nova aqui já vem com o centro de custo nesta cultura. */
function DespesasDaCultura(p) {
  return <Secao sub props={p} abas={[
    ["despesas", "Despesas da cultura", { colecao: "despesas", padrao: { centro: "cultura", cultura_id: p.cultura.id } }],
    ["custos", "Custo por talhão", CustosDaCultura],
  ]} />;
}

/**
 * A tela de uma cultura: tudo o que é dela, num lugar só. As listas mostram
 * só os lançamentos dela e todo lançamento novo já vem com ela.
 */
export default function Cultura(props) {
  const { cultura, irPara, tela } = props;
  // Navegar dentro da própria cultura: sem tela, só muda a aba/sub-aba.
  const p = { ...props, irPara: (destino, opcoes) => irPara(destino ?? tela, opcoes) };
  if (!cultura) return <div className="vazio">Cultura não encontrada. Ela pode ter sido apagada ou desativada em Cadastros.</div>;
  return (
    <Secao props={p} abas={[
      ["visao", "Visão geral", VisaoGeral],
      ["talhoes", "Talhões", Talhoes],
      ["atividades", "Atividades", Atividades],
      ["vendas", "Colheita e vendas", Vendas],
      ["custos", "Custos", DespesasDaCultura],
      ["planejamento", "Planejamento", PlanejamentoDaCultura],
      ["indicadores", "Indicadores", Painel],
    ]} />
  );
}
