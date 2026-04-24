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

export async function fetchMovers() {
    const r = await fetch(`${BASE}/movers`);
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
    'SHRIRAMFIN', 'SUNPHARMA', 'TCS', 'TATACONSUM', 'TATASTEEL',
    'TECHM', 'TITAN', 'TRENT', 'ULTRACEMCO', 'WIPRO',
];

export const CHART_PERIODS = ['1mo', '3mo', '6mo', '1y', '2y', '5y'];
