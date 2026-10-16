import { useMemo, useState } from "react";

import { BotaoFoto, Foto } from "../components/Foto";
import PainelTickets from "../components/PainelTickets";
import { Icone } from "../components/ui";
import { salvarComAviso } from "../lib/avisos";
import { hoje } from "../lib/esquema";
import { brl, numero } from "../lib/formato";
import { completarVenda, lerTicketDaFoto } from "../lib/leituraTicket";
import { supabaseConfigurado } from "../lib/supabase";
import {
  SEM_FAZENDA, daCultura, registrosDoTicket, repartirTicket, ultimoPrecoDoProprietario, ultimoValorDaTurma,
} from "../lib/ticketCampo";

/**
 * Lançamento do ticket da balança no computador (ou pelo link /ticket fixado
 * no grupo do WhatsApp). Pede o mesmo que o celular do Modo Campo
 * (CampoTicket.jsx) e faz a mesma conta (lib/ticketCampo.js):
 *
 *   dia → venda de quê → fazendas → talhões → bags de cada talhão
 *   → turmas (bags e R$ por tonelada de cada uma) → foto do ticket → peso
 *
 * A foto do ticket é lida pela IA (lib/leituraTicket.js): placa, tipo de
 * carro, tara, bruto e peso líquido já vêm preenchidos (dá para corrigir), e
 * comprador, motorista e nota fiscal que estiverem no ticket vão para a venda.
 *
 * Vira uma venda por talhão (e por turma), sem comprador e sem preço. Quem
 * não é administrador nem gerente lança "Aguardando aprovação"; a aprovação
 * (e editar ou apagar) fica em "Tickets lançados", logo abaixo.
 */

export const LINK_TICKET = "/ticket";

const vazio = (anterior) => ({
  data: anterior?.data ?? hoje(), cultura_id: null, fazendas: [], talhoes: [], proprietario: "", preco_compra: "",
  bags: {}, naoSei: false, turmas: [], peso: "", foto: null, observacao: "",
  placa: "", tipo_carro: "", tara: "", bruto: "", leitura: null,
});

