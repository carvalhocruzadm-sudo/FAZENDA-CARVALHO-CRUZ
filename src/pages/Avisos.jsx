import { useMemo, useState } from "react";

import { Abas, Icone } from "../components/ui";
import { TELA_DA_COLECAO, nomeDaColecao, textoDoAviso } from "../lib/avisos";
import { enderecoNtfy, ntfyConfigurado, TOPICO_NTFY } from "../lib/ntfy";

const quando = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");

/**
 * O que os operadores lançaram no celular de campo: lançamentos, alterações,
 * exclusões e os tickets de frete. Marcar como lido tira do contador do sininho.
 */
export default function Avisos({ dados, salvar, salvarVarios, irPara }) {
  const [filtro, setFiltro] = useState("naoLidos");
  const [permissao, setPermissao] = useState(() => (typeof Notification === "undefined" ? "indisponivel" : Notification.permission));

  const todos = useMemo(
    () => [...dados.avisos].sort((a, b) => String(b.momento ?? "").localeCompare(String(a.momento ?? ""))),
    [dados.avisos],
  );
  const naoLidos = todos.filter((a) => !a.lido);
  const lista = (filtro === "naoLidos" ? naoLidos : filtro === "tickets" ? todos.filter((a) => a.ticket) : todos).slice(0, 300);

  const marcar = (a, lido = true) => salvar("avisos", { ...a, lido });
  const marcarTodos = () => salvarVarios("avisos", naoLidos.map((a) => ({ ...a, lido: true })));
  const ver = (a) => {
    if (!a.lido) marcar(a);
    irPara(TELA_DA_COLECAO[a.colecao] ?? "painel");
  };

  const pedirPermissao = async () => setPermissao(await Notification.requestPermission());

  return (
    <>
      <div className="cartao">
        <p className="descricao">
          Tudo o que motoristas e tratoristas lançam, alteram ou apagam no celular de campo aparece aqui. Os fretes
          aparecem como <b>ticket</b>.
        </p>
        <Abas
          abas={[["naoLidos", `Não lidos (${naoLidos.length})`], ["tickets", "Tickets"], ["todos", "Todos"]]}
          atual={filtro} aoTrocar={setFiltro}
        />
        <div className="barra">
          <span className="espaco" />
          <button className="btn" onClick={marcarTodos} disabled={!naoLidos.length}>
            <Icone nome="editar" /> Marcar todos como lidos
          </button>
        </div>
        {lista.length === 0 ? (
          <div className="vazio">{filtro === "naoLidos" ? "Nenhum aviso novo." : "Nenhum aviso ainda."}</div>
        ) : (
          <ul className="lista-alertas">
            {lista.map((a) => (
              <li key={a.id} className={a.lido ? "lido" : ""}>
                <span className={`selo ${a.acao === "apagado" ? "ruim" : a.ticket ? "atencao" : "ok"}`}>
                  {a.ticket ? "Ticket" : nomeDaColecao(a.colecao)}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b>{textoDoAviso(a)}</b>
                  <small style={{ display: "block", color: "var(--texto-2)" }}>{quando(a.momento)} · {a.resumo || "—"}</small>
                </span>
                <button className="btn" onClick={() => ver(a)}>Ver</button>
                <button className="btn icone" onClick={() => marcar(a, !a.lido)}
                  title={a.lido ? "Marcar como não lido" : "Marcar como lido"} aria-label={a.lido ? "Marcar como não lido" : "Marcar como lido"}>
                  <Icone nome={a.lido ? "sino" : "editar"} tamanho={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="cartao">
        <h2>Aviso na tela deste computador</h2>
        {permissao === "granted" ? (
          <div className="aviso ok">Ligado: com o sistema aberto, cada lançamento novo do campo aparece num balão do computador.</div>
        ) : permissao === "denied" ? (
          <div className="aviso info">O navegador está bloqueando. Clique no cadeado ao lado do endereço do site e libere as notificações.</div>
        ) : permissao === "indisponivel" ? (
          <div className="aviso info">Este navegador não mostra notificações. O sininho no alto da tela continua avisando.</div>
        ) : (
          <button className="btn primario" onClick={pedirPermissao}><Icone nome="sino" /> Ligar aviso na tela</button>
        )}
      </div>

      <div className="cartao">
        <h2>Notificação no celular (app ntfy)</h2>
        {ntfyConfigurado ? (
          <ol className="descricao" style={{ paddingLeft: 18 }}>
            <li>Instale o app <b>ntfy</b> no celular (Play Store ou App Store).</li>
            <li>Abra o app, toque no <b>+</b> e digite o tópico: <code>{TOPICO_NTFY}</code></li>
            <li>Pronto: cada lançamento do campo chega como notificação. Endereço: <code>{enderecoNtfy}</code></li>
          </ol>
        ) : (
          <p className="descricao">
            Ainda não ligado. No Vercel (Settings → Environment Variables), cadastre <code>VITE_NTFY_TOPICO</code> com
            um nome difícil de adivinhar (ex.: <code>fazenda-cc-avisos-8k3p2</code>) e publique de novo. Depois é só
            assinar esse mesmo tópico no app ntfy do celular.
          </p>
        )}
      </div>
    </>
  );
}
