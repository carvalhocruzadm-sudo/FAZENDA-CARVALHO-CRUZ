import { useCallback, useEffect, useState } from "react";

import useEscolhaTalhoes from "../hooks/useEscolhaTalhoes";
import { anexar, lerComprovante, lerComprovanteDoArquivo, valorDoTexto } from "../lib/arquivos";
import { CATEGORIAS_DESPESA, ESQUEMA, registroNovo } from "../lib/esquema";
import { PreviaComprovante } from "./Comprovante";
import Formulario from "./Formulario";
import { RATEIO_VAZIO, linhasDoRateio } from "../lib/rateio";
import RateioDespesa from "./RateioDespesa";
import { Icone, Modal } from "./ui";

/** O essencial para lançar rápido; o resto fica em "Mais campos". */
const ESSENCIAIS = ["descricao", "valor", "data", "favorecido", "forma_pagamento", "centro", "cultura_id", "talhao_id"];
const TODOS = Object.keys(ESQUEMA.despesas.campos);

/**
 * Abre quando alguém compartilha um comprovante do app do banco com o app da
 * fazenda: mostra o comprovante e pede categoria e descrição para virar uma
 * despesa (no lugar de mandar no grupo do WhatsApp).
 *
 * Do Atalho do iPhone o arquivo já está na nuvem (caixa de entrada): chega
 * `caminho` no lugar de `arquivo`. Cancelar deixa o comprovante na caixa.
 *
 * Ao abrir, lê valor, data e favorecido do comprovante (lib/arquivos.js →
 * lerComprovanteDoArquivo) e preenche só o que ainda está vazio.
 */
