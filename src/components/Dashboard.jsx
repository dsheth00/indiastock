import { useState, useEffect } from 'react';
import { DEFAULT_WATCHLISTS, fetchQuote } from '../utils/api';
import Portfolio from './Portfolio';

export default function Dashboard() {
    const [activeSubTab, setActiveSubTab] = useState('portfolio');
    const [quotes, setQuotes] = useState({});
    const [quotesLoading, setQuotesLoading] = useState(false);
    const [quotesLoaded, setQuotesLoaded] = useState(false);

    const loadWatchlistQuotes = async () => {
        setQuotesLoading(true);
        const allSyms = new Set();
        Object.values(DEFAULT_WATCHLISTS).forEach(list => list.forEach(t => allSyms.add(t)));
        const q = {};
        await Promise.all(
            Array.from(allSyms).map(async (t) => {
                try {
                    const data = await fetchQuote(t);
                    if (!data.error) q[t] = data;
                } catch { /* ignore */ }
            })
        );
        setQuotes(q);
        setQuotesLoading(false);
        setQuotesLoaded(true);
    };

    useEffect(() => {
        if (activeSubTab === 'watchlists' && !quotesLoaded) {
            loadWatchlistQuotes();
        }
    }, [activeSubTab, quotesLoaded]);

    const fmtPrice = (v) => typeof v === 'number' ? v.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—';

    return (
        <div>
            <div className="page-header">
                <h2>📊 Dashboard</h2>
                <p>Portfolio tracker &amp; live watchlists · NSE</p>
            </div>

            {/* Sub-tab switcher */}
            <div className="flex gap-8 mb-24" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
                {[
                    { id: 'portfolio', label: '💼 My Portfolio' },
                    { id: 'watchlists', label: '📋 Watchlists' },
                ].map(t => (
                    <button
                        key={t.id}
                        onClick={() => setActiveSubTab(t.id)}
                        style={{
                            padding: '8px 18px',
                            border: 'none',
                            borderBottom: activeSubTab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
                            background: 'transparent',
                            cursor: 'pointer',
                            fontWeight: activeSubTab === t.id ? 700 : 500,
                            color: activeSubTab === t.id ? 'var(--accent)' : 'var(--text-2)',
                            fontSize: '.88rem',
                            transition: 'all 150ms',
                            fontFamily: 'var(--font)',
                            marginBottom: -1,
                        }}
                    >{t.label}</button>
                ))}
            </div>

            {activeSubTab === 'portfolio' && <Portfolio />}

            {activeSubTab === 'watchlists' && (
                <div>
                    <div className="flex gap-12 items-center mb-24">
                        <button className="btn btn-primary" onClick={loadWatchlistQuotes} disabled={quotesLoading}>
                            {quotesLoading ? '⏳ Loading…' : '🔄 Refresh All Quotes'}
                        </button>
                        {quotesLoaded && (
                            <span style={{ fontSize: '.82rem', color: 'var(--text-3)' }}>
                                {Object.keys(quotes).length} stocks fetched
                            </span>
                        )}
                    </div>

                    {quotesLoading && (
                        <div className="loading">
                            <div className="spinner" /> Loading live quotes…
                        </div>
                    )}

                    {!quotesLoading && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                            {Object.entries(DEFAULT_WATCHLISTS).map(([name, tickers]) => (
                                <div key={name} className="card">
                                    <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 14 }}>{name}</div>
                                    <div className="chip-grid">
                                        {tickers.map(t => {
                                            const q = quotes[t];
                                            const chg = q?.changePct ?? null;
                                            const color = chg === null ? 'var(--text-3)' : chg >= 0 ? 'var(--green)' : 'var(--red)';
                                            return (
                                                <div key={t} className="chip">
                                                    <span className="chip-sym">{t}</span>
                                                    <span className="chip-price">
                                                        {q?.price ? `₹${fmtPrice(q.price)}` : '—'}
                                                    </span>
                                                    {chg !== null && (
                                                        <span style={{ color, fontSize: '.72rem', fontWeight: 700 }}>
                                                            {chg >= 0 ? '▲' : '▼'}{Math.abs(chg).toFixed(1)}%
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
