import { useEffect, useState } from "react";

import { brl, data } from "../lib/formato";
import { notificacaoBloqueada, notificacaoPermitida, notificacaoSuportada, notificar, pedirPermissao } from "../lib/notificacao";
import { Icone } from "./ui";

/**
 * Aviso no topo de todas as telas quando alguém lança uma despesa nova: mostra
 * quem lançou, o quê e quanto. Some quando a pessoa toca em "Ok, visto".
 * Cada despesa nova também vira uma notificação do aparelho (se permitido).
 * O que já foi visto e notificado fica guardado só neste aparelho (localStorage).
 */

const CHAVE_VISTAS = "fcc-despesas-vistas";
const CHAVE_NOTIFICADAS = "fcc-despesas-notificadas";
const DIAS = 7; // despesa lançada há mais tempo que isso não vira aviso
const MAX_GUARDADAS = 500;

function lerIds(chave) {
  try { return new Set(JSON.parse(localStorage.getItem(chave)) ?? []); } catch { return new Set(); }
}

function gravarIds(chave, ids) {
  try { localStorage.setItem(chave, JSON.stringify([...ids].slice(-MAX_GUARDADAS))); } catch { /* sem armazenamento: o aviso volta ao reabrir */ }
}

/** Fora do componente: o aviso se refaz quando os dados mudam. */
const limiteISO = () => new Date(Date.now() - DIAS * 864e5).toISOString();

const resumo = (d) => `${d.descricao} — ${brl(d.valor)} (${data(d.data)}${d.categoria ? `, ${d.categoria}` : ""})`;

/** Botão para ligar as notificações do aparelho (some quando já estão ligadas). */
export function BotaoNotificacoes({ estilo }) {
  const [permitida, setPermitida] = useState(notificacaoPermitida);
  if (!notificacaoSuportada() || permitida) return null;
  if (notificacaoBloqueada()) return <small style={estilo}>Notificações bloqueadas neste aparelho: libere nas configurações do navegador.</small>;
  return (
    <button className="btn" style={estilo} onClick={async () => setPermitida(await pedirPermissao())}
      title="Avisa na barra do celular / do computador quando alguém lançar uma despesa">
      <Icone nome="alerta" tamanho={14} /> Ligar notificações
    </button>
  );
}

export default function AlertaDespesas({ despesas, usuario, irPara }) {
  const [vistas, setVistas] = useState(() => lerIds(CHAVE_VISTAS));

  const limite = limiteISO();
  const novas = despesas
    .filter((d) => d.lancado_por && d.lancado_por !== usuario && !vistas.has(d.id) && (d.atualizado_em ?? "") >= limite)
    .sort((a, b) => String(b.atualizado_em).localeCompare(String(a.atualizado_em)));

  // Notifica uma vez só cada despesa, mesmo que o aviso continue na tela.
  useEffect(() => {
    if (!notificacaoPermitida() || !novas.length) return;
    const notificadas = lerIds(CHAVE_NOTIFICADAS);
    const faltam = novas.filter((d) => !notificadas.has(d.id));
    if (!faltam.length) return;
    const [d] = faltam;
    const titulo = faltam.length === 1 ? `Despesa nova — ${d.lancado_por}` : `${faltam.length} despesas novas`;
    const texto = faltam.length === 1 ? resumo(d) : faltam.slice(0, 3).map((x) => `${x.lancado_por}: ${x.descricao} — ${brl(x.valor)}`).join("\n");
    notificar(titulo, texto, "despesas-novas");
    gravarIds(CHAVE_NOTIFICADAS, new Set([...notificadas, ...faltam.map((x) => x.id)]));
  }, [novas]);

  if (!novas.length) return null;

  const marcarVistas = () => {
    const ids = new Set([...vistas, ...novas.map((d) => d.id)]);
    gravarIds(CHAVE_VISTAS, ids);
    setVistas(ids);
  };

  return (
    <div className="aviso info" role="alert">
      <b><Icone nome="alerta" tamanho={14} /> {novas.length === 1 ? "1 despesa nova lançada" : `${novas.length} despesas novas lançadas`}</b>
      <ul style={{ margin: "6px 0 10px", paddingLeft: 18 }}>
        {novas.slice(0, 5).map((d) => (
          <li key={d.id}><b>{d.lancado_por}</b> lançou {resumo(d)}</li>
        ))}
        {novas.length > 5 && <li>e mais {novas.length - 5}…</li>}
      </ul>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button className="btn" onClick={() => { marcarVistas(); irPara("financeiro"); }}>Ver despesas</button>
        <button className="btn primario" onClick={marcarVistas}>Ok, visto</button>
        <BotaoNotificacoes />
      </div>
    </div>
  );
}
