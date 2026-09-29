import { useCallback, useEffect, useMemo, useState } from "react";

import { BotaoCamera, Miniatura } from "../components/Foto";
import { useFoto } from "../hooks/useFoto";
import { useSync } from "../hooks/useSync";
import { EMOJI_LOCAL, hoje, prepararRegistro, registroNovo } from "../lib/esquema";
import { numero } from "../lib/formato";
import { localMaisPerto, minhaPosicao } from "../lib/mapa";

/**
 * Modo motorista: telas para quem não lê. Uma pergunta por tela, respostas em
 * blocos grandes com figura (ou a foto do lugar), e o celular fala a pergunta
 * e o que foi escolhido. Tudo grava no aparelho e sobe quando tiver internet.
 * O escritório confere depois e coloca o valor do frete.
 */

const CHAVE_PERFIL = "fcc-motorista";
const CHAVE_SOM = "fcc-som";

const lerLocal = (chave, padrao) => {
  try { return JSON.parse(localStorage.getItem(chave)) ?? padrao; } catch { return padrao; }
};
const gravarLocal = (chave, valor) => {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* sem armazenamento: pergunta de novo na próxima vez */ }
};

let somLigado = lerLocal(CHAVE_SOM, true);

/** O celular lê o texto em voz alta (voz em português do aparelho). */
function falar(texto) {
  try {
    const voz = window.speechSynthesis;
    if (!somLigado || !voz || !texto) return;
    voz.cancel();
    const u = new SpeechSynthesisUtterance(texto.replace(/[^\p{L}\p{N}\s,.!?/-]/gu, ""));
    u.lang = "pt-BR";
    u.rate = 0.95;
    voz.speak(u);
  } catch { /* sem voz neste aparelho */ }
}

const emojiLocal = (l) => EMOJI_LOCAL[l?.tipo] ?? "📍";
const numeroOuNulo = (v) => (v === "" || v == null || Number.isNaN(Number(v)) ? null : Number(v));

// ─── Peças da tela ──────────────────────────────────────────────────────────

/** Bloco grande de escolha: foto (se tiver) ou figura, e o nome embaixo. */
function Bloco({ emoji, fotoId, titulo, sub, selo, cor, marcado, aoTocar }) {
  const { src } = useFoto(fotoId);
  return (
    <button type="button" className={`bloco ${cor ?? ""} ${marcado ? "marcado" : ""}`} onClick={aoTocar}>
      {selo && <span className="bloco-selo">{selo}</span>}
      {src ? <img src={src} alt="" /> : <span className="bloco-emoji">{emoji}</span>}
      <b>{titulo}</b>
      {sub && <small>{sub}</small>}
    </button>
  );
}

/** Uma pergunta por tela: voltar, a pergunta (falada ao abrir) e o botão de repetir. */
function Pergunta({ texto, voltar, children }) {
  useEffect(() => { falar(texto); }, [texto]);
  return (
    <div className="mot-passo">
      <div className="mot-pergunta">
        <button type="button" className="mot-redondo" onClick={voltar} aria-label="Voltar">⬅️</button>
        <h2>{texto}</h2>
        <button type="button" className="mot-redondo" onClick={() => falar(texto)} aria-label="Ouvir de novo">🔊</button>
      </div>
      {children}
    </div>
  );
}

function BotaoGrande({ emoji, texto, cor = "verde", aoTocar, desativado }) {
  return (
    <button type="button" className={`mot-grande ${cor}`} onClick={aoTocar} disabled={desativado}>
      <span>{emoji}</span> {texto}
    </button>
  );
}

/** Número grande com botões de mais e menos (quem não escreve só toca). */
function Contador({ valor, setValor, unidade, emoji }) {
  const n = Number(valor) || 0;
  const passos = unidade === "kg" ? [100, 1000] : unidade === "tonelada" ? [1, 5] : [1, 10];
  const mudar = (d) => setValor(String(Math.max(0, +(n + d).toFixed(2))));
  return (
    <div className="contador">
      <div className="contador-numero">
        <span>{emoji}</span>
        <input type="number" inputMode="decimal" min="0" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0" aria-label="Quantidade" />
        {unidade && <small>{unidade}</small>}
      </div>
      <div className="contador-botoes">
        {[...passos].reverse().map((p) => <button type="button" key={-p} className="menos" onClick={() => mudar(-p)}>−{p}</button>)}
        {passos.map((p) => <button type="button" key={p} className="mais" onClick={() => mudar(p)}>+{p}</button>)}
      </div>
    </div>
  );
}

