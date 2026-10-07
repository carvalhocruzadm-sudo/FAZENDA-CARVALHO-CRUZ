import { useEffect, useRef, useState } from "react";

/**
 * Câmera em tela cheia lendo QR code (e código de barras, no Android).
 * Usa o leitor do próprio celular (BarcodeDetector) quando existe; senão,
 * o jsQR, carregado só na hora (iPhone).
 */
export default function LeitorQR({ aoLer, aoFechar, titulo = "Aponte para o QR code do produto" }) {
  const video = useRef(null);
  const [erro, setErro] = useState(null);
  // O leitor liga a câmera uma vez só; a função de resposta pode mudar sem religar.
  const resposta = useRef(aoLer);
  useEffect(() => { resposta.current = aoLer; }, [aoLer]);

  useEffect(() => {
    let parado = false;
    let fluxo = null;
    let timer = null;
    const canvas = document.createElement("canvas");

    (async () => {
      try {
        fluxo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (parado) return;
        video.current.srcObject = fluxo;
        await video.current.play();

        let detectar;
        if ("BarcodeDetector" in window) {
          const formatos = await window.BarcodeDetector.getSupportedFormats?.() ?? ["qr_code"];
          const d = new window.BarcodeDetector({ formats: formatos.filter((f) => ["qr_code", "ean_13", "ean_8", "code_128", "upc_a"].includes(f)) });
          detectar = async () => (await d.detect(video.current))[0]?.rawValue;
        } else {
          const { default: jsQR } = await import("jsqr");
          detectar = async () => {
            const v = video.current;
            if (!v.videoWidth) return null;
            const escala = Math.min(1, 640 / v.videoWidth);
            canvas.width = v.videoWidth * escala;
            canvas.height = v.videoHeight * escala;
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            return jsQR(img.data, img.width, img.height)?.data;
          };
        }

        const rodar = async () => {
          if (parado) return;
          try {
            const lido = await detectar();
            if (lido && !parado) { parado = true; resposta.current(lido); return; }
          } catch { /* quadro ruim: tenta o próximo */ }
          timer = setTimeout(rodar, 180);
        };
        rodar();
      } catch (e) {
        setErro(e?.name === "NotAllowedError"
          ? "O celular não deixou usar a câmera. Toque no cadeado do navegador e permita a câmera."
          : "Não foi possível abrir a câmera.");
      }
    })();

    return () => {
      parado = true;
      clearTimeout(timer);
      fluxo?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="leitor">
      <video ref={video} playsInline muted />
      <div className="leitor-mira" />
      <p className="leitor-titulo">{erro ?? titulo}</p>
      <button type="button" className="campo-btn cinza leitor-fechar" onClick={aoFechar}>✕ Fechar</button>
    </div>
  );
}
