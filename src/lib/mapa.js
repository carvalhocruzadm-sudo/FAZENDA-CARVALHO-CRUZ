/**
 * Localização dos locais das rotas. Guardamos "latitude, longitude" em texto
 * (ex.: "-17.123456, -39.654321"), que é o que o Google Maps mostra e aceita.
 */

/**
 * Tira as coordenadas de um texto: "lat, lng" ou um link do Google Maps
 * (…/@-17.1,-39.6,15z · ?q=-17.1,-39.6 · !3d-17.1!4d-39.6).
 */
export function lerCoordenadas(texto) {
  const t = String(texto ?? "");
  const padroes = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|ll|destination)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i,
    /^\s*(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)\s*$/,
  ];
  for (const p of padroes) {
    const m = t.match(p);
    if (m) {
      const lat = Number(m[1]), lng = Number(m[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
    }
  }
  return null;
}

export const formatarCoordenadas = ({ lat, lng }) => `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

export const linkMapa = (texto) => {
  const c = lerCoordenadas(texto);
  return c ? `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}` : null;
};

/** Distância em linha reta, em km. */
export function distanciaKm(a, b) {
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** Onde o aparelho está agora ({ lat, lng }). Pede permissão de localização. */
export function minhaPosicao({ precisa = true, espera = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error("Este aparelho não informa a localização.")); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => reject(new Error(e.code === 1 ? "Permita o acesso à localização para o app." : "Não consegui pegar a localização. Tente ao ar livre.")),
      { enableHighAccuracy: precisa, timeout: espera, maximumAge: 60000 },
    );
  });
}

/** O local cadastrado mais perto de `pos` (até `raioKm`), ou null. */
export function localMaisPerto(locais, pos, raioKm = 3) {
  let melhor = null;
  for (const l of locais) {
    const c = lerCoordenadas(l.localizacao);
    if (!c) continue;
    const d = distanciaKm(pos, c);
    if (d <= raioKm && (!melhor || d < melhor.d)) melhor = { local: l, d };
  }
  return melhor?.local ?? null;
}
