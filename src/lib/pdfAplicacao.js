/**
 * PDF da aplicação montada pelo agrônomo. É usado nas duas pontas: na página
 * do link do agrônomo e dentro do sistema da fazenda. As bibliotecas são
 * pesadas, então só carregam quando o botão é clicado.
 */

import { data as dataBR, numero } from "./formato";

const SITUACOES = { nova: "Nova", aprovada: "Aprovada", aplicada: "Aplicada", parcial: "Parte aplicada", cancelada: "Cancelada" };

/**
 * @param {object} a  { nome, data, agronomo, talhao, fazenda, cultura, area_ha, alvo, calda_l_ha, dose_por, ha_por_pipa, observacao, situacao,
 *                      itens: [{ nome, fabricante, principio_ativo, unidade, dose_ha, dose_pipa?, total }],
 *                      talhoes?: [{ fazenda, talhao, area_ha }] (quando a aplicação vale para vários talhões) }
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
  const pipa = a.dose_por === "pipa";
  const linhas = [
    ...(a.nome ? [["Aplicação", a.nome]] : []),
    ["Data", dataBR(a.data)],
    ["Agrônomo", a.agronomo || "-"],
    ["Fazenda / talhão", [a.fazenda, a.talhao].filter(Boolean).join(" / ") || "-"],
    ["Cultura", a.cultura || "-"],
    ["Área a aplicar", a.area_ha ? `${numero(a.area_ha)} ha${a.talhoes?.length > 1 ? ` (${a.talhoes.length} talhões)` : ""}` : "-"],
    ["Alvo", a.alvo || "-"],
    ["Calda", a.calda_l_ha ? `${numero(a.calda_l_ha, 1)} L/ha` : "-"],
    ["Dose por", pipa
      ? `Pipa (tanque cheio) · ${numero(a.ha_por_pipa, 2)} ha por pipa${a.area_ha && a.ha_por_pipa ? ` · ${numero(a.area_ha / a.ha_por_pipa, 1)} pipas` : ""}`
      : "Hectare (ha)"],
  ];
  autoTable(doc, {
    startY: 30,
    body: linhas,
    theme: "plain",
    styles: { fontSize: 10, cellPadding: 1.4 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 38, textColor: [119, 119, 106] } },
  });

  if (a.talhoes?.length > 1) {
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 6,
      head: [["Fazenda", "Talhão", "Área", ...a.itens.map((i) => i.nome)]],
      body: a.talhoes.map((t) => [
        t.fazenda || "-", t.talhao || "-", `${numero(t.area_ha)} ha`,
        ...a.itens.map((i) => `${numero(i.dose_ha * t.area_ha, 2)} ${i.unidade}`),
      ]),
      headStyles: { fillColor: verde },
      styles: { fontSize: a.itens.length > 4 ? 8 : 9.5, cellPadding: 1.6 },
    });
  }

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 6,
    head: [["Produto", "Fabricante", "Princípio ativo", ...(pipa ? ["Dose/pipa"] : []), "Dose/ha", "Total"]],
    body: a.itens.map((i) => [
      i.nome,
      i.fabricante || "-",
      i.principio_ativo || "-",
      ...(pipa ? [i.dose_pipa != null ? `${numero(i.dose_pipa, 3)} ${i.unidade}` : "-"] : []),
      `${numero(i.dose_ha, 3)} ${i.unidade}`,
      `${numero(i.total, 2)} ${i.unidade}`,
    ]),
    headStyles: { fillColor: verde },
    styles: { fontSize: 9.5, cellPadding: 2 },
    columnStyles: pipa
      ? { 3: { halign: "right", fontStyle: "bold" }, 4: { halign: "right" }, 5: { halign: "right", fontStyle: "bold" } }
      : { 3: { halign: "right" }, 4: { halign: "right", fontStyle: "bold" } },
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
