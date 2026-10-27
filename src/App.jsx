import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

import LancarComprovante from "./components/LancarComprovante";
import { Icone, Modal } from "./components/ui";
import { CulturaAtiva } from "./hooks/useCulturaAtiva";
import { useDados } from "./hooks/useDados";
import { useSync } from "./hooks/useSync";
import { daCaixa, lerCompartilhado, listarCaixa } from "./lib/arquivos";
import { salvarComAviso, textoDoAviso } from "./lib/avisos";
import { LANCAMENTOS } from "./lib/navegacao";
import { iniciarNtfy } from "./lib/ntfy";
import { supabase, supabaseConfigurado } from "./lib/supabase";
import Boletos from "./pages/Boletos";
import Agronomo from "./pages/Agronomo";
import Avisos from "./pages/Avisos";
import ModoCampo from "./pages/Campo";
import Login, { NovaSenha } from "./pages/Login";
import Inicio from "./pages/Inicio";
import Painel from "./pages/Painel";
import Funcionarios from "./pages/Funcionarios";
import { Atividades, Cadastros, CadastrosCampo, Diesel, Financeiro, Fretes, Lavoura, Maquinas, Pluviometro, Quimicos, Turmas, Usuarios, Vendas } from "./pages/Secoes";
import Sincronizacao from "./pages/Sincronizacao";
import Ticket, { LINK_TICKET } from "./pages/Ticket";

/**
 * Menu em grupos, como no Aegro: o dia a dia (produção, estoque, patrimônio,
 * dinheiro) separado dos relatórios e dos cadastros, que quase não mudam.
 * [id, rótulo, ícone, tela, frase que aparece embaixo do título]
 */
