"""GET /api/screener?preset=High%20ROE&universe=nifty50"""
import json
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

import yfinance as yf

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
    "GARP": lambda r: _num(r.get("Revenue Growth")) > 10 and _num(r.get("ROE")) > 12 and _num(r.get("P/E"), 999) < 30,
    "Small-Cap Gems": lambda r: 0 < _num(r.get("Market Cap")) < 100_000_000_000 and _num(r.get("ROE")) > 15 and _num(r.get("Profit Margin")) > 10,
}

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
    "TECHM","TITAN","TRENT","ULTRACEMCO","WIPRO"
]

ALL_NSE = NIFTY_50 + [
    "OLAELEC","ZOMATO","PAYTM","NYKAA","DELHIVERY","POLICYBZR","IRCTC","HAL","BANKBARODA",
    "PNB","CANBK","IDFCFIRSTB","FEDERALBNK","BANDHANBNK","VEDL","ADANIGREEN","ADANIPOWER",
    "AMBUJACEM","ACC","DABUR","GODREJCP","MARICO","COLPAL","PIDILITIND","BERGEPAINT",
    "HAVELLS","VOLTAS","TATAPOWER","TATAELXSI","PERSISTENT","COFORGE","LTIM","MPHASIS",
    "DIVISLAB","BIOCON","LUPIN","AUROPHARMA","TORNTPHARM","SBICARD","CHOLAFIN","MUTHOOTFIN",
    "MANAPPURAM","MOTHERSON","BOSCHLTD","SIEMENS","ABB","PAGEIND","DMART","JIOFIN",
    "DLF","VBL","GAIL","IOC","RECLTD","PFC","SRF","HDFCLIFE","ICICIPRULI","HDFCAMC"
]

BANK_NIFTY = ["HDFCBANK", "ICICIBANK", "SBIN", "KOTAKBANK", "AXISBANK", "INDUSINDBK", "AUBL", "BANDHANBNK", "FEDERALBNK", "IDFCFIRSTB", "PNB", "BANKBARODA"]
NEXT_50 = ["TATAELXSI", "LTIM", "ABB", "SIEMENS", "DMART", "MUTHOOTFIN", "COLPAL", "DABUR", "MARICO", "PIDILITIND", "BERGEPAINT", "HAVELLS", "TATAPOWER", "GAIL", "IOC", "DLF", "VBL", "PFC", "RECLTD", "CANBK", "BANKBARODA", "PNB", "SRF", "PIIND", "HAL", "BEL"]
FNO = NIFTY_50 + BANK_NIFTY + NEXT_50 + ["AMBUJACEM", "ACC", "VEDL", "TATAMOTORS", "TATACONSUM", "HINDALCO", "JSWSTEEL", "ADANIENT", "ADANIPORTS"]
FNO = sorted(list(set(FNO)))


NAMES = {"ADANIENT":"Adani Enterprises","ADANIPORTS":"Adani Ports","APOLLOHOSP":"Apollo Hospitals","ASIANPAINT":"Asian Paints","AXISBANK":"Axis Bank","BAJAJ-AUTO":"Bajaj Auto","BAJFINANCE":"Bajaj Finance","BAJAJFINSV":"Bajaj Finserv","BEL":"Bharat Electronics","BPCL":"BPCL","BHARTIARTL":"Bharti Airtel","BRITANNIA":"Britannia","CIPLA":"Cipla","COALINDIA":"Coal India","DRREDDY":"Dr. Reddy's","EICHERMOT":"Eicher Motors","ETERNAL":"Eternal","GRASIM":"Grasim","HCLTECH":"HCL Tech","HDFCBANK":"HDFC Bank","HDFCLIFE":"HDFC Life","HEROMOTOCO":"Hero MotoCorp","HINDALCO":"Hindalco","HINDUNILVR":"HUL","ICICIBANK":"ICICI Bank","ITC":"ITC","INDUSINDBK":"IndusInd Bank","INFY":"Infosys","JSWSTEEL":"JSW Steel","KOTAKBANK":"Kotak Bank","LT":"L&T","M&M":"M&M","MARUTI":"Maruti Suzuki","NESTLEIND":"Nestle India","NTPC":"NTPC","ONGC":"ONGC","POWERGRID":"Power Grid","RELIANCE":"Reliance","SBILIFE":"SBI Life","SBIN":"SBI","SHRIRAMFIN":"Shriram Finance","SUNPHARMA":"Sun Pharma","TCS":"TCS","TATACONSUM":"Tata Consumer","TATASTEEL":"Tata Steel","TECHM":"Tech Mahindra","TITAN":"Titan","TRENT":"Trent","ULTRACEMCO":"UltraTech Cement","WIPRO":"Wipro"}
for t in ALL_NSE:
    if t not in NAMES:
        NAMES[t] = t

