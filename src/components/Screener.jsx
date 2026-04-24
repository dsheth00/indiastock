import { useState, useCallback } from 'react';
import { fetchScreener, SCREENER_PRESETS } from '../utils/api';

export default function Screener() {
  const [preset, setPreset] = useState(SCREENER_PRESETS[0]);
  const [universe, setUniverse] = useState('nifty');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await fetchScreener(preset, universe);
      if (rows[0]?.error) throw new Error(rows[0].error);
      setData(rows || []);
    } catch (e) {
      setError(e.message || 'Failed to run screener');
    } finally {
      setLoading(false);
    }
  }, [preset, universe]);

  const fmt = (v) => typeof v === 'number' ? v.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : (v || '—');

  return (
    <div>
      <div className="page-header">
        <h2>Stock Screener</h2>
        <p>13 pre-built strategies inspired by Screener.in</p>
      </div>

      <div className="flex gap-12 items-center mb-24" style={{ flexWrap: 'wrap' }}>
        <div style={{ flex: 2, minWidth: 300 }}>
          <label className="text-sm font-600 text-2 block mb-4">Choose a screener preset</label>
          <select className="select" value={preset} onChange={e => setPreset(e.target.value)}>
            {SCREENER_PRESETS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label className="text-sm font-600 text-2 block mb-4">Universe</label>
          <select className="select" value={universe} onChange={e => setUniverse(e.target.value)}>
            <option value="nifty">Nifty 50 (fast)</option>
            <option value="all">All 756 NSE (slower)</option>
          </select>
        </div>
        <div style={{ marginTop: 24 }}>
          <button className="btn btn-primary" onClick={load} disabled={loading}>
            {loading ? '🚀 Running…' : '🚀 Run Screener'}
          </button>
        </div>
      </div>

      {error && <div className="error-box mb-24">{error}</div>}

      {loading && (
        <div className="loading">
          <div className="spinner" />
          Running Screener '{preset}'…
        </div>
      )}

      {!loading && data && (
        <div>
          <h3 style={{ fontWeight: 600, marginBottom: 12 }}>
            ✅ {data.length} matches found
          </h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Company</th>
                  <th>Price</th>
                  <th>P/E</th>
                  <th>ROE</th>
                  <th>Debt/Eq</th>
                  <th>Market Cap</th>
                </tr>
              </thead>
              <tbody>
                {data.map(r => (
                  <tr key={r.Ticker}>
                    <td className="mono font-600">{r.Ticker}</td>
                    <td className="text-sm text-2">{r.Name}</td>
                    <td className="mono">₹{fmt(r['Current Price'])}</td>
                    <td className="mono">{fmt(r['P/E'])}</td>
                    <td className="mono">{fmt(r['ROE'])}%</td>
                    <td className="mono">{fmt(r['Debt/Equity'])}</td>
                    <td className="mono">{r['Market Cap (Cr)']}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.length === 0 && <div className="empty" style={{ padding: 24 }}>No stocks matched.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
