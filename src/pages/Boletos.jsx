import { useEffect, useMemo, useState } from "react";

import Formulario from "../components/Formulario";
import LeitorBoleto from "../components/LeitorBoleto";
import { Icone, Modal, Stat, TabelaSimples } from "../components/ui";
import { boletoJaLancado, formatarLinha, lerCodigoBoleto } from "../lib/boleto";
import { lerBeneficiarioDoBoleto } from "../lib/arquivos";
import { lerBoletosDoPdf } from "../lib/boletoPdf";
import { soma } from "../lib/calculos";
import { CATEGORIAS_DESPESA, prepararRegistro, registroNovo } from "../lib/esquema";
import { brl, data } from "../lib/formato";
import { comprimir } from "../lib/fotos";
import { Secao } from "./Secoes";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Data ISO no fuso do aparelho (à noite o UTC já virou o dia seguinte). */
function diaLocal(somar = 0) {
  const d = new Date();
  d.setDate(d.getDate() + somar);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const isoDoDia = (ano, mes, dia) => `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
const compacto = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const soDigitos = (t) => String(t ?? "").replace(/\D/g, "");

/** Pago, vencido, vence hoje, esta semana ou a pagar → [classe do selo, texto]. */
function situacaoBoleto(b, hojeIso = diaLocal(), em7 = diaLocal(7)) {
  if (b.pago) return ["ok", "Pago"];
  if (b.vencimento < hojeIso) return ["ruim", "Vencido"];
  if (b.vencimento === hojeIso) return ["atencao", "Vence hoje"];
  if (b.vencimento <= em7) return ["atencao", "Esta semana"];
  return ["neutro", "A pagar"];
}

/**
 * Conta de luz, água, imposto: o código traz quem é a empresa. Se um boleto
 * igual já foi lançado, reaproveita o nome e a categoria.
 */
function empresaJaConhecida(boletos, lido) {
  if (lido.tipo !== "arrecadacao") return {};
  const chave = (barras) => barras[1] + barras.slice(15, 19);
  const igual = [...boletos]
    .sort((a, b) => String(b.vencimento).localeCompare(String(a.vencimento)))
    .find((b) => {
      const outro = lerCodigoBoleto(b.linha_digitavel);
      return !outro.erro && outro.tipo === "arrecadacao" && chave(outro.barras) === chave(lido.barras);
    });
  return igual ? { empresa: igual.empresa, categoria: igual.categoria, descricao: igual.descricao } : {};
}

/** Nome da empresa: o do cadastro de fornecedores quando o CNPJ bate, senão o que a IA leu. */
function empresaDoBeneficiario(dados, { nome, documento }) {
  const contato = documento && (dados.contatos ?? []).find((c) => String(c.documento ?? "").replace(/\D/g, "") === documento);
  return contato ? contato.fantasia || contato.nome : nome;
}

const paraDataUrl = (blob) => new Promise((resolve) => {
  const leitor = new FileReader();
  leitor.onload = () => resolve(leitor.result);
  leitor.onerror = () => resolve(null);
  leitor.readAsDataURL(blob);
});

// ─── Janela de um boleto (incluir, editar, apagar) ──────────────────────────

function EditorBoleto({ inicial, aviso, fotoParaLer, dados, salvar, remover, aoPagar, aoFechar }) {
  const [reg, setReg] = useState(inicial);
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);
  // Nome do beneficiário lido da foto pela IA (o código de barras não traz).
  const lerSozinho = Boolean(fotoParaLer && !inicial.empresa);
  const [lendoNome, setLendoNome] = useState(lerSozinho);
  const [notaNome, setNotaNome] = useState(null);

  /** Manda a foto para a IA e prepara a foto reduzida para guardar no boleto. */
  const lerFoto = (blob) => Promise.all([
    lerBeneficiarioDoBoleto(blob),
    comprimir(blob, 1000, 0.7).then(paraDataUrl).catch(() => null),
  ]);

  /** `trocar`: a pessoa pediu (troca o que estiver escrito); sozinho só preenche se estiver vazio. */
  const aplicar = (trocar) => ([lido, foto]) => {
    const empresa = lido.nome && empresaDoBeneficiario(dados, lido);
    setReg((atual) => ({
      ...atual,
      ...(empresa && (trocar || !atual.empresa) ? { empresa } : {}),
      // Guarda a foto no boleto, se ele ainda não tem nenhuma.
      ...(foto && !atual.fotos?.length ? { fotos: [foto] } : {}),
    }));
    setNotaNome(empresa
      ? ["ok", `Beneficiário lido da foto: ${empresa}${lido.documento ? ` (${lido.documento})` : ""}. Confira.`]
      : ["info", "Não achei o nome do beneficiário nesta imagem. Tire uma foto do boleto inteiro (botão acima) ou digite a empresa."]);
  };
  const falhou = (e) => setNotaNome(["info", `Não consegui ler o nome do beneficiário (${e.message}). Digite a empresa.`]);

  useEffect(() => {
    // Só na abertura: a foto que veio junto da leitura do código.
    if (lerSozinho) lerFoto(fotoParaLer).then(aplicar(false), falhou).finally(() => setLendoNome(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fotoEscolhida = (e) => {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    setLendoNome(true);
    setNotaNome(null);
    lerFoto(arquivo).then(aplicar(true), falhou).finally(() => setLendoNome(false));
  };

  const gravar = async () => {
    const { reg: pronto, erro: e } = prepararRegistro("boletos", reg, dados);
    if (e) { setErro(e); return; }
    // Sem código não dá para ter certeza: mesma empresa, valor e vencimento pede confirmação.
    const nome = (t) => String(t ?? "").trim().toLowerCase();
    const parecido = dados.boletos.find((b) => b.id !== pronto.id && nome(b.empresa) === nome(pronto.empresa)
      && Number(b.valor) === Number(pronto.valor) && b.vencimento === pronto.vencimento);
    if (parecido && !window.confirm(`Atenção: já existe um pagamento para ${parecido.empresa}, de ${brl(parecido.valor)}, vencendo em ${data(parecido.vencimento)}${parecido.pago ? " (já PAGO)" : ""}.\n\nÉ outro pagamento mesmo? Toque em OK para salvar assim mesmo.`)) return;
    setSalvando(true);
    try {
      await salvar("boletos", pronto);
      aoFechar();
    } catch (err) {
      setErro(String(err?.message ?? err));
      setSalvando(false);
    }
  };

  const apagar = async () => {
    if (!window.confirm("Apagar este pagamento da programação?")) return;
    await remover("boletos", reg.id);
    aoFechar();
  };

  return (
    <Modal
      titulo={reg.id ? `Pagamento — ${inicial.forma_pagamento || "Boleto"}` : "Novo pagamento"}
      aoFechar={aoFechar}
      rodape={
        <>
          {reg.id && <button className="btn perigo" onClick={apagar}><Icone nome="lixo" /> Apagar</button>}
          <span className="espaco" />
          {reg.id && !inicial.pago && <button className="btn" onClick={() => aoPagar(inicial)}><Icone nome="check" /> Pagar</button>}
          <button className="btn" onClick={aoFechar}>Cancelar</button>
          <button className="btn primario" onClick={gravar} disabled={salvando}>
            <Icone nome="editar" /> {salvando ? "Salvando…" : "Salvar"}
          </button>
        </>
      }
    >
      {aviso && <div className={`aviso ${aviso[0]}`}>{aviso[1]}</div>}
      {erro && <div className="aviso">{erro}</div>}
      {(reg.forma_pagamento || "Boleto") === "Boleto" && (
        <div className="barra">
          <label className="btn" title="A IA lê o nome de quem recebe (o beneficiário) na foto do boleto">
            <Icone nome="camera" /> {lendoNome ? "Lendo o beneficiário…" : "Ler o beneficiário pela foto"}
            <input type="file" accept="image/*,application/pdf" capture="environment" hidden onChange={fotoEscolhida} disabled={lendoNome} />
          </label>
          {lendoNome && <small className="descricao" style={{ margin: 0 }}>Lendo o nome do beneficiário na foto…</small>}
        </div>
      )}
      {notaNome && <div className={`aviso ${notaNome[0]}`}>{notaNome[1]}</div>}
      <Formulario colecao="boletos" reg={reg} setReg={setReg} dados={dados} />
    </Modal>
  );
}

// ─── Pagar: marca como pago e, se quiser, já lança a despesa ───────────────

function PagarBoleto({ boleto, dados, salvar, aoFechar }) {
  const jaLancada = boleto.despesa_id && dados.despesas.some((d) => d.id === boleto.despesa_id);
  const [dia, setDia] = useState(diaLocal());
  const [categoria, setCategoria] = useState(boleto.categoria || "Outros");
  const [lancar, setLancar] = useState(!jaLancada);
  const forma = boleto.forma_pagamento || "Boleto";
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const confirmar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      let despesaId = boleto.despesa_id;
      if (lancar) {
        const { reg, erro: e } = prepararRegistro("despesas", {
          ...registroNovo("despesas"),
          data: dia, categoria,
          descricao: boleto.descricao || `${forma} ${boleto.empresa}`,
          valor: boleto.valor, forma_pagamento: forma, favorecido: boleto.empresa,
          vencimento: boleto.vencimento, pago: true, nota: boleto.linha_digitavel,
        }, dados);
        if (e) throw new Error(e);
        despesaId = (await salvar("despesas", reg)).id;
      }
      const { reg, erro: e } = prepararRegistro("boletos", { ...boleto, pago: true, data_pagamento: dia, categoria, despesa_id: despesaId }, dados);
      if (e) throw new Error(e);
      await salvar("boletos", reg);
      aoFechar();
    } catch (err) {
      setErro(String(err?.message ?? err));
      setSalvando(false);
    }
  };

  return (
    <Modal
      titulo={`Pagar (${forma})`}
      aoFechar={aoFechar}
      rodape={
        <>
          <span className="espaco" />
          <button className="btn" onClick={aoFechar}>Cancelar</button>
          <button className="btn primario" onClick={confirmar} disabled={salvando || !dia}>
            <Icone nome="check" /> {salvando ? "Salvando…" : "Confirmar pagamento"}
          </button>
        </>
      }
    >
      {erro && <div className="aviso">{erro}</div>}
      <p className="descricao">
        <b>{boleto.empresa}</b> — {brl(boleto.valor)}, vencimento {data(boleto.vencimento)}
        {boleto.descricao ? ` · ${boleto.descricao}` : ""}
      </p>
      <div className="form">
        <div className="campo">
          <span><label htmlFor="pago-em">Pago em</label><em> *</em></span>
          <input id="pago-em" type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
        </div>
        <div className="campo">
          <span><label htmlFor="pago-cat">Categoria da despesa</label></span>
          <input id="pago-cat" list="pago-cat-l" value={categoria} onChange={(e) => setCategoria(e.target.value)} autoComplete="off" />
          <datalist id="pago-cat-l">{CATEGORIAS_DESPESA.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
        <label className="campo check largo">
          <input type="checkbox" checked={lancar} onChange={(e) => setLancar(e.target.checked)} />
          <span>
            {jaLancada ? "Lançar de novo em Despesas (já tem uma despesa deste pagamento)" : `Lançar também em Despesas (forma de pagamento: ${forma})`}
          </span>
        </label>
      </div>
    </Modal>
  );
}

// ─── Calendário do mês ──────────────────────────────────────────────────────

function Calendario({ dados, abrir, pagar }) {
  const hojeIso = diaLocal();
  const [mes, setMes] = useState(() => ({ ano: Number(hojeIso.slice(0, 4)), mes: Number(hojeIso.slice(5, 7)) - 1 }));
  const [diaEscolhido, setDiaEscolhido] = useState(null);

  const andar = (n) => {
    setDiaEscolhido(null);
    setMes(({ ano, mes: m }) => {
      const d = new Date(ano, m + n, 1);
      return { ano: d.getFullYear(), mes: d.getMonth() };
    });
  };
  const irParaHoje = () => {
    setMes({ ano: Number(hojeIso.slice(0, 4)), mes: Number(hojeIso.slice(5, 7)) - 1 });
    setDiaEscolhido(hojeIso);
  };

  const prefixo = isoDoDia(mes.ano, mes.mes, 1).slice(0, 8);
  const doMes = useMemo(
    () => dados.boletos.filter((b) => String(b.vencimento ?? "").startsWith(prefixo))
      .sort((a, b) => a.vencimento.localeCompare(b.vencimento) || (a.empresa ?? "").localeCompare(b.empresa ?? "")),
    [dados.boletos, prefixo],
  );
  const porDia = useMemo(() => {
    const mapa = {};
    for (const b of doMes) (mapa[b.vencimento] ??= []).push(b);
    return mapa;
  }, [doMes]);

  const primeiroDiaSemana = new Date(mes.ano, mes.mes, 1).getDay();
  const diasNoMes = new Date(mes.ano, mes.mes + 1, 0).getDate();
  const casas = [
    ...Array.from({ length: primeiroDiaSemana }, () => null),
    ...Array.from({ length: diasNoMes }, (_, i) => isoDoDia(mes.ano, mes.mes, i + 1)),
  ];
  while (casas.length % 7) casas.push(null);

  const lista = diaEscolhido ? (porDia[diaEscolhido] ?? []) : doMes;
  const aPagar = doMes.filter((b) => !b.pago);
  const pagos = doMes.filter((b) => b.pago);

  return (
    <>
      <div className="grade">
        <Stat rotulo={`A pagar em ${MESES[mes.mes].toLowerCase()}`} valor={brl(soma(aPagar, (b) => b.valor))}
          sub={`${aPagar.length} ${aPagar.length === 1 ? "pagamento" : "pagamentos"}`} cor="laranja" />
        <Stat rotulo={`Pago em ${MESES[mes.mes].toLowerCase()}`} valor={brl(soma(pagos, (b) => b.valor))}
          sub={`${pagos.length} ${pagos.length === 1 ? "pagamento" : "pagamentos"}`} />
        <Stat rotulo="Total do mês" valor={brl(soma(doMes, (b) => b.valor))} cor="cinza" />
      </div>

      <div className="cartao">
        <div className="barra cal-topo">
          <button className="btn icone" onClick={() => andar(-1)} aria-label="Mês anterior"><Icone nome="esquerda" /></button>
          <h2>{MESES[mes.mes]} de {mes.ano}</h2>
          <button className="btn icone" onClick={() => andar(1)} aria-label="Próximo mês"><Icone nome="direita" /></button>
          <span className="espaco" />
          <button className="btn" onClick={irParaHoje}>Hoje</button>
        </div>

        <div className="calendario">
          {SEMANA.map((s) => <div key={s} className="cal-semana">{s}</div>)}
          {casas.map((dia, i) => {
            if (!dia) return <div key={`v${i}`} className="cal-dia vazio-dia" />;
            const itens = porDia[dia] ?? [];
            const pior = itens.some((b) => situacaoBoleto(b)[0] === "ruim") ? "ruim"
              : itens.some((b) => !b.pago) ? "aberto" : itens.length ? "ok" : "";
            return (
              <button key={dia} type="button"
                className={`cal-dia ${dia === hojeIso ? "hoje" : ""} ${dia === diaEscolhido ? "escolhido" : ""} ${pior}`}
                onClick={() => setDiaEscolhido(dia === diaEscolhido ? null : dia)}>
                <span className="cal-num">{Number(dia.slice(8))}</span>
                {itens.length > 0 && (
                  <>
                    <span className="cal-itens">
                      {itens.slice(0, 3).map((b) => (
                        <span key={b.id} className={`cal-item ${situacaoBoleto(b)[0]}`}
                          onClick={(e) => { e.stopPropagation(); abrir(b); }} title={`${b.empresa} — ${brl(b.valor)}`}>
                          {b.empresa} <b>{brl(b.valor)}</b>
                        </span>
                      ))}
                      {itens.length > 3 && <span className="cal-mais">+{itens.length - 3}</span>}
                    </span>
                    <span className="cal-total">{compacto.format(soma(itens, (b) => b.valor))}</span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="cartao">
        <div className="barra">
          <h2 style={{ margin: 0 }}>{diaEscolhido ? `Vencem em ${data(diaEscolhido)}` : `Pagamentos de ${MESES[mes.mes].toLowerCase()}`}</h2>
          <span className="espaco" />
          {diaEscolhido && <button className="btn" onClick={() => setDiaEscolhido(null)}>Ver o mês todo</button>}
        </div>
        <TabelaSimples
          vazio={diaEscolhido ? "Nenhum pagamento vence neste dia." : "Nenhum pagamento neste mês. Use “Ler boleto” ou “Outro pagamento” para incluir."}
          linhas={lista}
          colunas={[
            { rotulo: "Vencimento", valor: (b) => data(b.vencimento) },
            { rotulo: "Empresa", valor: (b) => (b.a_conferir ? <>{b.empresa} <span className="selo atencao">Lido no depósito</span></> : b.empresa) },
            { rotulo: "Descrição", valor: (b) => b.descricao || "—" },
            { rotulo: "Forma", valor: (b) => b.forma_pagamento || "Boleto" },
            { rotulo: "Valor", num: true, valor: (b) => brl(b.valor) },
            { rotulo: "Situação", valor: (b) => { const [c, t] = situacaoBoleto(b); return <span className={`selo ${c}`}>{t}{b.pago && b.data_pagamento ? ` ${data(b.data_pagamento)}` : ""}</span>; } },
            {
              rotulo: " ", valor: (b) => (
                <span style={{ display: "inline-flex", gap: 6 }}>
                  {!b.pago && <button className="btn" onClick={() => pagar(b)}><Icone nome="check" tamanho={15} /> Pagar</button>}
                  <button className="btn" onClick={() => abrir(b)}><Icone nome="editar" tamanho={15} /> Abrir</button>
                </span>
              ),
            },
          ]}
          rodape={["Total", "", "", "", brl(soma(lista, (b) => b.valor)), "", ""]}
        />
      </div>
    </>
  );
}

// ─── Boletos em PDF: vários de uma vez ─────────────────────────────────────

/**
 * Lê os PDFs escolhidos (cada um pode ter um ou mais boletos), mostra tudo
 * numa lista para conferir e lança de uma vez os marcados. O nome do
 * beneficiário vem da IA (o código não traz); sem internet, digita na lista.
 */
function BoletosEmPdf({ arquivos, dados, salvar, aoFechar }) {
  const [itens, setItens] = useState([]);
  const [lendo, setLendo] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let ativo = true;
    const lista = [];
    // A pessoa pode ir corrigindo a lista enquanto a leitura continua:
    // aqui só se acrescenta linha ou se preenche o que ainda está vazio.
    const atualizar = (chave, preencher) => ativo && setItens((atual) => atual.map((i) => (i.chave === chave ? preencher(i) : i)));

    (async () => {
      // 1º o código de todos (rápido, no aparelho)…
      for (const arquivo of arquivos) {
        const novos = [];
        let achados = [];
        try {
          achados = await lerBoletosDoPdf(arquivo);
          if (!achados.length) {
            novos.push({ chave: `${arquivo.name}-nada`, arquivo: arquivo.name, erro: "Não achei o código do boleto neste arquivo. Use “Ler boleto” e digite os números." });
          }
        } catch (e) {
          novos.push({ chave: `${arquivo.name}-erro`, arquivo: arquivo.name, erro: `Não deu para ler: ${e.message}.` });
        }
        for (const { lido, pagina, imagem } of achados) {
          const linha = formatarLinha(lido.linha_digitavel);
          const digitos = soDigitos(linha);
          const naLista = [...lista, ...novos].find((i) => i.reg && soDigitos(i.reg.linha_digitavel) === digitos);
          const repetido = naLista ? `está duas vezes nos arquivos escolhidos (também em ${naLista.arquivo}).` : boletoJaLancado(dados, linha);
          novos.push({
            chave: `${arquivo.name}-${pagina}-${digitos}`,
            arquivo: achados.length > 1 ? `${arquivo.name} (pág. ${pagina})` : arquivo.name,
            imagem,
            repetido,
            incluir: !repetido,
            lendoNome: true,
            reg: {
              ...registroNovo("boletos"), ...empresaJaConhecida(dados.boletos, lido),
              linha_digitavel: linha, banco: lido.banco, valor: lido.valor, vencimento: lido.vencimento,
            },
          });
        }
        lista.push(...novos);
        if (ativo) setItens((atual) => [...atual, ...novos]);
      }
      // …depois a foto da página e o nome do beneficiário (IA, um por vez).
      for (const item of lista) {
        if (!ativo) return;
        if (!item.reg) continue;
        const foto = await comprimir(item.imagem, 1000, 0.7).then(paraDataUrl).catch(() => null);
        let lido = {};
        let avisoNome = null;
        if (!item.reg.empresa) {
          try {
            lido = await lerBeneficiarioDoBoleto(item.imagem);
            if (!lido.nome) avisoNome = "Não achei o beneficiário no PDF: digite a empresa.";
          } catch (e) {
            avisoNome = `Não li o beneficiário (${e.message}): digite a empresa.`;
          }
        }
        const empresa = lido.nome ? empresaDoBeneficiario(dados, lido) : null;
        atualizar(item.chave, (i) => ({
          ...i, lendoNome: false, avisoNome,
          reg: {
            ...i.reg,
            ...(foto ? { fotos: [foto] } : {}),
            ...(empresa && !i.reg.empresa ? { empresa } : {}),
            ...(lido.vencimento && !i.reg.vencimento ? { vencimento: lido.vencimento } : {}),
          },
        }));
      }
      if (ativo) setLendo(false);
    })();

    return () => { ativo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mudar = (chave, mudanca) => setItens((atual) => atual.map((i) => (i.chave === chave
    ? { ...i, ...mudanca, reg: { ...i.reg, ...mudanca.reg } } : i)));

  const marcados = itens.filter((i) => i.reg && i.incluir);
  const empresas = useMemo(() => [...new Set([
    ...dados.boletos.map((b) => b.empresa),
    ...(dados.contatos ?? []).filter((c) => c.tipo !== "cliente").map((c) => c.fantasia || c.nome),
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b)), [dados.boletos, dados.contatos]);

  const lancar = async () => {
    setErro(null);
    // Confere todos antes: ou lança tudo, ou diz o que falta.
    const prontos = [];
    for (const item of marcados) {
      const { reg, erro: e } = prepararRegistro("boletos", item.reg, dados);
      if (e) { setErro(`${item.arquivo}: ${e}`); return; }
      prontos.push([item.chave, reg]);
    }
    setSalvando(true);
    for (const [chave, reg] of prontos) {
      try {
        await salvar("boletos", reg);
        setItens((atual) => atual.filter((i) => i.chave !== chave));
      } catch (err) {
        setErro(String(err?.message ?? err));
        setSalvando(false);
        return;
      }
    }
    aoFechar();
  };

  const lidos = itens.filter((i) => i.reg).length;
  return (
    <Modal
      titulo="Boletos em PDF"
      aoFechar={aoFechar}
      rodape={
        <>
          <span className="espaco" />
          <button className="btn" onClick={aoFechar}>Cancelar</button>
          <button className="btn primario" onClick={lancar} disabled={salvando || lendo || !marcados.length}>
            <Icone nome="check" /> {salvando ? "Lançando…" : `Lançar ${marcados.length} ${marcados.length === 1 ? "boleto" : "boletos"} (${brl(soma(marcados, (i) => i.reg.valor))})`}
          </button>
        </>
      }
    >
      <p className="descricao">
        {lendo
          ? `Lendo os arquivos… ${lidos} ${lidos === 1 ? "boleto achado" : "boletos achados"} até agora.`
          : "Confira a empresa, o valor e o vencimento de cada um. Os marcados entram na programação; repetido vem desmarcado."}
      </p>
      {erro && <div className="aviso">{erro}</div>}
      <datalist id="pdf-empresas">{empresas.map((e) => <option key={e} value={e} />)}</datalist>
      <div className="boletos-pdf">
      <TabelaSimples
        vazio="Lendo os arquivos…"
        linhas={itens.map((i) => ({ ...i, id: i.chave }))}
        colunas={[
          {
            rotulo: "Lançar", valor: (i) => (i.reg
              ? <input type="checkbox" checked={i.incluir} onChange={(e) => mudar(i.chave, { incluir: e.target.checked })} aria-label="Lançar este boleto" />
              : <span className="selo ruim">Erro</span>),
          },
          { rotulo: "Arquivo", valor: (i) => <small>{i.arquivo}</small> },
          {
            rotulo: "Empresa", valor: (i) => (i.reg ? (
              <>
                <input className="entrada" list="pdf-empresas" value={i.reg.empresa ?? ""}
                  placeholder={i.lendoNome ? "Lendo o beneficiário…" : "Quem recebe"}
                  onChange={(e) => mudar(i.chave, { reg: { empresa: e.target.value } })} />
                {i.avisoNome && !i.reg.empresa && <small className="descricao">{i.avisoNome}</small>}
              </>
            ) : i.erro),
          },
          {
            rotulo: "Valor", num: true, valor: (i) => (i.reg ? (
              <input className="entrada valor" type="number" step="0.01" min="0" value={i.reg.valor ?? ""}
                onChange={(e) => mudar(i.chave, { reg: { valor: e.target.value === "" ? null : Number(e.target.value) } })} />
            ) : ""),
          },
          {
            rotulo: "Vencimento", valor: (i) => (i.reg ? (
              <input className="entrada" type="date" value={i.reg.vencimento ?? ""}
                onChange={(e) => mudar(i.chave, { reg: { vencimento: e.target.value || null } })} />
            ) : ""),
          },
          {
            rotulo: "Situação", valor: (i) => (!i.reg ? "" : i.repetido
              ? <span className="selo atencao">Repetido: {i.repetido}</span>
              : <span className="selo ok">Novo</span>),
          },
        ]}
      />
      </div>
    </Modal>
  );
}

// ─── Tela ───────────────────────────────────────────────────────────────────

/**
 * Programação de pagamentos: boleto (lê o código pela câmera, foto, PDF —
 * vários de uma vez — ou digitado) ou qualquer outra forma (PIX,
 * transferência, cartão…). Guarda
 * empresa, valor e vencimento e mostra tudo num calendário do mês.
 */
export default function Boletos(props) {
  const { dados, salvar, remover } = props;
  const [lendo, setLendo] = useState(false);
  const [editando, setEditando] = useState(null);
  const [pagando, setPagando] = useState(null);
  const [pdfs, setPdfs] = useState(null);

  const hojeIso = diaLocal();
  const em7 = diaLocal(7);
  const abertos = dados.boletos.filter((b) => !b.pago);
  const vencidos = abertos.filter((b) => b.vencimento < hojeIso);
  const semana = abertos.filter((b) => b.vencimento >= hojeIso && b.vencimento <= em7);

  const abrir = (b) => setEditando({ reg: { ...b } });
  const novo = () => setEditando({ reg: { ...registroNovo("boletos"), forma_pagamento: "PIX" } });

  const aoLer = (lido, { foto } = {}) => {
    setLendo(false);
    const digitos = soDigitos(lido.linha_digitavel);
    const repetido = dados.boletos.find((b) => soDigitos(b.linha_digitavel) === digitos);
    if (repetido) {
      setEditando({ reg: { ...repetido }, aviso: ["", `⚠️ Boleto repetido: este boleto já está na programação${repetido.pago ? " e já foi PAGO" : ""}. Abri o que já estava lançado — não lance de novo.`] });
      return;
    }
    const conhecida = empresaJaConhecida(dados.boletos, lido);
    setEditando({
      fotoParaLer: foto,
      reg: {
        ...registroNovo("boletos"), ...conhecida,
        linha_digitavel: formatarLinha(lido.linha_digitavel), banco: lido.banco,
        valor: lido.valor, vencimento: lido.vencimento,
      },
      aviso: ["ok", `Boleto lido: ${lido.valor ? brl(lido.valor) : "sem valor no código"}${lido.vencimento ? `, vence ${data(lido.vencimento)}` : " — digite o vencimento"}. `
        + (conhecida.empresa ? "Empresa repetida do último boleto igual; confira." : foto ? "" : "Agora preencha a empresa (ou leia o beneficiário pela foto).")],
    });
  };

  return (
    <>
      <div className="barra">
        <button className="btn primario" onClick={() => setLendo(true)}><Icone nome="barras" /> Ler boleto</button>
        <label className="btn" title="Escolha um ou mais PDFs de boleto: o código, o valor e o vencimento são lidos de cada um">
          <Icone nome="importar" /> Boletos em PDF
          <input type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => {
            const escolhidos = [...(e.target.files ?? [])];
            e.target.value = "";
            if (escolhidos.length) setPdfs(escolhidos);
          }} />
        </label>
        <button className="btn" onClick={novo}><Icone nome="mais" /> Outro pagamento (PIX, transferência…)</button>
      </div>

      {(vencidos.length > 0 || semana.length > 0) && (
        <div className="grade">
          {vencidos.length > 0 && (
            <Stat rotulo="Vencidos sem pagar" valor={brl(soma(vencidos, (b) => b.valor))}
              sub={`${vencidos.length} ${vencidos.length === 1 ? "pagamento" : "pagamentos"}`} cor="vermelho" />
          )}
          {semana.length > 0 && (
            <Stat rotulo="Vencem nos próximos 7 dias" valor={brl(soma(semana, (b) => b.valor))}
              sub={`${semana.length} ${semana.length === 1 ? "pagamento" : "pagamentos"}`} cor="laranja" />
          )}
        </div>
      )}

      <Secao props={{ ...props, abrir, pagar: setPagando }} abas={[
        ["calendario", "Calendário", Calendario],
        ["boletos", "Todos os pagamentos"],
      ]} />

      {lendo && <LeitorBoleto dados={dados} aoLer={aoLer} aoFechar={() => setLendo(false)} />}
      {editando && (
        <EditorBoleto key={editando.reg.id ?? "novo"} inicial={editando.reg} aviso={editando.aviso} fotoParaLer={editando.fotoParaLer} dados={dados}
          salvar={salvar} remover={remover} aoFechar={() => setEditando(null)}
          aoPagar={(b) => { setEditando(null); setPagando(b); }} />
      )}
      {pdfs && <BoletosEmPdf arquivos={pdfs} dados={dados} salvar={salvar} aoFechar={() => setPdfs(null)} />}
      {pagando && <PagarBoleto boleto={pagando} dados={dados} salvar={salvar} aoFechar={() => setPagando(null)} />}
    </>
  );
}
