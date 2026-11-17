/**
 * O que dá para lançar pelo botão "+ Lançar".
 *
 * DA_CULTURA: lançamentos que são de uma cultura. Vão para a tela da cultura
 * já com ela preenchida. [rótulo, ícone, aba, sub-aba, explicação, abre formulário?]
 *
 * DA_FAZENDA: o que é da fazenda toda (não tem cultura).
 * [rótulo, ícone, tela, aba, explicação, abre formulário?]
 *
 * "abre formulário" = false quando a própria tela já é o lançamento (ticket,
 * ordem de pulverização, programação de pagamentos).
 */
export const DA_CULTURA = [
  ["Ticket da balança", "cesto", "vendas", "ticket", "Carga que saiu pesada na balança", false],
  ["Colheita", "cesto", "vendas", "colheitas", "O que saiu de cada talhão", true],
  ["Venda (carga com preço)", "venda", "vendas", "vendas", "Carga vendida, com comprador e preço", true],
  ["Recebimento", "entrada", "vendas", "recebimentos", "Dinheiro que um comprador pagou", true],
  ["Aplicação de produto", "spray", "atividades", "aplicacoes", "Defensivo, adubo ou semente que foi para o talhão", true],
  ["Horímetro / serviço de máquina", "relogio", "atividades", "operacoes", "Hora trabalhada, quem operou e em qual talhão", true],
  ["Abastecimento", "combustivel", "atividades", "abastecimentos", "Diesel de uma máquina que trabalhou na cultura", true],
  ["Ordem de pulverização", "lista", "atividades", "ordens", "O que o depósito tem que separar para pulverizar", false],
  ["Despesa da cultura", "dinheiro", "custos", "despesas", "Gasto que é só desta cultura", true],
  ["Item do planejamento", "calendario", "planejamento", null, "Produto, dose e preço planejados para a safra", true],
];

export const DA_FAZENDA = [
  ["Despesa geral da fazenda", "dinheiro", "financeiro", "despesas", "Gasto que não é de uma cultura só", true],
  ["Boleto / pagamento programado", "calendario", "boletos", null, "Conta para pagar numa data", false],
  ["Compra de produto", "caixa", "quimicos", "insumo_entradas", "Químico, adubo ou semente que entrou no estoque", true],
  ["Compra de diesel", "gota", "diesel", "diesel_entradas", "Diesel que entrou no tanque", true],
  ["Revisão de máquina", "chave", "maquinas", "revisoes", "Revisão, troca de óleo ou conserto", true],
  ["Frete do caminhão", "caminhao", "fretes", "fretes", "Viagem feita com o caminhão próprio", true],
  ["Chuva (pluviômetro)", "chuva", "pluviometro", "chuvas", "Milímetros que choveram", true],
];
