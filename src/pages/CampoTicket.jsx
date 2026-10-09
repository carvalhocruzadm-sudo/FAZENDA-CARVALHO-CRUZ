import { useEffect, useMemo, useState } from "react";

import {
  Cartao, EscolherPessoa, FotoComprovante, FotoOuInicial, Ouvir, Passos, Pergunta, Rodape, Teclado, Topo,
} from "../components/CampoUI";
import { falar, operadores, paraNumero, vibrar } from "../lib/campo";
import { ESQUEMA, hoje, prepararRegistro, registroNovo } from "../lib/esquema";
import { brl, data as dataBr, numero } from "../lib/formato";
import { repartirTicket } from "../lib/ticketCampo";

/**
 * Modo Campo → Ticket da balança (/campo/ticket): o lançamento do ticket
 * para quem não lê — uma pergunta por tela, figuras, 🔊 e o teclado grande.
 *
 *   quem é você → venda de quê → fazendas → talhões → bags de cada talhão
 *   → turmas → bags e R$ por tonelada de cada turma → foto e peso → conferir
 *
 * Bags e turmas só para cultura colhida por turma (laranja). A conta (peso de
 * cada bag, parte de cada talhão e turma) está em lib/ticketCampo.js. Vira
 * uma venda por talhão (e por turma), sem comprador e sem preço, marcada
 * "Falta completar": o escritório confere pela foto e completa.
 */

const SEM_FAZENDA = "sem";

const FALA = {
  operador: "Quem é você? Toque na sua foto.",
  cultura: "Venda de quê? Toque na figura.",
  fazenda: "De qual fazenda saiu a carga? Pode marcar mais de uma. Depois toque em próximo.",
  talhao: "De qual talhão saiu a carga? Pode marcar mais de um. Depois toque em próximo.",
  turma: "Qual turma colheu? Pode marcar mais de uma. Se não souber, toque em não sei. Depois toque em próximo.",
  peso: "Tire a foto do ticket e digite o peso líquido, em quilos.",
  dia: "Qual dia é o ticket? Hoje, ontem ou anteontem?",
  conferir: "Confira. Se estiver tudo certo, toque em salvar.",
  pronto: "Pronto! Ticket guardado. Obrigado.",
};


/** Figura da cultura pelo nome; sem palpite, pelo tipo de cultura. */
const FIGURAS_NOME = [
  [/laranja|lim[aã]o|citr|tangerina|ponkan/i, "🍊"],
  [/milho verde/i, "🌽"],
  [/silagem|feno|capim|forragem/i, "🌾"],
  [/milho/i, "🌽"],
  [/soja|feij[aã]o/i, "🫘"],
  [/amendoim/i, "🥜"],
  [/ab[oó]bora|moranga/i, "🎃"],
  [/cana/i, "🎋"],
  [/caf[eé]/i, "☕"],
  [/confinamento|boi|gado|bezerr|vaca/i, "🐂"],
  [/tomate/i, "🍅"],
  [/melancia/i, "🍉"],
  [/mandioca|batata/i, "🥔"],
  [/trigo|arroz|sorgo/i, "🌾"],
];
const FIGURAS_GRUPO = { citros: "🍊", graos: "🌽", hortalicas: "🥬", forragem: "🌾", pecuaria: "🐂" };
const figuraCultura = (c) => FIGURAS_NOME.find(([re]) => re.test(c?.nome ?? ""))?.[1] ?? FIGURAS_GRUPO[c?.grupo] ?? "🌱";

