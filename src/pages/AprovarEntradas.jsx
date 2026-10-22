import { useCallback, useState } from "react";

import { Foto } from "../components/Foto";
import Formulario from "../components/Formulario";
import { Icone, Modal, TabelaSimples } from "../components/ui";
import { ESQUEMA, prepararRegistro, registroNovo } from "../lib/esquema";
import { data, nomeRef, numero } from "../lib/formato";
import { comprimir, urlDaFoto } from "../lib/fotos";

/**
 * Entradas lançadas no depósito pelo Modo Campo (Guardar no depósito →
 * Produto novo) esperando o escritório. Aqui se confere as fotos do produto,
 * da nota e do boleto, completa o que falta e aprova: o produto sem cadastro
 * é cadastrado, a entrada passa a valer no estoque com preço e o boleto entra
 * na Programação de pagamentos. Ou se recusa (apaga o lançamento).
 */

const mesmoNome = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

/** As fotos do cadastro (rótulo, boleto) ficam dentro do registro; a do depósito é um arquivo. Converte uma na outra. */
async function fotoParaCadastro(caminho) {
  const url = caminho && await urlDaFoto(caminho);
  if (!url) return null;
  const blob = await comprimir(await (await fetch(url)).blob(), 800, 0.6);
  return new Promise((resolve) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(leitor.result);
    leitor.onerror = () => resolve(null);
    leitor.readAsDataURL(blob);
  });
}

function FotoConferir({ titulo, caminho }) {
  return (
    <div className="campo">
      <span>{titulo}</span>
      {caminho ? <Foto caminho={caminho} alt={titulo} className="foto-conferir" ampliar /> : <small>Não mandou.</small>}
    </div>
  );
}

/** Rascunhos da aprovação: a entrada, o cadastro do produto novo e o pagamento do boleto. */
function rascunhos(ent, dados) {
  const jaTem = ent.insumo_id ? null : dados.insumos.find((i) => mesmoNome(i.nome, ent.produto_novo));
  const entrada = { ...ent, insumo_id: ent.insumo_id ?? jaTem?.id ?? null, a_conferir: false };
  const produto = { ...registroNovo("insumos"), nome: ent.produto_novo ?? "", unidade: ent.unidade_nova || "L" };
  let boleto = {
    ...registroNovo("boletos"), categoria: "Produtos químicos", linha_digitavel: ent.linha_digitavel,
    observacao: "Compra já lançada no estoque (Entradas / compras): ao pagar, não precisa lançar de novo em Despesas.",
  };
  if (boleto.linha_digitavel) boleto = { ...boleto, ...ESQUEMA.boletos.aoMudar.linha_digitavel(boleto) };
  // Sem preço ainda: o valor do boleto é o melhor palpite para o valor da compra.
  if (entrada.valor == null && boleto.valor) entrada.valor = boleto.valor;
  return { entrada, produto, boleto, novo: !entrada.insumo_id, comBoleto: Boolean(ent.linha_digitavel || ent.foto_boleto) };
}

const CAMPOS_ENTRADA = ["data", "insumo_id", "quantidade", "valor", "fornecedor", "nota", "cultura_id", "lote", "validade"];
// Sem "quantas embalagens tem hoje": a quantidade que chegou já entra pela entrada.
const CAMPOS_PRODUTO = ["nome", "fabricante", "tipo", "principio_ativo", "unidade", "tamanho_embalagem", "embalagem_tipo", "validade", "estoque_minimo", "observacao"];
const CAMPOS_BOLETO = ["empresa", "valor", "vencimento", "linha_digitavel", "banco", "categoria", "descricao"];

