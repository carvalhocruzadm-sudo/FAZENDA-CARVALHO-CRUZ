// Lê o comprovante de pagamento (foto, print ou PDF do banco) e devolve valor,
// data, favorecido e o documento dele. Roda no Supabase (Edge Functions) e usa
// a IA do Google (Gemini), a mesma chave da função ler-ticket. Só quem está
// logado no app consegue chamar.
//
// Chave: a mesma GEMINI_API_KEY da ler-ticket (Edge Functions → Secrets).
// Deploy: Edge Functions → Deploy a new function → Via Editor → nome
//         ler-comprovante → colar este arquivo → Deploy
//         ou: supabase functions deploy ler-comprovante
// (opcional) MODELO_TICKET = outro modelo do Gemini (padrão: gemini-flash-latest)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const PEDIDO = `Este é um comprovante de pagamento de um banco brasileiro (PIX, TED, boleto ou transferência), pago pela fazenda.
Responda SOMENTE com um JSON, sem texto antes ou depois, com estas chaves:
{
  "valor": valor pago em reais, como número (R$ 1.234,56 vira 1234.56),
  "data": "AAAA-MM-DD" (dia do pagamento),
  "favorecido": nome de QUEM RECEBEU o dinheiro (o destinatário / "Para" / beneficiário / recebedor), nunca quem pagou,
  "documento": CPF ou CNPJ de quem recebeu, se aparecer,
  "tipo": "PIX", "Boleto", "Transferência" ou "Cartão"
}
O que não conseguir ler com segurança, deixe null. Não invente.`;

const TIPOS = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"]);

/** O primeiro { … } do texto, lido como JSON. */
function lerJson(texto: string) {
  const i = texto.indexOf("{"), f = texto.lastIndexOf("}");
  if (i < 0 || f < i) return null;
  try { return JSON.parse(texto.slice(i, f + 1)); } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const chave = Deno.env.get("GEMINI_API_KEY");
  if (!chave) return json({ erro: "A chave da IA do Google ainda não foi configurada no Supabase (GEMINI_API_KEY)." }, 500);

  const { arquivo, tipo } = await req.json().catch(() => ({}));
  if (!arquivo) return json({ erro: "Mande o comprovante." }, 400);

  const modelo = Deno.env.get("MODELO_TICKET") ?? "gemini-flash-latest";
  const resposta = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": chave, "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: TIPOS.has(tipo) ? tipo : "image/jpeg", data: arquivo } },
          { text: PEDIDO },
        ],
      }],
      generationConfig: { responseMimeType: "application/json", temperature: 0 },
    }),
  });

  const dados = await resposta.json().catch(() => ({}));
  if (resposta.status === 429) return json({ erro: "O limite gratuito da IA do Google acabou por hoje. Tente de novo mais tarde." }, 429);
  if (!resposta.ok) return json({ erro: dados?.error?.message ?? "A leitura do comprovante falhou." }, 502);

  const texto = (dados.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
  const comprovante = lerJson(texto);
  if (!comprovante) return json({ erro: "Não consegui ler este comprovante." }, 422);
  return json({ comprovante });
});
