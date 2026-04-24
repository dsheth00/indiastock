import { useState, useEffect, useRef, useCallback } from 'react';
import { createChart } from 'lightweight-charts';
import { fetchFundamentals, fetchHistory, NIFTY_50, CHART_PERIODS } from '../utils/api';

export default function Analysis() {
    const [ticker, setTicker] = useState('HDFCBANK');
    const [input, setInput] = useState('');
    const [period, setPeriod] = useState('1y');
    const [fund, setFund] = useState(null);
    const [histData, setHistData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const chartRef = useRef(null);
    const chartInstance = useRef(null);

    const load = useCallback(async (sym) => {
        setLoading(true);
        setError('');
        try {
            const [f, h] = await Promise.all([
                fetchFundamentals(sym),
                fetchHistory(sym, period),
            ]);
            if (f.error) throw new Error(f.error);
            setFund(f);
            setHistData(h.data || []);
        } catch (e) {
            setError(e.message || 'Failed to load data');
        } finally {
            setLoading(false);
        }
    }, [period]);

    useEffect(() => { load(ticker); }, [ticker, load]);

    // Chart rendering
    useEffect(() => {
        if (!chartRef.current || histData.length === 0) return;

        // Clean up previous chart
        if (chartInstance.current) {
            chartInstance.current.remove();
            chartInstance.current = null;
        }

        const chart = createChart(chartRef.current, {
            width: chartRef.current.clientWidth,
            height: 420,
            layout: {
                background: { color: '#ffffff' },
                textColor: '#64748b',
                fontFamily: "'Inter', sans-serif",
                fontSize: 12,
            },
            grid: {
                vertLines: { color: '#f1f5f9' },
                horzLines: { color: '#f1f5f9' },
            },
            crosshair: { mode: 0 },
            rightPriceScale: { borderColor: '#e2e8f0' },
            timeScale: {
                borderColor: '#e2e8f0',
                timeVisible: false,
            },
        });

        const candleSeries = chart.addCandlestickSeries({
            upColor: '#16a34a',
            downColor: '#dc2626',
            borderUpColor: '#16a34a',
            borderDownColor: '#dc2626',
            wickUpColor: '#16a34a',
            wickDownColor: '#dc2626',
        });

        candleSeries.setData(histData);

        // Volume as histogram
        const volumeSeries = chart.addHistogramSeries({
            priceFormat: { type: 'volume' },
            priceScaleId: 'vol',
        });
        chart.priceScale('vol').applyOptions({
            scaleMargins: { top: 0.85, bottom: 0 },
        });
        volumeSeries.setData(
            histData.map(d => ({
                time: d.time,
                value: d.volume,
                color: d.close >= d.open ? 'rgba(22,163,74,.15)' : 'rgba(220,38,38,.15)',
            }))
        );

        chart.timeScale().fitContent();
        chartInstance.current = chart;

        const resizeObserver = new ResizeObserver(() => {
            if (chartRef.current) {
                chart.applyOptions({ width: chartRef.current.clientWidth });
            }
        });
        resizeObserver.observe(chartRef.current);

        return () => {
            resizeObserver.disconnect();
            chart.remove();
            chartInstance.current = null;
        };
    }, [histData]);

    const handleSearch = (e) => {
        e.preventDefault();
        if (input.trim()) {
            setTicker(input.trim().toUpperCase());
            setInput('');
        }
    };

    const fmt = (v, prefix = '', suffix = '') => {
        if (v === null || v === undefined || v === 'N/A') return '—';
        return `${prefix}${typeof v === 'number' ? v.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : v}${suffix}`;
    };

    const metrics = fund ? [
        { label: 'Price', value: fmt(fund.price, '₹') },
        { label: 'P/E', value: fmt(fund.pe) },
        { label: 'ROE', value: fmt(fund.roe, '', '%') },
        { label: 'Debt/Equity', value: fmt(fund.debtEquity) },
        { label: 'Book Value', value: fmt(fund.bookValue, '₹') },
        { label: 'Market Cap', value: fund.marketCapCr || '—' },
        { label: 'EPS', value: fmt(fund.eps, '₹') },
        { label: 'Div. Yield', value: fmt(fund.dividendYield, '', '%') },
        { label: '52w High', value: fmt(fund.high52, '₹') },
        { label: '52w Low', value: fmt(fund.low52, '₹') },
        { label: 'Beta', value: fmt(fund.beta) },
        { label: 'P/B', value: fmt(fund.pb) },
    ] : [];

    return (
        <div>
            <div className="page-header">
                <h2>Stock Analysis</h2>
                <p>Deep dive into any NSE stock — fundamentals, price chart, key metrics</p>
            </div>

            {/* ── Search ─────────────────────────────── */}
            <div className="flex gap-12 items-center mb-24" style={{ flexWrap: 'wrap' }}>
                <form onSubmit={handleSearch} className="flex gap-8 items-center" style={{ flex: 1, minWidth: 240 }}>
                    <input
                        className="input"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        placeholder="Type ticker… HDFCBANK, RELIANCE, TCS"
                        style={{ maxWidth: 320 }}
                    />
                    <button type="submit" className="btn btn-primary">Go</button>
                </form>
                <select
                    className="select"
                    value={ticker}
                    onChange={e => setTicker(e.target.value)}
                    style={{ maxWidth: 200 }}
                >
                    {NIFTY_50.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <div className="flex gap-8">
                    {CHART_PERIODS.map(p => (
                        <button
                            key={p}
                            className={`btn ${period === p ? 'btn-primary' : ''}`}
                            onClick={() => setPeriod(p)}
                            style={{ padding: '6px 12px', fontSize: '.8rem' }}
                        >
                            {p.toUpperCase()}
                        </button>
                    ))}
                </div>
            </div>

            {error && <div className="error-box mb-24">{error}</div>}

            {loading && (
                <div className="loading">
                    <div className="spinner" />
                    Loading {ticker}…
                </div>
            )}

            {!loading && fund && (
                <>
                    {/* ── Company name ─────────────────────── */}
                    <div className="flex items-center gap-12 mb-24">
                        <h3 style={{ fontWeight: 700, fontSize: '1.15rem' }}>
                            {fund.name}
                        </h3>
                        <span className="mono text-2" style={{ fontSize: '.85rem' }}>{ticker}.NS</span>
                        <a
                            href={`https://www.screener.in/company/${ticker}/consolidated/`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn"
                            style={{ marginLeft: 'auto', padding: '5px 14px', fontSize: '.78rem' }}
                        >
                            Screener.in ↗
                        </a>
                    </div>

                    {/* ── Fundamental cards ─────────────────── */}
                    <div className="card-grid mb-24">
                        {metrics.map(m => (
                            <div key={m.label} className="metric-card">
                                <div className="metric-label">{m.label}</div>
                                <div className="metric-value">{m.value}</div>
                            </div>
                        ))}
                    </div>

                    {/* ── Price chart ──────────────────────── */}
                    <div className="chart-container">
                        <div ref={chartRef} style={{ width: '100%', height: 420 }} />
                    </div>
                </>
            )}
        </div>
    );
}
