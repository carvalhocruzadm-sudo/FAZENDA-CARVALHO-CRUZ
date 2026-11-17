import { useState } from "react";

import { Icone, Modal, TabelaSimples } from "../components/ui";
import { prepararRegistro, registroNovo } from "../lib/esquema";
import { data as dataBR, nomeRef, numero } from "../lib/formato";
import { gerarPdfAplicacao } from "../lib/pdfAplicacao";
import { agruparRecomendacoes, porPipa } from "../lib/recomendacoes";
import { supabaseConfigurado } from "../lib/supabase";

const SELOS = {
  nova: ["atencao", "Nova"], aprovada: ["ok", "Aprovada"], aplicada: ["ok", "Aplicada"],
  parcial: ["atencao", "Parte aplicada"], cancelada: ["ruim", "Cancelada"],
};
const Selo = ({ situacao }) => <span className={`selo ${SELOS[situacao]?.[0] ?? "neutro"}`}>{SELOS[situacao]?.[1] ?? situacao}</span>;
const aberta = (r) => r.situacao === "nova" || r.situacao === "aprovada";

/** Fazenda e talhão de cada registro da aplicação. */
function talhoesDe(g, dados) {
  return g.recs.map((r) => {
    const t = dados.talhoes.find((x) => x.id === r.talhao_id);
    return { rec: r, fazenda: t ? nomeRef(dados, "fazendas", t.fazenda_id) : "Sem fazenda", talhao: t?.nome ?? "—", area_ha: Number(r.area_ha) || 0 };
  });
}

/** Junta nomes (talhões, fazenda, cultura) para o PDF. */
function paraPdf(g, dados) {
  const talhoes = talhoesDe(g, dados);
  const um = talhoes.length === 1;
  return {
    ...g,
    talhao: um ? talhoes[0].talhao : talhoes.map((t) => `${t.fazenda}: ${t.talhao}`).join("; "),
    fazenda: um ? talhoes[0].fazenda : null,
    cultura: g.cultura_id ? nomeRef(dados, "culturas", g.cultura_id) : null,
    talhoes: talhoes.map(({ fazenda, talhao, area_ha }) => ({ fazenda, talhao, area_ha })),
  };
}

const novoGrupo = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * Editar a aplicação toda (vale para todos os talhões dela): nome, data, alvo,
 * calda, dose por ha ou por pipa, produtos e a área de cada talhão.
 */
