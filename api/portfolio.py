"""
POST /api/portfolio  — parse uploaded port.csv content and return positions + P&L
GET  /api/portfolio  — return cached portfolio (from Vercel KV or in-memory; falls back to empty)

Since Vercel serverless is stateless, we parse the raw CSV text sent from the client.
The client reads port.csv from a file-input or a stored localStorage blob.
"""
import json
import re
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse


def _clean_num(s: str) -> float:
    try:
        return float(re.sub(r'[^\d.\-]', '', s.strip()))
    except Exception:
        return 0.0


def parse_portfolio_lines(lines: list[str]) -> dict:
    """Parse the broker export format into positions dict."""
    records = []
    for k in range(len(lines)):
        line = lines[k].strip()
        if line in ("Buy", "Sell"):
            if k >= 2 and k + 2 < len(lines):
                stock_name = (
                    lines[k - 2].strip()
                    .replace(" DELIVERY", "")
                    .replace(" MTF", "")
                )
                action = line
                vals = lines[k + 1].split("\t")
                if len(vals) >= 6:
                    ltp        = _clean_num(vals[0])
                    trade_price = _clean_num(vals[2])
                    qty        = _clean_num(vals[3])
                    status     = vals[5].strip()
                    if status == "Executed" and qty > 0 and trade_price > 0:
                        records.append({
                            "stock": stock_name,
                            "action": action,
                            "ltp": ltp,
                            "tradePrice": trade_price,
                            "qty": qty,
                        })

    # Aggregate positions (oldest-first)
    port: dict[str, dict] = {}
    for r in reversed(records):
        stk = r["stock"]
        if stk not in port:
            port[stk] = {"qty": 0.0, "invested": 0.0, "ltp": r["ltp"], "realized": 0.0}
        q  = r["qty"]
        tp = r["tradePrice"]

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
    summary = {"totalInvested": 0.0, "totalCurrent": 0.0,
                "totalUnrealized": 0.0, "totalRealized": 0.0}

    for stk, d in port.items():
        inv        = d["invested"]
        cur        = d["ltp"] * d["qty"]
        unrealized = cur - inv
        total_gain = unrealized + d["realized"]

        positions.append({
            "stock":      stk,
            "qty":        int(d["qty"]),
            "avgPrice":   round(inv / d["qty"], 2) if d["qty"] > 0 else 0,
            "ltp":        round(d["ltp"], 2),
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

    # Sort by invested amount desc
    positions.sort(key=lambda x: x["invested"], reverse=True)
    for k in summary:
        summary[k] = round(summary[k], 2)
    summary["totalPnl"]    = round(summary["totalUnrealized"] + summary["totalRealized"], 2)
    summary["totalPnlPct"] = (
        round(summary["totalPnl"] / summary["totalInvested"] * 100, 2)
        if summary["totalInvested"] > 0 else 0
    )
    return {"positions": positions, "summary": summary}


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
            body   = self.rfile.read(length).decode("utf-8")
            payload = json.loads(body)
            csv_text = payload.get("csv", "")
            lines = csv_text.splitlines()
            result = parse_portfolio_lines(lines)
            self._send(result)
        except Exception as e:
            self._send({"error": str(e)}, 500)

    def do_GET(self):
        # Return empty — client drives everything via POST
        self._send({"positions": [], "summary": {
            "totalInvested": 0, "totalCurrent": 0,
            "totalUnrealized": 0, "totalRealized": 0,
            "totalPnl": 0, "totalPnlPct": 0
        }})
    
    def log_message(self, *args):
        pass
