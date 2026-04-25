"""
dev_server.py — Local development API server for IndiaStock
Mirrors all Vercel serverless functions locally on port 3001.
Run alongside `npm run dev` with:
    python dev_server.py

Requires (already installed in indstk venv or install here):
    pip install flask yfinance pandas
"""

import json
import re
import sys
from flask import Flask, request, jsonify

# Ensure api/ directory is importable
sys.path.insert(0, ".")

app = Flask(__name__)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _safe(info, key, fb="N/A"):
    v = info.get(key)
    return v if v is not None else fb


def _pct(info, key):
    v = info.get(key)
    if isinstance(v, (int, float)):
        return round(v * 100, 2)
    return None


def _clean_num(s: str) -> float:
    try:
        return float(re.sub(r"[^\d.\-]", "", s.strip()))
    except Exception:
        return 0.0


# ── /api/quote ─────────────────────────────────────────────────────────────────

@app.route("/api/quote")
def api_quote():
    import yfinance as yf
    ticker = request.args.get("ticker", "HDFCBANK").strip().upper()
    yf_sym = f"{ticker}.NS" if "." not in ticker else ticker
    try:
        info = yf.Ticker(yf_sym).info
        price = _safe(info, "currentPrice")
        prev  = _safe(info, "previousClose")
        if isinstance(price, (int, float)) and isinstance(prev, (int, float)) and prev:
            change     = round(price - prev, 2)
            change_pct = round((change / prev) * 100, 2)
        else:
            change = change_pct = None
        body = {
            "ticker": ticker, "name": _safe(info, "shortName", ticker),
            "price": price, "change": change, "changePct": change_pct,
            "volume": _safe(info, "volume"), "dayHigh": _safe(info, "dayHigh"),
            "dayLow": _safe(info, "dayLow"), "prevClose": prev,
        }
    except Exception as e:
        body = {"error": str(e), "ticker": ticker}
    return jsonify(body)


# ── /api/fundamentals ──────────────────────────────────────────────────────────

@app.route("/api/fundamentals")
def api_fundamentals():
    import yfinance as yf
    ticker = request.args.get("ticker", "HDFCBANK").strip().upper()
    yf_sym = f"{ticker}.NS" if "." not in ticker else ticker
    try:
        info = yf.Ticker(yf_sym).info
        mc = _safe(info, "marketCap")
        body = {
            "ticker": ticker, "name": _safe(info, "shortName", ticker),
            "price": _safe(info, "currentPrice"),
            "pe": _safe(info, "trailingPE"), "forwardPe": _safe(info, "forwardPE"),
            "pb": _safe(info, "priceToBook"), "roe": _pct(info, "returnOnEquity"),
            "debtEquity": _safe(info, "debtToEquity"), "bookValue": _safe(info, "bookValue"),
            "marketCap": mc,
            "marketCapCr": f"₹{mc / 1e7:,.0f} Cr" if isinstance(mc, (int, float)) else "N/A",
            "dividendYield": _pct(info, "dividendYield"), "eps": _safe(info, "trailingEps"),
            "revenueGrowth": _pct(info, "revenueGrowth"), "profitMargin": _pct(info, "profitMargins"),
            "operatingMargin": _pct(info, "operatingMargins"), "currentRatio": _safe(info, "currentRatio"),
            "high52": _safe(info, "fiftyTwoWeekHigh"), "low52": _safe(info, "fiftyTwoWeekLow"),
            "beta": _safe(info, "beta"),
        }
    except Exception as e:
        body = {"error": str(e), "ticker": ticker}
    return jsonify(body)


# ── /api/history ───────────────────────────────────────────────────────────────

