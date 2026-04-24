"""GET /api/movers — Nifty 50 daily winners & losers via batch download."""
import json
from http.server import BaseHTTPRequestHandler

import yfinance as yf

NIFTY_50 = [
    "ADANIENT","ADANIPORTS","APOLLOHOSP","ASIANPAINT","AXISBANK",
    "BAJAJ-AUTO","BAJFINANCE","BAJAJFINSV","BEL","BPCL",
    "BHARTIARTL","BRITANNIA","CIPLA","COALINDIA","DRREDDY",
    "EICHERMOT","ETERNAL","GRASIM","HCLTECH","HDFCBANK",
    "HDFCLIFE","HEROMOTOCO","HINDALCO","HINDUNILVR","ICICIBANK",
    "ITC","INDUSINDBK","INFY","JSWSTEEL","KOTAKBANK",
    "LT","M&M","MARUTI","NESTLEIND","NTPC",
    "ONGC","POWERGRID","RELIANCE","SBILIFE","SBIN",
    "SHRIRAMFIN","SUNPHARMA","TCS","TATACONSUM","TATASTEEL",
    "TECHM","TITAN","TRENT","ULTRACEMCO","WIPRO",
]

NAMES = {
    "ADANIENT":"Adani Enterprises","ADANIPORTS":"Adani Ports","APOLLOHOSP":"Apollo Hospitals",
    "ASIANPAINT":"Asian Paints","AXISBANK":"Axis Bank","BAJAJ-AUTO":"Bajaj Auto",
    "BAJFINANCE":"Bajaj Finance","BAJAJFINSV":"Bajaj Finserv","BEL":"Bharat Electronics",
    "BPCL":"BPCL","BHARTIARTL":"Bharti Airtel","BRITANNIA":"Britannia","CIPLA":"Cipla",
    "COALINDIA":"Coal India","DRREDDY":"Dr. Reddy's","EICHERMOT":"Eicher Motors",
    "ETERNAL":"Eternal","GRASIM":"Grasim","HCLTECH":"HCL Tech","HDFCBANK":"HDFC Bank",
    "HDFCLIFE":"HDFC Life","HEROMOTOCO":"Hero MotoCorp","HINDALCO":"Hindalco",
    "HINDUNILVR":"HUL","ICICIBANK":"ICICI Bank","ITC":"ITC","INDUSINDBK":"IndusInd Bank",
    "INFY":"Infosys","JSWSTEEL":"JSW Steel","KOTAKBANK":"Kotak Bank","LT":"L&T",
    "M&M":"M&M","MARUTI":"Maruti Suzuki","NESTLEIND":"Nestle India","NTPC":"NTPC",
    "ONGC":"ONGC","POWERGRID":"Power Grid","RELIANCE":"Reliance","SBILIFE":"SBI Life",
    "SBIN":"SBI","SHRIRAMFIN":"Shriram Finance","SUNPHARMA":"Sun Pharma","TCS":"TCS",
    "TATACONSUM":"Tata Consumer","TATASTEEL":"Tata Steel","TECHM":"Tech Mahindra",
    "TITAN":"Titan","TRENT":"Trent","ULTRACEMCO":"UltraTech Cement","WIPRO":"Wipro",
}


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        yf_tickers = [f"{t}.NS" for t in NIFTY_50]
        rows = []
        try:
            data = yf.download(yf_tickers, period="2d", interval="1d",
                               group_by="ticker", auto_adjust=True,
                               threads=True, progress=False)
            if not data.empty:
                for sym, yf_sym in zip(NIFTY_50, yf_tickers):
                    try:
                        td = data[yf_sym] if len(yf_tickers) > 1 else data
                        if td.empty or len(td) < 1:
                            continue
                        latest = td.iloc[-1]
                        close = float(latest["Close"]) if latest["Close"] == latest["Close"] else None
                        if close is None:
                            continue
                        vol = int(latest["Volume"]) if latest["Volume"] == latest["Volume"] else 0
                        if len(td) >= 2:
                            prev = float(td.iloc[-2]["Close"])
                            chg = round(close - prev, 2)
                            chg_pct = round((chg / prev) * 100, 2) if prev else 0
                        else:
                            chg, chg_pct = 0, 0
                        rows.append({
                            "ticker": sym, "company": NAMES.get(sym, sym),
                            "price": round(close, 2), "change": chg,
                            "changePct": chg_pct, "volume": vol,
                        })
                    except Exception:
                        continue
            rows.sort(key=lambda r: r["changePct"], reverse=True)
        except Exception as e:
            rows = [{"error": str(e)}]

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "s-maxage=180, stale-while-revalidate=60")
        self.end_headers()
        self.wfile.write(json.dumps(rows).encode())
