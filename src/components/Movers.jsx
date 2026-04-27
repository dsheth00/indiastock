import { useState, useEffect, useCallback } from 'react';
import { fetchMovers } from '../utils/api';

const TOP_N = 20;

// ── Market helpers ────────────────────────────────────────────────────────────
function getMarketStatus() {
    const istString = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
    const ist = new Date(istString);
    const day = ist.getDay();
    const t   = ist.getHours() * 100 + ist.getMinutes();
    if (day === 0 || day === 6) return { open: false, label: '🔴 Weekend — Market Closed' };
    if (t < 915)                return { open: false, label: '🟡 Pre-Market' };
    if (t >= 1530)              return { open: false, label: '🔴 Market Closed' };
    return { open: true, label: '🟢 Market Open' };
}

function getISTDate()   { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); }
function getISTTime()   { return new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false, hour: '2-digit', minute: '2-digit' }) + ' IST'; }

// ── Cache helpers (per-day, per-universe) ─────────────────────────────────────
function readCache(universe) {
    try {
        const raw = localStorage.getItem(`indstk_movers_${universe}`);
        if (!raw) return null;
        const { data, date, time } = JSON.parse(raw);
        if (date !== getISTDate()) return null; // stale — new IST day
        return { data, time };
    } catch { return null; }
}

function writeCache(universe, data) {
    const time = getISTTime();
    try {
        localStorage.setItem(`indstk_movers_${universe}`, JSON.stringify({ data, date: getISTDate(), time }));
    } catch { /* storage full */ }
    return time;
}

