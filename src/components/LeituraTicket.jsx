import { useEffect, useRef, useState } from "react";

import { completarVenda, lerTicketDaFoto, outrasDoTicket } from "../lib/leituraTicket";
import { Icone } from "./ui";

/** O que já foi lido de cada foto nesta sessão (não pergunta duas vezes à IA). */
const lidos = new Map();

/** A venda ainda está sem os dados da pesagem? Então lê a foto sozinho ao abrir. */
const semPesagem = (r) => !r.placa && r.peso_entrada == null && r.peso_saida == null;

/**
 * Na venda com foto do ticket: lê a foto pela IA e completa os campos vazios
 * (placa, tipo de carro, pesos, comprador, motorista, nota fiscal). Ao abrir
 * uma venda sem esses dados, já lê sozinho; o botão lê de novo.
 * `preencher(patch)`: aplica as mudanças no rascunho (com os cálculos).
 */
export default function LeituraTicket({ reg, dados, preencher }) {
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState(null);
  const [resultado, setResultado] = useState(null);
  const automatico = useRef(null);

  const ler = async (forcar) => {
    const caminho = reg.foto_ticket;
    setLendo(true); setErro(null); setResultado(null);
    try {
      if (forcar || !lidos.has(caminho)) lidos.set(caminho, await lerTicketDaFoto(caminho));
      const t = lidos.get(caminho);
      const { patch, preenchidos, aviso } = completarVenda(reg, t, dados, { sozinha: outrasDoTicket(dados, reg) === 0 });
      if (preenchidos.length) preencher(patch);
      setResultado({ preenchidos, aviso });
    } catch (e) {
      setErro(String(e?.message ?? e));
    } finally {
      setLendo(false);
    }
  };

  useEffect(() => {
    if (!reg.foto_ticket || automatico.current === reg.foto_ticket || !semPesagem(reg)) return;
    automatico.current = reg.foto_ticket;
    ler(false);
    // Só ao abrir a venda (ou trocar a foto).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reg.foto_ticket]);

  if (!reg.foto_ticket) return null;
  return (
    <div className="consulta">
      <button type="button" className="btn" onClick={() => ler(true)} disabled={lendo}>
        <Icone nome="busca" /> {lendo ? "Lendo a foto do ticket…" : "Puxar os dados da foto do ticket"}
      </button>
      {erro && <div className="aviso">Não deu para ler a foto: {erro}</div>}
      {resultado && (
        <div className={resultado.aviso ? "aviso" : "aviso ok"}>
          {resultado.preenchidos.length
            ? `Preenchido pela foto do ticket: ${resultado.preenchidos.join(", ")}. Confira antes de salvar.`
            : "A foto não trouxe nada novo: os campos que ela tem já estavam preenchidos."}
          {resultado.aviso && <div>{resultado.aviso}</div>}
        </div>
      )}
    </div>
  );
}
