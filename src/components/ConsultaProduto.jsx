import { useState } from "react";

import { supabase } from "../lib/supabase";
import { Icone } from "./ui";

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
      if (!supabase) throw new Error("Precisa do Supabase configurado e de internet.");
      const { data, error } = await supabase.functions.invoke("consultar-produto", {
        body: { nome: reg.nome, fabricante: reg.fabricante, principio_ativo: reg.principio_ativo, tipo: reg.tipo },
      });
      if (error) throw new Error(error.message);
      if (data?.erro) throw new Error(data.erro);
      setTexto(data.texto);
    } catch (e) {
      setErro(String(e?.message ?? e));
    } finally {
      setCarregando(false);
    }
  };

  const guardar = () => {
    setReg((atual) => ({ ...atual, observacao: [atual.observacao, texto].filter(Boolean).join("\n\n") }));
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
            <button type="button" className="btn" onClick={guardar}>Guardar na observação</button>
          </div>
        </>
      )}
    </div>
  );
}
