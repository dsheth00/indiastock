"""GET /api/quote?ticker=HDFCBANK — single stock quote."""
import json
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

import yfinance as yf


def _safe(info, key, fb="N/A"):
    v = info.get(key)
    return v if v is not None else fb


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        qs = parse_qs(urlparse(self.path).query)
        ticker = qs.get("ticker", ["HDFCBANK"])[0].strip().upper()
        # If numeric, assume BSE (.BO). If alphabetic without dot, assume NSE (.NS)
        if "." not in ticker:
            yf_sym = f"{ticker}.BO" if ticker.isdigit() else f"{ticker}.NS"
        else:
            yf_sym = ticker


        try:
            info = yf.Ticker(yf_sym).info
            price = _safe(info, "currentPrice")
            prev = _safe(info, "previousClose")
            if isinstance(price, (int, float)) and isinstance(prev, (int, float)) and prev:
                change = round(price - prev, 2)
                change_pct = round((change / prev) * 100, 2)
            else:
                change, change_pct = None, None
            body = {
                "ticker": ticker,
                "name": _safe(info, "shortName", ticker),
                "price": price,
                "change": change,
                "changePct": change_pct,
                "volume": _safe(info, "volume"),
                "dayHigh": _safe(info, "dayHigh"),
                "dayLow": _safe(info, "dayLow"),
                "prevClose": prev,
            }
        except Exception as e:
            body = {"error": str(e), "ticker": ticker}

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "s-maxage=120, stale-while-revalidate=60")
        self.end_headers()
        self.wfile.write(json.dumps(body).encode())
