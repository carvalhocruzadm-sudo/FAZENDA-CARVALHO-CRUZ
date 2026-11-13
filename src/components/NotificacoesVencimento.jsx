import { useEffect, useState } from "react";

import { desligarNotificacoes, ehIphoneSemInstalar, ligarNotificacoes, situacaoNotificacoes, testarNotificacao } from "../lib/notificacoes";
import { supabaseConfigurado } from "../lib/supabase";
import { Icone } from "./ui";

/** Liga/desliga, neste aparelho, a notificação das contas que estão vencendo. */
export default function NotificacoesVencimento() {
  const [situacao, setSituacao] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [recado, setRecado] = useState(null);

  useEffect(() => { situacaoNotificacoes().then(setSituacao, () => setSituacao("sem-suporte")); }, []);

  if (!supabaseConfigurado || !situacao) return null;

  const fazer = (acao, sucesso) => async () => {
    setOcupado(true);
    setRecado(null);
    try {
      await acao();
      if (sucesso) setRecado({ tipo: "ok", texto: sucesso });
    } catch (e) {
      setRecado({ tipo: "", texto: e.message });
    }
    setSituacao(await situacaoNotificacoes().catch(() => "sem-suporte"));
    setOcupado(false);
  };

  return (
    <div className="cartao" style={{ marginTop: 16 }}>
      <h2>Notificações de contas a pagar</h2>
      <p className="descricao">
        Este aparelho recebe, de manhã, um aviso <b>toda segunda-feira</b> com as contas que vencem na semana
        e outro <b>no dia do vencimento</b> de cada conta — mesmo com o app fechado. Valem os pagamentos
        desta tela e as despesas com vencimento que ainda não foram marcados como pagos.
      </p>
      {recado && <div className={`aviso ${recado.tipo}`}>{recado.texto}</div>}
      {situacao === "sem-suporte" && (
        <div className="aviso info">
          {ehIphoneSemInstalar()
            ? "No iPhone, instale o app primeiro: no Safari, toque em Compartilhar → Adicionar à Tela de Início, abra pelo ícone novo e volte aqui."
            : "Este navegador não recebe notificações. No celular, instale o app (Adicionar à tela inicial) e abra por ele."}
        </div>
      )}
      {situacao === "bloqueado" && (
        <div className="aviso info">As notificações deste site estão bloqueadas no aparelho. Libere nas configurações do navegador (ou do app) e volte aqui.</div>
      )}
      {situacao === "desligado" && (
        <button className="btn primario" disabled={ocupado} onClick={fazer(ligarNotificacoes, "Pronto! Este aparelho vai receber os avisos.")}>
          <Icone nome="sino" /> Ativar notificações neste aparelho
        </button>
      )}
      {situacao === "ligado" && (
        <div className="barra" style={{ marginBottom: 0 }}>
          <span className="selo ok">Ligadas neste aparelho</span>
          <span className="espaco" />
          <button className="btn" disabled={ocupado} onClick={fazer(testarNotificacao, "Aviso de teste enviado. Deve chegar em alguns segundos.")}>Enviar um aviso de teste</button>
          <button className="btn" disabled={ocupado} onClick={fazer(desligarNotificacoes)}>Desligar</button>
        </div>
      )}
    </div>
  );
}
