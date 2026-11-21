import { useState } from "react";

import useEscolhaTalhoes from "../hooks/useEscolhaTalhoes";
import { ESQUEMA } from "../lib/esquema";
import { brl, data, exibir, nomeRef, numero } from "../lib/formato";
import Formulario from "./Formulario";
import { Icone, Modal, Stat, TabelaSimples } from "./ui";
import { ImagemAmpliavel } from "./VerFoto";

const n = (v) => Number(v) || 0;

/** Tudo o que mexeu no estoque deste produto, do mais novo para o mais velho. */
function movimentos(dados, insumo) {
  const lista = [];
  for (const e of dados.insumo_entradas) {
    if (e.insumo_id !== insumo.id) continue;
    lista.push({
      id: `e-${e.id}`, data: e.data, tipo: e.a_conferir ? "Entrada (a conferir)" : "Entrada / compra", qtd: n(e.quantidade),
      detalhe: [e.fornecedor, e.nota && `NF ${e.nota}`, e.lote && `Lote ${e.lote}`].filter(Boolean).join(" · ") || "—",
      valor: n(e.valor) || null,
    });
  }
  for (const a of dados.insumo_ajustes ?? []) {
    if (a.insumo_id !== insumo.id) continue;
    lista.push({
      id: `b-${a.id}`, data: a.data, tipo: "Balanço", qtd: n(a.quantidade),
      detalhe: a.contado != null ? `Contado: ${numero(a.contado)} ${insumo.unidade}` : a.observacao || "—",
      valor: n(a.quantidade) > 0 && n(a.custo_unitario) ? n(a.quantidade) * n(a.custo_unitario) : null,
    });
  }
  for (const a of dados.aplicacoes) {
    if (a.insumo_id !== insumo.id) continue;
    const sobra = n(a.quantidade) < 0;
    lista.push({
      id: `a-${a.id}`, data: a.data, tipo: sobra ? "Sobra que voltou" : "Aplicação", qtd: -n(a.quantidade),
      detalhe: [a.talhao_id && nomeRef(dados, "talhoes", a.talhao_id), a.area_aplicada && `${numero(a.area_aplicada)} ha`]
        .filter(Boolean).join(" · ") || "—",
      valor: null,
    });
  }
  lista.sort((a, b) => String(b.data ?? "").localeCompare(String(a.data ?? "")));
  if (n(insumo.estoque_inicial)) {
    lista.push({
      id: "inicial", data: null, tipo: "Estoque inicial (cadastro)", qtd: n(insumo.estoque_inicial), detalhe: "—",
      valor: n(insumo.custo_inicial) ? n(insumo.estoque_inicial) * n(insumo.custo_inicial) : null,
    });
  }
  return lista;
}

/**
 * Ficha de um produto do estoque: números, cadastro, fotos do rótulo e todas
 * as entradas, aplicações e balanços. Dá para editar o cadastro daqui.
 */
