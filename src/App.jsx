import { Component, useCallback, useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

import { Icone } from "./components/ui";
import { useDados } from "./hooks/useDados";
import { useSync } from "./hooks/useSync";
import { supabase, supabaseConfigurado } from "./lib/supabase";
import ModoCampo from "./pages/Campo";
import Login from "./pages/Login";
import Painel from "./pages/Painel";
import { Diesel, Equipe, Financeiro, Fretes, Lavoura, Maquinas, Quimicos, Vendas } from "./pages/Secoes";
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

function Sistema({ sair, email, abrirCampo }) {
  const { dados, pronto, erro, salvar, remover, sincronizarAgora, recarregarDaNuvem } = useDados();
  const [tela, setTela] = useState(() => {
    try { return localStorage.getItem("fcc-tela") || "painel"; } catch { return "painel"; }
  });
  const [menuAberto, setMenuAberto] = useState(false);

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
          <img src="/pwa-192x192.png" alt="" />
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
          <button className="btn" style={{ marginBottom: 10 }} onClick={abrirCampo}><Icone nome="trator" /> Modo Campo</button>
          {email && <div style={{ marginBottom: 8, wordBreak: "break-all" }}>{email}</div>}
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
              sincronizarAgora={sincronizarAgora} recarregarDaNuvem={recarregarDaNuvem} />
          )}
        </div>
      </main>
    </div>
  );
}

/** Com Supabase, só entra quem tem login. Sem ele, modo demonstração. */
function Portao() {
  const [sessao, setSessao] = useState(undefined);

  useEffect(() => {
    if (!supabaseConfigurado) return undefined;
    supabase.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSessao(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!supabaseConfigurado) return <Rotas />;
  if (sessao === undefined) return <div className="vazio">Verificando acesso…</div>;
  if (!sessao) return <Login />;
  return (
    <Rotas email={sessao.user.email} sair={() => supabase.auth.signOut()}
      perfilCampo={sessao.user.app_metadata?.perfil === "campo"} />
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

export default function App() {
  return (
    <ProtecaoErro>
      <Portao />
      <AvisoAtualizacao />
    </ProtecaoErro>
  );
}
