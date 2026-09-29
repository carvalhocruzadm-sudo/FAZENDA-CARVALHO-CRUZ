import { useEffect } from "react";

const P = {
  painel: "M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10",
  cultura: "M12 22V10M12 10c0-4 3-7 7-7 0 4-3 7-7 7zM12 14c0-3-2.5-5.5-6-5.5 0 3.5 2.5 5.5 6 5.5z",
  mapa: "M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14",
  casa: "M3 10.5L12 4l9 6.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z",
  pessoas: "M17 20v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2M10 10a4 4 0 100-8 4 4 0 000 8zM21 20v-2a4 4 0 00-3-3.9M16 2.1a4 4 0 010 7.8",
  trator: "M4 16a3 3 0 106 0 3 3 0 00-6 0zM15 17.5a2.5 2.5 0 105 0 2.5 2.5 0 00-5 0zM7 13V6h6l2 5h4a2 2 0 012 2v3M10 16h5M13 6v5",
  frasco: "M9 3h6M10 3v6L5 18a2 2 0 002 3h10a2 2 0 002-3l-5-9V3M7.5 14h9",
  relogio: "M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z",
  chave: "M14.7 6.3a4 4 0 00-5.4 5.2L3 17.8V21h3.2l6.3-6.3a4 4 0 005.2-5.4l-2.6 2.6-2.8-.8-.8-2.8z",
  gota: "M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z",
  combustivel: "M3 21V5a2 2 0 012-2h7a2 2 0 012 2v16M3 21h11M6 8h5M14 10h2a2 2 0 012 2v5a1.5 1.5 0 003 0V9l-3-3",
  caixa: "M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8",
  spray: "M8 8h5v13H8zM8 8V5h5v3M16 4h.01M19 3h.01M19 6h.01M16 7h.01M21 5h.01",
  dinheiro: "M3 7h18v10H3zM12 15a3 3 0 100-6 3 3 0 000 6zM6 10v4M18 10v4",
  entrada: "M12 3v12M7 10l5 5 5-5M4 21h16",
  cesto: "M4 10h16l-2 10H6zM8 10l4-6 4 6",
  venda: "M4 7h16l-1.5 11a2 2 0 01-2 1.7h-9a2 2 0 01-2-1.7zM9 7a3 3 0 016 0",
  caminhao: "M3 17V6h11v11M14 9h4l3 4v4h-2M3 17h2M9 17h6M7 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z",
  lista: "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",
  grafico: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  mais: "M12 5v14M5 12h14",
  busca: "M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-5-5",
  editar: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  lixo: "M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3",
  fechar: "M6 6l12 12M18 6L6 18",
  menu: "M4 6h16M4 12h16M4 18h16",
  sync: "M4 4v5h5M20 20v-5h-5M5.5 15a7 7 0 0012.4 2M18.5 9A7 7 0 006.1 7",
  alerta: "M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 001.7 3h16.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z",
  sair: "M15 17l5-5-5-5M20 12H9M12 21H5a2 2 0 01-2-2V5a2 2 0 012-2h7",
  nuvem: "M7 18a5 5 0 01-.5-10A6 6 0 0118 9a4.5 4.5 0 01-.5 9z",
  exportar: "M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 002 2h12a2 2 0 002-2v-4",
};

export function Icone({ nome, tamanho = 18, className }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={P[nome] ?? P.lista} />
    </svg>
  );
}

export function Stat({ rotulo, valor, sub, cor }) {
  return (
    <div className={`stat ${cor ?? ""}`}>
      <small>{rotulo}</small>
      <b title={String(valor)}>{valor}</b>
      {sub && <span>{sub}</span>}
    </div>
  );
}

export function Abas({ abas, atual, aoTrocar }) {
  return (
    <div className="abas" role="tablist">
      {abas.map(([id, rotulo]) => (
        <button key={id} role="tab" aria-selected={atual === id} className={atual === id ? "ativa" : ""} onClick={() => aoTrocar(id)}>
          {rotulo}
        </button>
      ))}
    </div>
  );
}

export function Modal({ titulo, aoFechar, children, rodape }) {
  useEffect(() => {
    const esc = (e) => e.key === "Escape" && aoFechar();
    window.addEventListener("keydown", esc);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", esc);
      document.body.style.overflow = overflow;
    };
  }, [aoFechar]);

  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo}>
        <header>
          <h2>{titulo}</h2>
          <button className="btn icone" onClick={aoFechar} aria-label="Fechar"><Icone nome="fechar" /></button>
        </header>
        <div className="corpo">{children}</div>
        {rodape && <footer>{rodape}</footer>}
      </div>
    </div>
  );
}

export function SeletorPeriodo({ periodos, valor, aoMudar }) {
  return (
    <select className="entrada" style={{ width: "auto" }} value={valor} onChange={(e) => aoMudar(e.target.value)} aria-label="Período">
      {periodos.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
    </select>
  );
}

/** Tabela simples de relatório. `colunas`: [{ rotulo, valor(linha), num }] */
export function TabelaSimples({ colunas, linhas, rodape, vazio = "Nada para mostrar." }) {
  if (!linhas.length) return <div className="vazio">{vazio}</div>;
  return (
    <div className="tabela cartoes">
      <table>
        <thead><tr>{colunas.map((c) => <th key={c.rotulo} className={c.num ? "num" : ""}>{c.rotulo}</th>)}</tr></thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={l.id ?? i}>
              {colunas.map((c) => <td key={c.rotulo} data-rotulo={c.rotulo} className={c.num ? "num" : ""}>{c.valor(l)}</td>)}
            </tr>
          ))}
        </tbody>
        {rodape && (
          <tfoot><tr>{colunas.map((c, i) => <td key={c.rotulo} className={c.num ? "num" : ""}>{rodape[i] ?? ""}</td>)}</tr></tfoot>
        )}
      </table>
    </div>
  );
}