/** Tira a foto e mostra grande, com "tirar de novo". */
function PassoFoto({ fotoId, setFotoId, origem, texto }) {
  return (
    <div className="mot-foto">
      {fotoId && <Miniatura id={fotoId} tamanho={220} />}
      <BotaoCamera className={`mot-grande ${fotoId ? "cinza" : "azul"}`} origem={origem} aoTirar={(id) => { setFotoId(id); falar("Foto guardada"); }}>
        <span>📷</span> {fotoId ? "Tirar de novo" : texto}
      </BotaoCamera>
    </div>
  );
}

/** Pilha de passos: avançar empilha, voltar desempilha (no primeiro, sai). */
function usePassos(primeiro, aoSair) {
  const [pilha, setPilha] = useState([primeiro]);
  return {
    passo: pilha[pilha.length - 1],
    ir: (p) => setPilha((x) => [...x, p]),
    voltar: () => (pilha.length > 1 ? setPilha((x) => x.slice(0, -1)) : aoSair()),
  };
}

/** Posição do celular ao abrir a tela (para marcar "você está aqui"). */
function usePosicao() {
  const [pos, setPos] = useState(null);
  useEffect(() => {
    let vivo = true;
    minhaPosicao({ precisa: false, espera: 12000 }).then((p) => vivo && setPos(p)).catch(() => {});
    return () => { vivo = false; };
  }, []);
  return pos;
}

// ─── Quem é o motorista e qual caminhão ─────────────────────────────────────

function EscolherPerfil({ dados, aoEscolher, aoCancelar }) {
  const { passo, ir, voltar } = usePassos("motorista", aoCancelar);
  const [motoristaId, setMotoristaId] = useState(null);
  const ativos = dados.funcionarios.filter((f) => f.ativo !== false);
  const soMotoristas = ativos.filter((f) => /motorista/i.test(f.funcao ?? ""));
  const pessoas = (soMotoristas.length ? soMotoristas : ativos).sort((a, b) => a.nome.localeCompare(b.nome));
  const caminhoes = dados.maquinas.filter((m) => m.categoria === "caminhao" && m.ativo !== false);

  if (passo === "motorista") {
    return (
      <Pergunta texto="Quem é você?" voltar={voltar}>
        {!pessoas.length && <div className="aviso info">Cadastre o motorista em Funcionários (função Motorista).</div>}
        <div className="blocos">
          {pessoas.map((f) => (
            <Bloco key={f.id} emoji="👤" titulo={f.nome} aoTocar={() => {
              falar(f.nome);
              setMotoristaId(f.id);
              if (caminhoes.length === 1) aoEscolher({ motorista_id: f.id, caminhao_id: caminhoes[0].id });
              else ir("caminhao");
            }} />
          ))}
        </div>
      </Pergunta>
    );
  }
  return (
    <Pergunta texto="Qual caminhão?" voltar={voltar}>
      {!caminhoes.length && <div className="aviso info">Cadastre o caminhão em Máquinas → Inventário (categoria Caminhão).</div>}
      <div className="blocos">
        {caminhoes.map((c) => (
          <Bloco key={c.id} emoji="🚚" titulo={c.nome} sub={c.placa} aoTocar={() => { falar(c.nome); aoEscolher({ motorista_id: motoristaId, caminhao_id: c.id }); }} />
        ))}
      </div>
    </Pergunta>
  );
}

// ─── Nova viagem ────────────────────────────────────────────────────────────

