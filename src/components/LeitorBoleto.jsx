import { useEffect, useRef, useState } from "react";

import { boletoJaLancado, lerCodigoBoleto } from "../lib/boleto";
import { Icone, Modal } from "./ui";

/**
 * Regiões da imagem onde procurar as barras, em [x, y, largura, altura]
 * relativos (0 a 1) e se é para girar. As barras do boleto são finas: em vez
 * de reduzir a imagem inteira (e borrar as barras), recorta faixas e lê cada
 * uma no tamanho original.
 */
const FAIXAS_CAMERA = [
  [0, 0.3, 1, 0.4, false], // a faixa do retângulo da tela
  [0.3, 0, 0.4, 1, true], // boleto em pé (celular em pé, barras de cima a baixo)
];
const FAIXAS_FOTO = [
  [0, 0, 1, 1, false], [0, 0, 1, 1, true],
  [0, 0, 1, 0.4, false], [0, 0.3, 1, 0.4, false], [0, 0.6, 1, 0.4, false],
  [0, 0, 0.4, 1, true], [0.3, 0, 0.4, 1, true], [0.6, 0, 0.4, 1, true],
];

/**
 * Prepara quem decifra o código de barras. Usa a biblioteca ZXing (baixada só
 * quando alguém abre a leitura) nas faixas da imagem e, onde o navegador já
 * sabe ler (Chrome do Android), o leitor dele também: um ajuda o outro.
 */
async function criarDecodificador() {
  let nativo = null;
  if ("BarcodeDetector" in window) {
    try {
      const formatos = await window.BarcodeDetector.getSupportedFormats();
      if (formatos.includes("itf")) nativo = new window.BarcodeDetector({ formats: ["itf"] });
    } catch { /* sem suporte de verdade: fica só a biblioteca */ }
  }

  const zx = await import("@zxing/library");
  const leitor = new zx.ITFReader();
  const dicas = new Map([[zx.DecodeHintType.TRY_HARDER, true], [zx.DecodeHintType.ALLOWED_LENGTHS, [44]]]);
  const tela = document.createElement("canvas");
  const ctx = tela.getContext("2d", { willReadFrequently: true });

  /** Lê um retângulo da imagem (em pixels), reduzido para no máximo 2400 px. */
  const lerRetangulo = (fonte, sx, sy, sw, sh, girar) => {
    const escala = Math.min(1, 2400 / Math.max(sw, sh));
    const w = Math.round(sw * escala), h = Math.round(sh * escala);
    tela.width = girar ? h : w;
    tela.height = girar ? w : h;
    ctx.save();
    if (girar) { ctx.translate(h, 0); ctx.rotate(Math.PI / 2); }
    ctx.drawImage(fonte, sx, sy, sw, sh, 0, 0, w, h);
    ctx.restore();
    const { data } = ctx.getImageData(0, 0, tela.width, tela.height);
    const cinza = new Uint8ClampedArray(tela.width * tela.height);
    for (let i = 0; i < cinza.length; i++) cinza[i] = (data[i * 4] * 77 + data[i * 4 + 1] * 150 + data[i * 4 + 2] * 29) >> 8;
    try {
      const fontePB = new zx.RGBLuminanceSource(cinza, tela.width, tela.height);
      return leitor.decode(new zx.BinaryBitmap(new zx.HybridBinarizer(fontePB)), dicas).getText();
    } catch {
      return null; // não achou nesta faixa
    }
  };

  // Faixa grande demais (foto do celular, 4000 px): reduzir borraria as
  // barras. Além da faixa inteira reduzida, lê pedaços de 2400 px no tamanho
  // original, andando de 1200 em 1200 ao longo dela.
  const lerFaixa = (fonte, largura, altura, [fx, fy, fw, fh, girar]) => {
    const sx = Math.round(fx * largura), sy = Math.round(fy * altura);
    const sw = Math.round(fw * largura), sh = Math.round(fh * altura);
    const texto = lerRetangulo(fonte, sx, sy, sw, sh, girar);
    if (texto || Math.max(sw, sh) <= 3200) return texto;
    const deitada = sw >= sh;
    const comprimento = deitada ? sw : sh;
    for (let ini = 0; ini < comprimento - 1200; ini += 1200) {
      const tam = Math.min(2400, comprimento - ini);
      const lido = deitada
        ? lerRetangulo(fonte, sx + ini, sy, tam, Math.min(sh, 2400), girar)
        : lerRetangulo(fonte, sx, sy + ini, Math.min(sw, 2400), tam, girar);
      if (lido) return lido;
    }
    return null;
  };

  /** `faixas`: onde procurar; devolve os códigos achados. */
  return async (fonte, faixas) => {
    const largura = fonte.videoWidth || fonte.naturalWidth || fonte.width;
    const altura = fonte.videoHeight || fonte.naturalHeight || fonte.height;
    if (!largura || !altura) return [];
    const achados = [];
    if (nativo) {
      try { achados.push(...(await nativo.detect(fonte)).map((b) => b.rawValue)); } catch { /* segue com a biblioteca */ }
      if (achados.some((c) => !lerCodigoBoleto(c).erro)) return achados;
    }
    for (const faixa of faixas) {
      const texto = lerFaixa(fonte, largura, altura, faixa);
      if (texto && !lerCodigoBoleto(texto).erro) return [...achados, texto];
    }
    return achados;
  };
}

