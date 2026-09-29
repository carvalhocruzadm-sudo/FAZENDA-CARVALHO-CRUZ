import { useEffect, useMemo, useState } from "react";

import { BotaoFoto, Foto } from "../components/Foto";
import { useDados } from "../hooks/useDados";
import { useSync } from "../hooks/useSync";
import {
  falar, figuraServico, lancamentosDoPA, maquinasDoPA, operadores, paraNumero, servicos, vibrar,
} from "../lib/campo";
import { hoje, prepararRegistro } from "../lib/esquema";
import { guardarFotosDosCadastros } from "../lib/fotos";
import { numero } from "../lib/formato";

/**
 * Modo Campo: as telas dos tratoristas, abertas pelo QR code.
 *   /campo                      → escolher o trator
 *   /campo/abastecer/<máquina>  → abastecimento no PA (QR colado em cada trator)
 *
 * Uma pergunta por tela, figura grande, poucas palavras e o botão 🔊 que lê
 * a pergunta em voz alta.
 */

// ─── Peças da tela ──────────────────────────────────────────────────────────

const CORES = ["#2d6a4f", "#e4761a", "#1f6f9f", "#8e44ad", "#b0413e", "#6d7f1c", "#9c6b30", "#2c7a7b"];

/** Sem foto cadastrada: a primeira letra num quadrado colorido. */
function Inicial({ nome }) {
  const cor = CORES[[...String(nome)].reduce((s, c) => s + c.charCodeAt(0), 0) % CORES.length];
  return <div className="inicial" style={{ background: cor }}>{String(nome).trim().charAt(0).toUpperCase()}</div>;
}

function FotoOuInicial({ caminho, nome }) {
  return <Foto caminho={caminho} alt={nome} className="foto" reserva={<Inicial nome={nome} />} />;
}

function Cartao({ marcado, aoTocar, children }) {
  return (
    <button type="button" className={`campo-cartao ${marcado ? "marcado" : ""}`} onClick={aoTocar} aria-pressed={marcado}>
      {marcado && <span className="marca-ok">✓</span>}
      {children}
    </button>
  );
}

function IndicadorSyncCampo() {
  const s = useSync();
  if (!s.configurado) return null;
  const [cor, titulo] = !s.online ? ["cinza", "Sem internet: guardado no celular"]
    : s.pendentes || s.falhas ? ["amarelo", "Enviando…"] : ["verde", "Tudo enviado"];
  return <span className={`campo-sync ${cor}`} title={titulo} aria-label={titulo} />;
}

function Topo({ maquina, titulo, pergunta }) {
  return (
    <header className="campo-topo">
      {maquina?.foto
        ? <Foto caminho={maquina.foto} className="miniatura-topo" alt="" />
        : <span className="miniatura-topo emoji">🚜</span>}
      <b>{maquina?.nome ?? titulo}</b>
      <IndicadorSyncCampo />
      <button type="button" className="btn-som" onClick={() => falar(pergunta)} aria-label="Ouvir">🔊</button>
    </header>
  );
}

function Passos({ total, atual }) {
  return (
    <div className="campo-passos" aria-label={`Passo ${atual + 1} de ${total}`}>
      {Array.from({ length: total }, (_, i) => <i key={i} className={i < atual ? "feito" : i === atual ? "atual" : ""} />)}
    </div>
  );
}

function Pergunta({ figura, children }) {
  return <h2 className="campo-pergunta"><span className="emoji">{figura}</span>{children}</h2>;
}

function Rodape({ aoVoltar, aoSeguir, podeSeguir = true, textoSeguir = "Próximo" }) {
  return (
    <footer className="campo-rodape">
      {aoVoltar && <button type="button" className="campo-btn cinza" onClick={aoVoltar}>◀ Voltar</button>}
      {aoSeguir && (
        <button type="button" className="campo-btn verde" onClick={aoSeguir} disabled={!podeSeguir}>
          {textoSeguir} ▶
        </button>
      )}
    </footer>
  );
}

