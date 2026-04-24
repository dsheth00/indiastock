"""GET /api/history?ticker=HDFCBANK&period=1y — OHLCV for charts."""
import json
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

import yfinance as yf


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        qs = parse_qs(urlparse(self.path).query)
        ticker = qs.get("ticker", ["HDFCBANK"])[0].strip().upper()
        period = qs.get("period", ["1y"])[0]
        yf_sym = f"{ticker}.NS" if "." not in ticker else ticker

        allowed = {"1mo", "3mo", "6mo", "1y", "2y", "5y"}
        if period not in allowed:
            period = "1y"

        try:
            df = yf.Ticker(yf_sym).history(period=period, interval="1d")
            if df.empty:
                body = {"ticker": ticker, "data": []}
            else:
                rows = []
                for dt, row in df.iterrows():
                    rows.append({
                        "time": dt.strftime("%Y-%m-%d"),
                        "open": round(float(row["Open"]), 2),
                        "high": round(float(row["High"]), 2),
                        "low": round(float(row["Low"]), 2),
                        "close": round(float(row["Close"]), 2),
                        "volume": int(row["Volume"]),
                    })
                body = {"ticker": ticker, "data": rows}
        except Exception as e:
            body = {"error": str(e), "ticker": ticker, "data": []}

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "s-maxage=300, stale-while-revalidate=120")
        self.end_headers()
        self.wfile.write(json.dumps(body).encode())
