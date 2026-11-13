// Lê a foto do ticket da balança e devolve os dados da pesagem (placa, pesos…).
// Roda no Supabase (Edge Functions) e usa a IA do Google (Gemini), que tem
// plano gratuito. Só quem está logado no app consegue chamar.
//
// Chave grátis: aistudio.google.com → Get API key → Create API key
// No Supabase:  Edge Functions → Secrets → GEMINI_API_KEY = a chave
// Deploy:       Edge Functions → ler-ticket → Code (colar este arquivo) → Deploy
//               ou: supabase functions deploy ler-ticket
// (opcional)    MODELO_TICKET = outro modelo do Gemini (padrão: gemini-flash-latest)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const PEDIDO = `Esta é a foto de um ticket de balança rodoviária (pesagem de caminhão) de uma venda de produção agrícola no Brasil.
Leia o ticket e responda SOMENTE com um JSON, sem texto antes ou depois, com estas chaves:
{
  "data": "AAAA-MM-DD" (dia da pesagem),
  "placa": placa do caminhão, em maiúsculas, ex. "ABC1D23",
  "tipo_carro": tipo do veículo se estiver escrito (truck, toco, carreta, bitrem, rodotrem, graneleiro…),
  "motorista": nome do motorista,
  "comprador": empresa ou cliente que comprou/recebeu a carga (destinatário),
  "produto": produto pesado,
  "peso_tara": peso do caminhão vazio (tara), em kg,
  "peso_bruto": peso do caminhão carregado (bruto), em kg,
  "peso_liquido": peso líquido (bruto − tara), em kg, antes dos descontos,
  "desconto_kg": total de descontos em kg (umidade, impureza, refugo…), se houver,
  "numero_ticket": número do ticket,
  "nota_fiscal": número da nota fiscal, se houver
}
Pesos sempre em kg e como número (sem ponto de milhar: 12.340 kg vira 12340). Se o ticket estiver em toneladas, converta para kg.
O que não conseguir ler com segurança, deixe null. Não invente.`;

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

  const { imagem } = await req.json().catch(() => ({}));
  if (!imagem) return json({ erro: "Mande a foto do ticket." }, 400);

  const modelo = Deno.env.get("MODELO_TICKET") ?? "gemini-flash-latest";
  const resposta = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": chave, "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: "image/jpeg", data: imagem } },
          { text: PEDIDO },
        ],
      }],
      generationConfig: { responseMimeType: "application/json", temperature: 0 },
    }),
  });

  const dados = await resposta.json().catch(() => ({}));
  if (resposta.status === 429) return json({ erro: "O limite gratuito da IA do Google acabou por hoje. Tente de novo mais tarde." }, 429);
  if (!resposta.ok) return json({ erro: dados?.error?.message ?? "A leitura do ticket falhou." }, 502);

  const texto = (dados.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
  const ticket = lerJson(texto);
  if (!ticket) return json({ erro: "Não consegui ler o ticket nesta foto." }, 422);
  return json({ ticket });
});