function Editar({ grupo, dados, salvar, aoFechar }) {
  const talhoes = talhoesDe(grupo, dados);
  const pipaAntes = porPipa(grupo);
  const [f, setF] = useState({
    nome: grupo.nome ?? "", data: grupo.data ?? "", alvo: grupo.alvo ?? "", observacao: grupo.observacao ?? "",
    calda_l_ha: grupo.calda_l_ha ?? "", dose_por: pipaAntes ? "pipa" : "ha", ha_por_pipa: grupo.ha_por_pipa ?? "",
  });
  // A dose fica como foi passada: por pipa nas aplicações por pipa, por ha nas outras.
  const [itens, setItens] = useState(() => grupo.itens.map((i) => ({ ...i, dose: (pipaAntes ? i.dose_pipa : i.dose_ha) ?? "" })));
  const [areas, setAreas] = useState(() => Object.fromEntries(talhoes.map((t) => [t.rec.id, t.area_ha])));
  const [novoProduto, setNovoProduto] = useState("");
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const pipa = f.dose_por === "pipa";
  const haPorPipa = Number(f.ha_por_pipa) || 0;
  const doseHa = (i) => { const d = Number(i.dose) || 0; return pipa ? (haPorPipa > 0 ? d / haPorPipa : 0) : d; };
  const areaTotal = talhoes.reduce((s, t) => s + (Number(areas[t.rec.id]) || 0), 0);

  const produtos = dados.insumos.filter((p) => p.ativo !== false && !itens.some((i) => i.insumo_id === p.id))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const adicionar = (id) => {
    const p = dados.insumos.find((x) => x.id === id);
    if (p) setItens((l) => [...l, { insumo_id: p.id, nome: p.nome, fabricante: p.fabricante, principio_ativo: p.principio_ativo, unidade: p.unidade, dose: "" }]);
    setNovoProduto("");
  };
  const mudarDose = (k, v) => setItens((l) => l.map((i, j) => (j === k ? { ...i, dose: v } : i)));

  const gravar = async () => {
    if (!f.data) { setErro("Informe a data."); return; }
    if (pipa && !(haPorPipa > 0)) { setErro("Informe quantos ha uma pipa faz."); return; }
    if (!itens.length) { setErro("Coloque pelo menos um produto."); return; }
    if (itens.some((i) => !(Number(i.dose) > 0))) { setErro(`Informe a dose por ${pipa ? "pipa" : "hectare"} de todos os produtos.`); return; }
    const semArea = talhoes.find((t) => !(Number(areas[t.rec.id]) > 0));
    if (semArea) { setErro(`Informe a área do talhão ${semArea.talhao} (ha).`); return; }
    setSalvando(true);
    // As antigas ganham um grupo agora: depois de editar continuam juntas.
    const grupoId = grupo.grupo_id || novoGrupo();
    try {
      for (const t of talhoes) {
        const area = Number(areas[t.rec.id]);
        await salvar("recomendacoes", {
          ...t.rec, ...f, grupo_id: grupoId, nome: f.nome.trim() || null, area_ha: area,
          calda_l_ha: f.calda_l_ha === "" ? null : Number(f.calda_l_ha),
          dose_por: pipa ? "pipa" : "ha", ha_por_pipa: pipa ? haPorPipa : null,
          itens: itens.map(({ dose, ...i }) => {
            const dh = doseHa({ dose });
            return { ...i, dose_ha: +dh.toFixed(3), dose_pipa: pipa ? Number(dose) : undefined, total: +(dh * area).toFixed(3) };
          }),
        });
      }
      aoFechar();
    } catch (e) {
      setErro(String(e?.message ?? e));
      setSalvando(false);
    }
  };

  return (
    <Modal
      titulo="Editar aplicação"
      aoFechar={aoFechar}
      rodape={
        <>
          <span className="espaco" />
          <button className="btn" onClick={aoFechar}>Cancelar</button>
          <button className="btn primario" onClick={gravar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
        </>
      }
    >
      {erro && <div className="aviso">{erro}</div>}
      <div className="form">
        <div className="campo largo"><span><label>Nome da aplicação</label></span><input value={f.nome} placeholder="Ex.: Dessecação do milho" onChange={(e) => set("nome", e.target.value)} /></div>
        <div className="campo"><span><label>Data</label></span><input type="date" value={f.data} onChange={(e) => set("data", e.target.value)} /></div>
        <div className="campo"><span><label>Calda (L/ha)</label></span><input type="number" inputMode="decimal" step="any" value={f.calda_l_ha} onChange={(e) => set("calda_l_ha", e.target.value)} /></div>
        <div className="campo largo"><span><label>Alvo (praga, doença, planta daninha)</label></span><input value={f.alvo} onChange={(e) => set("alvo", e.target.value)} /></div>

        <div className="campo largo">
          <span><label>Talhões e área (ha)</label></span>
          {talhoes.map((t) => (
            <div key={t.rec.id} className="item-dose">
              <div><b>{t.talhao}</b><small>{t.fazenda}</small></div>
              <label>
                Área
                <span className="com-unidade">
                  <input type="number" inputMode="decimal" step="any" value={areas[t.rec.id]}
                    onChange={(e) => setAreas((a) => ({ ...a, [t.rec.id]: e.target.value }))} />
                  <i>ha</i>
                </span>
              </label>
              <div className="total-item"><Selo situacao={t.rec.situacao} /></div>
            </div>
          ))}
          <small>Total: {numero(areaTotal)} ha</small>
        </div>

        <div className="campo largo">
          <span><label>A dose é por hectare ou por pipa?</label></span>
          <div className="barra" style={{ marginBottom: 0 }}>
            <label className="marcar"><input type="radio" name="dose_por_editar" checked={!pipa} onChange={() => set("dose_por", "ha")} /> Por hectare (ha)</label>
            <label className="marcar"><input type="radio" name="dose_por_editar" checked={pipa} onChange={() => set("dose_por", "pipa")} /> Por pipa (tanque cheio)</label>
          </div>
        </div>
        {pipa && (
          <div className="campo">
            <span><label>Quantos ha uma pipa faz</label></span>
            <input type="number" inputMode="decimal" step="any" value={f.ha_por_pipa} onChange={(e) => set("ha_por_pipa", e.target.value)} />
            {haPorPipa > 0 && areaTotal > 0 && <small>{numero(areaTotal / haPorPipa, 1)} pipas para {numero(areaTotal)} ha</small>}
          </div>
        )}

        <div className="campo largo">
          <span><label>Produtos e doses</label></span>
          {itens.map((i, k) => (
            <div key={i.insumo_id} className="item-dose">
              <div><b>{i.nome}</b><small>{i.fabricante || "sem fabricante"}</small></div>
              <label>
                Dose por {pipa ? "pipa" : "ha"}
                <span className="com-unidade">
                  <input type="number" inputMode="decimal" step="any" value={i.dose} onChange={(e) => mudarDose(k, e.target.value)} />
                  <i>{i.unidade}</i>
                </span>
                {pipa && doseHa(i) > 0 && <small>= {numero(doseHa(i), 3)} {i.unidade}/ha</small>}
              </label>
              <div className="total-item">
                Total<b>{numero(doseHa(i) * areaTotal, 2)} {i.unidade}</b>
                <button className="btn perigo" onClick={() => setItens((l) => l.filter((_, j) => j !== k))} aria-label={`Tirar ${i.nome}`}><Icone nome="lixo" /></button>
              </div>
            </div>
          ))}
          <select className="entrada" value={novoProduto} onChange={(e) => adicionar(e.target.value)} aria-label="Acrescentar produto">
            <option value="">+ Acrescentar produto…</option>
            {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.fabricante ? ` (${p.fabricante})` : ""}</option>)}
          </select>
        </div>
        <div className="campo largo"><span><label>Observações</label></span><textarea rows={2} value={f.observacao} onChange={(e) => set("observacao", e.target.value)} /></div>
      </div>
    </Modal>
  );
}

