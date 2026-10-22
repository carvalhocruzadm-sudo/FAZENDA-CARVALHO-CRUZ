/**
 * Princípio ativo pelo nome comercial do produto. Tabela tirada das bulas e
 * fichas (AGROFIT/MAPA, Agrolink, Revista Cultivar, fabricantes): primeiro os
 * produtos que já estão no cadastro da fazenda, depois os mais comuns de
 * citros e milho. Serve para preencher sozinho; vale sempre o rótulo/bula.
 *
 * A chave é o nome sem acento, em maiúsculas. O nome do produto casa com a
 * chave inteira ou começando por ela ("CERCOBIN 875 WG" → "CERCOBIN"); vale
 * a chave mais comprida ("ABAMEX MAXX" antes de "ABAMEX").
 */
const TABELA = {
  // ─── Produtos do cadastro da fazenda ──────────────────────────────────────
  "08-40-08": "Adubo NPK 08-40-08 (8% N, 40% P2O5, 8% K2O)",
  "2,4 D": "2,4-D (sal de dimetilamina)",
  "2,4-D": "2,4-D (sal de dimetilamina)",
  "ABAMEX": "Abamectina 18 g/L",
  "ABAMEX MAXX": "Abamectina 72 g/L",
  "ACEWAY": "Acetamiprido 250 g/kg + bifentrina 250 g/kg",
  "ADVER": "Clorfenapir 240 g/L",
  "AIRTRUCK": "Adjuvante antideriva (extratos vegetais)",
  "AGROWET": "Adjuvante espalhante (surfactante)",
  "AURORA": "Carfentrazona-etílica 400 g/L",
  "BRILHANTE": "Metomil 215 g/L",
  "BRILHANTEBR": "Metomil 215 g/L",
  "CERCOBIN": "Tiofanato-metílico",
  "CLORFENAPIR": "Clorfenapir 240 g/L",
  "COMONI": "Cobalto + molibdênio + níquel (Co-Mo-Ni)",
  "CRUCIAL": "Glifosato (sal de potássio)",
  "FIPRONIL": "Fipronil",
  "FLUMIZYN": "Flumioxazina 500 g/kg",
  "GLIFOSATO": "Glifosato",
  "KCL": "Cloreto de potássio (60% K2O)",
  "KINGSTAR": "Azoxistrobina 600 g/kg + ciproconazol 240 g/kg",
  "LOWER 7": "Ureia + ácido sulfúrico (acidificante de calda)",
  "MAGNUM": "Acefato 970 g/kg",
  "MAP": "Fosfato monoamônico (11% N, 52% P2O5)",
  "METOMIL": "Metomil",
  "PRIORI EXTRA": "Azoxistrobina 200 g/L + ciproconazol 80 g/L",
  "PRIORI XTRA": "Azoxistrobina 200 g/L + ciproconazol 80 g/L",
  "SONDA": "Terbutilazina 500 g/L",
  "SPERTO": "Acetamiprido 250 g/kg + bifentrina 250 g/kg",
  "TEBURAZ": "Azoxistrobina 120 g/L + tebuconazol 200 g/L",
  "TIOFANATO": "Tiofanato-metílico",
  "UREIA": "Ureia (45% N)",
  "VORAX": "Bioestimulante: ácido L-glutâmico, extrato de algas, glicina-betaína e N",
  "WETCIT": "Adjuvante espalhante (surfactante com óleo de laranja)",

  // ─── Herbicidas comuns ────────────────────────────────────────────────────
  "ACCENT": "Nicossulfurom 750 g/kg",
  "AMINOL": "2,4-D (sal de dimetilamina)",
  "BORAL": "Sulfentrazona 500 g/L",
  "CALLISTO": "Mesotriona 480 g/L",
  "DMA 806": "2,4-D (sal de dimetilamina) 806 g/L",
  "DUAL GOLD": "S-metolacloro 960 g/L",
  "FINALE": "Glufosinato-sal de amônio 200 g/L",
  "GESAPRIM": "Atrazina",
  "GOAL": "Oxifluorfem 240 g/L",
  "HEAT": "Saflufenacil 700 g/kg",
  "KARMEX": "Diurom 800 g/kg",
  "LIBERTY": "Glufosinato-sal de amônio 200 g/L",
  "PLATEAU": "Imazapique 700 g/kg",
  "PRIMESTRA GOLD": "Atrazina 370 g/L + S-metolacloro 290 g/L",
  "PRIMOLEO": "Atrazina 400 g/L + óleo mineral",
  "ROUNDUP": "Glifosato",
  "SANSON": "Nicossulfurom 40 g/L",
  "SELECT": "Cletodim 240 g/L",
  "SOBERAN": "Tembotriona 420 g/L",
  "TORDON": "Picloram + 2,4-D",
  "VERDICT": "Haloxifope-P-metílico",
  "ZAPP": "Glifosato (sal de potássio)",

  // ─── Inseticidas e acaricidas comuns ──────────────────────────────────────
  "ACTARA": "Tiametoxam 250 g/kg",
  "AMPLIGO": "Clorantraniliprole 100 g/L + lambda-cialotrina 50 g/L",
  "BELT": "Flubendiamida 480 g/L",
  "BENEVIA": "Ciantraniliprole 100 g/L",
  "CONNECT": "Imidacloprido 100 g/L + beta-ciflutrina 12,5 g/L",
  "CROPSTAR": "Imidacloprido 150 g/L + tiodicarbe 450 g/L",
  "DECIS": "Deltametrina 25 g/L",
  "DIMILIN": "Diflubenzurom",
  "ENGEO PLENO": "Tiametoxam 141 g/L + lambda-cialotrina 106 g/L",
  "ENVIDOR": "Espirodiclofeno 240 g/L",
  "EVIDENCE": "Imidacloprido 700 g/kg",
  "FASTAC": "Alfa-cipermetrina 100 g/L",
  "GALIL": "Imidacloprido 250 g/L + bifentrina 50 g/L",
  "INTREPID": "Metoxifenozida 240 g/L",
  "KARATE ZEON": "Lambda-cialotrina 50 g/L",
  "KRAFT": "Abamectina 36 g/L",
  "KUMULUS": "Enxofre 800 g/kg",
  "LANNATE": "Metomil 215 g/L",
  "LORSBAN": "Clorpirifós 480 g/L",
  "MARSHAL": "Carbossulfano 250 g/L",
  "MATCH": "Lufenurom 50 g/L",
  "MOSPILAN": "Acetamiprido 200 g/kg",
  "MOVENTO": "Espirotetramate 150 g/L",
  "OBERON": "Espiromesifeno 240 g/L",
  "ORTHENE": "Acefato 750 g/kg",
  "ORTUS": "Fenpiroximato 50 g/L",
  "PERITO": "Acefato 970 g/kg",
  "PIRATE": "Clorfenapir 240 g/L",
  "POLO": "Diafentiurom 500 g/L",
  "PREMIO": "Clorantraniliprole 200 g/L",
  "PROVADO": "Imidacloprido 200 g/L",
  "REGENT": "Fipronil 800 g/kg",
  "RIMON": "Novalurom 100 g/L",
  "SIVANTO": "Flupiradifurona 200 g/L",
  "STANDAK": "Fipronil 250 g/L",
  "TALISMAN": "Carbossulfano 150 g/L + bifentrina 50 g/L",
  "THIOVIT": "Enxofre 800 g/kg",
  "TORQUE": "Óxido de fenbutatina 500 g/L",
  "VERIMARK": "Ciantraniliprole 200 g/L",
  "VERTIMEC": "Abamectina 18 g/L",

  // ─── Fungicidas comuns ────────────────────────────────────────────────────
  "ABACUS": "Piraclostrobina 260 g/L + epoxiconazol 160 g/L",
  "AMISTAR TOP": "Azoxistrobina 200 g/L + difenoconazol 125 g/L",
  "BRAVONIL": "Clorotalonil",
  "COMET": "Piraclostrobina 250 g/L",
  "CUPROGARB": "Oxicloreto de cobre",
  "DITHANE": "Mancozebe 800 g/kg",
  "ELATUS": "Azoxistrobina 300 g/kg + benzovindiflupir 150 g/kg",
  "FOLICUR": "Tebuconazol 200 g/L",
  "FOX": "Trifloxistrobina 150 g/L + protioconazol 175 g/L",
  "FOX XPRO": "Bixafem 125 g/L + protioconazol 175 g/L + trifloxistrobina 150 g/L",
  "KOCIDE": "Hidróxido de cobre",
  "MANZATE": "Mancozebe 800 g/kg",
  "NATIVO": "Trifloxistrobina 100 g/L + tebuconazol 200 g/L",
  "OPERA": "Piraclostrobina 133 g/L + epoxiconazol 50 g/L",
  "OPERA ULTRA": "Piraclostrobina 130 g/L + metconazol 80 g/L",
  "PRIORI": "Azoxistrobina 250 g/L",
  "PRIORI TOP": "Azoxistrobina 200 g/L + difenoconazol 125 g/L",
  "RECOP": "Oxicloreto de cobre",
  "SCORE": "Difenoconazol 250 g/L",
  "SUPERA": "Hidróxido de cobre",
  "TILT": "Propiconazol 250 g/L",
  "UNIZEB": "Mancozebe 800 g/kg",

  // ─── Adubos ───────────────────────────────────────────────────────────────
  "CLORETO DE POTASSIO": "Cloreto de potássio (60% K2O)",
  "MAP PURIFICADO": "Fosfato monoamônico purificado (12% N, 61% P2O5)",
  "NITRATO DE CALCIO": "Nitrato de cálcio (15% N, 19% Ca)",
  "NITRATO DE POTASSIO": "Nitrato de potássio (13% N, 44% K2O)",
  "SULFATO DE AMONIO": "Sulfato de amônio (21% N, 24% S)",
  "SUPERFOSFATO SIMPLES": "Superfosfato simples (18% P2O5)",
  "SUPERFOSFATO TRIPLO": "Superfosfato triplo (41% P2O5)",
};

