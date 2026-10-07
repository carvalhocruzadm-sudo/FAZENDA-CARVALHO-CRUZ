/**
 * Planilha do estoque para o agrônomo (.xlsx) com as fotos dos rótulos dentro.
 * A biblioteca é pesada, então só é carregada quando o botão é clicado.
 */

const LARGURA_FOTO = 170; // pixels na planilha

function tamanhoDaFoto(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ largura: img.width, altura: img.height });
    img.onerror = () => resolve({ largura: 1, altura: 1 });
    img.src = src;
  });
}

function baixar(buffer, nome) {
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** `linhas`: [{ produto, fabricante, tipo, principio, unidade, entrou, aplicado, saldo, minimo, situacao, custo, valor, observacao, fotos }] */
export async function gerarPlanilhaAgronomo(nomeArquivo, linhas) {
  const { default: ExcelJS } = await import("exceljs");
  const pasta = new ExcelJS.Workbook();

  // Aba 1 — o estoque
  const est = pasta.addWorksheet("Estoque");
  est.columns = [
    { header: "Produto", key: "produto", width: 30 },
    { header: "Fabricante", key: "fabricante", width: 22 },
    { header: "Tipo", key: "tipo", width: 16 },
    { header: "Princípio ativo", key: "principio", width: 26 },
    { header: "Unidade", key: "unidade", width: 10 },
    { header: "Entrou", key: "entrou", width: 12 },
    { header: "Aplicado", key: "aplicado", width: 12 },
    { header: "Saldo", key: "saldo", width: 12 },
    { header: "Estoque mínimo", key: "minimo", width: 15 },
    { header: "Situação", key: "situacao", width: 12 },
    { header: "Custo médio (R$)", key: "custo", width: 16, style: { numFmt: "#,##0.00" } },
    { header: "Valor em estoque (R$)", key: "valor", width: 20, style: { numFmt: "#,##0.00" } },
    { header: "Fotos", key: "nfotos", width: 8 },
    { header: "Observação", key: "observacao", width: 40 },
  ];
  est.getRow(1).font = { bold: true };
  est.views = [{ state: "frozen", ySplit: 1 }];
  for (const l of linhas) est.addRow({ ...l, nfotos: l.fotos.length });

  // Aba 2 — os rótulos (uma linha por produto, até 6 fotos lado a lado)
  const rot = pasta.addWorksheet("Rótulos");
  rot.getColumn(1).width = 30;
  for (let c = 2; c <= 7; c++) rot.getColumn(c).width = 26;
  rot.addRow(["Produto", "Foto 1", "Foto 2", "Foto 3", "Foto 4", "Foto 5", "Foto 6"]).font = { bold: true };
  rot.views = [{ state: "frozen", ySplit: 1 }];

  for (const l of linhas.filter((x) => x.fotos.length)) {
    const linha = rot.addRow([`${l.produto} (${l.unidade})`]);
    linha.getCell(1).alignment = { vertical: "middle", wrapText: true };
    let maisAlta = 60;
    for (const [i, foto] of l.fotos.entries()) {
      const { largura, altura } = await tamanhoDaFoto(foto);
      const alturaPx = Math.round((LARGURA_FOTO * altura) / largura);
      maisAlta = Math.max(maisAlta, alturaPx);
      const id = pasta.addImage({ base64: foto, extension: "jpeg" });
      rot.addImage(id, { tl: { col: i + 1 + 0.05, row: linha.number - 1 + 0.05 }, ext: { width: LARGURA_FOTO, height: alturaPx } });
    }
    linha.height = maisAlta * 0.75 + 6; // altura da linha é em pontos
  }

  baixar(await pasta.xlsx.writeBuffer(), nomeArquivo);
}
