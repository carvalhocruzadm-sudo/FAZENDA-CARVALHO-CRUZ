import { useCallback, useState } from "react";

import { Foto } from "../components/Foto";
import Formulario from "../components/Formulario";
import { Icone, Modal } from "../components/ui";
import useEscolhaTalhoes from "./useEscolhaTalhoes";
import { prepararRegistro } from "../lib/esquema";
import { data, nomeRef, numero } from "../lib/formato";

/**
 * Situação de cada carga:
 *   - Aguardando aprovação: lançada por funcionário (`a_conferir`). O
 *     escritório confere pela foto e aprova, edita ou apaga;
 *   - Falta preço: aprovada, mas ainda sem comprador ou preço;
 *   - Completa.
 */
export function situacao(v) {
  if (v.a_conferir) return "aprovar";
  if (!v.comprador || !(Number(v.preco_unitario) > 0)) return "preco";
  return "completas";
}

export const SELOS = {
  aprovar: <span className="selo atencao">Aguardando aprovação</span>,
  preco: <span className="selo neutro">Falta preço</span>,
  completas: <span className="selo ok">Completa</span>,
};

export const toneladas = (v) => (Number(v.peso_liquido) || 0) / 1000;

/** "Lançado no celular (Modo Campo) por Fulano · …" → "Fulano". */
export const quemLancou = (v) => /Lançado (?:no celular \(Modo Campo\)|no computador) por ([^·]+)/.exec(v.observacao ?? "")?.[1]?.trim() ?? "—";

/**
 * Aprovar, editar e apagar cargas lançadas (com a foto do ticket). Usado no
 * painel de tickets e em Turmas de colheita → A pagar por semana.
 * `botoes(v)` são os botões de uma carga; `janelas` vai uma vez na tela
 * (foto e edição).
 */
export function useAcoesTickets({ dados, salvar, remover }) {
  const [foto, setFoto] = useState(null);
  const [rascunho, setRascunho] = useState(null);
  const [erro, setErro] = useState(null);
  const [trabalhando, setTrabalhando] = useState(false);

  const escolha = useEscolhaTalhoes("vendas", dados);

  const aprovar = async (vendas) => {
    if (vendas.length > 1 && !window.confirm(`Aprovar ${vendas.length} tickets?`)) return;
    setTrabalhando(true);
    setErro(null);
    try {
      for (const v of vendas) {
        const { reg, erro: e } = prepararRegistro("vendas", { ...v, a_conferir: false }, dados);
        if (e) throw new Error(e);
        await salvar("vendas", reg);
      }
    } catch (err) {
      setErro(String(err?.message ?? err));
    } finally {
      setTrabalhando(false);
    }
  };

  const apagar = async (v) => {
    const texto = `${nomeRef(dados, "culturas", v.cultura_id)} · ${numero(toneladas(v), 3)} t · ${data(v.data)}`;
    if (!window.confirm(`Apagar este ticket?\n${texto}`)) return;
    setErro(null);
    try {
      await remover("vendas", v.id);
      setRascunho((r) => (r?.id === v.id ? null : r));
    } catch (err) {
      setErro(String(err?.message ?? err));
    }
  };

  const { iniciar } = escolha;
  const editar = useCallback((v) => { setErro(null); setRascunho(v); iniciar(v); }, [iniciar]);
  const fechar = useCallback(() => setRascunho(null), []);

  const gravarEdicao = async () => {
    const { regs, erro: e } = escolha.montar(rascunho);
    if (e) { setErro(e); return; }
    setTrabalhando(true);
    try {
      for (const reg of regs) await salvar("vendas", reg);
      setRascunho(null);
    } catch (err) {
      setErro(String(err?.message ?? err));
    } finally {
      setTrabalhando(false);
    }
  };

  const botoes = (v) => (
    <div className="acoes-ticket">
      {v.foto_ticket && <button type="button" className="btn" onClick={() => setFoto(v.foto_ticket)} title="Ver a foto do ticket">📷</button>}
      {v.a_conferir && (
        <button type="button" className="btn primario" onClick={() => aprovar([v])} disabled={trabalhando}>✓ Aprovar</button>
      )}
      <button type="button" className="btn" onClick={() => editar(v)} title="Editar" aria-label="Editar"><Icone nome="editar" /></button>
      <button type="button" className="btn perigo" onClick={() => apagar(v)} title="Apagar" aria-label="Apagar"><Icone nome="lixo" /></button>
    </div>
  );

  const janelas = (
    <>
      {foto && (
        <Modal titulo="Foto do ticket" aoFechar={() => setFoto(null)}>
          <Foto caminho={foto} alt="Foto do ticket da balança" className="foto-ticket-grande"
            reserva={<div className="vazio">Carregando a foto…</div>} />
        </Modal>
      )}

      {rascunho && (
        <Modal
          titulo="Editar ticket"
          aoFechar={fechar}
          rodape={
            <>
              <button className="btn perigo" onClick={() => apagar(rascunho)}><Icone nome="lixo" /> Apagar</button>
              <span className="espaco" />
              <button className="btn" onClick={fechar}>Cancelar</button>
              <button className="btn primario" onClick={gravarEdicao} disabled={trabalhando}>
                <Icone nome="editar" /> {trabalhando ? "Salvando…" : "Salvar"}
              </button>
            </>
          }
        >
          {erro && <div className="aviso">{erro}</div>}
          {rascunho.foto_ticket && (
            <Foto caminho={rascunho.foto_ticket} alt="Foto do ticket" className="foto-ticket-edicao" />
          )}
          <Formulario colecao="vendas" reg={rascunho} setReg={setRascunho} dados={dados} contexto={{}} escolha={escolha} />
        </Modal>
      )}
    </>
  );

  return { aprovar, botoes, janelas, erro, editando: !!rascunho, trabalhando };
}
