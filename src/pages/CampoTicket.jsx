import { useEffect, useMemo, useState } from "react";

import {
  Cartao, EscolherPessoa, FotoComprovante, FotoOuInicial, Ouvir, Passos, Pergunta, Rodape, Teclado, Topo,
} from "../components/CampoUI";
import { falar, operadores, paraNumero, vibrar } from "../lib/campo";
import { ESQUEMA, hoje, prepararRegistro, registroNovo } from "../lib/esquema";
import { data as dataBr, numero } from "../lib/formato";

/**
 * Modo Campo → Ticket da balança (/campo/ticket): o mesmo lançamento da tela
 * "Ticket da balança" do escritório, mas para quem não lê — uma pergunta por
 * tela, figuras, 🔊 e o teclado grande. Tira a foto do ticket, que vai junto.
 *
 * A venda fica sem comprador e sem preço, marcada "Falta completar": o
 * escritório confere pela foto, completa e desmarca.
 */

const PASSOS = ["operador", "cultura", "fazenda", "talhao", "turma", "peso", "conferir"];

const SEM_FAZENDA = "sem";

const FALA = {
  operador: "Quem é você? Toque na sua foto.",
  cultura: "Venda de quê? Toque na figura.",
  fazenda: "De qual fazenda saiu a carga? Toque nela.",
  talhao: "De qual talhão saiu a carga? Toque nele.",
  turma: "Qual turma colheu? Toque nela. Se não souber, toque em não sei.",
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

const NAO_SEI = "__nao_sei__";

const novo = () => ({
  data: hoje(), operador_id: null, cultura_id: null, fazenda: null, talhao_id: null, turma: null, peso: "", foto: null,
});

/**
 * O que muda conforme a cultura: os talhões dela (nenhum marcado com ela =
 * todos), as fazendas desses talhões e quais perguntas aparecem — fazenda só
 * com mais de uma, turma só se a cultura é colhida por turma.
 */
function caminhoDaCultura(dados, culturaId) {
  const cultura = dados.culturas.find((c) => c.id === culturaId);
  const porTurma = Boolean(cultura?.turma_colheita);
  const turmas = porTurma ? turmasDaCultura(dados, cultura) : [];
  const ativos = dados.talhoes.filter((t) => t.ativo !== false).sort(ESQUEMA.talhoes.ordem);
  const daCultura = ativos.filter((t) => t.cultura_id === culturaId);
  const talhoesDaCultura = daCultura.length ? daCultura : ativos;
  const ids = new Set(talhoesDaCultura.map((t) => t.fazenda_id ?? SEM_FAZENDA));
  const fazendas = dados.fazendas
    .filter((f) => ids.has(f.id))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }))
    .map((f) => ({ id: f.id, nome: f.nome }));
  if (ids.has(SEM_FAZENDA)) fazendas.push({ id: SEM_FAZENDA, nome: "Outros talhões" });
  const passos = PASSOS.filter((p) => {
    if (p === "fazenda") return fazendas.length > 1;
    if (p === "talhao") return talhoesDaCultura.length > 0;
    if (p === "turma") return turmas.length > 0;
    return true;
  });
  return { cultura, porTurma, fazendas, talhoesDaCultura, turmas, passos };
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

