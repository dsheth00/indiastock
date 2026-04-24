import { fetchMovers } from '../utils/api';

function getMarketStatus() {
    const now = new Date();
    // Convert to IST safely
    const istString = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
    const istTime = new Date(istString);
    
    const day = istTime.getDay(); // 0 = Sunday, 1 = Monday...
    const hours = istTime.getHours();
    const minutes = istTime.getMinutes();
    const timeNum = hours * 100 + minutes; // e.g., 915 for 9:15 AM
    
    if (day === 0 || day === 6) return { open: false, label: "🔴 Weekend — Market Closed" };
    if (timeNum < 915) return { open: false, label: "🟡 Pre-Market" };
    if (timeNum >= 1530) return { open: false, label: "🔴 Market Closed" };
    return { open: true, label: "🟢 Market Open" };
}

function getISTTimeString() {
    return new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false, hour: '2-digit', minute:'2-digit' }) + ' IST';
}

export default function Movers() {
    const [data, setData] = useState(() => {
        const cached = localStorage.getItem('indstk_movers_data');
        return cached ? JSON.parse(cached) : null;
    });
    const [fetchedAt, setFetchedAt] = useState(() => {
        return localStorage.getItem('indstk_movers_time') || null;
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [universe, setUniverse] = useState('nifty');
    const [sortKey, setSortKey] = useState('changePct');
    const [sortAsc, setSortAsc] = useState(false);
    
    const [marketStatus, setMarketStatus] = useState(getMarketStatus());

    useEffect(() => {
        const timer = setInterval(() => setMarketStatus(getMarketStatus()), 60000);
        return () => clearInterval(timer);
    }, []);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const rows = await fetchMovers(universe);
            if (rows.length > 0 && rows[0]?.error) throw new Error(rows[0].error);
            setData(rows);
            const timeStr = getISTTimeString();
            setFetchedAt(timeStr);
            localStorage.setItem('indstk_movers_data', JSON.stringify(rows));
            localStorage.setItem('indstk_movers_time', timeStr);
        } catch (e) {
            setError(e.message || 'Failed to load movers');
        } finally {
            setLoading(false);
        }
    }, [universe]);

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
            <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', flexDirection: 'column' }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    🏆 Today's Winners & Losers
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-3)', fontSize: '0.88rem' }}>
                    Ranked by daily % change · click any column to sort
                    <span style={{ 
                        background: marketStatus.open ? 'rgba(22, 163, 74, 0.1)' : 'rgba(220, 38, 38, 0.1)', 
                        color: marketStatus.open ? 'var(--green)' : 'var(--text-2)', 
                        padding: '4px 10px', 
                        borderRadius: '20px', 
                        fontSize: '0.75rem', 
                        fontWeight: 600,
                        border: `1px solid ${marketStatus.open ? 'rgba(22,163,74,0.3)' : 'rgba(220,38,38,0.2)'}`
                    }}>
                        {marketStatus.label}
                    </span>
                </div>
            </div>

            <div className="flex gap-12 items-end mb-24" style={{ flexWrap: 'wrap' }}>
                <div style={{ flex: '0 1 auto', minWidth: 200, maxWidth: 300 }}>
                    <label className="text-sm font-600 text-2 block mb-4">Universe</label>
                    <select className="select" value={universe} onChange={e => { setUniverse(e.target.value); setTimeout(load, 0); }}>
                        <option value="nifty">Nifty 50 (fast)</option>
                        <option value="all">All 756 NSE (batch)</option>
                    </select>
                </div>
                
                <div>
                    <button className="btn btn-primary" onClick={load} disabled={loading}>
                        {loading ? '⏳ Fetching…' : '📡 Refresh from Market'}
                    </button>
                </div>

                <div style={{ flex: '0 1 auto', minWidth: 150 }}>
                    <label className="text-sm font-600 text-2 block mb-4">Browse history</label>
                    <select className="select" disabled>
                        <option>Latest</option>
                    </select>
                </div>

                {fetchedAt && (
                    <div style={{ 
                        marginLeft: 'auto', 
                        background: 'var(--bg-card)', 
                        border: '1px solid var(--border)', 
                        padding: '8px 16px', 
                        borderRadius: '8px', 
                        fontSize: '0.82rem', 
                        color: 'var(--text-2)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}>
                        📡 <strong>Live data</strong> fetched at {fetchedAt}
                    </div>
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
