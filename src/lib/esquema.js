/**
 * Esquema de dados da fazenda — uma entrada por tabela.
 *
 * Cada coleção aqui vira: uma tabela no Supabase (mesmo nome, mesmas colunas,
 * ver supabase/schema.sql), uma store no IndexedDB e uma tela de cadastro com
 * lista, busca e formulário. As chaves dos objetos são os nomes das colunas,
 * então não existe tradução entre o app e o banco.
 *
 * Tipos de campo:
 *   texto · textoLongo · numero · dinheiro · data · booleano
 *   fotos    → lista de fotos (comprimidas, guardadas no próprio registro)
 *   opcoes   → lista fixa (`opcoes: [[valor, rótulo], …]`)
 *   sugestao → texto livre com sugestões (dá para criar uma categoria nova)
 *   ref      → aponta para outra coleção (`colecao`, `filtro` opcional)
 *
 * `calcular(reg, dados)` roda antes de gravar e preenche o que é conta
 * (horas trabalhadas, valor total…). `aoMudar` preenche um campo a partir de
 * outro enquanto se digita (escolher o talhão já traz a cultura dele).
 */

export const hoje = () => new Date().toISOString().slice(0, 10);

const num = (v) => Number(v) || 0;

export const FUNCOES = [
  "Gerente", "Tratorista", "Trabalhador de campo", "Motorista", "Secretária",
  "Operador de máquinas", "Vaqueiro", "Mecânico",
];

/** As mesmas colunas da planilha FINANCEIRO. */
export const CATEGORIAS_DESPESA = [
  "Alimentação", "Produtos químicos", "Adubos", "Sementes", "Peças", "Serviços",
  "Combustíveis", "Salários", "Taxas", "Benfeitorias", "Investimentos",
  "Arrendamentos", "Empréstimos", "Retirada / dividendos", "Fretes", "Compra de laranja", "Cartão de crédito", "Outros",
];

export const FORMAS_PAGAMENTO = ["PIX", "Boleto", "Cartão", "Dinheiro", "Transferência", "Cheque"];

export const FASES = [
  "Pré-plantio / dessecação", "Plantio (adubação, TS, semente)", "Herbicida",
  "1ª cobertura", "1ª pulverização", "2ª cobertura", "2ª pulverização",
  "3ª pulverização", "Colheita", "Operacional",
];

/** Unidades de preço de venda e quantos kg cabem em cada uma. */
export const UNIDADES_VENDA = [
  ["t", "Tonelada", 1000], ["kg", "Quilo", 1], ["sc60", "Saca 60 kg", 60],
  ["arroba", "Arroba (15 kg)", 15], ["saco", "Saco (silagem)", null],
  ["caixa", "Caixa", null], ["unidade", "Unidade", null], ["cabeca", "Cabeça", null],
];
const KG_POR_UNIDADE = Object.fromEntries(UNIDADES_VENDA.map(([v, , kg]) => [v, kg]));

export const TIPOS_INSUMO = [
  ["herbicida", "Herbicida"], ["inseticida", "Inseticida"], ["fungicida", "Fungicida"],
  ["adubo", "Adubo / fertilizante"], ["foliar", "Foliar"], ["semente", "Semente / muda"],
  ["corretivo", "Calcário / corretivo"], ["racao", "Ração / sal mineral"],
  ["medicamento", "Medicamento veterinário"], ["outro", "Outro"],
];

export const OPERACOES = [
  "Gradagem", "Aração", "Subsolagem", "Plantio", "Pulverização", "Adubação",
  "Roçagem", "Colheita", "Ensilagem", "Transporte", "Distribuição de ração",
  "Terraplanagem", "Serviço geral",
];

const refTalhao = { tipo: "ref", colecao: "talhoes", rotulo: "Talhão" };
const refCultura = { tipo: "ref", colecao: "culturas", rotulo: "Cultura" };

/** Escolher o talhão traz a cultura que está nele. */
const culturaDoTalhao = {
  talhao_id: (reg, dados) => {
    const t = dados.talhoes.find((x) => x.id === reg.talhao_id);
    return t?.cultura_id ? { cultura_id: t.cultura_id } : {};
  },
};