/** Teclado numérico grande (horímetro, litros). */
function Teclado({ valor, aoMudar, casas = 1 }) {
  const digitar = (t) => {
    vibrar(20);
    if (t === "⌫") return aoMudar(valor.slice(0, -1));
    if (t === ",") return aoMudar(valor.includes(",") ? valor : `${valor || "0"},`);
    const [, dec] = valor.split(",");
    if (dec != null && dec.length >= casas) return undefined;
    if (valor.replace(",", "").length >= 8) return undefined;
    return aoMudar(valor === "0" ? t : valor + t);
  };
  return (
    <div className="teclado">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "⌫"].map((t) => (
        <button key={t} type="button" onClick={() => digitar(t)} aria-label={t === "⌫" ? "Apagar" : t}>{t}</button>
      ))}
    </div>
  );
}

function FotoComprovante({ caminho, aoTirar, texto }) {
  return (
    <BotaoFoto aoTirar={aoTirar} lado={1280} camera="environment" className={`campo-foto-btn ${caminho ? "ok" : ""}`}>
      {caminho ? <Foto caminho={caminho} className="miniatura" /> : <span className="emoji">📷</span>}
      <span>{caminho ? "Foto tirada ✓" : texto}</span>
    </BotaoFoto>
  );
}

// ─── Abastecimento no PA ────────────────────────────────────────────────────

const PASSOS = ["operador", "servico", "talhao", "horimetro", "litros", "conferir"];

const FALA = {
  operador: "Quem é você? Toque na sua foto.",
  servico: "Qual serviço você fez hoje?",
  talhao: "Em qual talhão? Pode marcar mais de um. Depois toque em próximo.",
  horimetro: "Tire a foto do horímetro e digite as horas que estão marcando agora.",
  litros: "Tire a foto da bomba e digite quantos litros de diesel colocou.",
  conferir: "Confira. Se estiver tudo certo, toque em salvar.",
  pronto: "Pronto! Abastecimento guardado. Obrigado.",
};