export default function CampoTicket({ dados, salvar, irPara }) {
  const [passo, setPasso] = useState("operador");
  const [r, setR] = useState(novo);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  useEffect(() => { falar(FALA[passo]); }, [passo]);

  const culturas = useMemo(
    () => dados.culturas.filter((c) => c.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [dados.culturas],
  );

  const { cultura, porTurma, fazendas, talhoesDaCultura, turmas, passos } = caminhoDaCultura(dados, r.cultura_id);
  const talhoes = fazendas.length > 1 && r.fazenda
    ? talhoesDaCultura.filter((t) => (t.fazenda_id ?? SEM_FAZENDA) === r.fazenda)
    : talhoesDaCultura;

  // "dia" não é um passo da sequência: abre pela tela de conferir e volta para ela.
  const i = passos.indexOf(passo);
  const ir = (p) => { setErro(null); setPasso(p); window.scrollTo(0, 0); };
  const proximoDe = (p) => passos[passos.indexOf(p) + 1];
  const voltar = passo === "dia" ? () => ir("conferir") : i > 0 ? () => ir(passos[i - 1]) : () => irPara("/campo");
  const mudar = (patch) => setR((x) => ({ ...x, ...patch }));

  const operador = dados.funcionarios.find((f) => f.id === r.operador_id);
  const talhao = dados.talhoes.find((t) => t.id === r.talhao_id);
  const nomeFazenda = fazendas.length > 1 ? fazendas.find((f) => f.id === r.fazenda)?.nome : null;
  const kg = paraNumero(r.peso) ?? 0;
  const turma = r.turma && r.turma !== NAO_SEI ? r.turma : null;

  // O valor por tonelada da turma: o último que ela cobrou; sem histórico, o padrão da cultura.
  const custoTon = () => {
    if (!porTurma) return null;
    const ultima = turma && dados.vendas
      .filter((v) => v.turma === turma && v.custo_ton != null)
      .sort((a, b) => String(b.data).localeCompare(String(a.data)))[0];
    return ultima ? ultima.custo_ton : cultura?.custo_turma_ton ?? null;
  };

  const gravar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      const obs = [
        `Lançado no celular (Modo Campo) por ${operador?.nome ?? "?"}`,
        porTurma && !turma ? "CONFERIR: turma não informada" : null,
        !r.foto ? "sem foto do ticket" : null,
      ].filter(Boolean).join(" · ");
      const { reg, erro: e } = prepararRegistro("vendas", {
        ...registroNovo("vendas"),
        data: r.data,
        cultura_id: cultura.id,
        unidade: cultura.unidade || "t",
        talhao_id: r.talhao_id,
        peso_liquido: kg,
        turma: porTurma ? turma : null,
        custo_ton: custoTon(),
        a_conferir: true,
        foto_ticket: r.foto,
        observacao: obs,
      }, dados);
      if (e) throw new Error(e);
      await salvar("vendas", reg);
      vibrar([60, 60, 120]);
      ir("pronto");
    } catch (e) {
      setErro(String(e?.message ?? e));
    } finally {
      setSalvando(false);
    }
  };

  // Próximo ticket: mesma pessoa, cultura, talhão, turma e dia; só peso e foto novos.
  const outroTicket = () => { mudar({ peso: "", foto: null }); ir("peso"); };

  const falaPeso = `${FALA.peso}${r.peso ? ` Você digitou ${r.peso} quilos.` : ""}${r.foto ? " A foto já foi tirada." : ""}`;
  const falaConferir = [
    `Quem lançou: ${operador?.nome}.`, `Venda de ${cultura?.nome}.`,
    nomeFazenda ? `Fazenda: ${nomeFazenda}.` : null,
    talhao ? `Talhão: ${talhao.nome}.` : null,
    porTurma ? `Turma: ${turma ?? "não sei"}.` : null,
    `Peso: ${r.peso} quilos.`, `Dia: ${nomeDoDia(r.data)}.`,
    r.foto ? null : "Atenção: falta a foto do ticket.",
    "Se estiver tudo certo, toque em salvar.",
  ].filter(Boolean).join(" ");
  const falaTopo = { peso: falaPeso, conferir: falaConferir }[passo] ?? FALA[passo];

  let corpo;
  let rodape = <Rodape aoVoltar={voltar} />;
  switch (passo) {
    case "operador":
      corpo = (
        <>
          <Pergunta figura="👤">Quem é você?</Pergunta>
          {operadores(dados).length === 0 && <div className="campo-aviso">Nenhum funcionário cadastrado. Chame o gerente.</div>}
          <EscolherPessoa pessoas={operadores(dados)} marcado={r.operador_id}
            aoEscolher={(id) => { mudar({ operador_id: id }); ir(proximoDe("operador")); }} />
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
                // Trocou a cultura: fazenda, talhão e turma eram da outra.
                if (r.cultura_id !== c.id) mudar({ cultura_id: c.id, fazenda: null, talhao_id: null, turma: null });
                // Os passos seguintes dependem da cultura (tem fazenda? turma?).
                const seguintes = caminhoDaCultura(dados, c.id).passos;
                ir(seguintes[seguintes.indexOf("cultura") + 1]);
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
          <Pergunta figura="🏡">Qual fazenda?</Pergunta>
          <div className="campo-grade">
            {fazendas.map((f) => (
              <Cartao key={f.id} marcado={r.fazenda === f.id} fala={f.nome} aoTocar={() => {
                falar(f.nome);
                vibrar();
                mudar(r.fazenda === f.id ? {} : { fazenda: f.id, talhao_id: null });
                ir(proximoDe("fazenda"));
              }}>
                <span className="figura">🏡</span>
                <span>{f.nome}</span>
              </Cartao>
            ))}
          </div>
        </>
      );
      break;

    case "talhao":
      corpo = (
        <>
          <Pergunta figura="🗺️">Qual talhão?</Pergunta>
          <div className="campo-grade">
            {talhoes.map((t) => (
              <Cartao key={t.id} marcado={r.talhao_id === t.id} fala={t.nome} aoTocar={() => {
                falar(t.nome);
                vibrar();
                mudar({ talhao_id: t.id });
                ir(proximoDe("talhao"));
              }}>
                {t.foto ? <FotoOuInicial caminho={t.foto} nome={t.nome} /> : <span className="figura">🌳</span>}
                <span>{t.nome}</span>
              </Cartao>
            ))}
          </div>
        </>
      );
      break;

    case "turma":
      corpo = (
        <>
          <Pergunta figura="👥">Qual turma colheu?</Pergunta>
          <div className="campo-grade">
            {turmas.map((t) => (
              <Cartao key={t} marcado={r.turma === t} fala={t} aoTocar={() => {
                falar(t);
                vibrar();
                mudar({ turma: t });
                ir(proximoDe("turma"));
              }}>
                <FotoOuInicial nome={t} />
                <span>{t}</span>
              </Cartao>
            ))}
            <Cartao marcado={r.turma === NAO_SEI} fala="Não sei" aoTocar={() => {
              falar("Não sei");
              vibrar();
              mudar({ turma: NAO_SEI });
              ir(proximoDe("turma"));
            }}>
              <span className="figura">🤷</span>
              <span>Não sei</span>
            </Cartao>
          </div>
        </>
      );
      break;

    case "peso":
      corpo = (
        <>
          <Pergunta figura="⚖️">Peso líquido do ticket</Pergunta>
          <FotoComprovante caminho={r.foto} aoTirar={(c) => mudar({ foto: c })} texto="Tirar foto do ticket" lado={1600} />
          <div className="visor">{r.peso || <span className="apagado">0</span>} <small>kg</small></div>
          {kg > 0 && <p className="dica-anterior">= {numero(kg / 1000, 3)} toneladas</p>}
          <Teclado valor={r.peso} aoMudar={(v) => mudar({ peso: v })} />
        </>
      );
      rodape = <Rodape aoVoltar={voltar} aoSeguir={() => ir(proximoDe("peso"))} podeSeguir={kg > 0} />;
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

    case "conferir":
      corpo = (
        <>
          <Pergunta figura="👀">Está certo?</Pergunta>
          {!r.foto && <div className="campo-aviso">⚠️ Falta a foto do ticket. Toque no peso para tirar.</div>}
          {erro && <div className="campo-aviso erro">{erro}</div>}
          <div className="resumo-linha" onClick={() => ir("operador")}>
            <FotoOuInicial caminho={operador?.foto} nome={operador?.nome ?? "?"} /><span>{operador?.nome}</span>
          </div>
          <div className="resumo-linha" onClick={() => ir("cultura")}>
            <span className="figura">{figuraCultura(cultura)}</span><span>{cultura?.nome}</span>
          </div>
          {talhao && (
            <div className="resumo-linha" onClick={() => ir("talhao")}>
              <span className="figura">🗺️</span>
              <span>{talhao.nome}{nomeFazenda && <small> · {nomeFazenda}</small>}</span>
            </div>
          )}
          {passos.includes("turma") && (
            <div className="resumo-linha" onClick={() => ir("turma")}>
              <span className="figura">👥</span><span>{turma ?? "Turma: não sei"}</span>
            </div>
          )}
          <div className="resumo-linha" onClick={() => ir("peso")}>
            <span className="figura">⚖️</span>
            <span>{r.peso} kg <small>· {numero(kg / 1000, 3)} t{r.foto ? " · foto ✓" : ""}</small></span>
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
          <button type="button" className="campo-btn verde" onClick={gravar} disabled={salvando}>
            {salvando ? "Salvando…" : "✓ Salvar"}
          </button>
        </footer>
      );
      break;

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
      <Topo titulo="Ticket da balança" figura="🧾" pergunta={falaTopo} />
      {i >= 0 && <Passos total={passos.length} atual={i} />}
      <div className="campo-corpo">{corpo}</div>
      {rodape}
    </div>
  );
}
