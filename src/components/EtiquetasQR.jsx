import qrcode from "qrcode-generator";

import { maquinasDoPA } from "../lib/campo";
import { Foto } from "./Foto";

function QR({ texto }) {
  const qr = qrcode(0, "M");
  qr.addData(texto);
  qr.make();
  // SVG gerado aqui mesmo a partir do endereço: não vem de fora.
  return <div className="qr" dangerouslySetInnerHTML={{ __html: qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true }) }} />;
}

function Etiqueta({ titulo, subtitulo, endereco, foto, figura }) {
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
          do Modo Campo. Coloque a foto de cada máquina no Inventário para ela sair na etiqueta.
        </p>
        <button className="btn primario" onClick={() => window.print()}>🖨️ Imprimir</button>
      </div>
      <div className="etiquetas">
        {maquinas.map((m) => (
          <Etiqueta key={m.id} titulo={m.nome} subtitulo="⛽ Abastecimento" endereco={`${base}/campo/abastecer/${m.id}`} foto={m.foto} figura="🚜" />
        ))}
        <Etiqueta titulo="Todos os tratores" subtitulo="⛽ Abastecimento" endereco={`${base}/campo`} figura="⛽" />
      </div>
    </div>
  );
}
