import { Component, useCallback, useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

import LancarComprovante from "./components/LancarComprovante";
import { Icone, Modal } from "./components/ui";
import { useDados } from "./hooks/useDados";
import { useSync } from "./hooks/useSync";
import { lerCompartilhado } from "./lib/arquivos";
import { supabase, supabaseConfigurado } from "./lib/supabase";
import Agronomo from "./pages/Agronomo";
import ModoCampo from "./pages/Campo";
import Login, { NovaSenha } from "./pages/Login";
import Painel from "./pages/Painel";
import { CadastrosCampo, Diesel, Equipe, Financeiro, Fretes, Lavoura, Maquinas, Quimicos, Usuarios, Vendas } from "./pages/Secoes";
import Sincronizacao from "./pages/Sincronizacao";

const MENU = [
  ["painel", "Painel", "painel", Painel],
  ["lavoura", "Lavoura e talhões", "cultura", Lavoura],
  ["vendas", "Vendas", "venda", Vendas],
  ["financeiro", "Financeiro", "dinheiro", Financeiro],
  ["maquinas", "Máquinas e horímetro", "trator", Maquinas],
  ["diesel", "Diesel", "combustivel", Diesel],
  ["quimicos", "Químicos e insumos", "frasco", Quimicos],
  ["fretes", "Caminhões e fretes", "caminhao", Fretes],
  ["equipe", "Funcionários", "pessoas", Equipe],
  ["campo", "Modo Campo (QR)", "trator", CadastrosCampo],
  ["usuarios", "Usuários", "pessoas", Usuarios],
  ["sync", "Sincronização", "nuvem", Sincronizacao],
];

function IndicadorSync({ aoClicar }) {
  const s = useSync();
  if (!supabaseConfigurado) return <button className="sync" onClick={aoClicar}><i className="offline" /> Modo demonstração</button>;
  const [cls, texto] = !s.online ? ["offline", "Sem internet"]
    : s.falhas ? ["erro", `${s.falhas} com erro`]
      : s.sincronizando ? ["pendente", "Sincronizando…"]
        : s.pendentes ? ["pendente", `${s.pendentes} para enviar`]
          : ["", "Sincronizado"];
  return <button className="sync" onClick={aoClicar}><i className={cls} /> {texto}</button>;
}

function AvisoAtualizacao() {
  const { needRefresh: [precisa], updateServiceWorker } = useRegisterSW();
  if (!precisa) return null;
  return (
    <div style={{ position: "fixed", bottom: 16, left: 16, right: 16, zIndex: 60, display: "flex", justifyContent: "center" }}>
      <div className="cartao" style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <span>Nova versão do sistema disponível.</span>
        <button className="btn primario" onClick={() => updateServiceWorker(true)}>Atualizar</button>
      </div>
    </div>
  );
}

/** Endereço atual (/campo/…) sem biblioteca de rotas: pushState + voltar do navegador. */
function useCaminho() {
  const [caminho, setCaminho] = useState(() => window.location.pathname);
  useEffect(() => {
    const aoVoltar = () => setCaminho(window.location.pathname);
    window.addEventListener("popstate", aoVoltar);
    return () => window.removeEventListener("popstate", aoVoltar);
  }, []);
  const irPara = useCallback((novo) => {
    if (novo !== window.location.pathname) window.history.pushState(null, "", novo);
    setCaminho(novo);
    window.scrollTo(0, 0);
  }, []);
  return [caminho, irPara];
}

/**
 * O QR code abre /campo/…: as telas simples dos tratoristas. A conta com
 * perfil "campo" só enxerga essas telas; as outras contas também podem abrir
 * (para testar) e voltar ao sistema completo.
 */
function Rotas({ sair, email, perfilCampo }) {
  const [caminho, irPara] = useCaminho();
  if (perfilCampo || caminho.startsWith("/campo")) {
    return (
      <ModoCampo caminho={caminho.startsWith("/campo") ? caminho : "/campo"} irPara={irPara} sair={sair}
        voltarAoSistema={perfilCampo ? null : () => irPara("/")} />
    );
  }
  return <Sistema sair={sair} email={email} abrirCampo={() => irPara("/campo")} />;
}

function TrocarSenha({ email, aoFechar }) {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [repetida, setRepetida] = useState("");
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [pronto, setPronto] = useState(false);

  const salvar = async (e) => {
    e.preventDefault();
    setErro(null);
    if (nova.length < 6) { setErro("A nova senha precisa ter pelo menos 6 caracteres."); return; }
    if (nova !== repetida) { setErro("As duas senhas novas não são iguais."); return; }
    setSalvando(true);
    // Confere a senha atual antes de trocar.
    const { error: erroAtual } = await supabase.auth.signInWithPassword({ email, password: atual });
    if (erroAtual) {
      setSalvando(false);
      setErro("A senha atual está incorreta.");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: nova });
    setSalvando(false);
    if (error) setErro(error.message);
    else setPronto(true);
  };

  return (
    <Modal titulo="Trocar senha" aoFechar={aoFechar}>
      {pronto ? (
        <>
          <p>Senha trocada com sucesso.</p>
          <button className="btn primario" onClick={aoFechar}>Fechar</button>
        </>
      ) : (
        <form onSubmit={salvar} style={{ display: "grid", gap: 12 }}>
          {erro && <div className="aviso">{erro}</div>}
          <label className="campo"><span>Senha atual</span>
            <input type="password" autoComplete="current-password" value={atual} onChange={(e) => setAtual(e.target.value)} required />
          </label>
          <label className="campo"><span>Nova senha</span>
            <input type="password" autoComplete="new-password" value={nova} onChange={(e) => setNova(e.target.value)} required />
          </label>
          <label className="campo"><span>Repita a nova senha</span>
            <input type="password" autoComplete="new-password" value={repetida} onChange={(e) => setRepetida(e.target.value)} required />
          </label>
          <button className="btn primario" style={{ justifyContent: "center" }} disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar nova senha"}
          </button>
        </form>
      )}
    </Modal>
  );
}

