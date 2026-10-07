import { useEffect, useState } from "react";

import {
  Cartao, EscolherPessoa, FotoComprovante, FotoOuInicial, FotoProduto, Ouvir, Pergunta, Rodape, Teclado, Topo,
} from "../components/CampoUI";
import { Foto } from "../components/Foto";
import { falar, operadores, paraNumero, vibrar } from "../lib/campo";
import {
  emEmbalagens, itensDaOrdem, ordensAbertas, ordensSeparadas, saidaDaSeparacao, sobraDaOrdem,
} from "../lib/deposito";
import { hoje, prepararRegistro } from "../lib/esquema";
import { nomesTalhoesDaOrdem, talhoesDaOrdem } from "../lib/talhoes";
import { data as dataBR, nomeRef, numero } from "../lib/formato";

/**
 * Depósito de químicos no Modo Campo:
 *   /campo/saida    → tirar do depósito: as pulverizações para separar, produto por produto
 *   /campo/entrada  → guardar no depósito: produto novo (compra) ou sobra que voltou
 */

// ─── Peças ──────────────────────────────────────────────────────────────────

/** As embalagens desenhadas: 3 galões = 3 fotos do produto, lado a lado. */
function Embalagens({ insumo, quantidade }) {
  const e = emEmbalagens(insumo, quantidade);
  const desenhos = Math.min(e.cheias, 12);
  return (
    <div className="embalagens">
      {e.cheias > 0 && (
        <div className="embalagens-fotos">
          {Array.from({ length: desenhos }, (_, i) => <FotoProduto key={i} insumo={insumo} className="mini" />)}
          {e.cheias > 12 && <b>+{e.cheias - 12}</b>}
          {e.resto > 0 && <span className="parcial"><FotoProduto insumo={insumo} className="mini" /></span>}
        </div>
      )}
      <p className="embalagens-texto">{e.texto}</p>
    </div>
  );
}

function Tela({ figura = "📦", titulo, fala, passo, children, rodape }) {
  useEffect(() => { if (fala) falar(fala); }, [passo]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="campo-app">
      <Topo titulo={titulo} figura={figura} pergunta={fala} />
      <div className="campo-corpo">{children}</div>
      {rodape}
    </div>
  );
}

function Pronto({ texto, irPara }) {
  return (
    <>
      <div className="pronto">
        <div className="check">✅</div>
        <h2>Pronto! <Ouvir texto={texto} className="na-pergunta" /></h2>
        <p>{texto}</p>
      </div>
      <footer className="campo-rodape">
        <button type="button" className="campo-btn verde" onClick={() => irPara("/campo")}>🏠 Início</button>
      </footer>
    </>
  );
}

function CartaoOrdem({ dados, ordem, aoTocar }) {
  const talhao = dados.talhoes.find((t) => t.id === ordem.talhao_id);
  const nomes = nomesTalhoesDaOrdem(dados, ordem);
  const varios = talhoesDaOrdem(dados, ordem).length > 1;
  const itens = itensDaOrdem(dados, ordem.id);
  const fala = `Pulverização ${varios ? "nos talhões" : "no talhão"} ${nomes}, ${itens.length} produtos`;
  return (
    <div className="campo-item">
      <button type="button" className="ordem-cartao" onClick={aoTocar}>
        <div className="ordem-cabeca">
          {talhao?.foto ? <FotoOuInicial caminho={talhao.foto} nome={talhao.nome} /> : <span className="figura">💦</span>}
          <div>
            <b>{nomes}</b>
            <small>{dataBR(ordem.data)} · {nomeRef(dados, "maquinas", ordem.maquina_id)}</small>
          </div>
        </div>
        <div className="ordem-produtos">
          {itens.map(({ insumo, separado }) => (
            <span key={insumo.id} className={separado ? "feito" : ""}><FotoProduto insumo={insumo} className="mini" /></span>
          ))}
        </div>
      </button>
      <Ouvir texto={fala} />
    </div>
  );
}

// ─── Tirar do depósito (separar a pulverização) ──────────────────────────────────

