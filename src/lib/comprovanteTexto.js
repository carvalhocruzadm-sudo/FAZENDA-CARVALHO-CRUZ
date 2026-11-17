/**
 * Entende o TEXTO de um comprovante de pagamento (o PDF que o banco gera):
 * valor, data e favorecido. Sem dependências, para dar
 * para testar fácil.
 *
 * Duas regras de segurança: primeiro só vale o que vem com rótulo ("Valor",
 * "Data do pagamento", "Favorecido"…); se não houver rótulo, só vale quando a
 * informação aparece UMA vez no comprovante (um único "R$ 923,00", uma única
 * data). Comprovante tem vários números (tarifa, saldo, juros) — chutar o errado
 * é pior que deixar o campo vazio. Campo não achado volta `null`.
 */

const NUMERO = "(\\d{1,3}(?:\\.\\d{3})*,\\d{2})";

const MESES = {
  janeiro: 1, fevereiro: 2, marco: 3, março: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

const paraNumero = (s) => Number(s.replace(/\./g, "").replace(",", "."));

const dataIso = (d, m, a) => {
  const dia = Number(d);
  const mes = Number(m);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return `${a}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
};

/** O OCR troca o "$" de "R$" por S, 5 ou 8 e junta ou separa as letras: volta tudo a "R$ ". */
function normalizar(texto) {
  return texto
    .replace(/\s+/g, " ")
    .replace(/\bR\s?[S5$8]\s*(?=\d)/gi, "R$ ");
}

function acharValor(t) {
  // Do rótulo mais específico para o mais genérico.
  const prioridades = [
    /(?:valor\s+(?:total|pago|do pagamento|da transfer[eê]ncia|da opera[cç][aã]o|debitado|transferido|l[ií]quido)|total\s+pago|total\s+debitado)\s*[:-]?\s*(?:R\$)?\s*NUMERO/gi,
    /\bvalor(?:\s+nominal|\s+a pagar)?\s*[:-]?\s*(?:R\$)?\s*NUMERO/gi,
  ];
  for (const modelo of prioridades) {
    const re = new RegExp(modelo.source.replace("NUMERO", NUMERO), "gi");
    for (const m of t.matchAll(re)) {
      const v = paraNumero(m[1]);
      if (v > 0) return v;
    }
  }
  // Sem rótulo: vale um único valor em reais diferente de zero.
  const soltos = new Set();
  for (const m of t.matchAll(new RegExp(`R\\$\\s*${NUMERO}`, "g"))) {
    const v = paraNumero(m[1]);
    if (v > 0) soltos.add(v);
  }
  return soltos.size === 1 ? [...soltos][0] : null;
}

function acharData(t) {
  const rotulada = t.match(/(?:data(?: do pagamento| da transfer[eê]ncia| de pagamento| da opera[cç][aã]o| de d[eé]bito| da transa[cç][aã]o| de efetiva[cç][aã]o)?|pago em|efetivad[oa] em|d[eé]bito em)\s*[:-]?\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/i);
  if (rotulada) {
    const iso = dataIso(rotulada[1], rotulada[2], rotulada[3]);
    if (iso) return iso;
  }
  const porExtenso = t.match(/(\d{1,2}) de ([a-zç]+) de (\d{4})/i);
  if (porExtenso && MESES[porExtenso[2].toLowerCase()]) {
    const iso = dataIso(porExtenso[1], MESES[porExtenso[2].toLowerCase()], porExtenso[3]);
    if (iso) return iso;
  }
  // Sem rótulo: vale uma única data no comprovante.
  const datas = new Set();
  for (const m of t.matchAll(/\b(\d{2})\/(\d{2})\/(\d{4})\b/g)) {
    const iso = dataIso(m[1], m[2], m[3]);
    if (iso) datas.add(iso);
  }
  return datas.size === 1 ? [...datas][0] : null;
}

function acharFavorecido(t) {
  // Com rótulo: o nome vai até o próximo rótulo ("Tarifa:", "CNPJ", "Valor"…) ou o fim.
  const rotulado = t.match(/(?:favorecido|benefici[aá]rio|recebedor|destinat[aá]rio|nome do recebedor|raz[aã]o social)\s*[:-]?\s*([A-ZÀ-Ú0-9][^:]{2,60}?)(?=\s+[A-Za-zÀ-ú]+\s*:|\s+(?:CPF|CNPJ|Ag[eê]ncia|Banco|Chave|Institui[cç][aã]o|Conta|Valor|Data|Autentica|Tipo)|$)/i);
  if (rotulado) return rotulado[1].trim();
  // Pix: "Para" seguido do nome em maiúsculas (parar na primeira palavra que não for).
  const pix = t.match(/\bPara\s*:?\s+((?:[A-ZÀ-Ú0-9&.'-]{2,}(?:\s|$)){1,8})/);
  // O CPF/CNPJ costuma vir logo depois do nome, também em maiúsculas.
  return pix ? pix[1].replace(/\s(?:CPF|CNPJ|CHAVE|AG[EÊ]NCIA|CONTA|BANCO)\b.*$/, "").trim() || null : null;
}

/** Devolve `{ valor, data, favorecido }`; cada campo não achado é `null`. */
export function interpretarComprovante(texto) {
  const t = normalizar(String(texto ?? ""));
  return { valor: acharValor(t), data: acharData(t), favorecido: acharFavorecido(t) };
}
