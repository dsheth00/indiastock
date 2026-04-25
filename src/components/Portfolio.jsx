import { useState, useCallback, useRef } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine, Cell, Legend,
} from 'recharts';

const PORTFOLIO_CSV_KEY = 'indstk_port_csv';
const PORTFOLIO_DATA_KEY = 'indstk_port_data';

async function parsePortfolio(csvText) {
    const r = await fetch('/api/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: csvText }),
    });
    return r.json();
}

const fmt = (v) =>
    typeof v === 'number'
        ? v.toLocaleString('en-IN', { maximumFractionDigits: 2 })
        : '—';
const fmtRupee = (v) => (typeof v === 'number' ? `₹${fmt(v)}` : '—');
const pnlColor = (v) => (v >= 0 ? 'var(--green)' : 'var(--red)');

const SummaryCard = ({ label, value, sub, color }) => (
    <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '16px 20px', flex: 1, minWidth: 160
    }}>
        <div style={{ fontSize: '.72rem', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
            {label}
        </div>
        <div style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--mono)', color: color || 'var(--text)' }}>
            {value}
        </div>
        {sub && <div style={{ fontSize: '.75rem', color: 'var(--text-3)', marginTop: 2 }}>{sub}</div>}
    </div>
);

const CustomTooltip = ({ active, payload, label }) => {
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

export default function Portfolio() {
    const [positions, setPositions] = useState(() => {
        try { return JSON.parse(localStorage.getItem(PORTFOLIO_DATA_KEY))?.positions || []; } catch { return []; }
    });
    const [summary, setSummary] = useState(() => {
        try { return JSON.parse(localStorage.getItem(PORTFOLIO_DATA_KEY))?.summary || null; } catch { return null; }
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [chartType, setChartType] = useState('pnl'); // 'pnl' | 'value'
    const fileRef = useRef(null);

    const process = useCallback(async (csvText) => {
        setLoading(true);
        setError('');
        try {
            const result = await parsePortfolio(csvText);
            if (result.error) throw new Error(result.error);
            setPositions(result.positions);
            setSummary(result.summary);
            localStorage.setItem(PORTFOLIO_CSV_KEY, csvText);
            localStorage.setItem(PORTFOLIO_DATA_KEY, JSON.stringify(result));
        } catch (e) {
            setError(e.message || 'Failed to parse portfolio');
        } finally {
            setLoading(false);
        }
    }, []);

    const handleFile = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => process(ev.target.result);
        reader.readAsText(file);
    };

    // Auto-load from localStorage on mount if exists
    const handleReload = () => {
        const cached = localStorage.getItem(PORTFOLIO_CSV_KEY);
        if (cached) process(cached);
        else fileRef.current?.click();
    };

    // Chart data
    const chartData = positions
        .filter(p => p.invested > 0 || Math.abs(p.unrealized) > 0 || Math.abs(p.realized) > 0)
        .map(p => ({
            name: p.stock,
            Invested: p.invested,
            Unrealized: p.unrealized,
            Realized: p.realized,
            Current: p.current,
        }));

    const hasData = positions.length > 0 && summary;

    return (
        <div>
            <div className="page-header">
                <h2>💼 My Portfolio</h2>
                <p>Upload your broker's trade export to see P&amp;L, realized gains, and allocation charts</p>
            </div>

            {/* Upload controls */}
            <div className="flex gap-12 items-center mb-24" style={{ flexWrap: 'wrap' }}>
                <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,.txt"
                    style={{ display: 'none' }}
                    onChange={handleFile}
                />
                <button className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={loading}>
                    📂 Upload port.csv
                </button>
                {localStorage.getItem(PORTFOLIO_CSV_KEY) && (
                    <button className="btn" onClick={handleReload} disabled={loading}>
                        🔄 Reload Last File
                    </button>
                )}
                {hasData && (
                    <span style={{ fontSize: '.82rem', color: 'var(--text-3)' }}>
                        {positions.length} positions · last parsed from file
                    </span>
                )}
                {loading && <div className="spinner" />}
            </div>

            {error && <div className="error-box mb-24">{error}</div>}

            {!hasData && !loading && (
                <div className="empty" style={{ border: '1px dashed var(--border)', borderRadius: 8, padding: 48 }}>
                    <div style={{ fontSize: '2rem', marginBottom: 12 }}>📊</div>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>No portfolio data loaded</div>
                    <div style={{ color: 'var(--text-3)', fontSize: '.88rem' }}>
                        Upload your broker's trade history CSV to see your positions, P&amp;L breakdown, and charts
                    </div>
                </div>
            )}

            {hasData && (
                <>
                    {/* ── Summary metrics ── */}
                    <div className="flex gap-12 mb-24" style={{ flexWrap: 'wrap' }}>
                        <SummaryCard label="Current Invested" value={fmtRupee(summary.totalInvested)} />
                        <SummaryCard label="Current Value" value={fmtRupee(summary.totalCurrent)}
                            sub={summary.totalCurrent > summary.totalInvested ? '▲ Gaining' : '▼ Below cost'} />
                        <SummaryCard label="Unrealized P&L" value={fmtRupee(summary.totalUnrealized)}
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

                    {/* ── Chart controls ── */}
                    <div className="flex gap-8 items-center mb-12">
                        <span style={{ fontSize: '.8rem', fontWeight: 600, color: 'var(--text-2)' }}>Chart view:</span>
                        {[
                            { id: 'pnl', label: 'P&L Breakdown' },
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

                    {/* ── Main chart ── */}
                    <div className="chart-container mb-24" style={{ padding: '20px 8px 12px' }}>
                        <ResponsiveContainer width="100%" height={320}>
                            {chartType === 'pnl' ? (
                                <BarChart data={chartData} margin={{ top: 0, right: 8, bottom: 40, left: 8 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-3)' }}
                                        angle={-35} textAnchor="end" interval={0} />
                                    <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }}
                                        tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend wrapperStyle={{ paddingTop: 8, fontSize: '.8rem' }} />
                                    <ReferenceLine y={0} stroke="var(--text-3)" />
                                    <Bar dataKey="Unrealized" name="Unrealized P&L" radius={[3,3,0,0]}>
                                        {chartData.map(d => (
                                            <Cell key={d.name} fill={d.Unrealized >= 0 ? 'var(--green)' : 'var(--red)'} />
                                        ))}
                                    </Bar>
                                    <Bar dataKey="Realized" name="Realized P&L" radius={[3,3,0,0]} opacity={0.65}>
                                        {chartData.map(d => (
                                            <Cell key={d.name} fill={d.Realized >= 0 ? '#3ddbd9' : '#f97316'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            ) : (
                                <BarChart data={chartData} margin={{ top: 0, right: 8, bottom: 40, left: 8 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-3)' }}
                                        angle={-35} textAnchor="end" interval={0} />
                                    <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }}
                                        tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend wrapperStyle={{ paddingTop: 8, fontSize: '.8rem' }} />
                                    <Bar dataKey="Invested" name="Capital Invested" fill="var(--accent)" radius={[3,3,0,0]} />
                                    <Bar dataKey="Current" name="Current Value" radius={[3,3,0,0]}>
                                        {chartData.map(d => (
                                            <Cell key={d.name} fill={d.Current >= d.Invested ? 'var(--green)' : 'var(--red)'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            )}
                        </ResponsiveContainer>
                    </div>

                    {/* ── Position table ── */}
                    <h3 style={{ fontWeight: 700, marginBottom: 12 }}>📋 All Positions</h3>
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Stock</th>
                                    <th>Qty</th>
                                    <th>Avg Price</th>
                                    <th>LTP</th>
                                    <th>Invested</th>
                                    <th>Current Value</th>
                                    <th>Unrealized</th>
                                    <th>Realized (Historic)</th>
                                    <th>Total Net P&L</th>
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
                                            {p.realized !== 0 ? (p.realized >= 0 ? '+' : '') + fmtRupee(p.realized) : '—'}
                                        </td>
                                        <td style={{ fontWeight: 700 }}
                                            className={`mono ${p.totalPnl >= 0 ? 'text-green' : 'text-red'}`}>
                                            {p.totalPnl >= 0 ? '+' : ''}{fmtRupee(p.totalPnl)}
                                            <span style={{ fontSize: '.72rem', marginLeft: 4, opacity: 0.75 }}>
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
