import { useCallback, useEffect, useState } from "react";

import { daCaixa, descartarDaCaixa, ehPdf, listarCaixa } from "../lib/arquivos";
import { supabaseConfigurado } from "../lib/supabase";
import { PreviaComprovante } from "./Comprovante";
import LancarComprovante from "./LancarComprovante";
import { Icone } from "./ui";

/**
 * Comprovantes que chegaram pelo Atalho do iPhone e ainda não viraram despesa.
 * "Lançar" abre a mesma tela do Compartilhar (categoria em botões), já com o
 * comprovante, PIX e — se for PDF — valor, data e favorecido lidos dele.
 * Some sozinho quando não há nada esperando.
 */
export default function CaixaComprovantes({ dados, salvar }) {
  const [caixa, setCaixa] = useState([]);
  const [erro, setErro] = useState(null);
  const [vendo, setVendo] = useState(null);
  const [abrindo, setAbrindo] = useState(null);
  const [lancando, setLancando] = useState(null);

  const atualizar = useCallback(() => {
    if (!supabaseConfigurado) return;
    listarCaixa(dados.despesas)
      .then((lista) => { setCaixa(lista); setErro(null); })
      .catch((e) => setErro(e.message));
    // A lista só muda quando chega comprovante ou se lança um: não a cada mudança nas despesas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(atualizar, [atualizar]);

  const usados = new Set((dados.despesas ?? []).map((d) => d.comprovante));
  const pendentes = caixa.filter((c) => !usados.has(c.caminho));
  if (!pendentes.length && !erro && !lancando) return null;

  const lancar = async (item) => {
    setAbrindo(item.caminho);
    setLancando(await daCaixa(item));
    setAbrindo(null);
  };

  const descartar = async (item) => {
    if (!window.confirm("Jogar fora este comprovante? Ele não vai virar despesa.")) return;
    try {
      await descartarDaCaixa(item.caminho);
      atualizar();
    } catch (e) {
      window.alert(e.message);
    }
  };

  return (
    <div className="cartao" style={{ marginBottom: 16 }}>
      <div className="barra">
        <h2>Comprovantes recebidos <span className="selo atencao">{pendentes.length}</span></h2>
        <span className="espaco" />
        <button className="btn" onClick={atualizar}><Icone nome="sync" /> Atualizar</button>
      </div>
      <p className="descricao">Chegaram pelo Atalho do iPhone. Toque em <b>Lançar</b>, escolha a categoria e salve.</p>
      {erro && <div className="aviso">{erro}</div>}
      {pendentes.map((item) => (
        <div key={item.caminho} style={{ marginBottom: 10 }}>
          <div className="barra" style={{ marginBottom: 6 }}>
            <span>
              {ehPdf(item.caminho) ? "PDF" : "Foto"}
              {item.criadoEm && ` · chegou ${new Date(item.criadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`}
            </span>
            <span className="espaco" />
            <button className="btn" onClick={() => setVendo(vendo === item.caminho ? null : item.caminho)}>
              {vendo === item.caminho ? "Esconder" : "Ver"}
            </button>
            <button className="btn perigo" onClick={() => descartar(item)} title="Não é despesa" aria-label="Descartar">
              <Icone nome="lixo" tamanho={14} />
            </button>
            <button className="btn primario" onClick={() => lancar(item)} disabled={abrindo === item.caminho}>
              <Icone nome="mais" /> {abrindo === item.caminho ? "Lendo…" : "Lançar"}
            </button>
          </div>
          {vendo === item.caminho && <PreviaComprovante caminho={item.caminho} />}
        </div>
      ))}
      {lancando && (
        <LancarComprovante compartilhado={lancando} dados={dados} salvar={salvar}
          aoFechar={() => setLancando(null)} aoSalvar={() => setLancando(null)} />
      )}
    </div>
  );
}
