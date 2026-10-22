import { useState } from "react";

import { brl, data } from "../lib/formato";
import { Icone } from "./ui";

/**
 * Aviso no topo de todas as telas quando alguém lança uma despesa nova: mostra
 * quem lançou, o quê e quanto. Some quando a pessoa toca em "Ok, visto".
 * O que já foi visto fica guardado só neste aparelho (localStorage).
 */

const CHAVE = "fcc-despesas-vistas";
const DIAS = 7; // despesa lançada há mais tempo que isso não vira aviso
const MAX_GUARDADAS = 500;

function lerVistas() {
  try { return new Set(JSON.parse(localStorage.getItem(CHAVE)) ?? []); } catch { return new Set(); }
}

function gravarVistas(ids) {
  try { localStorage.setItem(CHAVE, JSON.stringify([...ids].slice(-MAX_GUARDADAS))); } catch { /* sem armazenamento: o aviso volta ao reabrir */ }
}

/** Fora do componente: o aviso se refaz quando os dados mudam. */
const limiteISO = () => new Date(Date.now() - DIAS * 864e5).toISOString();

export default function AlertaDespesas({ despesas, usuario, irPara }) {
  const [vistas, setVistas] = useState(lerVistas);

  const limite = limiteISO();
  const novas = despesas
    .filter((d) => d.lancado_por && d.lancado_por !== usuario && !vistas.has(d.id) && (d.atualizado_em ?? "") >= limite)
    .sort((a, b) => String(b.atualizado_em).localeCompare(String(a.atualizado_em)));

  if (!novas.length) return null;

  const marcarVistas = () => {
    const ids = new Set([...vistas, ...novas.map((d) => d.id)]);
    gravarVistas(ids);
    setVistas(ids);
  };

  return (
    <div className="aviso info" role="alert">
      <b><Icone nome="alerta" tamanho={14} /> {novas.length === 1 ? "1 despesa nova lançada" : `${novas.length} despesas novas lançadas`}</b>
      <ul style={{ margin: "6px 0 10px", paddingLeft: 18 }}>
        {novas.slice(0, 5).map((d) => (
          <li key={d.id}>
            <b>{d.lancado_por}</b> lançou {d.descricao} — {brl(d.valor)} ({data(d.data)}{d.categoria ? `, ${d.categoria}` : ""})
          </li>
        ))}
        {novas.length > 5 && <li>e mais {novas.length - 5}…</li>}
      </ul>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn" onClick={() => { marcarVistas(); irPara("financeiro"); }}>Ver despesas</button>
        <button className="btn primario" onClick={marcarVistas}>Ok, visto</button>
      </div>
    </div>
  );
}
