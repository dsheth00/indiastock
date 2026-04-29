import { useState, useEffect, useRef, useCallback } from 'react';
import { createChart } from 'lightweight-charts';
import { fetchFundamentals, fetchHistory, NIFTY_50, CHART_PERIODS, TICKER_DIRECTORY, ALL_SYMBOLS, getCloudStore, setCloudStore } from '../utils/api';

export default function Analysis() {
    const [ticker, setTicker]   = useState('HDFCBANK');
    const [input, setInput]     = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [period, setPeriod]   = useState('1y');
    const [fund, setFund]       = useState(null);
    const [histData, setHistData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [cloudLoading, setCloudLoading] = useState(true);
    const [error, setError]     = useState('');
    const chartRef              = useRef(null);
    const chartInstance         = useRef(null);

    useEffect(() => {
        let mounted = true;
        async function loadCloud() {
            setCloudLoading(true);
            const [t, p, f, h] = await Promise.all([
                getCloudStore('indstk_ana_ticker'),
                getCloudStore('indstk_ana_period'),
                getCloudStore('indstk_ana_fund'),
                getCloudStore('indstk_ana_hist')
            ]);
            if (mounted) {
                if (t) setTicker(t);
                if (p) setPeriod(p);
                if (f) setFund(f);
                if (h) setHistData(h);
                setCloudLoading(false);
            }
        }
        loadCloud();
        return () => { mounted = false; };
    }, []);

    const load = useCallback(async (sym, p) => {
        setLoading(true);
        setError('');
        try {
            const [f, h] = await Promise.all([
                fetchFundamentals(sym),
                fetchHistory(sym, p),
            ]);
            if (f.error) throw new Error(f.error);
            setFund(f);
            setHistData(h.data || []);
            
            setCloudStore('indstk_ana_fund', f);
            setCloudStore('indstk_ana_hist', h.data || []);
            setCloudStore('indstk_ana_ticker', sym);
            setCloudStore('indstk_ana_period', p);
        } catch (e) {
            setError(e.message || 'Failed to load data');
        } finally {
            setLoading(false);
        }
    }, []);

    // Chart rendering
    useEffect(() => {
        if (!chartRef.current || histData.length === 0) return;
        if (chartInstance.current) { chartInstance.current.remove(); chartInstance.current = null; }

        const chart = createChart(chartRef.current, {
            width: chartRef.current.clientWidth,
            height: 400,
            layout: { background: { color: '#ffffff' }, textColor: '#64748b', fontFamily: "'Inter', sans-serif", fontSize: 12 },
            grid: { vertLines: { color: '#f1f5f9' }, horzLines: { color: '#f1f5f9' } },
            crosshair: { mode: 0 },
            rightPriceScale: { borderColor: '#e2e8f0' },
            timeScale: { borderColor: '#e2e8f0', timeVisible: false },
        });

        const candleSeries = chart.addCandlestickSeries({
            upColor: '#16a34a', downColor: '#dc2626',
            borderUpColor: '#16a34a', borderDownColor: '#dc2626',
            wickUpColor: '#16a34a', wickDownColor: '#dc2626',
        });
        candleSeries.setData(histData);

        const volumeSeries = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol' });
        chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
        volumeSeries.setData(histData.map(d => ({
            time: d.time, value: d.volume,
            color: d.close >= d.open ? 'rgba(22,163,74,.15)' : 'rgba(220,38,38,.15)',
        })));

        chart.timeScale().fitContent();
        chartInstance.current = chart;

        const ro = new ResizeObserver(() => {
            if (chartRef.current) chart.applyOptions({ width: chartRef.current.clientWidth });
        });
        ro.observe(chartRef.current);
        return () => { ro.disconnect(); chart.remove(); chartInstance.current = null; };
    }, [histData]);

    // Autocomplete
    const handleInputChange = (val) => {
        setInput(val);
        if (val.length < 1) { setSuggestions([]); return; }
        const q = val.toUpperCase();
        const matches = ALL_SYMBOLS
            .filter(s => s.startsWith(q) || (TICKER_DIRECTORY[s] || '').toUpperCase().includes(q))
            .slice(0, 8);
        setSuggestions(matches);
    };

    const handlePickSuggestion = (sym) => {
        setTicker(sym);
        setInput('');
        setSuggestions([]);
        load(sym, period);
    };

    const handleSearch = (e) => {
        e.preventDefault();
        if (input.trim()) {
            const sym = input.trim().toUpperCase();
            setTicker(sym);
            setInput('');
            setSuggestions([]);
            load(sym, period);
        }
    };

    const fmt = (v, prefix = '', suffix = '') => {
        if (v === null || v === undefined || v === 'N/A') return '—';
        return `${prefix}${typeof v === 'number' ? v.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : v}${suffix}`;
    };

    const metrics = fund ? [
        { label: 'Current Price',  value: fmt(fund.price, '₹') },
        { label: 'P/E Ratio',      value: fmt(fund.pe) },
        { label: 'ROE',            value: fmt(fund.roe, '', '%') },
        { label: 'Debt / Equity',  value: fmt(fund.debtEquity) },
        { label: 'Book Value',     value: fmt(fund.bookValue, '₹') },
        { label: 'Market Cap',     value: fund.marketCapCr || '—' },
        { label: 'EPS (TTM)',      value: fmt(fund.eps, '₹') },
        { label: 'Div. Yield',     value: fmt(fund.dividendYield, '', '%') },
        { label: '52w High',       value: fmt(fund.high52, '₹') },
        { label: '52w Low',        value: fmt(fund.low52, '₹') },
        { label: 'Beta',           value: fmt(fund.beta) },
        { label: 'P/B Ratio',      value: fmt(fund.pb) },
    ] : [];

    return (
        <div>
            <div className="page-header">
                <h2>🔍 Ticker Analysis</h2>
                <p>Deep dive into any NSE stock · fundamentals · interactive charts</p>
            </div>

            {/* ── Search ── */}
            <div className="flex gap-12 mb-24" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div className="input-group" style={{ flex: 1, minWidth: 240, position: 'relative' }}>
                    <label>Type any ticker symbol</label>
                    <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8 }}>
                        <input
                            className="input"
                            value={input}
                            onChange={e => handleInputChange(e.target.value)}
                            placeholder="e.g. HDFCBANK, RELIANCE, TCS…"
                            autoComplete="off"
                            style={{ flex: 1 }}
                        />
                        <button type="submit" className="btn btn-primary">Go</button>
                    </form>
                    {/* Autocomplete dropdown */}
                    {suggestions.length > 0 && (
                        <div style={{
                            position: 'absolute', top: '100%', left: 0, right: 40,
                            background: 'var(--bg-card)', border: '1px solid var(--border)',
                            borderRadius: 8, boxShadow: 'var(--shadow-md)', zIndex: 100, marginTop: 4
                        }}>
                            {suggestions.map(s => (
                                <div
                                    key={s}
                                    onClick={() => handlePickSuggestion(s)}
                                    style={{
                                        padding: '8px 14px', cursor: 'pointer', display: 'flex',
                                        justifyContent: 'space-between', fontSize: '.85rem',
                                        borderBottom: '1px solid var(--border)'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                    <span style={{ fontWeight: 700, fontFamily: 'var(--mono)' }}>{s}</span>
                                    <span style={{ color: 'var(--text-3)', fontSize: '.78rem' }}>
                                        {TICKER_DIRECTORY[s] || ''}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="input-group" style={{ minWidth: 220 }}>
                    <label>Or pick from directory ({ALL_SYMBOLS.length} stocks)</label>
                    <input 
                        list="ticker-list"
                        className="input" 
                        placeholder="Search Directory..."
                        value={ticker} 
                        onChange={e => { 
                            const sym = e.target.value.toUpperCase();
                            if (sym && (ALL_SYMBOLS.includes(sym) || sym.length > 2)) {
                                setTicker(sym); 
                                setInput(''); 
                                load(sym, period);
                            }
                        }}
                    />
                </div>

                <div className="input-group">
                    <label>Chart period</label>
                    <div className="flex gap-6">
                        {CHART_PERIODS.map(p => (
                            <button
                                key={p}
                                className={`btn ${period === p ? 'btn-primary' : ''}`}
                                onClick={() => { setPeriod(p); load(ticker, p); }}
                                style={{ padding: '8px 12px', fontSize: '.78rem' }}
                            >
                                {p === '1mo' ? '1M' : p === '3mo' ? '3M' : p === '6mo' ? '6M' : p.toUpperCase()}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {error && <div className="error-box mb-24">{error}</div>}
            
            {cloudLoading && <div className="loading"><div className="spinner" /> Loading from cloud…</div>}
            {loading && !cloudLoading && <div className="loading"><div className="spinner" /> Loading {ticker}…</div>}

            {!loading && !cloudLoading && fund && (
                <>
                    {/* Company name + link */}
                    <div className="flex items-center gap-12 mb-24" style={{ flexWrap: 'wrap' }}>
                        <div>
                            <h3 style={{ fontWeight: 800, fontSize: '1.2rem' }}>{fund.name || ticker}</h3>
                            <span className="mono text-2" style={{ fontSize: '.82rem' }}>{ticker}.NS · NSE</span>
                        </div>
                        <a
                            href={`https://www.screener.in/company/${ticker}/consolidated/`}
                            target="_blank" rel="noopener noreferrer"
                            className="btn"
                            style={{ marginLeft: 'auto', fontSize: '.78rem', padding: '5px 14px' }}
                        >
                            Screener.in ↗
                        </a>
                    </div>

                    {/* Key Fundamentals */}
                    <h4 style={{ fontWeight: 700, marginBottom: 12, color: 'var(--text-2)', fontSize: '.82rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                        Key Fundamentals
                    </h4>
                    <div className="card-grid mb-24">
                        {metrics.map(m => (
                            <div key={m.label} className="metric-card">
                                <div className="metric-label">{m.label}</div>
                                <div className="metric-value">{m.value}</div>
                            </div>
                        ))}
                    </div>

                    {/* Price Chart */}
                    <h4 style={{ fontWeight: 700, marginBottom: 12, color: 'var(--text-2)', fontSize: '.82rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                        Price Chart
                    </h4>
                    <div className="chart-container">
                        <div ref={chartRef} style={{ width: '100%', height: 400 }} />
                    </div>
                </>
            )}
        </div>
    );
}