/** "2026-10-07" − n dias. */
function diasAtras(n) {
  const d = new Date(`${hoje()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
const DIAS = [[0, "Hoje"], [1, "Ontem"], [2, "Anteontem"]];
const nomeDoDia = (iso) => DIAS.find(([n]) => diasAtras(n) === iso)?.[1] ?? dataBr(iso);

const novo = () => ({
  data: hoje(), operador_id: null, cultura_id: null, fazendas: [], talhoes: [],
  bags: {}, naoSei: false, turmas: [], peso: "", foto: null,
});

/** Número salvo → texto do teclado ("32.5" → "32,5"). */
const paraTeclado = (v) => (v == null || v === "" ? "" : String(v).replace(".", ","));

/** Quem lança ticket: os marcados em Funcionários; sem ninguém marcado, a equipe toda. */
function lancadores(dados) {
  const marcados = operadores(dados).filter((f) => f.lanca_ticket);
  return marcados.length ? marcados : operadores(dados);
}

/**
 * O que muda conforme a cultura: os talhões dela (nenhum marcado com ela =
 * todos), as fazendas desses talhões e as turmas que o celular conhece.
 */
function daCultura(dados, culturaId) {
  const cultura = dados.culturas.find((c) => c.id === culturaId);
  const emBags = Boolean(cultura?.turma_colheita);
  const ativos = dados.talhoes.filter((t) => t.ativo !== false).sort(ESQUEMA.talhoes.ordem);
  const daC = ativos.filter((t) => t.cultura_id === culturaId);
  const talhoes = daC.length ? daC : ativos;
  const ids = new Set(talhoes.map((t) => t.fazenda_id ?? SEM_FAZENDA));
  const fazendas = dados.fazendas
    .filter((f) => ids.has(f.id))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }))
    .map((f) => ({ id: f.id, nome: f.nome }));
  if (ids.has(SEM_FAZENDA)) fazendas.push({ id: SEM_FAZENDA, nome: "Outros talhões" });
  return { cultura, emBags, talhoes, fazendas, turmas: emBags && cultura ? turmasDaCultura(dados, cultura) : [] };
}

/**
 * As turmas que o celular mostra: as do cadastro da cultura e as dos tickets
 * que ele enxerga (o celular só baixa os que ainda faltam completar), as que
 * colheram por último primeiro.
 */
function turmasDaCultura(dados, cultura) {
  const ultima = {};
  for (const nome of String(cultura.turmas ?? "").split(",").map((x) => x.trim()).filter(Boolean)) ultima[nome] = "";
  for (const v of dados.vendas) {
    if (v.cultura_id === cultura.id && v.turma && String(v.data ?? "") >= String(ultima[v.turma] ?? "")) ultima[v.turma] = v.data ?? "";
  }
  return Object.keys(ultima).sort((a, b) => String(ultima[b]).localeCompare(String(ultima[a])) || a.localeCompare(b, "pt-BR"));
}

/** O valor por tonelada da turma: o último que ela cobrou; sem histórico, o padrão da cultura. */
function valorDaTurma(dados, cultura, nome) {
  const ultima = dados.vendas
    .filter((v) => v.turma === nome && v.custo_ton != null)
    .sort((a, b) => String(b.data).localeCompare(String(a.data)))[0];
  return paraTeclado(ultima ? ultima.custo_ton : cultura?.custo_turma_ton);
}

/**
 * A sequência de telas para o que já foi escolhido. Telas com dado:
 * "bags:<talhão>", "turmaBags:<n>", "turmaValor:<n>".
 */
function montarPassos(info, r) {
  const p = ["operador", "cultura"];
  if (info.fazendas.length > 1) p.push("fazenda");
  if (info.talhoes.length) p.push("talhao");
  if (info.emBags) {
    const talhoes = r.talhoes.length ? r.talhoes : [null];
    for (const id of talhoes) p.push(`bags:${id ?? "carga"}`);
    if (info.turmas.length) p.push("turma");
    r.turmas.forEach((_, i) => {
      if (r.turmas.length > 1) p.push(`turmaBags:${i}`);
      p.push(`turmaValor:${i}`);
    });
  }
  p.push("peso", "conferir");
  return p;
}

export default function CampoTicket({ dados, salvar, irPara }) {
  const [passo, setPasso] = useState("operador");
  const [r, setR] = useState(novo);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  const culturas = useMemo(
    () => dados.culturas.filter((c) => c.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [dados.culturas],
  );
  const info = daCultura(dados, r.cultura_id);
  const { cultura, emBags } = info;
  const passos = montarPassos(info, r);
  const [tipo, chave] = passo.split(":");

  const talhoesEscolhidos = r.talhoes.map((id) => dados.talhoes.find((t) => t.id === id)).filter(Boolean);
  const talhoesDaTela = info.fazendas.length > 1
    ? info.talhoes.filter((t) => r.fazendas.includes(t.fazenda_id ?? SEM_FAZENDA))
    : info.talhoes;
  const nomeFazenda = (t) => (info.fazendas.length > 1 ? info.fazendas.find((f) => f.id === (t.fazenda_id ?? SEM_FAZENDA))?.nome : null);
  const operador = dados.funcionarios.find((f) => f.id === r.operador_id);
  const kg = paraNumero(r.peso) ?? 0;

  // Uma turma só: ela colheu todos os bags.
  const totalBags = Object.entries(r.bags)
    .filter(([id]) => (r.talhoes.length ? r.talhoes.includes(id) : id === "carga"))
    .reduce((a, [, v]) => a + (paraNumero(v) ?? 0), 0);
  const turmas = r.turmas.map((k) => ({
    nome: k.nome, valor: paraNumero(k.valor), bags: r.turmas.length === 1 ? totalBags : paraNumero(k.bags) ?? 0,
  }));
  const somaTurmas = turmas.reduce((a, k) => a + k.bags, 0);
  const conta = repartirTicket({
    talhoes: talhoesEscolhidos,
    bagsTalhao: Object.fromEntries(Object.entries(r.bags).map(([id, v]) => [id, paraNumero(v)])),
    turmas, peso: kg, emBags,
  });
  const kgPorBag = emBags && totalBags > 0 && kg > 0 ? kg / totalBags : null;
  const bagsBatem = turmas.length < 2 || somaTurmas === totalBags;

  // O que o 🔊 lê em cada tela.
  const talhaoDaTela = tipo === "bags" ? dados.talhoes.find((t) => t.id === chave) : null;
  const turmaDaTela = tipo === "turmaBags" || tipo === "turmaValor" ? r.turmas[Number(chave)] : null;
  const fala = {
    bags: talhaoDaTela
      ? `Quantos bags saíram do talhão ${talhaoDaTela.nome}?${r.bags[chave] ? ` Você digitou ${r.bags[chave]}.` : ""}`
      : `Quantos bags tem a carga?${r.bags.carga ? ` Você digitou ${r.bags.carga}.` : ""}`,
    turmaBags: `Quantos bags a ${turmaDaTela?.nome} colheu?${turmaDaTela?.bags ? ` Você digitou ${turmaDaTela.bags}.` : ""}`,
    turmaValor: `Quanto a ${turmaDaTela?.nome} cobra por tonelada?${turmaDaTela?.valor ? ` Está ${turmaDaTela.valor} reais.` : ""}`,
    peso: `${FALA.peso}${r.peso ? ` Você digitou ${r.peso} quilos.` : ""}${r.foto ? " A foto já foi tirada." : ""}${kgPorBag ? ` Cada bag deu ${numero(kgPorBag, 0)} quilos.` : ""}`,
    conferir: [
      bagsBatem ? null : `Atenção: os bags das turmas somam ${somaTurmas}, mas a carga tem ${totalBags}.`,
      `Quem lançou: ${operador?.nome}.`, `Venda de ${cultura?.nome}.`,
      talhoesEscolhidos.length ? `${talhoesEscolhidos.length > 1 ? "Talhões" : "Talhão"}: ${talhoesEscolhidos.map((t) => t.nome).join(", ")}.` : null,
      emBags && totalBags ? `${totalBags} bags.` : null,
      ...turmas.map((k) => `${k.nome}: ${k.bags} bags, ${paraTeclado(k.valor)} reais por tonelada.`),
      `Peso: ${r.peso} quilos.`, kgPorBag ? `Cada bag: ${numero(kgPorBag, 0)} quilos.` : null,
      `Dia: ${nomeDoDia(r.data)}.`, r.foto ? null : "Atenção: falta a foto do ticket.",
      "Se estiver tudo certo, toque em salvar.",
    ].filter(Boolean).join(" "),
  }[tipo] ?? FALA[tipo];

  useEffect(() => { falar(fala); }, [passo]); // eslint-disable-line react-hooks/exhaustive-deps

  const i = passos.indexOf(passo);
  const ir = (p) => { setErro(null); setPasso(p); window.scrollTo(0, 0); };
  // Os passos mudam conforme as escolhas: o próximo sai da lista já com a escolha nova.
  const seguirCom = (novoR) => {
    const lista = montarPassos(daCultura(dados, novoR.cultura_id), novoR);
    const proximo = lista[lista.indexOf(passo) + 1] ?? "conferir";
    // A última turma já vem com os bags que sobraram da carga.
    const ultima = novoR.turmas.length - 1;
    if (proximo === `turmaBags:${ultima}` && !novoR.turmas[ultima].bags) {
      const carga = Object.entries(novoR.bags)
        .filter(([id]) => (novoR.talhoes.length ? novoR.talhoes.includes(id) : id === "carga"))
        .reduce((a, [, v]) => a + (paraNumero(v) ?? 0), 0);
      const sobra = carga - novoR.turmas.slice(0, ultima).reduce((a, k) => a + (paraNumero(k.bags) ?? 0), 0);
      if (sobra > 0) mudarTurma(ultima, { bags: String(sobra) });
    }
    ir(proximo);
  };
  const seguir = () => seguirCom(r);
  const voltar = passo === "dia" ? () => ir("conferir") : i > 0 ? () => ir(passos[i - 1]) : () => irPara("/campo");
  const mudar = (patch) => setR((x) => ({ ...x, ...patch }));
  const mudarTurma = (n, patch) => setR((x) => ({ ...x, turmas: x.turmas.map((k, j) => (j === n ? { ...k, ...patch } : k)) }));

  const gravar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      const resumo = [
        `Lançado no celular (Modo Campo) por ${operador?.nome ?? "?"}`,
        emBags && totalBags ? `Carga: ${totalBags} bags, ${numero(kg, 0)} kg${kgPorBag ? `, ${numero(kgPorBag, 1)} kg por bag` : ""}` : null,
        talhoesEscolhidos.length > 1 ? `Talhões: ${conta.porTalhao.map((x) => `${x.talhao.nome}${emBags ? ` ${x.bags} bags` : ""}`).join(", ")}` : null,
        turmas.length > 1 ? `Turmas: ${turmas.map((k) => `${k.nome} ${k.bags} bags`).join(", ")}` : null,
        talhoesEscolhidos.length > 1 || turmas.length > 1 ? "peso repartido pelos bags" : null,
        emBags && r.naoSei ? "CONFERIR: turma não informada" : null,
        !r.foto ? "sem foto do ticket" : null,
      ].filter(Boolean).join(" · ");
      const preparados = conta.linhas.map((l) => prepararRegistro("vendas", {
        ...registroNovo("vendas"),
        data: r.data,
        cultura_id: l.talhao?.cultura_id ?? cultura.id,
        unidade: cultura.unidade || "t",
        talhao_id: l.talhao?.id ?? null,
        peso_liquido: l.peso_liquido,
        volumes: l.volumes,
        turma: emBags ? l.turma : null,
        custo_ton: emBags ? l.custo_ton ?? cultura.custo_turma_ton ?? null : null,
        a_conferir: true,
        foto_ticket: r.foto,
        observacao: resumo,
      }, dados));
      const falha = preparados.find((p) => p.erro);
      if (falha) throw new Error(falha.erro);
      for (const { reg } of preparados) await salvar("vendas", reg);
      vibrar([60, 60, 120]);
      ir("pronto");
    } catch (e) {
      setErro(String(e?.message ?? e));
    } finally {
      setSalvando(false);
    }
  };

  // Próximo ticket: mesma pessoa, cultura, talhões, turmas e valores; bags, peso e foto novos.
  const outroTicket = () => {
    const novoR = { ...r, bags: {}, peso: "", foto: null, turmas: r.turmas.map((k) => ({ ...k, bags: "" })) };
    setR(novoR);
    const lista = montarPassos(info, novoR);
    ir(lista.find((p) => p.startsWith("bags:") || p.startsWith("turmaBags:")) ?? "peso");
  };

  /** Teclado de número com o visor grande. */
  const telaNumero = ({ figura, titulo, valor, aoMudar, unidade, casas = 0, antes = null, depois = null, pode }) => {
    corpo = (
      <>
        <Pergunta figura={figura}>{titulo}</Pergunta>
        {antes}
        <div className="visor">
          {unidade === "R$" && <small>R$ </small>}
          {valor || <span className="apagado">0</span>}
          {unidade !== "R$" && <> <small>{unidade}</small></>}
        </div>
        {depois}
        <Teclado valor={valor} aoMudar={aoMudar} casas={casas} />
      </>
    );
    rodape = <Rodape aoVoltar={voltar} aoSeguir={seguir} podeSeguir={pode ?? (paraNumero(valor) > 0)} />;
  };

  let corpo;
  let rodape = <Rodape aoVoltar={voltar} />;
  switch (tipo) {
    case "operador":
      corpo = (
        <>
          <Pergunta figura="👤">Quem é você?</Pergunta>
          {lancadores(dados).length === 0 && <div className="campo-aviso">Nenhum funcionário cadastrado. Chame o gerente.</div>}
          <EscolherPessoa pessoas={lancadores(dados)} marcado={r.operador_id}
            aoEscolher={(id) => { const n = { ...r, operador_id: id }; setR(n); seguirCom(n); }} />
        </>
      );
      break;

    case "cultura":
      corpo = (
        <>
          <Pergunta figura="🚚">Venda de quê?</Pergunta>
          {culturas.length === 0 && <div className="campo-aviso">Nenhuma cultura cadastrada. Chame o gerente.</div>}
          <div className="campo-grade">
            {culturas.map((c) => (
              <Cartao key={c.id} marcado={r.cultura_id === c.id} fala={c.nome} aoTocar={() => {
                falar(c.nome);
                vibrar();
                // Trocou a cultura: fazendas, talhões e turmas eram da outra.
                const n = r.cultura_id === c.id ? r : { ...novo(), data: r.data, operador_id: r.operador_id, cultura_id: c.id };
                setR(n);
                seguirCom(n);
              }}>
                <span className="figura">{figuraCultura(c)}</span>
                <span>{c.nome}</span>
              </Cartao>
            ))}
          </div>
        </>
      );
      break;

    case "fazenda":
      corpo = (
        <>
          <Pergunta figura="🏡">Qual fazenda? <small>Pode marcar mais de uma</small></Pergunta>
          <div className="campo-grade">
            {info.fazendas.map((f) => {
              const marcado = r.fazendas.includes(f.id);
              return (
                <Cartao key={f.id} marcado={marcado} fala={f.nome} aoTocar={() => {
                  vibrar();
                  if (!marcado) falar(f.nome);
                  const fazendas = marcado ? r.fazendas.filter((x) => x !== f.id) : [...r.fazendas, f.id];
                  // Desmarcou a fazenda: saem os talhões dela.
                  const talhoes = r.talhoes.filter((id) => fazendas.includes(dados.talhoes.find((t) => t.id === id)?.fazenda_id ?? SEM_FAZENDA));
                  mudar({ fazendas, talhoes });
                }}>
                  <span className="figura">🏡</span>
                  <span>{f.nome}</span>
                </Cartao>
              );
            })}
          </div>
        </>
      );
      rodape = <Rodape aoVoltar={voltar} aoSeguir={seguir} podeSeguir={r.fazendas.length > 0} />;
      break;

    case "talhao":
      corpo = (
        <>
          <Pergunta figura="🗺️">Qual talhão? <small>Pode marcar mais de um</small></Pergunta>
          <div className="campo-grade">
            {talhoesDaTela.map((t) => {
              const marcado = r.talhoes.includes(t.id);
              return (
                <Cartao key={t.id} marcado={marcado} fala={t.nome} aoTocar={() => {
                  vibrar();
                  if (!marcado) falar(t.nome);
                  mudar({ talhoes: marcado ? r.talhoes.filter((x) => x !== t.id) : [...r.talhoes, t.id] });
                }}>
                  {t.foto ? <FotoOuInicial caminho={t.foto} nome={t.nome} /> : <span className="figura">🌳</span>}
                  <span>{t.nome}{nomeFazenda(t) && <><br /><small>{nomeFazenda(t)}</small></>}</span>
                </Cartao>
              );
            })}
          </div>
        </>
      );
      rodape = <Rodape aoVoltar={voltar} aoSeguir={seguir} podeSeguir={r.talhoes.length > 0} />;
      break;

    case "bags": {
      const t = talhaoDaTela;
      const varios = r.talhoes.length > 1;
      telaNumero({
        figura: "🧺",
        titulo: t ? (varios ? `Bags do talhão ${t.nome}` : `Bags da carga · ${t.nome}`) : "Bags da carga",
        valor: r.bags[chave] ?? "",
        aoMudar: (v) => mudar({ bags: { ...r.bags, [chave]: v } }),
        unidade: "bags",
        antes: t && (
          <div className="resumo-linha">
            {t.foto ? <FotoOuInicial caminho={t.foto} nome={t.nome} /> : <span className="figura">🌳</span>}
            <span>{t.nome}{nomeFazenda(t) && <small> · {nomeFazenda(t)}</small>}</span>
          </div>
        ),
        depois: varios && totalBags > 0 ? <p className="dica-anterior">Carga até agora: {totalBags} bags</p> : null,
      });
      break;
    }

    case "turma":
      corpo = (
        <>
          <Pergunta figura="👥">Qual turma colheu? <small>Pode marcar mais de uma</small></Pergunta>
          <div className="campo-grade">
            {info.turmas.map((nome) => {
              const marcado = r.turmas.some((k) => k.nome === nome);
              return (
                <Cartao key={nome} marcado={marcado} fala={nome} aoTocar={() => {
                  vibrar();
                  if (!marcado) falar(nome);
                  mudar({
                    naoSei: false,
                    turmas: marcado ? r.turmas.filter((k) => k.nome !== nome)
                      : [...r.turmas, { nome, bags: "", valor: valorDaTurma(dados, cultura, nome) }],
                  });
                }}>
                  <FotoOuInicial nome={nome} />
                  <span>{nome}</span>
                </Cartao>
              );
            })}
            <Cartao marcado={r.naoSei} fala="Não sei" aoTocar={() => {
              falar("Não sei");
              vibrar();
              const n = { ...r, naoSei: true, turmas: [] };
              setR(n);
              seguirCom(n);
            }}>
              <span className="figura">🤷</span>
              <span>Não sei</span>
            </Cartao>
          </div>
        </>
      );
      rodape = <Rodape aoVoltar={voltar} aoSeguir={seguir} podeSeguir={r.turmas.length > 0 || r.naoSei} />;
      break;

    case "turmaBags": {
      const n = Number(chave);
      const outras = turmas.reduce((a, k, j) => (j === n ? a : a + k.bags), 0);
      const falta = totalBags - outras;
      telaNumero({
        figura: "🧺",
        titulo: `Bags que a ${turmaDaTela.nome} colheu`,
        valor: turmaDaTela.bags,
        aoMudar: (v) => mudarTurma(n, { bags: v }),
        unidade: "bags",
        antes: (
          <div className="resumo-linha">
            <FotoOuInicial nome={turmaDaTela.nome} /><span>{turmaDaTela.nome}</span>
          </div>
        ),
        depois: <p className="dica-anterior">Carga: {totalBags} bags · {falta >= 0 ? `sobram ${falta} para esta turma` : `passou ${-falta}`}</p>,
      });
      break;
    }

    case "turmaValor": {
      const n = Number(chave);
      const t = turmas[n];
      telaNumero({
        figura: "💰",
        titulo: `Valor da ${turmaDaTela.nome} por tonelada`,
        valor: turmaDaTela.valor,
        aoMudar: (v) => mudarTurma(n, { valor: v }),
        unidade: "R$",
        casas: 2,
        antes: (
          <div className="resumo-linha">
            <FotoOuInicial nome={turmaDaTela.nome} /><span>{turmaDaTela.nome} <small>· {t.bags} bags</small></span>
          </div>
        ),
        depois: <p className="dica-anterior">R$ por tonelada colhida</p>,
      });
      break;
    }

    case "peso":
      corpo = (
        <>
          <Pergunta figura="⚖️">Peso líquido do ticket</Pergunta>
          <FotoComprovante caminho={r.foto} aoTirar={(c) => mudar({ foto: c })} texto="Tirar foto do ticket" lado={1600} />
          <div className="visor">{r.peso || <span className="apagado">0</span>} <small>kg</small></div>
          {kg > 0 && (
            <p className="dica-anterior">
              = {numero(kg / 1000, 3)} toneladas{kgPorBag && <><br /><b>🧺 cada bag: {numero(kgPorBag, 0)} kg</b> ({totalBags} bags)</>}
            </p>
          )}
          <Teclado valor={r.peso} aoMudar={(v) => mudar({ peso: v })} />
        </>
      );
      rodape = <Rodape aoVoltar={voltar} aoSeguir={seguir} podeSeguir={kg > 0} />;
      break;

    case "dia":
      corpo = (
        <>
          <Pergunta figura="📅">Qual dia?</Pergunta>
          <div className="menu-campo">
            {DIAS.map(([n, nome]) => (
              <Cartao key={n} marcado={r.data === diasAtras(n)} fala={nome} aoTocar={() => {
                falar(nome);
                vibrar();
                mudar({ data: diasAtras(n) });
                ir("conferir");
              }}>
                <span className="figura">📅</span>
                <span>{nome} <small>{dataBr(diasAtras(n))}</small></span>
              </Cartao>
            ))}
          </div>
        </>
      );
      break;

    case "conferir": {
      const primeiroBags = passos.find((p) => p.startsWith("bags:"));
      corpo = (
        <>
          <Pergunta figura="👀">Está certo?</Pergunta>
          {!bagsBatem && <div className="campo-aviso erro">⚠️ As turmas somam {somaTurmas} bags, mas a carga tem {totalBags}. Toque na turma para corrigir.</div>}
          {!r.foto && <div className="campo-aviso">⚠️ Falta a foto do ticket. Toque no peso para tirar.</div>}
          {erro && <div className="campo-aviso erro">{erro}</div>}
          <div className="resumo-linha" onClick={() => ir("operador")}>
            <FotoOuInicial caminho={operador?.foto} nome={operador?.nome ?? "?"} /><span>{operador?.nome}</span>
          </div>
          <div className="resumo-linha" onClick={() => ir("cultura")}>
            <span className="figura">{figuraCultura(cultura)}</span><span>{cultura?.nome}</span>
          </div>
          {conta.porTalhao.map((x) => (
            <div key={x.talhao.id} className="resumo-linha"
              onClick={() => ir(emBags ? `bags:${x.talhao.id}` : "talhao")}>
              {x.talhao.foto ? <FotoOuInicial caminho={x.talhao.foto} nome={x.talhao.nome} /> : <span className="figura">🌳</span>}
              <span>
                {x.talhao.nome}{nomeFazenda(x.talhao) && <small> · {nomeFazenda(x.talhao)}</small>}
                <br /><small>{emBags ? `🧺 ${x.bags} bags · ` : ""}{numero(x.kg, 0)} kg</small>
              </span>
            </div>
          ))}
          {emBags && !talhoesEscolhidos.length && (
            <div className="resumo-linha" onClick={() => primeiroBags && ir(primeiroBags)}>
              <span className="figura">🧺</span><span>{totalBags} bags</span>
            </div>
          )}
          {conta.porTurma.map((k, n) => (
            <div key={k.nome} className="resumo-linha" onClick={() => ir(r.turmas.length > 1 ? `turmaBags:${n}` : `turmaValor:${n}`)}>
              <FotoOuInicial nome={k.nome} />
              <span>
                {k.nome}
                <br /><small>🧺 {k.bags} bags · {numero(k.kg, 0)} kg · {brl(k.valor)}/t = {brl(k.pagar)}</small>
              </span>
            </div>
          ))}
          {emBags && r.naoSei && (
            <div className="resumo-linha" onClick={() => ir("turma")}>
              <span className="figura">🤷</span><span>Turma: não sei</span>
            </div>
          )}
          <div className="resumo-linha" onClick={() => ir("peso")}>
            <span className="figura">⚖️</span>
            <span>
              {r.peso} kg <small>· {numero(kg / 1000, 3)} t{r.foto ? " · foto ✓" : ""}</small>
              {kgPorBag && <><br /><small>🧺 cada bag: {numero(kgPorBag, 0)} kg</small></>}
            </span>
          </div>
          <div className="resumo-linha" onClick={() => ir("dia")}>
            <span className="figura">📅</span>
            <span>{nomeDoDia(r.data)} <small>{dataBr(r.data)}</small></span>
          </div>
        </>
      );
      rodape = (
        <footer className="campo-rodape">
          <button type="button" className="campo-btn cinza" onClick={voltar}>◀ Voltar</button>
          <button type="button" className="campo-btn verde" onClick={gravar} disabled={salvando || !bagsBatem}>
            {salvando ? "Salvando…" : "✓ Salvar"}
          </button>
        </footer>
      );
      break;
    }

    default: // pronto
      corpo = (
        <div className="pronto">
          <div className="check">✅</div>
          <h2>Pronto! <Ouvir texto={FALA.pronto} className="na-pergunta" /></h2>
          <p>Ticket guardado.</p>
        </div>
      );
      rodape = (
        <footer className="campo-rodape">
          <button type="button" className="campo-btn cinza" onClick={() => irPara("/campo")}>🏠 Início</button>
          <button type="button" className="campo-btn verde" onClick={outroTicket}>🧾 Outro ticket</button>
        </footer>
      );
  }

  return (
    <div className="campo-app">
      <Topo titulo="Ticket da balança" figura="🧾" pergunta={fala} />
      {i >= 0 && <Passos total={passos.length} atual={i} />}
      <div className="campo-corpo">{corpo}</div>
      {rodape}
    </div>
  );
}
