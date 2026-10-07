import { useRef, useState } from "react";

import { prepararRegistro } from "../lib/esquema";

import { supabase } from "../lib/supabase";
import { Icone, Modal } from "./ui";

/** Pergunta à IA (função consultar-produto) e devolve o texto. */
async function consultarProduto(reg) {
  if (!supabase) throw new Error("Precisa do Supabase configurado e de internet.");
  const { data, error } = await supabase.functions.invoke("consultar-produto", {
    body: { nome: reg.nome, fabricante: reg.fabricante, principio_ativo: reg.principio_ativo, tipo: reg.tipo },
  });
  if (error) throw new Error(error.message);
  if (data?.erro) throw new Error(data.erro);
  return data.texto;
}

const MARCA = "Consulta na internet";

/**
 * Botão "Consultar uso, dose e substitutos": pergunta à IA (função
 * consultar-produto no Supabase) pelo nome comercial + fabricante.
 * O texto é só apoio: vale o rótulo/bula e o agrônomo.
 */
export default function ConsultaProduto({ reg, setReg }) {
  const [carregando, setCarregando] = useState(false);
  const [texto, setTexto] = useState(null);
  const [erro, setErro] = useState(null);

  const consultar = async () => {
    setCarregando(true); setErro(null); setTexto(null);
    try {
      setTexto(await consultarProduto(reg));
    } catch (e) {
      setErro(String(e?.message ?? e));
    } finally {
      setCarregando(false);
    }
  };

  const guardar = () => {
    setReg?.((atual) => ({ ...atual, observacao: [atual.observacao, texto].filter(Boolean).join("\n\n") }));
    setTexto(null);
  };

  return (
    <div className="consulta">
      <button type="button" className="btn" onClick={consultar} disabled={carregando || !reg.nome?.trim()}
        title={reg.nome?.trim() ? "" : "Preencha o nome comercial"}>
        <Icone nome="busca" /> {carregando ? "Pesquisando…" : "Consultar uso, dose e substitutos"}
      </button>
      {erro && <div className="aviso">{erro}</div>}
      {texto && (
        <>
          <pre className="consulta-texto">{texto}</pre>
          <div className="barra">
            <small>Informação de apoio: vale o rótulo/bula e a orientação do agrônomo.</small>
            <span className="espaco" />
            {setReg && <button type="button" className="btn" onClick={guardar}>Guardar na observação</button>}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Pesquisa avulsa na internet, aberta pela aba Produtos: digita o nome
 * comercial (e o fabricante) e vê princípio ativo, dose do fabricante e
 * culturas, sem precisar cadastrar antes. Dá para cadastrar com o resultado.
 */
export function PesquisaProduto({ aoFechar, aoCadastrar }) {
  const [reg, setReg] = useState({ nome: "", fabricante: "", observacao: "" });
  const campo = (chave, rotulo, extra) => (
    <label className="campo"><span>{rotulo}</span>
      <input value={reg[chave]} onChange={(e) => setReg((r) => ({ ...r, [chave]: e.target.value }))} {...extra} />
    </label>
  );
  return (
    <Modal titulo="Pesquisar produto na internet" aoFechar={aoFechar}>
      <p className="descricao">Digite o nome comercial e, se souber, o fabricante. Traz princípio ativo, dose recomendada pelo fabricante e culturas.</p>
      {campo("nome", "Nome comercial", { autoFocus: true })}
      {campo("fabricante", "Fabricante")}
      <ConsultaProduto reg={reg} setReg={setReg} />
      {reg.observacao && (
        <div className="barra">
          <span className="espaco" />
          <button type="button" className="btn primario" onClick={() => aoCadastrar(reg)}>Cadastrar com estes dados</button>
        </div>
      )}
    </Modal>
  );
}

/**
 * Consulta vários produtos de uma vez (os da lista na tela). Um de cada vez,
 * grava o resultado na observação e pula quem já foi consultado — dá para
 * parar e continuar depois sem repetir (e sem gastar de novo).
 */
export function ConsultarTodos({ produtos, salvar, aoFechar }) {
  const pendentes = produtos.filter((p) => p.ativo !== false && p.nome && !String(p.observacao ?? "").includes(MARCA));
  const [fila] = useState(pendentes);
  const [feitos, setFeitos] = useState(0);
  const [falhas, setFalhas] = useState([]);
  const [rodando, setRodando] = useState(false);
  const parar = useRef(false);

  const iniciar = async () => {
    parar.current = false;
    setRodando(true);
    setFalhas([]);
    let ok = 0;
    for (const p of fila) {
      if (parar.current) break;
      try {
        const texto = await consultarProduto(p);
        const hojeBR = new Date().toLocaleDateString("pt-BR");
        const observacao = [p.observacao, `— ${MARCA} (${hojeBR}) —\n${texto}`].filter(Boolean).join("\n\n");
        const { reg } = prepararRegistro("insumos", { ...p, observacao });
        await salvar("insumos", reg);
        ok++;
        setFeitos(ok);
      } catch (e) {
        setFalhas((f) => [...f, `${p.nome}: ${String(e?.message ?? e)}`]);
        // sem a função configurada, todas falhariam do mesmo jeito: para logo
        if (/chave|ANTHROPIC|Supabase|Failed to send/i.test(String(e?.message ?? e))) break;
      }
    }
    setRodando(false);
  };

  const total = fila.length;
  return (
    <Modal titulo="Consultar todos os produtos" aoFechar={() => { parar.current = true; aoFechar(); }}>
      {total === 0 ? (
        <p className="descricao">Todos os produtos da lista já foram consultados (ou não há produtos).</p>
      ) : (
        <>
          <p className="descricao">
            Vai pesquisar na internet <b>{total} produto(s)</b>, um de cada vez, e guardar o resultado na observação de cada um.
            Cada consulta tem um pequeno custo e leva alguns segundos; o total pode demorar vários minutos.
            Pode parar quando quiser e continuar depois: quem já foi consultado é pulado.
          </p>
          <progress max={total} value={feitos} style={{ width: "100%" }} />
          <p>{feitos} de {total} consultados{rodando ? "…" : ""}</p>
          <div className="barra">
            <span className="espaco" />
            {rodando
              ? <button type="button" className="btn" onClick={() => { parar.current = true; }}>Parar</button>
              : <button type="button" className="btn primario" onClick={iniciar} disabled={feitos >= total}>{feitos ? "Continuar" : "Começar"}</button>}
          </div>
        </>
      )}
      {falhas.length > 0 && <div className="aviso">{falhas.slice(0, 5).map((f) => <div key={f}>{f}</div>)}{falhas.length > 5 && <div>…e mais {falhas.length - 5}</div>}</div>}
    </Modal>
  );
}
