import { useCallback, useState } from "react";

import useEscolhaTalhoes from "../hooks/useEscolhaTalhoes";
import { anexar, valorDoTexto } from "../lib/arquivos";
import { CATEGORIAS_DESPESA, registroNovo } from "../lib/esquema";
import { PreviaComprovante } from "./Comprovante";
import Formulario from "./Formulario";
import { Icone, Modal } from "./ui";

/** O essencial para lançar rápido; o resto fica em "Mais campos". */
const ESSENCIAIS = ["descricao", "valor", "data", "favorecido", "forma_pagamento", "centro", "cultura_id", "talhao_id"];

/**
 * Abre quando alguém compartilha um comprovante do app do banco com o app da
 * fazenda: mostra o comprovante e pede categoria e descrição para virar uma
 * despesa (no lugar de mandar no grupo do WhatsApp).
 */
export default function LancarComprovante({ compartilhado, dados, salvar, aoFechar, aoSalvar }) {
  const [reg, setReg] = useState(() => {
    const novo = registroNovo("despesas");
    if (compartilhado.arquivo) novo.comprovante = anexar("despesas", compartilhado.arquivo);
    const valor = valorDoTexto(compartilhado.texto);
    if (valor) novo.valor = valor;
    return novo;
  });
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [tudo, setTudo] = useState(false);
  const escolha = useEscolhaTalhoes("despesas", dados);

  const fechar = useCallback(() => {
    if (window.confirm("Descartar este comprovante sem lançar?")) aoFechar();
  }, [aoFechar]);

  const gravar = async () => {
    const { regs, erro: e } = escolha.montar(reg);
    if (e) { setErro(e); return; }
    setSalvando(true);
    try {
      for (const pronto of regs) await salvar("despesas", pronto);
      aoSalvar();
    } catch (err) {
      setErro(String(err?.message ?? err));
      setSalvando(false);
    }
  };

  return (
    <Modal
      titulo="Lançar comprovante"
      aoFechar={fechar}
      rodape={
        <>
          <span className="espaco" />
          <button className="btn" onClick={fechar}>Cancelar</button>
          <button className="btn primario" onClick={gravar} disabled={salvando}>
            <Icone nome="editar" /> {salvando ? "Salvando…" : "Salvar despesa"}
          </button>
        </>
      }
    >
      {compartilhado.arquivo
        ? <div className="aviso ok">Comprovante recebido. Escolha a categoria, escreva a descrição e confira o valor.</div>
        : <div className="aviso info">Nenhum arquivo chegou junto. Dá para lançar assim mesmo e anexar o comprovante abaixo.</div>}
      {reg.comprovante && <div style={{ marginBottom: 14 }}><PreviaComprovante caminho={reg.comprovante} /></div>}

      <div className="campo" style={{ marginBottom: 14 }}>
        <span>Categoria<em> *</em></span>
        <div className="fichas">
          {CATEGORIAS_DESPESA.map((c) => (
            <button key={c} type="button" className={`ficha ${reg.categoria === c ? "ativa" : ""}`}
              onClick={() => setReg((r) => ({ ...r, categoria: c }))}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {erro && <div className="aviso">{erro}</div>}
      <Formulario colecao="despesas" reg={reg} setReg={setReg} dados={dados} somente={tudo ? undefined : ESSENCIAIS} escolha={escolha} />
      {!tudo && <button type="button" className="btn" style={{ marginTop: 14 }} onClick={() => setTudo(true)}>Mais campos</button>}
    </Modal>
  );
}
