import { useEffect, useRef, useState } from "react";

import { boletoJaLancado, lerCodigoBoleto } from "../lib/boleto";
import { boletoValido, criarDecodificador, FAIXAS_FOTO } from "../lib/codigoDeBarras";
import { Icone, Modal } from "./ui";

/**
 * Regiões da imagem onde procurar as barras, em [x, y, largura, altura]
 * relativos (0 a 1) e se é para girar. As barras do boleto são finas: em vez
 * de reduzir a imagem inteira (e borrar as barras), recorta faixas e lê cada
 * uma no tamanho original.
 */
const FAIXAS_CAMERA = [
  [0, 0.3, 1, 0.4, false], // a faixa do retângulo da tela
  [0.3, 0, 0.4, 1, true], // boleto em pé (celular em pé, barras de cima a baixo)
];

/** O quadro da câmera na hora da leitura, em JPEG (serve para a IA ler o nome do beneficiário). */
function fotoDoVideo(video) {
  return new Promise((resolve) => {
    const tela = document.createElement("canvas");
    tela.width = video.videoWidth;
    tela.height = video.videoHeight;
    if (!tela.width) { resolve(null); return; }
    tela.getContext("2d").drawImage(video, 0, 0);
    tela.toBlob(resolve, "image/jpeg", 0.85);
  });
}

function abrirImagem(arquivo) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Não consegui abrir essa foto."));
    img.src = URL.createObjectURL(arquivo);
  });
}

/**
 * Janela de leitura do boleto: câmera ao vivo, foto do código de barras ou
 * linha digitável digitada/colada. Chama `aoLer(lido, { foto })` com o que
 * entendeu do código e, quando leu por imagem, a foto (para ler o nome do
 * beneficiário, que o código não traz).
 * Com `dados`, avisa (e para de ler) quando o boleto já foi lançado;
 * `aoRepetido` é chamado nessa hora (o Modo Campo fala o aviso em voz alta).
 */