function Abastecer({ dados, salvar, maquinaId, irPara }) {
  const maquina = dados.maquinas.find((m) => m.id === maquinaId);
  const [passo, setPasso] = useState("operador");
  const [r, setR] = useState({ operador_id: null, operacao: null, talhoes: [], leitura: "", litros: "", foto_leitura: null, foto_bomba: null });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  useEffect(() => { falar(FALA[passo]); }, [passo]);

  const talhoes = useMemo(() => dados.talhoes
    .filter((t) => t.ativo !== false)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true })), [dados.talhoes]);

  if (!maquina) {
    return (
      <div className="campo-app">
        <Topo titulo="Trator não encontrado" pergunta="Este QR code não é de nenhum trator cadastrado." />
        <div className="campo-corpo"><div className="campo-aviso">Este QR code não é de nenhum trator cadastrado. Chame o gerente.</div></div>
        <Rodape aoVoltar={() => irPara("/campo")} />
      </div>
    );
  }

  const i = PASSOS.indexOf(passo);
  const ir = (p) => { setErro(null); setPasso(p); window.scrollTo(0, 0); };
  const voltar = i > 0 ? () => ir(PASSOS[i - 1]) : () => irPara("/campo");
  const seguir = () => ir(PASSOS[i + 1]);
  const mudar = (patch) => setR((x) => ({ ...x, ...patch }));

  const resumo = passo === "conferir"
    ? lancamentosDoPA(dados, { ...r, maquina_id: maquina.id, leitura: paraNumero(r.leitura), litros: paraNumero(r.litros) }, hoje())
    : null;

  const gravar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      const preparados = [
        ...resumo.abastecimentos.map((reg) => ["abastecimentos", prepararRegistro("abastecimentos", reg)]),
        ...resumo.operacoes.map((reg) => ["operacoes", prepararRegistro("operacoes", reg)]),
      ];
      const falha = preparados.find(([, p]) => p.erro);
      if (falha) throw new Error(falha[1].erro);
      for (const [colecao, { reg }] of preparados) await salvar(colecao, reg);
      vibrar([60, 60, 120]);
      ir("pronto");
    } catch (e) {
      setErro(String(e?.message ?? e));
    } finally {
      setSalvando(false);
    }
  };

  const operador = dados.funcionarios.find((f) => f.id === r.operador_id);
  const nomesTalhoes = r.talhoes.map((id) => dados.talhoes.find((t) => t.id === id)?.nome).filter(Boolean);

  let corpo;
  let rodape;
  switch (passo) {
    case "operador":
      corpo = (
        <>
          <Pergunta figura="👤">Quem é você?</Pergunta>
          <div className="campo-grade">
            {operadores(dados).map((f) => (
              <Cartao key={f.id} marcado={r.operador_id === f.id}
                aoTocar={() => { mudar({ operador_id: f.id }); falar(f.nome); vibrar(); ir("servico"); }}>
                <FotoOuInicial caminho={f.foto} nome={f.nome} />
                <span>{f.nome}</span>
              </Cartao>
            ))}
          </div>
        </>
      );
      rodape = <Rodape aoVoltar={voltar} />;
      break;

    case "servico":
      corpo = (
        <>
          <Pergunta figura="🛠️">Qual serviço?</Pergunta>
          <div className="campo-grade">
            {servicos(dados).map((s) => (
              <Cartao key={s} marcado={r.operacao === s}
                aoTocar={() => { mudar({ operacao: s }); falar(s); vibrar(); ir("talhao"); }}>
                <span className="figura">{figuraServico(s)}</span>
                <span>{s}</span>
              </Cartao>
            ))}
          </div>
        </>
      );
      rodape = <Rodape aoVoltar={voltar} />;
      break;

    case "talhao":
      corpo = (
        <>
          <Pergunta figura="🗺️">Qual talhão? <small>Pode marcar mais de um</small></Pergunta>
          <div className="campo-grade">
            {talhoes.map((t) => {
              const marcado = r.talhoes.includes(t.id);
              return (
                <Cartao key={t.id} marcado={marcado} aoTocar={() => {
                  vibrar();
                  if (!marcado) falar(t.nome);
                  mudar({ talhoes: marcado ? r.talhoes.filter((x) => x !== t.id) : [...r.talhoes, t.id] });
                }}>
                  {t.foto ? <FotoOuInicial caminho={t.foto} nome={t.nome} /> : <span className="figura">🌳</span>}
                  <span>{t.nome}</span>
                </Cartao>
              );
            })}
          </div>
        </>
      );
      rodape = <Rodape aoVoltar={voltar} aoSeguir={seguir} podeSeguir={r.talhoes.length > 0} />;
      break;

    case "horimetro": {
      const ultima = lancamentosDoPA(dados, { ...r, maquina_id: maquina.id, talhoes: [], leitura: 0, litros: 0 }, hoje()).anterior;
      corpo = (
        <>
          <Pergunta figura="⏱️">Horímetro agora</Pergunta>
          <FotoComprovante caminho={r.foto_leitura} aoTirar={(c) => mudar({ foto_leitura: c })} texto="Tirar foto do horímetro" />
          <div className="visor">{r.leitura || <span className="apagado">0</span>} <small>h</small></div>
          {ultima != null && <p className="dica-anterior">Última vez: {numero(ultima, 1)} h</p>}
          <Teclado valor={r.leitura} aoMudar={(v) => mudar({ leitura: v })} />
        </>
      );
      rodape = <Rodape aoVoltar={voltar} aoSeguir={seguir} podeSeguir={paraNumero(r.leitura) > 0} />;
      break;
    }

    case "litros":
      corpo = (
        <>
          <Pergunta figura="⛽">Litros de diesel</Pergunta>
          <FotoComprovante caminho={r.foto_bomba} aoTirar={(c) => mudar({ foto_bomba: c })} texto="Tirar foto da bomba" />
          <div className="visor">{r.litros || <span className="apagado">0</span>} <small>L</small></div>
          <Teclado valor={r.litros} aoMudar={(v) => mudar({ litros: v })} />
        </>
      );
      rodape = <Rodape aoVoltar={voltar} aoSeguir={seguir} podeSeguir={paraNumero(r.litros) > 0} />;
      break;

    case "conferir":
      corpo = (
        <>
          <Pergunta figura="👀">Está certo?</Pergunta>
          {resumo.aviso && <div className="campo-aviso">⚠️ {resumo.aviso}</div>}
          {erro && <div className="campo-aviso erro">{erro}</div>}
          <div className="resumo-linha" onClick={() => ir("operador")}>
            <FotoOuInicial caminho={operador?.foto} nome={operador?.nome ?? "?"} /><span>{operador?.nome}</span>
          </div>
          <div className="resumo-linha" onClick={() => ir("servico")}>
            <span className="figura">{figuraServico(r.operacao)}</span><span>{r.operacao}</span>
          </div>
          <div className="resumo-linha" onClick={() => ir("talhao")}>
            <span className="figura">🗺️</span><span>{nomesTalhoes.join(" + ")}</span>
          </div>
          <div className="resumo-linha" onClick={() => ir("horimetro")}>
            <span className="figura">⏱️</span>
            <span>{r.leitura} h{resumo.horas != null && resumo.horas >= 0 && <small> · trabalhou {numero(resumo.horas, 1)} h</small>}</span>
          </div>
          <div className="resumo-linha" onClick={() => ir("litros")}>
            <span className="figura">⛽</span>
            <span>{r.litros} L{resumo.consumo != null && <small> · {numero(resumo.consumo, 1)} L por hora</small>}</span>
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
          <h2>Pronto!</h2>
          <p>Abastecimento guardado.</p>
        </div>
      );
      rodape = (
        <footer className="campo-rodape">
          <button type="button" className="campo-btn verde" onClick={() => irPara("/campo")}>🏠 Início</button>
        </footer>
      );
  }

  return (
    <div className="campo-app">
      <Topo maquina={maquina} pergunta={FALA[passo]} />
      {i >= 0 && <Passos total={PASSOS.length} atual={i} />}
      <div className="campo-corpo">{corpo}</div>
      {rodape}
    </div>
  );
}

