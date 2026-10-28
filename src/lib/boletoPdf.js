/**
 * Boletos em PDF (o que chega por e-mail ou baixa do site do fornecedor).
 *
 * Cada página do PDF é lida assim:
 *   1. o texto da página → procura a linha digitável (PDF gerado pelo banco
 *      sempre tem os números escritos);
 *   2. se não achou (PDF escaneado) → desenha a página e procura o código
 *      de barras na imagem, como na foto.
 * Um PDF com várias páginas (carnê, parcelas) pode trazer vários boletos.
 * Os dígitos verificadores barram números que só parecem um código.
 */

import { lerCodigoBoleto } from "./boleto";
import { boletoValido, criarDecodificador, FAIXAS_FOTO } from "./codigoDeBarras";

/** Página a mais disso é muito provavelmente outra coisa (contrato, nota). */
const MAX_PAGINAS = 30;

let pdfjsPronto = null;
function carregarPdfjs() {
  pdfjsPronto ??= Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
  ]).then(([pdfjs, { default: workerUrl }]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    return pdfjs;
  });
  return pdfjsPronto;
}

/**
 * Códigos de boleto válidos dentro de um texto. Junta os números de cada
 * trecho (pontos, espaços e traços entre eles valem) e testa janelas de 47 e
 * 48 dígitos: só passa o que bate com os dígitos verificadores. O código de
 * barras (44) só vale sozinho no trecho: ele tem um dígito verificador só, e
 * uma janela qualquer de números passaria por acaso.
 */
export function codigosNoTexto(texto) {
  const achados = [];
  const guardar = (lido) => {
    if (!lido.erro && !achados.some((a) => a.barras === lido.barras)) achados.push(lido);
    return !lido.erro;
  };
  for (const trecho of String(texto ?? "").split(/[^\d.\s-]+/)) {
    const d = trecho.replace(/\D/g, "");
    if (d.length === 44) { guardar(lerCodigoBoleto(d)); continue; }
    // O código começa e termina onde um número termina (antes de um espaço,
    // ponto ou traço): não vale um pedaço do meio de outro número.
    const corte = new Set([0, d.length]);
    let n = 0;
    for (let i = 0; i < trecho.length; i++) {
      if (/\d/.test(trecho[i])) n++;
      else corte.add(n);
    }
    for (let i = 0; i + 47 <= d.length; i++) {
      if (!corte.has(i)) continue;
      // Achou um: pula os números dele (a janela vizinha não é outro boleto).
      if (corte.has(i + 47) && guardar(lerCodigoBoleto(d.slice(i, i + 47)))) i += 46;
      else if (corte.has(i + 48) && guardar(lerCodigoBoleto(d.slice(i, i + 48)))) i += 47;
    }
  }
  return achados;
}

/** Desenha a página num canvas (`escala` 2 ≈ 150 dpi: as barras ficam nítidas). */
async function desenhar(pagina, escala) {
  const viewport = pagina.getViewport({ scale: escala });
  const tela = document.createElement("canvas");
  tela.width = Math.ceil(viewport.width);
  tela.height = Math.ceil(viewport.height);
  const ctx = tela.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, tela.width, tela.height);
  await pagina.render({ canvasContext: ctx, viewport }).promise;
  return tela;
}

const paraJpeg = (tela) => new Promise((resolve) => tela.toBlob(resolve, "image/jpeg", 0.85));

/**
 * Lê um arquivo PDF. Devolve `[{ lido, pagina, imagem }]` — um por boleto
 * achado; `imagem` é a página em JPEG (para a IA ler o beneficiário e para
 * guardar como foto do boleto). Lista vazia: nenhum boleto no arquivo.
 */
export async function lerBoletosDoPdf(arquivo) {
  const pdfjs = await carregarPdfjs();
  const carregando = pdfjs.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) });
  let doc;
  try {
    doc = await carregando.promise;
  } catch (e) {
    throw new Error(e?.name === "PasswordException" ? "o PDF tem senha" : "não consegui abrir este PDF", { cause: e });
  }
  const boletos = [];
  let decodificar = null;
  try {
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGINAS); n++) {
      const pagina = await doc.getPage(n);
      const { items } = await pagina.getTextContent();
      let lidos = codigosNoTexto(items.map((i) => i.str).join(" "));
      const tela = await desenhar(pagina, 2);
      if (!lidos.length) {
        decodificar ??= criarDecodificador();
        const lido = boletoValido(await (await decodificar)(tela, FAIXAS_FOTO));
        lidos = lido ? [lido] : [];
      }
      const novos = lidos.filter((l) => !boletos.some((b) => b.lido.barras === l.barras));
      if (novos.length) {
        const imagem = await paraJpeg(tela);
        for (const lido of novos) boletos.push({ lido, pagina: n, imagem });
      }
      pagina.cleanup();
    }
  } finally {
    carregando.destroy();
  }
  return boletos;
}
