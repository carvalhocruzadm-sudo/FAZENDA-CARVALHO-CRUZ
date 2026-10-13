/**
 * Leitura da foto do ticket da balança pela IA do Google (função ler-ticket no Supabase).
 *
 * A foto vira os dados da pesagem: placa, tipo de carro, tara (entrada),
 * bruto (saída), peso líquido, desconto, comprador, motorista e nota fiscal.
 * Só preenche o que está vazio: o que alguém já digitou fica como está.
 *
 * Ticket repartido em várias vendas (vários talhões ou turmas): tara e bruto
 * são do caminhão inteiro, então não entram nos campos (a conta trocaria o
 * peso da parte pelo da carga toda); vão para a observação.
 */

import { lerFoto } from "./db";
import { urlDaFoto } from "./fotos";
import { numero } from "./formato";
import { supabase } from "./supabase";

/** "12.340" / "12340,5" / 12340 → 12340 (kg). */
export function paraKg(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[^\d.,-]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return s && Number.isFinite(n) ? n : null;
}

const texto = (v) => (v == null ? "" : String(v).trim());
const vazio = (v) => v == null || v === "";
const semAcento = (s) => texto(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Base64 (sem o "data:…,") da foto guardada no aparelho ou na nuvem. */
async function base64DaFoto(caminho) {
  let blob = (await lerFoto(caminho))?.blob;
  if (!blob) {
    const url = await urlDaFoto(caminho);
    if (!url) throw new Error("Não achei a foto do ticket (precisa de internet para baixá-la).");
    blob = await (await fetch(url)).blob();
  }
  const dataUrl = await new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(leitor.result);
    leitor.onerror = () => reject(new Error("Não foi possível abrir a foto."));
    leitor.readAsDataURL(blob);
  });
  return String(dataUrl).split(",")[1];
}

/** Manda a foto para a IA e devolve o que ela leu do ticket. */
export async function lerTicketDaFoto(caminho) {
  if (!supabase) throw new Error("Precisa do Supabase configurado e de internet.");
  if (!navigator.onLine) throw new Error("Sem internet agora: a foto é lida quando a conexão voltar.");
  const imagem = await base64DaFoto(caminho);
  const { data, error } = await supabase.functions.invoke("ler-ticket", { body: { imagem } });
  if (error) {
    // A função devolve { erro } mesmo quando falha: mostra essa mensagem, que é a que explica.
    const corpo = await error.context?.json?.().catch(() => null);
    throw new Error(corpo?.erro ?? error.message);
  }
  if (data?.erro) throw new Error(data.erro);
  const t = data?.ticket ?? {};
  return {
    data: /^\d{4}-\d{2}-\d{2}$/.test(texto(t.data)) ? texto(t.data) : null,
    placa: texto(t.placa).toUpperCase().replace(/[^A-Z0-9]/g, "") || null,
    tipo_carro: texto(t.tipo_carro) || null,
    motorista: texto(t.motorista) || null,
    comprador: texto(t.comprador) || null,
    produto: texto(t.produto) || null,
    tara: paraKg(t.peso_tara),
    bruto: paraKg(t.peso_bruto),
    liquido: paraKg(t.peso_liquido),
    desconto: paraKg(t.desconto_kg),
    numero: texto(t.numero_ticket) || null,
    nota_fiscal: texto(t.nota_fiscal) || null,
  };
}

/** O funcionário com esse nome (só se for um só). */
function motoristaPeloNome(dados, nome) {
  const alvo = semAcento(nome);
  if (!alvo) return null;
  const achados = (dados.funcionarios ?? []).filter((f) => {
    const n = semAcento(f.nome);
    return n && (n === alvo || alvo.startsWith(`${n} `) || n.startsWith(`${alvo} `));
  });
  return achados.length === 1 ? achados[0].id : null;
}

/** O caminhão próprio com essa placa. */
function caminhaoPelaPlaca(dados, placa) {
  if (!placa) return null;
  const m = (dados.maquinas ?? []).find((x) => x.categoria === "caminhao" && texto(x.placa).toUpperCase().replace(/[^A-Z0-9]/g, "") === placa);
  return m?.id ?? null;
}

/** Linha "Ticket nº 123 · tara 15.000 kg · bruto 21.250 kg" para a observação. */
export function resumoDoTicket(t) {
  return [
    t.numero ? `Ticket nº ${t.numero}` : "Ticket",
    t.tara != null ? `tara ${numero(t.tara, 0)} kg` : null,
    t.bruto != null ? `bruto ${numero(t.bruto, 0)} kg` : null,
    t.liquido != null ? `líquido ${numero(t.liquido, 0)} kg` : null,
    t.desconto ? `desconto ${numero(t.desconto, 0)} kg` : null,
  ].filter(Boolean).join(" · ");
}

/**
 * O que a leitura acrescenta na venda `reg`, só nos campos vazios.
 * `sozinha`: a venda é a carga inteira (o ticket não foi repartido).
 * Devolve { patch, preenchidos: [rótulos], aviso }.
 */
export function completarVenda(reg, t, dados, { sozinha }) {
  const patch = {};
  const preenchidos = [];
  const preencher = (chave, valor, rotulo) => {
    if (valor == null || valor === "" || !vazio(reg[chave])) return;
    patch[chave] = valor;
    preenchidos.push(rotulo);
  };

  preencher("placa", t.placa, "placa");
  preencher("tipo_carro", t.tipo_carro, "tipo de carro");
  preencher("comprador", t.comprador, "comprador");
  preencher("nota_fiscal", t.nota_fiscal, "nota fiscal");
  preencher("motorista_id", motoristaPeloNome(dados, t.motorista), "motorista");
  preencher("caminhao_id", caminhaoPelaPlaca(dados, t.placa), "caminhão");

  let aviso = null;
  if (sozinha) {
    if (t.tara != null && t.bruto != null && vazio(reg.peso_entrada) && vazio(reg.peso_saida)) {
      const doTicket = Math.abs(t.bruto - t.tara);
      const atual = vazio(reg.peso_liquido) ? null : Number(reg.peso_liquido);
      if (atual != null && Math.abs(atual - doTicket) > 1) {
        aviso = `O peso líquido lançado (${numero(atual, 0)} kg) é diferente do ticket (${numero(doTicket, 0)} kg). Ficou o do ticket — confira.`;
      }
      patch.peso_entrada = t.tara;
      patch.peso_saida = t.bruto;
      preenchidos.push("peso de entrada e saída");
    } else if (t.liquido != null && vazio(reg.peso_liquido)) {
      patch.peso_liquido = t.liquido;
      preenchidos.push("peso líquido");
    }
    preencher("desconto_kg", t.desconto || null, "desconto");
  } else if (t.tara != null || t.bruto != null) {
    // Ticket repartido: os pesos do caminhão inteiro ficam só anotados.
    const linha = resumoDoTicket(t);
    if (!texto(reg.observacao).includes(linha)) {
      patch.observacao = [texto(reg.observacao), linha].filter(Boolean).join(" · ");
      preenchidos.push("pesos do ticket (na observação, porque a carga foi repartida)");
    }
  }
  return { patch, preenchidos, aviso };
}

/** Quantas outras vendas usam a mesma foto (o ticket foi repartido entre elas). */
export const outrasDoTicket = (dados, reg) =>
  reg.foto_ticket ? (dados.vendas ?? []).filter((v) => v.foto_ticket === reg.foto_ticket && v.id !== reg.id).length : 0;