export function Saida({ dados, salvar, irPara }) {
  const [passo, setPasso] = useState("ordem");
  const [ordemId, setOrdemId] = useState(null);
  const [operadorId, setOperadorId] = useState(null);
  const [itemId, setItemId] = useState(null);
  const [faltamDepois, setFaltamDepois] = useState(0);
  const [erro, setErro] = useState(null);

  const ordem = dados.pulverizacoes.find((o) => o.id === ordemId);
  const itens = ordem ? itensDaOrdem(dados, ordem.id) : [];
  const atual = itens.find((x) => x.item.id === itemId);
  const ir = (p) => { setErro(null); setPasso(p); window.scrollTo(0, 0); };

  /** "Peguei este": lança a saída do produto e, se era o último, marca a ordem como separada. */
  const separar = async () => {
    try {
      const regs = saidaDaSeparacao(dados, ordem, atual.item, operadorId, hoje()).map((b) => prepararRegistro("aplicacoes", b));
      const e = regs.find((x) => x.erro)?.erro;
      if (e) throw new Error(e);
      for (const { reg } of regs) await salvar("aplicacoes", reg);
      const faltam = itens.filter((x) => !x.separado && x.item.id !== atual.item.id);
      if (!faltam.length) {
        await salvar("pulverizacoes", { ...ordem, situacao: "separada", operador_id: ordem.operador_id ?? operadorId });
      }
      vibrar([60, 40, 60]);
      falar(faltam.length ? `Certo! ${atual.insumo.nome} separado.` : "Certo! Todos os produtos separados.");
      setFaltamDepois(faltam.length);
      ir("certo");
    } catch (err) {
      setErro(String(err?.message ?? err));
    }
  };

  switch (passo) {
    case "ordem": {
      const abertas = ordensAbertas(dados);
      return (
        <Tela passo={passo} figura="📤" titulo="Tirar do depósito" fala={abertas.length ? "Qual pulverização você vai fazer? Toque nela." : "Nenhuma pulverização para separar agora. Fale com o gerente."}
          rodape={<Rodape aoVoltar={() => irPara("/campo")} />}>
          <Pergunta figura="💦">Qual pulverização?</Pergunta>
          {!abertas.length && <div className="campo-aviso">Nenhuma pulverização para separar. Fale com o gerente.</div>}
          <div className="ordens">
            {abertas.map((o) => <CartaoOrdem key={o.id} dados={dados} ordem={o} aoTocar={() => { setOrdemId(o.id); vibrar(); ir("operador"); }} />)}
          </div>
        </Tela>
      );
    }

    case "operador":
      return (
        <Tela passo={passo} figura="📤" titulo="Tirar do depósito" fala="Quem é você? Toque na sua foto."
          rodape={<Rodape aoVoltar={() => ir("ordem")} />}>
          <Pergunta figura="👤">Quem é você?</Pergunta>
          <EscolherPessoa pessoas={operadores(dados)} marcado={operadorId} aoEscolher={(id) => { setOperadorId(id); ir("lista"); }} />
        </Tela>
      );

    case "lista": {
      const faltam = itens.filter((x) => !x.separado).length;
      const fala = faltam
        ? `Pegue estes produtos. Faltam ${faltam}. ${itens.filter((x) => !x.separado).map((x) => `${x.insumo.nome}: ${emEmbalagens(x.insumo, x.item.quantidade).fala}`).join(". ")}. Toque no produto para conferir.`
        : "Todos os produtos já foram separados.";
      return (
        <Tela passo={passo} figura="📤" titulo={ordem ? nomesTalhoesDaOrdem(dados, ordem) : ""} fala={fala}
          rodape={faltam ? <Rodape aoVoltar={() => ir("ordem")} /> : <footer className="campo-rodape"><button type="button" className="campo-btn verde" onClick={() => ir("pronto")}>✓ Terminar</button></footer>}>
          <Pergunta figura="🧴">Pegue estes produtos</Pergunta>
          {itens.map(({ item, insumo, separado }) => (
            <div key={item.id} className="campo-item">
              <button type="button" className={`produto-linha ${separado ? "feito" : ""}`} disabled={separado}
                onClick={() => { setItemId(item.id); falar(insumo.nome); ir("produto"); }}>
                <FotoProduto insumo={insumo} />
                <div>
                  <b>{insumo.nome}</b>
                  <small>{emEmbalagens(insumo, item.quantidade).texto}</small>
                </div>
                <span className="estado">{separado ? "✅" : "▶"}</span>
              </button>
              <Ouvir texto={`${insumo.nome}. ${emEmbalagens(insumo, item.quantidade).fala}. ${separado ? "Já separado." : ""}`} />
            </div>
          ))}
        </Tela>
      );
    }

    case "produto": {
      const e = emEmbalagens(atual.insumo, atual.item.quantidade);
      const fala = `Pegue ${atual.insumo.nome}: ${e.fala}. Confira se é igual à foto e toque no botão verde.`;
      return (
        <Tela passo={passo} figura="📤" titulo={ordem ? nomesTalhoesDaOrdem(dados, ordem) : ""} fala={fala}
          rodape={(
            <footer className="campo-rodape">
              <button type="button" className="campo-btn cinza" onClick={() => ir("lista")}>◀ Voltar</button>
              <button type="button" className="campo-btn verde" onClick={separar}>✓ Peguei este</button>
            </footer>
          )}>
          <div className="produto-grande">
            <FotoProduto insumo={atual.insumo} className="foto" />
            <h2>{atual.insumo.nome}</h2>
          </div>
          {erro && <div className="campo-aviso erro">{erro}</div>}
          <Embalagens insumo={atual.insumo} quantidade={atual.item.quantidade} />
        </Tela>
      );
    }

    case "certo":
      return (
        <div className="campo-app resultado certo">
          <div className="resultado-marca">✓</div>
          <h2>Certo!</h2>
          <p>{atual?.insumo.nome}</p>
          <footer className="campo-rodape">
            <button type="button" className="campo-btn verde" onClick={() => ir(faltamDepois ? "lista" : "pronto")}>
              {faltamDepois ? "Próximo produto ▶" : "✓ Terminar"}
            </button>
          </footer>
        </div>
      );

    default:
      return (
        <Tela passo={passo} figura="📤" titulo="Tirar do depósito" fala="Pronto! Todos os produtos separados. Pode levar para o trator.">
          <Pronto texto="Todos os produtos separados. Pode levar para o trator." irPara={irPara} />
        </Tela>
      );
  }
}

