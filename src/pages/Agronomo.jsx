import { useCallback, useEffect, useMemo, useState } from "react";

import { Abas, Icone, Modal, Stat, TabelaSimples } from "../components/ui";
import { ESQUEMA, hoje } from "../lib/esquema";
import { data as dataBR, numero } from "../lib/formato";
import { gerarPdfAplicacao } from "../lib/pdfAplicacao";
import { supabase, supabaseConfigurado } from "../lib/supabase";

/**
 * Página do agrônomo (/agronomo/CÓDIGO). Não tem login: o código do link é a
 * chave. Ela só enxerga o estoque de químicos (nada de dinheiro ou vendas) e
 * pode montar uma aplicação, que chega no sistema da fazenda e vira PDF.
 */

const TIPOS = Object.fromEntries(ESQUEMA.insumos.campos.tipo.opcoes);
const ordenar = (a, b) => String(a).localeCompare(String(b), "pt-BR");
const DIAS_ALERTA = 90;

const VISOES = [
  ["produto", "Por produto"],
  ["fabricante", "Por fabricante"],
  ["tipo", "Por tipo"],
  ["principio", "Por princípio ativo"],
  ["validade", "Por validade"],
];

const AGRUPAR = {
  fabricante: (p) => p.fabricante || "Sem fabricante",
  tipo: (p) => TIPOS[p.tipo] || "Outro",
  principio: (p) => p.principio_ativo || "Sem princípio ativo informado",
};

const CACHE = "fcc-agronomo-cache";

const diasAte = (iso) => {
  if (!iso) return null;
  const alvo = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  const h = new Date(); h.setHours(0, 0, 0, 0);
  return Math.round((alvo - h) / 86_400_000);
};

function SeloValidade({ iso }) {
  const d = diasAte(iso);
  if (d == null) return <span className="selo neutro">Sem validade</span>;
  if (d < 0) return <span className="selo ruim">Vencido há {-d} d</span>;
  if (d <= DIAS_ALERTA) return <span className="selo atencao">Vence em {d} d</span>;
  return <span className="selo ok">{dataBR(iso)}</span>;
}

/** Junta o que o banco devolveu com as contas: saldo, situação e validade mais próxima. */
function prepararProdutos(bruto) {
  const lotesDe = new Map();
  for (const l of bruto.lotes ?? []) {
    if (!lotesDe.has(l.insumo_id)) lotesDe.set(l.insumo_id, []);
    lotesDe.get(l.insumo_id).push(l);
  }
  return (bruto.produtos ?? []).map((p) => {
    const saldo = Number(p.entrou) - Number(p.aplicado);
    const minimo = Number(p.estoque_minimo) || 0;
    const validades = (lotesDe.get(p.id) ?? []).map((l) => l.validade).filter(Boolean).sort();
    return {
      ...p, saldo, validade: validades[0] ?? null,
      baixo: minimo > 0 && saldo <= minimo, negativo: saldo < 0,
    };
  });
}

function Situacao({ p }) {
  if (p.negativo) return <span className="selo ruim">Negativo</span>;
  if (p.baixo) return <span className="selo atencao">Baixo</span>;
  return <span className="selo ok">OK</span>;
}

function Rotulos({ token, produto, aoFechar }) {
  const [fotos, setFotos] = useState(null);
  const [erro, setErro] = useState(null);
  useEffect(() => {
    supabase.rpc("agronomo_fotos", { p_token: token, p_insumo: produto.id })
      .then(({ data, error }) => (error ? setErro(error.message) : setFotos(data ?? [])));
  }, [token, produto.id]);
  return (
    <Modal titulo={`Rótulo: ${produto.nome}`} aoFechar={aoFechar}>
      {erro && <div className="aviso">{erro}</div>}
      {!fotos && !erro && <div className="vazio">Carregando fotos…</div>}
      <div className="fotos-rotulo">
        {fotos?.map((f, i) => <img key={i} src={f} alt={`Rótulo ${i + 1} de ${produto.nome}`} />)}
      </div>
    </Modal>
  );
}

