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
import { CadastrosCampo, Diesel, Equipe, Financeiro, Fretes, Lavoura, Maquinas, Quimicos, Turmas, Usuarios, Vendas } from "./pages/Secoes";
import Sincronizacao from "./pages/Sincronizacao";
import Ticket, { LINK_TICKET } from "./pages/Ticket";

const MENU = [
  ["painel", "Painel", "painel", Painel],
  ["lavoura", "Lavoura e talhões", "cultura", Lavoura],
  ["ticket", "Ticket da balança", "cesto", Ticket],
  ["vendas", "Vendas", "venda", Vendas],
  ["turmas", "Turmas de colheita", "pessoas", Turmas],
  ["financeiro", "Financeiro", "dinheiro", Financeiro],
  ["maquinas", "Máquinas e horímetro", "trator", Maquinas],
  ["diesel", "Diesel", "combustivel", Diesel],
  ["quimicos", "Químicos e insumos", "frasco", Quimicos],
  ["fretes", "Caminhões e fretes", "caminhao", Fretes],
  ["equipe", "Funcionários", "pessoas", Equipe],
  ["campo", "Modo Campo", "trator", CadastrosCampo],
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
 * /campo/…: as telas simples dos tratoristas. A conta com
 * perfil "campo" só enxerga essas telas; as outras contas também podem abrir
 * (para testar) e voltar ao sistema completo.
 */
function Rotas({ sair, email, perfilCampo, aoDescobrirCampo }) {
  const [caminho, irPara] = useCaminho();
  if (perfilCampo || caminho.startsWith("/campo")) {
    return (
      <ModoCampo caminho={caminho.startsWith("/campo") ? caminho : "/campo"} irPara={irPara} sair={sair} email={email}
        voltarAoSistema={perfilCampo ? null : () => irPara("/")} />
    );
  }
  return <Sistema sair={sair} email={email} abrirCampo={() => irPara("/campo")} aoDescobrirCampo={aoDescobrirCampo} />;
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

function Sistema({ sair, email, abrirCampo, aoDescobrirCampo }) {
  const { dados, pronto, erro, salvar, remover, sincronizarAgora, recarregarDaNuvem } = useDados();

  // Login marcado como Tratorista em Usuários: sai daqui e fica só no Modo Campo.
  const ehCampo = pronto && emailEhCampo(dados.usuarios, email);
  useEffect(() => { if (ehCampo) aoDescobrirCampo?.(); }, [ehCampo, aoDescobrirCampo]);
  const [tela, setTela] = useState(() => {
    // O link fixado no grupo do WhatsApp (/ticket) abre direto no lançamento do ticket.
    if (location.pathname.replace(/\/+$/, "") === LINK_TICKET) return "ticket";
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
    if (location.pathname !== "/") history.replaceState(null, "", "/");
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
            <Pagina key={tela} dados={dados} salvar={salvar} remover={remover} irPara={irPara} email={email}
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

/** O cadastro de Usuários diz que este e-mail é de campo (perfil "campo" ou "ticket")? */
function emailEhCampo(usuarios, email) {
  const alvo = String(email ?? "").trim().toLowerCase();
  return Boolean(alvo) && (usuarios ?? []).some((u) => ["campo", "ticket"].includes(u.perfil) && u.ativo !== false
    && String(u.email ?? "").trim().toLowerCase() === alvo);
}

/**
 * O login é de tratorista (só Modo Campo)? Vem de três lugares, o que
 * responder "sim" primeiro vale:
 *   - app_metadata (comando SQL no Supabase);
 *   - o banco (função eh_campo, que lê o cadastro de Usuários) — perguntado
 *     ao abrir e toda vez que o app volta para a tela;
 *   - a lista de Usuários já baixada no aparelho (`marcarCampo`, chamado
 *     pelo Sistema), para travar mesmo se o banco ainda não respondeu.
 * Fica guardado no aparelho para abrir certo também sem internet.
 * Devolve [perfilCampo, marcarCampo]; `null` = ainda perguntando.
 */
function usePerfilCampo(usuario) {
  const email = usuario?.email ?? null;
  const doMetadata = ["campo", "ticket"].includes(usuario?.app_metadata?.perfil);
  const chave = `fcc-campo:${String(email ?? "").toLowerCase()}`;
  const lerGuardado = () => {
    try { const v = localStorage.getItem(chave); return v == null ? null : v === "1"; } catch { return null; }
  };
  const guardar = useCallback((campo) => {
    try { localStorage.setItem(chave, campo ? "1" : "0"); } catch { /* sem armazenamento */ }
  }, [chave]);
  const [resposta, setResposta] = useState({ email: null, campo: null });

  useEffect(() => {
    if (!email || doMetadata) return undefined;
    let vivo = true;
    const perguntar = () => supabase.rpc("eh_campo").then(({ data, error }) => {
      if (!vivo) return;
      // Sem resposta (sem internet, banco sem a função): fica o que já se sabia.
      if (error) { setResposta((r) => (r.email === email ? r : { email, campo: null })); return; }
      guardar(Boolean(data));
      setResposta({ email, campo: Boolean(data) });
    });
    perguntar();
    const aoVoltar = () => document.visibilityState === "visible" && perguntar();
    document.addEventListener("visibilitychange", aoVoltar);
    return () => { vivo = false; document.removeEventListener("visibilitychange", aoVoltar); };
  }, [email, doMetadata, guardar]);

  const marcarCampo = useCallback(() => {
    guardar(true);
    setResposta({ email, campo: true });
  }, [email, guardar]);

  let campo;
  if (!email) campo = false;
  else if (doMetadata) campo = true;
  else if (resposta.email === email && resposta.campo != null) campo = resposta.campo;
  else {
    const guardado = lerGuardado();
    campo = guardado != null ? guardado : resposta.email === email || !navigator.onLine ? false : null;
  }
  return [campo, marcarCampo];
}

/** Com Supabase, só entra quem tem login. Sem ele, modo demonstração. */
function Portao() {
  const [sessao, setSessao] = useState(undefined);
  const [recuperando, setRecuperando] = useState(false);
  const [perfilCampo, marcarCampo] = usePerfilCampo(sessao?.user);

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
  return (
    <Rotas email={sessao.user.email} sair={() => supabase.auth.signOut()}
      perfilCampo={perfilCampo} aoDescobrirCampo={marcarCampo} />
  );
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
