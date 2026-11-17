import { useEffect, useState } from "react";

import {
  Cartao, EscolherPessoa, FotoComprovante, FotoOuInicial, Ouvir, Passos, Pergunta, Rodape, Teclado, Topo,
} from "../components/CampoUI";
import { Foto } from "../components/Foto";
import { falar, operadores, paraNumero, vibrar } from "../lib/campo";
import { hoje, prepararRegistro } from "../lib/esquema";
import { data as dataBR, numero } from "../lib/formato";

/**
 * /campo/chuva — lançar a chuva do pluviômetro, no celular.
 *   quem é você → (qual pluviômetro, se tiver mais de um) → foto → milímetros → conferir
 *
 * A foto é obrigatória: é ela que mostra ao escritório o nível da água no copo.
 */

const FALA = {
  pessoa: "Quem é você? Toque na sua foto.",
  pluviometro: "Qual pluviômetro você leu? Toque nele.",
  foto: "Vá até o pluviômetro e tire a foto mostrando a água no copo.",
  mm: "Digite quantos milímetros de chuva o pluviômetro está marcando. Se não choveu, digite zero.",
  conferir: "Confira. Se estiver tudo certo, toque em salvar. Depois esvazie o copo do pluviômetro.",
  pronto: "Pronto! Chuva guardada. Não esqueça de esvaziar o copo do pluviômetro.",
};

/** Os pluviômetros já usados nos lançamentos (o mais usado primeiro). */
function pluviometros(dados) {
  const contagem = new Map();
  for (const c of dados.chuvas ?? []) {
    const nome = (c.pluviometro || "").trim();
    if (nome) contagem.set(nome, (contagem.get(nome) ?? 0) + 1);
  }
  const lista = [...contagem].sort((a, b) => b[1] - a[1]).map(([nome]) => nome);
  return lista.length ? lista : ["Sede"];
}