@app.route("/api/history")
def api_history():
    import yfinance as yf
    ticker = request.args.get("ticker", "HDFCBANK").strip().upper()
    period = request.args.get("period", "1y")
    yf_sym = f"{ticker}.NS" if "." not in ticker else ticker
    if period not in {"1mo", "3mo", "6mo", "1y", "2y", "5y"}:
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
                    "low":  round(float(row["Low"]), 2),
                    "close": round(float(row["Close"]), 2),
                    "volume": int(row["Volume"]),
                })
            body = {"ticker": ticker, "data": rows}
    except Exception as e:
        body = {"error": str(e), "ticker": ticker, "data": []}
    return jsonify(body)


# ── /api/movers ────────────────────────────────────────────────────────────────

NIFTY_50 = [
    "ADANIENT","ADANIPORTS","APOLLOHOSP","ASIANPAINT","AXISBANK",
    "BAJAJ-AUTO","BAJFINANCE","BAJAJFINSV","BEL","BPCL",
    "BHARTIARTL","BRITANNIA","CIPLA","COALINDIA","DRREDDY",
    "EICHERMOT","ETERNAL","GRASIM","HCLTECH","HDFCBANK",
    "HDFCLIFE","HEROMOTOCO","HINDALCO","HINDUNILVR","ICICIBANK",
    "ITC","INDUSINDBK","INFY","JSWSTEEL","KOTAKBANK",
    "LT","M&M","MARUTI","NESTLEIND","NTPC",
    "ONGC","POWERGRID","RELIANCE","SBILIFE","SBIN",
    "SHRIRAMFIN","SUNPHARMA","TCS","TATACONSUM","TATAMOTORS",
    "TATASTEEL","TECHM","TITAN","TRENT","ULTRACEMCO","WIPRO",
]

COMPANY_NAMES = {
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
    "TATACONSUM":"Tata Consumer","TATAMOTORS":"Tata Motors","TATASTEEL":"Tata Steel",
    "TECHM":"Tech Mahindra","TITAN":"Titan","TRENT":"Trent","ULTRACEMCO":"UltraTech",
    "WIPRO":"Wipro",
}

@app.route("/api/movers")
def api_movers():
    import yfinance as yf
    uni = request.args.get("universe", "nifty")
    tickers = NIFTY_50  # extend for 'all' if needed
    yf_syms = [f"{t}.NS" for t in tickers]
    rows = []
    try:
        data = yf.download(yf_syms, period="2d", interval="1d",
                           group_by="ticker", threads=True, progress=False)
        if not data.empty:
            for sym, yf_sym in zip(tickers, yf_syms):
                try:
                    td = data[yf_sym] if len(yf_syms) > 1 else data
                    if td.empty or len(td) < 1:
                        continue
                    latest = td.iloc[-1]
                    prev   = td.iloc[-2] if len(td) >= 2 else td.iloc[-1]
                    close  = float(latest["Close"])
                    p_close = float(prev["Close"]) if float(prev["Close"]) != float(latest["Close"]) else float(latest["Open"])
                    change = round(close - p_close, 2)
                    chg_pct = round((change / p_close) * 100, 2) if p_close else 0
                    volume = int(latest["Volume"]) if latest["Volume"] else 0
                    rows.append({
                        "ticker": sym, "company": COMPANY_NAMES.get(sym, sym),
                        "price": round(close, 2), "change": change,
                        "changePct": chg_pct, "volume": volume,
                    })
                except Exception:
                    pass
    except Exception as e:
        return jsonify([{"error": str(e)}])
    rows.sort(key=lambda x: x["changePct"], reverse=True)
    return jsonify(rows)


# ── /api/screener ──────────────────────────────────────────────────────────────

def _num(val, default=0):
    return val if isinstance(val, (int, float)) else default

