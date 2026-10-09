import { useState } from "react";

import { Stat, TabelaSimples } from "../components/ui";
import { hoje, prepararRegistro, registroNovo, segundaDaSemana } from "../lib/esquema";
import { baixarCSV, brl, data, nomeRef, numero } from "../lib/formato";
import { somarDias, turmasDaSemana } from "../lib/turmas";

/** "1.234,56", "1234,56" ou "1234.56" → 1234.56. */
function lerValor(texto) {
  const t = String(texto).replace(/[^\d.,]/g, "");
  return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
}

/**
 * Turmas de colheita → A pagar por semana: o que cada turma colheu na semana
 * (segunda a domingo), quanto tem a receber, quanto já foi pago e quanto
 * falta. O botão Pagar lança o que falta em Pagamentos.
 */
export default function TurmasSemana({ dados, salvar }) {
  const [segunda, setSegunda] = useState(() => segundaDaSemana(hoje()));
  const [aberta, setAberta] = useState(null);
  const [erro, setErro] = useState(null);
  const domingo = somarDias(segunda, 6);
  const linhas = turmasDaSemana(dados, segunda);
  const comCarga = linhas.filter((l) => l.kg > 0 || l.pago > 0);
  const total = (campo) => linhas.reduce((a, l) => a + l[campo], 0);

  const pagar = async (l) => {
    setErro(null);
    if (!l.turma) { setErro(`Cadastre a turma "${l.nome}" na aba Cadastro para registrar o pagamento.`); return; }
    const valor = window.prompt(`Pagamento da ${l.nome}, semana ${data(segunda)} a ${data(domingo)}.\nValor pago (R$):`, String(l.falta.toFixed(2)).replace(".", ","));
    if (valor == null) return;
    const { reg, erro: e } = prepararRegistro("pagamentos_turmas", {
      ...registroNovo("pagamentos_turmas"), turma_id: l.turma.id, semana: segunda, valor: lerValor(valor),
    }, dados);
    if (e) { setErro(e); return; }
    if (!(reg.valor > 0)) { setErro("Digite um valor maior que zero."); return; }
    await salvar("pagamentos_turmas", reg);
  };

  const exportar = () => baixarCSV(`turmas-${segunda}.csv`, [
    ["Turma", "Encarregado", "PIX", "Bags", "Toneladas", "A pagar", "Pago", "Falta", "Toneladas sem valor por t"],
    ...comCarga.map((l) => [l.nome, l.turma?.encarregado ?? "", l.turma?.pix ?? "", l.bags, numero(l.kg / 1000, 3), l.aPagar, l.pago, l.falta, numero(l.semValor / 1000, 3)]),
  ]);

  return (
    <>
      <div className="cartao" style={{ marginBottom: 16 }}>
        <div className="barra" style={{ marginBottom: 0 }}>
          <button type="button" className="btn" onClick={() => setSegunda(somarDias(segunda, -7))}>◀ Semana anterior</button>
          <b style={{ fontSize: 17 }}>{data(segunda)} a {data(domingo)}</b>
          <button type="button" className="btn" onClick={() => setSegunda(somarDias(segunda, 7))}>Próxima semana ▶</button>
          {segunda !== segundaDaSemana(hoje()) && <button type="button" className="btn" onClick={() => setSegunda(segundaDaSemana(hoje()))}>Esta semana</button>}
          <span className="espaco" />
          <button type="button" className="btn" onClick={exportar} disabled={!comCarga.length}>Exportar planilha</button>
        </div>
      </div>

      <div className="grade">
        <Stat rotulo="Colhido na semana" valor={`${numero(total("kg") / 1000, 1)} t`} sub={`${numero(total("bags"), 0)} bags`} cor="cinza" />
        <Stat rotulo="A pagar" valor={brl(total("aPagar"))} />
        <Stat rotulo="Já pago" valor={brl(total("pago"))} cor="cinza" />
        <Stat rotulo="Falta pagar" valor={brl(total("falta"))} cor={total("falta") > 0.005 ? "laranja" : ""} />
      </div>

      {erro && <div className="aviso">{erro}</div>}
      {total("semValor") > 0 && (
        <div className="aviso info">
          {numero(total("semValor") / 1000, 3)} t colhidas nesta semana estão sem valor por tonelada e não entram no “A pagar”.
          Complete o valor nessas cargas em Vendas → Cargas vendidas.
        </div>
      )}

      <div className="cartao">
        <TabelaSimples
          vazio="Nenhuma turma colheu nesta semana. Cadastre as turmas na aba Cadastro."
          linhas={comCarga.map((l) => ({ ...l, id: l.chave }))}
          colunas={[
            {
              rotulo: "Turma",
              valor: (l) => (
                <button type="button" className="link" onClick={() => setAberta(aberta === l.chave ? null : l.chave)}
                  style={{ background: "none", border: 0, padding: 0, font: "inherit", color: "inherit", textAlign: "left", cursor: "pointer" }}>
                  <b>{aberta === l.chave ? "▾" : "▸"} {l.nome}</b>
                  {l.turma?.encarregado && <small style={{ display: "block", opacity: 0.7 }}>{l.turma.encarregado}</small>}
                  {!l.turma && <small style={{ display: "block", color: "var(--amarelo)" }}>não cadastrada</small>}
                </button>
              ),
            },
            { rotulo: "Bags", num: true, valor: (l) => numero(l.bags, 0) },
            { rotulo: "Toneladas", num: true, valor: (l) => numero(l.kg / 1000, 3) },
            { rotulo: "A pagar", num: true, valor: (l) => brl(l.aPagar) },
            { rotulo: "Pago", num: true, valor: (l) => brl(l.pago) },
            { rotulo: "Falta", num: true, valor: (l) => <b className={l.falta > 0.005 ? "negativo" : "positivo"}>{brl(l.falta)}</b> },
            { rotulo: "PIX", valor: (l) => l.turma?.pix || "—" },
            {
              rotulo: "",
              valor: (l) => (l.falta > 0.005 ? <button type="button" className="btn primario" onClick={() => pagar(l)}>Pagar</button> : l.aPagar > 0 ? "✓ pago" : ""),
            },
          ]}
          rodape={["Total", numero(total("bags"), 0), numero(total("kg") / 1000, 3), brl(total("aPagar")), brl(total("pago")), brl(total("falta")), "", ""]}
        />
      </div>

      {comCarga.filter((l) => l.chave === aberta).map((l) => (
        <div className="cartao" key={l.chave} style={{ marginTop: 16 }}>
          <h2>Cargas da {l.nome} na semana</h2>
          <TabelaSimples
            vazio="Nenhuma carga nesta semana."
            linhas={[...l.cargas].sort((a, b) => String(a.data).localeCompare(String(b.data)))}
            colunas={[
              { rotulo: "Data", valor: (v) => data(v.data) },
              { rotulo: "Talhão", valor: (v) => nomeRef(dados, "talhoes", v.talhao_id) },
              { rotulo: "Bags", num: true, valor: (v) => (v.volumes != null ? numero(v.volumes, 1) : "—") },
              { rotulo: "Kg", num: true, valor: (v) => numero(v.peso_liquido, 0) },
              { rotulo: "R$/t", num: true, valor: (v) => (v.custo_ton != null ? brl(v.custo_ton) : <span className="negativo">sem valor</span>) },
              { rotulo: "A pagar", num: true, valor: (v) => (v.custo_ton != null ? brl((Number(v.peso_liquido) || 0) / 1000 * Number(v.custo_ton)) : "—") },
            ]}
          />
          {l.pagamentos.length > 0 && (
            <p className="descricao" style={{ marginTop: 12 }}>
              Pagamentos desta semana: {l.pagamentos.map((p) => `${data(p.data)} ${brl(p.valor)}`).join(" · ")}
            </p>
          )}
        </div>
      ))}
    </>
  );
}
