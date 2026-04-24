"""GET /api/fundamentals?ticker=HDFCBANK — key financial metrics."""
import json
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

import yfinance as yf


def _s(info, key, fb="N/A"):
    v = info.get(key)
    return v if v is not None else fb


def _pct(info, key):
    v = info.get(key)
    if isinstance(v, (int, float)):
        return round(v * 100, 2)
    return None


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        qs = parse_qs(urlparse(self.path).query)
        ticker = qs.get("ticker", ["HDFCBANK"])[0].strip().upper()
        yf_sym = f"{ticker}.NS" if "." not in ticker else ticker

        try:
            info = yf.Ticker(yf_sym).info
            mc = _s(info, "marketCap")
            body = {
                "ticker": ticker,
                "name": _s(info, "shortName", ticker),
                "price": _s(info, "currentPrice"),
                "pe": _s(info, "trailingPE"),
                "forwardPe": _s(info, "forwardPE"),
                "pb": _s(info, "priceToBook"),
                "roe": _pct(info, "returnOnEquity"),
                "debtEquity": _s(info, "debtToEquity"),
                "bookValue": _s(info, "bookValue"),
                "marketCap": mc,
                "marketCapCr": f"₹{mc / 1e7:,.0f} Cr" if isinstance(mc, (int, float)) else "N/A",
                "dividendYield": _pct(info, "dividendYield"),
                "eps": _s(info, "trailingEps"),
                "revenueGrowth": _pct(info, "revenueGrowth"),
                "profitMargin": _pct(info, "profitMargins"),
                "operatingMargin": _pct(info, "operatingMargins"),
                "currentRatio": _s(info, "currentRatio"),
                "high52": _s(info, "fiftyTwoWeekHigh"),
                "low52": _s(info, "fiftyTwoWeekLow"),
                "beta": _s(info, "beta"),
            }
        except Exception as e:
            body = {"error": str(e), "ticker": ticker}

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "s-maxage=300, stale-while-revalidate=120")
        self.end_headers()
        self.wfile.write(json.dumps(body).encode())
