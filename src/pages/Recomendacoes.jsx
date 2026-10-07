import { useState } from "react";

import { Icone, Modal, TabelaSimples } from "../components/ui";
import { prepararRegistro, registroNovo } from "../lib/esquema";
import { data as dataBR, nomeRef, numero } from "../lib/formato";
import { gerarPdfAplicacao } from "../lib/pdfAplicacao";
import { supabaseConfigurado } from "../lib/supabase";

const SELOS = { nova: ["atencao", "Nova"], aprovada: ["ok", "Aprovada"], aplicada: ["ok", "Aplicada"], cancelada: ["ruim", "Cancelada"] };

/** Junta nomes (talhão, fazenda, cultura) para o PDF. */
function paraPdf(rec, dados) {
  const t = dados.talhoes.find((x) => x.id === rec.talhao_id);
  return {
    ...rec,
    talhao: t?.nome,
    fazenda: t ? nomeRef(dados, "fazendas", t.fazenda_id) : null,
    cultura: rec.cultura_id ? nomeRef(dados, "culturas", rec.cultura_id) : null,
    itens: rec.itens ?? [],
  };
}

function Detalhe({ rec, dados, salvar, aoFechar }) {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState(null);
  const itens = rec.itens ?? [];
  const aberta = rec.situacao === "nova" || rec.situacao === "aprovada";

  const mudar = (situacao) => salvar("recomendacoes", { ...rec, situacao }).then(aoFechar);

  const darBaixa = async () => {
    const semProduto = itens.filter((i) => !dados.insumos.some((p) => p.id === i.insumo_id));
    if (semProduto.length) { setErro(`Produto não encontrado no cadastro: ${semProduto.map((i) => i.nome).join(", ")}.`); return; }
    if (!window.confirm(`Dar baixa de ${itens.length} produto(s) no estoque e lançar como aplicação no talhão?`)) return;
    setOcupado(true);
    try {
      for (const i of itens) {
        await salvar("aplicacoes", {
          ...registroNovo("aplicacoes"),
          data: rec.data, insumo_id: i.insumo_id, quantidade: i.total, talhao_id: rec.talhao_id, cultura_id: rec.cultura_id,
          dose_ha: i.dose_ha, area_aplicada: rec.area_ha,
          observacao: `Recomendação do agrônomo${rec.agronomo ? ` ${rec.agronomo}` : ""}${rec.alvo ? ` — ${rec.alvo}` : ""}`,
        });
      }
      await mudar("aplicada");
    } catch (e) {
      setErro(String(e?.message ?? e));
      setOcupado(false);
    }
  };

  return (
    <Modal
      titulo={`Aplicação de ${dataBR(rec.data)}`}
      aoFechar={aoFechar}
      rodape={
        <>
          <button className="btn" onClick={() => gerarPdfAplicacao(paraPdf(rec, dados), `aplicacao-${rec.data}.pdf`)}>
            <Icone nome="exportar" /> PDF
          </button>
          <span className="espaco" />
          {aberta && <button className="btn perigo" onClick={() => mudar("cancelada")} disabled={ocupado}>Cancelar aplicação</button>}
          {rec.situacao === "nova" && <button className="btn" onClick={() => mudar("aprovada")} disabled={ocupado}>Aprovar</button>}
          {aberta && <button className="btn primario" onClick={darBaixa} disabled={ocupado}><Icone nome="spray" /> {ocupado ? "Lançando…" : "Dar baixa no estoque"}</button>}
        </>
      }
    >
      {erro && <div className="aviso">{erro}</div>}
      {rec.situacao === "aplicada" && <div className="aviso ok">Já foi dada a baixa no estoque (veja em Aplicações / saídas).</div>}
      <p className="descricao">
        <b>{rec.agronomo || "Agrônomo"}</b> · {nomeRef(dados, "talhoes", rec.talhao_id)} · {numero(rec.area_ha)} ha
        {rec.alvo ? ` · ${rec.alvo}` : ""}{rec.calda_l_ha ? ` · calda ${numero(rec.calda_l_ha, 1)} L/ha` : ""}
      </p>
      <TabelaSimples
        linhas={itens.map((i, n) => ({ ...i, id: n }))}
        colunas={[
          { rotulo: "Produto", valor: (i) => <b>{i.nome}</b> },
          { rotulo: "Fabricante", valor: (i) => i.fabricante || "—" },
          { rotulo: "Dose/ha", num: true, valor: (i) => `${numero(i.dose_ha, 3)} ${i.unidade}` },
          { rotulo: "Total", num: true, valor: (i) => `${numero(i.total)} ${i.unidade}` },
        ]}
      />
      {rec.observacao && <p className="descricao" style={{ marginTop: 12 }}>{rec.observacao}</p>}
    </Modal>
  );
}

export function AplicacoesAgronomo({ dados, salvar }) {
  const [aberta, setAberta] = useState(null);
  const [busca, setBusca] = useState("");
  const termo = busca.trim().toLowerCase();
  // Acha pelo nome, fabricante e princípio ativo dos produtos da aplicação, e também por agrônomo, talhão e alvo.
  const porProduto = new Map((dados.insumos ?? []).map((i) => [i.id, i]));
  const texto = (r) => [
    r.agronomo, r.alvo, nomeRef(dados, "talhoes", r.talhao_id),
    ...(r.itens ?? []).flatMap((i) => { const p = porProduto.get(i.insumo_id); return [i.nome, i.fabricante, p?.nome, p?.fabricante, p?.principio_ativo]; }),
  ].map((v) => String(v ?? "")).join(" ").toLowerCase();
  const lista = [...dados.recomendacoes].filter((r) => !termo || texto(r).includes(termo)).sort((a, b) => String(b.criado_em ?? b.data).localeCompare(String(a.criado_em ?? a.data)));
  return (
    <div className="cartao">
      <p className="descricao">
        Aplicações que o agrônomo montou. Abra uma para ver, baixar o PDF ou <b>dar baixa no estoque</b> quando for aplicada.
      </p>
      <div className="barra">
        <input className="entrada busca" placeholder="Buscar produto, fabricante, talhão…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar" />
      </div>
      <TabelaSimples
        vazio="Nenhuma aplicação do agrônomo ainda. Mande o link para ele na aba “Link do agrônomo”."
        linhas={lista}
        colunas={[
          { rotulo: "Data", valor: (r) => dataBR(r.data) },
          { rotulo: "Agrônomo", valor: (r) => r.agronomo || "—" },
          { rotulo: "Talhão", valor: (r) => nomeRef(dados, "talhoes", r.talhao_id) },
          { rotulo: "Produtos", valor: (r) => (r.itens ?? []).map((i) => i.nome).join(", ") },
          { rotulo: "Alvo", valor: (r) => r.alvo || "—" },
          { rotulo: "Situação", valor: (r) => <span className={`selo ${SELOS[r.situacao]?.[0] ?? "neutro"}`}>{SELOS[r.situacao]?.[1] ?? r.situacao}</span> },
          { rotulo: "", valor: (r) => <button className="btn" onClick={() => setAberta(r)}>Abrir</button> },
        ]}
      />
      {aberta && <Detalhe rec={aberta} dados={dados} salvar={salvar} aoFechar={() => setAberta(null)} />}
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