PRESETS = {
    "High ROE & Low Debt": lambda r: _num(r.get("ROE")) > 15 and _num(r.get("Debt/Equity"), 999) < 0.5,
    "Undervalued Bluechips": lambda r: _num(r.get("P/E"), 999) < 25 and _num(r.get("Market Cap")) > 500_000_000_000,
    "Dividend Picks": lambda r: _num(r.get("Dividend Yield")) > 1.5,
    "Near 52-Week High": lambda r: _num(r.get("52w High")) > 0 and _num(r.get("Current Price")) >= _num(r.get("52w High")) * 0.95,
    "Near 52-Week Low": lambda r: _num(r.get("52w Low")) > 0 and _num(r.get("Current Price")) <= _num(r.get("52w Low")) * 1.10,
    "High Profit Margin": lambda r: _num(r.get("Profit Margin")) > 20,
    "Revenue Growth Stars": lambda r: _num(r.get("Revenue Growth")) > 15,
    "Low P/B Value Picks": lambda r: _num(r.get("P/B"), 999) < 2 and _num(r.get("ROE")) > 10,
    "Low Beta / Defensive": lambda r: _num(r.get("Beta"), 999) < 0.8 and _num(r.get("Dividend Yield")) > 1,
    "High Operating Margin": lambda r: _num(r.get("Operating Margin")) > 25,
    "Strong Balance Sheet": lambda r: _num(r.get("Current Ratio")) > 1.5 and _num(r.get("Debt/Equity"), 999) < 0.3,
    "GARP (Growth at Reasonable Price)": lambda r: _num(r.get("Revenue Growth")) > 10 and _num(r.get("ROE")) > 12 and _num(r.get("P/E"), 999) < 30,
    "Small-Cap Gems": lambda r: 0 < _num(r.get("Market Cap")) < 100_000_000_000 and _num(r.get("ROE")) > 15 and _num(r.get("Profit Margin")) > 10,
}

@app.route("/api/screener")
def api_screener():
    import yfinance as yf
    import concurrent.futures
    preset_name = request.args.get("preset", "High ROE & Low Debt")
    filter_fn = PRESETS.get(preset_name, PRESETS["High ROE & Low Debt"])

    def get_f(t):
        info = yf.Ticker(f"{t}.NS").info
        mc = info.get("marketCap")
        fund = {
            "Ticker": t, "Name": COMPANY_NAMES.get(t, t),
            "Current Price": info.get("currentPrice"),
            "P/E": info.get("trailingPE"),
            "ROE": round(info["returnOnEquity"] * 100, 2) if isinstance(info.get("returnOnEquity"), (int, float)) else None,
            "Debt/Equity": info.get("debtToEquity"),
            "Market Cap": mc,
            "Market Cap (Cr)": f"₹{mc / 1e7:,.0f} Cr" if isinstance(mc, (int, float)) else "N/A",
            "Dividend Yield": round(info["dividendYield"] * 100, 2) if isinstance(info.get("dividendYield"), (int, float)) else None,
            "Profit Margin": round(info["profitMargins"] * 100, 2) if isinstance(info.get("profitMargins"), (int, float)) else None,
            "Revenue Growth": round(info["revenueGrowth"] * 100, 2) if isinstance(info.get("revenueGrowth"), (int, float)) else None,
            "Operating Margin": round(info["operatingMargins"] * 100, 2) if isinstance(info.get("operatingMargins"), (int, float)) else None,
            "Current Ratio": info.get("currentRatio"),
            "52w High": info.get("fiftyTwoWeekHigh"),
            "52w Low": info.get("fiftyTwoWeekLow"),
            "Beta": info.get("beta"),
            "P/B": info.get("priceToBook"),
        }
        return fund if filter_fn(fund) else None

    matched = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
        for res in ex.map(get_f, NIFTY_50):
            if res is not None:
                matched.append(res)
    return jsonify(matched)


# ── /api/portfolio ─────────────────────────────────────────────────────────────

