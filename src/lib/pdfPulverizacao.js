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
  const alturaBloco = 48;
  itens.forEach(({ insumo, item }, k) => {
    if (y + alturaBloco > altura - 12) { doc.addPage(); y = 16; }
    doc.setDrawColor(220).setLineWidth(0.3).roundedRect(14, y, largura - 28, alturaBloco - 4, 2, 2);
    const f = fotos[k];
    const caixa = 38;
    if (f) {
      const esc = Math.min(caixa / f.w, caixa / f.h);
      const w = f.w * esc;
      const h = f.h * esc;
      doc.addImage(f.url, "JPEG", 16 + (caixa - w) / 2, y + 3 + (caixa - h) / 2, w, h);
    } else {
      doc.setFillColor(240, 240, 235).rect(16, y + 3, caixa, caixa, "F");
      doc.setFontSize(8).setTextColor(150).text("sem foto", 16 + caixa / 2, y + 22, { align: "center" });
    }
    const x = 16 + caixa + 6;
    const un = insumo.unidade || "";
    doc.setTextColor(40, 40, 35).setFont("helvetica", "bold").setFontSize(13);
    doc.text(`${k + 1}. ${insumo.nome}`, x, y + 8);

    // Destaque: a dose por hectare, grande, numa faixa verde.
    const doseHa = item.dose_ha != null && item.dose_ha !== ""
      ? n(item.dose_ha)
      : porPipa && item.dose_pipa != null ? n(item.dose_pipa) / n(ordem.ha_por_pipa) : null;
    const textoHa = doseHa != null ? `${numero(doseHa, 3)} ${un} por hectare` : "Dose por hectare não informada";
    doc.setFont("helvetica", "bold").setFontSize(16);
    const larguraFaixa = doc.getTextWidth(textoHa) + 8;
    doc.setFillColor(...verde).roundedRect(x, y + 11.5, larguraFaixa, 10, 1.5, 1.5, "F");
    doc.setTextColor(255, 255, 255).text(textoHa, x + 4, y + 18.8);

    // O resto em letra menor e cinza.
    doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(119, 119, 106);
    const extras = [];
    if (porPipa && item.dose_pipa != null) extras.push(`Por pipa: ${numero(item.dose_pipa, 3)} ${un}`);
    extras.push(`Total da ordem: ${numero(item.quantidade, 2)} ${un}`);
    doc.text(extras.join("   ·   "), x, y + 28);
    doc.text(`No depósito: ${emEmbalagens(insumo, item.quantidade).texto}`, x, y + 34);
    if (insumo.fabricante) doc.text(`Fabricante: ${insumo.fabricante}`, x, y + 40);
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

/** Nome de arquivo sem acento nem espaço. */
const nomeArquivo = (texto) => String(texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();

/**
 * Guia de preparo da calda, para o tratorista levar ao trator depois de
 * separar os produtos: letra grande, foto grande de cada produto e a dose em
 * destaque (por hectare; por pipa em letra menor), com o passo a passo de como misturar.
 * Devolve { blob, nome }.
 */
export async function gerarPdfDidatico(dados, ordem, operadorId) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const largura = doc.internal.pageSize.getWidth();
  const altura = doc.internal.pageSize.getHeight();
  const margem = 12;
  const util = largura - margem * 2;
  const verde = [45, 106, 79];
  const amarelo = [255, 244, 214];
  const escuro = [40, 40, 35];
  const cinza = [110, 110, 100];
  const hpp = n(ordem.ha_por_pipa);
  const area = n(ordem.area_ha);
  // Dá para falar em pipa quando a ordem diz quantos ha uma pipa faz.
  const temPipa = hpp > 0;
  const pipas = temPipa && area > 0 ? area / hpp : 0;
  const itens = itensDaOrdem(dados, ordem.id);
  const fotos = await Promise.all(itens.map((x) => fotoParaPdf(x.insumo?.fotos_rotulo?.[0], 500)));
  const talhoes = talhoesDaOrdem(dados, ordem);
  const fazenda = fazendaDoTalhao(dados);
  let y = 0;

  const novaPagina = () => { doc.addPage(); y = 16; };
  const cabe = (h) => { if (y + h > altura - 14) novaPagina(); };
  const texto = (t, x, yy, { tam = 11, negrito = false, cor = escuro, alinhar } = {}) => {
    doc.setFont("helvetica", negrito ? "bold" : "normal").setFontSize(tam).setTextColor(...cor);
    doc.text(t, x, yy, alinhar ? { align: alinhar } : undefined);
  };
  const bolinha = (num, x, yy, r = 6) => {
    doc.setFillColor(...verde).circle(x, yy, r, "F");
    texto(String(num), x, yy + r * 0.38, { tam: r * 2.6, negrito: true, cor: [255, 255, 255], alinhar: "center" });
  };

  // Cabeçalho
  doc.setFillColor(...verde).rect(0, 0, largura, 26, "F");
  texto("GUIA DE PREPARO DA CALDA", margem, 12, { tam: 18, negrito: true, cor: [255, 255, 255] });
  texto("Fazenda Carvalho Cruz", margem, 20, { tam: 11, cor: [255, 255, 255] });
  texto(dataBR(ordem.data), largura - margem, 20, { tam: 11, cor: [255, 255, 255], alinhar: "right" });
  y = 36;

  if (ordem.titulo) {
    const t = doc.setFont("helvetica", "bold").setFontSize(17).splitTextToSize(ordem.titulo, util);
    texto(t, margem, y, { tam: 17, negrito: true });
    y += t.length * 7 + 2;
  }

  // Onde e com quê
  const onde = talhoes.map((x) => `${x.talhao.nome}${fazenda(x.talhao) ? ` (${fazenda(x.talhao)})` : ""}${x.area_ha ? ` - ${numero(x.area_ha)} ha` : ""}`).join("; ") || "-";
  const linhasInfo = [
    ["Talhões", onde],
    ["Área total", `${numero(area)} ha`],
    ["Trator", nomeRef(dados, "maquinas", ordem.maquina_id) || "-"],
    ["Tratorista", nomeRef(dados, "funcionarios", ordem.operador_id || operadorId) || "-"],
  ];
  for (const [rot, val] of linhasInfo) {
    const v = doc.setFont("helvetica", "normal").setFontSize(12).splitTextToSize(val, util - 32);
    texto(rot, margem, y, { tam: 10, negrito: true, cor: cinza });
    texto(v, margem + 32, y, { tam: 12 });
    y += v.length * 5.2 + 1.5;
  }
  y += 3;

  // Resumo grande: quantas pipas
  doc.setFillColor(...amarelo).roundedRect(margem, y, util, temPipa ? 24 : 16, 3, 3, "F");
  if (temPipa) {
    texto(`${numero(pipas, 1)} PIPAS`, margem + 6, y + 11, { tam: 22, negrito: true });
    texto(`Cada pipa (tanque cheio) faz ${numero(hpp)} ha.`, margem + 6, y + 19, { tam: 12 });
    texto(`${numero(area)} ha ÷ ${numero(hpp)} ha`, largura - margem - 6, y + 11, { tam: 11, cor: cinza, alinhar: "right" });
    y += 32;
  } else {
    texto(`Dose por HECTARE - área total ${numero(area)} ha`, margem + 6, y + 10.5, { tam: 14, negrito: true });
    y += 24;
  }

  // Produtos: foto grande e a dose em destaque
  texto("PRODUTOS E DOSE POR HECTARE", margem, y, { tam: 15, negrito: true, cor: verde });
  y += 4;
  const blocoH = 54;
  itens.forEach(({ insumo, item }, k) => {
    cabe(blocoH);
    const un = insumo?.unidade || "";
    doc.setDrawColor(210).setLineWidth(0.4).roundedRect(margem, y, util, blocoH - 4, 3, 3);
    // Foto
    const caixa = 44;
    const fx = margem + 3;
    const fy = y + 3;
    const f = fotos[k];
    if (f) {
      const esc = Math.min(caixa / f.w, caixa / f.h);
      doc.addImage(f.url, "JPEG", fx + (caixa - f.w * esc) / 2, fy + (caixa - f.h * esc) / 2, f.w * esc, f.h * esc);
    } else {
      doc.setFillColor(240, 240, 235).rect(fx, fy, caixa, caixa, "F");
      texto("sem foto", fx + caixa / 2, fy + caixa / 2, { tam: 10, cor: [150, 150, 140], alinhar: "center" });
    }
    bolinha(k + 1, fx + 6, fy + 6, 5.5);

    const x = fx + caixa + 6;
    const larguraTexto = margem + util - x - 4;
    const nome = doc.setFont("helvetica", "bold").setFontSize(16).splitTextToSize(insumo?.nome || "Produto", larguraTexto);
    texto(nome.slice(0, 2), x, y + 10, { tam: 16, negrito: true });
    let yy = y + 10 + Math.min(nome.length, 2) * 6.5;
    if (insumo?.fabricante) { texto(insumo.fabricante, x, yy - 1.5, { tam: 9.5, cor: cinza }); yy += 3; }

    // Caixa verde com a dose principal: sempre a dose por hectare.
    const dosePipa = temPipa ? (item.dose_pipa != null ? n(item.dose_pipa) : n(item.dose_ha) * hpp) : null;
    const doseHa = item.dose_ha != null && item.dose_ha !== "" ? n(item.dose_ha) : temPipa && item.dose_pipa != null ? n(item.dose_pipa) / hpp : null;
    doc.setFillColor(...verde).roundedRect(x, yy, larguraTexto, 16.5, 2, 2, "F");
    texto("POR HECTARE:", x + 4, yy + 6, { tam: 9, negrito: true, cor: [255, 255, 255] });
    texto(doseHa != null ? `${numero(doseHa, 3)} ${un}` : "não informada", x + 4, yy + 13, { tam: 18, negrito: true, cor: [255, 255, 255] });
    if (temPipa) texto(`Em cada pipa: ${numero(dosePipa, 3)} ${un}`, x + larguraTexto - 4, yy + 12, { tam: 10.5, cor: [255, 255, 255], alinhar: "right" });
    yy += 21;
    texto(`Total para a área: ${numero(item.quantidade, 2)} ${un}`, x, yy, { tam: 10.5, cor: cinza });
    yy += 5.5;
    const emb = doc.setFont("helvetica", "normal").setFontSize(10).splitTextToSize(`Levar do depósito: ${emEmbalagens(insumo, item.quantidade).texto}`, larguraTexto);
    texto(emb.slice(0, 2), x, yy, { tam: 10, cor: cinza });
    y += blocoH;
  });

  // Passo a passo
  const passos = [
    ["Equipamento de proteção", "Antes de abrir os produtos, vista luva, máscara, óculos, avental e bota."],
    ["Água até a metade", `Encha ${temPipa ? "a pipa" : "o tanque"} até a metade com água limpa e ligue o agitador.`],
    ["Um produto de cada vez", `Coloque os produtos na ordem desta folha (1, 2, 3...), ${temPipa ? "na dose de UMA pipa" : "na dose certa para a área do tanque"}. Espere misturar antes do próximo.`],
    ["Completar com água", "Complete com água até o nível e deixe o agitador ligado durante toda a aplicação."],
    ["Lavar as embalagens", "Faça a tríplice lavagem: enxágue 3 vezes, jogue a água no tanque e fure a embalagem vazia."],
  ];
  if (temPipa && pipas > 1) passos.splice(4, 0, ["Repetir a cada pipa", `Faça a mesma mistura em cada pipa. São ${numero(pipas, 1)} pipas no total.${pipas % 1 > 0.05 ? " A última pipa é menor: use a mesma proporção de produto para a água que ela levar." : ""}`]);
  cabe(16 + passos.length * 15);
  y += 4;
  texto("COMO PREPARAR", margem, y, { tam: 15, negrito: true, cor: verde });
  y += 9;
  passos.forEach(([titulo, explica], k) => {
    const linhas = doc.setFont("helvetica", "normal").setFontSize(11).splitTextToSize(explica, util - 18);
    cabe(8 + linhas.length * 5);
    bolinha(k + 1, margem + 5, y + 1, 4.5);
    texto(titulo, margem + 14, y + 2.5, { tam: 12, negrito: true });
    texto(linhas, margem + 14, y + 8, { tam: 11 });
    y += 9 + linhas.length * 5;
  });

  if (ordem.observacao) {
    const linhas = doc.setFont("helvetica", "normal").setFontSize(11).splitTextToSize(ordem.observacao, util - 10);
    cabe(14 + linhas.length * 5);
    y += 3;
    doc.setFillColor(...amarelo).roundedRect(margem, y, util, 10 + linhas.length * 5, 3, 3, "F");
    texto("Recado do escritório", margem + 5, y + 6.5, { tam: 11, negrito: true });
    texto(linhas, margem + 5, y + 12, { tam: 11 });
  }

  // Rodapé em todas as páginas
  const total = doc.getNumberOfPages();
  for (let pg = 1; pg <= total; pg += 1) {
    doc.setPage(pg);
    texto(`Página ${pg} de ${total} - Em caso de dúvida, ligue para o escritório antes de aplicar.`, largura / 2, altura - 7, { tam: 8.5, cor: cinza, alinhar: "center" });
  }

  const base = nomeArquivo(ordem.titulo) || "pulverizacao";
  return { blob: doc.output("blob"), nome: `preparo-${base}-${ordem.data}.pdf` };
}

/** Salva o PDF direto na pasta de Downloads (sem janela de compartilhar). */
export function baixarPdf({ blob, nome }) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Manda o PDF: no celular (e no Windows) abre a janela de compartilhar, onde
 * aparece o WhatsApp. Onde não dá, baixa o arquivo para anexar na mão.
 * Devolve "compartilhado", "cancelado" ou "baixado".
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
  baixarPdf({ blob, nome });
  return "baixado";
}
