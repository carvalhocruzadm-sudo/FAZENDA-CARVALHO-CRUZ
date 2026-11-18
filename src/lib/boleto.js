/**
 * Leitura do código do boleto (linha digitável ou código de barras).
 *
 * Dois tipos:
 *   bancário    → 47 dígitos na linha digitável / 44 no código de barras.
 *                 Traz o banco, o valor e o vencimento (o "fator de vencimento").
 *   arrecadação → começa com 8 (luz, água, telefone, impostos, carnês).
 *                 48 dígitos na linha / 44 no código. Traz o valor; o
 *                 vencimento quase nunca vem no código, tem que digitar.
 *
 * A empresa (beneficiário) não vem no código: só o banco. Por isso ela é
 * digitada (com sugestões dos fornecedores cadastrados).
 */

export const BANCOS = {
  "001": "Banco do Brasil", "003": "Banco da Amazônia", "004": "Banco do Nordeste", "021": "Banestes",
  "033": "Santander", "037": "Banpará", "041": "Banrisul", "047": "Banese", "070": "BRB",
  "077": "Inter", "085": "Ailos", "104": "Caixa", "133": "Cresol", "136": "Unicred",
  "197": "Stone", "208": "BTG Pactual", "212": "Banco Original", "218": "BS2", "237": "Bradesco",
  "260": "Nubank", "290": "PagBank", "323": "Mercado Pago", "332": "Acesso", "336": "C6 Bank",
  "341": "Itaú", "380": "PicPay", "389": "Mercantil", "403": "Cora", "422": "Safra",
  "637": "Sofisa", "655": "Votorantim", "745": "Citibank", "748": "Sicredi", "756": "Sicoob",
};

const SEGMENTOS = {
  1: "Prefeitura", 2: "Água / saneamento", 3: "Energia elétrica / gás", 4: "Telefone / internet",
  5: "Órgão do governo", 6: "Carnê / empresa", 7: "Multa de trânsito", 9: "Uso do banco",
};

const soDigitos = (texto) => String(texto ?? "").replace(/\D/g, "");

/** Dígito verificador módulo 10 (pesos 2,1,2,1… da direita para a esquerda). */
function modulo10(numero) {
  let soma = 0;
  let peso = 2;
  for (let i = numero.length - 1; i >= 0; i--) {
    const p = Number(numero[i]) * peso;
    soma += p > 9 ? p - 9 : p;
    peso = peso === 2 ? 1 : 2;
  }
  return (10 - (soma % 10)) % 10;
}