/** Primeiro código lido que é um boleto válido (os dígitos verificadores barram leitura errada). */
function boletoValido(codigos) {
  for (const c of codigos) {
    const lido = lerCodigoBoleto(c);
    if (!lido.erro) return lido;
  }
  return null;
}

function abrirImagem(arquivo) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Não consegui abrir essa foto."));
    img.src = URL.createObjectURL(arquivo);
  });
}

/**
 * Janela de leitura do boleto: câmera ao vivo, foto do código de barras ou
 * linha digitável digitada/colada. Chama `aoLer` com o que entendeu do código.
 * Com `dados`, avisa (e para de ler) quando o boleto já foi lançado;
 * `aoRepetido` é chamado nessa hora (o Modo Campo fala o aviso em voz alta).
 */
export default function LeitorBoleto({ aoLer, aoFechar, dados, ignorar, aoRepetido }) {
  const video = useRef(null);
  const [cameraErro, setCameraErro] = useState(null);
  const [cameraLigada, setCameraLigada] = useState(false);
  const [digitado, setDigitado] = useState("");
  const [erro, setErro] = useState(null);
  const [lendoFoto, setLendoFoto] = useState(false);
  const [controles, setControles] = useState(null);
  const [zoom, setZoom] = useState(null);
  const [lanterna, setLanterna] = useState(false);

  const mudarZoom = (v) => {
    setZoom(v);
    controles?.trilha.applyConstraints({ advanced: [{ zoom: v }] }).catch(() => {});
  };
  const alternarLanterna = () => {
    const ligar = !lanterna;
    setLanterna(ligar);
    controles?.trilha.applyConstraints({ advanced: [{ torch: ligar }] }).catch(() => {});
  };
  const decodificar = useRef(null);
  const [repetido, setRepetido] = useState(null);
  // Enquanto o aviso de repetido está na tela, a câmera não lê outro.
  const pausado = useRef(false);

  // Todo código lido passa por aqui: repetido mostra o aviso, novo segue.
  const receber = (lido) => {
    const onde = boletoJaLancado(dados, lido.linha_digitavel, ignorar);
    if (!onde) { aoLer(lido); return; }
    pausado.current = true;
    navigator.vibrate?.([300, 120, 300, 120, 300]);
    aoRepetido?.(onde);
    setRepetido({ lido, onde });
  };
  const lerOutro = () => { setRepetido(null); setDigitado(""); pausado.current = false; };
  const receberRef = useRef(receber);
  useEffect(() => { receberRef.current = receber; });

  const obterDecodificador = async () => {
    if (!decodificar.current) decodificar.current = criarDecodificador();
    return decodificar.current;
  };

  useEffect(() => {
    let ativo = true;
    let fluxo = null;
    let espera = null;

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraErro("Este aparelho não deixa usar a câmera aqui. Tire uma foto do código ou digite os números.");
        return;
      }
      try {
        fluxo = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 2560 }, height: { ideal: 1440 } }, audio: false,
        });
      } catch {
        if (ativo) setCameraErro("Não consegui abrir a câmera (permissão negada ou sem câmera). Tire uma foto do código ou digite os números.");
        return;
      }
      if (!ativo) { fluxo.getTracks().forEach((t) => t.stop()); return; }
      const trilha = fluxo.getVideoTracks()[0];
      const recursos = trilha.getCapabilities?.() ?? {};
      // Foco contínuo: sem ele, alguns celulares ficam com o código embaçado.
      if (recursos.focusMode?.includes("continuous")) trilha.applyConstraints({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});
      setControles({
        trilha,
        zoom: recursos.zoom ? { min: recursos.zoom.min, max: Math.min(recursos.zoom.max, 5), passo: recursos.zoom.step || 0.1 } : null,
        lanterna: Boolean(recursos.torch),
      });
      video.current.srcObject = fluxo;
      await video.current.play().catch(() => {});
      setCameraLigada(true);
      if (!decodificar.current) decodificar.current = criarDecodificador();
      const ler = await decodificar.current;
      let vez = 0;

      const tentar = async () => {
        if (!ativo) return;
        if (pausado.current) { espera = setTimeout(tentar, 300); return; }
        try {
          // Uma faixa por vez: a tela não trava e as duas posições são testadas.
          const lido = boletoValido(await ler(video.current, [FAIXAS_CAMERA[vez++ % FAIXAS_CAMERA.length]]));
          if (lido && ativo) {
            navigator.vibrate?.(80);
            receberRef.current(lido);
            espera = setTimeout(tentar, 300);
            return;
          }
        } catch { /* quadro ruim: tenta o próximo */ }
        espera = setTimeout(tentar, 150);
      };
      tentar();
    })();

    return () => {
      ativo = false;
      clearTimeout(espera);
      fluxo?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const lerFoto = async (e) => {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    setLendoFoto(true);
    setErro(null);
    try {
      const img = await abrirImagem(arquivo);
      const ler = await obterDecodificador();
      const lido = boletoValido(await ler(img, FAIXAS_FOTO));
      URL.revokeObjectURL(img.src);
      if (lido) receber(lido);
      else setErro("Não achei o código de barras nessa foto. Tire de perto, com o boleto deitado e as barras bem nítidas — ou digite os números.");
    } catch (err) {
      setErro(err.message);
    } finally {
      setLendoFoto(false);
    }
  };

  const usarDigitado = () => {
    const lido = lerCodigoBoleto(digitado);
    if (lido.erro) setErro(lido.erro);
    else receber(lido);
  };

  return (
    <Modal titulo="Ler boleto" aoFechar={aoFechar}>
      <div className="leitor">
        {repetido && (
          <div className="aviso repetido" role="alert">
            <b>⚠️ Boleto repetido!</b>
            <span>Este boleto {repetido.onde} Confira para não pagar duas vezes.</span>
            <div className="barra" style={{ margin: "6px 0 0" }}>
              <button type="button" className="btn primario" onClick={lerOutro}>Ler outro boleto</button>
              <button type="button" className="btn" onClick={() => aoLer(repetido.lido)}>Abrir mesmo assim</button>
            </div>
          </div>
        )}
        {!cameraErro && (
          <div className="leitor-video">
            <video ref={video} playsInline muted />
            <div className="leitor-mira" />
            {!cameraLigada && <span className="leitor-status">Abrindo a câmera…</span>}
          </div>
        )}
        {(controles?.zoom || controles?.lanterna) && (
          <div className="barra" style={{ marginBottom: 0 }}>
            {controles.zoom && (
              <label className="leitor-zoom">
                <span>Zoom</span>
                <input type="range" min={controles.zoom.min} max={controles.zoom.max} step={controles.zoom.passo}
                  value={zoom ?? controles.zoom.min} onChange={(e) => mudarZoom(Number(e.target.value))} />
              </label>
            )}
            {controles.lanterna && (
              <button type="button" className={`btn ${lanterna ? "primario" : ""}`} onClick={alternarLanterna}>
                {lanterna ? "Apagar lanterna" : "Lanterna"}
              </button>
            )}
          </div>
        )}
        <p className="descricao" style={{ margin: 0 }}>
          {cameraErro ?? "Aponte para o código de barras com as barras atravessando o retângulo de ponta a ponta, a uns 10–15 cm, sem reflexo de luz. Se não ler, chegue um pouco mais perto ou use o zoom. Quando ler, o celular vibra e já abre o boleto preenchido."}
        </p>

        <label className="btn">
          <Icone nome="camera" /> {lendoFoto ? "Procurando o código…" : "Tirar / escolher foto do código"}
          <input type="file" accept="image/*" capture="environment" hidden onChange={lerFoto} disabled={lendoFoto} />
        </label>

        <div className="campo">
          <span><label htmlFor="linha-boleto">Ou digite / cole a linha digitável</label></span>
          <div className="barra" style={{ marginBottom: 0 }}>
            <input id="linha-boleto" className="entrada" style={{ flex: 1, minWidth: 220 }} inputMode="numeric"
              placeholder="00000.00000 00000.000000 00000.000000 0 00000000000000"
              value={digitado} onChange={(e) => { setDigitado(e.target.value); setErro(null); }}
              onKeyDown={(e) => e.key === "Enter" && usarDigitado()} />
            <button className="btn primario" onClick={usarDigitado} disabled={!digitado.trim()}><Icone nome="check" /> Usar</button>
          </div>
        </div>
        {erro && <div className="aviso" style={{ margin: 0 }}>{erro}</div>}
      </div>
    </Modal>
  );
}
