// Consulta de produto agrícola: só o princípio ativo (botão "Preencher
// princípios ativos") ou uso, dose, equivalentes e substitutos.
// Roda no Supabase (Edge Functions) e usa a IA do Google (Gemini) com pesquisa
// na internet — a mesma chave do ler-ticket. Só quem está logado no app consegue chamar.
//
// Chave:     Edge Functions → Secrets → GEMINI_API_KEY (já é a do ler-ticket)
// Criar:     Edge Functions → Deploy a new function → Via Editor
//            → nome consultar-produto → colar este arquivo → Deploy
//            ou: supabase functions deploy consultar-produto
// (opcional) MODELO_CONSULTA = outro modelo do Gemini (padrão: gemini-flash-latest)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  // Qualquer erro inesperado volta como { erro } com o motivo, para aparecer no app.
  try {
    return await atender(req);
  } catch (e) {
    return json({ erro: `Falha na função consultar-produto: ${e instanceof Error ? e.message : String(e)}` }, 500);
  }
});

async function atender(req: Request) {
  const chave = Deno.env.get("GEMINI_API_KEY");
  if (!chave) return json({ erro: "A chave da IA do Google ainda não foi configurada no Supabase (GEMINI_API_KEY)." }, 500);

  const { modo, nome, fabricante, principio_ativo, tipo } = await req.json().catch(() => ({}));
  if (!nome) return json({ erro: "Informe o nome comercial do produto." }, 400);

  // modo "principio": só o princípio ativo, numa linha (botão "Preencher princípios ativos").
  const soPrincipio = modo === "principio";
  const pedido = soPrincipio ? `Produto agrícola vendido no Brasil:
- Nome comercial: ${nome}
- Fabricante: ${fabricante || "não informado"}
- Tipo: ${tipo || "não informado"}

Pesquise na internet (de preferência AGROFIT/MAPA, bula ou ficha do fabricante) qual é o princípio ativo (ingrediente ativo) e a concentração.
Responda APENAS uma linha, sem explicação, no formato: "Princípio A 250 g/L + princípio B 50 g/L".
Se for adubo/foliar, responda os nutrientes e teores (ex.: "Manganês 10% + zinco 2%"). Se for adjuvante sem ingrediente ativo, responda "Adjuvante (" + o tipo + ")".
Se não encontrar com segurança, responda exatamente: NAO ENCONTRADO` : `Produto agrícola cadastrado na fazenda:
- Nome comercial: ${nome}
- Fabricante: ${fabricante || "não informado"}
- Princípio ativo (se souber): ${principio_ativo || "não informado"}
- Tipo: ${tipo || "não informado"}

Pesquise na internet (de preferência bula, ficha técnica do fabricante, AGROFIT/MAPA) e responda em português do Brasil, em texto simples e curto, com estas seções:
1. O QUE É — princípio ativo, concentração, formulação, classe.
2. PARA QUE SERVE — culturas e alvos (pragas, plantas daninhas, doenças ou nutrição) indicados.
3. DOSE E MODO DE USO — dose por hectare por cultura/alvo, volume de calda, época e número de aplicações, intervalo de segurança.
4. EQUIVALENTES — outros produtos comerciais com o MESMO princípio ativo e concentração.
5. SUBSTITUTOS — alternativas com outro princípio ativo para o mesmo uso.
6. CUIDADOS — classe toxicológica, EPI, carência e o que não misturar, se houver.
Se não tiver certeza de algum dado, diga que não encontrou em vez de inventar. Termine com os links das fontes. Lembre que vale o rótulo/bula e a receita do engenheiro agrônomo.`;

  const perguntar = (modelo: string, comPesquisa: boolean) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": chave, "content-type": "application/json" },
    signal: AbortSignal.timeout(25000),
    body: JSON.stringify({
      contents: [{ parts: [{ text: pedido }] }],
      ...(comPesquisa ? { tools: [{ google_search: {} }] } : {}),
      generationConfig: { temperature: 0 },
    }),
  });

  // Tenta com a pesquisa no Google e, se o limite dela acabou (429) ou o modelo
  // está sobrecarregado (503), sem pesquisa e depois com outros modelos.
  const modelos = [Deno.env.get("MODELO_CONSULTA") ?? "gemini-flash-latest", "gemini-flash-lite-latest", "gemini-2.5-flash"];
  const tentativas = modelos.flatMap((m, i) => (i === 0 ? [[m, true], [m, false]] : [[m, false]]) as [string, boolean][]);
  let resposta: Response | undefined;
  for (const [modelo, comPesquisa] of tentativas) {
    await resposta?.body?.cancel();
    try {
      resposta = await perguntar(modelo, comPesquisa);
    } catch {
      // Demorou demais ou caiu a conexão: passa para a próxima tentativa.
      resposta = undefined;
      continue;
    }
    if (![429, 500, 503].includes(resposta.status)) break;
  }

  if (!resposta) return json({ erro: "A IA do Google não respondeu a tempo. Tente de novo daqui a alguns minutos." }, 503);
  const dados = await resposta.json().catch(() => ({}));
  if (resposta.status === 503 || resposta.status === 500) {
    return json({ erro: "A IA do Google está sobrecarregada agora. Tente de novo daqui a alguns minutos." }, 503);
  }
  if (resposta.status === 429) {
    return json({ erro: `O limite gratuito da IA do Google acabou. Tente de novo mais tarde. (Google: ${dados?.error?.message ?? "sem detalhe"})` }, 429);
  }
  if (!resposta.ok) return json({ erro: dados?.error?.message ?? "A consulta falhou." }, 502);

  const texto = (dados.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("").trim();
  if (soPrincipio) {
    // Fica com a última linha (a resposta), sem aspas nem marcação.
    const linha = texto.split("\n").map((l) => l.replace(/[*"`]/g, "").trim()).filter(Boolean).pop() ?? "";
    const achou = linha && !/NAO ENCONTRADO|NÃO ENCONTRADO/i.test(linha) && linha.length <= 200;
    return json({ principio_ativo: achou ? linha : null });
  }
  return json({ texto: texto || "Não encontrei informações sobre esse produto." });
}