/** Módulo 11 (pesos 2 a 9 da direita para a esquerda). `seZero`: o que vale quando dá 0, 10 ou 11. */
function modulo11(numero, seZero) {
  let soma = 0;
  let peso = 2;
  for (let i = numero.length - 1; i >= 0; i--) {
    soma += Number(numero[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const dv = 11 - (soma % 11);
  return dv >= 10 ? seZero : dv;
}

/**
 * Vencimento a partir do fator (dias desde 07/10/1997). O fator chegou a 9999
 * em 21/02/2025 e recomeçou em 1000; das duas datas possíveis vale a mais
 * próxima de hoje.
 */
function vencimentoDoFator(fator, hoje = new Date()) {
  if (!fator) return null;
  const base = Date.UTC(1997, 9, 7);
  const dia = 86_400_000;
  const candidatas = [base + fator * dia, base + (fator + 9000) * dia];
  const melhor = candidatas.reduce((a, b) => (Math.abs(b - hoje) < Math.abs(a - hoje) ? b : a));
  return new Date(melhor).toISOString().slice(0, 10);
}

/** Linha digitável do boleto bancário (47) → código de barras (44). */
function barrasDaLinhaBancaria(l) {
  return l.slice(0, 4) + l[32] + l.slice(33, 47) + l.slice(4, 9) + l.slice(10, 20) + l.slice(21, 31);
}

/** Código de barras bancário (44) → linha digitável (47). */
function linhaDasBarrasBancarias(b) {
  const campo1 = b.slice(0, 4) + b.slice(19, 24);
  const campo2 = b.slice(24, 34);
  const campo3 = b.slice(34, 44);
  return campo1 + modulo10(campo1) + campo2 + modulo10(campo2) + campo3 + modulo10(campo3) + b[4] + b.slice(5, 19);
}

function lerBancario(barras, linha) {
  if (linha) {
    const blocos = [[0, 9], [10, 20], [21, 31]];
    if (blocos.some(([i, f]) => modulo10(linha.slice(i, f)) !== Number(linha[f]))) {
      return { erro: "Algum número do código está errado. Confira a digitação." };
    }
  }
  if (modulo11(barras.slice(0, 4) + barras.slice(5), 1) !== Number(barras[4])) {
    return { erro: "O código não confere (dígito verificador). Confira os números." };
  }
  const valor = Number(barras.slice(9, 19)) / 100;
  const codigoBanco = barras.slice(0, 3);
  return {
    tipo: "bancario",
    barras,
    linha_digitavel: linha ?? linhaDasBarrasBancarias(barras),
    banco: BANCOS[codigoBanco] ? `${codigoBanco} – ${BANCOS[codigoBanco]}` : codigoBanco,
    valor: valor || null,
    vencimento: vencimentoDoFator(Number(barras.slice(5, 9))),
  };
}

function lerArrecadacao(barras, linha) {
  const ident = Number(barras[2]);
  const usaMod10 = ident === 6 || ident === 7;
  const dv = (n) => (usaMod10 ? modulo10(n) : modulo11(n, 0));
  if (linha) {
    for (let b = 0; b < 4; b++) {
      const bloco = linha.slice(b * 12, b * 12 + 11);
      if (dv(bloco) !== Number(linha[b * 12 + 11])) return { erro: "Algum número do código está errado. Confira a digitação." };
    }
  }
  if (dv(barras.slice(0, 3) + barras.slice(4)) !== Number(barras[3])) {
    return { erro: "O código não confere (dígito verificador). Confira os números." };
  }
  // Identificador 6 ou 8: os 11 dígitos depois do DV são o valor em centavos.
  const valor = ident === 6 || ident === 8 ? Number(barras.slice(4, 15)) / 100 : 0;
  const linhaCompleta = linha ?? [0, 1, 2, 3].map((b) => {
    const bloco = barras.slice(b * 11, b * 11 + 11);
    return bloco + dv(bloco);
  }).join("");
  return {
    tipo: "arrecadacao",
    barras,
    linha_digitavel: linhaCompleta,
    banco: `Conta de consumo / tributo — ${SEGMENTOS[barras[1]] ?? "outros"}`,
    valor: valor || null,
    vencimento: null,
  };
}

/**
 * Entende o que foi lido ou digitado. Devolve
 * { tipo, barras, linha_digitavel, banco, valor, vencimento } ou { erro }.
 */
export function lerCodigoBoleto(texto) {
  const d = soDigitos(texto);
  if (!d) return { erro: "Digite ou leia o código do boleto." };
  const arrecadacao = d[0] === "8";
  if (d.length === 44) return arrecadacao ? lerArrecadacao(d, null) : lerBancario(d, null);
  if (d.length === 48 && arrecadacao) {
    const barras = [0, 1, 2, 3].map((b) => d.slice(b * 12, b * 12 + 11)).join("");
    return lerArrecadacao(barras, d);
  }
  if (d.length === 47 && !arrecadacao) return lerBancario(barrasDaLinhaBancaria(d), d);
  return {
    erro: `O código tem ${d.length} números. Boleto de banco tem 47; conta de luz, água ou imposto tem 48.`,
  };
}

/** Linha digitável com os espaços e pontos de costume, para mostrar na tela. */
export function formatarLinha(linha) {
  const d = soDigitos(linha);
  if (d.length === 47) {
    return `${d.slice(0, 5)}.${d.slice(5, 10)} ${d.slice(10, 15)}.${d.slice(15, 21)} ${d.slice(21, 26)}.${d.slice(26, 32)} ${d[32]} ${d.slice(33)}`;
  }
  if (d.length === 48) return [0, 1, 2, 3].map((b) => `${d.slice(b * 12, b * 12 + 11)}-${d[b * 12 + 11]}`).join(" ");
  return linha;
}

const moedaBR = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "sem data");

/**
 * O mesmo boleto já foi lançado? Procura o código na programação de
 * pagamentos e nas entradas do depósito que ainda esperam aprovação.
 * Devolve uma frase dizendo onde está (ou null). `ignorar`: o próprio
 * registro que está sendo editado ({ boleto, entrada }); `soBoletos` olha só
 * a programação (a entrada do depósito vira boleto justamente ao aprovar).
 */
export function boletoJaLancado(dados, linha, ignorar = {}, soBoletos = false) {
  const d = soDigitos(linha);
  if (!d || !dados) return null;
  const b = (dados.boletos ?? []).find((x) => x.id !== ignorar.boleto && soDigitos(x.linha_digitavel) === d);
  if (b) {
    const situacao = b.pago ? `já PAGO${b.data_pagamento ? ` em ${dataBR(b.data_pagamento)}` : ""}` : "ainda a pagar";
    return `já está na Programação de pagamentos: ${b.empresa || "sem empresa"}, ${moedaBR.format(Number(b.valor) || 0)}, vence ${dataBR(b.vencimento)} — ${situacao}.`;
  }
  if (soBoletos) return null;
  const e = (dados.insumo_entradas ?? []).find((x) => x.id !== ignorar.entrada && !x.boleto_id && soDigitos(x.linha_digitavel) === d);
  if (e) return `já foi lançado no depósito em ${dataBR(e.data)}${e.a_conferir ? ", esperando aprovação no escritório" : ""}.`;
  return null;
}

/**
 * Códigos de boleto válidos dentro de um texto. Junta os números de cada
 * trecho (pontos, espaços e traços entre eles valem) e testa janelas de 47 e
 * 48 dígitos: só passa o que bate com os dígitos verificadores. O código de
 * barras (44) só vale sozinho no trecho: ele tem um dígito verificador só, e
 * uma janela qualquer de números passaria por acaso.
 */
export function codigosNoTexto(texto) {
  const achados = [];
  const guardar = (lido) => {
    if (!lido.erro && !achados.some((a) => a.barras === lido.barras)) achados.push(lido);
    return !lido.erro;
  };
  for (const trecho of String(texto ?? "").split(/[^\d.\s-]+/)) {
    const d = trecho.replace(/\D/g, "");
    if (d.length === 44) { guardar(lerCodigoBoleto(d)); continue; }
    // O código começa e termina onde um número termina (antes de um espaço,
    // ponto ou traço): não vale um pedaço do meio de outro número.
    const corte = new Set([0, d.length]);
    let n = 0;
    for (let i = 0; i < trecho.length; i++) {
      if (/\d/.test(trecho[i])) n++;
      else corte.add(n);
    }
    for (let i = 0; i + 47 <= d.length; i++) {
      if (!corte.has(i)) continue;
      // Achou um: pula os números dele (a janela vizinha não é outro boleto).
      if (corte.has(i + 47) && guardar(lerCodigoBoleto(d.slice(i, i + 47)))) i += 46;
      else if (corte.has(i + 48) && guardar(lerCodigoBoleto(d.slice(i, i + 48)))) i += 47;
    }
  }
  return achados;
}

/**
 * Lançamentos repetidos na Programação de pagamentos — para não pagar duas vezes.
 *
 * Dois pagamentos parecem o mesmo quando:
 *   • têm o mesmo código de boleto (certeza);
 *   • têm o mesmo valor e o mesmo vencimento — a descrição não importa, porque
 *     o mesmo boleto lançado pelo WhatsApp, pelo PDF e à mão vem com descrições
 *     diferentes (e às vezes com o nome da empresa escrito de outro jeito); ou
 *   • têm a mesma empresa e o mesmo valor com vencimentos até 5 dias de distância
 *     (vencimento digitado errado num dos dois).
 *
 * Não contam: dois boletos com códigos diferentes; parcelas diferentes da mesma
 * conta ("(1/12)" e "(2/12)", "parcela 1" e "parcela 2"); e os que alguém já
 * marcou como "não é repetido" (os dois do par marcados).
 *
 * Só mostra os grupos com algum ainda a pagar (os já pagos não têm mais o que evitar).
 * Devolve [{ chave, motivo, itens: [boleto, …] }], o mais perto de vencer primeiro.
 */
export function pagamentosRepetidos(boletos) {
  const texto = (t) => String(t ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const centavos = (v) => Math.round((Number(v) || 0) * 100);
  const dias = (a, b) => Math.abs((Date.parse(a) - Date.parse(b)) / 86400000);
  const lista = (boletos ?? []).filter((b) => b && b.id && b.vencimento && centavos(b.valor) > 0);

  // Palavras que não dizem quem é a empresa.
  const GENERICAS = new Set(["ltda", "eireli", "epp", "me", "sa", "s", "a", "de", "da", "do", "das", "dos", "e", "comercio", "industria",
    "servicos", "cia", "produtos", "pagamento", "boleto", "pix", "receita", "federal", "banco", "caixa", "economica"]);
  const palavras = (t) => new Set(texto(t).split(" ").filter((p) => p.length >= 3 && !GENERICAS.has(p)));
  const mesmaEmpresa = (a, b) => {
    const n1 = texto(a.empresa);
    const n2 = texto(b.empresa);
    if (!n1 || !n2) return false;
    if (n1 === n2 || n1.includes(n2) || n2.includes(n1)) return true;
    const p2 = palavras(b.empresa);
    return [...palavras(a.empresa)].some((p) => p2.has(p));
  };
  // "(3/12)", "parcela 3", "3ª parcela" → "3/12" ou "3".
  const parcela = (t) => {
    const s = String(t ?? "").toLowerCase();
    const m = s.match(/\((\d+)\s*\/\s*(\d+)\)/) || s.match(/parcela\s*(\d+)(?:\s*\/\s*(\d+))?/) || s.match(/(\d+)\s*[ªa]?\s*parcela/);
    return m ? `${Number(m[1])}/${m[2] ?? ""}` : null;
  };

  /** Por que `a` e `b` parecem o mesmo pagamento (ou null). */
  const motivoDoPar = (a, b) => {
    const c1 = soDigitos(a.linha_digitavel);
    const c2 = soDigitos(b.linha_digitavel);
    const temCodigo = c1.length >= 44 && c2.length >= 44;
    if (temCodigo && c1 === c2) return "codigo";
    if (temCodigo) return null;
    if (a.nao_repetido && b.nao_repetido) return null;
    if (centavos(a.valor) !== centavos(b.valor)) return null;
    const p1 = parcela(a.descricao);
    const p2 = parcela(b.descricao);
    if (p1 && p2 && p1 !== p2) return null;
    if (a.vencimento === b.vencimento) return mesmaEmpresa(a, b) ? "empresa" : "valor";
    if (dias(a.vencimento, b.vencimento) <= 5 && mesmaEmpresa(a, b)) return "perto";
    return null;
  };

  // Junta quem é igual: A=B e B=C viram um grupo só.
  const pai = new Map(lista.map((b) => [b.id, b.id]));
  const raiz = (id) => (pai.get(id) === id ? id : raiz(pai.get(id)));
  const motivos = new Map();
  const FORCA = { codigo: 4, empresa: 3, perto: 2, valor: 1 };

  const porValor = new Map();
  for (const b of lista) {
    const mesmoValor = porValor.get(centavos(b.valor)) ?? [];
    for (const outro of mesmoValor) {
      const motivo = motivoDoPar(b, outro);
      if (!motivo) continue;
      pai.set(raiz(b.id), raiz(outro.id));
      for (const id of [b.id, outro.id]) if ((FORCA[motivos.get(id)] ?? 0) < FORCA[motivo]) motivos.set(id, motivo);
    }
    mesmoValor.push(b);
    porValor.set(centavos(b.valor), mesmoValor);
  }
  // O mesmo código com valor diferente (um dos dois digitado errado) também é repetido.
  const porCodigo = new Map();
  for (const b of lista) {
    const c = soDigitos(b.linha_digitavel);
    if (c.length < 44) continue;
    const igual = porCodigo.get(c);
    if (igual) {
      pai.set(raiz(b.id), raiz(igual.id));
      motivos.set(b.id, "codigo");
      motivos.set(igual.id, "codigo");
    } else porCodigo.set(c, b);
  }

  const grupos = new Map();
  for (const b of lista) {
    const r = raiz(b.id);
    if (!grupos.has(r)) grupos.set(r, []);
    grupos.get(r).push(b);
  }
  return [...grupos.entries()]
    .filter(([, itens]) => itens.length > 1 && itens.some((b) => !b.pago))
    .map(([chave, itens]) => ({
      chave,
      motivo: itens.map((b) => motivos.get(b.id)).sort((x, y) => (FORCA[y] ?? 0) - (FORCA[x] ?? 0))[0],
      itens: itens.sort((a, b) => Number(Boolean(b.pago)) - Number(Boolean(a.pago)) || String(a.vencimento).localeCompare(String(b.vencimento))),
    }))
    .sort((a, b) => String(a.itens[0].vencimento).localeCompare(String(b.itens[0].vencimento)));
}
