import { useMemo, useState } from "react";

import { BotaoFoto, Foto } from "../components/Foto";
import PainelTickets from "../components/PainelTickets";
import { Icone } from "../components/ui";
import { hoje } from "../lib/esquema";
import { brl, numero } from "../lib/formato";
import { supabaseConfigurado } from "../lib/supabase";
import {
  SEM_FAZENDA, daCultura, registrosDoTicket, repartirTicket, ultimoValorDaTurma,
} from "../lib/ticketCampo";

/**
 * Lançamento do ticket da balança no computador (ou pelo link /ticket fixado
 * no grupo do WhatsApp). Pede o mesmo que o celular do Modo Campo
 * (CampoTicket.jsx) e faz a mesma conta (lib/ticketCampo.js):
 *
 *   dia → venda de quê → fazendas → talhões → bags de cada talhão
 *   → turmas (bags e R$ por tonelada de cada uma) → peso → foto do ticket
 *
 * Vira uma venda por talhão (e por turma), sem comprador e sem preço. Quem
 * não é administrador nem gerente lança "Aguardando aprovação"; a aprovação
 * (e editar ou apagar) fica em "Tickets lançados", logo abaixo.
 */

export const LINK_TICKET = "/ticket";

const vazio = (anterior) => ({
  data: anterior?.data ?? hoje(), cultura_id: null, fazendas: [], talhoes: [],
  bags: {}, naoSei: false, turmas: [], peso: "", foto: null, observacao: "",
});

const num = (v) => (v === "" || v == null ? null : Number(String(v).replace(",", ".")));

/** O usuário logado no cadastro de Usuários (pelo e-mail). */
function usuarioLogado(dados, email) {
  const alvo = String(email ?? "").trim().toLowerCase();
  return (dados.usuarios ?? []).find((u) => alvo && String(u.email ?? "").trim().toLowerCase() === alvo);
}

/** Botões de marcar (um ou vários). */
function Escolhas({ opcoes, marcados, aoTocar }) {
  return (
    <div className="escolhas">
      {opcoes.map(([id, rotulo]) => (
        <button type="button" key={id} className={marcados.includes(id) ? "ativa" : ""} onClick={() => aoTocar(id)}>{rotulo}</button>
      ))}
    </div>
  );
}

