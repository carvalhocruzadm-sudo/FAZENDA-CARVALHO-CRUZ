/**
 * Leitura do código de barras do boleto numa imagem (câmera, foto ou página
 * de PDF escaneado). Usada pelo LeitorBoleto e pela leitura de boletos em PDF.
 */

import { lerCodigoBoleto } from "./boleto";

/** Onde procurar numa foto inteira: a imagem toda, deitada e em pé, e em faixas. */
export const FAIXAS_FOTO = [
  [0, 0, 1, 1, false], [0, 0, 1, 1, true],
  [0, 0, 1, 0.4, false], [0, 0.3, 1, 0.4, false], [0, 0.6, 1, 0.4, false],
  [0, 0, 0.4, 1, true], [0.3, 0, 0.4, 1, true], [0.6, 0, 0.4, 1, true],
];

/**
 * Prepara quem decifra o código de barras. Usa a biblioteca ZXing (baixada só
 * quando alguém abre a leitura) nas faixas da imagem e, onde o navegador já
 * sabe ler (Chrome do Android), o leitor dele também: um ajuda o outro.
 */
export async function criarDecodificador() {
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
export function boletoValido(codigos) {
  for (const c of codigos) {
    const lido = lerCodigoBoleto(c);
    if (!lido.erro) return lido;
  }
  return null;
}