function Detalhe({ grupo, dados, salvar, aoFechar, aoEditar }) {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState(null);
  const itens = grupo.itens;
  const talhoes = talhoesDe(grupo, dados);
  const abertas = grupo.recs.filter(aberta);
  const pipa = porPipa(grupo);
  // Depois da baixa no estoque não dá para mudar (a saída já foi lançada com esses números).
  const podeEditar = !grupo.recs.some((r) => r.situacao === "aplicada");

  // Aprovar/cancelar vale para todos os talhões que ainda não foram aplicados.
  const mudar = async (situacao, lista = abertas) => {
    for (const r of lista) await salvar("recomendacoes", { ...r, situacao });
  };

  const darBaixa = async () => {
    const semProduto = itens.filter((i) => !dados.insumos.some((p) => p.id === i.insumo_id));
    if (semProduto.length) { setErro(`Produto não encontrado no cadastro: ${semProduto.map((i) => i.nome).join(", ")}.`); return; }
    const onde = abertas.length === 1 ? "no talhão" : `nos ${abertas.length} talhões`;
    if (!window.confirm(`Dar baixa de ${itens.length} produto(s) no estoque e lançar como aplicação ${onde}?`)) return;
    setOcupado(true);
    try {
      for (const r of abertas) {
        for (const i of r.itens ?? []) {
          await salvar("aplicacoes", {
            ...registroNovo("aplicacoes"),
            data: r.data, insumo_id: i.insumo_id, quantidade: i.total, talhao_id: r.talhao_id, cultura_id: r.cultura_id,
            dose_ha: i.dose_ha, area_aplicada: r.area_ha,
            observacao: `${r.nome ? `${r.nome} — ` : ""}Recomendação do agrônomo${r.agronomo ? ` ${r.agronomo}` : ""}${r.alvo ? ` — ${r.alvo}` : ""}`,
          });
        }
        // Marca talhão por talhão: se der erro no meio, o próximo "Dar baixa" não repete o que já foi.
        await mudar("aplicada", [r]);
      }
      aoFechar();
    } catch (e) {
      setErro(String(e?.message ?? e));
      setOcupado(false);
    }
  };

  return (
    <Modal
      titulo={grupo.nome || `Aplicação de ${dataBR(grupo.data)}`}
      aoFechar={aoFechar}
      rodape={
        <>
          <button className="btn" onClick={() => gerarPdfAplicacao(paraPdf(grupo, dados), `aplicacao-${grupo.data}.pdf`)}>
            <Icone nome="exportar" /> PDF
          </button>
          {podeEditar && <button className="btn" onClick={aoEditar} disabled={ocupado}><Icone nome="editar" /> Editar</button>}
          <span className="espaco" />
          {abertas.length > 0 && <button className="btn perigo" onClick={() => mudar("cancelada").then(aoFechar)} disabled={ocupado}>Cancelar aplicação</button>}
          {abertas.some((r) => r.situacao === "nova") && <button className="btn" onClick={() => mudar("aprovada").then(aoFechar)} disabled={ocupado}>Aprovar</button>}
          {abertas.length > 0 && <button className="btn primario" onClick={darBaixa} disabled={ocupado}><Icone nome="spray" /> {ocupado ? "Lançando…" : "Dar baixa no estoque"}</button>}
        </>
      }
    >
      {erro && <div className="aviso">{erro}</div>}
      {grupo.situacao === "aplicada" && <div className="aviso ok">Já foi dada a baixa no estoque (veja em Aplicações / saídas).</div>}
      {grupo.situacao === "parcial" && <div className="aviso info">Parte dos talhões já teve baixa. “Dar baixa” lança só os que faltam.</div>}
      <p className="descricao">
        {dataBR(grupo.data)} · <b>{grupo.agronomo || "Agrônomo"}</b> · {numero(grupo.area_ha)} ha
        {grupo.alvo ? ` · ${grupo.alvo}` : ""}{grupo.calda_l_ha ? ` · calda ${numero(grupo.calda_l_ha, 1)} L/ha` : ""}
        {pipa ? ` · dose por pipa (${numero(grupo.ha_por_pipa, 2)} ha por pipa${grupo.ha_por_pipa ? `, ${numero(grupo.area_ha / grupo.ha_por_pipa, 1)} pipas` : ""})` : " · dose por ha"}
      </p>
      <TabelaSimples
        linhas={itens.map((i, n) => ({ ...i, id: n }))}
        colunas={[
          { rotulo: "Produto", valor: (i) => <b>{i.nome}</b> },
          { rotulo: "Fabricante", valor: (i) => i.fabricante || "—" },
          ...(pipa ? [{ rotulo: "Dose/pipa", num: true, valor: (i) => (i.dose_pipa != null ? `${numero(i.dose_pipa, 3)} ${i.unidade}` : "—") }] : []),
          { rotulo: "Dose/ha", num: true, valor: (i) => `${numero(i.dose_ha, 3)} ${i.unidade}` },
          { rotulo: "Total", num: true, valor: (i) => `${numero(i.total)} ${i.unidade}` },
        ]}
      />
      <h3 style={{ marginTop: 16 }}>Talhões <small>{talhoes.length}</small></h3>
      <TabelaSimples
        linhas={talhoes.map((t) => ({ ...t, id: t.rec.id }))}
        colunas={[
          { rotulo: "Fazenda", valor: (t) => t.fazenda },
          { rotulo: "Talhão", valor: (t) => <b>{t.talhao}</b> },
          { rotulo: "Área", num: true, valor: (t) => `${numero(t.area_ha)} ha` },
          { rotulo: "Situação", valor: (t) => <Selo situacao={t.rec.situacao} /> },
        ]}
      />
      {grupo.observacao && <p className="descricao" style={{ marginTop: 12 }}>{grupo.observacao}</p>}
    </Modal>
  );
}