const GRUPOS = [
  [null, [
    ["inicio", "Início", "casa", Inicio, "O que precisa da sua atenção hoje"],
    ["avisos", "Avisos do campo", "sino", Avisos, "O que foi lançado no Modo Campo e na balança"],
  ]],
  ["Produção", [
    ["lavoura", "Safra e talhões", "cultura", Lavoura, "Talhões, safras, planejamento e colheitas"],
    ["atividades", "Atividades de campo", "atividade", Atividades, "Aplicações de produto, horímetro e ordens de pulverização"],
    ["ticket", "Ticket da balança", "cesto", Ticket, "Lançar a carga que saiu pesada na balança"],
    ["turmas", "Turmas de colheita", "pessoas", Turmas, "Quanto pagar a cada turma, por semana"],
    ["pluviometro", "Pluviômetro", "chuva", Pluviometro, "Chuva de cada dia e de cada mês"],
  ]],
  ["Estoque", [
    ["quimicos", "Insumos", "frasco", Quimicos, "Químicos, adubos e sementes: saldo, compras, agrônomo e balanço"],
    ["diesel", "Diesel", "combustivel", Diesel, "Tanque da fazenda, compras e abastecimentos"],
  ]],
  ["Patrimônio", [
    ["maquinas", "Máquinas", "trator", Maquinas, "Situação das revisões e revisões feitas"],
    ["fretes", "Caminhões e fretes", "caminhao", Fretes, "Viagens, diesel e custos de cada caminhão"],
  ]],
  ["Comercial e financeiro", [
    ["vendas", "Vendas", "venda", Vendas, "Cargas vendidas, recebimentos, a receber e notas"],
    ["financeiro", "Financeiro", "dinheiro", Financeiro, "Despesas, Pix, entradas, resultado e custo por cultura"],
    ["boletos", "Programação de pagamentos", "calendario", Boletos, "Boletos e pagamentos por data de vencimento"],
  ]],
  ["Relatórios", [
    ["painel", "Painel de indicadores", "grafico", Painel, "Gráficos por cultura, fazenda, talhão, mês e comparativo"],
  ]],
  ["Configuração", [
    ["cadastros", "Cadastros", "pasta", Cadastros, "Fazendas, culturas, produtos, máquinas e compradores"],
    ["equipe", "Funcionários", "pessoas", Funcionarios, "Cadastro e folha dos funcionários"],
    ["campo", "Modo Campo", "trator", CadastrosCampo, "O que o tratorista vê no celular"],
    ["usuarios", "Usuários", "chave", Usuarios, "Quem entra no sistema e o que pode ver"],
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
          {LANCAMENTOS.map(([rotulo, icone, tela, aba, dica]) => (
            <button key={rotulo} onClick={() => aoEscolher(tela, aba)}>
              <span className="lancar-icone"><Icone nome={icone} /></span>
              <span><b>{rotulo}</b><small>{dica}</small></span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Fica de olho nos avisos que chegam do campo. Os que já estavam no aparelho
 * quando o sistema abriu não incomodam (o contador do sininho já mostra); os
 * que chegarem depois aparecem num balão e, se liberado, numa notificação do
 * computador. O que a própria pessoa lançou não avisa ela mesma.
 */
function useAvisosNovos(avisos, pronto, email) {
  const vistos = useRef(null);
  const [balao, setBalao] = useState(null);

  useEffect(() => {
    if (!pronto) return;
    if (!vistos.current) {
      vistos.current = new Set(avisos.map((a) => a.id));
      return;
    }
    const meu = (a) => email && String(a.email ?? "").toLowerCase() === email.toLowerCase();
    const novos = avisos.filter((a) => !a.lido && !vistos.current.has(a.id) && !meu(a));
    for (const a of avisos) vistos.current.add(a.id);
    if (!novos.length) return;

    const texto = novos.length === 1 ? textoDoAviso(novos[0]) : `${novos.length} lançamentos novos do campo`;
    const detalhe = novos.length === 1 ? novos[0].resumo : novos.map(textoDoAviso).slice(0, 3).join(" · ");
    setBalao({ texto, detalhe, ticket: novos.some((a) => a.ticket) });
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(texto, { body: detalhe ?? "", icon: "/fazenda-192.png", tag: "fcc-avisos" });
      }
    } catch { /* alguns celulares só notificam pelo service worker: fica o balão */ }
  }, [avisos, pronto, email]);

  return [balao, () => setBalao(null)];
}

/** Escolher a cultura aqui vale para o sistema todo (fica guardado no aparelho). */
function useCulturaGuardada(culturas, pronto) {
  const [cultura, setCulturaEstado] = useState(() => {
    try { return localStorage.getItem("fcc-cultura") || ""; } catch { return ""; }
  });
  const setCultura = useCallback((c) => {
    setCulturaEstado(c);
    try { localStorage.setItem("fcc-cultura", c); } catch { /* sem armazenamento: só não lembra */ }
  }, []);
  // Cultura apagada ou desativada: volta para todas.
  const existe = !cultura || !pronto || (culturas ?? []).some((c) => c.id === cultura && c.ativo !== false);
  return [existe ? cultura : "", setCultura];
}

function SeletorCultura({ culturas, cultura, setCultura }) {
  const ativas = (culturas ?? []).filter((c) => c.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  if (!ativas.length) return null;
  return (
    <select className={`entrada cultura-ativa${cultura ? " ativo" : ""}`} value={cultura} onChange={(e) => setCultura(e.target.value)}
      aria-label="Cultura" title="Mostra só os lançamentos desta cultura e já lança nela">
      <option value="">Todas as culturas</option>
      {ativas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
    </select>
  );
}

/** Comprovante que chegou há menos disto abre sozinho quando o app vem para a tela. */
const RECENTE_MS = 10 * 60 * 1000;
const OFERECIDOS = new Set();

/** O app foi aberto pelo Atalho do iPhone (/?comprovantes)? */
const veioDoAtalho = () => /(^|[?&/])comprovantes?\b/i.test(location.search + location.pathname);

function AvisoAtualizacao() {
  const { needRefresh: [precisa], updateServiceWorker } = useRegisterSW();
  // Pelo Atalho não há ninguém no meio de um lançamento: atualiza sozinho, para
  // a versão guardada no Safari não ficar velha (o Safari e o ícone da tela
  // inicial guardam cópias separadas do sistema). O endereço é mantido.
  useEffect(() => { if (precisa && veioDoAtalho()) updateServiceWorker(true); }, [precisa, updateServiceWorker]);
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
  const { dados, pronto, erro, salvar: salvarSemAviso, salvarVarios, remover, sincronizarAgora, recarregarDaNuvem } = useDados(email);
  // Despesa nova lançada no escritório também vira aviso (sininho e ntfy), com quem lançou.
  const salvar = useCallback(
    (colecao, reg) => (colecao === "despesas" && !reg.id
      ? salvarComAviso(salvarSemAviso, { dados, email })(colecao, reg)
      : salvarSemAviso(colecao, reg)),
    [salvarSemAviso, dados, email],
  );

  // Login marcado como Tratorista em Usuários: sai daqui e fica só no Modo Campo.
  const ehCampo = pronto && emailEhCampo(dados.usuarios, email);
  useEffect(() => { if (ehCampo) aoDescobrirCampo?.(); }, [ehCampo, aoDescobrirCampo]);
  const [tela, setTela] = useState(() => {
    // O link fixado no grupo do WhatsApp (/ticket) abre direto no lançamento do ticket.
    if (location.pathname.replace(/\/+$/, "") === LINK_TICKET) return "ticket";
    try { return localStorage.getItem("fcc-tela") || "inicio"; } catch { return "inicio"; }
  });
  // Aba e "abrir formulário novo" de quem chamou (o "+ Lançar", um aviso do Início…).
  // O contador refaz a tela mesmo quando se volta para a mesma seção.
  const [destino, setDestino] = useState({ vez: 0 });
  const [menuAberto, setMenuAberto] = useState(false);
  const [lancarAberto, setLancarAberto] = useState(false);
  const fecharLancar = useCallback(() => setLancarAberto(false), []);
  const [balao, fecharBalao] = useAvisosNovos(dados.avisos, pronto, email);
  const naoLidos = dados.avisos.filter((a) => !a.lido).length;
  useEffect(() => iniciarNtfy(), []);
  const [cultura, setCultura] = useCulturaGuardada(dados.culturas, pronto);
  const culturaAtiva = useMemo(() => ({ cultura, setCultura }), [cultura, setCultura]);
  const [compartilhado, setCompartilhado] = useState(null);

  // Veio do "Compartilhar" do celular (comprovante do banco): abre o lançamento.
  useEffect(() => {
    if (!new URLSearchParams(location.search).has("compartilhado")) return;
    history.replaceState(null, "", "/");
    lerCompartilhado()
      .then((c) => setCompartilhado(c ?? { arquivo: null, texto: "" }))
      .catch(() => setCompartilhado({ arquivo: null, texto: "" }));
  }, []);

  // Veio do Atalho do iPhone (/?comprovantes): o comprovante já subiu para a
  // caixa de entrada; abre o lançamento do mais novo que ainda não virou despesa.
  // Aceita também "comprovante" (sem s) e /comprovantes, que é fácil digitar no Atalho.
  // O andamento aparece na tela (o Safari às vezes engole o alert de uma aba recém-aberta).
  const [atalho, setAtalho] = useState(() => (veioDoAtalho() ? "buscando" : null));
  useEffect(() => {
    if (atalho !== "buscando" || !pronto) return undefined;
    let vivo = true;
    // Só limpa o endereço no fim: se a tela recarregar no meio, ela busca de novo.
    const terminar = () => history.replaceState(null, "", "/");
    (async () => {
      // O arquivo acabou de subir: tenta algumas vezes antes de desistir.
      for (let tentativa = 0; tentativa < 4 && vivo; tentativa++) {
        const caixa = await listarCaixa(dados.despesas);
        if (caixa.length) {
          if (vivo) { terminar(); OFERECIDOS.add(caixa[0].caminho); setCompartilhado(daCaixa(caixa[0])); setAtalho(null); }
          return;
        }
        await new Promise((ok) => setTimeout(ok, 1500));
      }
      throw new Error("Nenhum comprovante novo chegou. Se você acabou de enviar, o envio falhou: veja a notificação do Atalho.");
    })().catch((err) => { if (vivo) { terminar(); setAtalho(err.message); } });
    return () => { vivo = false; };
    // Uma vez só, quando o banco do aparelho termina de abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atalho === "buscando", pronto]);
  // Aberto pelo ícone da tela inicial logo depois do Atalho (o iPhone não deixa
  // o Atalho abrir o ícone, só o Safari): se chegou comprovante nos últimos
  // minutos, abre o lançamento dele. Confere ao abrir e toda vez que o app volta
  // para a tela; cada comprovante é oferecido uma vez só.
  const despesasRef = useRef(dados.despesas);
  const ocupadoRef = useRef(false);
  useEffect(() => {
    despesasRef.current = dados.despesas;
    ocupadoRef.current = Boolean(compartilhado) || atalho === "buscando";
  });
  useEffect(() => {
    if (!pronto || !supabaseConfigurado) return undefined;
    let vivo = true;
    const conferir = () => {
      if (document.visibilityState !== "visible" || ocupadoRef.current) return;
      listarCaixa(despesasRef.current).then((caixa) => {
        const novo = caixa.find((c) => !OFERECIDOS.has(c.caminho) && Date.now() - new Date(c.criadoEm).getTime() < RECENTE_MS);
        if (!novo || !vivo || ocupadoRef.current) return;
        OFERECIDOS.add(novo.caminho);
        setCompartilhado(daCaixa(novo));
      }).catch(() => { /* sem internet: fica para a próxima vez */ });
    };
    conferir();
    document.addEventListener("visibilitychange", conferir);
    return () => { vivo = false; document.removeEventListener("visibilitychange", conferir); };
  }, [pronto]);

  const [trocandoSenha, setTrocandoSenha] = useState(false);
  const fecharTrocaSenha = useCallback(() => setTrocandoSenha(false), []);

  const irPara = (id, { aba, novo } = {}) => {
    setTela(id);
    setDestino((d) => ({ aba, novo, vez: d.vez + 1 }));
    setMenuAberto(false);
    setLancarAberto(false);
    window.scrollTo(0, 0);
    if (location.pathname !== "/") history.replaceState(null, "", "/");
    try { localStorage.setItem("fcc-tela", id); } catch { /* sem armazenamento: só não lembra a aba */ }
  };

  const [telaAtual, rotulo, , Pagina, sub] = MENU.find(([id]) => id === tela) ?? MENU[0];

  return (
    <CulturaAtiva.Provider value={culturaAtiva}>
    <div className="app">
      {menuAberto && <div className="veu" onClick={() => setMenuAberto(false)} />}
      <aside className={`lateral ${menuAberto ? "aberta" : ""}`}>
        <div className="marca">
          <img src="/fazenda-192.png" alt="" />
          <div><b>Fazenda</b><small>Carvalho Cruz</small></div>
        </div>
        <nav>
          {GRUPOS.map(([grupo, itens]) => (
            <div key={grupo ?? "inicio"} className="menu-grupo">
              {grupo && <div className="menu-grupo-titulo">{grupo}</div>}
              {itens.map(([id, r, icone]) => (
                <button key={id} className={telaAtual === id ? "ativo" : ""} onClick={() => irPara(id)}>
                  <Icone nome={icone} /> <span>{r}</span>
                  {id === "avisos" && naoLidos > 0 && <span className="qtd-avisos">{naoLidos}</span>}
                </button>
              ))}
            </div>
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
          <div className="topo-titulo">
            <h1>{rotulo}</h1>
            {sub && <small>{sub}</small>}
          </div>
          {pronto && <SeletorCultura culturas={dados.culturas} cultura={cultura} setCultura={setCultura} />}
          <button className="btn icone sininho" onClick={() => irPara("avisos")}
            title={naoLidos ? `${naoLidos} aviso(s) novo(s) do campo` : "Avisos do campo"} aria-label="Avisos do campo">
            <Icone nome="sino" />
            {naoLidos > 0 && <span className="qtd-avisos">{naoLidos > 99 ? "99+" : naoLidos}</span>}
          </button>
          <IndicadorSync aoClicar={() => irPara("sync")} />
          <button className="btn primario lancar-btn" onClick={() => setLancarAberto(true)}><Icone nome="mais" /> Lançar</button>
        </header>
        <div className="conteudo">
          {erro && <div className="aviso">Erro ao abrir o banco do aparelho: {erro}</div>}
          {atalho === "buscando" && <div className="aviso info">Buscando o comprovante que acabou de chegar…</div>}
          {atalho && atalho !== "buscando" && (
            <div className="aviso">{atalho} <button className="btn" onClick={() => setAtalho(null)}>Fechar</button></div>
          )}
          {!pronto ? <div className="vazio">Carregando…</div> : (
            <Pagina key={`${telaAtual}-${destino.vez}`} abaInicial={destino.aba} abrirNovo={destino.novo} dados={dados} salvar={salvar} salvarVarios={salvarVarios} remover={remover} irPara={irPara} email={email}
              sincronizarAgora={sincronizarAgora} recarregarDaNuvem={recarregarDaNuvem} abrirCampo={abrirCampo} />
          )}
        </div>
      </main>
      {/* No celular: barra de baixo com o principal e o "+" no meio, como nos apps de campo. */}
      <nav className="barra-baixo">
        {[["inicio", "Início", "casa"], ["atividades", "Atividades", "atividade"]].map(([id, r, icone]) => (
          <button key={id} className={telaAtual === id ? "ativo" : ""} onClick={() => irPara(id)}><Icone nome={icone} /><span>{r}</span></button>
        ))}
        <button className="mais" onClick={() => setLancarAberto(true)} aria-label="Lançar"><Icone nome="mais" tamanho={26} /></button>
        <button className={telaAtual === "financeiro" ? "ativo" : ""} onClick={() => irPara("financeiro")}><Icone nome="dinheiro" /><span>Financeiro</span></button>
        <button onClick={() => setMenuAberto(true)}><Icone nome="menu" /><span>Menu</span></button>
      </nav>
      {lancarAberto && (
        <MenuLancar aoFechar={fecharLancar} aoEscolher={(id, aba) => irPara(id, { aba, novo: Boolean(aba) })} />
      )}
      {pronto && compartilhado && (
        <LancarComprovante compartilhado={compartilhado} dados={dados} salvar={salvar}
          aoFechar={() => setCompartilhado(null)}
          aoSalvar={() => { setCompartilhado(null); irPara("financeiro"); }} />
      )}
      {trocandoSenha && <TrocarSenha email={email} aoFechar={fecharTrocaSenha} />}
      {balao && (
        <div className={`balao ${balao.ticket ? "ticket" : ""}`} role="status">
          <Icone nome="sino" />
          <span style={{ flex: 1, minWidth: 0 }}>
            <b>{balao.texto}</b>
            {balao.detalhe && <small>{balao.detalhe}</small>}
          </span>
          <button className="btn" onClick={() => { fecharBalao(); irPara("avisos"); }}>Ver</button>
          <button className="btn icone" onClick={fecharBalao} aria-label="Fechar"><Icone nome="fechar" /></button>
        </div>
      )}
    </div>
    </CulturaAtiva.Provider>
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