export default function CampoChuva({ dados, salvar, irPara }) {
  const locais = pluviometros(dados);
  const passos = ["pessoa", ...(locais.length > 1 ? ["pluviometro"] : []), "foto", "mm", "conferir"];
  const [passo, setPasso] = useState("pessoa");
  const [r, setR] = useState({ responsavel_id: null, pluviometro: locais[0], foto: null, mm: "" });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  useEffect(() => { falar(FALA[passo]); }, [passo]);

  const i = passos.indexOf(passo);
  const ir = (p) => { setErro(null); setPasso(p); window.scrollTo(0, 0); };
  const voltar = i > 0 ? () => ir(passos[i - 1]) : () => irPara("/campo");
  const seguir = () => ir(passos[i + 1]);
  const mudar = (patch) => setR((x) => ({ ...x, ...patch }));

  const pessoa = dados.funcionarios.find((f) => f.id === r.responsavel_id);
  const mm = paraNumero(r.mm);
  // Alguém já lançou hoje neste pluviômetro? Avisa para não lançar a mesma chuva duas vezes.
  const jaHoje = (dados.chuvas ?? []).filter((c) => c.data === hoje() && (c.pluviometro || "").trim() === r.pluviometro);

  const gravar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      const { reg, erro: e } = prepararRegistro("chuvas", {
        data: hoje(), milimetros: mm, pluviometro: r.pluviometro, responsavel_id: r.responsavel_id, foto: r.foto,
      }, dados);
      if (e) throw new Error(e);
      await salvar("chuvas", reg);
      vibrar([60, 60, 120]);
      ir("pronto");
    } catch (err) {
      setErro(String(err?.message ?? err));
    } finally {
      setSalvando(false);
    }
  };

  let corpo;
  let rodape;
  switch (passo) {
    case "pessoa":
      corpo = (
        <>
          <Pergunta figura="👤">Quem é você?</Pergunta>
          {operadores(dados).length === 0 && <div className="campo-aviso">Nenhum funcionário cadastrado. Chame o gerente.</div>}
          <EscolherPessoa pessoas={operadores(dados)} marcado={r.responsavel_id}
            aoEscolher={(id) => { mudar({ responsavel_id: id }); seguir(); }} />
        </>
      );
      rodape = <Rodape aoVoltar={voltar} />;
      break;

    case "pluviometro":
      corpo = (
        <>
          <Pergunta figura="📍">Qual pluviômetro?</Pergunta>
          <div className="campo-grade">
            {locais.map((nome) => (
              <Cartao key={nome} marcado={r.pluviometro === nome} fala={nome}
                aoTocar={() => { mudar({ pluviometro: nome }); falar(nome); vibrar(); seguir(); }}>
                <span className="figura">🌧️</span>
                <span>{nome}</span>
              </Cartao>
            ))}
          </div>
        </>
      );
      rodape = <Rodape aoVoltar={voltar} />;
      break;

    case "foto":
      corpo = (
        <>
          <Pergunta figura="📷">Foto do pluviômetro</Pergunta>
          <FotoComprovante caminho={r.foto} aoTirar={(c) => mudar({ foto: c })} texto="Tirar foto do pluviômetro" />
          <p className="dica-anterior">Tire de perto, dando para ver a água no copo.</p>
        </>
      );
      rodape = <Rodape aoVoltar={voltar} aoSeguir={seguir} podeSeguir={Boolean(r.foto)} />;
      break;

    case "mm":
      corpo = (
        <>
          <Pergunta figura="🌧️">Quantos milímetros?</Pergunta>
          <div className="visor">{r.mm || <span className="apagado">0</span>} <small>mm</small></div>
          <p className="dica-anterior">Se não choveu, digite 0.</p>
          <Teclado valor={r.mm} aoMudar={(v) => mudar({ mm: v })} />
        </>
      );
      rodape = <Rodape aoVoltar={voltar} aoSeguir={seguir} podeSeguir={r.mm !== "" && mm != null && mm >= 0} />;
      break;

    case "conferir":
      corpo = (
        <>
          <Pergunta figura="👀">Está certo?</Pergunta>
          {jaHoje.length > 0 && (
            <div className="campo-aviso">
              ⚠️ Já lançaram {numero(jaHoje[0].milimetros, 1)} mm hoje neste pluviômetro. Só salve se for uma chuva nova.
            </div>
          )}
          {erro && <div className="campo-aviso erro">{erro}</div>}
          <div className="resumo-linha" onClick={() => ir("pessoa")}>
            <FotoOuInicial caminho={pessoa?.foto} nome={pessoa?.nome ?? "?"} /><span>{pessoa?.nome}</span>
          </div>
          {locais.length > 1 && (
            <div className="resumo-linha" onClick={() => ir("pluviometro")}>
              <span className="figura">📍</span><span>{r.pluviometro}</span>
            </div>
          )}
          <div className="resumo-linha" onClick={() => ir("foto")}>
            <Foto caminho={r.foto} className="miniatura" /><span>Foto do pluviômetro</span>
          </div>
          <div className="resumo-linha" onClick={() => ir("mm")}>
            <span className="figura">🌧️</span>
            <span>{numero(mm, 1)} mm<small> · {dataBR(hoje())}</small></span>
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
          <p>Chuva guardada. Agora esvazie o copo do pluviômetro.</p>
        </div>
      );
      rodape = (
        <footer className="campo-rodape">
          <button type="button" className="campo-btn verde" onClick={() => irPara("/campo")}>🏠 Início</button>
        </footer>
      );
  }

  const falaConferir = `${pessoa?.nome ?? ""}. ${numero(mm, 1)} milímetros. ${FALA.conferir}`;
  return (
    <div className="campo-app">
      <Topo titulo="Pluviômetro" figura="🌧️" pergunta={passo === "conferir" ? falaConferir : FALA[passo]} />
      {i >= 0 && <Passos total={passos.length} atual={i} />}
      <div className="campo-corpo">{corpo}</div>
      {rodape}
    </div>
  );
}
