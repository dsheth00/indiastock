import { useState, useEffect, useCallback, useRef } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine, Cell, Legend,
} from 'recharts';
import { getCloudStore, setCloudStore } from '../utils/api';

const CSV_KEY  = 'indstk_port_csv';  // raw CSV text
const DATA_KEY = 'indstk_port_data'; // last parsed result (stale prices)

const fmt      = (v) => typeof v === 'number' ? v.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—';
const fmtRupee = (v) => typeof v === 'number' ? `₹${fmt(v)}` : '—';
const pnlColor = (v) => v >= 0 ? 'var(--green)' : 'var(--red)';

// ── parse via API ──────────────────────────────────────────────────────────────
async function parseCsv(csvText) {
    const r = await fetch('/api/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: csvText }),
    });
    if (!r.ok) throw new Error(`Server error ${r.status}`);
    const data = await r.json();
    if (data.error) throw new Error(data.error);
    return data;
}

// ── Sub-components ─────────────────────────────────────────────────────────────
const SummaryCard = ({ label, value, sub, color }) => (
    <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '16px 20px', flex: 1, minWidth: 155,
    }}>
        <div style={{ fontSize: '.7rem', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>
            {label}
        </div>
        <div style={{ fontSize: '1.2rem', fontWeight: 700, fontFamily: 'var(--mono)', color: color || 'var(--text)', letterSpacing: '-.01em' }}>
            {value}
        </div>
        {sub && <div style={{ fontSize: '.73rem', color: 'var(--text-3)', marginTop: 3 }}>{sub}</div>}
    </div>
);

const ChartTip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: '.82rem' }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
            {payload.map(p => (
                <div key={p.dataKey} style={{ color: p.fill, display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                    <span>{p.name}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>₹{fmt(p.value)}</span>
                </div>
            ))}
        </div>
    );
};