export default function Ticket({ dados, salvar, remover, email }) {
  const [r, setR] = useState(() => vazio());
  const [erro, setErro] = useState(null);
  const [salvo, setSalvo] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const mudar = (patch) => { setSalvo(null); setErro(null); setR((x) => ({ ...x, ...patch })); };
  const mudarTurma = (i, patch) => mudar({ turmas: r.turmas.map((k, j) => (j === i ? { ...k, ...patch } : k)) });

  const usuario = usuarioLogado(dados, email);
  // Administrador e gerente lançam já aprovado; os demais (funcionários) esperam a aprovação.
  const aprovaDireto = !supabaseConfigurado || ["admin", "gerente"].includes(usuario?.perfil);
  const quem = usuario?.nome || email || "escritório";

  const culturas = useMemo(
    () => dados.culturas.filter((c) => c.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [dados.culturas],
  );
  const info = daCultura(dados, r.cultura_id);
  const { cultura, emBags } = info;

  const talhoesDaTela = info.fazendas.length > 1
    ? info.talhoes.filter((t) => r.fazendas.includes(t.fazenda_id ?? SEM_FAZENDA))
    : info.talhoes;
  const nomeFazenda = (t) => (info.fazendas.length > 1 ? info.fazendas.find((f) => f.id === (t.fazenda_id ?? SEM_FAZENDA))?.nome : null);
  const talhoesEscolhidos = r.talhoes.map((id) => dados.talhoes.find((t) => t.id === id)).filter(Boolean);
  const chavesBags = r.talhoes.length ? r.talhoes : ["carga"];

  const kg = num(r.peso) ?? 0;
  const totalBags = chavesBags.reduce((a, id) => a + (num(r.bags[id]) ?? 0), 0);
  // Uma turma só: ela colheu todos os bags.
  const turmas = r.turmas.map((k) => ({
    nome: k.nome, valor: num(k.valor), bags: r.turmas.length === 1 ? totalBags : num(k.bags) ?? 0,
  }));
  const somaTurmas = turmas.reduce((a, k) => a + k.bags, 0);
  const bagsBatem = turmas.length < 2 || somaTurmas === totalBags;
  const kgPorBag = emBags && totalBags > 0 && kg > 0 ? kg / totalBags : null;
  const conta = repartirTicket({
    talhoes: talhoesEscolhidos,
    bagsTalhao: Object.fromEntries(Object.entries(r.bags).map(([id, v]) => [id, num(v)])),
    turmas, peso: kg, emBags,
  });

  const escolherCultura = (id) => {
    if (id === r.cultura_id) return;
    // Trocou a cultura: fazendas, talhões e turmas eram da outra.
    mudar({ ...vazio(r), cultura_id: id, peso: r.peso, foto: r.foto, observacao: r.observacao });
  };

  const tocarFazenda = (id) => {
    const fazendas = r.fazendas.includes(id) ? r.fazendas.filter((x) => x !== id) : [...r.fazendas, id];
    // Desmarcou a fazenda: saem os talhões dela.
    const talhoes = r.talhoes.filter((t) => fazendas.includes(dados.talhoes.find((x) => x.id === t)?.fazenda_id ?? SEM_FAZENDA));
    mudar({ fazendas, talhoes });
  };

  const tocarTalhao = (id) => mudar({ talhoes: r.talhoes.includes(id) ? r.talhoes.filter((x) => x !== id) : [...r.talhoes, id] });

  const tocarTurma = (nome) => {
    if (nome === "__nao_sei") { mudar({ naoSei: !r.naoSei, turmas: [] }); return; }
    const marcado = r.turmas.some((k) => k.nome === nome);
    const valor = ultimoValorDaTurma(dados, cultura, nome);
    mudar({
      naoSei: false,
      turmas: marcado ? r.turmas.filter((k) => k.nome !== nome) : [...r.turmas, { nome, bags: "", valor: valor == null ? "" : String(valor) }],
    });
  };

  /** O mesmo que o celular exige para deixar seguir. */
  function falta() {
    if (!cultura) return "Escolha a venda de quê.";
    if (info.fazendas.length > 1 && !r.fazendas.length) return "Marque a fazenda (ou as fazendas) desta carga.";
    if (info.talhoes.length && !r.talhoes.length) return "Marque o talhão (ou os talhões) desta carga.";
    if (emBags) {
      for (const id of chavesBags) {
        if (!(num(r.bags[id]) > 0)) {
          const t = dados.talhoes.find((x) => x.id === id);
          return t ? `Preencha os bags do talhão ${t.nome}.` : "Preencha os bags da carga.";
        }
      }
      if (info.turmas.length && !r.turmas.length && !r.naoSei) return "Marque a turma que colheu (ou \"Não sei\").";
      for (const k of turmas) {
        if (r.turmas.length > 1 && !(k.bags > 0)) return `Preencha os bags que a turma ${k.nome} colheu.`;
        if (!(k.valor > 0)) return `Preencha o valor por tonelada da turma ${k.nome}.`;
      }
      if (!bagsBatem) return `As turmas somam ${somaTurmas} bags, mas a carga tem ${totalBags}.`;
    }
    if (!(kg > 0)) return "Preencha o peso líquido do ticket.";
    if (!r.data) return "Preencha a data.";
    return null;
  }

  const gravar = async (e) => {
    e.preventDefault();
    const motivo = falta();
    if (motivo) { setErro(motivo); return; }
    const resumo = [
      `Lançado no computador por ${quem}`,
      emBags && totalBags ? `Carga: ${totalBags} bags, ${numero(kg, 0)} kg${kgPorBag ? `, ${numero(kgPorBag, 1)} kg por bag` : ""}` : null,
      talhoesEscolhidos.length > 1 ? `Talhões: ${conta.porTalhao.map((x) => `${x.talhao.nome}${emBags ? ` ${x.bags} bags` : ""}`).join(", ")}` : null,
      turmas.length > 1 ? `Turmas: ${turmas.map((k) => `${k.nome} ${k.bags} bags`).join(", ")}` : null,
      talhoesEscolhidos.length > 1 || turmas.length > 1 ? (emBags ? "peso repartido pelos bags" : "peso repartido pela área") : null,
      emBags && r.naoSei ? "CONFERIR: turma não informada" : null,
      !r.foto ? "sem foto do ticket" : null,
      r.observacao.trim() || null,
    ].filter(Boolean).join(" · ");
    const { regs, erro: e2 } = registrosDoTicket(dados, {
      cultura, emBags, linhas: conta.linhas, data: r.data, foto: r.foto, observacao: resumo, aConferir: !aprovaDireto,
    });
    if (e2) { setErro(e2); return; }

    setSalvando(true);
    try {
      for (const reg of regs) await salvar("vendas", reg);
      setSalvo({ cultura: cultura.nome, kg, talhoes: talhoesEscolhidos.map((t) => t.nome).join(", ") });
      // Próximo ticket: mesmo dia, cultura, talhões, turmas e valores; bags, peso e foto novos.
      setR((a) => ({ ...a, bags: {}, peso: "", foto: null, observacao: "", turmas: a.turmas.map((k) => ({ ...k, bags: "" })) }));
      window.scrollTo(0, 0);
    } catch (err) {
      setErro(String(err?.message ?? err));
    } finally {
      setSalvando(false);
    }
  };

  const copiarLink = async () => {
    try {
      await navigator.clipboard.writeText(location.origin + LINK_TICKET);
      setCopiado(true);
    } catch {
      window.prompt("Copie o link:", location.origin + LINK_TICKET);
    }
  };

  const motivo = cultura ? falta() : null;

  return (
    <>
      <form className="cartao ticket" onSubmit={gravar}>
        <p className="descricao">
          Lance aqui cada ticket da balança. Pede o mesmo que o celular: talhões, bags, turmas, peso e a foto do ticket.
          {aprovaDireto
            ? " Como você é administrador/gerente, o ticket já entra aprovado."
            : " O ticket fica aguardando a aprovação do escritório."}
        </p>

        {salvo && (
          <div className="aviso ok">
            Ticket salvo: {salvo.cultura} · {numero(salvo.kg / 1000, 3)} t{salvo.talhoes && <> · {salvo.talhoes}</>}
            {aprovaDireto ? "" : " · aguardando aprovação"}. Pode lançar o próximo.
          </div>
        )}

        <div className="form">
          <label className="campo"><span>Data <em>*</em></span>
            <input type="date" value={r.data} onChange={(e) => mudar({ data: e.target.value })} required />
          </label>
        </div>

        <div className="campo">
          <span>Venda de quê? <em>*</em></span>
          <Escolhas opcoes={culturas.map((c) => [c.id, c.nome])} marcados={[r.cultura_id]} aoTocar={escolherCultura} />
        </div>

        {cultura && info.fazendas.length > 1 && (
          <div className="campo">
            <span>Fazenda <em>*</em> <small>(pode marcar mais de uma)</small></span>
            <Escolhas opcoes={info.fazendas.map((f) => [f.id, f.nome])} marcados={r.fazendas} aoTocar={tocarFazenda} />
          </div>
        )}

        {cultura && talhoesDaTela.length > 0 && (
          <div className="campo">
            <span>Talhão <em>*</em> <small>(pode marcar mais de um)</small></span>
            <Escolhas opcoes={talhoesDaTela.map((t) => [t.id, nomeFazenda(t) ? `${t.nome} · ${nomeFazenda(t)}` : t.nome])}
              marcados={r.talhoes} aoTocar={tocarTalhao} />
          </div>
        )}

        {cultura && emBags && (
          <div className="form">
            {chavesBags.map((id) => {
              const t = dados.talhoes.find((x) => x.id === id);
              return (
                <label className="campo" key={id}>
                  <span>{t ? (chavesBags.length > 1 ? `Bags do talhão ${t.nome}` : `Bags da carga · ${t.nome}`) : "Bags da carga"} <em>*</em></span>
                  <input type="number" inputMode="numeric" min="0" step="1" value={r.bags[id] ?? ""}
                    onChange={(e) => mudar({ bags: { ...r.bags, [id]: e.target.value } })} />
                </label>
              );
            })}
            {chavesBags.length > 1 && totalBags > 0 && <p className="campo"><small>Carga: {totalBags} bags</small></p>}
          </div>
        )}

        {cultura && emBags && info.turmas.length > 0 && (
          <div className="campo">
            <span>Qual turma colheu? <em>*</em> <small>(pode marcar mais de uma)</small></span>
            <Escolhas opcoes={[...info.turmas.map((t) => [t, t]), ["__nao_sei", "Não sei"]]}
              marcados={r.naoSei ? ["__nao_sei"] : r.turmas.map((k) => k.nome)} aoTocar={tocarTurma} />
          </div>
        )}

        {cultura && emBags && r.turmas.length > 0 && (
          <div className="form">
            {r.turmas.map((k, i) => (
              <div key={k.nome} className="campo largo">
                <span><b>{k.nome}</b></span>
                <div className="form">
                  {r.turmas.length > 1 && (
                    <label className="campo"><span>Bags que colheu <em>*</em></span>
                      <input type="number" inputMode="numeric" min="0" step="1" value={k.bags} onChange={(e) => mudarTurma(i, { bags: e.target.value })} />
                    </label>
                  )}
                  <label className="campo"><span>Valor por tonelada (R$) <em>*</em></span>
                    <input type="number" inputMode="decimal" min="0" step="any" value={k.valor} onChange={(e) => mudarTurma(i, { valor: e.target.value })} />
                  </label>
                </div>
              </div>
            ))}
            {r.turmas.length > 1 && (
              <p className={`campo largo ${bagsBatem ? "" : "negativo"}`}>
                <small>Turmas: {somaTurmas} de {totalBags} bags{bagsBatem ? " ✓" : " — tem que bater com a carga"}</small>
              </p>
            )}
          </div>
        )}

        {cultura && (
          <div className="form">
            <label className="campo"><span>Peso líquido do ticket (kg) <em>*</em></span>
              <input type="number" inputMode="decimal" step="any" min="0" value={r.peso} onChange={(e) => mudar({ peso: e.target.value })} />
              {kg > 0 && <small>= {numero(kg / 1000, 3)} toneladas{kgPorBag ? ` · cada bag: ${numero(kgPorBag, 0)} kg` : ""}</small>}
            </label>
            <div className="campo">
              <span>Foto do ticket</span>
              <div className="barra" style={{ marginBottom: 0 }}>
                <BotaoFoto aoTirar={(c) => mudar({ foto: c })} lado={1600} className="btn">
                  📷 {r.foto ? "Trocar a foto" : "Escolher / tirar a foto"}
                </BotaoFoto>
                {r.foto && <Foto caminho={r.foto} alt="Foto do ticket" className="miniatura-ticket" />}
              </div>
              {!r.foto && <small>Sem a foto o ticket entra marcado "sem foto do ticket".</small>}
            </div>
            <label className="campo largo"><span>Observação</span>
              <textarea rows={2} value={r.observacao} onChange={(e) => mudar({ observacao: e.target.value })} />
            </label>
          </div>
        )}

        {cultura && kg > 0 && !motivo && (conta.porTalhao.length > 1 || conta.porTurma.length > 0) && (
          <div className="aviso ok">
            {conta.porTalhao.length > 1 && <div>Por talhão: {conta.porTalhao.map((x) => `${x.talhao.nome} ${numero(x.kg, 0)} kg`).join(" · ")}</div>}
            {conta.porTurma.map((k) => (
              <div key={k.nome}>{k.nome}: {k.bags} bags · {numero(k.kg, 0)} kg · {brl(k.valor)}/t = <b>{brl(k.pagar)}</b></div>
            ))}
          </div>
        )}

        {erro && <div className="aviso">{erro}</div>}

        <button className="btn primario grande" disabled={salvando}>
          <Icone nome="mais" /> {salvando ? "Salvando…" : "Salvar ticket"}
        </button>
      </form>

      <PainelTickets dados={dados} salvar={salvar} remover={remover} />

      <div className="cartao">
        <h2>Link para o grupo do WhatsApp</h2>
        <p className="descricao">
          Fixe este link na conversa com o Sinvaldo. Tocando nele, o sistema abre direto nesta tela
          (no primeiro acesso do celular, pede o login).
        </p>
        <div className="barra">
          <code className="link-ticket">{location.origin + LINK_TICKET}</code>
          <button type="button" className="btn" onClick={copiarLink}>{copiado ? "Copiado!" : "Copiar link"}</button>
        </div>
      </div>
    </>
  );
}