export function AplicacoesAgronomo({ dados, salvar }) {
  const [aberta, setAberta] = useState(null);
  const [editando, setEditando] = useState(false);
  const [busca, setBusca] = useState("");
  const termo = busca.trim().toLowerCase();
  // Acha pelo nome da aplicação, pelo nome, fabricante e princípio ativo dos produtos, e também por agrônomo, talhão e alvo.
  const porProduto = new Map((dados.insumos ?? []).map((i) => [i.id, i]));
  const texto = (g) => [
    g.nome, g.agronomo, g.alvo, ...g.recs.map((r) => nomeRef(dados, "talhoes", r.talhao_id)),
    ...g.itens.flatMap((i) => { const p = porProduto.get(i.insumo_id); return [i.nome, i.fabricante, p?.nome, p?.fabricante, p?.principio_ativo]; }),
  ].map((v) => String(v ?? "")).join(" ").toLowerCase();
  const grupos = agruparRecomendacoes(dados.recomendacoes);
  const lista = grupos.map((g) => ({ ...g, id: g.chave }))
    .filter((g) => !termo || texto(g).includes(termo))
    .sort((a, b) => String(b.criado_em ?? b.data).localeCompare(String(a.criado_em ?? a.data)));
  // O registro aberto pode mudar (aprovou, deu baixa): pega sempre a versão atual.
  const abertaAtual = aberta && grupos.find((g) => g.chave === aberta);
  const talhoes = (g) => {
    if (g.recs.length === 1) return nomeRef(dados, "talhoes", g.talhao_id);
    const nomes = g.recs.map((r) => nomeRef(dados, "talhoes", r.talhao_id));
    return `${g.recs.length} talhões: ${nomes.slice(0, 3).join(", ")}${nomes.length > 3 ? "…" : ""}`;
  };
  return (
    <div className="cartao">
      <p className="descricao">
        Aplicações que o agrônomo montou (uma linha por aplicação, mesmo que vá para vários talhões). Abra uma para ver,
        baixar o PDF ou <b>dar baixa no estoque</b> quando for aplicada.
      </p>
      <div className="barra">
        <input className="entrada busca" placeholder="Buscar aplicação, produto, fabricante, talhão…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar" />
      </div>
      <TabelaSimples
        aoClicar={(g) => setAberta(g.chave)}
        vazio="Nenhuma aplicação do agrônomo ainda. Mande o link para ele na aba “Link do agrônomo”."
        linhas={lista}
        colunas={[
          { rotulo: "Data", valor: (g) => dataBR(g.data) },
          { rotulo: "Aplicação", valor: (g) => <b>{g.nome || "Sem nome"}</b> },
          { rotulo: "Agrônomo", valor: (g) => g.agronomo || "—" },
          { rotulo: "Talhões", valor: talhoes },
          { rotulo: "Área", num: true, valor: (g) => `${numero(g.area_ha)} ha` },
          { rotulo: "Produtos", valor: (g) => g.itens.map((i) => i.nome).join(", ") },
          { rotulo: "Dose por", valor: (g) => (porPipa(g) ? "Pipa" : "ha") },
          { rotulo: "Alvo", valor: (g) => g.alvo || "—" },
          { rotulo: "Situação", valor: (g) => <Selo situacao={g.situacao} /> },
          { rotulo: "", valor: () => <button className="btn">Abrir</button> },
        ]}
      />
      {abertaAtual && !editando && (
        <Detalhe grupo={abertaAtual} dados={dados} salvar={salvar} aoFechar={() => setAberta(null)} aoEditar={() => setEditando(true)} />
      )}
      {abertaAtual && editando && <Editar grupo={abertaAtual} dados={dados} salvar={salvar} aoFechar={() => setEditando(false)} />}
    </div>
  );
}

