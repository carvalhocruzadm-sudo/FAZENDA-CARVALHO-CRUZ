/**
 * PDF da aplicação montada pelo agrônomo. É usado nas duas pontas: na página
 * do link do agrônomo e dentro do sistema da fazenda. As bibliotecas são
 * pesadas, então só carregam quando o botão é clicado.
 */

import { data as dataBR, numero } from "./formato";

const SITUACOES = { nova: "Nova", aprovada: "Aprovada", aplicada: "Aplicada", cancelada: "Cancelada" };

/**
 * @param {object} a  { data, agronomo, talhao, fazenda, cultura, area_ha, alvo, calda_l_ha, observacao, situacao,
 *                      itens: [{ nome, fabricante, principio_ativo, unidade, dose_ha, total }] }
 */
export async function gerarPdfAplicacao(a, nomeArquivo) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const largura = doc.internal.pageSize.getWidth();
  const verde = [45, 106, 79];

  doc.setFillColor(...verde);
  doc.rect(0, 0, largura, 24, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold").setFontSize(16);
  doc.text("Fazenda Carvalho Cruz", 14, 11);
  doc.setFont("helvetica", "normal").setFontSize(10);
  doc.text("Recomendação de aplicação", 14, 18);
  if (a.situacao) doc.text(SITUACOES[a.situacao] ?? a.situacao, largura - 14, 18, { align: "right" });

  doc.setTextColor(40, 40, 35);
  const linhas = [
    ["Data", dataBR(a.data)],
    ["Agrônomo", a.agronomo || "-"],
    ["Fazenda / talhão", [a.fazenda, a.talhao].filter(Boolean).join(" / ") || "-"],
    ["Cultura", a.cultura || "-"],
    ["Área a aplicar", a.area_ha ? `${numero(a.area_ha)} ha` : "-"],
    ["Alvo", a.alvo || "-"],
    ["Calda", a.calda_l_ha ? `${numero(a.calda_l_ha, 1)} L/ha` : "-"],
  ];
  autoTable(doc, {
    startY: 30,
    body: linhas,
    theme: "plain",
    styles: { fontSize: 10, cellPadding: 1.4 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 38, textColor: [119, 119, 106] } },
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 6,
    head: [["Produto", "Fabricante", "Princípio ativo", "Dose/ha", "Total"]],
    body: a.itens.map((i) => [
      i.nome,
      i.fabricante || "-",
      i.principio_ativo || "-",
      `${numero(i.dose_ha, 3)} ${i.unidade}`,
      `${numero(i.total, 2)} ${i.unidade}`,
    ]),
    headStyles: { fillColor: verde },
    styles: { fontSize: 9.5, cellPadding: 2 },
    columnStyles: { 3: { halign: "right" }, 4: { halign: "right", fontStyle: "bold" } },
  });

  let y = doc.lastAutoTable.finalY + 8;
  if (a.observacao) {
    doc.setFont("helvetica", "bold").setFontSize(10).text("Observações", 14, y);
    doc.setFont("helvetica", "normal");
    const texto = doc.splitTextToSize(a.observacao, largura - 28);
    doc.text(texto, 14, y + 5);
    y += 5 + texto.length * 4.6 + 6;
  }

  // Espaço para assinatura do agrônomo (receita impressa).
  y = Math.max(y + 14, 255);
  if (y > 280) { doc.addPage(); y = 40; }
  doc.setDrawColor(150).line(14, y, 90, y);
  doc.setFontSize(9).setTextColor(119, 119, 106).text(a.agronomo || "Agrônomo responsável", 14, y + 5);

  doc.save(nomeArquivo);
}
