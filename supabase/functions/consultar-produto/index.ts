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

  const modelo = Deno.env.get("MODELO_CONSULTA") ?? "gemini-flash-latest";
  const resposta = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": chave, "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: pedido }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0 },
    }),
  });

  const dados = await resposta.json().catch(() => ({}));
  if (resposta.status === 429) return json({ erro: "O limite gratuito da IA do Google acabou por hoje. Tente de novo mais tarde." }, 429);
  if (!resposta.ok) return json({ erro: dados?.error?.message ?? "A consulta falhou." }, 502);

  const texto = (dados.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("").trim();
  if (soPrincipio) {
    // Fica com a última linha (a resposta), sem aspas nem marcação.
    const linha = texto.split("\n").map((l) => l.replace(/[*"`]/g, "").trim()).filter(Boolean).pop() ?? "";
    const achou = linha && !/NAO ENCONTRADO|NÃO ENCONTRADO/i.test(linha) && linha.length <= 200;
    return json({ principio_ativo: achou ? linha : null });
  }
  return json({ texto: texto || "Não encontrei informações sobre esse produto." });
});