def _s(info, key, fb="N/A"):
    v = info.get(key)
    return v if v is not None else fb

def _pct(info, key):
    v = info.get(key)
    return round(v * 100, 2) if isinstance(v, (int, float)) else None

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        qs = parse_qs(urlparse(self.path).query)
        preset_name = qs.get("preset", ["High ROE & Low Debt"])[0]
        uni = qs.get("universe", ["nifty"])[0]
        
        if uni == "nifty": tickers = NIFTY_50
        elif uni == "banknifty": tickers = BANK_NIFTY
        elif uni == "next50": tickers = NEXT_50
        elif uni == "fno": tickers = FNO
        else: tickers = ALL_NSE

        filter_fn = PRESETS.get(preset_name, PRESETS["High ROE & Low Debt"])
        
        rows = []
        try:
            # We must fetch fundamentals for all tickers. That takes a lot of time via yf.Ticker(t).info sequentially.
            # To be faster for 100 tickers, we fetch quotes using yf.download or fast threading.
            # Vercel hobby limits function to 10s. For fundamentals, yf.Ticker.info is slow.
            # So instead, we'll try to batch download basic metrics or just do the 50 stocks (which takes ~5s).
            # Actually yf.download doesn't give P/E, ROE, etc. So we have to fetch .info.
            import concurrent.futures
            
            def get_f(t):
                info = yf.Ticker(f"{t}.NS").info
                mc = _s(info, "marketCap")
                fund = {
                    "Ticker": t,
                    "Name": NAMES.get(t, t),
                    "Current Price": _s(info, "currentPrice"),
                    "P/E": _s(info, "trailingPE"),
                    "ROE": _pct(info, "returnOnEquity"),
                    "Debt/Equity": _s(info, "debtToEquity"),
                    "Book Value": _s(info, "bookValue"),
                    "Market Cap": mc,
                    "Market Cap (Cr)": f"₹{mc / 1e7:,.0f} Cr" if isinstance(mc, (int, float)) else "N/A",
                    "Dividend Yield": _pct(info, "dividendYield"),
                    "Profit Margin": _pct(info, "profitMargins"),
                    "Revenue Growth": _pct(info, "revenueGrowth"),
                    "Operating Margin": _pct(info, "operatingMargins"),
                    "Current Ratio": _s(info, "currentRatio"),
                    "52w High": _s(info, "fiftyTwoWeekHigh"),
                    "52w Low": _s(info, "fiftyTwoWeekLow"),
                    "Beta": _s(info, "beta"),
                    "P/B": _s(info, "priceToBook")
                }
                # Price filtering logic for universes
                if uni == "gt20" and _num(fund["Current Price"]) <= 20: return None
                if uni == "lt20" and _num(fund["Current Price"]) >= 20: return None
                
                return fund if filter_fn(fund) else None


            # Thread pool to speed it up!
            with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
                results = executor.map(get_f, tickers)
            
            for res in results:
                if res is not None:
                    rows.append(res)
                    
        except Exception as e:
            rows = [{"error": str(e)}]
        
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(rows).encode())
