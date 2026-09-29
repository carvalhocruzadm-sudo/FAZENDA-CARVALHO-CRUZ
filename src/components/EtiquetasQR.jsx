import qrcode from "qrcode-generator";

import { maquinasDoPA } from "../lib/campo";
import { enderecoProduto } from "../lib/deposito";
import { Foto } from "./Foto";

export function QR({ texto }) {
  const qr = qrcode(0, "M");
  qr.addData(texto);
  qr.make();
  // SVG gerado aqui mesmo a partir do endereço: não vem de fora.
  return <div className="qr" dangerouslySetInnerHTML={{ __html: qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true }) }} />;
}

export function Etiqueta({ titulo, subtitulo, endereco, foto, figura }) {
  return (
    <div className="etiqueta">
      <div className="etiqueta-topo">
        {foto ? <Foto caminho={foto} className="etiqueta-foto" reserva={<span className="etiqueta-figura">{figura}</span>} />
          : <span className="etiqueta-figura">{figura}</span>}
        <div><b>{titulo}</b><small>{subtitulo}</small></div>
      </div>
      <QR texto={endereco} />
      <p>📱 Aponte a câmera do celular</p>
    </div>
  );
}

/** Folha para imprimir e plastificar: um QR por trator para colar no PA. */
export default function EtiquetasQR({ dados }) {
  const base = window.location.origin;
  const maquinas = maquinasDoPA(dados);
  return (
    <div className="cartao">
      <div className="barra nao-imprimir">
        <p className="descricao" style={{ margin: 0, flex: 1 }}>
          Um QR code para cada máquina com horímetro. Cole perto da bomba do PA (ou no trator). O tratorista lê com a
          câmera do celular e cai direto no abastecimento daquele trator. O celular precisa estar conectado com a conta
          do Modo Campo. Coloque a foto de cada trator na aba Tratores (fotos) para ela sair na etiqueta.
        </p>
        <button className="btn primario" onClick={() => window.print()}>🖨️ Imprimir</button>
      </div>
      <div className="etiquetas">
        {maquinas.map((m) => (
          <Etiqueta key={m.id} titulo={m.nome} subtitulo="⛽ Abastecimento" endereco={`${base}/campo/abastecer/${m.id}`} foto={m.foto} figura="🚜" />
        ))}
        <Etiqueta titulo="Todos os tratores" subtitulo="⛽ Abastecimento" endereco={`${base}/campo/abastecer`} figura="⛽" />
      </div>
    </div>
  );
}

/**
 * Depósito de químicos: os dois cartazes da porta (QR-1 saída, QR-2 entrada)
 * e uma etiqueta para colar na frente de cada produto.
 */
export function EtiquetasDeposito({ dados }) {
  const base = window.location.origin;
  const produtos = dados.insumos
    .filter((i) => i.ativo !== false)
    .sort((a, b) => a.nome.localeCompare(b.nome));
  return (
    <div className="cartao">
      <div className="barra nao-imprimir">
        <p className="descricao" style={{ margin: 0, flex: 1 }}>
          Cole os dois cartazes na entrada do depósito: <b>QR-1 Saída</b> abre as pulverizações para separar e
          <b> QR-2 Entrada</b> lança produto novo ou sobra. Cole cada etiqueta de produto na prateleira, bem na frente
          dele: na separação, o tratorista confere o produto lendo esta etiqueta. A foto do produto se cadastra em
          Químicos → Produtos.
        </p>
        <button className="btn primario" onClick={() => window.print()}>🖨️ Imprimir</button>
      </div>
      <div className="etiquetas" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", marginBottom: 20 }}>
        <div className="cartaz">
          <div className="cartaz-figura">📤</div>
          <h3>QR-1 · SAÍDA</h3>
          <p>Tirar produto para pulverizar</p>
          <QR texto={`${base}/campo/saida`} />
        </div>
        <div className="cartaz">
          <div className="cartaz-figura">📥</div>
          <h3>QR-2 · ENTRADA</h3>
          <p>Guardar produto novo ou sobra</p>
          <QR texto={`${base}/campo/entrada`} />
        </div>
      </div>
      <div className="etiquetas">
        {produtos.map((i) => (
          <Etiqueta key={i.id} titulo={i.nome} subtitulo={[i.embalagem_tipo, i.embalagem ? `${i.embalagem} ${i.unidade}` : null].filter(Boolean).join(" de ") || "Produto"}
            endereco={enderecoProduto(i.id)} foto={i.foto} figura="🧴" />
        ))}
      </div>
      {!produtos.length && <div className="vazio">Cadastre os produtos em Químicos → Produtos.</div>}
    </div>
  );
}
