/**
 * O que este aparelho é: computador do escritório ou celular de campo
 * (motorista/tratorista), e quem está usando o celular de campo agora.
 * Fica guardado só no próprio aparelho (localStorage).
 */

const CHAVE_MODO = "fcc-modo";
const CHAVE_PESSOA = "fcc-pessoa";

function ler(chave) {
  try { return localStorage.getItem(chave); } catch { return null; }
}

function gravar(chave, valor) {
  try {
    if (valor) localStorage.setItem(chave, valor);
    else localStorage.removeItem(chave);
  } catch { /* sem armazenamento: vale só até fechar o app */ }
}

export const modoCampoLigado = () => ler(CHAVE_MODO) === "campo";
export const ligarModoCampo = () => gravar(CHAVE_MODO, "campo");
export function desligarModoCampo() {
  gravar(CHAVE_MODO, null);
  gravar(CHAVE_PESSOA, null);
}

export const lerPessoaCampo = () => ler(CHAVE_PESSOA);
export const gravarPessoaCampo = (id) => gravar(CHAVE_PESSOA, id);
