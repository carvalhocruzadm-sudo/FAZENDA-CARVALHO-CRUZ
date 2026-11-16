/** Entrega ao app a chave pública do push (é pública mesmo: não dá acesso a nada). */
import { FALTA_CONFIGURAR, chavesPush } from "./_push.js";

export default async function handler(_req, res) {
  if (FALTA_CONFIGURAR) return res.status(500).json({ erro: FALTA_CONFIGURAR });
  try {
    const { publica } = await chavesPush();
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ chave: publica });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
}
