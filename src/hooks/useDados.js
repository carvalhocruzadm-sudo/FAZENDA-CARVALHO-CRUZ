import { useCallback, useEffect, useState } from "react";

import { COLECOES, apagarItem, enfileirar, gravarItem, lerFila, lerTodasColecoes, limparLocal } from "../lib/db";
import { SEED } from "../lib/seed";
import { supabaseConfigurado } from "../lib/supabase";
import { atualizarContadores, iniciarAutoSync, sincronizar } from "../lib/sync";

const vazio = () => Object.fromEntries(COLECOES.map((c) => [c, []]));

function novoId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  // Navegadores antigos (e http fora de localhost) não têm randomUUID.
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));
}

/**
 * O que veio da nuvem ainda não tem o que está na fila (feito no aparelho e
 * não enviado). Reaplica a fila por cima, senão o lançamento sumiria da tela
 * até a próxima sincronização.
 */
async function comFilaPorCima(dados) {
  const fila = await lerFila();
  const d = { ...dados };
  for (const op of fila) {
    if (op.acao === "foto") continue; // a foto não é um registro de tabela
    const lista = d[op.tabela] ?? [];
    const semEste = lista.filter((x) => x.id !== op.payload.id);
    d[op.tabela] = op.acao === "delete" ? semEste : [...semEste, op.payload];
  }
  return d;
}

/**
 * Fonte única dos dados: lê do IndexedDB na abertura (funciona sem internet),
 * grava cada alteração no aparelho, enfileira o envio e sincroniza em segundo
 * plano quando há conexão.
 */
export function useDados() {
  const [dados, setDados] = useState(vazio);
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState(null);

  const receberDaNuvem = useCallback(async (daNuvem) => {
    setDados({ ...vazio(), ...(await comFilaPorCima(daNuvem)) });
  }, []);

  useEffect(() => {
    let parar = () => {};
    (async () => {
      try {
        const local = await lerTodasColecoes();
        // Modo demonstração: sem nuvem, o cadastro inicial nasce no aparelho.
        // Com Supabase ele vem do schema.sql.
        if (!supabaseConfigurado && local.culturas.length === 0) {
          for (const [colecao, itens] of Object.entries(SEED)) {
            for (const item of itens) await gravarItem(colecao, item);
            local[colecao] = [...itens];
          }
        }
        setDados({ ...vazio(), ...local });
        await atualizarContadores();
      } catch (e) {
        setErro(String(e?.message ?? e));
      } finally {
        setPronto(true);
      }
      parar = iniciarAutoSync(receberDaNuvem);
      const daNuvem = await sincronizar();
      if (daNuvem) receberDaNuvem(daNuvem);
    })();
    return () => parar();
  }, [receberDaNuvem]);

  const sincronizarAgora = useCallback(async () => {
    const daNuvem = await sincronizar();
    if (daNuvem) await receberDaNuvem(daNuvem);
  }, [receberDaNuvem]);

  const salvar = useCallback(async (colecao, registro) => {
    const item = { ...registro, id: registro.id || novoId(), atualizado_em: new Date().toISOString() };
    setDados((d) => ({ ...d, [colecao]: [...d[colecao].filter((x) => x.id !== item.id), item] }));
    await gravarItem(colecao, item);
    await enfileirar({ tabela: colecao, acao: "upsert", payload: item });
    await atualizarContadores();
    sincronizarAgora();
    return item;
  }, [sincronizarAgora]);

  const remover = useCallback(async (colecao, id) => {
    setDados((d) => ({ ...d, [colecao]: d[colecao].filter((x) => x.id !== id) }));
    await apagarItem(colecao, id);
    await enfileirar({ tabela: colecao, acao: "delete", payload: { id } });
    await atualizarContadores();
    sincronizarAgora();
  }, [sincronizarAgora]);

  /** Descarta a cópia do aparelho e baixa tudo da nuvem de novo. */
  const recarregarDaNuvem = useCallback(async () => {
    await limparLocal();
    await atualizarContadores();
    setDados(vazio());
    await sincronizarAgora();
  }, [sincronizarAgora]);

  return { dados, pronto, erro, salvar, remover, sincronizarAgora, recarregarDaNuvem };
}
