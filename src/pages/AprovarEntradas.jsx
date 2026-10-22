import { useCallback, useState } from "react";

import Formulario from "../components/Formulario";
import { Icone, Modal, TabelaSimples } from "../components/ui";
import { ESQUEMA, prepararRegistro, registroNovo } from "../lib/esquema";
import { data, nomeRef, numero } from "../lib/formato";

/**
 * O operador avisa pelo celular de campo que chegou produto (fotos, quantidade,
 * nota e boleto). Aqui o escritório confere, completa o que falta (valor,
 * fornecedor, vencimento…) e aprova: a entrada cai no estoque, e o produto é
 * cadastrado se ainda não existia. Ou recusa, com o motivo.
 */

const SITUACAO = Object.fromEntries(ESQUEMA.solicitacoes_produto.campos.situacao.opcoes);
const SELO = { pendente: "atencao", aprovada: "ok", recusada: "ruim" };

const mesmoNome = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

function Miniaturas({ titulo, fotos }) {
  if (!fotos?.length) return <div className="campo"><span>{titulo}</span><small>Não mandou.</small></div>;
  return (
    <div className="campo largo">
      <span>{titulo}</span>
      <div className="fotos">
        {fotos.map((f, i) => (
          <div key={i} className="foto"><a href={f} target="_blank" rel="noreferrer"><img src={f} alt={`${titulo} ${i + 1}`} /></a></div>
        ))}
      </div>
    </div>
  );
}

/** Rascunhos da aprovação: a entrada no estoque e, se for novo, o cadastro do produto. */
function rascunhos(sol, dados) {
  const existente = dados.insumos.find((i) => i.id === sol.insumo_id) ?? dados.insumos.find((i) => mesmoNome(i.nome, sol.produto));
  let entrada = {
    ...registroNovo("insumo_entradas"),
    data: sol.data, insumo_id: existente?.id ?? null, quantidade: sol.quantidade,
    fotos_nota: sol.fotos_nota, chave_nfe: sol.chave_nfe, fotos_boleto: sol.fotos_boleto, codigo_boleto: sol.codigo_boleto,
  };
  // Lê a chave da nota e o código do boleto do mesmo jeito que o formulário faz ao digitar.
  for (const chave of ["chave_nfe", "codigo_boleto"]) {
    if (entrada[chave]) entrada = { ...entrada, ...ESQUEMA.insumo_entradas.aoMudar[chave](entrada, dados) };
  }
  const produto = { ...registroNovo("insumos"), nome: sol.produto, unidade: sol.unidade, fotos_rotulo: sol.fotos_produto };
  return { entrada, produto, novo: !existente };
}

