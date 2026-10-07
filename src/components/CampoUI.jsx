import { BotaoFoto, Foto } from "./Foto";
import { useSync } from "../hooks/useSync";
import { falar, vibrar } from "../lib/campo";

/**
 * Peças das telas do Modo Campo (tratoristas): cartões grandes com foto,
 * botão 🔊, teclado numérico gigante, rodapé com Voltar/Próximo.
 */

const CORES = ["#2d6a4f", "#e4761a", "#1f6f9f", "#8e44ad", "#b0413e", "#6d7f1c", "#9c6b30", "#2c7a7b"];

/** Sem foto cadastrada: a primeira letra num quadrado colorido. */
export function Inicial({ nome }) {
  const cor = CORES[[...String(nome)].reduce((s, c) => s + c.charCodeAt(0), 0) % CORES.length];
  return <div className="inicial" style={{ background: cor }}>{String(nome).trim().charAt(0).toUpperCase()}</div>;
}

export function FotoOuInicial({ caminho, nome }) {
  return <Foto caminho={caminho} alt={nome} className="foto" reserva={<Inicial nome={nome} />} />;
}

/** Botão pequeno de alto-falante: lê o texto sem escolher nada. */
export function Ouvir({ texto, className = "" }) {
  return (
    <button type="button" className={`btn-ouvir ${className}`} aria-label={`Ouvir: ${texto}`}
      onClick={(e) => { e.stopPropagation(); falar(texto); }}>🔊</button>
  );
}

/** Um item para tocar (pessoa, serviço, talhão), com o 🔊 que lê o nome. */
export function Cartao({ marcado, aoTocar, fala, children }) {
  return (
    <div className="campo-item">
      <button type="button" className={`campo-cartao ${marcado ? "marcado" : ""}`} onClick={aoTocar} aria-pressed={marcado}>
        {marcado && <span className="marca-ok">✓</span>}
        {children}
      </button>
      {fala && <Ouvir texto={fala} />}
    </div>
  );
}

export function FiguraServico({ servico }) {
  return servico.foto
    ? <Foto caminho={servico.foto} alt={servico.nome} className="foto" reserva={<span className="figura">{servico.figura}</span>} />
    : <span className="figura">{servico.figura}</span>;
}

export function IndicadorSyncCampo() {
  const s = useSync();
  if (!s.configurado) return null;
  const [cor, titulo] = !s.online ? ["cinza", "Sem internet: guardado no celular"]
    : s.pendentes || s.falhas ? ["amarelo", "Enviando…"] : ["verde", "Tudo enviado"];
  return <span className={`campo-sync ${cor}`} title={titulo} aria-label={titulo} />;
}

export function Topo({ maquina, titulo, pergunta, figura = "🚜" }) {
  return (
    <header className="campo-topo">
      {maquina?.foto
        ? <Foto caminho={maquina.foto} className="miniatura-topo" alt="" />
        : <span className="miniatura-topo emoji">{figura}</span>}
      <b>{maquina?.nome ?? titulo}</b>
      <IndicadorSyncCampo />
      <button type="button" className="btn-som" onClick={() => falar(pergunta)} aria-label="Ouvir">🔊</button>
    </header>
  );
}

export function Passos({ total, atual }) {
  return (
    <div className="campo-passos" aria-label={`Passo ${atual + 1} de ${total}`}>
      {Array.from({ length: total }, (_, i) => <i key={i} className={i < atual ? "feito" : i === atual ? "atual" : ""} />)}
    </div>
  );
}

export function Pergunta({ figura, children }) {
  return <h2 className="campo-pergunta"><span className="emoji">{figura}</span>{children}</h2>;
}

export function Rodape({ aoVoltar, aoSeguir, podeSeguir = true, textoSeguir = "Próximo" }) {
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
export function Teclado({ valor, aoMudar, casas = 1 }) {
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

export function FotoComprovante({ caminho, aoTirar, texto, lado = 1280 }) {
  return (
    <BotaoFoto aoTirar={aoTirar} lado={lado} camera="environment" className={`campo-foto-btn ${caminho ? "ok" : ""}`}>
      {caminho ? <Foto caminho={caminho} className="miniatura" /> : <span className="emoji">📷</span>}
      <span>{caminho ? "Foto tirada ✓" : texto}</span>
    </BotaoFoto>
  );
}

/** "Quem é você?": as fotos da equipe; tocar já escolhe. */
export function EscolherPessoa({ pessoas, marcado, aoEscolher }) {
  return (
    <div className="campo-grade">
      {pessoas.map((f) => (
        <Cartao key={f.id} marcado={marcado === f.id} fala={f.nome}
          aoTocar={() => { falar(f.nome); vibrar(); aoEscolher(f.id); }}>
          <FotoOuInicial caminho={f.foto} nome={f.nome} />
          <span>{f.nome}</span>
        </Cartao>
      ))}
    </div>
  );
}

/** Foto do produto químico: a primeira foto do rótulo do cadastro; sem foto, um frasco. */
export function FotoProduto({ insumo, className = "foto" }) {
  const foto = insumo?.fotos_rotulo?.[0];
  return foto ? <img src={foto} alt={insumo.nome} className={className} draggable={false} /> : <span className="figura">🧴</span>;
}
