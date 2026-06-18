"""
POST /api/portfolio — parse broker port.csv or tradeBook CSV, fetch live prices,
return positions, full trade log, and performance-over-time series.
"""
import csv
import json
import re
import concurrent.futures
from datetime import datetime
from http.server import BaseHTTPRequestHandler
from io import StringIO

STARTING_BALANCE = 7_272_047.74

BROKER_TO_NSE = {
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
    "INDWHO":  "INDHOTEL",
    "INDRAI":  "IGL",
    "LIC":     "LICI",
    "CASIND":  "CAMS",
    "SQSIND":  "SQS",
    "WEBENE":  "WEBELSOLAR",
    "SAGINI":  "SAGCEM",
    "MSTLIM":  "MSTCLTD",
    "UNIP":    "UNIPARTS",
    "SANOFI":  "SANOFI",
    "JIOFIN":  "JIOFIN",
    "PIIND":   "PIIND",
    "WIPRO":   "WIPRO",
    "ITC":     "ITC",
    "ANGBRO":  "ANGELONE",
    "ZEEENT":  "ZEEL",
    "POWTRA":  "POWERGRID",
    "JAMKAS":  "JAMNAAUTO",
    "SUVPH":   "SUNPHARMA",
}

_FALLBACK_MAP = {
    "CASIND":  ["CAMS", "CAMPHOR", "CASTROLIND"],
    "SQSIND":  ["SQSIND", "SQS"],
    "WEBENE":  ["WEBELSOLAR", "WEBENE"],
    "SAGINI":  ["SAGCEM", "SAGARSOFT"],
    "MSTLIM":  ["MSTCLTD", "MASTEK"],
    "UNIP":    ["UNIPARTS", "UNIPHOS"],
}


def _clean_num(s: str) -> float:
    try:
        return float(re.sub(r"[^\d.\-]", "", str(s).strip()))
    except Exception:
        return 0.0


