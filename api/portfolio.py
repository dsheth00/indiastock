"""
POST /api/portfolio — parse broker port.csv, fetch live prices, return positions + P&L.
GET  /api/portfolio — returns empty (client-driven via POST).

Broker abbreviation → NSE symbol mapping is applied so yfinance can fetch live LTPs.
"""
import json
import re
import concurrent.futures
from http.server import BaseHTTPRequestHandler

# ── Broker abbreviation → NSE yfinance symbol ────────────────────────────────
# Keys  = exact names from broker CSV (after stripping " DELIVERY" / " MTF")
# Values = valid NSE ticker symbols used by yfinance (appended with .NS)
BROKER_TO_NSE = {
    # User's holdings
    "HDFBAN":  "HDFCBANK",
    "ICIBAN":  "ICICIBANK",
    "IDFBAN":  "IDFCFIRSTB",
    "ADAPOW":  "ADANIPOWER",
    "ADAPOR":  "ADANIPORTS",
    "VEDLIM":  "VEDL",
    "RELIND":  "RELIANCE",
    "OLAELE":  "OLAELEC",
    "TATPOW":  "TATAPOWER",
    "TATSTE":  "TATASTEEL",
    "COALIN":  "COALINDIA",
    "INDWHO":  "INDHOTEL",   # Indian Hotels Company
    "INDRAI":  "IGL",        # Indraprastha Gas Ltd
    "LIC":     "LICI",       # LIC of India
    "CASIND":  "CAMS",       # Computer Age Management Services (best guess; adjust if wrong)
    "SQSIND":  "SQS",        # try as-is; fallback below
    "WEBENE":  "WEBELSOLAR", # Webel Solar — best guess
    "SAGINI":  "SAGCEM",     # Sagar Cements — best guess
    "MSTLIM":  "MSTCLTD",    # MSTC Ltd — best guess
    "UNIP":    "UNIPARTS",   # Uniparts India
    "SANOFI":  "SANOFI",     # Sanofi India — same symbol
    "JIOFIN":  "JIOFIN",     # Jio Financial — same
    "PIIND":   "PIIND",      # PI Industries — same
    "WIPRO":   "WIPRO",
    "ITC":     "ITC",
}

# Verify-status codes for fallback symbols
_FALLBACK_MAP = {
    # If primary lookup fails, try these
    "CASIND":  ["CAMPHOR", "CASTROLIND", "CAMLINFINE"],
    "SQSIND":  ["SQSIND", "SQS"],
    "WEBENE":  ["WEBELSOLAR", "WEBENE"],
    "SAGINI":  ["SAGCEM", "SAGARSOFT"],
    "MSTLIM":  ["MSTCLTD", "MASTEK"],
    "UNIP":    ["UNIPARTS", "UNIPHOS"],
}


def _clean_num(s: str) -> float:
    try:
        return float(re.sub(r'[^\d.\-]', '', s.strip()))
    except Exception:
        return 0.0


def _to_nse(broker_sym: str) -> str:
    """Map broker abbreviation → NSE symbol (no .NS suffix yet)."""
    return BROKER_TO_NSE.get(broker_sym, broker_sym)  # fallback: use as-is


def _fetch_price(broker_sym: str) -> tuple[str, float]:
    """Return (broker_sym, live_price). Returns 0.0 on failure."""
    import yfinance as yf
    nse_sym = _to_nse(broker_sym)
    # Try primary symbol
    for sym in [nse_sym] + _FALLBACK_MAP.get(broker_sym, []):
        try:
            yf_sym = f"{sym}.NS" if "." not in sym else sym
            info   = yf.Ticker(yf_sym).info
            price  = info.get("currentPrice") or info.get("regularMarketPrice")
            if isinstance(price, (int, float)) and price > 0:
                return broker_sym, float(price)
        except Exception:
            continue
    return broker_sym, 0.0


