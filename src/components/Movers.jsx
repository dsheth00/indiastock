import { useState, useCallback } from 'react';
import { fetchMovers } from '../utils/api';

export default function Movers() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [sortKey, setSortKey] = useState('changePct');
    const [sortAsc, setSortAsc] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const rows = await fetchMovers();
            if (rows[0]?.error) throw new Error(rows[0].error);
            setData(rows);
        } catch (e) {
            setError(e.message || 'Failed to load movers');
        } finally {
            setLoading(false);
        }
    }, []);

    const handleSort = (key) => {
        if (sortKey === key) {
            setSortAsc(!sortAsc);
        } else {
            setSortKey(key);
            setSortAsc(false);
        }
    };

    const sorted = data
        ? [...data].sort((a, b) => {
            const av = a[sortKey] ?? 0, bv = b[sortKey] ?? 0;
            return sortAsc ? av - bv : bv - av;
        })
        : [];

    const winners = sorted.filter(r => r.changePct > 0);
    const losers = sorted.filter(r => r.changePct < 0).reverse();

    const fmt = (v) => typeof v === 'number' ? v.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—';

    const MoverTable = ({ rows }) => (
        <div className="table-wrap">
            <table>
                <thead>
                    <tr>
                        <th>Ticker</th>
                        <th>Company</th>
                        <th style={{ cursor: 'pointer' }} onClick={() => handleSort('price')}>
                            Price {sortKey === 'price' ? (sortAsc ? '↑' : '↓') : ''}
                        </th>
                        <th style={{ cursor: 'pointer' }} onClick={() => handleSort('changePct')}>
                            Change % {sortKey === 'changePct' ? (sortAsc ? '↑' : '↓') : ''}
                        </th>
                        <th style={{ cursor: 'pointer' }} onClick={() => handleSort('change')}>
                            Change ₹ {sortKey === 'change' ? (sortAsc ? '↑' : '↓') : ''}
                        </th>
                        <th style={{ cursor: 'pointer' }} onClick={() => handleSort('volume')}>
                            Volume {sortKey === 'volume' ? (sortAsc ? '↑' : '↓') : ''}
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(r => (
                        <tr key={r.ticker}>
                            <td className="mono" style={{ fontWeight: 600 }}>{r.ticker}</td>
                            <td className="text-2 text-sm">{r.company}</td>
                            <td className="mono">₹{fmt(r.price)}</td>
                            <td>
                                <span className={`badge ${r.changePct >= 0 ? 'badge-green' : 'badge-red'}`}>
                                    {r.changePct >= 0 ? '▲' : '▼'} {fmt(Math.abs(r.changePct))}%
                                </span>
                            </td>
                            <td className={`mono ${r.change >= 0 ? 'text-green' : 'text-red'}`}>
                                {r.change >= 0 ? '+' : ''}{fmt(r.change)}
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
            <div className="page-header">
                <h2>Winners & Losers</h2>
                <p>Nifty 50 stocks ranked by daily % change</p>
            </div>

            <div className="flex gap-12 items-center mb-24">
                <button className="btn btn-primary" onClick={load} disabled={loading}>
                    {loading ? '⏳ Fetching…' : '📡 Fetch Today\'s Movers'}
                </button>
                {data && (
                    <span className="text-3 text-sm">
                        {data.length} stocks loaded
                    </span>
                )}
            </div>

            {error && <div className="error-box mb-24">{error}</div>}

            {loading && (
                <div className="loading">
                    <div className="spinner" />
                    Fetching Nifty 50 movers…
                </div>
            )}

            {!loading && data && (
                <>
                    <div className="grid-2 mb-24">
                        <div>
                            <div className="banner-win">▲ Winners ({winners.length})</div>
                            {winners.length > 0 ? (
                                <MoverTable rows={winners} />
                            ) : (
                                <div className="empty">No gainers today</div>
                            )}
                        </div>
                        <div>
                            <div className="banner-lose">▼ Losers ({losers.length})</div>
                            {losers.length > 0 ? (
                                <MoverTable rows={losers} />
                            ) : (
                                <div className="empty">No losers today</div>
                            )}
                        </div>
                    </div>

                    {/* Full ranking */}
                    <h3 style={{ fontWeight: 700, marginBottom: 12 }}>📋 Full Ranking</h3>
                    <MoverTable rows={sorted} />
                </>
            )}

            {!loading && !data && !error && (
                <div className="empty">
                    Click <strong>Fetch Today's Movers</strong> to load the daily leaderboard.
                </div>
            )}
        </div>
    );
}
