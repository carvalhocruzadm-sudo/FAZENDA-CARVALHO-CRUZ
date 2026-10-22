import { useEffect, useRef, useState } from "react";

import { lerCodigoBoleto } from "../lib/boleto";
import { Icone, Modal } from "./ui";

/**
 * Prepara quem decifra o código de barras. O Chrome do Android já sabe ler
 * (BarcodeDetector); no iPhone e nos demais usa a biblioteca ZXing, que só é
 * baixada quando alguém abre a leitura.
 */
async function criarDecodificador() {
  if ("BarcodeDetector" in window) {
    try {
      const formatos = await window.BarcodeDetector.getSupportedFormats();
      if (formatos.includes("itf")) {
        const detector = new window.BarcodeDetector({ formats: ["itf"] });
        return async (fonte) => (await detector.detect(fonte)).map((b) => b.rawValue);
      }
    } catch { /* sem suporte de verdade: vai pela biblioteca */ }
  }

  const zx = await import("@zxing/library");
  const leitor = new zx.ITFReader();
  const dicas = new Map([[zx.DecodeHintType.TRY_HARDER, true], [zx.DecodeHintType.ALLOWED_LENGTHS, [44]]]);
  const tela = document.createElement("canvas");
  const ctx = tela.getContext("2d", { willReadFrequently: true });

  return async (fonte) => {
    const largura = fonte.videoWidth || fonte.naturalWidth || fonte.width;
    const altura = fonte.videoHeight || fonte.naturalHeight || fonte.height;
    if (!largura || !altura) return [];
    const escala = Math.min(1, 1600 / Math.max(largura, altura));
    const w = Math.round(largura * escala), h = Math.round(altura * escala);
    // Tenta deitado e em pé: o boleto pode estar girado na foto.
    for (const girar of [false, true]) {
      tela.width = girar ? h : w;
      tela.height = girar ? w : h;
      ctx.save();
      if (girar) { ctx.translate(h, 0); ctx.rotate(Math.PI / 2); }
      ctx.drawImage(fonte, 0, 0, w, h);
      ctx.restore();
      const { data } = ctx.getImageData(0, 0, tela.width, tela.height);
      const cinza = new Uint8ClampedArray(tela.width * tela.height);
      for (let i = 0; i < cinza.length; i++) cinza[i] = (data[i * 4] * 77 + data[i * 4 + 1] * 150 + data[i * 4 + 2] * 29) >> 8;
      try {
        const fontePB = new zx.RGBLuminanceSource(cinza, tela.width, tela.height);
        return [leitor.decode(new zx.BinaryBitmap(new zx.HybridBinarizer(fontePB)), dicas).getText()];
      } catch { /* não achou nesta posição */ }
    }
    return [];
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
 */
export default function LeitorBoleto({ aoLer, aoFechar }) {
  const video = useRef(null);
  const [cameraErro, setCameraErro] = useState(null);
  const [cameraLigada, setCameraLigada] = useState(false);
  const [digitado, setDigitado] = useState("");
  const [erro, setErro] = useState(null);
  const [lendoFoto, setLendoFoto] = useState(false);
  const decodificar = useRef(null);
  const aoLerRef = useRef(aoLer);
  useEffect(() => { aoLerRef.current = aoLer; });

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
          video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false,
        });
      } catch {
        if (ativo) setCameraErro("Não consegui abrir a câmera (permissão negada ou sem câmera). Tire uma foto do código ou digite os números.");
        return;
      }
      if (!ativo) { fluxo.getTracks().forEach((t) => t.stop()); return; }
      video.current.srcObject = fluxo;
      await video.current.play().catch(() => {});
      setCameraLigada(true);
      if (!decodificar.current) decodificar.current = criarDecodificador();
      const ler = await decodificar.current;

      const tentar = async () => {
        if (!ativo) return;
        try {
          const lido = boletoValido(await ler(video.current));
          if (lido && ativo) {
            navigator.vibrate?.(80);
            aoLerRef.current(lido);
            return;
          }
        } catch { /* quadro ruim: tenta o próximo */ }
        espera = setTimeout(tentar, 250);
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
      const lido = boletoValido(await ler(img));
      URL.revokeObjectURL(img.src);
      if (lido) aoLer(lido);
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
    else aoLer(lido);
  };

  return (
    <Modal titulo="Ler boleto" aoFechar={aoFechar}>
      <div className="leitor">
        {!cameraErro && (
          <div className="leitor-video">
            <video ref={video} playsInline muted />
            <div className="leitor-mira" />
            {!cameraLigada && <span className="leitor-status">Abrindo a câmera…</span>}
          </div>
        )}
        <p className="descricao" style={{ margin: 0 }}>
          {cameraErro ?? "Aponte a câmera para o código de barras do boleto, com o boleto deitado e as barras dentro do retângulo. Quando ler, o celular vibra e já abre o boleto preenchido."}
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