def parse_portfolio_lines(lines):
    records = []
    for k in range(len(lines)):
        line = lines[k].strip()
        if line in ("Buy", "Sell"):
            if k >= 2 and k + 2 < len(lines):
                stock_name = lines[k - 2].strip().replace(" DELIVERY", "").replace(" MTF", "")
                action  = line
                vals    = lines[k + 1].split("\t")
                if len(vals) >= 6:
                    ltp         = _clean_num(vals[0])
                    trade_price = _clean_num(vals[2])
                    qty         = _clean_num(vals[3])
                    status      = vals[5].strip()
                    if status == "Executed" and qty > 0 and trade_price > 0:
                        records.append({"stock": stock_name, "action": action,
                                        "ltp": ltp, "tradePrice": trade_price, "qty": qty})

    port: dict = {}
    for r in reversed(records):
        stk = r["stock"]
        if stk not in port:
            port[stk] = {"qty": 0.0, "invested": 0.0, "ltp": r["ltp"], "realized": 0.0}
        q, tp = r["qty"], r["tradePrice"]
        if r["action"] == "Buy":
            port[stk]["qty"]      += q
            port[stk]["invested"] += tp * q
        elif r["action"] == "Sell" and port[stk]["qty"] > 0:
            avg = port[stk]["invested"] / port[stk]["qty"]
            port[stk]["realized"] += (tp - avg) * q
            port[stk]["qty"]      -= q
            port[stk]["invested"] -= avg * q
            if port[stk]["qty"]      < 0: port[stk]["qty"]      = 0.0
            if port[stk]["invested"] < 0: port[stk]["invested"] = 0.0

    positions = []
    summary = {"totalInvested": 0.0, "totalCurrent": 0.0, "totalUnrealized": 0.0, "totalRealized": 0.0}
    for stk, d in port.items():
        inv = d["invested"]
        cur = d["ltp"] * d["qty"]
        unr = cur - inv
        total_gain = unr + d["realized"]
        positions.append({
            "stock": stk, "qty": int(d["qty"]),
            "avgPrice": round(inv / d["qty"], 2) if d["qty"] > 0 else 0,
            "ltp": round(d["ltp"], 2), "invested": round(inv, 2),
            "current": round(cur, 2), "unrealized": round(unr, 2),
            "realized": round(d["realized"], 2), "totalPnl": round(total_gain, 2),
            "pnlPct": round(total_gain / inv * 100, 2) if inv > 0 else 0,
        })
        summary["totalInvested"]   += inv
        summary["totalCurrent"]    += cur
        summary["totalUnrealized"] += unr
        summary["totalRealized"]   += d["realized"]

    positions.sort(key=lambda x: x["invested"], reverse=True)
    for k in summary:
        summary[k] = round(summary[k], 2)
    summary["totalPnl"] = round(summary["totalUnrealized"] + summary["totalRealized"], 2)
    summary["totalPnlPct"] = round(summary["totalPnl"] / summary["totalInvested"] * 100, 2) if summary["totalInvested"] > 0 else 0
    return {"positions": positions, "summary": summary}


@app.route("/api/portfolio", methods=["GET", "POST", "OPTIONS"])
def api_portfolio():
    if request.method == "OPTIONS":
        resp = app.make_response("")
        resp.headers["Access-Control-Allow-Origin"] = "*"
        resp.headers["Access-Control-Allow-Methods"] = "POST, GET, OPTIONS"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
        return resp
    if request.method == "GET":
        return jsonify({"positions": [], "summary": {
            "totalInvested": 0, "totalCurrent": 0, "totalUnrealized": 0,
            "totalRealized": 0, "totalPnl": 0, "totalPnlPct": 0
        }})
    # POST
    try:
        payload = request.get_json(force=True, silent=True) or {}
        csv_text = payload.get("csv", "")
        lines = csv_text.splitlines()
        result = parse_portfolio_lines(lines)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── CORS headers on all responses ──────────────────────────────────────────────

@app.after_request
def add_cors(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


if __name__ == "__main__":
    print("🚀 IndiaStock local API server running on http://localhost:3001")
    print("   Routes: /api/quote  /api/fundamentals  /api/history  /api/movers  /api/screener  /api/portfolio")
    app.run(port=3001, debug=False, threaded=True)