export default function FichaInsumo({ item, dados, salvar, aoFechar }) {
  // Pega o produto atualizado (depois de editar, a linha da tabela muda).
  const insumo = dados.insumos.find((i) => i.id === item.insumo.id) ?? item.insumo;
  const campos = ESQUEMA.insumos.campos;
  const [rascunho, setRascunho] = useState(null);
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const escolha = useEscolhaTalhoes("insumos", dados);

  const editar = () => { setErro(null); setRascunho({ ...insumo }); escolha.iniciar(insumo); };
  const gravar = async () => {
    const { regs, erro: e } = escolha.montar(rascunho);
    if (e) { setErro(e); return; }
    setSalvando(true);
    try {
      for (const reg of regs) await salvar("insumos", reg);
      setRascunho(null);
    } catch (err) {
      setErro(String(err?.message ?? err));
    } finally {
      setSalvando(false);
    }
  };

  if (rascunho) {
    return (
      <Modal
        titulo={`Editar ${insumo.nome}`}
        aoFechar={() => setRascunho(null)}
        rodape={
          <>
            <span className="espaco" />
            <button className="btn" onClick={() => setRascunho(null)}>Voltar</button>
            <button className="btn primario" onClick={gravar} disabled={salvando}>
              <Icone nome="editar" /> {salvando ? "Salvando…" : "Salvar"}
            </button>
          </>
        }
      >
        {erro && <div className="aviso">{erro}</div>}
        <Formulario colecao="insumos" reg={rascunho} setReg={setRascunho} dados={dados} contexto={{}} escolha={escolha} />
      </Modal>
    );
  }

  const un = insumo.unidade ?? "";
  const situacao = item.negativo ? "Negativo" : item.baixo ? "Baixo" : "OK";
  const info = [
    ["Fabricante", insumo.fabricante],
    ["Tipo", exibir(campos.tipo, insumo.tipo)],
    ["Princípio ativo", insumo.principio_ativo],
    ["Unidade", un],
    ["Embalagem", insumo.tamanho_embalagem ? `${insumo.embalagem_tipo ?? "Embalagem"} de ${numero(insumo.tamanho_embalagem)} ${un}` : insumo.embalagem_tipo],
    ["Validade", insumo.validade ? data(insumo.validade) : null],
    ["Estoque mínimo", insumo.estoque_minimo != null && insumo.estoque_minimo !== "" ? `${numero(insumo.estoque_minimo)} ${un}` : null],
    ["Situação", situacao],
    ["Ativo", insumo.ativo === false ? "Não" : "Sim"],
  ];
  const lista = movimentos(dados, insumo);

  return (
    <Modal
      titulo={insumo.nome}
      aoFechar={aoFechar}
      rodape={
        <>
          <span className="espaco" />
          <button className="btn" onClick={aoFechar}>Fechar</button>
          <button className="btn primario" onClick={editar}><Icone nome="editar" /> Editar cadastro</button>
        </>
      }
    >
      <div className="grade">
        <Stat rotulo="Saldo" valor={`${numero(item.saldo)} ${un}`} cor={item.saldo < 0 ? "vermelho" : ""} />
        <Stat rotulo="Entrou" valor={`${numero(item.entrada)} ${un}`} cor="cinza" />
        <Stat rotulo="Inicial / balanço" valor={item.ajuste ? `${numero(item.ajuste)} ${un}` : "—"} cor="cinza" />
        <Stat rotulo="Aplicado" valor={`${numero(item.saida)} ${un}`} cor="cinza" />
        <Stat rotulo="Custo médio" valor={item.custoMedio ? `${brl(item.custoMedio)}/${un}` : "—"} cor="cinza" />
        <Stat rotulo="Valor em estoque" valor={brl(item.valorEstoque)} cor="cinza" />
      </div>

      <dl className="ficha-insumo">
        {info.filter(([, v]) => v != null && v !== "").map(([r, v]) => (
          <div key={r}><dt>{r}</dt><dd>{v}</dd></div>
        ))}
      </dl>
      {insumo.observacao && <p className="descricao">{insumo.observacao}</p>}

      {insumo.fotos_rotulo?.length > 0 && (
        <div className="fotos" style={{ marginBottom: 16 }}>
          {insumo.fotos_rotulo.map((f, i) => <div key={i} className="foto"><ImagemAmpliavel src={f} alt={`Foto ${i + 1} do rótulo`} /></div>)}
        </div>
      )}

      <h3 style={{ margin: "8px 0" }}>Movimentações</h3>
      <TabelaSimples
        vazio="Nenhuma entrada, aplicação ou balanço deste produto."
        linhas={lista}
        colunas={[
          { rotulo: "Data", valor: (m) => (m.data ? data(m.data) : "—") },
          { rotulo: "Movimento", valor: (m) => m.tipo },
          { rotulo: "Quantidade", num: true, valor: (m) => <b className={m.qtd < 0 ? "negativo" : "positivo"}>{m.qtd > 0 ? "+" : ""}{numero(m.qtd)} {un}</b> },
          { rotulo: "Detalhe", valor: (m) => m.detalhe },
          { rotulo: "Valor", num: true, valor: (m) => (m.valor ? brl(m.valor) : "—") },
        ]}
      />
    </Modal>
  );
}
