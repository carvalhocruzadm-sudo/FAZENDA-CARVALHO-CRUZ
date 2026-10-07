import { Component, useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

import { Icone } from "./components/ui";
import { useDados } from "./hooks/useDados";
import { useSync } from "./hooks/useSync";
import { desligarModoCampo, ligarModoCampo, modoCampoLigado } from "./lib/aparelho";
import { supabase, supabaseConfigurado } from "./lib/supabase";
import Campo from "./pages/Campo";
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

function Sistema({ sair, email, virarCampo }) {
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
          <button className="btn" style={{ marginBottom: 8 }} onClick={virarCampo}
            title="Para o celular do motorista ou tratorista: sem senha, só escolher o nome">
            <Icone nome="trator" /> Virar celular de campo
          </button>
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

/**
 * Com Supabase, só entra quem tem login. Sem ele, modo demonstração.
 * No celular de campo (motorista/tratorista) o administrador entra uma vez e
 * liga o modo campo: daí em diante ninguém digita senha, só escolhe o nome.
 */
function Portao() {
  const [sessao, setSessao] = useState(undefined);
  const [campo, setCampo] = useState(modoCampoLigado);

  useEffect(() => {
    if (!supabaseConfigurado) return undefined;
    supabase.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSessao(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const virarCampo = () => {
    if (!window.confirm("Transformar este aparelho em celular de campo?\n\nQuem usar vai só escolher o nome (sem senha) e só vai ver horímetro, abastecimento e fretes. Para voltar ao sistema completo vai precisar da senha.")) return;
    ligarModoCampo();
    setCampo(true);
  };

  // Sair do modo campo encerra o login: para voltar ao sistema completo,
  // só com a senha do administrador.
  const sairDoCampo = () => {
    if (!window.confirm("Sair do modo campo? Para entrar de novo vai precisar do e-mail e da senha do administrador.")) return;
    desligarModoCampo();
    setCampo(false);
    if (supabaseConfigurado) supabase.auth.signOut();
  };

  if (supabaseConfigurado && sessao === undefined) return <div className="vazio">Verificando acesso…</div>;
  if (supabaseConfigurado && !sessao) return <Login />;
  if (campo) return <Campo indicador={<IndicadorSync />} sair={sairDoCampo} />;
  if (!supabaseConfigurado) return <Sistema virarCampo={virarCampo} />;
  return <Sistema email={sessao.user.email} sair={() => supabase.auth.signOut()} virarCampo={virarCampo} />;
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