export default function LancarComprovante({ compartilhado, dados, salvar, aoFechar, aoSalvar }) {
  const [reg, setReg] = useState(() => {
    const novo = registroNovo("despesas");
    if (compartilhado.arquivo) novo.comprovante = anexar("despesas", compartilhado.arquivo);
    if (compartilhado.caminho) Object.assign(novo, { comprovante: compartilhado.caminho, forma_pagamento: "PIX" });
    if (compartilhado.dataChegada) novo.data = compartilhado.dataChegada;
    const valor = valorDoTexto(compartilhado.texto);
    if (valor) novo.valor = valor;
    return novo;
  });
  const [leitura, setLeitura] = useState(() => (compartilhado.caminho || compartilhado.arquivo ? "lendo" : null));

  useEffect(() => {
    const { caminho, arquivo } = compartilhado;
    if (!caminho && !arquivo) return undefined;
    let vivo = true;
    (caminho ? lerComprovante(caminho) : lerComprovanteDoArquivo(arquivo, arquivo.name)).then((lido) => {
      if (!vivo) return;
      setReg((r) => {
        const novo = { ...r };
        if (lido.valor && !r.valor) novo.valor = lido.valor;
        if (lido.data) novo.data = lido.data;
        if (lido.favorecido && !r.favorecido) novo.favorecido = lido.favorecido;
        if (lido.favorecido && !r.descricao) novo.descricao = `PIX ${lido.favorecido}`;
        return novo;
      });
      setLeitura(lido.aviso ?? (lido.valor || lido.favorecido ? null : "Não achei valor nem favorecido no comprovante. Digite à mão."));
    });
    return () => { vivo = false; };
    // Lê uma vez, ao abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [tudo, setTudo] = useState(false);
  const [rateio, setRateio] = useState(RATEIO_VAZIO);
  const escolha = useEscolhaTalhoes("despesas", dados);

  // Centro "Cultura" ou "Geral": cultura e fazenda saem do formulário e viram
  // fichas que aceitam várias (RateioDespesa). "Talhão" continua com a escolha
  // de talhões, que já divide por área.
  const porTalhao = reg.centro === "talhao";
  const tirar = new Set(porTalhao ? [] : ["fazenda_id", "cultura_id"]);
  const campos = (tudo ? TODOS : ESSENCIAIS).filter((c) => !tirar.has(c));

  /** Uma despesa por linha do rateio (ou pela escolha de talhões). */
  const montarTodas = () => {
    if (porTalhao) return escolha.montar(reg);
    if (reg.centro === "cultura" && !rateio.culturas.length) return { regs: [], erro: "Marque pelo menos uma cultura." };
    const total = Number(reg.valor) || 0;
    const linhas = linhasDoRateio(rateio, total, dados);
    if (linhas.length > 1) {
      const soma = linhas.reduce((s, l) => s + (Number(l.valor) || 0), 0);
      if (Math.abs(soma - total) >= 0.01) return { regs: [], erro: "A soma das partes precisa dar o valor do comprovante." };
    }
    const regs = [];
    for (const l of linhas) {
      const parte = Number(l.valor) || 0;
      const r = escolha.montar({
        ...reg,
        valor: parte,
        litros: reg.litros && total ? +(Number(reg.litros) * (parte / total)).toFixed(2) : reg.litros,
        cultura_id: l.cultura ?? (reg.centro === "cultura" ? null : reg.cultura_id),
        fazenda_id: l.fazenda ?? null,
      });
      if (r.erro) return r;
      regs.push(...r.regs);
    }
    return { regs, erro: null };
  };

  const naCaixa = Boolean(compartilhado.caminho);
  const fechar = useCallback(() => {
    if (naCaixa || window.confirm("Descartar este comprovante sem lançar?")) aoFechar();
  }, [aoFechar, naCaixa]);

  const gravar = async () => {
    const { regs, erro: e } = montarTodas();
    if (e) { setErro(e); return; }
    setSalvando(true);
    try {
      for (const pronto of regs) await salvar("despesas", pronto);
      aoSalvar();
    } catch (err) {
      setErro(String(err?.message ?? err));
      setSalvando(false);
    }
  };

  return (
    <Modal
      titulo="Lançar comprovante"
      aoFechar={fechar}
      rodape={
        <>
          <span className="espaco" />
          <button className="btn" onClick={fechar}>Cancelar</button>
          <button className="btn primario" onClick={gravar} disabled={salvando}>
            <Icone nome="editar" /> {salvando ? "Salvando…" : "Salvar despesa"}
          </button>
        </>
      }
    >
      {compartilhado.arquivo || naCaixa
        ? <div className="aviso ok">Comprovante recebido. Escolha a categoria, escreva a descrição e confira o valor.</div>
        : <div className="aviso info">Nenhum arquivo chegou junto. Dá para lançar assim mesmo e anexar o comprovante abaixo.</div>}
      {leitura === "lendo" && <div className="aviso info">Lendo o valor e o favorecido do comprovante…</div>}
      {leitura && leitura !== "lendo" && <div className="aviso info">{leitura}</div>}
      {reg.comprovante && <div style={{ marginBottom: 14 }}><PreviaComprovante caminho={reg.comprovante} /></div>}

      <div className="campo" style={{ marginBottom: 14 }}>
        <span>Categoria<em> *</em></span>
        <div className="fichas">
          {CATEGORIAS_DESPESA.map((c) => (
            <button key={c} type="button" className={`ficha ${reg.categoria === c ? "ativa" : ""}`}
              onClick={() => setReg((r) => ({ ...r, categoria: c }))}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {erro && <div className="aviso">{erro}</div>}
      <Formulario colecao="despesas" reg={reg} setReg={setReg} dados={dados} somente={campos} escolha={escolha} />
      {!porTalhao && (
        <div style={{ marginTop: 14 }}>
          <RateioDespesa rateio={rateio} setRateio={setRateio} total={reg.valor} dados={dados} comCulturas={reg.centro === "cultura"} />
        </div>
      )}
      {!tudo && <button type="button" className="btn" style={{ marginTop: 14 }} onClick={() => setTudo(true)}>Mais campos</button>}
    </Modal>
  );
}
