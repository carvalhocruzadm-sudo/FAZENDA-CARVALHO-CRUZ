import { useMemo, useState } from "react";

import { Icone, Stat } from "../components/ui";
import { aReceber, diesel, estoqueInsumos, resumoChuva, soma } from "../lib/calculos";
import { brl, data, numero } from "../lib/formato";
import { anosComDados, indicadores } from "../lib/indicadores";
import { contasAPagar, pendencias, pendenciasDasCulturas, ultimasAtividades } from "../lib/pendencias";
import { culturasAtivas, dadosDaCultura, emojiDaCultura, telaDaCultura } from "../lib/porCultura";
import { SeletorPeriodoPainel } from "./Painel";

function saudacao() {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

function hojePorExtenso() {
  const t = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const toneladas = (kg) => `${numero(kg / 1000, 1)} t`;

/** Cartão com título e, à direita, um link para a tela completa. */
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

/** Um cartão por cultura: os números dela e a entrada para a tela dela. */
function CartaoCultura({ c, numeros, irPara }) {
  const abrir = () => irPara(telaDaCultura(c.id));
  return (
    <div className="cartao-cultura" role="button" tabIndex={0} onClick={abrir} onKeyDown={(e) => e.key === "Enter" && abrir()}>
      <header>
        <span className="emoji-grande">{emojiDaCultura(c)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b>{c.nome}</b>
          <small>{numeros.talhoes ? `${numero(numeros.area, 1)} ha · ${numeros.talhoes} ${numeros.talhoes === 1 ? "talhão" : "talhões"}` : "sem talhão"}</small>
        </div>
        {numeros.pendentes > 0 && <span className="qtd-avisos" title="Coisas esperando você nesta cultura">{numeros.pendentes}</span>}
      </header>
      <dl>
        <div><dt>Produção</dt><dd>{numeros.kg ? toneladas(numeros.kg) : "—"}</dd></div>
        <div><dt>Vendas</dt><dd>{brl(numeros.liquido)}</dd></div>
        <div><dt>Custo</dt><dd>{brl(numeros.custo)}</dd></div>
        <div><dt>Resultado</dt><dd className={numeros.liquido - numeros.custo < 0 ? "negativo" : "positivo"}>{brl(numeros.liquido - numeros.custo)}</dd></div>
      </dl>
      <footer>
        <span className="ver-mais">Abrir {c.nome} <Icone nome="direita" tamanho={14} /></span>
      </footer>
    </div>
  );
}

/**
 * Tela de entrada: a fazenda vista pelas culturas. Um cartão para cada uma
 * (clicar abre tudo dela) e, embaixo, o que é da fazenda toda: o que precisa
 * de atenção, as contas que vencem e o que foi feito por último no campo.
 */
export default function Inicio({ dados, irPara }) {
  const anos = useMemo(() => anosComDados(dados), [dados]);
  const [periodo, setPeriodo] = useState(() => anos[0] ?? "ano");

  const r = useMemo(() => {
    const ind = indicadores(dados, { periodo, cultura: "", fazenda: "" });
    const porCultura = new Map(ind.culturas.map((x) => [x.id, x]));
    const culturas = culturasAtivas(dados).map((c) => {
      const talhoes = dados.talhoes.filter((t) => t.ativo !== false && t.cultura_id === c.id);
      const x = porCultura.get(c.id);
      return {
        c,
        numeros: {
          talhoes: talhoes.length, area: soma(talhoes, (t) => t.area_ha),
          kg: x?.kg ?? 0, liquido: x?.liquido ?? 0, custo: x?.custo ?? 0,
          pendentes: pendenciasDasCulturas(dadosDaCultura(dados, c.id)).length,
        },
      };
    });
    return {
      ind, culturas,
      tanque: diesel(dados),
      chuva: resumoChuva(dados),
      aReceber: soma(aReceber(dados).filter((x) => x.saldo > 0), (x) => x.saldo),
      valorEstoque: soma(estoqueInsumos(dados), (x) => x.valorEstoque),
      alertas: pendencias(dados).sort((a, b) => (a.tipo === "ruim" ? 0 : 1) - (b.tipo === "ruim" ? 0 : 1)),
      contas: contasAPagar(dados, 30),
      atividades: ultimasAtividades(dados, 8),
    };
  }, [dados, periodo]);

  const caixa = r.ind.entradas.total - r.ind.saidas.total;
  const ir = (x) => irPara(x.ir, { aba: x.aba, sub: x.sub });

  return (
    <>
      <div className="boas-vindas">
        <div>
          <h2>{saudacao()}!</h2>
          <small>{hojePorExtenso()}</small>
        </div>
        <SeletorPeriodoPainel anos={anos} valor={periodo} aoMudar={setPeriodo} />
      </div>

      <h3 className="titulo-secao">Suas culturas</h3>
      <div className="grade-culturas">
        {r.culturas.map(({ c, numeros }) => <CartaoCultura key={c.id} c={c} numeros={numeros} irPara={irPara} />)}
        <button className="cartao-cultura nova" onClick={() => irPara("cadastros", { aba: "culturas", novo: true })}>
          <Icone nome="mais" tamanho={22} /> Nova cultura
        </button>
      </div>

      <h3 className="titulo-secao">A fazenda toda</h3>
      <div className="grade grade-4">
        <Stat rotulo="Entrou no caixa" valor={brl(r.ind.entradas.total)} sub="recebimentos + fretes + aditivos" />
        <Stat rotulo="Saiu do caixa" valor={brl(r.ind.saidas.total)} sub="despesas + diesel + insumos + peças" cor="vermelho" />
        <Stat rotulo="Saldo de caixa" valor={brl(caixa)} cor={caixa < 0 ? "vermelho" : ""} />
        <Stat rotulo="A receber" valor={brl(r.aReceber)} sub="vendas − recebimentos, tudo" cor="laranja" />
      </div>

      <div className="resumo-rapido">
        <button onClick={() => irPara("diesel")}><small>Diesel no tanque</small><b className={r.tanque.saldo < 0 ? "negativo" : ""}>{numero(r.tanque.saldo, 0)} L</b></button>
        <button onClick={() => irPara("quimicos", { aba: "estoque" })}><small>Insumos em estoque</small><b>{brl(r.valorEstoque)}</b></button>
        <button onClick={() => irPara("comercial", { aba: "areceber" })}><small>Compradores devendo</small><b>{brl(r.aReceber)}</b></button>
        <button onClick={() => irPara("pluviometro")}><small>Chuva no mês</small><b>{numero(r.chuva.mes, 1)} mm</b></button>
      </div>

      <div className="painel-grade">
        <Bloco titulo="Precisa da sua atenção" icone="alerta">
          {r.alertas.length === 0 ? <div className="vazio">Tudo em dia.</div> : (
            <ul className="lista-alertas">
              {r.alertas.slice(0, 10).map((a, i) => (
                <li key={i} className="clicavel" onClick={() => ir(a)}>
                  <span className={`ponto ${a.tipo}`} />
                  <span style={{ flex: 1 }}>{a.texto}</span>
                  <Icone nome="direita" tamanho={15} className="seta" />
                </li>
              ))}
            </ul>
          )}
        </Bloco>

        <Bloco titulo="Contas a pagar (30 dias)" icone="calendario" acao={["Programação", () => irPara("boletos")]}>
          {r.contas.length === 0 ? <div className="vazio">Nenhuma conta em aberto com vencimento.</div> : (
            <>
              <ul className="lista-alertas">
                {r.contas.slice(0, 8).map((c) => (
                  <li key={c.id} className="clicavel" onClick={() => ir(c)}>
                    <span className={`selo ${c.tipo}`}>{c.tipo === "ruim" ? "Vencida" : data(c.vencimento).slice(0, 5)}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      {c.texto}{c.quem && <small className="apagado"> · {c.quem}</small>}
                    </span>
                    <b>{brl(c.valor)}</b>
                  </li>
                ))}
              </ul>
              <div className="total-linha"><span>Total{r.contas.length > 8 ? ` (${r.contas.length} contas)` : ""}</span><b>{brl(soma(r.contas, (c) => c.valor))}</b></div>
            </>
          )}
        </Bloco>

        <Bloco titulo="Últimas atividades no campo" icone="atividade">
          {r.atividades.length === 0 ? <div className="vazio">Nenhuma atividade lançada ainda.</div> : (
            <ul className="linha-tempo">
              {r.atividades.map((a) => (
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
