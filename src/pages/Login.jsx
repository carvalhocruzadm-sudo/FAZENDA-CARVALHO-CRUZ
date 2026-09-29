import { useState } from "react";

import { supabase } from "../lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(null);
  const [entrando, setEntrando] = useState(false);

  const entrar = async (e) => {
    e.preventDefault();
    setErro(null);
    setEntrando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    setEntrando(false);
    if (error) setErro(error.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : error.message);
  };

  return (
    <div className="login">
      <form className="cartao" onSubmit={entrar}>
        <img src="/logo-fazenda.png" alt="Fazenda Carvalho Cruz" />
        <h2 style={{ textAlign: "center", marginBottom: 18 }}>Fazenda Carvalho Cruz</h2>
        {erro && <div className="aviso">{erro}</div>}
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
        </div>
      </form>
    </div>
  );
}
