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

/* ── Nifty 50 ticker list (for client-side features) ─── */
export const NIFTY_50 = [
    'ADANIENT', 'ADANIPORTS', 'APOLLOHOSP', 'ASIANPAINT', 'AXISBANK',
    'BAJAJ-AUTO', 'BAJFINANCE', 'BAJAJFINSV', 'BEL', 'BPCL',
    'BHARTIARTL', 'BRITANNIA', 'CIPLA', 'COALINDIA', 'DRREDDY',
    'EICHERMOT', 'ETERNAL', 'GRASIM', 'HCLTECH', 'HDFCBANK',
    'HDFCLIFE', 'HEROMOTOCO', 'HINDALCO', 'HINDUNILVR', 'ICICIBANK',
    'ITC', 'INDUSINDBK', 'INFY', 'JSWSTEEL', 'KOTAKBANK',
    'LT', 'M&M', 'MARUTI', 'NESTLEIND', 'NTPC',
    'ONGC', 'POWERGRID', 'RELIANCE', 'SBILIFE', 'SBIN',
    'SHRIRAMFIN','SUNPHARMA','TCS','TATACONSUM','TATASTEEL',
  'TECHM','TITAN','TRENT','ULTRACEMCO','WIPRO',
];

export const CHART_PERIODS = ['1mo','3mo','6mo','1y','2y','5y'];

export const DEFAULT_WATCHLISTS = {
  "⭐ Bluechips": ["HDFCBANK", "RELIANCE", "TCS", "INFY", "ICICIBANK", "HCLTECH"],
  "🏦 Banking": ["SBIN", "KOTAKBANK", "AXISBANK", "INDUSINDBK", "BAJFINANCE"],
  "💻 IT & Tech": ["INFY", "TCS", "WIPRO", "TECHM", "HCLTECH", "LTIM"],
  "💊 Pharma": ["SUNPHARMA", "DRREDDY", "CIPLA", "DIVISLAB", "LUPIN"],
  "📈 My Picks": ["OLAELEC", "TITAN", "TRENT", "DMART", "ZOMATO"],
};

export const SCREENER_PRESETS = [
  "High ROE & Low Debt",
  "Undervalued Bluechips",
  "Dividend Picks",
  "Near 52-Week High",
  "Near 52-Week Low",
  "High Profit Margin",
  "Revenue Growth Stars",
  "Low P/B Value Picks",
  "Low Beta / Defensive",
  "High Operating Margin",
  "Strong Balance Sheet",
  "GARP",
  "Small-Cap Gems"
];
