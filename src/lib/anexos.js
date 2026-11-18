/**
 * Fotos e PDFs guardados dentro do próprio registro (como texto "data:…"),
 * para funcionar sem internet e sincronizar junto com o resto.
 */

/** Reduz a foto (lado maior 1000 px, JPEG) para caber no registro e sincronizar rápido. */
export function reduzirFoto(arquivo, ladoMaior = 1000) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, ladoMaior / Math.max(img.width, img.height));
      const tela = document.createElement("canvas");
      tela.width = Math.round(img.width * escala);
      tela.height = Math.round(img.height * escala);
      tela.getContext("2d").drawImage(img, 0, 0, tela.width, tela.height);
      URL.revokeObjectURL(url);
      resolve(tela.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Não consegui abrir essa foto.")); };
    img.src = url;
  });
}

export const MAX_PDF_MB = 3;

/** PDF do jeito que veio (não dá para reduzir), com limite de tamanho. */
function lerPdf(arquivo) {
  if (arquivo.size > MAX_PDF_MB * 1024 * 1024) {
    return Promise.reject(new Error(`O PDF "${arquivo.name}" passa de ${MAX_PDF_MB} MB. Mande uma foto do boleto ou um PDF menor.`));
  }
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(leitor.result);
    leitor.onerror = () => reject(new Error(`Não consegui abrir "${arquivo.name}".`));
    leitor.readAsDataURL(arquivo);
  });
}

/** Foto (reduzida) ou PDF → texto "data:…". */
export function lerArquivo(arquivo, ladoMaior = 1800) {
  if (arquivo.type === "application/pdf" || /\.pdf$/i.test(arquivo.name)) return lerPdf(arquivo);
  if (arquivo.type.startsWith("image/")) return reduzirFoto(arquivo, ladoMaior);
  return Promise.reject(new Error(`"${arquivo.name}" não é foto nem PDF.`));
}

export const ehPdf = (arquivo) => String(arquivo ?? "").startsWith("data:application/pdf");

/**
 * Abre o arquivo numa aba nova. O navegador não deixa abrir "data:…"
 * direto, então vira um endereço temporário antes.
 */
export async function abrirArquivo(arquivo) {
  const blob = await (await fetch(arquivo)).blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