// ─── Guardar no depósito (compra ou sobra) ───────────────────────────────────────

function Contador({ insumo, valor, aoMudar }) {
  const tam = Number(insumo.tamanho_embalagem) || 0;
  const qtd = Math.round((Number(valor) || 0) / tam);
  const mudar = (d) => { vibrar(20); aoMudar(Math.max(0, qtd + d) * tam); };
  return (
    <div className="contador">
      <button type="button" onClick={() => mudar(-1)} aria-label="Menos">−</button>
      <div><b>{qtd}</b><small>{emEmbalagens(insumo, tam).texto.replace(/^1 /, "")}</small></div>
      <button type="button" onClick={() => mudar(1)} aria-label="Mais">+</button>
    </div>
  );
}

export function Entrada({ dados, salvar, irPara }) {
  const [passo, setPasso] = useState("tipo");
  const [tipo, setTipo] = useState(null);
  const [operadorId, setOperadorId] = useState(null);
  const [ordemId, setOrdemId] = useState(null);
  const [insumoId, setInsumoId] = useState(null);
  const [qtd, setQtd] = useState(""); // texto do teclado ou número do contador
  const [foto, setFoto] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const insumo = dados.insumos.find((i) => i.id === insumoId);
  const ordem = dados.pulverizacoes.find((o) => o.id === ordemId);
  const quantidade = typeof qtd === "number" ? qtd : paraNumero(qtd);
  const ir = (p) => { setAviso(null); setPasso(p); window.scrollTo(0, 0); };
  const escolherProduto = (id) => { setInsumoId(id); setQtd(""); ir("quantidade"); };

  const gravar = async () => {
    setSalvando(true);
    try {
      const [colecao, brutos] = tipo === "compra"
        ? ["insumo_entradas", [{
          data: hoje(), insumo_id: insumo.id, quantidade, valor: null, a_conferir: true, foto,
          responsavel_id: operadorId, observacao: "Entrada pelo depósito (Modo Campo)",
        }]]
        : ["aplicacoes", sobraDaOrdem(dados, ordem, insumo.id, quantidade, operadorId, hoje())];
      const regs = brutos.map((b) => prepararRegistro(colecao, b));
      const erro = regs.find((x) => x.erro)?.erro;
      if (erro) throw new Error(erro);
      for (const { reg } of regs) await salvar(colecao, reg);
      vibrar([60, 60, 120]);
      ir(tipo === "compra" ? "pronto" : "mais");
    } catch (e) {
      setAviso(String(e?.message ?? e));
    } finally {
      setSalvando(false);
    }
  };

  const titulo = "Guardar no depósito";
  switch (passo) {
    case "tipo":
      return (
        <Tela passo={passo} figura="📥" titulo={titulo} fala="O que está entrando no depósito? Produto novo que chegou, ou sobra que voltou da pulverização?"
          rodape={<Rodape aoVoltar={() => irPara("/campo")} />}>
          <Pergunta figura="📥">O que está entrando?</Pergunta>
          <div className="campo-grade dois">
            <Cartao fala="Produto novo, que chegou de compra" aoTocar={() => { setTipo("compra"); falar("Produto novo"); ir("operador"); }}>
              <span className="figura">🆕</span><span>Produto novo</span>
            </Cartao>
            <Cartao fala="Sobra que voltou da pulverização" aoTocar={() => { setTipo("sobra"); falar("Sobra da pulverização"); ir("operador"); }}>
              <span className="figura">↩️</span><span>Sobrou da pulverização</span>
            </Cartao>
          </div>
        </Tela>
      );

    case "operador":
      return (
        <Tela passo={passo} figura="📥" titulo={titulo} fala="Quem é você? Toque na sua foto."
          rodape={<Rodape aoVoltar={() => ir("tipo")} />}>
          <Pergunta figura="👤">Quem é você?</Pergunta>
          <EscolherPessoa pessoas={operadores(dados)} marcado={operadorId} aoEscolher={(id) => {
            setOperadorId(id);
            if (tipo === "sobra") ir("ordem");
            else if (insumoId) ir("quantidade");
            else ir("produto");
          }} />
        </Tela>
      );

    case "ordem": {
      const lista = ordensSeparadas(dados);
      return (
        <Tela passo={passo} figura="📥" titulo={titulo} fala={lista.length ? "De qual pulverização sobrou? Toque nela." : "Nenhuma pulverização saiu do depósito ainda."}
          rodape={<Rodape aoVoltar={() => ir("operador")} />}>
          <Pergunta figura="💦">De qual pulverização?</Pergunta>
          {!lista.length && <div className="campo-aviso">Nenhuma pulverização saiu do depósito ainda.</div>}
          <div className="ordens">
            {lista.map((o) => <CartaoOrdem key={o.id} dados={dados} ordem={o} aoTocar={() => { setOrdemId(o.id); ir("produto"); }} />)}
          </div>
        </Tela>
      );
    }

    case "produto": {
      const produtos = tipo === "sobra"
        ? itensDaOrdem(dados, ordemId).map((x) => x.insumo)
        : dados.insumos.filter((i) => i.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome));
      return (
        <Tela passo={passo} figura="📥" titulo={titulo}
          fala={tipo === "sobra" ? "Qual produto sobrou? Toque na foto." : "Qual produto chegou? Toque na foto."}
          rodape={<Rodape aoVoltar={() => ir(tipo === "sobra" ? "ordem" : "operador")} />}>
          <Pergunta figura="🧴">{tipo === "sobra" ? "Qual produto sobrou?" : "Qual produto?"}</Pergunta>
          {aviso && <div className="campo-aviso erro">{aviso}</div>}
          <div className="campo-grade">
            {produtos.map((i) => (
              <Cartao key={i.id} fala={i.nome} marcado={insumoId === i.id} aoTocar={() => { falar(i.nome); escolherProduto(i.id); }}>
                <FotoProduto insumo={i} />
                <span>{i.nome}</span>
              </Cartao>
            ))}
          </div>
        </Tela>
      );
    }

    case "quantidade": {
      const usaContador = tipo === "compra" && Number(insumo?.tamanho_embalagem) > 0;
      const saiu = tipo === "sobra"
        ? dados.aplicacoes.filter((a) => a.pulverizacao_id === ordemId && a.insumo_id === insumoId).reduce((s, a) => s + (Number(a.quantidade) || 0), 0)
        : null;
      const passou = saiu != null && quantidade > saiu + 1e-9;
      const fala = tipo === "sobra"
        ? `Quanto sobrou de ${insumo?.nome}? Digite em ${insumo?.unidade}. Saíram ${numero(saiu)}.${quantidade ? ` Você digitou ${numero(quantidade)}.` : ""}`
        : `Quantas embalagens de ${insumo?.nome} chegaram?${quantidade ? ` ${emEmbalagens(insumo, quantidade).fala}.` : ""} Tire uma foto do produto ou da nota.`;
      return (
        <Tela passo={passo} figura="📥" titulo={insumo?.nome} fala={fala}
          rodape={<Rodape aoVoltar={() => ir("produto")} aoSeguir={() => ir("conferir")} podeSeguir={quantidade > 0 && !passou} />}>
          <div className="produto-grande pequeno"><FotoProduto insumo={insumo} className="foto" /><h2>{insumo?.nome}</h2></div>
          {usaContador ? (
            <>
              <Contador insumo={insumo} valor={quantidade} aoMudar={setQtd} />
              {quantidade > 0 && <Embalagens insumo={insumo} quantidade={quantidade} />}
            </>
          ) : (
            <>
              <div className="visor">{qtd || <span className="apagado">0</span>} <small>{insumo?.unidade}</small></div>
              {saiu != null && <p className="dica-anterior">Saíram: {numero(saiu)} {insumo?.unidade}</p>}
              {passou && <div className="campo-aviso erro">Sobrou mais do que saiu. Confira o número.</div>}
              <Teclado valor={typeof qtd === "string" ? qtd : ""} aoMudar={setQtd} casas={2} />
            </>
          )}
          {tipo === "compra" && <div style={{ marginTop: 14 }}><FotoComprovante caminho={foto} aoTirar={setFoto} texto="Tirar foto do produto / nota" /></div>}
        </Tela>
      );
    }

    case "conferir": {
      const operador = dados.funcionarios.find((f) => f.id === operadorId);
      const qtdTexto = emEmbalagens(insumo, quantidade).texto;
      const fala = `Confira. ${tipo === "compra" ? "Produto novo" : "Sobra da pulverização"}. ${insumo?.nome}: ${qtdTexto}. Quem recebeu: ${operador?.nome}. Se estiver certo, toque em salvar.`;
      return (
        <Tela passo={passo} figura="📥" titulo={titulo} fala={fala}
          rodape={(
            <footer className="campo-rodape">
              <button type="button" className="campo-btn cinza" onClick={() => ir("quantidade")}>◀ Voltar</button>
              <button type="button" className="campo-btn verde" onClick={gravar} disabled={salvando}>{salvando ? "Salvando…" : "✓ Salvar"}</button>
            </footer>
          )}>
          <Pergunta figura="👀">Está certo?</Pergunta>
          {aviso && <div className="campo-aviso erro">{aviso}</div>}
          <div className="resumo-linha"><span className="figura">{tipo === "compra" ? "🆕" : "↩️"}</span><span>{tipo === "compra" ? "Produto novo" : "Sobra da pulverização"}</span></div>
          <div className="resumo-linha" onClick={() => ir("produto")}><FotoProduto insumo={insumo} /><span>{insumo?.nome}</span></div>
          <div className="resumo-linha" onClick={() => ir("quantidade")}><span className="figura">🔢</span><span>{qtdTexto}</span></div>
          <div className="resumo-linha" onClick={() => ir("operador")}><FotoOuInicial caminho={operador?.foto} nome={operador?.nome ?? "?"} /><span>{operador?.nome}</span></div>
          {foto && <div className="resumo-linha"><Foto caminho={foto} className="foto" /><span>Foto tirada ✓</span></div>}
        </Tela>
      );
    }

    case "mais":
      return (
        <Tela passo={passo} figura="📥" titulo={titulo} fala="Guardado! Sobrou mais algum produto desta pulverização?"
          rodape={(
            <footer className="campo-rodape">
              <button type="button" className="campo-btn cinza" onClick={async () => {
                await salvar("pulverizacoes", { ...ordem, situacao: "concluida" });
                ir("pronto");
              }}>✕ Não, terminei</button>
              <button type="button" className="campo-btn verde" onClick={() => { setInsumoId(null); setQtd(""); ir("produto"); }}>✓ Sim</button>
            </footer>
          )}>
          <div className="pronto"><div className="check">✅</div><h2>Guardado!</h2><p>Sobrou mais algum produto desta pulverização?</p></div>
        </Tela>
      );

    default:
      return (
        <Tela passo={passo} figura="📥" titulo={titulo} fala="Pronto! Guardado no depósito. Obrigado.">
          <Pronto texto="Guardado no depósito." irPara={irPara} />
        </Tela>
      );
  }
}