def _parse_date(s: str) -> datetime | None:
    s = (s or "").strip()
    if not s:
        return None
    for fmt in ("%d-%b-%Y", "%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(s.split()[0], fmt)
        except ValueError:
            continue
    return None


def _date_key(dt: datetime | None) -> str:
    return dt.strftime("%Y-%m-%d") if dt else "9999-12-31"


def _to_nse(broker_sym: str) -> str:
    return BROKER_TO_NSE.get(broker_sym, broker_sym)


def _fetch_price(broker_sym: str) -> tuple[str, float]:
    import yfinance as yf
    nse_sym = _to_nse(broker_sym)
    for sym in [nse_sym] + _FALLBACK_MAP.get(broker_sym, []):
        try:
            yf_sym = f"{sym}.NS" if "." not in sym else sym
            info = yf.Ticker(yf_sym).info
            price = info.get("currentPrice") or info.get("regularMarketPrice")
            if isinstance(price, (int, float)) and price > 0:
                return broker_sym, float(price)
        except Exception:
            continue
    return broker_sym, 0.0


def _parse_port_records(lines: list) -> list:
    records = []
    for k in range(len(lines)):
        line = lines[k].strip()
        if line in ("Buy", "Sell"):
            if k >= 2 and k + 1 < len(lines):
                stock_name = (
                    lines[k - 2].strip()
                    .replace(" DELIVERY", "")
                    .replace(" MTF", "")
                    .strip()
                )
                vals = lines[k + 1].split("\t")
                if len(vals) >= 6:
                    ltp = _clean_num(vals[0])
                    trade_price = _clean_num(vals[2])
                    qty = _clean_num(vals[3])
                    status = vals[5].strip()
                    if status == "Executed" and qty > 0 and trade_price > 0:
                        date_str = lines[k - 1].strip().split()[0] if k >= 1 else ""
                        records.append({
                            "date": date_str,
                            "dateSort": _date_key(_parse_date(date_str)),
                            "stock": stock_name,
                            "action": line,
                            "qty": qty,
                            "price": trade_price,
                            "value": round(qty * trade_price, 2),
                            "ltp": ltp or trade_price,
                        })
    return records


def _parse_tradebook_records(lines: list) -> list:
    if not lines:
        return []
    header = lines[0].strip().lower()
    if not (header.startswith("date,") and "stock" in header and "action" in header):
        return []

    records = []
    reader = csv.DictReader(StringIO("\n".join(lines)))
    for row in reader:
        stock = (row.get("Stock") or "").strip()
        action = (row.get("Action") or "").strip()
        if not stock or action not in ("Buy", "Sell"):
            continue
        qty = _clean_num(row.get("Qty") or "0")
        price = _clean_num(row.get("Price") or "0")
        if qty <= 0 or price <= 0:
            continue
        date_str = (row.get("Date") or "").strip()
        dt = _parse_date(date_str)
        records.append({
            "date": date_str,
            "dateSort": _date_key(dt),
            "stock": stock,
            "action": action,
            "qty": qty,
            "price": price,
            "value": round(qty * price, 2),
            "ltp": price,
        })
    return records


def _sort_records(records: list) -> list:
    return sorted(records, key=lambda r: (r["dateSort"], r.get("stock", ""), r["action"]))


def _simulate_portfolio(records: list, live_prices: dict | None = None) -> dict:
    """Chronological FIFO simulation → positions, trades log, cash, performance."""
    live_prices = live_prices or {}
    cash = STARTING_BALANCE
    holdings: dict[str, dict] = {}
    marks: dict[str, float] = {}
    port: dict[str, dict] = {}
    trades_out = []
    performance = []

    def holdings_value() -> float:
        total = 0.0
        for stk, h in holdings.items():
            if h["qty"] <= 0:
                continue
            mark = live_prices.get(stk) or marks.get(stk) or (h["invested"] / h["qty"] if h["qty"] else 0)
            total += h["qty"] * mark
        return total

    def snapshot(date_label: str, date_sort: str):
        hv = holdings_value()
        performance.append({
            "date": date_label,
            "dateSort": date_sort,
            "totalValue": round(cash + hv, 2),
            "cash": round(cash, 2),
            "holdingsValue": round(hv, 2),
            "invested": round(sum(h["invested"] for h in holdings.values()), 2),
        })

    if records:
        first = records[0]
        performance.append({
            "date": first["date"] or "Start",
            "dateSort": first["dateSort"],
            "totalValue": round(STARTING_BALANCE, 2),
            "cash": round(STARTING_BALANCE, 2),
            "holdingsValue": 0.0,
            "invested": 0.0,
        })

    for r in records:
        stk = r["stock"]
        q = r["qty"]
        price = r["price"]
        action = r["action"]

        if stk not in port:
            port[stk] = {"qty": 0.0, "invested": 0.0, "ltp": r["ltp"], "realized": 0.0}
        if stk not in holdings:
            holdings[stk] = {"qty": 0.0, "invested": 0.0}
        marks[stk] = price

        cash_before = cash
        if action == "Buy":
            cash -= q * price
            holdings[stk]["qty"] += q
            holdings[stk]["invested"] += q * price
            port[stk]["qty"] += q
            port[stk]["invested"] += q * price
            port[stk]["ltp"] = r["ltp"]
        else:
            sell_qty = min(q, holdings[stk]["qty"]) if holdings[stk]["qty"] > 0 else 0.0
            if sell_qty <= 0:
                trades_out.append({
                    **r,
                    "qty": q,
                    "executedQty": 0,
                    "cashAfter": round(cash, 2),
                    "note": "No open position",
                })
                continue
            avg = holdings[stk]["invested"] / holdings[stk]["qty"]
            proceeds = sell_qty * price
            cash += proceeds
            realized = (price - avg) * sell_qty
            holdings[stk]["qty"] -= sell_qty
            holdings[stk]["invested"] -= avg * sell_qty
            port[stk]["realized"] += realized
            port[stk]["qty"] -= sell_qty
            port[stk]["invested"] -= avg * sell_qty
            if holdings[stk]["qty"] < 0.001:
                holdings[stk] = {"qty": 0.0, "invested": 0.0}
            if port[stk]["qty"] < 0.001:
                port[stk]["qty"] = 0.0
                port[stk]["invested"] = 0.0
            port[stk]["ltp"] = r["ltp"]
            q = sell_qty

        trades_out.append({
            "date": r["date"],
            "dateSort": r["dateSort"],
            "stock": stk,
            "action": action,
            "qty": r["qty"] if action == "Buy" else q,
            "price": price,
            "value": round((r["qty"] if action == "Buy" else q) * price, 2),
            "cashAfter": round(cash, 2),
            "holdingsValue": round(holdings_value(), 2),
            "totalValue": round(cash + holdings_value(), 2),
        })
        snapshot(r["date"], r["dateSort"])

    # Today point with live marks
    today = datetime.now().strftime("%Y-%m-%d")
    for stk, h in holdings.items():
        if h["qty"] > 0 and live_prices.get(stk):
            marks[stk] = live_prices[stk]
    hv = holdings_value()
    performance.append({
        "date": "Today",
        "dateSort": today,
        "totalValue": round(cash + hv, 2),
        "cash": round(cash, 2),
        "holdingsValue": round(hv, 2),
        "invested": round(sum(h["invested"] for h in holdings.values()), 2),
    })

    return {
        "port": port,
        "trades": trades_out,
        "performance": performance,
        "cash": round(cash, 2),
        "holdingsValue": round(hv, 2),
    }


def build_result(port: dict, live_prices: dict, trades: list, performance: list, cash: float) -> dict:
    positions = []
    summary = {
        "totalInvested": 0.0, "totalCurrent": 0.0,
        "totalUnrealized": 0.0, "totalRealized": 0.0,
        "startingBalance": STARTING_BALANCE,
        "cash": cash,
    }

    for stk, d in port.items():
        if d["qty"] <= 0 and abs(d["realized"]) < 0.01:
            continue
        inv = d["invested"]
        live = live_prices.get(stk, 0.0)
        ltp = live if live > 0 else d["ltp"]
        cur = ltp * d["qty"]
        unrealized = cur - inv
        total_gain = unrealized + d["realized"]

        positions.append({
            "stock": stk,
            "qty": int(d["qty"]) if d["qty"] >= 1 else round(d["qty"], 2),
            "avgPrice": round(inv / d["qty"], 2) if d["qty"] > 0 else 0,
            "ltp": round(ltp, 2),
            "livePrice": live > 0,
            "invested": round(inv, 2),
            "current": round(cur, 2),
            "unrealized": round(unrealized, 2),
            "realized": round(d["realized"], 2),
            "totalPnl": round(total_gain, 2),
            "pnlPct": round(total_gain / inv * 100, 2) if inv > 0 else 0,
        })

        summary["totalInvested"] += inv
        summary["totalCurrent"] += cur
        summary["totalUnrealized"] += unrealized
        summary["totalRealized"] += d["realized"]

    positions.sort(key=lambda x: x["invested"], reverse=True)
    for k in ("totalInvested", "totalCurrent", "totalUnrealized", "totalRealized"):
        summary[k] = round(summary[k], 2)
    summary["totalPnl"] = round(summary["totalUnrealized"] + summary["totalRealized"], 2)
    summary["totalPnlPct"] = (
        round(summary["totalPnl"] / summary["totalInvested"] * 100, 2)
        if summary["totalInvested"] > 0 else 0
    )
    summary["totalAccountValue"] = round(cash + summary["totalCurrent"], 2)
    summary["cashPct"] = round(cash / summary["totalAccountValue"] * 100, 1) if summary["totalAccountValue"] > 0 else 0

    return {
        "positions": positions,
        "summary": summary,
        "trades": list(reversed(trades)),
        "performance": performance,
    }


def full_parse(csv_text: str) -> dict:
    lines = csv_text.splitlines()
    tradebook = _parse_tradebook_records(lines)
    portfmt = _parse_port_records(lines)
    # Prefer tradebook when present; avoid double-counting
    records = _sort_records(tradebook if tradebook else portfmt)

    unique_stocks = list({r["stock"] for r in records})
    live_prices = {}
    if unique_stocks:
        with concurrent.futures.ThreadPoolExecutor(max_workers=min(20, len(unique_stocks))) as ex:
            for sym, price in ex.map(_fetch_price, unique_stocks):
                live_prices[sym] = price

    sim = _simulate_portfolio(records, live_prices)
    return build_result(sim["port"], live_prices, sim["trades"], sim["performance"], sim["cash"])


def parse_portfolio_lines(lines: list) -> dict:
    records = _sort_records(_parse_port_records(lines))
    sim = _simulate_portfolio(records, {})
    return sim["port"]


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
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            result = full_parse(payload.get("csv", ""))
            self._send(result)
        except Exception as e:
            self._send({"error": str(e)}, 500)

    def do_GET(self):
        self._send({"positions": [], "summary": {
            "totalInvested": 0, "totalCurrent": 0,
            "totalUnrealized": 0, "totalRealized": 0,
            "totalPnl": 0, "totalPnlPct": 0,
        }})

    def log_message(self, *args):
        pass