function NovaViagem({ dados, perfil, salvar, aoTerminar, aoCancelar }) {
  const { passo, ir, voltar } = usePassos("origem", aoCancelar);
  const [v, setV] = useState({ origem_id: null, destino_id: null, carga_id: null, vazio: false, quantidade: "", foto_id: null });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);
  const pos = usePosicao();

  const locais = useMemo(() => dados.locais.filter((l) => l.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome)), [dados.locais]);
  const aqui = useMemo(() => (pos ? localMaisPerto(locais, pos) : null), [locais, pos]);
  const cargas = useMemo(() => dados.cargas.filter((c) => c.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome)), [dados.cargas]);

  const origem = locais.find((l) => l.id === v.origem_id);
  const destino = locais.find((l) => l.id === v.destino_id);
  const carga = cargas.find((c) => c.id === v.carga_id);
  const escolher = (patch, proximo, dito) => { falar(dito); setV((x) => ({ ...x, ...patch })); ir(proximo); };

  const gravar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      const { reg } = prepararRegistro("fretes", {
        ...registroNovo("fretes"),
        data: hoje(), caminhao_id: perfil.caminhao_id, motorista_id: perfil.motorista_id,
        origem_id: v.origem_id, destino_id: v.destino_id,
        carga_id: v.vazio ? null : v.carga_id,
        quantidade: v.vazio ? null : numeroOuNulo(v.quantidade),
        unidade: v.vazio ? null : carga?.unidade ?? null,
        foto_id: v.foto_id, conferido: false,
        observacao: v.vazio ? "Viagem vazia (sem carga)" : null,
      });
      await salvar("fretes", reg);
      aoTerminar();
    } catch (e) {
      setErro(String(e?.message ?? e));
      setSalvando(false);
    }
  };

  const listaLocais = (excluir, aoTocar) => {
    const lista = [...locais.filter((l) => l.id !== excluir)].sort((a, b) => (b.id === aqui?.id) - (a.id === aqui?.id));
    if (!lista.length) return <div className="aviso info">Peça ao escritório para cadastrar os locais das rotas (Caminhões → Locais das rotas).</div>;
    return (
      <div className="blocos">
        {lista.map((l) => (
          <Bloco key={l.id} emoji={emojiLocal(l)} fotoId={l.foto_id} titulo={l.nome} selo={l.id === aqui?.id ? "📍 Você está aqui" : null}
            aoTocar={() => aoTocar(l)} />
        ))}
      </div>
    );
  };

  switch (passo) {
    case "origem":
      return (
        <Pergunta texto="De onde você está saindo?" voltar={voltar}>
          {listaLocais(null, (l) => escolher({ origem_id: l.id }, "destino", l.nome))}
        </Pergunta>
      );
    case "destino":
      return (
        <Pergunta texto="Para onde você vai?" voltar={voltar}>
          {listaLocais(v.origem_id, (l) => escolher({ destino_id: l.id }, "carga", l.nome))}
        </Pergunta>
      );
    case "carga":
      return (
        <Pergunta texto="O que está levando?" voltar={voltar}>
          <div className="blocos">
            {cargas.map((c) => (
              <Bloco key={c.id} emoji={c.emoji || "📦"} fotoId={c.foto_id} titulo={c.nome}
                aoTocar={() => escolher({ carga_id: c.id, vazio: false }, "quantidade", c.nome)} />
            ))}
            <Bloco emoji="🚫" titulo="Vazio" sub="sem carga" cor="cinza" aoTocar={() => escolher({ carga_id: null, vazio: true, quantidade: "" }, "confirmar", "Vazio")} />
          </div>
        </Pergunta>
      );
    case "quantidade":
      return (
        <Pergunta texto={`Quanto de ${carga?.nome ?? "carga"}?`} voltar={voltar}>
          <Contador valor={v.quantidade} setValor={(q) => setV((x) => ({ ...x, quantidade: q }))} unidade={carga?.unidade} emoji={carga?.emoji || "📦"} />
          <BotaoGrande emoji="✅" texto="Pronto" desativado={!(Number(v.quantidade) > 0)}
            aoTocar={() => { falar(`${v.quantidade} ${carga?.unidade ?? ""}`); ir("foto"); }} />
        </Pergunta>
      );
    case "foto":
      return (
        <Pergunta texto="Tem nota ou ticket da balança? Tire uma foto." voltar={voltar}>
          <PassoFoto fotoId={v.foto_id} setFotoId={(id) => setV((x) => ({ ...x, foto_id: id }))} origem="fretes.foto_id" texto="Tirar foto" />
          <BotaoGrande emoji={v.foto_id ? "✅" : "➡️"} texto={v.foto_id ? "Continuar" : "Não tenho"} cor={v.foto_id ? "verde" : "cinza"} aoTocar={() => ir("confirmar")} />
        </Pergunta>
      );
    default: {
      const resumo = `Saindo de ${origem?.nome} para ${destino?.nome}. ${v.vazio ? "Vazio" : `${v.quantidade} ${carga?.unidade ?? ""} de ${carga?.nome}`}.`;
      return (
        <Pergunta texto="Está certo?" voltar={voltar}>
          <div className="mot-resumo" onClick={() => falar(resumo)}>
            <div className="mot-rota">
              <span>{emojiLocal(origem)}<b>{origem?.nome}</b></span>
              <span className="seta">➡️</span>
              <span>{emojiLocal(destino)}<b>{destino?.nome}</b></span>
            </div>
            <div className="mot-carga">
              {v.vazio ? <>🚫 <b>Vazio</b></> : <>{carga?.emoji || "📦"} <b>{numero(v.quantidade)} {carga?.unidade}</b> {carga?.nome}</>}
            </div>
            {v.foto_id && <Miniatura id={v.foto_id} tamanho={90} />}
          </div>
          {erro && <div className="aviso">{erro}</div>}
          <BotaoGrande emoji="✅" texto={salvando ? "Salvando…" : "Salvar"} aoTocar={gravar} desativado={salvando} />
          <BotaoGrande emoji="✖️" texto="Cancelar" cor="cinza" aoTocar={aoCancelar} />
        </Pergunta>
      );
    }
  }
}