function Sistema({ sair, email, abrirCampo }) {
  const { dados, pronto, erro, salvar, remover, sincronizarAgora, recarregarDaNuvem } = useDados();
  const [tela, setTela] = useState(() => {
    try { return localStorage.getItem("fcc-tela") || "painel"; } catch { return "painel"; }
  });
  const [menuAberto, setMenuAberto] = useState(false);
  const [compartilhado, setCompartilhado] = useState(null);

  // Veio do "Compartilhar" do celular (comprovante do banco): abre o lançamento.
  useEffect(() => {
    if (!new URLSearchParams(location.search).has("compartilhado")) return;
    history.replaceState(null, "", "/");
    lerCompartilhado()
      .then((c) => setCompartilhado(c ?? { arquivo: null, texto: "" }))
      .catch(() => setCompartilhado({ arquivo: null, texto: "" }));
  }, []);
  const [trocandoSenha, setTrocandoSenha] = useState(false);
  const fecharTrocaSenha = useCallback(() => setTrocandoSenha(false), []);

  const irPara = (id) => {
    setTela(id);
    setMenuAberto(false);
    window.scrollTo(0, 0);
    try { localStorage.setItem("fcc-tela", id); } catch { /* sem armazenamento: só não lembra a aba */ }
  };

  const [, rotulo, , Pagina] = MENU.find(([id]) => id === tela) ?? MENU[0];

  return (
    <div className="app">
      {menuAberto && <div className="veu" onClick={() => setMenuAberto(false)} />}
      <aside className={`lateral ${menuAberto ? "aberta" : ""}`}>
        <div className="marca">
          <img src="/fazenda-192.png" alt="" />
          <div><b>Fazenda</b><small>Carvalho Cruz</small></div>
        </div>
        <nav>
          {MENU.map(([id, r, icone]) => (
            <button key={id} className={tela === id ? "ativo" : ""} onClick={() => irPara(id)}>
              <Icone nome={icone} /> {r}
            </button>
          ))}
        </nav>
        <div className="rodape">
          {email && <div style={{ marginBottom: 8, wordBreak: "break-all" }}>{email}</div>}
          {sair && email && (
            <button className="btn" style={{ marginBottom: 8 }} onClick={() => { setTrocandoSenha(true); setMenuAberto(false); }}>
              <Icone nome="chave" /> Trocar senha
            </button>
          )}
          {sair && <button className="btn" onClick={sair}><Icone nome="sair" /> Sair</button>}
        </div>
      </aside>
      <main className="principal">
        <header className="topo">
          <button className="btn icone menu" onClick={() => setMenuAberto(true)} aria-label="Abrir menu"><Icone nome="menu" /></button>
          <h1>{rotulo}</h1>
          <IndicadorSync aoClicar={() => irPara("sync")} />
        </header>
        <div className="conteudo">
          {erro && <div className="aviso">Erro ao abrir o banco do aparelho: {erro}</div>}
          {!pronto ? <div className="vazio">Carregando…</div> : (
            <Pagina key={tela} dados={dados} salvar={salvar} remover={remover} irPara={irPara}
              sincronizarAgora={sincronizarAgora} recarregarDaNuvem={recarregarDaNuvem} abrirCampo={abrirCampo} />
          )}
        </div>
      </main>
      {pronto && compartilhado && (
        <LancarComprovante compartilhado={compartilhado} dados={dados} salvar={salvar}
          aoFechar={() => setCompartilhado(null)}
          aoSalvar={() => { setCompartilhado(null); irPara("financeiro"); }} />
      )}
      {trocandoSenha && <TrocarSenha email={email} aoFechar={fecharTrocaSenha} />}
    </div>
  );
}