/** Só o que muda a cada carga (o resto fica para o próximo ticket). */
const cargaNova = { bags: {}, peso: "", foto: null, observacao: "", placa: "", tipo_carro: "", tara: "", bruto: "", leitura: null };

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
  const [lendo, setLendo] = useState(null); // { caminho } enquanto lê; { erro } se falhou

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

  /** Tara ou bruto mudou: o peso líquido é a diferença. */
  const mudarPesagem = (patch) => {
    const novo = { ...r, ...patch };
    const tara = num(novo.tara), bruto = num(novo.bruto);
    mudar(tara > 0 && bruto > 0 ? { ...patch, peso: String(Math.abs(bruto - tara)) } : patch);
  };

  /** Foto escolhida: a IA lê o ticket e preenche o que estiver vazio. */
  const escolherFoto = async (caminho) => {
    mudar({ foto: caminho, leitura: null });
    setLendo({ caminho });
    try {
      const t = await lerTicketDaFoto(caminho);
      setR((a) => {
        if (a.foto !== caminho) return a; // trocou a foto enquanto lia
        const tara = a.tara || (t.tara != null ? String(t.tara) : "");
        const bruto = a.bruto || (t.bruto != null ? String(t.bruto) : "");
        const peso = a.peso || (num(tara) > 0 && num(bruto) > 0 ? String(Math.abs(num(bruto) - num(tara))) : t.liquido != null ? String(t.liquido) : "");
        return {
          ...a, leitura: t, tara, bruto, peso,
          placa: a.placa || t.placa || "", tipo_carro: a.tipo_carro || t.tipo_carro || "",
          data: t.data && a.data === hoje() && t.data <= hoje() ? t.data : a.data,
        };
      });
      setLendo(null);
    } catch (err) {
      setLendo({ erro: String(err?.message ?? err) });
    }
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
    if (info.deTerceiros && !r.proprietario.trim()) return "Preencha o proprietário (de quem é a laranja).";
    if (info.deTerceiros && !(num(r.preco_compra) > 0)) return "Preencha o valor pago ao proprietário por tonelada.";
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
      info.deTerceiros ? `Proprietário: ${r.proprietario.trim()}` : null,
      emBags && totalBags ? `Carga: ${totalBags} bags, ${numero(kg, 0)} kg${kgPorBag ? `, ${numero(kgPorBag, 1)} kg por bag` : ""}` : null,
      talhoesEscolhidos.length > 1 ? `Talhões: ${conta.porTalhao.map((x) => `${x.talhao.nome}${emBags ? ` ${x.bags} bags` : ""}`).join(", ")}` : null,
      turmas.length > 1 ? `Turmas: ${turmas.map((k) => `${k.nome} ${k.bags} bags`).join(", ")}` : null,
      talhoesEscolhidos.length > 1 || turmas.length > 1 ? (emBags ? "peso repartido pelos bags" : "peso repartido pela área") : null,
      emBags && r.naoSei ? "CONFERIR: turma não informada" : null,
      !r.foto ? "sem foto do ticket" : null,
      r.observacao.trim() || null,
    ].filter(Boolean).join(" · ");
    // Placa, pesos da balança, comprador… (da foto ou digitados) iguais em todas as linhas.
    const sozinha = conta.linhas.length === 1;
    const ticket = {
      ...(r.leitura ?? {}), placa: r.placa.trim().toUpperCase() || null, tipo_carro: r.tipo_carro.trim() || null,
      tara: num(r.tara), bruto: num(r.bruto), liquido: kg,
    };
    if (ticket.tara == null || ticket.bruto == null) { ticket.tara = null; ticket.bruto = null; }
    const { patch: extras } = completarVenda({}, ticket, dados, { sozinha });
    // Repartido: tara e bruto ficam anotados na observação.
    const observacao = [resumo, extras.observacao].filter(Boolean).join(" · ");
    const { regs, erro: e2 } = registrosDoTicket(dados, {
      cultura, emBags, linhas: conta.linhas, data: r.data, foto: r.foto, aConferir: !aprovaDireto,
      extras: { ...extras, observacao, ...(info.deTerceiros ? { proprietario: r.proprietario.trim(), preco_compra_ton: num(r.preco_compra) } : {}) },
    });
    if (e2) { setErro(e2); return; }

    setSalvando(true);
    try {
      // Ticket novo vira aviso no sininho e notificação no ntfy.
      const salvarAvisando = salvarComAviso(salvar, { dados, email });
      for (const reg of regs) await salvarAvisando("vendas", reg);
      setSalvo({ cultura: cultura.nome, kg, talhoes: talhoesEscolhidos.map((t) => t.nome).join(", ") });
      // Próximo ticket: mesmo dia, cultura, talhões, turmas e valores; bags, peso e foto novos.
      setR((a) => ({ ...a, ...cargaNova, turmas: a.turmas.map((k) => ({ ...k, bags: "" })) }));
      setLendo(null);
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

        {info.deTerceiros && (
          <div className="form">
            <label className="campo"><span>Proprietário <em>*</em> <small>(de quem é a laranja)</small></span>
              <input value={r.proprietario} list="proprietarios" onChange={(e) => {
                // Proprietário conhecido: o valor pago da última vez já vem preenchido.
                const preco = ultimoPrecoDoProprietario(dados, e.target.value);
                mudar({ proprietario: e.target.value, ...(preco != null ? { preco_compra: String(preco) } : {}) });
              }} />
              <datalist id="proprietarios">
                {info.proprietarios.map((p) => <option key={p} value={p} />)}
              </datalist>
            </label>
            <label className="campo"><span>Valor pago ao proprietário por tonelada (R$) <em>*</em></span>
              <input type="number" inputMode="decimal" min="0" step="any" value={r.preco_compra} onChange={(e) => mudar({ preco_compra: e.target.value })} />
              {num(r.preco_compra) > 0 && kg > 0 && <small>Compra desta carga: {brl((kg / 1000) * num(r.preco_compra))}</small>}
            </label>
          </div>
        )}

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
            <div className="campo largo">
              <span>Foto do ticket</span>
              <div className="barra" style={{ marginBottom: 0 }}>
                <BotaoFoto aoTirar={escolherFoto} lado={1600} className="btn">
                  📷 {r.foto ? "Trocar a foto" : "Escolher / tirar a foto"}
                </BotaoFoto>
                {r.foto && <Foto caminho={r.foto} alt="Foto do ticket" className="miniatura-ticket" ampliar />}
                {r.foto && !lendo?.caminho && (
                  <button type="button" className="btn" onClick={() => escolherFoto(r.foto)}>Ler a foto de novo</button>
                )}
              </div>
              {!r.foto && <small>Mande a foto primeiro: placa e pesos já vêm preenchidos dela. Sem a foto o ticket entra marcado "sem foto do ticket".</small>}
              {lendo?.caminho && <small>Lendo a foto do ticket…</small>}
              {lendo?.erro && <small className="negativo">Não deu para ler a foto ({lendo.erro}). Preencha à mão.</small>}
              {r.leitura && !lendo && <small>Dados lidos da foto: confira se estão certos.</small>}
            </div>
            <label className="campo"><span>Placa</span>
              <input value={r.placa} onChange={(e) => mudar({ placa: e.target.value.toUpperCase() })} />
            </label>
            <label className="campo"><span>Tipo de carro</span>
              <input value={r.tipo_carro} list="tipos-carro" onChange={(e) => mudar({ tipo_carro: e.target.value })} />
              <datalist id="tipos-carro">
                {["Rodocaçamba", "Graneleiro", "Caçambão", "9 eixos", "Truck", "Toco"].map((t) => <option key={t} value={t} />)}
              </datalist>
            </label>
            <label className="campo"><span>Peso entrada / tara (kg)</span>
              <input type="number" inputMode="decimal" step="any" min="0" value={r.tara} onChange={(e) => mudarPesagem({ tara: e.target.value })} />
            </label>
            <label className="campo"><span>Peso saída / bruto (kg)</span>
              <input type="number" inputMode="decimal" step="any" min="0" value={r.bruto} onChange={(e) => mudarPesagem({ bruto: e.target.value })} />
            </label>
            <label className="campo"><span>Peso líquido do ticket (kg) <em>*</em></span>
              <input type="number" inputMode="decimal" step="any" min="0" value={r.peso}
                readOnly={num(r.tara) > 0 && num(r.bruto) > 0} onChange={(e) => mudar({ peso: e.target.value })} />
              {kg > 0 && <small>= {numero(kg / 1000, 3)} toneladas{kgPorBag ? ` · cada bag: ${numero(kgPorBag, 0)} kg` : ""}</small>}
              {num(r.tara) > 0 && num(r.bruto) > 0 && <small>Saída − entrada.</small>}
            </label>
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