// ─── Abastecimento ──────────────────────────────────────────────────────────

function Abasteci({ dados, perfil, salvar, aoTerminar, aoCancelar }) {
  const { passo, ir, voltar } = usePassos("onde", aoCancelar);
  const [a, setA] = useState({ tanque: false, posto: null, foto_ticket_id: null, foto_painel_id: null, leitura: "", litros: "" });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);
  const pos = usePosicao();

  const postos = useMemo(() => dados.locais.filter((l) => l.tipo === "posto" && l.ativo !== false), [dados.locais]);
  const aqui = useMemo(() => (pos ? localMaisPerto(postos, pos) : null), [postos, pos]);
  const escolher = (patch, proximo, dito) => { falar(dito); setA((x) => ({ ...x, ...patch })); ir(proximo); };

  const gravar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      const { reg } = prepararRegistro("abastecimentos", {
        ...registroNovo("abastecimentos"),
        data: hoje(), origem: a.tanque ? "tanque" : "posto", posto: a.posto,
        maquina_id: perfil.caminhao_id, operador_id: perfil.motorista_id,
        litros: numeroOuNulo(a.litros), leitura: numeroOuNulo(a.leitura),
        foto_ticket_id: a.foto_ticket_id, foto_painel_id: a.foto_painel_id, conferido: false,
      });
      await salvar("abastecimentos", reg);
      aoTerminar();
    } catch (e) {
      setErro(String(e?.message ?? e));
      setSalvando(false);
    }
  };

  switch (passo) {
    case "onde":
      return (
        <Pergunta texto="Onde você abasteceu?" voltar={voltar}>
          <div className="blocos">
            {[...postos].sort((x, y) => (y.id === aqui?.id) - (x.id === aqui?.id)).map((l) => (
              <Bloco key={l.id} emoji="⛽" fotoId={l.foto_id} titulo={l.nome} selo={l.id === aqui?.id ? "📍 Você está aqui" : null}
                aoTocar={() => escolher({ tanque: false, posto: l.nome }, "ticket", l.nome)} />
            ))}
            <Bloco emoji="⛽" titulo={postos.length ? "Outro posto" : "Posto"} aoTocar={() => escolher({ tanque: false, posto: null }, "ticket", "Posto")} />
            <Bloco emoji="🏡" titulo="Tanque da fazenda" cor="cinza" aoTocar={() => escolher({ tanque: true, posto: null, foto_ticket_id: null }, "painel", "Tanque da fazenda")} />
          </div>
        </Pergunta>
      );
    case "ticket":
      return (
        <Pergunta texto="Tire uma foto do ticket do posto" voltar={voltar}>
          <PassoFoto fotoId={a.foto_ticket_id} setFotoId={(id) => setA((x) => ({ ...x, foto_ticket_id: id }))} origem="abastecimentos.foto_ticket_id" texto="Foto do ticket" />
          {a.foto_ticket_id && <BotaoGrande emoji="✅" texto="Continuar" aoTocar={() => ir("painel")} />}
        </Pergunta>
      );
    case "painel":
      return (
        <Pergunta texto="Tire uma foto do painel mostrando o quilômetro" voltar={voltar}>
          <PassoFoto fotoId={a.foto_painel_id} setFotoId={(id) => setA((x) => ({ ...x, foto_painel_id: id }))} origem="abastecimentos.foto_painel_id" texto="Foto do painel" />
          <div className="mot-numero">
            <span>🛣️</span>
            <input type="number" inputMode="numeric" placeholder="km (se souber)" value={a.leitura} onChange={(e) => setA((x) => ({ ...x, leitura: e.target.value }))} aria-label="Quilômetro do painel" />
          </div>
          {(a.foto_painel_id || a.leitura) && <BotaoGrande emoji="✅" texto="Continuar" aoTocar={() => ir("litros")} />}
        </Pergunta>
      );
    case "litros":
      return (
        <Pergunta texto="Quantos litros? Se não souber, aperte não sei." voltar={voltar}>
          <div className="mot-numero">
            <span>⛽</span>
            <input type="number" inputMode="decimal" placeholder="litros" value={a.litros} onChange={(e) => setA((x) => ({ ...x, litros: e.target.value }))} aria-label="Litros" />
          </div>
          <BotaoGrande emoji={a.litros ? "✅" : "🤷"} texto={a.litros ? "Continuar" : "Não sei"} cor={a.litros ? "verde" : "cinza"} aoTocar={() => ir("confirmar")} />
        </Pergunta>
      );
    default:
      return (
        <Pergunta texto="Está certo?" voltar={voltar}>
          <div className="mot-resumo">
            <div className="mot-carga">{a.tanque ? "🏡" : "⛽"} <b>{a.tanque ? "Tanque da fazenda" : a.posto || "Posto"}</b></div>
            <div className="mot-fotos">
              {a.foto_ticket_id && <Miniatura id={a.foto_ticket_id} tamanho={110} />}
              {a.foto_painel_id && <Miniatura id={a.foto_painel_id} tamanho={110} />}
            </div>
            {a.leitura && <div className="mot-carga">🛣️ <b>{numero(a.leitura, 0)} km</b></div>}
            {a.litros && <div className="mot-carga">⛽ <b>{numero(a.litros, 1)} litros</b></div>}
          </div>
          {erro && <div className="aviso">{erro}</div>}
          <BotaoGrande emoji="✅" texto={salvando ? "Salvando…" : "Salvar"} aoTocar={gravar} desativado={salvando} />
          <BotaoGrande emoji="✖️" texto="Cancelar" cor="cinza" aoTocar={aoCancelar} />
        </Pergunta>
      );
  }
}

