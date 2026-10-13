/**
 * Lê a planilha de contatos exportada do Bling (Contatos → Exportar, CSV
 * separado por ";") e transforma em registros da coleção `contatos`.
 *
 * Quem já está cadastrado é atualizado em vez de duplicado: procura pelo
 * código do Bling, depois pelo CNPJ/CPF e, sem documento, pelo nome.
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
const chaveNome = (v) => (v ?? "").trim().toUpperCase();

function tipoDoBling(tipo) {
  const t = (tipo ?? "").toLowerCase();
  if (t.includes("fornecedor")) return "fornecedor";
  // Sem tipo no Bling são os clientes antigos (com código e e-mail da NF-e).
  if (!t || t.includes("cliente")) return "cliente";
  return "outro";
}

function cepFormatado(v) {
  const d = soDigitos(v);
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : limpo(v);
}

/**
 * Devolve { registros, ignorados }: `registros` já vêm com o `id` de quem
 * existia (para atualizar) e `ignorados` lista o que não deu para importar.
 */
export function contatosDoBling(texto, existentes) {
  const [cab, ...linhas] = lerCSV(texto);
  if (!cab) throw new Error("A planilha está vazia.");
  const col = Object.fromEntries(cab.map((nome, i) => [nome.trim(), i]));
  if (col["Nome"] == null || col["CNPJ / CPF"] == null) {
    throw new Error("Não parece a planilha de contatos do Bling (faltam as colunas Nome e CNPJ / CPF).");
  }
  const v = (l, nome) => limpo(l[col[nome]]);

  const porBling = new Map(existentes.filter((c) => c.id_bling).map((c) => [c.id_bling, c]));
  const porDoc = new Map(existentes.filter((c) => soDigitos(c.documento)).map((c) => [soDigitos(c.documento), c]));
  const porNome = new Map(existentes.map((c) => [chaveNome(c.nome), c]));

  const registros = [], ignorados = [];
  for (const l of linhas) {
    const nome = v(l, "Nome");
    const documento = v(l, "CNPJ / CPF");
    if (!nome) continue;
    if (!documento && /consumidor final/i.test(nome)) { ignorados.push(nome); continue; }

    const tipoBling = v(l, "Tipo contato");
    const tipo = tipoDoBling(tipoBling);
    const fones = [...new Set([v(l, "Fone"), v(l, "Celular")].filter(Boolean))];
    const endereco = [
      [v(l, "Endereço"), v(l, "Número")].filter(Boolean).join(", "),
      v(l, "Complemento"), v(l, "Bairro"),
    ].filter(Boolean).join(" · ");
    const obs = [
      tipo === "outro" ? [...new Set(tipoBling.split(";"))].join(", ") : null,
      v(l, "Observações"),
    ].filter(Boolean).join(" · ");
    const ie = v(l, "IE / RG");

    const idBling = v(l, "ID");
    const atual = (idBling && porBling.get(idBling))
      || (soDigitos(documento) && porDoc.get(soDigitos(documento)))
      || (!documento && porNome.get(chaveNome(nome)));

    registros.push({
      ...(atual ?? {}),
      nome,
      fantasia: v(l, "Fantasia") && v(l, "Fantasia") !== nome ? v(l, "Fantasia") : atual?.fantasia ?? null,
      tipo,
      pessoa: /f[ií]sica/i.test(v(l, "Tipo pessoa") ?? "") ? "fisica" : "juridica",
      documento,
      inscricao_estadual: ie ?? (v(l, "IE isento") === "S" ? "ISENTO" : null),
      telefone: fones.join(" / ") || null,
      email: v(l, "E-mail") ?? v(l, "E-mail para envio NFe"),
      endereco: endereco || null,
      cidade: v(l, "Cidade"),
      uf: v(l, "UF"),
      cep: cepFormatado(v(l, "CEP")),
      ativo: !/inativo|exclu/i.test(v(l, "Situação") ?? ""),
      observacao: obs || atual?.observacao || null,
      id_bling: idBling,
    });
  }
  return { registros, ignorados };
}