export const ESQUEMA = {
  // ─── Cadastros ────────────────────────────────────────────────────────────
  culturas: {
    titulo: "Culturas", singular: "cultura", icone: "cultura",
    descricao: "Milho, laranja, abóbora, confinamento… Cadastre aqui cada cultura nova.",
    campos: {
      nome: { tipo: "texto", rotulo: "Nome", obrigatorio: true },
      tipo: { tipo: "opcoes", rotulo: "Tipo", opcoes: [["agricola", "Agrícola"], ["pecuaria", "Pecuária"]], padrao: "agricola" },
      unidade: { tipo: "opcoes", rotulo: "Unidade de venda", opcoes: UNIDADES_VENDA.map(([v, r]) => [v, r]), padrao: "t" },
      ativo: { tipo: "booleano", rotulo: "Ativa", padrao: true },
      observacao: { tipo: "textoLongo", rotulo: "Observação" },
    },
    colunas: ["nome", "tipo", "unidade", "ativo"],
    ordem: (a, b) => a.nome.localeCompare(b.nome),
    resumo: (r) => r.nome,
  },

  fazendas: {
    titulo: "Fazendas", singular: "fazenda", icone: "casa",
    descricao: "Triunfo/Juerana, São Raimundo, Murtinha, Águas Claras… próprias, arrendadas ou em sociedade.",
    campos: {
      nome: { tipo: "texto", rotulo: "Nome", obrigatorio: true },
      municipio: { tipo: "texto", rotulo: "Município" },
      area_ha: { tipo: "numero", rotulo: "Área total (ha)", casas: 2 },
      posse: { tipo: "opcoes", rotulo: "Posse", padrao: "propria", opcoes: [["propria", "Própria"], ["arrendada", "Arrendada"], ["sociedade", "Sociedade"]] },
      socio: { tipo: "texto", rotulo: "Sócio / arrendador", mostrarSe: (r) => r.posse !== "propria" },
      ativo: { tipo: "booleano", rotulo: "Ativa", padrao: true },
      observacao: { tipo: "textoLongo", rotulo: "Observação" },
    },
    colunas: ["nome", "municipio", "area_ha", "posse", "socio"],
    ordem: (a, b) => a.nome.localeCompare(b.nome),
    resumo: (r) => r.nome,
  },

  talhoes: {
    titulo: "Talhões / sítios", singular: "talhão", icone: "mapa",
    descricao: "As áreas de cada fazenda (Gameleira, Galpão, George…) e a cultura que está nelas. No confinamento, cadastre os currais/lotes aqui.",
    campos: {
      nome: { tipo: "texto", rotulo: "Nome / número", obrigatorio: true },
      fazenda_id: { tipo: "ref", colecao: "fazendas", rotulo: "Fazenda" },
      area_ha: { tipo: "numero", rotulo: "Área (ha)", casas: 2 },
      cultura_id: { ...refCultura, rotulo: "Cultura atual" },
      variedade: { tipo: "texto", rotulo: "Variedade / híbrido" },
      pes: { tipo: "numero", rotulo: "Nº de pés (pomar)", casas: 0 },
      safra: { tipo: "texto", rotulo: "Safra", dica: "Ex.: 2026/27" },
      data_plantio: { tipo: "data", rotulo: "Data de plantio" },
      previsao_colheita: { tipo: "data", rotulo: "Previsão de colheita" },
      ativo: { tipo: "booleano", rotulo: "Ativo", padrao: true },
      observacao: { tipo: "textoLongo", rotulo: "Observação" },
    },
    colunas: ["nome", "fazenda_id", "area_ha", "cultura_id", "pes", "safra", "data_plantio"],
    ordem: (a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }),
    resumo: (r) => r.nome,
  },

  funcionarios: {
    titulo: "Funcionários", singular: "funcionário", icone: "pessoas",
    descricao: "Tratoristas, gerentes, trabalhadores de campo, motoristas, secretária…",
    campos: {
      nome: { tipo: "texto", rotulo: "Nome", obrigatorio: true },
      funcao: { tipo: "sugestao", rotulo: "Função", sugestoes: FUNCOES, obrigatorio: true },
      telefone: { tipo: "texto", rotulo: "Telefone" },
      cpf: { tipo: "texto", rotulo: "CPF" },
      vinculo: { tipo: "opcoes", rotulo: "Vínculo", opcoes: [["mensal", "Mensalista"], ["diarista", "Diarista"], ["temporario", "Temporário / safra"]], padrao: "mensal" },
      salario: { tipo: "dinheiro", rotulo: "Salário / diária" },
      admissao: { tipo: "data", rotulo: "Admissão" },
      ativo: { tipo: "booleano", rotulo: "Ativo", padrao: true },
      observacao: { tipo: "textoLongo", rotulo: "Observação" },
    },
    colunas: ["nome", "funcao", "vinculo", "salario", "telefone", "ativo"],
    ordem: (a, b) => a.nome.localeCompare(b.nome),
    resumo: (r) => r.nome,
  },

  usuarios: {
    titulo: "Usuários", singular: "usuário", icone: "pessoas",
    descricao: "Quem usa o sistema e o que cada um pode fazer. O e-mail deve ser o mesmo do login criado no Supabase (Authentication → Users).",
    campos: {
      nome: { tipo: "texto", rotulo: "Nome", obrigatorio: true },
      email: { tipo: "texto", rotulo: "E-mail de acesso", obrigatorio: true },
      perfil: { tipo: "opcoes", rotulo: "Perfil", padrao: "operador", opcoes: [["admin", "Administrador (tudo)"], ["gerente", "Gerente"], ["operador", "Operador (lança dados)"], ["consulta", "Só consulta"]] },
      telefone: { tipo: "texto", rotulo: "Telefone" },
      ativo: { tipo: "booleano", rotulo: "Acesso liberado", padrao: true },
      observacao: { tipo: "textoLongo", rotulo: "Observação" },
    },
    colunas: ["nome", "email", "perfil", "telefone", "ativo"],
    ordem: (a, b) => a.nome.localeCompare(b.nome),
    resumo: (r) => r.nome,
  },

  maquinas: {
    titulo: "Máquinas e veículos", singular: "máquina", icone: "trator",
    descricao: "Inventário de tratores, implementos, caminhões e veículos. Tratores e colheitadeiras marcam horímetro; caminhões marcam km.",
    campos: {
      nome: { tipo: "texto", rotulo: "Nome / identificação", obrigatorio: true, dica: "Ex.: Trator MF 4292" },
      categoria: { tipo: "opcoes", rotulo: "Categoria", padrao: "trator", opcoes: [
        ["trator", "Trator"], ["colheitadeira", "Colheitadeira"], ["pulverizador", "Pulverizador autopropelido"],
        ["implemento", "Implemento"], ["caminhao", "Caminhão"], ["veiculo", "Carro / moto"], ["outro", "Outro"],
      ] },
      medidor: { tipo: "opcoes", rotulo: "Controle por", padrao: "horas", opcoes: [["horas", "Horímetro (h)"], ["km", "Hodômetro (km)"], ["nenhum", "Sem medidor (implemento)"]] },
      marca: { tipo: "texto", rotulo: "Marca" },
      modelo: { tipo: "texto", rotulo: "Modelo" },
      ano: { tipo: "numero", rotulo: "Ano" },
      placa: { tipo: "texto", rotulo: "Placa / chassi / série" },
      leitura_inicial: { tipo: "numero", rotulo: "Horímetro/km no cadastro", casas: 1, dica: "A leitura atual passa a vir dos lançamentos" },
      intervalo_revisao: { tipo: "numero", rotulo: "Revisão a cada (h ou km)", dica: "Ex.: 250 h, 10.000 km" },
      valor: { tipo: "dinheiro", rotulo: "Valor patrimonial" },
      ativo: { tipo: "booleano", rotulo: "Ativa", padrao: true },
      observacao: { tipo: "textoLongo", rotulo: "Observação" },
    },
    aoMudar: {
      categoria: (reg) => ({
        medidor: ["caminhao", "veiculo"].includes(reg.categoria) ? "km"
          : reg.categoria === "implemento" ? "nenhum" : "horas",
      }),
    },
    colunas: ["nome", "categoria", "marca", "modelo", "placa", "medidor"],
    ordem: (a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }),
    resumo: (r) => r.nome,
  },

  insumos: {
    titulo: "Produtos químicos e insumos", singular: "produto", icone: "frasco",
    descricao: "Defensivos, adubos, sementes, ração… O estoque é a conta: entradas − aplicações.",
    campos: {
      nome: { tipo: "texto", rotulo: "Nome comercial", obrigatorio: true },
      fabricante: { tipo: "texto", rotulo: "Fabricante" },
      tipo: { tipo: "opcoes", rotulo: "Tipo", opcoes: TIPOS_INSUMO, padrao: "herbicida" },
      principio_ativo: { tipo: "texto", rotulo: "Princípio ativo" },
      unidade: { tipo: "sugestao", rotulo: "Unidade", sugestoes: ["L", "kg", "saco", "t", "unidade", "dose"], padrao: "L", obrigatorio: true },
      estoque_minimo: { tipo: "numero", rotulo: "Estoque mínimo", casas: 2 },
      ativo: { tipo: "booleano", rotulo: "Ativo", padrao: true },
      fotos_rotulo: { tipo: "fotos", rotulo: "Fotos do rótulo", dica: "Tire foto da frente, do verso e da bula, se tiver." },
      observacao: { tipo: "textoLongo", rotulo: "Observação" },
    },
    colunas: ["nome", "fabricante", "tipo", "principio_ativo", "unidade", "estoque_minimo"],
    ordem: (a, b) => a.nome.localeCompare(b.nome),
    resumo: (r) => `${r.nome} (${r.unidade})`,
  },

  // ─── Lançamentos ──────────────────────────────────────────────────────────
  operacoes: {
    titulo: "Horímetro / operações", singular: "operação", icone: "relogio", lancamento: true,
    descricao: "Cada serviço de máquina: horímetro (ou km) no início e no fim, quem operou e em qual talhão.",
    campos: {
      data: { tipo: "data", rotulo: "Data", obrigatorio: true, padrao: hoje },
      maquina_id: { tipo: "ref", colecao: "maquinas", rotulo: "Máquina / veículo", obrigatorio: true, filtro: (m) => m.medidor !== "nenhum" },
      implemento_id: { tipo: "ref", colecao: "maquinas", rotulo: "Implemento", filtro: (m) => m.categoria === "implemento" },
      operador_id: { tipo: "ref", colecao: "funcionarios", rotulo: "Operador / motorista" },
      operacao: { tipo: "sugestao", rotulo: "Operação", sugestoes: OPERACOES, obrigatorio: true },
      talhao_id: refTalhao,
      cultura_id: refCultura,
      leitura_inicial: { tipo: "numero", rotulo: "Leitura inicial", casas: 1, obrigatorio: true },
      leitura_final: { tipo: "numero", rotulo: "Leitura final", casas: 1, obrigatorio: true },
      trabalhado: { tipo: "numero", rotulo: "Horas / km", casas: 1, somenteLeitura: true },
      destino: { tipo: "texto", rotulo: "Destino / carga", dica: "Para viagens de caminhão" },
      observacao: { tipo: "textoLongo", rotulo: "Observação" },
    },
    aoMudar: {
      ...culturaDoTalhao,
      // A leitura inicial sugerida é a última leitura conhecida da máquina.
      maquina_id: (reg, dados, ctx) => (ctx?.ultimaLeitura ? { leitura_inicial: ctx.ultimaLeitura(reg.maquina_id) } : {}),
    },
    calcular: (r) => ({ trabalhado: Math.max(0, num(r.leitura_final) - num(r.leitura_inicial)) }),
    validar: (r) => (num(r.leitura_final) < num(r.leitura_inicial) ? "A leitura final não pode ser menor que a inicial." : null),
    colunas: ["data", "maquina_id", "operador_id", "operacao", "talhao_id", "leitura_inicial", "leitura_final", "trabalhado"],
  },

  revisoes: {
    titulo: "Revisões e manutenções", singular: "revisão", icone: "chave", lancamento: true,
    descricao: "Revisões, trocas de óleo e consertos, com o horímetro/km em que foram feitas.",
    campos: {
      data: { tipo: "data", rotulo: "Data", obrigatorio: true, padrao: hoje },
      maquina_id: { tipo: "ref", colecao: "maquinas", rotulo: "Máquina / veículo", obrigatorio: true },
      tipo: { tipo: "opcoes", rotulo: "Tipo", padrao: "revisao", opcoes: [["revisao", "Revisão programada"], ["oleo", "Troca de óleo / filtros"], ["corretiva", "Conserto / corretiva"], ["pneu", "Pneus"]] },
      leitura: { tipo: "numero", rotulo: "Horímetro / km", casas: 1 },
      descricao: { tipo: "textoLongo", rotulo: "O que foi feito" },
      oficina: { tipo: "texto", rotulo: "Oficina / mecânico" },
      valor: { tipo: "dinheiro", rotulo: "Valor (peças + serviço)" },
    },
    colunas: ["data", "maquina_id", "tipo", "leitura", "oficina", "valor"],
  },

  diesel_entradas: {
    titulo: "Compras de diesel", singular: "compra de diesel", icone: "gota", lancamento: true,
    descricao: "Diesel que entra no tanque da fazenda.",
    campos: {
      data: { tipo: "data", rotulo: "Data", obrigatorio: true, padrao: hoje },
      litros: { tipo: "numero", rotulo: "Litros", casas: 1, obrigatorio: true },
      preco_litro: { tipo: "dinheiro", rotulo: "Preço por litro", casas: 3 },
      valor: { tipo: "dinheiro", rotulo: "Valor total", somenteLeitura: true },
      fornecedor: { tipo: "texto", rotulo: "Fornecedor" },
      nota: { tipo: "texto", rotulo: "Nota fiscal" },
    },
    calcular: (r) => ({ valor: +(num(r.litros) * num(r.preco_litro)).toFixed(2) }),
    colunas: ["data", "litros", "preco_litro", "valor", "fornecedor", "nota"],
  },

  abastecimentos: {
    titulo: "Abastecimentos", singular: "abastecimento", icone: "combustivel", lancamento: true,
    descricao: "Saída do tanque da fazenda ou abastecimento em posto.",
    campos: {
      data: { tipo: "data", rotulo: "Data", obrigatorio: true, padrao: hoje },
      origem: { tipo: "opcoes", rotulo: "Onde abasteceu", padrao: "tanque", opcoes: [["tanque", "Tanque da fazenda"], ["posto", "Posto"]] },
      maquina_id: { tipo: "ref", colecao: "maquinas", rotulo: "Máquina / veículo", obrigatorio: true, filtro: (m) => m.medidor !== "nenhum" },
      operador_id: { tipo: "ref", colecao: "funcionarios", rotulo: "Operador / motorista" },
      litros: { tipo: "numero", rotulo: "Litros", casas: 1, obrigatorio: true },
      leitura: { tipo: "numero", rotulo: "Horímetro / km no abastecimento", casas: 1 },
      talhao_id: { ...refTalhao, rotulo: "Talhão (se o serviço for de um só)" },
      cultura_id: refCultura,
      posto: { tipo: "texto", rotulo: "Posto", mostrarSe: (r) => r.origem === "posto" },
      preco_litro: { tipo: "dinheiro", rotulo: "Preço por litro", casas: 3, mostrarSe: (r) => r.origem === "posto" },
      valor: { tipo: "dinheiro", rotulo: "Valor", somenteLeitura: true, mostrarSe: (r) => r.origem === "posto" },
      observacao: { tipo: "textoLongo", rotulo: "Observação" },
    },
    aoMudar: culturaDoTalhao,
    calcular: (r) => ({ valor: r.origem === "posto" ? +(num(r.litros) * num(r.preco_litro)).toFixed(2) : null }),
    colunas: ["data", "origem", "maquina_id", "operador_id", "litros", "leitura", "talhao_id", "valor"],
  },

  insumo_entradas: {
    titulo: "Entradas de químicos/insumos", singular: "entrada", icone: "caixa", lancamento: true,
    descricao: "Compras que entram no estoque. O custo médio sai daqui.",
    campos: {
      data: { tipo: "data", rotulo: "Data", obrigatorio: true, padrao: hoje },
      insumo_id: { tipo: "ref", colecao: "insumos", rotulo: "Produto", obrigatorio: true },
      quantidade: { tipo: "numero", rotulo: "Quantidade", casas: 2, obrigatorio: true },
      valor: { tipo: "dinheiro", rotulo: "Valor total", obrigatorio: true },
      cultura_id: { ...refCultura, rotulo: "Comprado para a cultura" },
      fornecedor: { tipo: "texto", rotulo: "Fornecedor" },
      nota: { tipo: "texto", rotulo: "Nota fiscal" },
      lote: { tipo: "texto", rotulo: "Lote / validade" },
    },
    colunas: ["data", "insumo_id", "quantidade", "valor", "cultura_id", "fornecedor"],
  },

  aplicacoes: {
    titulo: "Aplicações / saídas", singular: "aplicação", icone: "spray", lancamento: true,
    descricao: "Produto que saiu do estoque para um talhão. Vira custo do talhão e da cultura.",
    campos: {
      data: { tipo: "data", rotulo: "Data", obrigatorio: true, padrao: hoje },
      insumo_id: { tipo: "ref", colecao: "insumos", rotulo: "Produto", obrigatorio: true },
      quantidade: { tipo: "numero", rotulo: "Quantidade total", casas: 2, obrigatorio: true },
      talhao_id: { ...refTalhao, obrigatorio: true },
      cultura_id: refCultura,
      dose_ha: { tipo: "numero", rotulo: "Dose por ha", casas: 3 },
      area_aplicada: { tipo: "numero", rotulo: "Área aplicada (ha)", casas: 2 },
      responsavel_id: { tipo: "ref", colecao: "funcionarios", rotulo: "Responsável" },
      maquina_id: { tipo: "ref", colecao: "maquinas", rotulo: "Máquina" },
      observacao: { tipo: "textoLongo", rotulo: "Observação" },
    },
    aoMudar: culturaDoTalhao,
    colunas: ["data", "insumo_id", "quantidade", "talhao_id", "cultura_id", "dose_ha", "responsavel_id"],
  },

  despesas: {
    titulo: "Despesas", singular: "despesa", icone: "dinheiro", lancamento: true,
    descricao: "Como na planilha FINANCEIRO: categoria, tipo, forma de pagamento e favorecido. Toda despesa vai para um centro de custo: geral, uma cultura ou um talhão. Compra de diesel para o tanque e de químicos para o estoque se lança nas telas deles, não aqui.",
    campos: {
      data: { tipo: "data", rotulo: "Data", obrigatorio: true, padrao: hoje },
      categoria: { tipo: "sugestao", rotulo: "Categoria", sugestoes: CATEGORIAS_DESPESA, obrigatorio: true },
      tipo: { tipo: "sugestao", rotulo: "Tipo", dica: "Ex.: Seguro, Almoço, Diárias, Pneus", sugestoesDe: ["despesas", "tipo"] },
      descricao: { tipo: "texto", rotulo: "Descrição", obrigatorio: true },
      valor: { tipo: "dinheiro", rotulo: "Valor", obrigatorio: true },
      forma_pagamento: { tipo: "sugestao", rotulo: "Forma de pagamento", sugestoes: FORMAS_PAGAMENTO, padrao: "PIX" },
      favorecido: { tipo: "sugestao", rotulo: "Favorecido", sugestoesDe: ["despesas", "favorecido"] },
      fazenda_id: { tipo: "ref", colecao: "fazendas", rotulo: "Fazenda" },
      centro: { tipo: "opcoes", rotulo: "Centro de custo", padrao: "geral", opcoes: [["geral", "Geral da fazenda"], ["cultura", "Cultura"], ["talhao", "Talhão"]] },
      cultura_id: { ...refCultura, mostrarSe: (r) => r.centro !== "geral", obrigatorio: (r) => r.centro === "cultura" },
      talhao_id: { ...refTalhao, mostrarSe: (r) => r.centro === "talhao", obrigatorio: (r) => r.centro === "talhao" },
      maquina_id: { tipo: "ref", colecao: "maquinas", rotulo: "Máquina / caminhão (se for dela)" },
      funcionario_id: { tipo: "ref", colecao: "funcionarios", rotulo: "Funcionário (se for pagamento)" },
      litros: { tipo: "numero", rotulo: "Litros", casas: 2, mostrarSe: (r) => r.categoria === "Combustíveis" },
      vencimento: { tipo: "data", rotulo: "Vencimento" },
      pago: { tipo: "booleano", rotulo: "Pago", padrao: true },
      nota: { tipo: "texto", rotulo: "Nota / documento" },
    },
    aoMudar: {
      ...culturaDoTalhao,
      centro: (r) => (r.centro === "geral" ? { cultura_id: null, talhao_id: null } : r.centro === "cultura" ? { talhao_id: null } : {}),
    },
    colunas: ["data", "categoria", "tipo", "descricao", "forma_pagamento", "favorecido", "cultura_id", "valor", "pago"],
  },

  entradas: {
    titulo: "Outras entradas", singular: "entrada", icone: "entrada", lancamento: true,
    descricao: "Dinheiro que entra sem ser venda: aditivo dos sócios (Lucas, Carlinhos), empréstimo, indenização…",
    campos: {
      data: { tipo: "data", rotulo: "Data", obrigatorio: true, padrao: hoje },
      tipo: { tipo: "sugestao", rotulo: "Tipo", sugestoes: ["Aditivo de sócio", "Empréstimo", "Financiamento", "Outros"], obrigatorio: true },
      origem: { tipo: "sugestao", rotulo: "De quem", sugestoesDe: ["entradas", "origem"] },
      valor: { tipo: "dinheiro", rotulo: "Valor", obrigatorio: true },
      descricao: { tipo: "texto", rotulo: "Descrição" },
    },
    colunas: ["data", "tipo", "origem", "descricao", "valor"],
  },

  colheitas: {
    titulo: "Colheitas", singular: "colheita", icone: "cesto", lancamento: true,
    descricao: "O que saiu de cada talhão. Dá a produtividade por hectare.",
    campos: {
      data: { tipo: "data", rotulo: "Data", obrigatorio: true, padrao: hoje },
      talhao_id: { ...refTalhao, obrigatorio: true },
      cultura_id: { ...refCultura, obrigatorio: true },
      quantidade: { tipo: "numero", rotulo: "Quantidade", casas: 2, obrigatorio: true },
      unidade: { tipo: "opcoes", rotulo: "Unidade", opcoes: UNIDADES_VENDA.map(([v, r]) => [v, r]), padrao: "t" },
      responsavel_id: { tipo: "ref", colecao: "funcionarios", rotulo: "Responsável" },
      observacao: { tipo: "textoLongo", rotulo: "Observação" },
    },
    aoMudar: {
      talhao_id: (reg, dados) => {
        const t = dados.talhoes.find((x) => x.id === reg.talhao_id);
        const c = t && dados.culturas.find((x) => x.id === t.cultura_id);
        return c ? { cultura_id: c.id, unidade: c.unidade || reg.unidade } : {};
      },
    },
    colunas: ["data", "talhao_id", "cultura_id", "quantidade", "unidade", "responsavel_id"],
  },

  vendas: {
    titulo: "Vendas da produção", singular: "venda", icone: "venda", lancamento: true,
    descricao: "Uma linha por carga, como nas planilhas de venda de milho, laranja e silagem: pesagem, preço, descontos e custos. O que já foi pago entra em Recebimentos.",
    campos: {
      data: { tipo: "data", rotulo: "Data", obrigatorio: true, padrao: hoje },
      comprador: { tipo: "sugestao", rotulo: "Comprador", obrigatorio: true, sugestoesDe: ["vendas", "comprador"] },
      cultura_id: { ...refCultura, obrigatorio: true },
      safra: { tipo: "sugestao", rotulo: "Safra", dica: "Ex.: Milho 2026", sugestoesDe: ["vendas", "safra"] },
      talhao_id: { ...refTalhao, rotulo: "Talhão / sítio" },
      classificacao: { tipo: "sugestao", rotulo: "Tipo / classificação", sugestoes: ["BOA", "SUKITA", "CASQUINOL", "Grão", "Silagem"], sugestoesDe: ["vendas", "classificacao"] },
      placa: { tipo: "sugestao", rotulo: "Placa", sugestoesDe: ["vendas", "placa"] },
      tipo_carro: { tipo: "sugestao", rotulo: "Tipo de carro", sugestoes: ["Rodocaçamba", "Graneleiro", "Caçambão", "9 eixos", "Truck", "Toco"] },
      peso_entrada: { tipo: "numero", rotulo: "Peso entrada / tara (kg)", casas: 1 },
      peso_saida: { tipo: "numero", rotulo: "Peso saída / bruto (kg)", casas: 1 },
      peso_liquido: { tipo: "numero", rotulo: "Peso líquido (kg)", casas: 1, somenteLeitura: true },
      volumes: { tipo: "numero", rotulo: "Nº de sacos / volumes", casas: 1 },
      desconto_kg: { tipo: "numero", rotulo: "Desconto (kg)", casas: 1 },
      unidade: { tipo: "opcoes", rotulo: "Preço por", opcoes: UNIDADES_VENDA.map(([v, r]) => [v, r]), padrao: "t" },
      quantidade: { tipo: "numero", rotulo: "Quantidade", casas: 3, dica: "Calculada pelo peso quando o preço é por peso" },
      preco_unitario: { tipo: "dinheiro", rotulo: "Preço", casas: 4, obrigatorio: true },
      valor_bruto: { tipo: "dinheiro", rotulo: "Valor bruto", somenteLeitura: true },
      valor_desconto: { tipo: "dinheiro", rotulo: "Valor do desconto", somenteLeitura: true },
      custo_ton: { tipo: "dinheiro", rotulo: "Custo por tonelada (colheita/carregamento)" },
      frete_cobrado: { tipo: "dinheiro", rotulo: "Frete cobrado do comprador (soma)" },
      frete: { tipo: "dinheiro", rotulo: "Frete pago (desconta)" },
      comissao: { tipo: "dinheiro", rotulo: "Comissão" },
      juros: { tipo: "dinheiro", rotulo: "Juros / antecipação" },
      valor: { tipo: "dinheiro", rotulo: "Valor líquido", somenteLeitura: true },
      motorista_id: { tipo: "ref", colecao: "funcionarios", rotulo: "Motorista" },
      caminhao_id: { tipo: "ref", colecao: "maquinas", rotulo: "Caminhão próprio", filtro: (m) => m.categoria === "caminhao" },
      vencimento: { tipo: "data", rotulo: "Vencimento" },
      nota_fiscal: { tipo: "texto", rotulo: "Nº da nota fiscal" },
      observacao: { tipo: "textoLongo", rotulo: "Observação" },
    },
    aoMudar: {
      talhao_id: (reg, dados) => {
        const t = dados.talhoes.find((x) => x.id === reg.talhao_id);
        const c = t && !reg.cultura_id && dados.culturas.find((x) => x.id === t.cultura_id);
        return c ? { cultura_id: c.id, unidade: c.unidade || reg.unidade } : {};
      },
      cultura_id: (reg, dados) => {
        const c = dados.culturas.find((x) => x.id === reg.cultura_id);
        return c?.unidade ? { unidade: c.unidade } : {};
      },
    },
    calcular: (r) => {
      const entrada = num(r.peso_entrada), saida = num(r.peso_saida);
      const liquido = saida ? Math.abs(saida - entrada) : null;
      const kgUn = KG_POR_UNIDADE[r.unidade];
      const quantidade = kgUn && liquido != null ? liquido / kgUn : r.quantidade;
      const bruto = num(quantidade) * num(r.preco_unitario);
      const desconto = kgUn ? (num(r.desconto_kg) / kgUn) * num(r.preco_unitario) : 0;
      const custo = (num(liquido) / 1000) * num(r.custo_ton);
      const liquidoR = bruto + num(r.frete_cobrado) - desconto - custo - num(r.frete) - num(r.comissao) - num(r.juros);
      return {
        peso_liquido: liquido,
        quantidade: quantidade == null || quantidade === "" ? null : +Number(quantidade).toFixed(3),
        valor_bruto: +bruto.toFixed(2), valor_desconto: +desconto.toFixed(2), valor: +liquidoR.toFixed(2),
      };
    },
    validar: (r) => (r.quantidade == null ? "Informe os pesos ou a quantidade." : null),
    colunas: ["data", "comprador", "cultura_id", "talhao_id", "classificacao", "placa", "peso_liquido", "quantidade", "preco_unitario", "valor_bruto", "valor"],
  },

  recebimentos: {
    titulo: "Recebimentos", singular: "recebimento", icone: "entrada", lancamento: true,
    descricao: "O que cada comprador já pagou (a coluna PAGANTES das planilhas). O saldo a receber é vendas − recebimentos.",
    campos: {
      data: { tipo: "data", rotulo: "Data", obrigatorio: true, padrao: hoje },
      comprador: { tipo: "sugestao", rotulo: "Comprador (pagante)", obrigatorio: true, sugestoesDe: ["vendas", "comprador"] },
      cultura_id: refCultura,
      valor: { tipo: "dinheiro", rotulo: "Valor", obrigatorio: true },
      forma_pagamento: { tipo: "sugestao", rotulo: "Forma", sugestoes: FORMAS_PAGAMENTO, padrao: "PIX" },
      observacao: { tipo: "texto", rotulo: "Observação" },
    },
    colunas: ["data", "comprador", "cultura_id", "forma_pagamento", "valor", "observacao"],
  },

  fretes: {
    titulo: "Fretes do caminhão", singular: "frete", icone: "caminhao", lancamento: true,
    descricao: "Fretes próprios: contratante, produto, origem, destino, peso e km rodado.",
    campos: {
      data: { tipo: "data", rotulo: "Data", obrigatorio: true, padrao: hoje },
      caminhao_id: { tipo: "ref", colecao: "maquinas", rotulo: "Caminhão", filtro: (m) => m.categoria === "caminhao" },
      motorista_id: { tipo: "ref", colecao: "funcionarios", rotulo: "Motorista" },
      contratante: { tipo: "sugestao", rotulo: "Contratante", sugestoes: ["CC", "FB"], sugestoesDe: ["fretes", "contratante"], obrigatorio: true },
      produto: { tipo: "sugestao", rotulo: "Produto", sugestoesDe: ["fretes", "produto"] },
      origem: { tipo: "sugestao", rotulo: "Origem", sugestoesDe: ["fretes", "origem"] },
      destino: { tipo: "sugestao", rotulo: "Destino", sugestoesDe: ["fretes", "destino"] },
      peso_kg: { tipo: "numero", rotulo: "Peso líquido (kg)", casas: 1 },
      preco_ton: { tipo: "dinheiro", rotulo: "R$ por tonelada" },
      valor: { tipo: "dinheiro", rotulo: "Valor do frete", somenteLeitura: true },
      km: { tipo: "numero", rotulo: "Km rodado", casas: 1 },
      observacao: { tipo: "texto", rotulo: "Observação" },
    },
    calcular: (r) => ({ valor: +((num(r.peso_kg) / 1000) * num(r.preco_ton)).toFixed(2) }),
    colunas: ["data", "caminhao_id", "contratante", "produto", "origem", "destino", "peso_kg", "preco_ton", "valor", "km"],
  },

  planejamento: {
    titulo: "Planejamento da safra", singular: "item do planejamento", icone: "lista",
    descricao: "Como a aba PLANEJAMENTO: por fase, produto, dose por hectare e preço. O total é dose × hectares × preço.",
    campos: {
      safra: { tipo: "sugestao", rotulo: "Safra", obrigatorio: true, dica: "Ex.: Milho 2026", sugestoesDe: ["planejamento", "safra"] },
      cultura_id: { ...refCultura, obrigatorio: true },
      fazenda_id: { tipo: "ref", colecao: "fazendas", rotulo: "Fazenda" },
      fase: { tipo: "sugestao", rotulo: "Fase", sugestoes: FASES, obrigatorio: true },
      insumo_id: { tipo: "ref", colecao: "insumos", rotulo: "Produto", obrigatorio: true },
      dose_ha: { tipo: "numero", rotulo: "Quantidade por ha", casas: 3, obrigatorio: true },
      hectares: { tipo: "numero", rotulo: "Hectares", casas: 2, obrigatorio: true },
      quantidade_total: { tipo: "numero", rotulo: "Quantidade total", casas: 2, somenteLeitura: true },
      preco_unitario: { tipo: "dinheiro", rotulo: "Valor por unidade", casas: 4 },
      total: { tipo: "dinheiro", rotulo: "Total", somenteLeitura: true },
    },
    calcular: (r) => {
      const q = num(r.dose_ha) * num(r.hectares);
      return { quantidade_total: +q.toFixed(3), total: +(q * num(r.preco_unitario)).toFixed(2) };
    },
    colunas: ["safra", "fazenda_id", "fase", "insumo_id", "dose_ha", "hectares", "quantidade_total", "preco_unitario", "total"],
    ordem: (a, b) => (a.safra || "").localeCompare(b.safra || "") || FASES.indexOf(a.fase) - FASES.indexOf(b.fase),
  },
};

