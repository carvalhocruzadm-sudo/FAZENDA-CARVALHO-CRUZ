/**
 * PDF da ordem de pulverização com a foto de cada produto, para mandar no
 * WhatsApp dos operadores. As bibliotecas são pesadas, então só carregam
 * quando o botão é clicado.
 */

import { emEmbalagens, itensDaOrdem } from "./deposito";
import { data as dataBR, nomeRef, numero } from "./formato";
import { fazendaDoTalhao, talhoesDaOrdem } from "./talhoes";

const n = (v) => Number(v) || 0;
const SITUACOES = { aberta: "Esperando separar", separada: "Separada", concluida: "Concluída", cancelada: "Cancelada" };

/** Abre a foto e devolve um JPEG pequeno (data URL) para pôr no PDF. Sem foto: null. */
function fotoParaPdf(src, lado = 300) {
  if (!src) return Promise.resolve(null);
  return new Promise((resolver) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const escala = Math.min(1, lado / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * escala);
        c.height = Math.round(img.height * escala);
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolver({ url: c.toDataURL("image/jpeg", 0.8), w: c.width, h: c.height });
      } catch {
        resolver(null);
      }
    };
    img.onerror = () => resolver(null);
    img.src = src;
  });
}

/** Monta o PDF da ordem e devolve { blob, nome }. */
export async function gerarPdfPulverizacao(dados, ordem) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const largura = doc.internal.pageSize.getWidth();
  const altura = doc.internal.pageSize.getHeight();
  const verde = [45, 106, 79];
  const porPipa = ordem.dose_por === "pipa" && n(ordem.ha_por_pipa) > 0;

  doc.setFillColor(...verde);
  doc.rect(0, 0, largura, 24, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold").setFontSize(16);
  doc.text("Fazenda Carvalho Cruz", 14, 11);
  doc.setFont("helvetica", "normal").setFontSize(10);
  doc.text("Ordem de pulverização", 14, 18);
  if (ordem.situacao) doc.text(SITUACOES[ordem.situacao] ?? ordem.situacao, largura - 14, 18, { align: "right" });

  let y = 32;
  doc.setTextColor(40, 40, 35);
  if (ordem.titulo) {
    doc.setFont("helvetica", "bold").setFontSize(15);
    const t = doc.splitTextToSize(ordem.titulo, largura - 28);
    doc.text(t, 14, y);
    y += t.length * 6 + 1;
  }

  const talhoes = talhoesDaOrdem(dados, ordem);
  const linhas = [
    ["Data", dataBR(ordem.data)],
    ["Cultura", nomeRef(dados, "culturas", ordem.cultura_id) || "-"],
    ["Área total", `${numero(ordem.area_ha)} ha${talhoes.length > 1 ? ` (${talhoes.length} talhões)` : ""}`],
    ["Trator", nomeRef(dados, "maquinas", ordem.maquina_id) || "-"],
    ["Tratorista", nomeRef(dados, "funcionarios", ordem.operador_id) || "-"],
  ];
  if (porPipa) {
    linhas.push(["Uma pipa faz", `${numero(ordem.ha_por_pipa)} ha`]);
    linhas.push(["Pipas", numero(n(ordem.area_ha) / n(ordem.ha_por_pipa), 1)]);
  }
  autoTable(doc, {
    startY: y,
    body: linhas,
    theme: "plain",
    styles: { fontSize: 10.5, cellPadding: 1.4 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 38, textColor: [119, 119, 106] }, 1: { fontStyle: "bold" } },
  });

  const fazenda = fazendaDoTalhao(dados);
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 4,
    head: [["Fazenda", "Talhão", "Área"]],
    body: talhoes.map((x) => [fazenda(x.talhao) || "-", x.talhao.nome, `${numero(x.area_ha)} ha`]),
    headStyles: { fillColor: verde },
    styles: { fontSize: 10, cellPadding: 1.6 },
    columnStyles: { 2: { halign: "right" } },
  });

  // Produtos: um bloco por produto, com a foto grande para conferir no depósito.
  const itens = itensDaOrdem(dados, ordem.id);
  const fotos = await Promise.all(itens.map((x) => fotoParaPdf(x.insumo.fotos_rotulo?.[0])));
  y = doc.lastAutoTable.finalY + 10;
  doc.setFont("helvetica", "bold").setFontSize(13).text("Produtos", 14, y);
  y += 4;
  const alturaBloco = 42;
  itens.forEach(({ insumo, item }, k) => {
    if (y + alturaBloco > altura - 12) { doc.addPage(); y = 16; }
    doc.setDrawColor(220).setLineWidth(0.3).roundedRect(14, y, largura - 28, alturaBloco - 4, 2, 2);
    const f = fotos[k];
    const caixa = 34;
    if (f) {
      const esc = Math.min(caixa / f.w, caixa / f.h);
      const w = f.w * esc;
      const h = f.h * esc;
      doc.addImage(f.url, "JPEG", 16 + (caixa - w) / 2, y + 2 + (caixa - h) / 2, w, h);
    } else {
      doc.setFillColor(240, 240, 235).rect(16, y + 2, caixa, caixa, "F");
      doc.setFontSize(8).setTextColor(150).text("sem foto", 16 + caixa / 2, y + 20, { align: "center" });
    }
    const x = 16 + caixa + 6;
    const un = insumo.unidade || "";
    doc.setTextColor(40, 40, 35).setFont("helvetica", "bold").setFontSize(13);
    doc.text(`${k + 1}. ${insumo.nome}`, x, y + 8);
    doc.setFont("helvetica", "normal").setFontSize(10);
    const dose = porPipa && item.dose_pipa != null
      ? `Dose: ${numero(item.dose_pipa, 3)} ${un} por pipa`
      : `Dose: ${numero(item.dose_ha, 3)} ${un} por ha`;
    doc.text(dose, x, y + 15);
    doc.setFont("helvetica", "bold").setFontSize(11);
    doc.text(`Total: ${numero(item.quantidade, 2)} ${un}`, x, y + 22);
    doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(119, 119, 106);
    doc.text(`No depósito: ${emEmbalagens(insumo, item.quantidade).texto}`, x, y + 29);
    if (insumo.fabricante) doc.text(`Fabricante: ${insumo.fabricante}`, x, y + 34);
    y += alturaBloco;
  });

  if (ordem.observacao) {
    if (y + 20 > altura - 12) { doc.addPage(); y = 16; }
    y += 4;
    doc.setTextColor(40, 40, 35).setFont("helvetica", "bold").setFontSize(10).text("Observação", 14, y);
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(ordem.observacao, largura - 28), 14, y + 5);
  }

  const base = (ordem.titulo || "pulverizacao").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
  return { blob: doc.output("blob"), nome: `${base || "pulverizacao"}-${ordem.data}.pdf` };
}

/**
 * Manda o PDF: no celular (e no Windows) abre a janela de compartilhar, onde
 * aparece o WhatsApp. Onde não dá, baixa o arquivo para anexar na mão.
 * Devolve "compartilhado" ou "baixado".
 */
export async function compartilharPdf({ blob, nome }, texto) {
  const arquivo = new File([blob], nome, { type: "application/pdf" });
  if (navigator.canShare?.({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo], title: nome, text: texto });
      return "compartilhado";
    } catch (e) {
      if (e?.name === "AbortError") return "cancelado";
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return "baixado";
}