/**
 * O login é de tratorista (só Modo Campo)? Vem do perfil marcado em Usuários
 * (perguntado ao banco) ou do app_metadata. Fica guardado no aparelho para
 * abrir certo também sem internet. `null` = ainda perguntando.
 */
function usePerfilCampo(usuario) {
  const email = usuario?.email ?? null;
  const doMetadata = usuario?.app_metadata?.perfil === "campo";
  const chave = `fcc-campo:${email}`;
  const lerGuardado = () => {
    try { const v = localStorage.getItem(chave); return v == null ? null : v === "1"; } catch { return null; }
  };
  const [resposta, setResposta] = useState({ email: null, campo: null });

  useEffect(() => {
    if (!email || doMetadata) return undefined;
    let vivo = true;
    supabase.rpc("eh_campo").then(({ data, error }) => {
      if (!vivo) return;
      // Sem resposta (sem internet, banco sem a função): fica o que estava guardado, ou "não".
      const campo = error ? null : Boolean(data);
      if (campo != null) { try { localStorage.setItem(chave, campo ? "1" : "0"); } catch { /* sem armazenamento */ } }
      setResposta({ email, campo });
    });
    return () => { vivo = false; };
  }, [email, doMetadata, chave]);

  if (!email) return false;
  if (doMetadata) return true;
  if (resposta.email === email && resposta.campo != null) return resposta.campo;
  const guardado = lerGuardado();
  if (guardado != null) return guardado;
  return resposta.email === email || !navigator.onLine ? false : null;
}

/** Com Supabase, só entra quem tem login. Sem ele, modo demonstração. */
function Portao() {
  const [sessao, setSessao] = useState(undefined);
  const [recuperando, setRecuperando] = useState(false);
  const perfilCampo = usePerfilCampo(sessao?.user);

  useEffect(() => {
    if (!supabaseConfigurado) return undefined;
    supabase.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data } = supabase.auth.onAuthStateChange((evento, s) => {
      if (evento === "PASSWORD_RECOVERY") setRecuperando(true);
      setSessao(s);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!supabaseConfigurado) return <Rotas />;
  if (sessao === undefined) return <div className="vazio">Verificando acesso…</div>;
  if (recuperando && sessao) return <NovaSenha aoConcluir={() => setRecuperando(false)} />;
  if (!sessao) return <Login />;
  if (perfilCampo == null) return <div className="vazio">Verificando acesso…</div>;
  return <Rotas email={sessao.user.email} sair={() => supabase.auth.signOut()} perfilCampo={perfilCampo} />;
}

class ProtecaoErro extends Component {
  state = { erro: null };
  static getDerivedStateFromError(erro) { return { erro }; }
  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div className="login">
        <div className="cartao">
          <h2>Algo deu errado nesta tela</h2>
          <p className="descricao">{String(this.state.erro?.message ?? this.state.erro)}</p>
          <button className="btn primario" onClick={() => location.reload()}>Recarregar</button>
        </div>
      </div>
    );
  }
}

/** O link do agrônomo (/agronomo/CÓDIGO) abre direto, sem login. */
const tokenAgronomo = () => window.location.pathname.match(/^\/agronomo\/([A-Za-z0-9]{16,})\/?$/)?.[1];

export default function App() {
  const token = tokenAgronomo();
  if (token) return <ProtecaoErro><Agronomo token={token} /></ProtecaoErro>;
  return (
    <ProtecaoErro>
      <Portao />
      <AvisoAtualizacao />
    </ProtecaoErro>
  );
}
