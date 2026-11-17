import { useState } from "react";

import { supabase } from "../lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(null);
  const [entrando, setEntrando] = useState(false);
  const [aviso, setAviso] = useState(null);

  const entrar = async (e) => {
    e.preventDefault();
    setErro(null);
    setEntrando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    setEntrando(false);
    if (error) setErro(error.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : error.message);
  };

  const esqueci = async () => {
    setErro(null);
    setAviso(null);
    if (!email.trim()) { setErro("Digite seu e-mail acima e clique de novo em “Esqueci minha senha”."); return; }
    setEntrando(true);
    // O link do e-mail volta para o endereço de onde o sistema está aberto agora.
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    setEntrando(false);
    if (error) setErro(error.message);
    else setAviso("Enviamos um link para o seu e-mail. Abra o e-mail e clique no link para criar a nova senha.");
  };

  return (
    <div className="login">
      <form className="cartao" onSubmit={entrar}>
        <img src="/logo-fazenda.png" alt="Fazenda Carvalho Cruz" />
        <h2 style={{ textAlign: "center", marginBottom: 18 }}>Fazenda Carvalho Cruz</h2>
        {erro && <div className="aviso">{erro}</div>}
        {aviso && <div className="aviso">{aviso}</div>}
        <div style={{ display: "grid", gap: 12 }}>
          <label className="campo"><span>E-mail</span>
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="campo"><span>Senha</span>
            <input type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
          </label>
          <button className="btn primario" style={{ justifyContent: "center", padding: 11 }} disabled={entrando}>
            {entrando ? "Entrando…" : "Entrar"}
          </button>
          <button type="button" className="btn" style={{ justifyContent: "center" }} onClick={esqueci} disabled={entrando}>
            Esqueci minha senha
          </button>
        </div>
      </form>
    </div>
  );
}

/** Tela mostrada quando a pessoa chega pelo link do e-mail de recuperação. */
export function NovaSenha({ aoConcluir }) {
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const salvar = async (e) => {
    e.preventDefault();
    setErro(null);
    if (senha.length < 6) { setErro("A senha precisa ter pelo menos 6 caracteres."); return; }
    setSalvando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setSalvando(false);
    if (error) setErro(error.message);
    else aoConcluir();
  };

  return (
    <div className="login">
      <form className="cartao" onSubmit={salvar}>
        <img src="/logo-fazenda.png" alt="Fazenda Carvalho Cruz" />
        <h2 style={{ textAlign: "center", marginBottom: 18 }}>Criar nova senha</h2>
        {erro && <div className="aviso">{erro}</div>}
        <div style={{ display: "grid", gap: 12 }}>
          <label className="campo"><span>Nova senha</span>
            <input type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
          </label>
          <button className="btn primario" style={{ justifyContent: "center", padding: 11 }} disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar nova senha"}
          </button>
        </div>
      </form>
    </div>
  );
}