/** Nutriente que aparece no meio do nome (ex.: "Ager manganês", "Boro líquido"). */
const NUTRIENTES = [
  ["MANGANES", "Manganês (Mn)"], ["ZINCO", "Zinco (Zn)"], ["BORO", "Boro (B)"],
  ["MAGNESIO", "Magnésio (Mg)"], ["MOLIBDENIO", "Molibdênio (Mo)"], ["COBRE", "Cobre (Cu)"],
  ["CALCIO", "Cálcio (Ca)"], ["POTASSIO", "Potássio (K2O)"], ["NITROGENIO", "Nitrogênio (N)"],
];

/** Nome sem acento, em maiúsculas e com espaços simples (como as chaves da tabela). */
export const normalizar = (nome) => String(nome ?? "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toUpperCase().replace(/\s+/g, " ").trim();

const CHAVES = Object.keys(TABELA).sort((a, b) => b.length - a.length);

/** Princípio ativo conhecido para o nome comercial, ou null. */
export function principioDe(nome) {
  const n = normalizar(nome);
  if (!n) return null;
  const chave = CHAVES.find((c) => n === c || n.startsWith(`${c} `) || n.startsWith(`${c}-`));
  if (chave) return TABELA[chave];
  const palavras = n.split(/[^A-Z0-9]+/);
  return NUTRIENTES.find(([p]) => palavras.includes(p))?.[1] ?? null;
}
