/**
 * Lê a planilha de contatos exportada do Bling (Contatos → Exportar, CSV
 * separado por ";") e transforma os clientes em registros de `compradores`.
 * Fornecedores e outros contatos (contador…) ficam de fora.
 *
 * Quem já está cadastrado é atualizado em vez de duplicado: procura pelo
 * CNPJ/CPF e, sem documento, pelo nome.
 */

/** Separa o CSV em linhas e colunas, respeitando aspas ("a;b" é uma coluna só). */
function lerCSV(texto) {
  const linhas = [];
  let linha = [], valor = "", aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { valor += '"'; i++; }
      else if (c === '"') aspas = false;
      else valor += c;
    } else if (c === '"') aspas = true;
    else if (c === ";") { linha.push(valor); valor = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(valor); valor = "";
      if (linha.some((v) => v.trim())) linhas.push(linha);
      linha = [];
    } else valor += c;
  }
  linha.push(valor);
  if (linha.some((v) => v.trim())) linhas.push(linha);
  return linhas;
}

/** O Bling às vezes exporta em UTF-8, às vezes no formato antigo do Windows. */
export async function textoDoArquivo(arquivo) {
  const bytes = await arquivo.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

const limpo = (v) => (v ?? "").trim() || null;
const soDigitos = (v) => (v ?? "").replace(/\D/g, "");
const chaveNome = (v) => (v ?? "").trim().toLowerCase();

/** Sem tipo no Bling são os clientes antigos (com código e e-mail da NF-e). */
const ehCliente = (tipo) => !tipo || /cliente/i.test(tipo);

function cepFormatado(v) {
  const d = soDigitos(v);
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : limpo(v);
}

/**
 * Devolve { registros, ignorados, fornecedores }: `registros` já vêm com o
 * `id` de quem existia (para atualizar), `ignorados` lista o que não deu para
 * importar e `fornecedores` conta os contatos que não são clientes.
 */
export function compradoresDoBling(texto, existentes) {
  const [cab, ...linhas] = lerCSV(texto);
  if (!cab) throw new Error("A planilha está vazia.");
  const col = Object.fromEntries(cab.map((nome, i) => [nome.trim(), i]));
  if (col["Nome"] == null || col["CNPJ / CPF"] == null) {
    throw new Error("Não parece a planilha de contatos do Bling (faltam as colunas Nome e CNPJ / CPF).");
  }
  const v = (l, nome) => limpo(l[col[nome]]);

  const porDoc = new Map(existentes.filter((c) => soDigitos(c.documento)).map((c) => [soDigitos(c.documento), c]));
  const porNome = new Map(existentes.map((c) => [chaveNome(c.nome), c]));

  const registros = [], ignorados = [];
  let fornecedores = 0;
  for (const l of linhas) {
    const razao = v(l, "Nome");
    if (!razao) continue;
    if (!ehCliente(v(l, "Tipo contato"))) { fornecedores++; continue; }
    const documento = v(l, "CNPJ / CPF");
    if (!documento) { ignorados.push(razao); continue; }

    const atual = porDoc.get(soDigitos(documento)) || porNome.get(chaveNome(razao));
    // O nome é o que se escreve no campo Comprador da venda: quem já existe
    // mantém o dele; o novo usa o nome fantasia (mais curto) ou a razão social.
    let nome = atual?.nome ?? v(l, "Fantasia") ?? razao;
    // Duas filiais com o mesmo nome fantasia: o bairro diferencia.
    if (!atual && registros.some((r) => chaveNome(r.nome) === chaveNome(nome))) nome = `${nome} (${v(l, "Bairro") ?? v(l, "Cidade")})`;

    const ie = v(l, "IE / RG");
    const fisica = /f[ií]sica/i.test(v(l, "Tipo pessoa") ?? "");
    const contribuinte = ie && !fisica ? "1" : v(l, "IE isento") === "S" ? "2" : fisica ? "9" : atual?.contribuinte ?? "9";

    registros.push({
      ...(atual ?? {}),
      nome,
      razao_social: razao !== nome ? razao : null,
      tipo_pessoa: fisica ? "F" : "J",
      documento,
      contribuinte,
      ie: contribuinte === "1" ? ie : null,
      email: v(l, "E-mail para envio NFe") ?? v(l, "E-mail") ?? atual?.email ?? null,
      telefone: [...new Set([v(l, "Fone"), v(l, "Celular")].filter(Boolean))].join(" / ") || atual?.telefone || null,
      cep: cepFormatado(v(l, "CEP")),
      endereco: v(l, "Endereço"),
      numero: v(l, "Número") ?? "S/N",
      complemento: v(l, "Complemento"),
      bairro: v(l, "Bairro"),
      municipio: v(l, "Cidade"),
      uf: v(l, "UF"),
      ativo: !/inativo|exclu/i.test(v(l, "Situação") ?? ""),
      observacao: atual?.observacao ?? null,
    });
  }
  return { registros, ignorados, fornecedores };
}
