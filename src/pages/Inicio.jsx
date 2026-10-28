import { useMemo, useState } from "react";

import { Icone, SeletorPeriodo, Stat } from "../components/ui";
import { PERIODOS, aReceber, diesel, entradasDoPeriodo, estoqueInsumos, resumoChuva, saidasDoPeriodo, soma } from "../lib/calculos";
import { brl, data, leitura, nomeRef, numero } from "../lib/formato";
import { LANCAMENTOS } from "../lib/navegacao";
import { contasAPagar, pendencias } from "../lib/pendencias";

function saudacao() {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

function hojePorExtenso() {
  const t = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

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

/**
 * Tela de entrada, no jeito do Aegro: o que precisa de atenção, as contas
 * que vencem, as últimas atividades no campo e atalhos para lançar.
 * Os gráficos e comparações ficam no Painel de indicadores.
 */
export default function Inicio({ dados, irPara }) {
  const [periodo, setPeriodo] = useState("mes");

  const r = useMemo(() => {
    const saidas = saidasDoPeriodo(dados, periodo);
    const entradas = entradasDoPeriodo(dados, periodo);
    const n = (lista) => lista ?? [];

    // Últimas atividades no campo: uma linha do tempo do que foi lançado.
    const atividades = [
      ...n(dados.aplicacoes).map((a) => ({
        ...a, icone: "spray", ir: "atividades", aba: "aplicacoes",
        titulo: `Aplicação: ${nomeRef(dados, "insumos", a.insumo_id)}`,
        detalhe: `${numero(a.quantidade)} ${dados.insumos.find((i) => i.id === a.insumo_id)?.unidade ?? ""} · ${nomeRef(dados, "talhoes", a.talhao_id)}`,
      })),
      ...n(dados.operacoes).map((o) => ({
        ...o, icone: "relogio", ir: "atividades", aba: "operacoes",
        titulo: `${o.operacao || "Serviço"}: ${nomeRef(dados, "maquinas", o.maquina_id)}`,
        detalhe: [o.trabalhado ? leitura(o.trabalhado) : null, o.talhao_id ? nomeRef(dados, "talhoes", o.talhao_id) : null,
          o.operador_id ? nomeRef(dados, "funcionarios", o.operador_id) : null].filter(Boolean).join(" · "),
      })),
      ...n(dados.colheitas).map((c) => ({
        ...c, icone: "cesto", ir: "lavoura", aba: "colheitas",
        titulo: `Colheita: ${nomeRef(dados, "culturas", c.cultura_id)}`,
        detalhe: `${numero(c.quantidade)} ${c.unidade ?? ""} · ${nomeRef(dados, "talhoes", c.talhao_id)}`,
      })),
      ...n(dados.abastecimentos).map((a) => ({
        ...a, icone: "combustivel", ir: "diesel", aba: "abastecimentos",
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

    return {
      saidas, entradas, atividades,
      tanque: diesel(dados),
      chuva: resumoChuva(dados),
      aReceber: soma(aReceber(dados).filter((x) => x.saldo > 0), (x) => x.saldo),
      valorEstoque: soma(estoqueInsumos(dados), (x) => x.valorEstoque),
      alertas: pendencias(dados).sort((a, b) => (a.tipo === "ruim" ? 0 : 1) - (b.tipo === "ruim" ? 0 : 1)),
      contas: contasAPagar(dados, 30),
      lavoura: [...lavoura.values()].sort((a, b) => b.area - a.area),
    };
  }, [dados, periodo]);

  const resultado = r.entradas.total - r.saidas.total;
  const areaTotal = soma(r.lavoura, (x) => x.area);
  const ir = (x) => irPara(x.ir, { aba: x.aba });

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
        <Stat rotulo="Saldo de caixa" valor={brl(resultado)} cor={resultado < 0 ? "vermelho" : ""} />
        <Stat rotulo="A receber" valor={brl(r.aReceber)} sub="vendas − recebimentos, tudo" cor="laranja" />
      </div>

      <div className="resumo-rapido">
        <button onClick={() => irPara("diesel")}><small>Diesel no tanque</small><b className={r.tanque.saldo < 0 ? "negativo" : ""}>{numero(r.tanque.saldo, 0)} L</b></button>
        <button onClick={() => irPara("quimicos", { aba: "estoque" })}><small>Insumos em estoque</small><b>{brl(r.valorEstoque)}</b></button>
        <button onClick={() => irPara("lavoura")}><small>Área em produção</small><b>{numero(areaTotal, 1)} ha</b></button>
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

        <Bloco titulo="Lançar rápido" icone="mais">
          <div className="atalhos">
            {LANCAMENTOS.slice(0, 8).map(([rotulo, icone, tela, aba]) => (
              <button key={rotulo} onClick={() => irPara(tela, { aba, novo: Boolean(aba) })}>
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
                <li key={`${a.icone}-${a.id}`} className="clicavel" onClick={() => ir(a)}>
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

        <Bloco titulo="Lavoura hoje" icone="cultura" acao={["Ver talhões", () => irPara("lavoura", { aba: "talhoes" })]}>
          {r.lavoura.length === 0 ? <div className="vazio">Cadastre os talhões em Safra e talhões.</div> : (
            <div style={{ display: "grid", gap: 10 }}>
              {r.lavoura.map((x) => (
                <div key={x.nome}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                    <span>{x.nome} <small className="apagado">· {x.talhoes} {x.talhoes === 1 ? "talhão" : "talhões"}</small></span>
                    <b>{numero(x.area, 1)} ha</b>
                  </div>
                  <div className="barra-h"><div style={{ width: `${areaTotal ? (x.area / areaTotal) * 100 : 0}%` }} /></div>
                </div>
              ))}
            </div>
          )}
        </Bloco>

        <Bloco titulo="Números da safra" icone="grafico" acao={["Painel de indicadores", () => irPara("painel")]}>
          <p className="descricao" style={{ marginBottom: 0 }}>
            Vendas por mês, custo por cultura, produtividade por talhão, rankings e comparativo entre safras
            ficam no <b>Painel de indicadores</b>.
          </p>
        </Bloco>
      </div>
    </>
  );
}