// ─── Tela principal ─────────────────────────────────────────────────────────

function Salvo({ aoFechar }) {
  const { online } = useSync();
  useEffect(() => {
    falar("Pronto, salvo!");
    const t = setTimeout(aoFechar, 5000);
    return () => clearTimeout(t);
  }, [aoFechar]);
  return (
    <div className="mot-salvo" onClick={aoFechar}>
      <span>✅</span>
      <b>Salvo!</b>
      {!online && <small>📵 Sem internet agora. Vai sozinho para o escritório quando o sinal voltar.</small>}
    </div>
  );
}

function StatusEnvio() {
  const s = useSync();
  if (!s.configurado) return <span className="mot-status">📱</span>;
  if (!s.online) return <span className="mot-status" title="Sem internet">📵 {s.pendentes || ""}</span>;
  if (s.pendentes || s.sincronizando) return <span className="mot-status" title="Enviando">⏳ {s.pendentes || ""}</span>;
  return <span className="mot-status" title="Tudo enviado">☁️✅</span>;
}

export default function Motorista({ dados, salvar, sairDoModo }) {
  const [perfil, setPerfil] = useState(() => lerLocal(CHAVE_PERFIL, {}));
  const [tela, setTela] = useState("inicio");
  const [som, setSom] = useState(somLigado);

  const motorista = dados.funcionarios.find((f) => f.id === perfil.motorista_id);
  const caminhao = dados.maquinas.find((m) => m.id === perfil.caminhao_id);
  const inicio = useCallback(() => setTela("inicio"), []);
  const salvo = useCallback(() => setTela("salvo"), []);

  const alternarSom = () => {
    somLigado = !som;
    gravarLocal(CHAVE_SOM, somLigado);
    setSom(somLigado);
    if (somLigado) falar("Som ligado");
    else window.speechSynthesis?.cancel();
  };

  const hojeIso = hoje();
  const viagensHoje = dados.fretes.filter((f) => f.caminhao_id === perfil.caminhao_id && f.data === hojeIso);
  const abastHoje = dados.abastecimentos.filter((a) => a.maquina_id === perfil.caminhao_id && a.data === hojeIso);
  const local = (id) => dados.locais.find((l) => l.id === id);
  const cargaDe = (id) => dados.cargas.find((c) => c.id === id);

  let conteudo;
  if (!motorista || !caminhao || tela === "perfil") {
    conteudo = (
      <EscolherPerfil dados={dados} aoCancelar={inicio}
        aoEscolher={(p) => { gravarLocal(CHAVE_PERFIL, p); setPerfil(p); inicio(); }} />
    );
  } else if (tela === "viagem") {
    conteudo = <NovaViagem dados={dados} perfil={perfil} salvar={salvar} aoTerminar={salvo} aoCancelar={inicio} />;
  } else if (tela === "abastecer") {
    conteudo = <Abasteci dados={dados} perfil={perfil} salvar={salvar} aoTerminar={salvo} aoCancelar={inicio} />;
  } else if (tela === "salvo") {
    conteudo = <Salvo aoFechar={inicio} />;
  } else {
    conteudo = (
      <>
        <button type="button" className="mot-quem" onClick={() => setTela("perfil")}>
          <span>👤 <b>{motorista.nome}</b></span>
          <span>🚚 <b>{caminhao.nome}</b>{caminhao.placa ? ` · ${caminhao.placa}` : ""}</span>
        </button>
        <BotaoGrande emoji="🚚" texto="Nova viagem" aoTocar={() => { falar("Nova viagem"); setTela("viagem"); }} />
        <BotaoGrande emoji="⛽" texto="Abasteci" cor="laranja" aoTocar={() => { falar("Abasteci"); setTela("abastecer"); }} />

        {(viagensHoje.length > 0 || abastHoje.length > 0) && (
          <div className="mot-hoje">
            <h3>📅 Hoje</h3>
            {viagensHoje.map((f) => {
              const c = cargaDe(f.carga_id);
              return (
                <div key={f.id} className="mot-linha">
                  <span>{emojiLocal(local(f.origem_id))} {local(f.origem_id)?.nome ?? f.origem ?? "?"}</span>
                  <span>➡️</span>
                  <span>{emojiLocal(local(f.destino_id))} {local(f.destino_id)?.nome ?? f.destino ?? "?"}</span>
                  <span className="mot-linha-carga">{c ? `${c.emoji || "📦"} ${numero(f.quantidade)}` : "🚫"}</span>
                </div>
              );
            })}
            {abastHoje.map((a) => (
              <div key={a.id} className="mot-linha">
                <span>⛽ {a.origem === "tanque" ? "Tanque da fazenda" : a.posto || "Posto"}</span>
                <span className="mot-linha-carga">{a.litros ? `${numero(a.litros, 0)} L` : "📷"}</span>
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="motorista">
      <header className="mot-topo">
        <img src="/fazenda-192.png" alt="" />
        <span className="espaco" />
        <StatusEnvio />
        <button type="button" className="mot-redondo" onClick={alternarSom} aria-label={som ? "Desligar som" : "Ligar som"}>{som ? "🔊" : "🔇"}</button>
      </header>
      <main className="mot-corpo">{conteudo}</main>
      {tela === "inicio" && (
        <footer className="mot-rodape">
          <button type="button" className="btn" onClick={() => window.confirm("Sair do modo motorista e voltar ao sistema completo?") && sairDoModo()}>
            Sair do modo motorista
          </button>
        </footer>
      )}
    </div>
  );
}
