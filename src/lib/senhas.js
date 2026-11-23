import { supabase } from "./supabase";

/**
 * Senhas dos logins (tela Usuários). Quem cria o login e troca a senha é a
 * função `usuarios-senha` do Supabase; a senha criada fica guardada numa
 * tabela trancada, que só essa função lê, e só mostra para o administrador.
 */
export async function chamarSenhas(corpo) {
  if (!supabase) throw new Error("Precisa do Supabase configurado e de internet.");
  const { data: r, error } = await supabase.functions.invoke("usuarios-senha", { body: corpo });
  if (error) {
    // A função devolve { erro } também nas respostas de erro HTTP.
    const detalhe = await error.context?.json?.().catch(() => null);
    if (detalhe?.erro) throw new Error(detalhe.erro);
    if (error.name === "FunctionsFetchError" || error.context?.status === 404) {
      throw new Error("A função usuarios-senha ainda não foi criada no Supabase (Edge Functions), ou está sem internet.");
    }
    throw new Error(error.message);
  }
  if (r?.erro) throw new Error(r.erro);
  return r;
}

/** Senha fácil de ditar por telefone: 3 letras + 4 números (ex.: "kpt4821"). */
export function gerarSenha() {
  const letras = "abcdefghjkmnpqrstuvwxyz";
  const n = new Uint32Array(7);
  crypto.getRandomValues(n);
  return [...n].map((x, i) => (i < 3 ? letras[x % letras.length] : String(x % 10))).join("");
}