function LinhaLink({ link, salvar, remover }) {
  const url = `${window.location.origin}/agronomo/${link.token}`;
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try { await navigator.clipboard.writeText(url); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { /* sem permissão: o link está na caixa para copiar à mão */ }
  };
  return (
    <div className="item-link">
      <div className="barra" style={{ marginBottom: 8 }}>
        <b>{link.nome}</b>
        <span className={`selo ${link.ativo === false ? "ruim" : "ok"}`}>{link.ativo === false ? "Desativado" : "Ativo"}</span>
        <span className="espaco" />
        <button className="btn" onClick={() => salvar("links_agronomo", { ...link, ativo: link.ativo === false })}>
          {link.ativo === false ? "Reativar" : "Desativar"}
        </button>
        <button className="btn perigo" onClick={() => window.confirm(`Apagar o link de ${link.nome}? Ele para de funcionar na hora.`) && remover("links_agronomo", link.id)}>
          <Icone nome="lixo" />
        </button>
      </div>
      <div className="barra" style={{ marginBottom: 0 }}>
        <input className="entrada" style={{ flex: 1, minWidth: 220 }} readOnly value={url} onFocus={(e) => e.target.select()} aria-label={`Link de ${link.nome}`} />
        <button className="btn primario" onClick={copiar}>{copiado ? "Copiado!" : "Copiar link"}</button>
        <a className="btn" target="_blank" rel="noreferrer"
          href={`https://wa.me/?text=${encodeURIComponent(`Estoque de químicos da Fazenda Carvalho Cruz: ${url}`)}`}>
          Enviar pelo WhatsApp
        </a>
      </div>
    </div>
  );
}

