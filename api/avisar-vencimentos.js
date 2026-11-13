/**
 * Avisos de contas a pagar, por notificação no celular.
 *
 * O Vercel chama esta função toda manhã (o horário está em vercel.json):
 *  - aviso do dia: as contas que vencem hoje;
 *  - aviso da semana: na primeira manhã de cada semana (segunda-feira), o que
 *    vence até domingo e o que já está vencido.
 * Chamar de novo no mesmo dia não repete o aviso.
 *
 * O botão "Enviar um aviso de teste" do Painel também cai aqui (POST com o
 * login de quem clicou): manda o aviso da semana só para aquele aparelho.
 */
import { FALTA_CONFIGURAR, banco, enviar } from "./_push.js";
import { avisoDaSemana, avisoDoDia, contasEmAberto, hojeEmBrasilia, horaEmBrasilia, segundaDaSemana, somarDias } from "./_vencimentos.js";

async function lerContas(db, hoje) {
  const ate = somarDias(segundaDaSemana(hoje), 6);
  const [despesas, entradas, insumos] = await Promise.all([
    db.from("despesas").select("descricao, tipo, categoria, favorecido, valor, vencimento, pago").not("vencimento", "is", null).lte("vencimento", ate).or("pago.is.null,pago.eq.false"),
    db.from("insumo_entradas").select("insumo_id, fornecedor, valor, vencimento, pago").not("vencimento", "is", null).lte("vencimento", ate).eq("pago", false),
    db.from("insumos").select("id, nome"),
  ]);
  const erro = despesas.error ?? entradas.error ?? insumos.error;
  if (erro) throw new Error(erro.message);
  return contasEmAberto({ despesas: despesas.data, insumo_entradas: entradas.data, insumos: insumos.data });
}

async function teste(req, res, db, hoje) {
  const token = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  const { data: quem } = await db.auth.getUser(token);
  if (!quem?.user) return res.status(401).json({ erro: "Entre no sistema de novo para testar." });
  const endpoint = req.body?.endpoint;
  const { data: inscricoes } = await db.from("push_inscricoes").select("endpoint, chaves").eq("endpoint", endpoint ?? "");
  if (!inscricoes?.length) return res.status(404).json({ erro: "Este aparelho ainda não está com as notificações ligadas." });
  const aviso = avisoDaSemana(await lerContas(db, hoje), hoje, { sempre: true });
  const r = await enviar(inscricoes, [{ ...aviso, titulo: `Teste — ${aviso.titulo}`, tag: "teste" }]);
  if (!r.enviados) return res.status(502).json({ erro: r.erros[0] || "O aparelho não aceitou o aviso. Desligue e ligue as notificações de novo." });
  return res.status(200).json({ ok: true });
}

export default async function handler(req, res) {
  if (FALTA_CONFIGURAR) return res.status(500).json({ erro: FALTA_CONFIGURAR });
  try {
    const db = banco();
    const hoje = hojeEmBrasilia();
    if (req.method === "POST") return await teste(req, res, db, hoje);

    // Com CRON_SECRET cadastrado, só o agendador do Vercel dispara. Sem ele,
    // ao menos ninguém de fora consegue adiantar o aviso para a madrugada.
    const segredo = process.env.CRON_SECRET;
    if (segredo ? req.headers.authorization !== `Bearer ${segredo}` : horaEmBrasilia() < 6) {
      return res.status(401).json({ erro: "Não autorizado." });
    }

    await db.from("push_config").upsert({ id: 1 }, { onConflict: "id", ignoreDuplicates: true });
    const { data: config, error } = await db.from("push_config").select("ultimo_dia, ultima_semana").eq("id", 1).single();
    if (error) throw new Error(`Tabela push_config: ${error.message}. Rode de novo o supabase/schema.sql no Supabase.`);
    if (config.ultimo_dia >= hoje) return res.status(200).json({ ok: true, situacao: "já avisado hoje" });

    const segunda = segundaDaSemana(hoje);
    const semanaNova = !config.ultima_semana || config.ultima_semana < segunda;
    // Marca antes de enviar: se duas chamadas chegarem juntas, só uma passa daqui.
    const { data: marcou } = await db.from("push_config").update({ ultimo_dia: hoje, ultima_semana: segunda })
      .eq("id", 1).or(`ultimo_dia.is.null,ultimo_dia.lt.${hoje}`).select("id");
    if (!marcou?.length) return res.status(200).json({ ok: true, situacao: "já avisado hoje" });

    const contas = await lerContas(db, hoje);
    const avisos = [semanaNova && avisoDaSemana(contas, hoje), avisoDoDia(contas, hoje)].filter(Boolean);
    if (!avisos.length) return res.status(200).json({ ok: true, situacao: "nada vencendo" });

    const { data: inscricoes, error: erroInsc } = await db.from("push_inscricoes").select("endpoint, chaves");
    if (erroInsc) throw new Error(erroInsc.message);
    const r = await enviar(inscricoes, avisos);
    return res.status(200).json({ ok: true, avisos: avisos.length, aparelhos: inscricoes.length, ...r });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
