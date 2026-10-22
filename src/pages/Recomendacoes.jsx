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

function Detalhe({ grupo, dados, salvar, aoFechar }) {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState(null);
  const itens = grupo.itens;
  const talhoes = talhoesDe(grupo, dados);
  const abertas = grupo.recs.filter(aberta);
  const pipa = porPipa(grupo);

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
          { rotulo: "", valor: (g) => <button className="btn" onClick={() => setAberta(g.chave)}>Abrir</button> },
        ]}
      />
      {abertaAtual && <Detalhe grupo={abertaAtual} dados={dados} salvar={salvar} aoFechar={() => setAberta(null)} />}
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
