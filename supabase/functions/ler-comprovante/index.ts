// Lê o comprovante de pagamento (foto, print ou PDF do banco) e devolve valor,
// data, favorecido e o documento dele. Roda no Supabase (Edge Functions) e usa
// a IA do Google (Gemini), a mesma chave da função ler-ticket. Só quem está
// logado no app consegue chamar.
//
// Com { pedido: "boleto" } lê a foto de um boleto (ainda não pago) e devolve
// quem vai receber (o beneficiário) e o documento dele, nas mesmas chaves.
//
// Recebe { caminho } (o arquivo já está no bucket "comprovantes": a função
// baixa direto, sem passar pelo celular — mais rápido no 4G) ou { arquivo, tipo }
// (base64, para o que ainda está só no aparelho).
//
// Chave: a mesma GEMINI_API_KEY da ler-ticket (Edge Functions → Secrets).
// Deploy: Edge Functions → Deploy a new function → Via Editor → nome
//         ler-comprovante → colar este arquivo → Deploy
//         ou: supabase functions deploy ler-comprovante
// (opcional) MODELO_COMPROVANTE = outro modelo do Gemini (padrão: gemini-flash-lite-latest,
//            o mais rápido; ler comprovante não precisa do modelo que "pensa")

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

const PEDIDO_BOLETO = `Esta é a foto (ou parte da foto) de um boleto bancário brasileiro, ou de uma conta de luz, água, telefone ou imposto, que a fazenda vai pagar.
Responda SOMENTE com um JSON, sem texto antes ou depois, com estas chaves:
{
  "favorecido": nome de QUEM VAI RECEBER o dinheiro — o campo "Beneficiário" (ou "Cedente") do boleto, ou a empresa da conta. Nunca o "Pagador"/"Sacado" (que é a fazenda) e nunca o nome do banco, a não ser que o próprio banco seja o beneficiário,
  "documento": CNPJ ou CPF do beneficiário, se aparecer,
  "valor": valor do documento em reais, como número (R$ 1.234,56 vira 1234.56),
  "data": "AAAA-MM-DD" (vencimento),
  "tipo": "Boleto"
}
O que não conseguir ler com segurança, deixe null. Não invente.`;

const TIPOS = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"]);

const TIPO_DA_EXTENSAO: Record<string, string> = { pdf: "application/pdf", png: "image/png", webp: "image/webp", heic: "image/heic" };

function base64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Baixa o comprovante do bucket com a chave do servidor (o Supabase já a dá às funções). */
async function baixar(caminho: string) {
  if (!/^[\w\-/]+\.[a-z0-9]{2,5}$/i.test(caminho) || caminho.includes("..")) throw new Error("Caminho de comprovante inválido.");
  const url = Deno.env.get("SUPABASE_URL"), chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const r = await fetch(`${url}/storage/v1/object/comprovantes/${caminho}`, { headers: { apikey: chave!, Authorization: `Bearer ${chave}` } });
  if (!r.ok) throw new Error(`Não achei o comprovante na nuvem (${r.status}).`);
  const ext = caminho.split(".").pop()!.toLowerCase();
  return { arquivo: base64(new Uint8Array(await r.arrayBuffer())), tipo: TIPO_DA_EXTENSAO[ext] ?? "image/jpeg" };
}

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

  const corpo = await req.json().catch(() => ({}));
  let { arquivo, tipo } = corpo;
  if (!arquivo && corpo.caminho) {
    try { ({ arquivo, tipo } = await baixar(String(corpo.caminho))); } catch (e) { return json({ erro: (e as Error).message }, 400); }
  }
  if (!arquivo) return json({ erro: "Mande o comprovante." }, 400);

  const modelo = Deno.env.get("MODELO_COMPROVANTE") ?? "gemini-flash-lite-latest";
  const resposta = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": chave, "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: TIPOS.has(tipo) ? tipo : "image/jpeg", data: arquivo } },
          { text: corpo.pedido === "boleto" ? PEDIDO_BOLETO : PEDIDO },
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
