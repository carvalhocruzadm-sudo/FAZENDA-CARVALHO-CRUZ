/**
 * Atalhos de lançamento — o botão "+ Lançar" do topo e os atalhos do Início.
 * Cada um leva para a tela e a aba certas e já abre o formulário em branco.
 * [rótulo, ícone, tela, aba, explicação curta]
 * Sem aba: a própria tela já é o lançamento (ticket da balança).
 */
export const LANCAMENTOS = [
  ["Ticket da balança", "cesto", "ticket", null, "Carga que saiu pesada na balança"],
  ["Despesa / conta a pagar", "dinheiro", "financeiro", "despesas", "Qualquer gasto da fazenda"],
  ["Aplicação de produto", "spray", "atividades", "aplicacoes", "Defensivo, adubo ou semente que foi para o talhão"],
  ["Horímetro / serviço de máquina", "relogio", "atividades", "operacoes", "Hora ou km trabalhado, quem operou e onde"],
  ["Abastecimento", "combustivel", "diesel", "abastecimentos", "Diesel do tanque ou do posto"],
  ["Recebimento", "entrada", "vendas", "recebimentos", "Dinheiro que um comprador pagou"],
  ["Colheita", "cesto", "lavoura", "colheitas", "O que saiu de cada talhão"],
  ["Compra de produto", "caixa", "quimicos", "insumo_entradas", "Químico, adubo ou semente que entrou no estoque"],
  ["Compra de diesel", "gota", "diesel", "diesel_entradas", "Diesel que entrou no tanque"],
  ["Revisão de máquina", "chave", "maquinas", "revisoes", "Revisão, troca de óleo ou conserto"],
  ["Frete do caminhão", "caminhao", "fretes", "fretes", "Viagem feita com o caminhão próprio"],
  ["Chuva (pluviômetro)", "chuva", "pluviometro", "chuvas", "Milímetros que choveram"],
];
