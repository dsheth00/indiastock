const BASE = '/api';

export async function fetchQuote(ticker) {
    const r = await fetch(`${BASE}/quote?ticker=${encodeURIComponent(ticker)}`);
    return r.json();
}

export async function fetchFundamentals(ticker) {
    const r = await fetch(`${BASE}/fundamentals?ticker=${encodeURIComponent(ticker)}`);
    return r.json();
}

export async function fetchHistory(ticker, period = '1y') {
    const r = await fetch(`${BASE}/history?ticker=${encodeURIComponent(ticker)}&period=${period}`);
    return r.json();
}

export async function fetchMovers(universe = 'nifty') {
    const r = await fetch(`${BASE}/movers?universe=${universe}`);
    return r.json();
}

export async function fetchScreener(preset, universe = 'nifty') {
    const r = await fetch(`${BASE}/screener?preset=${encodeURIComponent(preset)}&universe=${universe}`);
    return r.json();
}

export async function fetchPortfolio(csvText) {
    const r = await fetch(`${BASE}/portfolio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: csvText }),
    });
    return r.json();
}

/* ── Nifty 50 ─── */
export const NIFTY_50 = [
    'ADANIENT','ADANIPORTS','APOLLOHOSP','ASIANPAINT','AXISBANK',
    'BAJAJ-AUTO','BAJFINANCE','BAJAJFINSV','BEL','BPCL',
    'BHARTIARTL','BRITANNIA','CIPLA','COALINDIA','DRREDDY',
    'EICHERMOT','ETERNAL','GRASIM','HCLTECH','HDFCBANK',
    'HDFCLIFE','HEROMOTOCO','HINDALCO','HINDUNILVR','ICICIBANK',
    'ITC','INDUSINDBK','INFY','JSWSTEEL','KOTAKBANK',
    'LT','M&M','MARUTI','NESTLEIND','NTPC',
    'ONGC','POWERGRID','RELIANCE','SBILIFE','SBIN',
    'SHRIRAMFIN','SUNPHARMA','TCS','TATACONSUM','TATAMOTORS',
    'TATASTEEL','TECHM','TITAN','TRENT','ULTRACEMCO','WIPRO',
];

export const CHART_PERIODS = ['1mo','3mo','6mo','1y','2y','5y'];

export const DEFAULT_WATCHLISTS = {
    "⭐ Bluechips": ["HDFCBANK","RELIANCE","TCS","INFY","ICICIBANK","HCLTECH"],
    "🏦 Banking":   ["SBIN","KOTAKBANK","AXISBANK","INDUSINDBK","BAJFINANCE"],
    "💻 IT & Tech": ["INFY","TCS","WIPRO","TECHM","HCLTECH","LTIM"],
    "💊 Pharma":    ["SUNPHARMA","DRREDDY","CIPLA","DIVISLAB","LUPIN"],
    "📈 My Picks":  ["OLAELEC","TITAN","TRENT","DMART","ZOMATO"],
};

export const SCREENER_PRESETS = [
    { id: "High ROE & Low Debt",               desc: "ROE > 15% · D/E < 0.5 — quality compounders" },
    { id: "Undervalued Bluechips",             desc: "P/E < 25 · MCap > ₹50k Cr — large-caps cheap" },
    { id: "Dividend Picks",                    desc: "Dividend Yield > 1.5% — income generators" },
    { id: "Near 52-Week High",                 desc: "Price within 5% of 52w high — momentum" },
    { id: "Near 52-Week Low",                  desc: "Price within 10% of 52w low — potential turnaround" },
    { id: "High Profit Margin",                desc: "Net margin > 20% — pricing power" },
    { id: "Revenue Growth Stars",              desc: "Revenue growth > 15% YoY — fast growers" },
    { id: "Low P/B Value Picks",               desc: "P/B < 2 · ROE > 10% — asset-rich bargains" },
    { id: "Low Beta / Defensive",              desc: "Beta < 0.8 · Div Yield > 1% — low volatility" },
    { id: "High Operating Margin",             desc: "Operating margin > 25% — efficient operations" },
    { id: "Strong Balance Sheet",              desc: "Current Ratio > 1.5 · D/E < 0.3 — financially robust" },
    { id: "GARP (Growth at Reasonable Price)", desc: "Rev growth > 10%, ROE > 12%, P/E < 30" },
    { id: "Small-Cap Gems",                    desc: "MCap < ₹10k Cr · ROE > 15% · Margin > 10%" },
];

// Full ticker directory for autocomplete/search (symbol → company name)
export const TICKER_DIRECTORY = {
    "ADANIENT":"Adani Enterprises Ltd","ADANIPORTS":"Adani Ports & SEZ Ltd",
    "APOLLOHOSP":"Apollo Hospitals Enterprise Ltd","ASIANPAINT":"Asian Paints Ltd",
    "AXISBANK":"Axis Bank Ltd","BAJAJ-AUTO":"Bajaj Auto Ltd","BAJFINANCE":"Bajaj Finance Ltd",
    "BAJAJFINSV":"Bajaj Finserv Ltd","BEL":"Bharat Electronics Ltd","BPCL":"Bharat Petroleum Corp Ltd",
    "BHARTIARTL":"Bharti Airtel Ltd","BRITANNIA":"Britannia Industries Ltd","CIPLA":"Cipla Ltd",
    "COALINDIA":"Coal India Ltd","DRREDDY":"Dr. Reddy's Laboratories Ltd","EICHERMOT":"Eicher Motors Ltd",
    "ETERNAL":"Eternal Ltd","GRASIM":"Grasim Industries Ltd","HCLTECH":"HCL Technologies Ltd",
    "HDFCBANK":"HDFC Bank Ltd","HDFCLIFE":"HDFC Life Insurance Company Ltd","HEROMOTOCO":"Hero MotoCorp Ltd",
    "HINDALCO":"Hindalco Industries Ltd","HINDUNILVR":"Hindustan Unilever Ltd","ICICIBANK":"ICICI Bank Ltd",
    "ITC":"ITC Ltd","INDUSINDBK":"IndusInd Bank Ltd","INFY":"Infosys Ltd","JSWSTEEL":"JSW Steel Ltd",
    "KOTAKBANK":"Kotak Mahindra Bank Ltd","LT":"Larsen & Toubro Ltd","M&M":"Mahindra & Mahindra Ltd",
    "MARUTI":"Maruti Suzuki India Ltd","NESTLEIND":"Nestle India Ltd","NTPC":"NTPC Ltd",
    "ONGC":"Oil & Natural Gas Corp Ltd","POWERGRID":"Power Grid Corp of India Ltd",
    "RELIANCE":"Reliance Industries Ltd","SBILIFE":"SBI Life Insurance Company Ltd",
    "SBIN":"State Bank of India","SHRIRAMFIN":"Shriram Finance Ltd",
    "SUNPHARMA":"Sun Pharmaceutical Industries Ltd","TCS":"Tata Consultancy Services Ltd",
    "TATACONSUM":"Tata Consumer Products Ltd","TATAMOTORS":"Tata Motors Ltd","TATASTEEL":"Tata Steel Ltd",
    "TECHM":"Tech Mahindra Ltd","TITAN":"Titan Company Ltd","TRENT":"Trent Ltd",
    "ULTRACEMCO":"UltraTech Cement Ltd","WIPRO":"Wipro Ltd",
    // Popular additions
    "OLAELEC":"Ola Electric Mobility Ltd","ZOMATO":"Zomato Ltd","PAYTM":"One97 Communications Ltd",
    "NYKAA":"FSN E-Commerce Ventures Ltd","DELHIVERY":"Delhivery Ltd","POLICYBZR":"PB Fintech Ltd",
    "IRCTC":"Indian Railway Catering & Tourism Corp","HAL":"Hindustan Aeronautics Ltd",
    "BANKBARODA":"Bank of Baroda","PNB":"Punjab National Bank","CANBK":"Canara Bank",
    "IDFCFIRSTB":"IDFC First Bank Ltd","FEDERALBNK":"Federal Bank Ltd","BANDHANBNK":"Bandhan Bank Ltd",
    "VEDL":"Vedanta Ltd","ADANIGREEN":"Adani Green Energy Ltd","ADANIPOWER":"Adani Power Ltd",
    "AMBUJACEM":"Ambuja Cements Ltd","ACC":"ACC Ltd","DABUR":"Dabur India Ltd",
    "GODREJCP":"Godrej Consumer Products Ltd","MARICO":"Marico Ltd","COLPAL":"Colgate-Palmolive India Ltd",
    "PIDILITIND":"Pidilite Industries Ltd","BERGEPAINT":"Berger Paints India Ltd",
    "HAVELLS":"Havells India Ltd","VOLTAS":"Voltas Ltd","TATAPOWER":"Tata Power Company Ltd",
    "TATAELXSI":"Tata Elxsi Ltd","PERSISTENT":"Persistent Systems Ltd","COFORGE":"Coforge Ltd",
    "LTIM":"LTIMindtree Ltd","MPHASIS":"Mphasis Ltd","DIVISLAB":"Divi's Laboratories Ltd",
    "BIOCON":"Biocon Ltd","LUPIN":"Lupin Ltd","AUROPHARMA":"Aurobindo Pharma Ltd",
    "TORNTPHARM":"Torrent Pharmaceuticals Ltd","SBICARD":"SBI Cards & Payment Services Ltd",
    "CHOLAFIN":"Cholamandalam Investment & Finance Co","MUTHOOTFIN":"Muthoot Finance Ltd",
    "MANAPPURAM":"Manappuram Finance Ltd","MOTHERSON":"Samvardhana Motherson International",
    "BOSCHLTD":"Bosch Ltd","SIEMENS":"Siemens Ltd","ABB":"ABB India Ltd",
    "PAGEIND":"Page Industries Ltd","DMART":"Avenue Supermarts Ltd","JIOFIN":"Jio Financial Services Ltd",
    "PIIND":"PI Industries Ltd","UNIP":"Uniparts India Ltd","SANOFI":"Sanofi India Ltd",
    "LIC":"Life Insurance Corporation of India","COALIN":"Coal India Ltd (abbr)","SQSIND":"SQS India BFSI Ltd",
    "INDRAI":"Indraprasta Gas Ltd","SAGINI":"Sagar Industries","MSTLIM":"Masters India Ltd",
    "TATPOW":"Tata Power Ltd","TATSTE":"Tata Steel Ltd (abbr)","CASIND":"Cash India Ltd",
    "HDFBAN":"HDFC Bank Ltd (abbr)","ICIBAN":"ICICI Bank Ltd (abbr)","IDFBAN":"IDFC First Bank (abbr)",
    "ADAPOW":"Adani Power Ltd (abbr)","ADAPOR":"Adani Ports (abbr)","VEDLIM":"Vedanta Ltd (abbr)",
    "RELIND":"Reliance Industries (abbr)","INDWHO":"India Wholesale Ltd","OLAELE":"Ola Electric (abbr)",
    "WEBENE":"Web Energy Ltd","WIPRO":"Wipro Ltd",
};

// Sorted list of all tickers for dropdown/search
export const ALL_SYMBOLS = Object.keys(TICKER_DIRECTORY).sort();