export default function Movers() {
    const [universe, setUniverse] = useState('nifty');

    // Init from cache immediately — no flicker
    const initCache = readCache('nifty');
    const [data,      setData]      = useState(initCache?.data  || null);
    const [fetchedAt, setFetchedAt] = useState(initCache?.time  || null);
    const [loading,   setLoading]   = useState(false);
    const [bgLoading, setBgLoading] = useState(false); // silent background refresh indicator
    const [error,     setError]     = useState('');
    const [sortKey,   setSortKey]   = useState('changePct');
    const [sortAsc,   setSortAsc]   = useState(false);
    const [marketStatus, setMarketStatus] = useState(getMarketStatus());

    // Keep market status clock ticking
    useEffect(() => {
        const t = setInterval(() => setMarketStatus(getMarketStatus()), 60_000);
        return () => clearInterval(t);
    }, []);

    // Fetch function — silent=true means don't block UI
    const load = useCallback(async (silent = false) => {
        if (silent) setBgLoading(true); else setLoading(true);
        setError('');
        try {
            const rows = await fetchMovers(universe);
            if (!Array.isArray(rows) || rows[0]?.error) throw new Error(rows[0]?.error || 'Bad response');
            const time = writeCache(universe, rows);
            setData(rows);
            setFetchedAt(time);
        } catch (e) {
            if (!silent) setError(e.message || 'Failed to load movers');
        } finally {
            if (silent) setBgLoading(false); else setLoading(false);
        }
    }, [universe]);

    // On mount / universe change: show cache instantly, then prefetch if no cache for today
    useEffect(() => {
        const cached = readCache(universe);
        if (cached) {
            setData(cached.data);
            setFetchedAt(cached.time);
            // If market is open, do a silent background refresh so data stays fresh
            if (getMarketStatus().open) load(true);
        } else {
            setData(null);
            setFetchedAt(null);
            // Auto-fetch — no cache at all for today
            load(false);
        }
    }, [universe]); // eslint-disable-line react-hooks/exhaustive-deps

    // Sorting
    const handleSort = (key) => {
        if (sortKey === key) setSortAsc(a => !a);
        else { setSortKey(key); setSortAsc(false); }
    };

    const allByPct = data
        ? [...data].sort((a, b) => sortAsc
            ? (a[sortKey] ?? 0) - (b[sortKey] ?? 0)
            : (b[sortKey] ?? 0) - (a[sortKey] ?? 0))
        : [];

    // Top 20 winners (highest +%) and top 20 losers (worst −%)
    const byPctDesc = data ? [...data].sort((a, b) => b.changePct - a.changePct) : [];
    const winners   = byPctDesc.filter(r => r.changePct > 0).slice(0, TOP_N);
    const losers    = byPctDesc.filter(r => r.changePct < 0).reverse().slice(0, TOP_N);

    const fmt = (v) => typeof v === 'number' ? v.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—';

    const SortTh = ({ label, col }) => (
        <th style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }} onClick={() => handleSort(col)}>
            {label} {sortKey === col ? (sortAsc ? '↑' : '↓') : <span style={{ opacity: 0.25 }}>↕</span>}
        </th>
    );

    const MoverTable = ({ rows, limit }) => {
        const display = limit ? rows.slice(0, limit) : rows;
        return (
            <div className="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <SortTh label="Ticker"    col="ticker" />
                            <th>Company</th>
                            <SortTh label="Price (₹)"  col="price" />
                            <SortTh label="Chg (₹)"   col="change" />
                            <SortTh label="Chg %"      col="changePct" />
                            <SortTh label="Volume"     col="volume" />
                        </tr>
                    </thead>
                    <tbody>
                        {display.map((r, i) => (
                            <tr key={r.ticker}>
                                <td className="text-3" style={{ fontSize: '.72rem', width: 28 }}>{i + 1}</td>
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
    };

    return (
        <div>
            {/* ── Header ── */}
            <div className="page-header" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    🏆 Today's Winners &amp; Losers
                    <span style={{
                        background: marketStatus.open ? 'rgba(22,163,74,.1)' : 'rgba(220,38,38,.08)',
                        color: marketStatus.open ? 'var(--green)' : 'var(--red)',
                        padding: '3px 10px', borderRadius: 20, fontSize: '.72rem', fontWeight: 600,
                        border: `1px solid ${marketStatus.open ? 'rgba(22,163,74,.3)' : 'rgba(220,38,38,.2)'}`
                    }}>{marketStatus.label}</span>
                    {bgLoading && (
                        <span style={{ fontSize: '.72rem', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5, margin: 0 }} />
                            refreshing…
                        </span>
                    )}
                </h2>
                <p>Top {TOP_N} winners &amp; losers by daily % · cached per market day · auto-refreshed on open</p>
            </div>

            {/* ── Controls ── */}
            <div className="flex gap-12 items-end mb-24" style={{ flexWrap: 'wrap' }}>
                <div className="input-group" style={{ minWidth: 200 }}>
                    <label>Universe</label>
                    <select className="select" value={universe} onChange={e => setUniverse(e.target.value)}>
                        <option value="nifty">Nifty 50 (fast)</option>
                        <option value="all">All NSE ~100 stocks</option>
                    </select>
                </div>
                <button className="btn btn-primary" onClick={() => load(false)} disabled={loading || bgLoading}>
                    {loading ? '⏳ Fetching…' : '📡 Refresh from Market'}
                </button>
                {fetchedAt && (
                    <div style={{
                        marginLeft: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border)',
                        padding: '7px 14px', borderRadius: 8, fontSize: '.8rem', color: 'var(--text-2)',
                        display: 'flex', alignItems: 'center', gap: 6
                    }}>
                        📡 <strong>Data</strong> as of {fetchedAt}
                    </div>
                )}
            </div>

            {error && <div className="error-box mb-24">{error}</div>}

            {loading && !data && (
                <div className="loading"><div className="spinner" /> Fetching {universe === 'nifty' ? 'Nifty 50' : 'NSE'} movers…</div>
            )}

            {data && (
                <>
                    {/* ── Top 20 Winners / Losers side-by-side ── */}
                    <div className="grid-2 mb-24">
                        <div>
                            <div className="banner-win">▲ Top {winners.length} Winners</div>
                            {winners.length > 0
                                ? <MoverTable rows={winners} />
                                : <div className="empty">No gainers today</div>}
                        </div>
                        <div>
                            <div className="banner-lose">▼ Top {losers.length} Losers</div>
                            {losers.length > 0
                                ? <MoverTable rows={losers} />
                                : <div className="empty">No decliners today</div>}
                        </div>
                    </div>

                    {/* ── Full sortable ranking ── */}
                    <h3 style={{ fontWeight: 700, marginBottom: 12 }}>📋 Full Ranking — click any column to sort</h3>
                    <MoverTable rows={allByPct} />
                </>
            )}
        </div>
    );
}