def parse_portfolio_lines(lines: list) -> dict:
    """Parse broker CSV lines into position records."""
    records = []
    for k in range(len(lines)):
        line = lines[k].strip()
        if line in ("Buy", "Sell"):
            if k >= 2 and k + 2 < len(lines):
                stock_name = (
                    lines[k - 2].strip()
                    .replace(" DELIVERY", "")
                    .replace(" MTF", "")
                    .strip()
                )
                action = line
                vals   = lines[k + 1].split("\t")
                if len(vals) >= 6:
                    ltp         = _clean_num(vals[0])
                    trade_price = _clean_num(vals[2])
                    qty         = _clean_num(vals[3])
                    status      = vals[5].strip()
                    if status == "Executed" and qty > 0 and trade_price > 0:
                        records.append({
                            "stock":      stock_name,
                            "action":     action,
                            "ltp":        ltp,       # CSV LTP — will be overwritten with live
                            "tradePrice": trade_price,
                            "qty":        qty,
                        })

    # Aggregate positions (process oldest first → reverse CSV order)
    port: dict = {}
    for r in reversed(records):
        stk = r["stock"]
        if stk not in port:
            port[stk] = {"qty": 0.0, "invested": 0.0, "ltp": r["ltp"], "realized": 0.0}
        q  = r["qty"]
        tp = r["tradePrice"]

        if r["action"] == "Buy":
            port[stk]["qty"]      += q
            port[stk]["invested"] += tp * q
            port[stk]["ltp"]       = r["ltp"]   # update LTP from latest record
        elif r["action"] == "Sell" and port[stk]["qty"] > 0:
            avg                    = port[stk]["invested"] / port[stk]["qty"]
            port[stk]["realized"] += (tp - avg) * q
            port[stk]["qty"]      -= q
            port[stk]["invested"] -= avg * q
            if port[stk]["qty"]      < 0: port[stk]["qty"]      = 0.0
            if port[stk]["invested"] < 0: port[stk]["invested"] = 0.0
            port[stk]["ltp"] = r["ltp"]

    return port


def build_result(port: dict, live_prices: dict) -> dict:
    """Combine parsed positions with live prices to build final result."""
    positions = []
    summary   = {"totalInvested": 0.0, "totalCurrent": 0.0,
                  "totalUnrealized": 0.0, "totalRealized": 0.0}

    for stk, d in port.items():
        inv = d["invested"]
        # Use live price if available and > 0, else fall back to CSV LTP
        live = live_prices.get(stk, 0.0)
        ltp  = live if live > 0 else d["ltp"]

        cur        = ltp * d["qty"]
        unrealized = cur - inv
        total_gain = unrealized + d["realized"]

        positions.append({
            "stock":      stk,
            "qty":        int(d["qty"]),
            "avgPrice":   round(inv / d["qty"], 2) if d["qty"] > 0 else 0,
            "ltp":        round(ltp, 2),
            "livePrice":  live > 0,   # flag: did we get a live price?
            "invested":   round(inv, 2),
            "current":    round(cur, 2),
            "unrealized": round(unrealized, 2),
            "realized":   round(d["realized"], 2),
            "totalPnl":   round(total_gain, 2),
            "pnlPct":     round(total_gain / inv * 100, 2) if inv > 0 else 0,
        })

        summary["totalInvested"]   += inv
        summary["totalCurrent"]    += cur
        summary["totalUnrealized"] += unrealized
        summary["totalRealized"]   += d["realized"]

    positions.sort(key=lambda x: x["invested"], reverse=True)
    for k in summary:
        summary[k] = round(summary[k], 2)
    summary["totalPnl"]    = round(summary["totalUnrealized"] + summary["totalRealized"], 2)
    summary["totalPnlPct"] = (
        round(summary["totalPnl"] / summary["totalInvested"] * 100, 2)
        if summary["totalInvested"] > 0 else 0
    )
    return {"positions": positions, "summary": summary}


def full_parse(csv_text: str) -> dict:
    """Full pipeline: parse + parallel live-price fetch."""
    lines = csv_text.splitlines()
    port  = parse_portfolio_lines(lines)

    # Fetch live prices for all unique stocks in parallel
    unique_stocks = list(port.keys())
    live_prices   = {}
    if unique_stocks:
        with concurrent.futures.ThreadPoolExecutor(max_workers=min(20, len(unique_stocks))) as ex:
            for broker_sym, price in ex.map(_fetch_price, unique_stocks):
                live_prices[broker_sym] = price

    return build_result(port, live_prices)


# ── Vercel handler ────────────────────────────────────────────────────────────
class handler(BaseHTTPRequestHandler):
    def _send(self, obj, status=200):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        try:
            length  = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            result  = full_parse(payload.get("csv", ""))
            self._send(result)
        except Exception as e:
            self._send({"error": str(e)}, 500)

    def do_GET(self):
        self._send({"positions": [], "summary": {
            "totalInvested": 0, "totalCurrent": 0,
            "totalUnrealized": 0, "totalRealized": 0,
            "totalPnl": 0, "totalPnlPct": 0
        }})

    def log_message(self, *args):
        pass