function Aprovacao({ sol, dados, salvar, aoFechar }) {
  const [inicial] = useState(() => rascunhos(sol, dados));
  const [entrada, setEntrada] = useState(inicial.entrada);
  const [produto, setProduto] = useState(inicial.produto);
  const [novo, setNovo] = useState(inicial.novo);
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const aprovar = async () => {
    let regProduto = null;
    if (novo) {
      const p = prepararRegistro("insumos", produto);
      if (p.erro) { setErro(`Cadastro do produto — ${p.erro}`); return; }
      regProduto = p.reg;
    }
    // O id do produto novo só existe depois de gravar; até lá vale qualquer coisa para a conferência.
    const e = prepararRegistro("insumo_entradas", { ...entrada, insumo_id: novo ? "novo" : entrada.insumo_id });
    if (e.erro) { setErro(`Entrada no estoque — ${e.erro}`); return; }

    setSalvando(true);
    try {
      const insumoId = novo ? (await salvar("insumos", regProduto)).id : e.reg.insumo_id;
      const lancada = await salvar("insumo_entradas", { ...e.reg, insumo_id: insumoId });
      await salvar("solicitacoes_produto", { ...sol, situacao: "aprovada", insumo_id: insumoId, entrada_id: lancada.id, resposta: null });
      aoFechar();
    } catch (err) {
      setErro(String(err?.message ?? err));
      setSalvando(false);
    }
  };

  const recusar = async () => {
    const motivo = window.prompt("Por que está recusando? (o operador vê esta resposta)");
    if (motivo == null) return;
    setSalvando(true);
    await salvar("solicitacoes_produto", { ...sol, situacao: "recusada", resposta: motivo.trim() || "Recusada" });
    aoFechar();
  };

  return (
    <Modal titulo="Aprovar entrada de produto" aoFechar={aoFechar} rodape={
      <>
        <button className="btn perigo" onClick={recusar} disabled={salvando}><Icone nome="fechar" /> Recusar</button>
        <span className="espaco" />
        <button className="btn" onClick={aoFechar}>Depois</button>
        <button className="btn primario" onClick={aprovar} disabled={salvando}>
          <Icone nome="caixa" /> {salvando ? "Lançando…" : "Aprovar e lançar no estoque"}
        </button>
      </>
    }>
      {erro && <div className="aviso">{erro}</div>}

      <h3>O que chegou</h3>
      <p className="descricao">
        <b>{nomeRef(dados, "funcionarios", sol.operador_id)}</b> recebeu em {data(sol.data)}:{" "}
        <b>{numero(sol.quantidade)} {sol.unidade} de {sol.produto}</b>.
        {sol.observacao && <><br />Recado: “{sol.observacao}”</>}
      </p>
      <div className="form">
        <Miniaturas titulo="Produto" fotos={sol.fotos_produto} />
        <Miniaturas titulo="Nota fiscal" fotos={sol.fotos_nota} />
        <Miniaturas titulo="Boleto" fotos={sol.fotos_boleto} />
      </div>

      <h3 style={{ marginTop: 18 }}>Produto</h3>
      <label className="campo check" style={{ marginBottom: 10 }}>
        <input type="checkbox" checked={novo} onChange={(e) => setNovo(e.target.checked)} />
        <span>É produto novo — cadastrar agora</span>
      </label>
      {novo && <Formulario colecao="insumos" reg={produto} setReg={setProduto} dados={dados} />}

      <h3 style={{ marginTop: 18 }}>Entrada no estoque</h3>
      <p className="descricao">Complete o valor, o fornecedor e o resto. Com boleto, a conta fica como não paga até o vencimento.</p>
      <Formulario colecao="insumo_entradas" reg={entrada} setReg={setEntrada} dados={dados} ocultar={novo ? ["insumo_id"] : undefined} />
    </Modal>
  );
}

export default function AprovarEntradas({ dados, salvar }) {
  const [aberta, setAberta] = useState(null);
  const fechar = useCallback(() => setAberta(null), []);

  const todas = dados.solicitacoes_produto;
  const pendentes = todas.filter((s) => s.situacao === "pendente").sort((a, b) => String(a.data).localeCompare(String(b.data)));
  const resolvidas = todas.filter((s) => s.situacao !== "pendente")
    .sort((a, b) => String(b.atualizado_em ?? "").localeCompare(String(a.atualizado_em ?? ""))).slice(0, 50);

  const colunas = [
    { rotulo: "Data", valor: (s) => data(s.data) },
    { rotulo: "Produto", valor: (s) => s.produto },
    { rotulo: "Quantidade", num: true, valor: (s) => `${numero(s.quantidade)} ${s.unidade ?? ""}` },
    { rotulo: "Quem recebeu", valor: (s) => nomeRef(dados, "funcionarios", s.operador_id) },
    { rotulo: "Documentos", valor: (s) => [s.fotos_nota?.length && "nota", s.fotos_boleto?.length && "boleto"].filter(Boolean).join(" + ") || "—" },
    { rotulo: "Situação", valor: (s) => <span className={`selo ${SELO[s.situacao] ?? "neutro"}`}>{SITUACAO[s.situacao] ?? s.situacao}</span> },
  ];

  return (
    <>
      <div className="cartao">
        <p className="descricao">
          Produtos que os operadores avisaram pelo celular de campo. Abra, confira as fotos da nota e do boleto,
          complete o que falta e aprove — a entrada vai para o estoque.
        </p>
        <TabelaSimples
          vazio="Nada esperando aprovação."
          linhas={pendentes}
          colunas={[...colunas, { rotulo: "", valor: (s) => <button className="btn primario" onClick={() => setAberta(s)}>Conferir</button> }]}
        />
      </div>
      {resolvidas.length > 0 && (
        <div className="cartao">
          <h2>Já resolvidas</h2>
          <TabelaSimples linhas={resolvidas} colunas={[...colunas, { rotulo: "Resposta", valor: (s) => s.resposta || "—" }]} />
        </div>
      )}
      {aberta && <Aprovacao key={aberta.id} sol={aberta} dados={dados} salvar={salvar} aoFechar={fechar} />}
    </>
  );
}
