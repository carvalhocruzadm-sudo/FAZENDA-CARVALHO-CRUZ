import { Component, useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

import { Icone } from "./components/ui";
import { useDados } from "./hooks/useDados";
import { useSync } from "./hooks/useSync";
import { desligarModoCampo, ligarModoCampo, modoCampoLigado } from "./lib/aparelho";
import { LANCAMENTOS } from "./lib/navegacao";
import { supabase, supabaseConfigurado } from "./lib/supabase";
import Campo from "./pages/Campo";
import Login from "./pages/Login";
import Painel from "./pages/Painel";
import { Atividades, Cadastros, Diesel, Estoque, Financeiro, Fretes, Lavoura, Maquinas, Vendas } from "./pages/Secoes";
import Sincronizacao from "./pages/Sincronizacao";

/**
 * Menu em grupos, como no Aegro: o dia a dia (produção, estoque, patrimônio,
 * dinheiro) separado dos cadastros, que quase não mudam.
 * [id, rótulo, ícone, tela, frase que aparece embaixo do título]
 */
const GRUPOS = [
  [null, [
    ["painel", "Início", "painel", Painel, "Resumo da fazenda e o que precisa da sua atenção"],
  ]],
  ["Produção", [
    ["lavoura", "Safra e talhões", "cultura", Lavoura, "Talhões, planejamento da safra e colheitas"],
    ["atividades", "Atividades de campo", "atividade", Atividades, "Aplicações de produto e serviços de máquina nos talhões"],
  ]],
  ["Estoque", [
    ["estoque", "Insumos", "frasco", Estoque, "Químicos, adubos e sementes: saldo, compras e aprovações"],
    ["diesel", "Diesel", "combustivel", Diesel, "Tanque da fazenda, compras e abastecimentos"],
  ]],
  ["Patrimônio", [
    ["maquinas", "Máquinas", "trator", Maquinas, "Horímetro, revisões e consumo"],
    ["fretes", "Caminhões e fretes", "caminhao", Fretes, "Viagens, diesel e custos de cada caminhão"],
  ]],
  ["Comercial e financeiro", [
    ["vendas", "Vendas", "venda", Vendas, "Cargas vendidas, recebimentos e quanto falta receber"],
    ["financeiro", "Financeiro", "dinheiro", Financeiro, "Despesas, entradas, resultado e custo por cultura"],
  ]],
  ["Configuração", [
    ["cadastros", "Cadastros", "pasta", Cadastros, "Fazendas, culturas, produtos, máquinas, pessoas e contatos"],
    ["sync", "Sincronização", "nuvem", Sincronizacao, "Envio dos lançamentos para a nuvem"],
  ]],
];
const MENU = GRUPOS.flatMap(([, itens]) => itens);

function IndicadorSync({ aoClicar }) {
  const s = useSync();
  if (!supabaseConfigurado) return <button className="sync" onClick={aoClicar}><i className="offline" /> <span>Modo demonstração</span></button>;
  const [cls, texto] = !s.online ? ["offline", "Sem internet"]
    : s.falhas ? ["erro", `${s.falhas} com erro`]
      : s.sincronizando ? ["pendente", "Sincronizando…"]
        : s.pendentes ? ["pendente", `${s.pendentes} para enviar`]
          : ["", "Sincronizado"];
  return <button className="sync" onClick={aoClicar} title={texto}><i className={cls} /> <span>{texto}</span></button>;
}

function AvisoAtualizacao() {
  const { needRefresh: [precisa], updateServiceWorker } = useRegisterSW();
  if (!precisa) return null;
  return (
    <div style={{ position: "fixed", bottom: 80, left: 16, right: 16, zIndex: 60, display: "flex", justifyContent: "center" }}>
      <div className="cartao" style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <span>Nova versão do sistema disponível.</span>
        <button className="btn primario" onClick={() => updateServiceWorker(true)}>Atualizar</button>
      </div>
    </div>
  );
}

/** Lista do botão "+ Lançar": escolhe o que lançar e cai direto no formulário. */
function MenuLancar({ aoEscolher, aoFechar }) {
  useEffect(() => {
    const esc = (e) => e.key === "Escape" && aoFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aoFechar]);
  return (
    <div className="lancar-fundo" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div className="lancar" role="dialog" aria-label="O que você quer lançar?">
        <header>
          <h2>O que você quer lançar?</h2>
          <button className="btn icone" onClick={aoFechar} aria-label="Fechar"><Icone nome="fechar" /></button>
        </header>
        <div className="lancar-lista">
          {LANCAMENTOS.map(([rotulo, icone, secao, aba, dica]) => (
            <button key={rotulo} onClick={() => aoEscolher(secao, aba)}>
              <span className="lancar-icone"><Icone nome={icone} /></span>
              <span><b>{rotulo}</b><small>{dica}</small></span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Sistema({ sair, email, virarCampo }) {
  const { dados, pronto, erro, salvar, salvarVarios, remover, sincronizarAgora, recarregarDaNuvem } = useDados();
  const [tela, setTela] = useState(() => {
    try { return localStorage.getItem("fcc-tela") || "painel"; } catch { return "painel"; }
  });
  // Aba e "abrir formulário novo" de quem chamou (o "+ Lançar", um aviso do Início…).
  // O contador refaz a tela mesmo quando se volta para a mesma seção.
  const [destino, setDestino] = useState({ vez: 0 });
  const [menuAberto, setMenuAberto] = useState(false);
  const [lancarAberto, setLancarAberto] = useState(false);

  const irPara = (id, { aba, novo } = {}) => {
    setTela(id);
    setDestino((d) => ({ aba, novo, vez: d.vez + 1 }));
    setMenuAberto(false);
    setLancarAberto(false);
    window.scrollTo(0, 0);
    try { localStorage.setItem("fcc-tela", id); } catch { /* sem armazenamento: só não lembra a aba */ }
  };

  const [id, rotulo, , Pagina, sub] = MENU.find(([i]) => i === tela) ?? MENU[0];
  const pendentes = dados.solicitacoes_produto?.filter((x) => x.situacao === "pendente").length ?? 0;

  return (
    <div className="app">
      {menuAberto && <div className="veu" onClick={() => setMenuAberto(false)} />}
      <aside className={`lateral ${menuAberto ? "aberta" : ""}`}>
        <div className="marca">
          <img src="/fazenda-192.png" alt="" />
          <div><b>Fazenda</b><small>Carvalho Cruz</small></div>
        </div>
        <nav>
          {GRUPOS.map(([grupo, itens]) => (
            <div key={grupo ?? "inicio"} className="grupo">
              {grupo && <div className="grupo-titulo">{grupo}</div>}
              {itens.map(([i, r, icone]) => (
                <button key={i} className={id === i ? "ativo" : ""} onClick={() => irPara(i)}>
                  <Icone nome={icone} /> <span>{r}</span>
                  {i === "estoque" && pendentes > 0 && <em className="contador" title="Entradas esperando aprovação">{pendentes}</em>}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="rodape">
          {email && <div className="email">{email}</div>}
          <button className="btn" onClick={virarCampo}
            title="Para o celular do motorista ou tratorista: sem senha, só escolher o nome">
            <Icone nome="trator" /> Virar celular de campo
          </button>
          {sair && <button className="btn" onClick={sair}><Icone nome="sair" /> Sair</button>}
        </div>
      </aside>
      <main className="principal">
        <header className="topo">
          <button className="btn icone menu" onClick={() => setMenuAberto(true)} aria-label="Abrir menu"><Icone nome="menu" /></button>
          <div className="topo-titulo">
            <h1>{rotulo}</h1>
            {sub && <small>{sub}</small>}
          </div>
          <IndicadorSync aoClicar={() => irPara("sync")} />
          <button className="btn primario lancar-btn" onClick={() => setLancarAberto(true)}><Icone nome="mais" /> Lançar</button>
        </header>
        <div className="conteudo">
          {erro && <div className="aviso">Erro ao abrir o banco do aparelho: {erro}</div>}
          {!pronto ? <div className="vazio">Carregando…</div> : (
            <Pagina key={`${id}-${destino.vez}`} dados={dados} salvar={salvar} salvarVarios={salvarVarios} remover={remover} irPara={irPara}
              abaInicial={destino.aba} abrirNovo={destino.novo}
              sincronizarAgora={sincronizarAgora} recarregarDaNuvem={recarregarDaNuvem} />
          )}
        </div>
      </main>

      {/* No celular: barra de baixo com o principal e o "+" no meio, como nos apps de campo. */}
      <nav className="barra-baixo">
        {[["painel", "Início", "painel"], ["atividades", "Atividades", "atividade"]].map(([i, r, icone]) => (
          <button key={i} className={id === i ? "ativo" : ""} onClick={() => irPara(i)}><Icone nome={icone} /><span>{r}</span></button>
        ))}
        <button className="mais" onClick={() => setLancarAberto(true)} aria-label="Lançar"><Icone nome="mais" tamanho={26} /></button>
        <button className={id === "financeiro" ? "ativo" : ""} onClick={() => irPara("financeiro")}><Icone nome="dinheiro" /><span>Financeiro</span></button>
        <button onClick={() => setMenuAberto(true)}><Icone nome="menu" /><span>Menu</span></button>
      </nav>

      {lancarAberto && (
        <MenuLancar aoFechar={() => setLancarAberto(false)} aoEscolher={(secao, aba) => irPara(secao, { aba, novo: true })} />
      )}
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
    if (!window.confirm("Transformar este aparelho em celular de campo?\n\nQuem usar vai só escolher o nome (sem senha) e só vai ver horímetro, abastecimento, fretes e o aviso de produto que chegou. Para voltar ao sistema completo vai precisar da senha.")) return;
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
