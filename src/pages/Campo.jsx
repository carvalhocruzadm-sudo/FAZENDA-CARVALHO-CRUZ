import { useEffect, useMemo, useState } from "react";

import {
  Cartao, FiguraServico, FotoComprovante, FotoOuInicial, Ouvir, Passos, Pergunta, Rodape, Teclado, Topo,
} from "../components/CampoUI";
import { useDados } from "../hooks/useDados";
import { Entrada, Produto, Saida } from "./CampoDeposito";
import {
  falar, lancamentosDoPA, maquinasDoPA, operadores, paraNumero, servicoPorNome, servicos, vibrar,
} from "../lib/campo";
import { hoje, prepararRegistro } from "../lib/esquema";
import { guardarFotosDosCadastros } from "../lib/fotos";
import { numero } from "../lib/formato";

/**
 * Modo Campo: as telas dos tratoristas, abertas pelo QR code.
 *   /campo                      → o que vai fazer (abastecer, tirar ou guardar no depósito)
 *   /campo/abastecer            → escolher o trator
 *   /campo/abastecer/<máquina>  → abastecimento no PA (QR colado em cada trator)
 *   /campo/saida, /entrada, /produto/<id> → depósito de químicos (CampoDeposito.jsx)
 *
 * Uma pergunta por tela, figura grande, poucas palavras e o botão 🔊 que lê
 * a pergunta em voz alta.
 */

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

  // O que o 🔊 lê em cada tela: a pergunta e, quando já tem, o que foi digitado.
  const falaHorimetro = `${FALA.horimetro}${r.leitura ? ` Você digitou ${r.leitura} horas.` : ""}${r.foto_leitura ? " A foto já foi tirada." : ""}`;
  const falaLitros = `${FALA.litros}${r.litros ? ` Você digitou ${r.litros} litros.` : ""}${r.foto_bomba ? " A foto já foi tirada." : ""}`;
  const falaConferir = resumo ? [
    resumo.aviso ? `Atenção: ${resumo.aviso}` : null,
    `Operador: ${operador?.nome}.`, `Serviço: ${r.operacao}.`,
    `${nomesTalhoes.length > 1 ? "Talhões" : "Talhão"}: ${nomesTalhoes.join(" e ")}.`,
    `Horímetro: ${r.leitura} horas.`, `Diesel: ${r.litros} litros.`,
    "Se estiver tudo certo, toque em salvar.",
  ].filter(Boolean).join(" ") : "";
  const falaTopo = { horimetro: falaHorimetro, litros: falaLitros, conferir: falaConferir }[passo] ?? FALA[passo];

  let corpo;
  let rodape;
  switch (passo) {
    case "operador":
      corpo = (
        <>
          <Pergunta figura="👤">Quem é você?</Pergunta>
          <div className="campo-grade">
            {operadores(dados).map((f) => (
              <Cartao key={f.id} marcado={r.operador_id === f.id} fala={f.nome}
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
              <Cartao key={s.id} marcado={r.operacao === s.nome} fala={s.nome}
                aoTocar={() => { mudar({ operacao: s.nome }); falar(s.nome); vibrar(); ir("talhao"); }}>
                <FiguraServico servico={s} />
                <span>{s.nome}</span>
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
                <Cartao key={t.id} marcado={marcado} fala={t.nome} aoTocar={() => {
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
            <FiguraServico servico={servicoPorNome(dados, r.operacao)} /><span>{r.operacao}</span>
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
          <h2>Pronto! <Ouvir texto={FALA.pronto} className="na-pergunta" /></h2>
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
      <Topo maquina={maquina} pergunta={falaTopo} />
      {i >= 0 && <Passos total={PASSOS.length} atual={i} />}
      <div className="campo-corpo">{corpo}</div>
      {rodape}
    </div>
  );
}

// ─── Início ─────────────────────────────────────────────────────────────────

/** /campo/abastecer: escolher o trator (quando não veio pelo QR do trator). */
function EscolherTrator({ dados, irPara }) {
  useEffect(() => { falar("Toque no trator que você vai abastecer."); }, []);
  const maquinas = maquinasDoPA(dados);
  return (
    <div className="campo-app">
      <Topo titulo="Abastecer" figura="⛽" pergunta="Toque no trator que você vai abastecer." />
      <div className="campo-corpo">
        <Pergunta figura="⛽">Qual trator?</Pergunta>
        {maquinas.length === 0 && <div className="campo-aviso">Nenhum trator com horímetro cadastrado. Chame o gerente.</div>}
        <div className="campo-grade">
          {maquinas.map((m) => (
            <Cartao key={m.id} fala={m.nome} aoTocar={() => { falar(m.nome); irPara(`/campo/abastecer/${m.id}`); }}>
              {m.foto ? <FotoOuInicial caminho={m.foto} nome={m.nome} /> : <span className="figura">🚜</span>}
              <span>{m.nome}</span>
            </Cartao>
          ))}
        </div>
      </div>
      <Rodape aoVoltar={() => irPara("/campo")} />
    </div>
  );
}

const FALA_INICIO = "O que você vai fazer? Abastecer o trator, tirar produto do depósito, ou guardar produto no depósito.";

function Inicio({ irPara, sair, voltarAoSistema }) {
  useEffect(() => { falar(FALA_INICIO); }, []);
  const opcoes = [
    ["/campo/abastecer", "⛽", "Abastecer trator"],
    ["/campo/saida", "📤", "Tirar do depósito (pulverização)"],
    ["/campo/entrada", "📥", "Guardar no depósito"],
  ];
  return (
    <div className="campo-app">
      <Topo titulo="Fazenda Carvalho Cruz" figura="🌱" pergunta={FALA_INICIO} />
      <div className="campo-corpo">
        <Pergunta figura="👋">O que vai fazer?</Pergunta>
        <div className="menu-campo">
          {opcoes.map(([destino, figura, texto]) => (
            <Cartao key={destino} fala={texto} aoTocar={() => { falar(texto); irPara(destino); }}>
              <span className="figura">{figura}</span><span>{texto}</span>
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
  const props = { dados, salvar, irPara };
  switch (acao) {
    case "abastecer":
      return id ? <Abastecer key={id} {...props} maquinaId={id} /> : <EscolherTrator {...props} />;
    case "saida":
      return <Saida key={caminho} {...props} />;
    case "entrada":
      return <Entrada key={caminho} {...props} produtoInicial={id ?? null} />;
    case "produto":
      return <Produto key={id} {...props} id={id} />;
    default:
      return <Inicio irPara={irPara} sair={sair} voltarAoSistema={voltarAoSistema} />;
  }
}
