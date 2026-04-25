import { useState, useEffect, useCallback } from 'react';
import { fetchMovers } from '../utils/api';

function getMarketStatus() {
    const now = new Date();
    const istString = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
    const istTime = new Date(istString);
    const day = istTime.getDay();
    const hours = istTime.getHours();
    const minutes = istTime.getMinutes();
    const timeNum = hours * 100 + minutes;
    if (day === 0 || day === 6) return { open: false, label: "🔴 Weekend — Market Closed" };
    if (timeNum < 915) return { open: false, label: "🟡 Pre-Market" };
    if (timeNum >= 1530) return { open: false, label: "🔴 Market Closed" };
    return { open: true, label: "🟢 Market Open" };
}

function getISTTimeString() {
    return new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false, hour: '2-digit', minute: '2-digit' }) + ' IST';
}

// Daily movers cache: persist per calendar date so data stays fresh each market day
function getDailyCache(universe) {
    try {
        const key = `indstk_movers_${universe}`;
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const { data, date, time } = JSON.parse(raw);
        const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // YYYY-MM-DD in IST
        if (date !== today) return null; // stale — new day in IST
        return { data, time };
    } catch { return null; }
}

function setDailyCache(universe, data) {
    try {
        const key = `indstk_movers_${universe}`;
        const date = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
        const time = getISTTimeString();
        localStorage.setItem(key, JSON.stringify({ data, date, time }));
        return time;
    } catch { return getISTTimeString(); }
}