function FormAplicacao({ token, base, produtos, selecionados, aoFechar, aoEnviada }) {
  const lembrado = (() => { try { return localStorage.getItem("fcc-agronomo-nome"); } catch { return null; } })();
  const [f, setF] = useState({
    agronomo: lembrado || base.agronomo || "", data: hoje(), talhao_id: "", area_ha: "", alvo: "", calda_l_ha: "", observacao: "",
  });
  // Guarda a lista na abertura: depois de enviar, a seleção da tela é limpa e o PDF ainda precisa dos produtos.
  const [ids] = useState(() => [...selecionados]);
  const [doses, setDoses] = useState(() => Object.fromEntries(ids.map((id) => [id, ""])));
  const [estado, setEstado] = useState({ enviando: false, erro: null, enviada: false });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const talhao = base.talhoes.find((t) => t.id === f.talhao_id);
  const cultura = base.culturas.find((c) => c.id === talhao?.cultura_id);
  const area = Number(f.area_ha) || 0;

  const itens = ids.map((id) => {
    const p = produtos.find((x) => x.id === id);
    const dose = Number(doses[id]) || 0;
    return {
      insumo_id: id, nome: p.nome, fabricante: p.fabricante, principio_ativo: p.principio_ativo,
      unidade: p.unidade, dose_ha: dose, total: +(dose * area).toFixed(3), saldo: p.saldo,
    };
  });

  const escolherTalhao = (id) => {
    const t = base.talhoes.find((x) => x.id === id);
    setF((x) => ({ ...x, talhao_id: id, area_ha: t?.area_ha ?? x.area_ha }));
  };

  const montar = () => ({
    ...f, talhao: talhao?.nome, fazenda: talhao?.fazenda, cultura: cultura?.nome, cultura_id: cultura?.id ?? null,
    area_ha: area, calda_l_ha: f.calda_l_ha === "" ? null : Number(f.calda_l_ha),
    itens: itens.map((i) => ({ ...i, saldo: undefined })),
  });

  const validar = () => {
    if (!f.talhao_id) return "Escolha o talhão.";
    if (area <= 0) return "Informe a área a aplicar (ha).";
    if (itens.some((i) => i.dose_ha <= 0)) return "Informe a dose por hectare de todos os produtos.";
    return null;
  };

  const pdf = async () => {
    const e = validar();
    if (e) { setEstado((s) => ({ ...s, erro: e })); return; }
    await gerarPdfAplicacao(montar(), `aplicacao-${f.data}.pdf`);
  };

  const enviar = async () => {
    const e = validar();
    if (e) { setEstado((s) => ({ ...s, erro: e })); return; }
    setEstado({ enviando: true, erro: null, enviada: false });
    try { localStorage.setItem("fcc-agronomo-nome", f.agronomo); } catch { /* sem armazenamento: só não lembra o nome */ }
    const { error } = await supabase.rpc("agronomo_enviar", { p_token: token, p_dados: montar() });
    if (error) { setEstado({ enviando: false, erro: error.message, enviada: false }); return; }
    setEstado({ enviando: false, erro: null, enviada: true });
    aoEnviada();
  };

  return (
    <Modal
      titulo="Criar aplicação"
      aoFechar={aoFechar}
      rodape={estado.enviada ? (
        <>
          <span className="espaco" />
          <button className="btn" onClick={pdf}><Icone nome="exportar" /> Baixar PDF</button>
          <button className="btn primario" onClick={aoFechar}>Fechar</button>
        </>
      ) : (
        <>
          <button className="btn" onClick={pdf}><Icone nome="exportar" /> Só o PDF</button>
          <span className="espaco" />
          <button className="btn" onClick={aoFechar}>Cancelar</button>
          <button className="btn primario" onClick={enviar} disabled={estado.enviando}>
            <Icone nome="spray" /> {estado.enviando ? "Enviando…" : "Enviar para a fazenda"}
          </button>
        </>
      )}
    >
      {estado.enviada && <div className="aviso ok">Aplicação enviada! Ela já aparece no sistema da fazenda. Baixe o PDF se quiser guardar uma cópia.</div>}
      {estado.erro && <div className="aviso">{estado.erro}</div>}
      <div className="form">
        <div className="campo"><span><label>Agrônomo</label></span><input value={f.agronomo} onChange={(e) => set("agronomo", e.target.value)} /></div>
        <div className="campo"><span><label>Data</label></span><input type="date" value={f.data} onChange={(e) => set("data", e.target.value)} /></div>
        <div className="campo largo">
          <span><label>Talhão</label><em> *</em></span>
          <select value={f.talhao_id} onChange={(e) => escolherTalhao(e.target.value)}>
            <option value="">— escolha —</option>
            {[...base.talhoes].sort((a, b) => ordenar(a.fazenda, b.fazenda) || ordenar(a.nome, b.nome)).map((t) => (
              <option key={t.id} value={t.id}>{[t.fazenda, t.nome].filter(Boolean).join(" · ")}{t.area_ha ? ` (${numero(t.area_ha)} ha)` : ""}</option>
            ))}
          </select>
          {cultura && <small>Cultura: {cultura.nome}</small>}
        </div>
        <div className="campo"><span><label>Área a aplicar (ha)</label><em> *</em></span><input type="number" inputMode="decimal" step="any" value={f.area_ha} onChange={(e) => set("area_ha", e.target.value)} /></div>
        <div className="campo"><span><label>Calda (L/ha)</label></span><input type="number" inputMode="decimal" step="any" value={f.calda_l_ha} onChange={(e) => set("calda_l_ha", e.target.value)} /></div>
        <div className="campo largo"><span><label>Alvo (praga, doença, planta daninha)</label></span><input value={f.alvo} onChange={(e) => set("alvo", e.target.value)} /></div>

        <div className="campo largo">
          <span><label>Produtos e doses</label></span>
          {itens.map((i) => (
            <div key={i.insumo_id} className="item-dose">
              <div>
                <b>{i.nome}</b>
                <small>{i.fabricante || "sem fabricante"} · saldo {numero(i.saldo)} {i.unidade}</small>
              </div>
              <label>
                Dose por ha
                <span className="com-unidade">
                  <input type="number" inputMode="decimal" step="any" value={doses[i.insumo_id]}
                    onChange={(e) => setDoses((d) => ({ ...d, [i.insumo_id]: e.target.value }))} />
                  <i>{i.unidade}</i>
                </span>
              </label>
              <div className="total-item">
                Total<b>{numero(i.total, 2)} {i.unidade}</b>
                {i.total > i.saldo && <span className="selo atencao">Passa do estoque</span>}
              </div>
            </div>
          ))}
        </div>
        <div className="campo largo"><span><label>Observações</label></span><textarea rows={2} value={f.observacao} onChange={(e) => set("observacao", e.target.value)} /></div>
      </div>
    </Modal>
  );
}