export default function LeitorBoleto({ aoLer, aoFechar, dados, ignorar, aoRepetido }) {
  const video = useRef(null);
  const [cameraErro, setCameraErro] = useState(null);
  const [cameraLigada, setCameraLigada] = useState(false);
  const [digitado, setDigitado] = useState("");
  const [erro, setErro] = useState(null);
  const [lendoFoto, setLendoFoto] = useState(false);
  const [controles, setControles] = useState(null);
  const [zoom, setZoom] = useState(null);
  const [lanterna, setLanterna] = useState(false);

  const mudarZoom = (v) => {
    setZoom(v);
    controles?.trilha.applyConstraints({ advanced: [{ zoom: v }] }).catch(() => {});
  };
  const alternarLanterna = () => {
    const ligar = !lanterna;
    setLanterna(ligar);
    controles?.trilha.applyConstraints({ advanced: [{ torch: ligar }] }).catch(() => {});
  };
  const decodificar = useRef(null);
  const [repetido, setRepetido] = useState(null);
  // Enquanto o aviso de repetido está na tela, a câmera não lê outro.
  const pausado = useRef(false);

  // Todo código lido passa por aqui: repetido mostra o aviso, novo segue.
  const receber = (lido, foto = null) => {
    const onde = boletoJaLancado(dados, lido.linha_digitavel, ignorar);
    if (!onde) { aoLer(lido, { foto }); return; }
    pausado.current = true;
    navigator.vibrate?.([300, 120, 300, 120, 300]);
    aoRepetido?.(onde);
    setRepetido({ lido, onde, foto });
  };
  const lerOutro = () => { setRepetido(null); setDigitado(""); pausado.current = false; };
  const receberRef = useRef(receber);
  useEffect(() => { receberRef.current = receber; });

  const obterDecodificador = async () => {
    if (!decodificar.current) decodificar.current = criarDecodificador();
    return decodificar.current;
  };

  useEffect(() => {
    let ativo = true;
    let fluxo = null;
    let espera = null;

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraErro("Este aparelho não deixa usar a câmera aqui. Tire uma foto do código ou digite os números.");
        return;
      }
      try {
        fluxo = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 2560 }, height: { ideal: 1440 } }, audio: false,
        });
      } catch {
        if (ativo) setCameraErro("Não consegui abrir a câmera (permissão negada ou sem câmera). Tire uma foto do código ou digite os números.");
        return;
      }
      if (!ativo) { fluxo.getTracks().forEach((t) => t.stop()); return; }
      const trilha = fluxo.getVideoTracks()[0];
      const recursos = trilha.getCapabilities?.() ?? {};
      // Foco contínuo: sem ele, alguns celulares ficam com o código embaçado.
      if (recursos.focusMode?.includes("continuous")) trilha.applyConstraints({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});
      setControles({
        trilha,
        zoom: recursos.zoom ? { min: recursos.zoom.min, max: Math.min(recursos.zoom.max, 5), passo: recursos.zoom.step || 0.1 } : null,
        lanterna: Boolean(recursos.torch),
      });
      video.current.srcObject = fluxo;
      await video.current.play().catch(() => {});
      setCameraLigada(true);
      if (!decodificar.current) decodificar.current = criarDecodificador();
      const ler = await decodificar.current;
      let vez = 0;

      const tentar = async () => {
        if (!ativo) return;
        if (pausado.current) { espera = setTimeout(tentar, 300); return; }
        try {
          // Uma faixa por vez: a tela não trava e as duas posições são testadas.
          const lido = boletoValido(await ler(video.current, [FAIXAS_CAMERA[vez++ % FAIXAS_CAMERA.length]]));
          if (lido && ativo) {
            navigator.vibrate?.(80);
            receberRef.current(lido, await fotoDoVideo(video.current).catch(() => null));
            espera = setTimeout(tentar, 300);
            return;
          }
        } catch { /* quadro ruim: tenta o próximo */ }
        espera = setTimeout(tentar, 150);
      };
      tentar();
    })();

    return () => {
      ativo = false;
      clearTimeout(espera);
      fluxo?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const lerFoto = async (e) => {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    setLendoFoto(true);
    setErro(null);
    try {
      const img = await abrirImagem(arquivo);
      const ler = await obterDecodificador();
      const lido = boletoValido(await ler(img, FAIXAS_FOTO));
      URL.revokeObjectURL(img.src);
      if (lido) receber(lido, arquivo);
      else setErro("Não achei o código de barras nessa foto. Tire de perto, com o boleto deitado e as barras bem nítidas — ou digite os números.");
    } catch (err) {
      setErro(err.message);
    } finally {
      setLendoFoto(false);
    }
  };

  const usarDigitado = () => {
    const lido = lerCodigoBoleto(digitado);
    if (lido.erro) setErro(lido.erro);
    else receber(lido);
  };

  return (
    <Modal titulo="Ler boleto" aoFechar={aoFechar}>
      <div className="leitor">
        {repetido && (
          <div className="aviso repetido" role="alert">
            <b>⚠️ Boleto repetido!</b>
            <span>Este boleto {repetido.onde} Confira para não pagar duas vezes.</span>
            <div className="barra" style={{ margin: "6px 0 0" }}>
              <button type="button" className="btn primario" onClick={lerOutro}>Ler outro boleto</button>
              <button type="button" className="btn" onClick={() => aoLer(repetido.lido, { foto: repetido.foto })}>Abrir mesmo assim</button>
            </div>
          </div>
        )}
        {!cameraErro && (
          <div className="leitor-video">
            <video ref={video} playsInline muted />
            <div className="leitor-mira" />
            {!cameraLigada && <span className="leitor-status">Abrindo a câmera…</span>}
          </div>
        )}
        {(controles?.zoom || controles?.lanterna) && (
          <div className="barra" style={{ marginBottom: 0 }}>
            {controles.zoom && (
              <label className="leitor-zoom">
                <span>Zoom</span>
                <input type="range" min={controles.zoom.min} max={controles.zoom.max} step={controles.zoom.passo}
                  value={zoom ?? controles.zoom.min} onChange={(e) => mudarZoom(Number(e.target.value))} />
              </label>
            )}
            {controles.lanterna && (
              <button type="button" className={`btn ${lanterna ? "primario" : ""}`} onClick={alternarLanterna}>
                {lanterna ? "Apagar lanterna" : "Lanterna"}
              </button>
            )}
          </div>
        )}
        <p className="descricao" style={{ margin: 0 }}>
          {cameraErro ?? "Aponte para o código de barras com as barras atravessando o retângulo de ponta a ponta, a uns 10–15 cm, sem reflexo de luz. Se não ler, chegue um pouco mais perto ou use o zoom. Quando ler, o celular vibra e já abre o boleto preenchido."}
        </p>

        <label className="btn">
          <Icone nome="camera" /> {lendoFoto ? "Procurando o código…" : "Tirar / escolher foto do código"}
          <input type="file" accept="image/*" capture="environment" hidden onChange={lerFoto} disabled={lendoFoto} />
        </label>

        <div className="campo">
          <span><label htmlFor="linha-boleto">Ou digite / cole a linha digitável</label></span>
          <div className="barra" style={{ marginBottom: 0 }}>
            <input id="linha-boleto" className="entrada" style={{ flex: 1, minWidth: 220 }} inputMode="numeric"
              placeholder="00000.00000 00000.000000 00000.000000 0 00000000000000"
              value={digitado} onChange={(e) => { setDigitado(e.target.value); setErro(null); }}
              onKeyDown={(e) => e.key === "Enter" && usarDigitado()} />
            <button className="btn primario" onClick={usarDigitado} disabled={!digitado.trim()}><Icone nome="check" /> Usar</button>
          </div>
        </div>
        {erro && <div className="aviso" style={{ margin: 0 }}>{erro}</div>}
      </div>
    </Modal>
  );
}
