// Lê a foto do ticket da balança e devolve os dados da pesagem (placa, pesos…).
// Roda no Supabase (Edge Functions), com a mesma chave da Anthropic da
// consulta de produto. Só quem está logado no app consegue chamar.
//
// Deploy:  supabase functions deploy ler-ticket
// Chave:   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   (a mesma da consulta de produto)
// (opcional) supabase secrets set MODELO_TICKET=claude-sonnet-5-5

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

  const chave = Deno.env.get("ANTHROPIC_API_KEY");
  if (!chave) return json({ erro: "A chave da IA ainda não foi configurada no Supabase (ANTHROPIC_API_KEY)." }, 500);

  const { imagem } = await req.json().catch(() => ({}));
  if (!imagem) return json({ erro: "Mande a foto do ticket." }, 400);

  const resposta = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("MODELO_TICKET") ?? "claude-sonnet-5-5",
      max_tokens: 800,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imagem } },
          { type: "text", text: PEDIDO },
        ],
      }],
    }),
  });

  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) return json({ erro: dados?.error?.message ?? "A leitura do ticket falhou." }, 502);

  const texto = (dados.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
  const ticket = lerJson(texto);
  if (!ticket) return json({ erro: "Não consegui ler o ticket nesta foto." }, 422);
  return json({ ticket });
});