export function LinkAgronomo({ dados, salvar, remover }) {
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState(null);
  const criar = async () => {
    if (!nome.trim()) { setErro("Escreva o nome do agrônomo."); return; }
    setErro(null);
    // prepararRegistro é quem cria o código secreto do link.
    const { reg } = prepararRegistro("links_agronomo", { ...registroNovo("links_agronomo"), nome: nome.trim(), ativo: true });
    await salvar("links_agronomo", reg);
    setNome("");
  };
  return (
    <div className="cartao">
      <p className="descricao">
        Mande o link para o agrônomo. Ele abre no celular ou computador, <b>sem senha</b>, e vê só o estoque de
        químicos (sem preços, vendas ou financeiro). Se o link vazar, desative ou apague e crie outro.
      </p>
      {!supabaseConfigurado && <div className="aviso info">O link só funciona depois que o sistema estiver ligado ao Supabase (veja o README).</div>}
      {erro && <div className="aviso">{erro}</div>}
      <div className="barra">
        <input className="entrada" style={{ flex: 1, minWidth: 200 }} placeholder="Nome do agrônomo" value={nome} onChange={(e) => setNome(e.target.value)} />
        <button className="btn primario" onClick={criar}><Icone nome="mais" /> Criar link</button>
      </div>
      {dados.links_agronomo.length === 0
        ? <div className="vazio">Nenhum link criado ainda.</div>
        : dados.links_agronomo.map((l) => <LinhaLink key={l.id} link={l} salvar={salvar} remover={remover} />)}
    </div>
  );
}