export const COLECOES = Object.keys(ESQUEMA);

/** Registro novo com os valores padrão do esquema. */
export function registroNovo(colecao) {
  const reg = {};
  for (const [chave, campo] of Object.entries(ESQUEMA[colecao].campos)) {
    const p = campo.padrao;
    reg[chave] = typeof p === "function" ? p() : p ?? (campo.tipo === "booleano" ? false : null);
  }
  return reg;
}

export function campoObrigatorio(campo, reg) {
  return typeof campo.obrigatorio === "function" ? campo.obrigatorio(reg) : Boolean(campo.obrigatorio);
}

export function campoVisivel(campo, reg) {
  return !campo.mostrarSe || campo.mostrarSe(reg);
}

/**
 * Limpa e completa um registro antes de gravar: números viram número, campo
 * escondido vira nulo, os calculados são refeitos. Devolve { reg, erro }.
 */
export function prepararRegistro(colecao, bruto) {
  const def = ESQUEMA[colecao];
  const reg = { ...bruto };
  for (const [chave, campo] of Object.entries(def.campos)) {
    let v = reg[chave];
    if (!campoVisivel(campo, reg)) v = null;
    if (["numero", "dinheiro"].includes(campo.tipo)) v = v === "" || v == null ? null : Number(v);
    if (campo.tipo === "booleano") v = Boolean(v);
    if (campo.tipo === "fotos" && !v?.length) v = null;
    if (typeof v === "string") v = v.trim() || null;
    reg[chave] = v;
  }
  Object.assign(reg, def.calcular?.(reg) ?? {});

  for (const [chave, campo] of Object.entries(def.campos)) {
    if (campoVisivel(campo, reg) && campoObrigatorio(campo, reg) && (reg[chave] == null || reg[chave] === "")) {
      return { reg, erro: `Preencha: ${campo.rotulo}` };
    }
  }
  const erro = def.validar?.(reg);
  return { reg, erro: erro || null };
}