function Estoque({ token, base, produtos, selecionados, alternar, aoLimpar, aoCriar }) {
  const [visao, setVisao] = useState("produto");
  const [busca, setBusca] = useState("");
  const [soSaldo, setSoSaldo] = useState(true);
  const [rotulo, setRotulo] = useState(null);

  const termo = busca.trim().toLowerCase();
  const visiveis = useMemo(() => produtos
    .filter((p) => (soSaldo ? p.saldo > 0 : true) && p.ativo !== false || selecionados.has(p.id))
    .filter((p) => !termo || [p.nome, p.fabricante, p.principio_ativo, TIPOS[p.tipo]].some((v) => String(v ?? "").toLowerCase().includes(termo)))
    .sort((a, b) => ordenar(a.nome, b.nome)), [produtos, soSaldo, termo, selecionados]);

  const colunas = [
    { rotulo: "Usar", valor: (p) => <input type="checkbox" checked={selecionados.has(p.id)} onChange={() => alternar(p.id)} aria-label={`Usar ${p.nome}`} /> },
    { rotulo: "Produto", valor: (p) => <b>{p.nome}</b> },
    { rotulo: "Fabricante", valor: (p) => p.fabricante || "—" },
    { rotulo: "Tipo", valor: (p) => TIPOS[p.tipo] ?? "—" },
    { rotulo: "Princípio ativo", valor: (p) => p.principio_ativo || "—" },
    { rotulo: "Saldo", num: true, valor: (p) => <b className={p.saldo < 0 ? "negativo" : ""}>{numero(p.saldo)} {p.unidade}</b> },
    { rotulo: "Validade", valor: (p) => <SeloValidade iso={p.validade} /> },
    { rotulo: "Situação", valor: (p) => <Situacao p={p} /> },
    { rotulo: "Rótulo", valor: (p) => (p.tem_fotos ? <button className="btn" onClick={() => setRotulo(p)}>Ver</button> : "—") },
  ];

  let corpo;
  if (visao === "validade") {
    const porId = new Map(produtos.map((p) => [p.id, p]));
    const lotes = (base.lotes ?? [])
      .map((l, i) => ({ ...l, id: `${l.insumo_id}-${i}`, p: porId.get(l.insumo_id) }))
      .filter((l) => l.p && visiveis.includes(l.p))
      .sort((a, b) => (a.validade ? 0 : 1) - (b.validade ? 0 : 1) || String(a.validade).localeCompare(String(b.validade)));
    corpo = (
      <>
        <p className="descricao">Cada linha é uma compra com lote ou validade anotados. A quantidade é a que entrou; o saldo é o do produto todo.</p>
        <TabelaSimples
          vazio="Nenhuma compra com validade anotada. Peça para lançar a validade nas entradas."
          linhas={lotes}
          colunas={[
            { rotulo: "Usar", valor: (l) => <input type="checkbox" checked={selecionados.has(l.p.id)} onChange={() => alternar(l.p.id)} aria-label={`Usar ${l.p.nome}`} /> },
            { rotulo: "Validade", valor: (l) => <SeloValidade iso={l.validade} /> },
            { rotulo: "Produto", valor: (l) => <b>{l.p.nome}</b> },
            { rotulo: "Fabricante", valor: (l) => l.p.fabricante || "—" },
            { rotulo: "Lote", valor: (l) => l.lote || "—" },
            { rotulo: "Entrou", num: true, valor: (l) => `${numero(l.quantidade)} ${l.p.unidade}` },
            { rotulo: "Saldo do produto", num: true, valor: (l) => `${numero(l.p.saldo)} ${l.p.unidade}` },
          ]}
        />
      </>
    );
  } else if (visao === "produto") {
    corpo = <TabelaSimples vazio="Nenhum produto encontrado." linhas={visiveis} colunas={colunas} />;
  } else {
    const grupos = new Map();
    for (const p of visiveis) {
      const k = AGRUPAR[visao](p);
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(p);
    }
    corpo = grupos.size === 0 ? <div className="vazio">Nenhum produto encontrado.</div> : (
      [...grupos.entries()].sort(([a], [b]) => ordenar(a, b)).map(([nome, lista]) => (
        <section key={nome} className="grupo">
          <h3>{nome} <small>{lista.length} {lista.length === 1 ? "produto" : "produtos"}</small></h3>
          <TabelaSimples linhas={lista} colunas={colunas} />
        </section>
      ))
    );
  }

  const comSaldo = produtos.filter((p) => p.saldo > 0);
  const vencendo = (base.lotes ?? []).filter((l) => { const d = diasAte(l.validade); return d != null && d <= DIAS_ALERTA && produtos.find((p) => p.id === l.insumo_id)?.saldo > 0; }).length;

  return (
    <>
      <div className="grade">
        <Stat rotulo="Produtos com saldo" valor={comSaldo.length} />
        <Stat rotulo="Estoque baixo" valor={produtos.filter((p) => p.baixo && p.saldo > 0).length} cor="laranja" />
        <Stat rotulo={`Lotes vencidos ou a vencer em ${DIAS_ALERTA} dias`} valor={vencendo} cor={vencendo ? "vermelho" : "cinza"} />
      </div>
      <div className="cartao">
        <div className="barra">
          <select className="entrada" style={{ width: "auto" }} value={visao} onChange={(e) => setVisao(e.target.value)} aria-label="Ver por">
            {VISOES.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
          <input className="entrada busca" placeholder="Buscar produto, fabricante, princípio ativo…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar" />
          <label className="marcar"><input type="checkbox" checked={soSaldo} onChange={(e) => setSoSaldo(e.target.checked)} /> Só com saldo</label>
        </div>
        {corpo}
      </div>

      {selecionados.size > 0 && (
        <div className="barra-selecao">
          <b>{selecionados.size} {selecionados.size === 1 ? "produto escolhido" : "produtos escolhidos"}</b>
          <span className="espaco" />
          <button className="btn" onClick={aoLimpar}>Limpar</button>
          <button className="btn primario" onClick={aoCriar}><Icone nome="spray" /> Criar aplicação</button>
        </div>
      )}
      {rotulo && <Rotulos token={token} produto={rotulo} aoFechar={() => setRotulo(null)} />}
    </>
  );
}

function MinhasAplicacoes({ base }) {
  const nomes = { nova: ["neutro", "Enviada"], aprovada: ["ok", "Aprovada"], aplicada: ["ok", "Aplicada"], cancelada: ["ruim", "Cancelada"] };
  const lista = (base.minhas ?? []).map((m) => {
    const t = base.talhoes.find((x) => x.id === m.talhao_id);
    return {
      ...m, talhao: t?.nome, fazenda: t?.fazenda, cultura: base.culturas.find((c) => c.id === m.cultura_id)?.nome,
      itens: (m.itens ?? []).map((i) => ({ ...i })),
    };
  });
  return (
    <div className="cartao">
      <TabelaSimples
        vazio="Você ainda não enviou nenhuma aplicação."
        linhas={lista}
        colunas={[
          { rotulo: "Data", valor: (m) => dataBR(m.data) },
          { rotulo: "Talhão", valor: (m) => [m.fazenda, m.talhao].filter(Boolean).join(" · ") || "—" },
          { rotulo: "Produtos", valor: (m) => m.itens.map((i) => i.nome).join(", ") },
          { rotulo: "Alvo", valor: (m) => m.alvo || "—" },
          { rotulo: "Situação", valor: (m) => <span className={`selo ${nomes[m.situacao]?.[0] ?? "neutro"}`}>{nomes[m.situacao]?.[1] ?? m.situacao}</span> },
          { rotulo: "PDF", valor: (m) => <button className="btn" onClick={() => gerarPdfAplicacao(m, `aplicacao-${m.data}.pdf`)}>Baixar</button> },
        ]}
      />
    </div>
  );
}

export default function Agronomo({ token }) {
  const [base, setBase] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`${CACHE}-${token}`)); } catch { return null; }
  });
  const [erro, setErro] = useState(supabaseConfigurado ? null : "Este sistema ainda não está ligado à nuvem (Supabase), então o link não funciona.");
  const [offline, setOffline] = useState(false);
  const [aba, setAba] = useState("estoque");
  const [selecionados, setSelecionados] = useState(() => new Set());
  const [criando, setCriando] = useState(false);

  const aplicar = useCallback(({ data, error }) => {
    if (error) {
      // Link inválido não adianta mostrar a cópia antiga; sem internet, sim.
      const semRede = /fetch|network|failed/i.test(error.message);
      setOffline(semRede);
      if (!semRede) { setBase(null); setErro("Este link não vale mais. Peça um novo para a fazenda."); }
      return;
    }
    setOffline(false);
    setErro(null);
    setBase(data);
    try { localStorage.setItem(`${CACHE}-${token}`, JSON.stringify(data)); } catch { /* sem armazenamento: só não guarda cópia */ }
  }, [token]);

  const carregar = useCallback(() => {
    if (supabaseConfigurado) supabase.rpc("agronomo_estoque", { p_token: token }).then(aplicar);
  }, [token, aplicar]);

  useEffect(() => { carregar(); }, [carregar]);

  const produtos = useMemo(() => (base ? prepararProdutos(base) : []), [base]);
  const alternar = (id) => setSelecionados((s) => { const n = new Set(s); if (!n.delete(id)) n.add(id); return n; });

  return (
    <div className="agro">
      <header className="agro-topo">
        <img src="/fazenda-192.png" alt="" />
        <div>
          <h1>Estoque de químicos</h1>
          <small>Fazenda Carvalho Cruz{base?.agronomo ? ` · ${base.agronomo}` : ""}</small>
        </div>
        <span className="espaco" />
        <button className="btn" onClick={carregar}><Icone nome="sync" /> Atualizar</button>
      </header>

      {erro && <div className="aviso">{erro}</div>}
      {offline && <div className="aviso info">Sem internet: mostrando o estoque da última vez que você abriu. Não dá para enviar aplicação agora.</div>}

      {!base && !erro && <div className="vazio">Carregando estoque…</div>}
      {base && (
        <>
          <Abas abas={[["estoque", "Estoque"], ["minhas", `Minhas aplicações${base.minhas?.length ? ` (${base.minhas.length})` : ""}`]]} atual={aba} aoTrocar={setAba} />
          {aba === "estoque" ? (
            <Estoque token={token} base={base} produtos={produtos} selecionados={selecionados} alternar={alternar}
              aoLimpar={() => setSelecionados(new Set())} aoCriar={() => setCriando(true)} />
          ) : <MinhasAplicacoes base={base} />}
          {criando && (
            <FormAplicacao token={token} base={base} produtos={produtos} selecionados={selecionados}
              aoFechar={() => setCriando(false)}
              aoEnviada={() => { setSelecionados(new Set()); carregar(); }} />
          )}
        </>
      )}
    </div>
  );
}
