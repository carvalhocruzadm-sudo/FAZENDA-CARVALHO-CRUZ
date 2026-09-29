"""
Importa o histórico das planilhas da fazenda para o Supabase.

Lê as planilhas (MILHO_2025, MILHO_2026, VENDAS_LARANJA, FINANCEIRO_2026 e
FRETES) e gera supabase/importacao-historico.sql, para colar no SQL Editor.

    python3 scripts/importar-planilhas.py <pasta com os .xlsx>

O SQL já traz o schema.sql na frente (cria colunas que faltarem) e pode ser
rodado de novo sem duplicar nada: cada linha ganha um id fixo, tirado da
planilha + aba + linha. Tudo o que entra marca a coluna `importado`, então dá
para desfazer com `delete from <tabela> where importado is not null`.

Precisa do openpyxl (pip install openpyxl).
"""
import datetime as dt
import re
import sys
import uuid
from pathlib import Path

import openpyxl
from openpyxl.utils import column_index_from_string as ci

RAIZ = Path(__file__).resolve().parent.parent
PASTA = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
HOJE = dt.date.today()
NS = uuid.UUID("5b3e8f0a-7c1d-4e2a-9f6b-0a1b2c3d4e5f")

# Ids do cadastro inicial (src/lib/seed.js).
def sid(grupo, n):
    return f"00000000-0000-4000-{grupo}-{n:012d}"

CULT = {"milho": sid("8000", 1), "laranja": sid("8000", 2), "silagem": sid("8000", 5)}
TALHOES = {
    "GALPAO": 1, "MEIO": 2, "GILTON": 3, "FARIA": 4, "BARRAGEM": 5, "COQUEIRO": 6,
    "ESPINHO": 7, "MURTA": 8, "TANQUE": 9, "CANABRAVA": 10, "GEORGE": 11, "GOERGE": 11,
    "TRIUNFO": 12, "GAMELEIRA": 13, "JUERANA": 14, "AGUAS CLARAS": 15,
}
CAMINHAO = sid("8300", 1)

avisos = []
ultima_data = {}  # data da linha anterior, para linha de venda sem data
linhas_sql = []
contagem = {}
registros = []  # (tabela, registro) — para a conferência no fim


def arquivo(chave):
    achados = sorted(PASTA.glob(f"*{chave}*.xlsx"))
    if not achados:
        sys.exit(f"Não achei a planilha {chave} em {PASTA}")
    return achados[0]


def num(v):
    return float(v) if isinstance(v, (int, float)) else 0.0


def txt(v):
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def data(v, onde, ano=None):
    """
    Data da célula, como data do Excel ou texto dd/mm/aaaa. Ano digitado errado
    (no futuro, ou longe do ano da planilha) vira o ano da planilha; o original
    fica anotado na observação.
    """
    if v is None or v == "":
        return None, None
    if hasattr(v, "date"):
        d = v.date()
    else:
        digitos = re.sub(r"\D", "", str(v))
        try:
            dia, mes, a = int(digitos[:2]), int(digitos[2:4]), int(digitos[4:])
            a = a + 1800 if a < 1000 and a > 200 else a  # 0225 → 2025
            d = dt.date(a, mes, dia)
        except (ValueError, IndexError):
            avisos.append(f"{onde}: data ilegível ({v!r}) — ficou com a data da linha anterior")
            return None, f"data na planilha: {v}"
        avisos.append(f"{onde}: data digitada como texto ({v!r}), importada como {d:%d/%m/%Y}")
        return d.isoformat(), f"data na planilha: {v}"
    fora = ano and (d > HOJE or abs(d.year - ano) > 1)
    if d > HOJE or fora:
        corrigida = d.replace(year=ano or d.year - 1)
        if corrigida > HOJE:
            corrigida = corrigida.replace(year=corrigida.year - 1)
        avisos.append(f"{onde}: data {d:%d/%m/%Y} fora do ano da planilha, importada como {corrigida:%d/%m/%Y}")
        return corrigida.isoformat(), f"data na planilha: {d:%d/%m/%Y}"
    return d.isoformat(), None


def talhao(nome, onde):
    if not nome:
        return None
    chave = str(nome).strip().upper().replace("Á", "A")
    if chave in TALHOES:
        return sid("8200", TALHOES[chave])
    avisos.append(f"{onde}: sítio/talhão '{nome}' não cadastrado — ficou sem talhão")
    return None