function Aprovacao({ ent, dados, salvar, remover, aoFechar }) {
  const [inicial] = useState(() => rascunhos(ent, dados));
  const [entrada, setEntrada] = useState(inicial.entrada);
  const [produto, setProduto] = useState(inicial.produto);
  const [boleto, setBoleto] = useState(inicial.boleto);
  const [novo, setNovo] = useState(inicial.novo);
  const [comBoleto, setComBoleto] = useState(inicial.comBoleto);
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const aprovar = async () => {
    // Confere tudo antes de gravar qualquer coisa. O id do produto novo só
    // existe depois de gravar; até lá vale qualquer coisa para a conferência.
    const p = novo ? prepararRegistro("insumos", produto, dados) : null;
    if (p?.erro) { setErro(`Cadastro do produto — ${p.erro}`); return; }
    const e = prepararRegistro("insumo_entradas", { ...entrada, insumo_id: novo ? "novo" : entrada.insumo_id }, dados);
    if (e.erro) { setErro(`Entrada no estoque — ${e.erro}`); return; }
    const nomeProduto = novo ? p.reg.nome : nomeRef(dados, "insumos", e.reg.insumo_id);
    const b = comBoleto ? prepararRegistro("boletos", {
      ...boleto, empresa: boleto.empresa || e.reg.fornecedor,
      descricao: boleto.descricao || `Compra de ${nomeProduto}${e.reg.nota ? ` — NF ${e.reg.nota}` : ""}`,
    }, dados) : null;
    if (b?.erro) { setErro(`Boleto — ${b.erro}`); return; }

    setSalvando(true);
    setErro(null);
    try {
      let insumoId = e.reg.insumo_id;
      if (novo) {
        const rotulo = await fotoParaCadastro(ent.foto);
        insumoId = (await salvar("insumos", { ...p.reg, fotos_rotulo: rotulo ? [rotulo] : p.reg.fotos_rotulo })).id;
      }
      let boletoId = e.reg.boleto_id;
      if (b) {
        const foto = await fotoParaCadastro(ent.foto_boleto);
        boletoId = (await salvar("boletos", { ...b.reg, fotos: foto ? [foto] : b.reg.fotos })).id;
      }
      await salvar("insumo_entradas", { ...e.reg, insumo_id: insumoId, boleto_id: boletoId });
      aoFechar();
    } catch (err) {
      setErro(String(err?.message ?? err));
      setSalvando(false);
    }
  };

  const recusar = async () => {
    if (!window.confirm("Recusar esta entrada? O lançamento do depósito será apagado.")) return;
    setSalvando(true);
    await remover("insumo_entradas", ent.id);
    aoFechar();
  };

  return (
    <Modal titulo="Aprovar entrada do depósito" aoFechar={aoFechar} rodape={
      <>
        <button className="btn perigo" onClick={recusar} disabled={salvando}><Icone nome="lixo" /> Recusar</button>
        <span className="espaco" />
        <button className="btn" onClick={aoFechar}>Depois</button>
        <button className="btn primario" onClick={aprovar} disabled={salvando}>
          <Icone nome="check" /> {salvando ? "Lançando…" : "Aprovar"}
        </button>
      </>
    }>
      {erro && <div className="aviso">{erro}</div>}

      <h3>O que chegou</h3>
      <p className="descricao">
        <b>{nomeRef(dados, "funcionarios", ent.responsavel_id)}</b> recebeu em {data(ent.data)}:{" "}
        <b>{numero(ent.quantidade)} {ent.insumo_id ? dados.insumos.find((i) => i.id === ent.insumo_id)?.unidade : ent.unidade_nova}{" "}
          de {ent.produto_novo ? `${ent.produto_novo} (sem cadastro)` : nomeRef(dados, "insumos", ent.insumo_id)}</b>.
      </p>
      <div className="form">
        <FotoConferir titulo="Produto" caminho={ent.foto} />
        <FotoConferir titulo="Nota fiscal" caminho={ent.foto_nota} />
        <FotoConferir titulo="Boleto" caminho={ent.foto_boleto} />
      </div>

      {!ent.insumo_id && (
        <>
          <h3 style={{ marginTop: 18 }}>Produto</h3>
          <label className="campo check" style={{ marginBottom: 10 }}>
            <input type="checkbox" checked={novo} onChange={(e) => setNovo(e.target.checked)} />
            <span>É produto novo — cadastrar agora (a foto do depósito vira a foto do rótulo)</span>
          </label>
          {novo && <Formulario colecao="insumos" reg={produto} setReg={setProduto} dados={dados} somente={CAMPOS_PRODUTO} />}
        </>
      )}

      <h3 style={{ marginTop: 18 }}>Entrada no estoque</h3>
      <p className="descricao">Complete o valor, o fornecedor e a nota.</p>
      <Formulario colecao="insumo_entradas" reg={entrada} setReg={setEntrada} dados={dados}
        somente={novo ? CAMPOS_ENTRADA.filter((c) => c !== "insumo_id") : CAMPOS_ENTRADA} />

      <h3 style={{ marginTop: 18 }}>Boleto</h3>
      <label className="campo check" style={{ marginBottom: 10 }}>
        <input type="checkbox" checked={comBoleto} onChange={(e) => setComBoleto(e.target.checked)} />
        <span>Lançar na Programação de pagamentos</span>
      </label>
      {comBoleto && (
        <>
          {!boleto.empresa && entrada.fornecedor && <p className="descricao">Sem empresa, vai o fornecedor da entrada: {entrada.fornecedor}.</p>}
          <Formulario colecao="boletos" reg={boleto} setReg={setBoleto} dados={dados} somente={CAMPOS_BOLETO} />
        </>
      )}
    </Modal>
  );
}

export default function AprovarEntradas({ dados, salvar, remover }) {
  const [aberta, setAberta] = useState(null);
  const fechar = useCallback(() => setAberta(null), []);

  const pendentes = dados.insumo_entradas.filter((e) => e.a_conferir)
    .sort((a, b) => String(a.data).localeCompare(String(b.data)));
  const unidade = (e) => (e.insumo_id ? dados.insumos.find((i) => i.id === e.insumo_id)?.unidade : e.unidade_nova) ?? "";

  return (
    <div className="cartao">
      <p className="descricao">
        O que os operadores guardaram no depósito pelo Modo Campo. Abra, confira as fotos do produto, da nota e do
        boleto, complete o que falta e aprove. Produto sem cadastro é cadastrado na hora, e o boleto vai para a
        Programação de pagamentos.
      </p>
      <TabelaSimples
        vazio="Nada esperando aprovação."
        linhas={pendentes}
        colunas={[
          { rotulo: "Data", valor: (e) => data(e.data) },
          { rotulo: "Produto", valor: (e) => (e.insumo_id ? nomeRef(dados, "insumos", e.insumo_id) : <>{e.produto_novo} <span className="selo atencao">Sem cadastro</span></>) },
          { rotulo: "Quantidade", num: true, valor: (e) => `${numero(e.quantidade)} ${unidade(e)}` },
          { rotulo: "Quem recebeu", valor: (e) => nomeRef(dados, "funcionarios", e.responsavel_id) },
          { rotulo: "Documentos", valor: (e) => [e.foto_nota && "nota", (e.foto_boleto || e.linha_digitavel) && "boleto"].filter(Boolean).join(" + ") || "—" },
          { rotulo: "", valor: (e) => <button className="btn primario" onClick={() => setAberta(e)}>Conferir</button> },
        ]}
      />
      {aberta && <Aprovacao key={aberta.id} ent={aberta} dados={dados} salvar={salvar} remover={remover} aoFechar={fechar} />}
    </div>
  );
}