// ── Main Component ─────────────────────────────────────────────────────────────
export default function Portfolio() {
    const [positions, setPositions] = useState([]);
    const [summary, setSummary] = useState(null);
    const [loading,    setLoading]    = useState(false);
    const [refreshing, setRefreshing] = useState(false); // silent bg refresh indicator
    const [cloudLoading, setCloudLoading] = useState(true);
    const [error,      setError]      = useState('');
    const [lastUpdate, setLastUpdate] = useState(null);
    const [csvTextData, setCsvTextData] = useState('');
    const [chartType, setChartType] = useState('pnl');
    const fileRef = useRef(null);

    useEffect(() => {
        let mounted = true;
        async function loadCloud() {
            setCloudLoading(true);
            const [csv, data] = await Promise.all([
                getCloudStore(CSV_KEY),
                getCloudStore(DATA_KEY)
            ]);
            if (mounted) {
                if (csv) setCsvTextData(csv);
                if (data) {
                    setPositions(data.positions || []);
                    setSummary(data.summary || null);
                    setLastUpdate(data.updatedAt || null);
                }
                setCloudLoading(false);
            }
        }
        loadCloud();
        return () => { mounted = false; };
    }, []);

    // Core: parse CSV via API, persist everything
    const process = useCallback(async (csvText, silent = false) => {
        if (silent) setRefreshing(true); else setLoading(true);
        setError('');
        try {
            const result = await parseCsv(csvText);
            const updatedAt = new Date().toLocaleTimeString('en-IN', {
                timeZone: 'Asia/Kolkata', hour12: false, hour: '2-digit', minute: '2-digit'
            }) + ' IST';
            result.updatedAt = updatedAt;
            setPositions(result.positions || []);
            setSummary(result.summary || null);
            setLastUpdate(updatedAt);
            setCsvTextData(csvText);
            // Persist both CSV and parsed data
            setCloudStore(CSV_KEY, csvText);
            setCloudStore(DATA_KEY, result);
        } catch (e) {
            if (!silent) setError(e.message || 'Failed to parse portfolio');
        } finally {
            if (silent) setRefreshing(false); else setLoading(false);
        }
    }, []);

    // On mount: we rely entirely on the initial state from DATA_KEY.
    // The user explicitly requested to persist the tickers until overridden by another batch.
    // We will not auto-refresh on mount to avoid unnecessary API calls and delays.

    // File upload → override persisted CSV
    const handleFileRead = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = ''; // allow re-upload of same file
        const reader = new FileReader();
        reader.onload = (ev) => process(ev.target.result, false);
        reader.readAsText(file);
    };

    const hasData = positions.length > 0 && summary;

    // Chart data
    const chartData = positions
        .filter(p => p.invested > 0 || Math.abs(p.unrealized) > 0 || Math.abs(p.realized) > 0)
        .map(p => ({ name: p.stock, Invested: p.invested, Unrealized: p.unrealized, Realized: p.realized, Current: p.current }));

    return (
        <div>
            <div className="page-header">
                <h2>💼 My Portfolio</h2>
                <p>Auto-reloaded with live prices each visit · upload a new file to override</p>
            </div>

            {/* Controls row */}
            <div className="flex gap-12 items-center mb-24" style={{ flexWrap: 'wrap' }}>
                <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,.txt"
                    style={{ display: 'none' }}
                    onChange={handleFileRead}
                />
                <button className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={loading}>
                    📂 Upload port.csv
                </button>

                {csvTextData && (
                    <button className="btn" onClick={() => process(csvTextData, false)} disabled={loading || refreshing || cloudLoading}>
                        🔄 Force Refresh Prices
                    </button>
                )}

                {/* Status indicators */}
                <div className="flex gap-8 items-center" style={{ marginLeft: 'auto' }}>
                    {refreshing && (
                        <span style={{ fontSize: '.78rem', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5, margin: 0 }} />
                            Refreshing prices…
                        </span>
                    )}
                    {lastUpdate && !refreshing && (
                        <span style={{
                            fontSize: '.78rem', color: 'var(--text-3)', background: 'var(--bg-card)',
                            border: '1px solid var(--border)', padding: '5px 10px', borderRadius: 6
                        }}>
                            ✓ Updated {lastUpdate} · {positions.length} positions
                        </span>
                    )}
                </div>
            </div>

            {error && <div className="error-box mb-24">{error}</div>}

            {cloudLoading && (
                <div className="loading"><div className="spinner" /> Loading portfolio from cloud…</div>
            )}

            {loading && !cloudLoading && (
                <div className="loading"><div className="spinner" /> Parsing portfolio…</div>
            )}

            {!hasData && !loading && !cloudLoading && (
                <div className="empty" style={{ border: '1px dashed var(--border)', borderRadius: 8, padding: 56 }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📊</div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 6 }}>No portfolio data loaded</div>
                    <div style={{ color: 'var(--text-3)', fontSize: '.88rem', marginBottom: 20 }}>
                        Upload your broker's trade history CSV to see your positions, P&amp;L breakdown, and charts.
                        <br />Once uploaded, your data persists across sessions and prices refresh automatically.
                    </div>
                    <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>
                        📂 Upload port.csv
                    </button>
                </div>
            )}

            {hasData && !cloudLoading && (
                <>
                    {/* ── Summary cards ── */}
                    <div className="flex gap-12 mb-24" style={{ flexWrap: 'wrap' }}>
                        <SummaryCard label="Current Invested"    value={fmtRupee(summary.totalInvested)} />
                        <SummaryCard label="Current Value"       value={fmtRupee(summary.totalCurrent)}
                            sub={summary.totalCurrent > summary.totalInvested ? '▲ Gaining on cost' : '▼ Below cost'} />
                        <SummaryCard label="Unrealized P&L"      value={fmtRupee(summary.totalUnrealized)}
                            color={pnlColor(summary.totalUnrealized)} />
                        <SummaryCard label="Realized (Historic)" value={fmtRupee(summary.totalRealized)}
                            color={pnlColor(summary.totalRealized)} sub="Booked profits/losses" />
                        <SummaryCard
                            label="Total Net P&L"
                            value={fmtRupee(summary.totalPnl)}
                            sub={`${summary.totalPnlPct > 0 ? '+' : ''}${summary.totalPnlPct}% on invested`}
                            color={pnlColor(summary.totalPnl)}
                        />
                    </div>

                    {/* ── Chart toggle ── */}
                    <div className="flex gap-8 items-center mb-12">
                        <span style={{ fontSize: '.8rem', fontWeight: 600, color: 'var(--text-2)' }}>Chart:</span>
                        {[
                            { id: 'pnl',   label: 'P&L Breakdown' },
                            { id: 'value', label: 'Invested vs Current' },
                        ].map(c => (
                            <button
                                key={c.id}
                                className={`btn ${chartType === c.id ? 'btn-primary' : ''}`}
                                style={{ padding: '5px 14px', fontSize: '.8rem' }}
                                onClick={() => setChartType(c.id)}
                            >{c.label}</button>
                        ))}
                    </div>

                    {/* ── Chart ── */}
                    <div className="chart-container mb-24" style={{ padding: '20px 8px 12px' }}>
                        <ResponsiveContainer width="100%" height={300}>
                            {chartType === 'pnl' ? (
                                <BarChart data={chartData} margin={{ top: 0, right: 8, bottom: 44, left: 8 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-3)' }} angle={-35} textAnchor="end" interval={0} />
                                    <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                                    <Tooltip content={<ChartTip />} />
                                    <Legend wrapperStyle={{ paddingTop: 8, fontSize: '.78rem' }} />
                                    <ReferenceLine y={0} stroke="var(--text-3)" />
                                    <Bar dataKey="Unrealized" name="Unrealized P&L" radius={[3, 3, 0, 0]}>
                                        {chartData.map(d => <Cell key={d.name} fill={d.Unrealized >= 0 ? 'var(--green)' : 'var(--red)'} />)}
                                    </Bar>
                                    <Bar dataKey="Realized" name="Realized P&L" radius={[3, 3, 0, 0]} opacity={0.7}>
                                        {chartData.map(d => <Cell key={d.name} fill={d.Realized >= 0 ? '#3ddbd9' : '#f97316'} />)}
                                    </Bar>
                                </BarChart>
                            ) : (
                                <BarChart data={chartData} margin={{ top: 0, right: 8, bottom: 44, left: 8 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-3)' }} angle={-35} textAnchor="end" interval={0} />
                                    <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                                    <Tooltip content={<ChartTip />} />
                                    <Legend wrapperStyle={{ paddingTop: 8, fontSize: '.78rem' }} />
                                    <Bar dataKey="Invested" name="Capital Invested" fill="var(--accent)" radius={[3, 3, 0, 0]} />
                                    <Bar dataKey="Current"  name="Current Value"    radius={[3, 3, 0, 0]}>
                                        {chartData.map(d => <Cell key={d.name} fill={d.Current >= d.Invested ? 'var(--green)' : 'var(--red)'} />)}
                                    </Bar>
                                </BarChart>
                            )}
                        </ResponsiveContainer>
                    </div>

                    {/* ── Positions table ── */}
                    <h3 style={{ fontWeight: 700, marginBottom: 12 }}>📋 All Positions</h3>
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Stock</th><th>Qty</th><th>Avg Price</th><th>LTP</th>
                                    <th>Invested</th><th>Current</th>
                                    <th>Unrealized</th><th>Realized</th><th>Total P&L</th>
                                </tr>
                            </thead>
                            <tbody>
                                {positions.map(p => (
                                    <tr key={p.stock}>
                                        <td className="mono" style={{ fontWeight: 700 }}>{p.stock}</td>
                                        <td className="mono">{p.qty > 0 ? p.qty : <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                                        <td className="mono">{p.avgPrice > 0 ? fmtRupee(p.avgPrice) : '—'}</td>
                                        <td className="mono">{fmtRupee(p.ltp)}</td>
                                        <td className="mono">{fmtRupee(p.invested)}</td>
                                        <td className="mono">{fmtRupee(p.current)}</td>
                                        <td className={`mono ${p.unrealized >= 0 ? 'text-green' : 'text-red'}`}>
                                            {p.unrealized >= 0 ? '+' : ''}{fmtRupee(p.unrealized)}
                                        </td>
                                        <td className={`mono ${p.realized >= 0 ? 'text-green' : 'text-red'}`}
                                            style={{ opacity: Math.abs(p.realized) < 0.01 ? 0.3 : 1 }}>
                                            {Math.abs(p.realized) >= 0.01
                                                ? (p.realized >= 0 ? '+' : '') + fmtRupee(p.realized)
                                                : '—'}
                                        </td>
                                        <td className={`mono ${p.totalPnl >= 0 ? 'text-green' : 'text-red'}`}
                                            style={{ fontWeight: 700 }}>
                                            {p.totalPnl >= 0 ? '+' : ''}{fmtRupee(p.totalPnl)}
                                            <span style={{ fontSize: '.7rem', marginLeft: 4, opacity: 0.7 }}>
                                                ({p.pnlPct > 0 ? '+' : ''}{p.pnlPct}%)
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}
