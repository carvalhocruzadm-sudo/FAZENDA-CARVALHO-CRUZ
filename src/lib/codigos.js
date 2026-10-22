/**
 * Códigos de barras da nota fiscal (chave de acesso da NF-e, 44 números) e do
 * boleto (código de barras com 44 ou linha digitável com 47 números).
 *
 * A leitura pela câmera usa o leitor do próprio navegador (BarcodeDetector):
 * funciona no Chrome do Android. Onde não existe (iPhone), o operador ainda
 * manda a foto e quem aprova digita os números.
 */

const soNumeros = (t) => String(t ?? "").replace(/\D/g, "");

export const leitorDisponivel = () => typeof window !== "undefined" && "BarcodeDetector" in window;

/** Procura um código de barras na foto (dataURL). Devolve os números ou null. */
export async function lerCodigoDaFoto(foto, tamanhos) {
  if (!leitorDisponivel()) return null;
  try {
    const detector = new window.BarcodeDetector({ formats: ["itf", "code_128", "qr_code"] });
    const img = new Image();
    img.src = foto;
    await img.decode();
    for (const c of await detector.detect(img)) {
      const numeros = soNumeros(c.rawValue);
      if (tamanhos.includes(numeros.length)) return numeros;
      // QR code da NFC-e: a chave vem dentro do endereço (…?p=CHAVE|…)
      const chave = String(c.rawValue).match(/\d{44}/);
      if (chave && tamanhos.includes(44)) return chave[0];
    }
  } catch { /* foto sem código legível: segue sem */ }
  return null;
}

/** O que dá para tirar da chave de acesso: CNPJ de quem vendeu, número e série da nota. */
export function lerChaveNfe(chave) {
  const c = soNumeros(chave);
  if (c.length !== 44) return null;
  return {
    cnpj: c.slice(6, 20),
    serie: String(Number(c.slice(22, 25))),
    numero: String(Number(c.slice(25, 34))),
    emissao: `20${c.slice(2, 4)}-${c.slice(4, 6)}`,
  };
}

const DIA = 86400000;

/**
 * Vencimento e valor do boleto bancário. O "fator de vencimento" conta os dias
 * desde 07/10/1997 e recomeçou em 1000 no dia 22/02/2025; fica a data mais
 * perto de hoje. Boleto de concessionária/imposto (começa com 8) não tem esse
 * padrão: devolve null.
 */
export function lerBoleto(codigo) {
  const c = soNumeros(codigo);
  let fator, valor;
  if (c.length === 44 && c[0] !== "8") { fator = c.slice(5, 9); valor = c.slice(9, 19); }
  else if (c.length === 47) { fator = c.slice(33, 37); valor = c.slice(37, 47); }
  else return null;

  const f = Number(fator);
  const base = Date.UTC(1997, 9, 7);
  let vencimento = null;
  if (f) {
    const agora = Date.now();
    const candidatas = [base + f * DIA, base + (f + 9000) * DIA];
    const perto = candidatas.reduce((a, b) => (Math.abs(b - agora) < Math.abs(a - agora) ? b : a));
    vencimento = new Date(perto).toISOString().slice(0, 10);
  }
  return { vencimento, valor: Number(valor) / 100 || null };
}

/** CNPJ só com números → nome do fornecedor cadastrado em Clientes e fornecedores. */
export function fornecedorPeloCnpj(contatos, cnpj) {
  const c = (contatos ?? []).find((x) => soNumeros(x.documento) === cnpj);
  return c ? c.fantasia || c.nome : null;
}
