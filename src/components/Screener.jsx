import { useState, useCallback } from 'react';
import { fetchScreener, SCREENER_PRESETS } from '../utils/api';

const fmt = (v) => typeof v === 'number' ? v.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : (v ?? '—');

export default function Screener() {
    const [preset, setPreset] = useState(SCREENER_PRESETS[0].id);
    const [universe, setUniverse] = useState('nifty');
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const currentPreset = SCREENER_PRESETS.find(p => p.id === preset) || SCREENER_PRESETS[0];

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const rows = await fetchScreener(preset, universe);
            if (rows[0]?.error) throw new Error(rows[0].error);
            setData(rows || []);
        } catch (e) {
            setError(e.message || 'Screener failed');
        } finally {
            setLoading(false);
        }
    }, [preset, universe]);

    return (
        <div>
            <div className="page-header">
                <h2>🎯 Stock Screener</h2>
                <p>13 pre-built strategies · inspired by Screener.in · Nifty 50 or broader NSE</p>
            </div>

            <div className="flex gap-12 mb-8" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div className="input-group" style={{ flex: 2, minWidth: 280 }}>
                    <label>Screener Preset</label>
                    <select className="select" value={preset} onChange={e => setPreset(e.target.value)}>
                        {SCREENER_PRESETS.map(p => (
                            <option key={p.id} value={p.id}>{p.id}</option>
                        ))}
                    </select>
                </div>
                <div className="input-group" style={{ flex: 1, minWidth: 180 }}>
                    <label>Universe</label>
                    <select className="select" value={universe} onChange={e => setUniverse(e.target.value)}>
                        <option value="nifty">Nifty 50 (fast ~5s)</option>
                        <option value="all">All NSE ~100 stocks</option>
                    </select>
                </div>
                <button className="btn btn-primary" onClick={load} disabled={loading}>
                    {loading ? '⏳ Running…' : '🚀 Run Screener'}
                </button>
            </div>

            {/* Description chip */}
            <div style={{
                background: 'var(--bg-active)', border: '1px solid var(--border-focus)',
                borderRadius: 6, padding: '8px 14px', marginBottom: 24,
                fontSize: '.82rem', color: 'var(--accent)', fontWeight: 500
            }}>
                📌 {currentPreset.desc}
            </div>

            {error && <div className="error-box mb-24">{error}</div>}

            {loading && (
                <div className="loading">
                    <div className="spinner" />
                    Running "{preset}" on {universe === 'nifty' ? 'Nifty 50' : 'All NSE'}…
                </div>
            )}

            {!loading && data && (
                <div>
                    <div className="flex items-center gap-12 mb-12">
                        <h3 style={{ fontWeight: 700 }}>
                            {data.length > 0
                                ? `✅ ${data.length} match${data.length > 1 ? 'es' : ''} found`
                                : '⚠️ No matches'}
                        </h3>
                        <span style={{ fontSize: '.78rem', color: 'var(--text-3)' }}>
                            Preset: {preset} · {universe === 'nifty' ? 'Nifty 50' : 'All NSE'}
                        </span>
                    </div>
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Ticker</th>
                                    <th>Company</th>
                                    <th>Price</th>
                                    <th>P/E</th>
                                    <th>ROE %</th>
                                    <th>D/E</th>
                                    <th>Market Cap</th>
                                    <th>Div Yield %</th>
                                    <th>Profit Margin %</th>
                                    <th>Rev Growth %</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.map((r, i) => (
                                    <tr key={r.Ticker}>
                                        <td className="text-3" style={{ fontSize: '.75rem' }}>{i + 1}</td>
                                        <td className="mono" style={{ fontWeight: 700 }}>{r.Ticker}</td>
                                        <td className="text-2 text-sm">{r.Name}</td>
                                        <td className="mono">₹{fmt(r['Current Price'])}</td>
                                        <td className="mono">{fmt(r['P/E'])}</td>
                                        <td className={`mono ${(r['ROE'] ?? 0) > 0 ? 'text-green' : ''}`}>{fmt(r['ROE'])}</td>
                                        <td className="mono">{fmt(r['Debt/Equity'])}</td>
                                        <td className="mono text-sm">{r['Market Cap (Cr)'] || '—'}</td>
                                        <td className="mono">{fmt(r['Dividend Yield'])}</td>
                                        <td className={`mono ${(r['Profit Margin'] ?? 0) > 0 ? 'text-green' : 'text-red'}`}>
                                            {fmt(r['Profit Margin'])}
                                        </td>
                                        <td className={`mono ${(r['Revenue Growth'] ?? 0) > 0 ? 'text-green' : 'text-red'}`}>
                                            {fmt(r['Revenue Growth'])}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {data.length === 0 && (
                            <div className="empty">No stocks matched this screen. Try a different preset or universe.</div>
                        )}
                    </div>
                </div>
            )}

            {!loading && !data && (
                <div className="empty" style={{ border: '1px dashed var(--border)', borderRadius: 8 }}>
                    <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>🎯</div>
                    Select a preset above and click <strong>Run Screener</strong>
                </div>
            )}
        </div>
    );
}