def lit(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(round(v, 6))
    return "'" + str(v).replace("'", "''") + "'"


def inserir(tabela, chave, reg):
    reg = {"id": str(uuid.uuid5(NS, chave)), **reg, "importado": chave.split("#")[0]}
    cols = list(reg)
    linhas_sql.append(
        f"insert into public.{tabela} ({', '.join(cols)}) values ({', '.join(lit(reg[c]) for c in cols)}) on conflict (id) do nothing;"
    )
    contagem[tabela] = contagem.get(tabela, 0) + 1
    registros.append((tabela, reg))


def juntar_obs(*partes):
    partes = [p for p in partes if p]
    return " · ".join(partes) or None


# ─── Milho (vendas por carga + recebimentos) ────────────────────────────────

def vendas_milho(ano, aba):
    ws = openpyxl.load_workbook(arquivo(f"MILHO_{ano}"), data_only=True)[aba]
    for r in range(5, ws.max_row + 1):
        v = [ws.cell(r, c).value for c in range(2, 13)]
        comprador, dia, carro, placa, talh, preco, tara, bruto, liq, sacos, valor = v
        if not txt(comprador) or not num(liq):
            continue
        onde = f"MILHO_{ano} › {aba} linha {r}"
        d, obs = data(dia, onde, ano)
        d = d or ultima_data.get("v")
        ultima_data["v"] = d
        inserir("vendas", f"MILHO_{ano}/{aba}#{r}", {
            "data": d, "comprador": txt(comprador), "cultura_id": CULT["milho"], "safra": f"Milho {ano}",
            "talhao_id": talhao(talh, onde), "classificacao": "Grão", "placa": txt(placa), "tipo_carro": txt(carro),
            "peso_entrada": num(tara), "peso_saida": num(bruto), "peso_liquido": num(liq),
            "unidade": "sc60", "quantidade": num(liq) / 60, "preco_unitario": num(preco),
            "valor_bruto": num(valor), "valor_desconto": 0, "valor": num(valor), "volumes": num(sacos) or None,
            "observacao": juntar_obs(obs),
        })
    # PAGANTES (colunas N, O, P)
    for r in range(5, ws.max_row + 1):
        pagante, dia, valor = (ws.cell(r, c).value for c in (14, 15, 16))
        if not txt(pagante) or not isinstance(valor, (int, float)):
            continue
        onde = f"MILHO_{ano} › {aba} recebimento linha {r}"
        d, obs = data(dia, onde, ano)
        inserir("recebimentos", f"MILHO_{ano}/{aba}/receb#{r}", {
            "data": d or f"{ano}-12-31", "comprador": txt(pagante), "cultura_id": CULT["milho"], "valor": num(valor),
            "observacao": juntar_obs(obs, None if d else "data não informada na planilha"),
        })


def silagem(ano):
    ws = openpyxl.load_workbook(arquivo(f"MILHO_{ano}"), data_only=True)["SILAGEM"]
    # Cabeçalho muda de linha e de colunas entre 2025 e 2026: acha pelo texto.
    cab = next(r for r in range(1, 20) if ws.cell(r, 2).value == "COMPRADOR")
    col = {str(ws.cell(cab, c).value or "").strip(): c for c in range(2, 14)}
    pega = lambda r, nome: ws.cell(r, col[nome]).value if nome in col else None  # noqa: E731
    primeira_data = {}
    for r in range(cab + 1, ws.max_row + 1):
        comprador = txt(ws.cell(r, 2).value)
        sacos = num(pega(r, "SCS CARREGADOS"))
        if not comprador or not sacos:
            continue
        onde = f"MILHO_{ano} › SILAGEM linha {r}"
        d, obs = data(pega(r, "DATA"), onde, ano)
        d = d or ultima_data.get("v")
        ultima_data["v"] = d
        primeira_data.setdefault(comprador.upper(), d)
        peso = num(pega(r, "PESO LIQUIDO"))
        por_kg = num(pega(r, "VALOR/ KG"))
        terceiros = num(pega(r, "FRETE TERCEIROS"))
        base = {
            "data": d, "comprador": comprador, "cultura_id": CULT["silagem"], "safra": f"Silagem {ano}",
            "classificacao": "Silagem", "peso_entrada": 0, "peso_saida": peso or None, "peso_liquido": peso or None,
            "volumes": sacos, "valor_bruto": num(pega(r, "$ BRUTO")), "valor_desconto": 0,
            "frete_cobrado": num(pega(r, "FRETE CC")) or None, "comissao": num(pega(r, "COMISSÃO")) or None,
            "valor": num(pega(r, "$ LIQUIDO")),
            "observacao": juntar_obs(obs, f"frete de terceiros R$ {terceiros:.2f}" if terceiros else None),
        }
        if por_kg:  # 2025: preço por kg
            base.update({"unidade": "kg", "quantidade": peso, "preco_unitario": por_kg})
        else:  # 2026: preço por saco
            base.update({"unidade": "saco", "quantidade": sacos, "preco_unitario": num(pega(r, "$/SC"))})
        inserir("vendas", f"MILHO_{ano}/SILAGEM#{r}", base)
    # Tabela de pagamentos: COMPRADOR, DATA, VALOR logo depois de $ LIQUIDO.
    c0 = col["$ LIQUIDO"] + 2
    for r in range(cab + 1, ws.max_row + 1):
        pagante, dia, valor = (ws.cell(r, c).value for c in (c0, c0 + 1, c0 + 2))
        if not txt(pagante) or not isinstance(valor, (int, float)):
            continue
        onde = f"MILHO_{ano} › SILAGEM pagamento linha {r}"
        d, obs = data(dia, onde, ano)
        nota = ws.cell(r, c0 + 3).value
        inserir("recebimentos", f"MILHO_{ano}/SILAGEM/receb#{r}", {
            "data": d or primeira_data.get(txt(pagante).upper()) or f"{ano}-12-31",
            "comprador": txt(pagante), "cultura_id": CULT["silagem"], "valor": num(valor),
            "observacao": juntar_obs(obs, txt(nota), None if d else "data não informada na planilha"),
        })


# ─── Laranja ────────────────────────────────────────────────────────────────

def laranja(ano):
    ws = openpyxl.load_workbook(arquivo("VENDAS_LARANJA"), data_only=True)[str(ano)]
    c = ci("C") if ano == 2025 else ci("D")
    for r in range(10, ws.max_row + 1):
        v = [ws.cell(r, c + i).value for i in range(17)]
        comprador = txt(v[0])
        if not comprador or not num(v[7]):
            continue
        onde = f"VENDAS_LARANJA › {ano} linha {r}"
        d, obs = data(v[1], onde, ano)
        d = d or ultima_data.get("v")
        ultima_data["v"] = d
        liq, preco, bruto = num(v[7]), num(v[8]), num(v[9])
        reg = {
            "data": d, "comprador": comprador, "cultura_id": CULT["laranja"], "safra": f"Laranja {ano}",
            "talhao_id": talhao(v[3], onde), "classificacao": txt(v[4]), "placa": txt(v[2]),
            "peso_entrada": num(v[5]), "peso_saida": num(v[6]), "peso_liquido": liq,
            "unidade": "t", "quantidade": liq / 1000, "preco_unitario": preco, "valor_bruto": bruto,
            "observacao": juntar_obs(obs),
        }
        if ano == 2025:  # % desconto (refugo) e carregamento
            pdesc, vref, vcar, vliq = num(v[10]), num(v[11]), num(v[12]), num(v[13])
            reg.update({
                "desconto_kg": pdesc * liq or None, "valor_desconto": vref,
                "custo_ton": (vcar / (liq / 1000)) if vcar and liq else None, "valor": vliq,
            })
        else:  # desconto em kg, custo/ton e juros
            reg.update({
                "desconto_kg": num(v[10]) or None, "valor_desconto": num(v[11]),
                "custo_ton": num(v[12]) or None, "juros": num(v[15]) or None, "valor": num(v[16]),
            })
        inserir("vendas", f"VENDAS_LARANJA/{ano}#{r}", reg)
    rc = ci("R") if ano == 2025 else ci("W")
    for r in range(11, ws.max_row + 1):
        pagante, dia, valor = (ws.cell(r, rc + i).value for i in range(3))
        if not txt(pagante) or not isinstance(valor, (int, float)) or txt(pagante) == "PAGANTES":
            continue
        onde = f"VENDAS_LARANJA › {ano} recebimento linha {r}"
        d, obs = data(dia, onde, ano)
        inserir("recebimentos", f"VENDAS_LARANJA/{ano}/receb#{r}", {
            "data": d or f"{ano}-12-31", "comprador": txt(pagante), "cultura_id": CULT["laranja"], "valor": num(valor),
            "observacao": juntar_obs(obs, None if d else "data não informada na planilha"),
        })


# ─── Financeiro ─────────────────────────────────────────────────────────────

CATEGORIA = {
    "RETIRADA/DIVIDENDOS": "Retirada / dividendos", "OUTROS": "Outros", "ALIMENTACAO": "Alimentação",
    "PRODUTOS QUIMICOS": "Produtos químicos", "ADUBOS": "Adubos", "PECAS": "Peças", "SERVICOS": "Serviços",
    "COMBUSTÍVEIS": "Combustíveis", "SALARIOS": "Salários", "TAXAS": "Taxas", "BENFEITORIAS": "Benfeitorias",
    "INVESTIMENTOS": "Investimentos", "ARRENDAMENTOS": "Arrendamentos", "EMPRESTIMOS": "Empréstimos",
}
FORMA = {"PIX": "PIX", "BOLETO": "Boleto", "BOELTO": "Boleto", "CARTAO": "Cartão", "DINHEIRO": "Dinheiro"}


def financeiro():
    wb = openpyxl.load_workbook(arquivo("FINANCEIRO_2026"), data_only=True)
    for aba in wb.sheetnames:
        if aba in ("MODELO",) or aba.upper().startswith("PÁGINA"):
            continue
        ws = wb[aba]
        cats = {c.column: str(c.value).strip() for c in ws[3] if c.value}
        cab = {c.column: str(c.value).strip() for c in ws[5] if isinstance(c.value, str)}
        colunas = sorted(cats)
        for i, c0 in enumerate(colunas):
            fim = colunas[i + 1] if i + 1 < len(colunas) else ws.max_column + 1
            campos = {cab[k]: k for k in cab if c0 - 1 <= k < fim - 1}
            cat = cats[c0]
            for r in range(6, ws.max_row + 1):
                g = lambda nome: ws.cell(r, campos[nome]).value if nome in campos else None  # noqa: E731
                onde = f"FINANCEIRO_2026 › {aba} › {cat} linha {r}"
                valores = [(None, g("VALOR"))] if cat != "ARRENDAMENTOS" else [("milho", g("MILHO")), ("laranja", g("LARANJA"))]
                for cultura, valor in valores:
                    if not isinstance(valor, (int, float)) or not valor:
                        continue
                    d, obs = data(g("DATA"), onde, 2026)
                    if cat == "ENTRADAS":
                        inserir("entradas", f"FINANCEIRO_2026/{aba}/{cat}#{r}", {
                            "data": d, "tipo": txt(g("TIPO")) or "Outros", "origem": txt(g("PAGANTE")),
                            "descricao": txt(g("DESCRICAO")), "valor": num(valor),
                        })
                        continue
                    tipo, desc = txt(g("TIPO")), txt(g("DESCRICAO"))
                    inserir("despesas", f"FINANCEIRO_2026/{aba}/{cat}/{cultura or ''}#{r}", {
                        "data": d, "categoria": CATEGORIA.get(cat, "Outros"), "tipo": tipo,
                        "descricao": desc or tipo or CATEGORIA.get(cat, cat),
                        "valor": num(valor),
                        "forma_pagamento": FORMA.get(str(g("F/PAGAMENTO") or "").strip().upper(), txt(g("F/PAGAMENTO"))),
                        "favorecido": txt(g("FAVORECIDO")) or txt(g("PAGANTE")),
                        "centro": "cultura" if cultura else "geral", "cultura_id": CULT.get(cultura),
                        "litros": num(g("LITROS")) or None, "pago": True,
                        "nota": juntar_obs(f"Planilha FINANCEIRO 2026, aba {aba}", obs),
                    })


# ─── Fretes do caminhão ─────────────────────────────────────────────────────

def categoria_custo_caminhao(desc):
    d = (desc or "").upper()
    if "SALARIO" in d:
        return "Salários"
    if "PARCELA" in d:
        return "Investimentos"
    if "SEGURO" in d:
        return "Taxas"
    if "REVIS" in d or "MANUTEN" in d:
        return "Serviços"
    return "Peças"


def fretes():
    ws = openpyxl.load_workbook(arquivo("FRETES"), data_only=True)["FRETES PROPRIOS "]
    linhas_sql.append(
        "insert into public.maquinas (id, nome, categoria, medidor, ativo, observacao) values "
        f"('{CAMINHAO}', 'Caminhão (fretes)', 'caminhao', 'km', true, 'Criado pela importação da planilha FRETES — ajuste nome e placa') "
        "on conflict (id) do nothing;"
    )
    for r in range(4, ws.max_row + 1):
        v = [ws.cell(r, c).value for c in range(ci("B"), ci("K") + 1)]
        if v[0] in (None, "", 0) or not num(v[5]):
            continue
        onde = f"FRETES linha {r}"
        d, obs = data(v[0], onde)
        inserir("fretes", f"FRETES/fretes#{r}", {
            "data": d, "caminhao_id": CAMINHAO, "contratante": txt(v[1]), "produto": txt(v[2]),
            "origem": txt(v[3]), "destino": txt(v[4]), "peso_kg": num(v[5]), "preco_ton": num(v[6]),
            "valor": num(v[7]), "km": num(v[8]) or None, "observacao": obs,
        })
    for r in range(4, ws.max_row + 1):
        dia, litros, total = (ws.cell(r, c).value for c in (ci("M"), ci("N"), ci("O")))
        if dia in (None, "", 0) or not num(litros):
            continue
        d, obs = data(dia, f"FRETES abastecimento linha {r}")
        inserir("abastecimentos", f"FRETES/abast#{r}", {
            "data": d, "origem": "posto", "maquina_id": CAMINHAO, "litros": num(litros),
            "preco_litro": round(num(total) / num(litros), 4), "valor": num(total), "observacao": obs,
        })
    for r in range(4, ws.max_row + 1):
        dia, desc, valor = (ws.cell(r, c).value for c in (ci("R"), ci("S"), ci("T")))
        if dia in (None, "", 0) or not isinstance(valor, (int, float)):
            continue
        d, obs = data(dia, f"FRETES custo linha {r}")
        inserir("despesas", f"FRETES/custos#{r}", {
            "data": d, "categoria": categoria_custo_caminhao(desc), "tipo": txt(desc),
            "descricao": f"Caminhão: {txt(desc) or 'custo'}", "valor": num(valor), "centro": "geral",
            "maquina_id": CAMINHAO, "pago": True, "nota": juntar_obs("Planilha FRETES", obs),
        })


# ─── Geração ────────────────────────────────────────────────────────────────

vendas_milho(2025, "VENDAS MILHO")
vendas_milho(2026, "VENDAS")
silagem(2025)
silagem(2026)
laranja(2025)
laranja(2026)
financeiro()
fretes()

schema = (RAIZ / "supabase/schema.sql").read_text()
tabelas = ["vendas", "recebimentos", "despesas", "entradas", "fretes", "abastecimentos", "maquinas", "talhoes"]
cabecalho = f"""-- ════════════════════════════════════════════════════════════════════════
-- Importação do histórico das planilhas — GERADO por scripts/importar-planilhas.py
-- {sum(contagem.values())} lançamentos: {', '.join(f'{k} {v}' for k, v in sorted(contagem.items()))}
--
-- Cole tudo no SQL Editor do Supabase e clique em Run. Pode rodar de novo:
-- não duplica. Para desfazer a importação:
--   delete from public.<tabela> where importado is not null;
-- ════════════════════════════════════════════════════════════════════════

begin;

{schema}
-- Marca do que veio das planilhas (planilha/aba de origem).
{chr(10).join(f"alter table public.{t} add column if not exists importado text;" for t in tabelas)}

"""
saida = RAIZ / "supabase/importacao-historico.sql"
saida.write_text(cabecalho + "\n".join(linhas_sql) + "\n\ncommit;\n")
print(f"{saida.relative_to(RAIZ)}: {contagem}")
# Conferência: o valor líquido que o app recalcularia ao editar a venda tem de
# bater com o da planilha; e nenhuma linha pode ficar sem data.
KG = {"t": 1000, "kg": 1, "sc60": 60, "arroba": 15}
difs = 0
for tabela, r in registros:
    if not r.get("data"):
        print("SEM DATA:", tabela, r["importado"])
    if tabela != "vendas":
        continue
    kg = KG.get(r["unidade"])
    liq = r.get("peso_liquido") or 0
    qtd = liq / kg if kg and r.get("peso_saida") else r["quantidade"]
    bruto = qtd * r["preco_unitario"]
    desc = (r.get("desconto_kg") or 0) / kg * r["preco_unitario"] if kg else 0
    val = bruto + (r.get("frete_cobrado") or 0) - desc - liq / 1000 * (r.get("custo_ton") or 0) - (r.get("comissao") or 0) - (r.get("juros") or 0)
    if abs(val - r["valor"]) > 0.05:
        difs += 1
        print(f"DIFERENÇA {r['importado']} {r['comprador']} {r['data']}: planilha {r['valor']:.2f} × app {val:.2f}")
print(f"vendas conferidas, {difs} diferença(s)")
resumo = {}
for tabela, r in registros:
    k = (tabela, r["importado"].split("#")[0].rsplit("/receb", 1)[0])
    n, v = resumo.get(k, (0, 0))
    resumo[k] = (n + 1, v + (r.get("valor") or 0))
for (t, o), (n, v) in sorted(resumo.items()):
    print(f"  {t:15} {o:32} {n:4} linhas  R$ {v:,.2f}")

print(f"\n{len(avisos)} avisos:")
for a in avisos:
    print(" -", a)
