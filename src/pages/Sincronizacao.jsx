import { useEffect, useState } from "react";

import { Icone, Stat } from "../components/ui";
import { lerFila, reativarFalhas } from "../lib/db";
import { supabaseConfigurado } from "../lib/supabase";
import { atualizarContadores } from "../lib/sync";
import { useSync } from "../hooks/useSync";

export default function Sincronizacao({ sincronizarAgora, recarregarDaNuvem }) {
  const sync = useSync();
  const [fila, setFila] = useState([]);

  useEffect(() => { lerFila().then(setFila); }, [sync.pendentes, sync.falhas, sync.sincronizando]);

  if (!supabaseConfigurado) {
    return (
      <div className="cartao">
        <h2>Modo demonstração</h2>
        <p className="descricao">
          O sistema ainda não está ligado a um banco na nuvem. Tudo o que for lançado fica só neste aparelho.
          Para ligar, crie o projeto no Supabase, rode o arquivo <code>supabase/schema.sql</code> e cadastre
          as variáveis <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> (veja o README).
        </p>
      </div>
    );
  }

  const recarregar = async () => {
    if (sync.pendentes || sync.falhas) {
      if (!window.confirm(`Há ${sync.pendentes + sync.falhas} alteração(ões) ainda não enviadas. Recarregar vai APAGAR essas alterações deste aparelho. Continuar?`)) return;
    }
    await recarregarDaNuvem();
  };

  return (
    <>
      <div className="grade">
        <Stat rotulo="Conexão" valor={sync.online ? "Online" : "Sem internet"} cor={sync.online ? "" : "cinza"} />
        <Stat rotulo="Aguardando envio" valor={sync.pendentes} cor={sync.pendentes ? "laranja" : "cinza"} />
        <Stat rotulo="Com erro" valor={sync.falhas} cor={sync.falhas ? "vermelho" : "cinza"} />
        <Stat rotulo="Última sincronização" valor={sync.ultimaSync ? new Date(sync.ultimaSync).toLocaleString("pt-BR") : "—"} cor="cinza" />
      </div>
      {sync.erro && <div className="aviso">{sync.erro}</div>}
      <div className="cartao">
        <div className="barra">
          <button className="btn primario" onClick={sincronizarAgora} disabled={sync.sincronizando || !sync.online}>
            <Icone nome="sync" className={sync.sincronizando ? "girando" : ""} /> Sincronizar agora
          </button>
          {sync.falhas > 0 && (
            <button className="btn" onClick={async () => { await reativarFalhas(); await atualizarContadores(); sincronizarAgora(); }}>
              Tentar de novo os que deram erro
            </button>
          )}
          <span className="espaco" />
          <button className="btn perigo" onClick={recarregar}>Recarregar tudo da nuvem</button>
        </div>
        <p className="descricao">
          Sem internet, os lançamentos ficam guardados no aparelho e sobem sozinhos quando o sinal volta
          (a cada minuto, ao abrir o app e ao reconectar).
        </p>
        {fila.length > 0 && (
          <div className="tabela">
            <table>
              <thead><tr><th>Tabela</th><th>Ação</th><th>Quando</th><th>Tentativas</th><th>Erro</th></tr></thead>
              <tbody>
                {fila.map((op) => (
                  <tr key={op.id}>
                    <td>{op.tabela}</td><td>{op.acao === "delete" ? "Apagar" : op.acao === "upload" ? "Enviar comprovante" : "Salvar"}</td>
                    <td>{new Date(op.criadoEm).toLocaleString("pt-BR")}</td><td>{op.tentativas}</td>
                    <td style={{ whiteSpace: "normal", color: "var(--vermelho)" }}>{op.erro ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