// ─── Início ─────────────────────────────────────────────────────────────────

function Inicio({ dados, irPara, sair, voltarAoSistema }) {
  useEffect(() => { falar("Toque no trator que você vai abastecer."); }, []);
  const maquinas = maquinasDoPA(dados);
  return (
    <div className="campo-app">
      <Topo titulo="Abastecer" pergunta="Toque no trator que você vai abastecer." />
      <div className="campo-corpo">
        <Pergunta figura="⛽">Qual trator?</Pergunta>
        {maquinas.length === 0 && <div className="campo-aviso">Nenhum trator com horímetro cadastrado. Chame o gerente.</div>}
        <div className="campo-grade">
          {maquinas.map((m) => (
            <Cartao key={m.id} aoTocar={() => { falar(m.nome); irPara(`/campo/abastecer/${m.id}`); }}>
              {m.foto ? <FotoOuInicial caminho={m.foto} nome={m.nome} /> : <span className="figura">🚜</span>}
              <span>{m.nome}</span>
            </Cartao>
          ))}
        </div>
        <div className="campo-links">
          {voltarAoSistema && <button type="button" className="btn" onClick={voltarAoSistema}>⟵ Voltar ao sistema completo</button>}
          {sair && <button type="button" className="btn" onClick={() => window.confirm("Sair da conta neste celular?") && sair()}>Sair da conta</button>}
        </div>
      </div>
    </div>
  );
}

/**
 * `voltarAoSistema` só existe para quem tem o sistema completo; a conta do
 * Modo Campo fica presa aqui.
 */
export default function ModoCampo({ caminho, irPara, sair, voltarAoSistema }) {
  const { dados, pronto, erro, salvar } = useDados();

  useEffect(() => { if (pronto) guardarFotosDosCadastros(dados); }, [pronto, dados]);

  if (!pronto) return <div className="vazio">Carregando…</div>;
  if (erro) return <div className="aviso">Erro ao abrir o banco do aparelho: {erro}</div>;

  const [, , acao, id] = caminho.split("/");
  if (acao === "abastecer" && id) {
    return <Abastecer key={id} dados={dados} salvar={salvar} maquinaId={id} irPara={irPara} />;
  }
  return <Inicio dados={dados} irPara={irPara} sair={sair} voltarAoSistema={voltarAoSistema} />;
}