export default function Movers() {
    const [universe, setUniverse] = useState('nifty');
    const cached = getDailyCache('nifty');
    const [data, setData] = useState(cached?.data || null);
    const [fetchedAt, setFetchedAt] = useState(cached?.time || null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [sortKey, setSortKey] = useState('changePct');
    const [sortAsc, setSortAsc] = useState(false);
    const [marketStatus, setMarketStatus] = useState(getMarketStatus());

    useEffect(() => {
        const timer = setInterval(() => setMarketStatus(getMarketStatus()), 60000);
        return () => clearInterval(timer);
    }, []);

    // When universe changes, load from cache or prompt
    useEffect(() => {
        const c = getDailyCache(universe);
        if (c) {
            setData(c.data);
            setFetchedAt(c.time);
        } else {
            setData(null);
            setFetchedAt(null);
        }
    }, [universe]);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const rows = await fetchMovers(universe);
            if (rows.length > 0 && rows[0]?.error) throw new Error(rows[0].error);
            const timeStr = setDailyCache(universe, rows);
            setData(rows);
            setFetchedAt(timeStr);
        } catch (e) {
            setError(e.message || 'Failed to load movers');
        } finally {
            setLoading(false);
        }
    }, [universe]);

    const handleSort = (key) => {
        if (sortKey === key) setSortAsc(!sortAsc);
        else { setSortKey(key); setSortAsc(false); }
    };

    const sorted = data
        ? [...data].sort((a, b) => {
            const av = a[sortKey] ?? 0, bv = b[sortKey] ?? 0;
            return sortAsc ? av - bv : bv - av;
        }) : [];

    const winners = sorted.filter(r => r.changePct > 0);
    const losers  = sorted.filter(r => r.changePct < 0).reverse();
    const fmt = (v) => typeof v === 'number' ? v.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—';

    const SortTh = ({ label, col }) => (
        <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort(col)}>
            {label} {sortKey === col ? (sortAsc ? '↑' : '↓') : <span style={{ opacity: 0.3 }}>↕</span>}
        </th>
    );

    const MoverTable = ({ rows }) => (
        <div className="table-wrap">
            <table>
                <thead>
                    <tr>
                        <SortTh label="Ticker"    col="ticker" />
                        <th>Company</th>
                        <SortTh label="Price (₹)"  col="price" />
                        <SortTh label="Change (₹)" col="change" />
                        <SortTh label="Change (%)" col="changePct" />
                        <SortTh label="Volume"     col="volume" />
                    </tr>
                </thead>
                <tbody>
                    {rows.map(r => (
                        <tr key={r.ticker}>
                            <td className="mono" style={{ fontWeight: 700 }}>{r.ticker}</td>
                            <td className="text-2 text-sm">{r.company}</td>
                            <td className="mono">₹{fmt(r.price)}</td>
                            <td className={`mono ${r.change >= 0 ? 'text-green' : 'text-red'}`}>
                                {r.change >= 0 ? '+' : ''}{fmt(r.change)}
                            </td>
                            <td>
                                <span className={`badge ${r.changePct >= 0 ? 'badge-green' : 'badge-red'}`}>
                                    {r.changePct >= 0 ? '▲' : '▼'} {fmt(Math.abs(r.changePct))}%
                                </span>
                            </td>
                            <td className="mono text-2">{r.volume?.toLocaleString('en-IN') || '—'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );

    return (
        <div>
            {/* Header */}
            <div className="page-header" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    🏆 Today's Winners &amp; Losers
                    <span style={{
                        background: marketStatus.open ? 'rgba(22,163,74,.1)' : 'rgba(220,38,38,.1)',
                        color: marketStatus.open ? 'var(--green)' : 'var(--red)',
                        padding: '3px 10px', borderRadius: 20, fontSize: '.72rem', fontWeight: 600,
                        border: `1px solid ${marketStatus.open ? 'rgba(22,163,74,.3)' : 'rgba(220,38,38,.2)'}`
                    }}>{marketStatus.label}</span>
                </h2>
                <p>Ranked by daily % change · click any column to sort · cached daily per market session</p>
            </div>

            {/* Controls */}
            <div className="flex gap-12 items-end mb-24" style={{ flexWrap: 'wrap' }}>
                <div className="input-group" style={{ minWidth: 200 }}>
                    <label>Universe</label>
                    <select className="select" value={universe} onChange={e => setUniverse(e.target.value)}>
                        <option value="nifty">Nifty 50 (fast)</option>
                        <option value="all">All NSE ~100 stocks (slower)</option>
                    </select>
                </div>
                <button className="btn btn-primary" onClick={load} disabled={loading}>
                    {loading ? '⏳ Fetching…' : '📡 Refresh from Market'}
                </button>
                <div className="input-group" style={{ minWidth: 140 }}>
                    <label>Browse history</label>
                    <select className="select" disabled><option>Latest</option></select>
                </div>
                {fetchedAt && (
                    <div style={{
                        marginLeft: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border)',
                        padding: '8px 14px', borderRadius: 8, fontSize: '.82rem', color: 'var(--text-2)',
                        display: 'flex', alignItems: 'center', gap: 6
                    }}>
                        📡 <strong>Live data</strong> fetched at {fetchedAt}
                    </div>
                )}
            </div>

            {error && <div className="error-box mb-24">{error}</div>}
            {loading && <div className="loading"><div className="spinner" /> Fetching {universe === 'nifty' ? 'Nifty 50' : 'NSE'} movers…</div>}

            {!loading && !data && !error && (
                <div className="empty">
                    {getDailyCache(universe)
                        ? null
                        : <p>Click <strong>Refresh from Market</strong> to load today's leaderboard.</p>}
                </div>
            )}

            {!loading && data && (
                <>
                    {/* Winners / Losers split */}
                    <div className="grid-2 mb-24">
                        <div>
                            <div className="banner-win">▲ Winners ({winners.length})</div>
                            {winners.length > 0 ? <MoverTable rows={winners} /> : <div className="empty">No gainers today</div>}
                        </div>
                        <div>
                            <div className="banner-lose">▼ Losers ({losers.length})</div>
                            {losers.length > 0 ? <MoverTable rows={losers} /> : <div className="empty">No losers today</div>}
                        </div>
                    </div>

                    {/* Full ranking */}
                    <h3 style={{ fontWeight: 700, marginBottom: 12 }}>📋 Full Ranking (sort by any column)</h3>
                    <MoverTable rows={sorted} />
                </>
            )}
        </div>
    );
}
