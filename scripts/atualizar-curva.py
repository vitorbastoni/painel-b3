#!/usr/bin/env python3
"""Baixa o consolidado da B3 e grava curva-juros.json.

DI1 é a curva prefixada. DAP é o cupom de IPCA (juro real).
A taxa usada é AdjstdQtTax, o ajuste do pregão em % a.a. (base 252).
"""
import csv
import json
import time
import urllib.parse
import urllib.request
from datetime import date, timedelta
from pathlib import Path

ARQUIVO = "TradeInformationConsolidated"
BASE = "https://arquivos.b3.com.br/api/download"
OUT = Path(__file__).resolve().parents[1] / "curva-juros.json"
MESES = {"F": 1, "G": 2, "H": 3, "J": 4, "K": 5, "M": 6, "N": 7, "Q": 8, "U": 9, "V": 10, "X": 11, "Z": 12}
UA = {"User-Agent": "painel-b3-curva", "Accept": "application/json,text/csv,*/*"}


def http_get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=90) as res:
        return res.read()


def numero(texto):
    texto = (texto or "").strip()
    if not texto:
        return None
    texto = texto.replace(".", "").replace(",", ".")
    try:
        return float(texto)
    except ValueError:
        return None


def vencimento(ticker):
    # DI1F27 / DAPQ28: letra do mês + ano com dois dígitos.
    codigo = ticker[3:]
    mes = MESES.get(codigo[:1])
    if not mes:
        return None
    try:
        ano = 2000 + int(codigo[1:])
    except ValueError:
        return None
    dia = date(ano, mes, 1)
    while dia.weekday() >= 5:
        dia += timedelta(days=1)
    return dia


def anos_uteis(inicio, fim):
    if fim <= inicio:
        return 0.0
    dias = 0
    cursor = inicio
    while cursor < fim:
        cursor += timedelta(days=1)
        if cursor.weekday() < 5:
            dias += 1
    return round(dias / 252, 4)


def token_de(meta):
    if meta.get("token"):
        return meta["token"]
    destino = meta.get("redirectUrl") or ""
    consulta = urllib.parse.urlparse(destino.replace("~/", "https://arquivos.b3.com.br/")).query
    valores = urllib.parse.parse_qs(consulta).get("token") or []
    return valores[0] if valores else None


def baixar(dia):
    pedido = f"{BASE}/requestname?fileName={ARQUIVO}&date={dia.isoformat()}"
    meta = json.loads(http_get(pedido).decode("utf-8"))
    token = token_de(meta)
    if not token:
        raise RuntimeError("resposta sem token")
    time.sleep(6)
    bruto = http_get(f"{BASE}/?token={urllib.parse.quote(token)}")
    return bruto.decode("latin1")


def ultimo_pregão():
    dia = date.today()
    for _ in range(12):
        if dia.weekday() < 5:
            try:
                texto = baixar(dia)
                if "DI1" in texto:
                    return dia, texto
            except Exception as exc:
                print(f"{dia.isoformat()} indisponível: {exc}")
                time.sleep(6)
        dia -= timedelta(days=1)
    raise SystemExit("nenhum pregão recente da B3")


def vertices(texto, data_ref):
    linhas = texto.splitlines()
    inicio = 0
    for i, linha in enumerate(linhas):
        if linha.startswith("RptDt;"):
            inicio = i
            break
    leitor = csv.DictReader(linhas[inicio:], delimiter=";")
    grupos = {"DI1": [], "DAP": []}
    for row in leitor:
        ticker = (row.get("TckrSymb") or "").strip()
        prefixo = ticker[:3]
        if prefixo not in grupos:
            continue
        taxa = numero(row.get("AdjstdQtTax"))
        if taxa is None or not (0 < taxa < 40):
            continue
        fim = vencimento(ticker)
        if not fim:
            continue
        anos = anos_uteis(data_ref, fim)
        if anos <= 0:
            continue
        negocios = int(numero(row.get("TradQty")) or 0)
        aberto = int(numero(row.get("FinInstrmQty")) or 0)
        # DAP curto e sem giro distorce o juro real; o ajuste continua publicado.
        if prefixo == "DAP" and (aberto < 1000 or taxa < 5):
            continue
        grupos[prefixo].append({
            "ticker": ticker,
            "vencimento": fim.isoformat(),
            "anos": anos,
            "taxa": round(taxa, 4),
            "negocios": negocios,
            "aberto": aberto,
        })
    for lista in grupos.values():
        lista.sort(key=lambda item: item["anos"])
    return grupos["DI1"], grupos["DAP"]


def main():
    dia, texto = ultimo_pregão()
    prefixada, ipca = vertices(texto, dia)
    if len(prefixada) < 2 or len(ipca) < 2:
        raise SystemExit(f"curva curta: DI1={len(prefixada)} DAP={len(ipca)}")
    payload = {
        "dataRef": dia.isoformat(),
        "fonte": "B3",
        "arquivo": ARQUIVO,
        "prefixada": prefixada,
        "ipca": ipca,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"grava {OUT.name} {payload['dataRef']} DI1={len(prefixada)} DAP={len(ipca)}")
    for nome, lista in (("DI1", prefixada), ("DAP", ipca)):
        amostra = lista[:: max(1, len(lista) // 4)][:5]
        print(nome, ", ".join(f"{p['ticker']} {p['anos']}a {p['taxa']}%" for p in amostra))


if __name__ == "__main__":
    main()
