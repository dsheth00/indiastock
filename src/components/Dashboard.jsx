import { useState, useEffect } from 'react';
import { DEFAULT_WATCHLISTS, fetchQuote } from '../utils/api';

export default function Dashboard() {
  const [quotes, setQuotes] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadQuotes() {
      // Gather all unique tickers
      const allSyms = new Set();
      Object.values(DEFAULT_WATCHLISTS).forEach(list => list.forEach(t => allSyms.add(t)));
      
      const q = {};
      try {
        await Promise.all(
          Array.from(allSyms).map(async (t) => {
            const data = await fetchQuote(t);
            if (!data.error) q[t] = data;
          })
        );
      } catch (e) {
         console.error(e);
      }
      setQuotes(q);
      setLoading(false);
    }
    loadQuotes();
  }, []);

  const fmtPrice = (v) => v ? v.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—';
  
  return (
    <div>
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>5 watchlists • Live quotes</p>
      </div>

      {loading && (
        <div className="loading">
          <div className="spinner" />
          Loading quotes for watchlists…
        </div>
      )}

      {!loading && (
        <div className="flex-col gap-24">
          {Object.entries(DEFAULT_WATCHLISTS).map(([name, tickers]) => (
            <div key={name} className="card">
              <h3 style={{ fontWeight: 700, marginBottom: 16 }}>{name}</h3>
              <div className="chip-grid">
                {tickers.map(t => {
                  const q = quotes[t];
                  const chg = q?.changePct || 0;
                  const color = chg >= 0 ? 'var(--green)' : 'var(--red)';
                  return (
                    <div key={t} className="chip">
                      <span className="chip-sym">{t}</span>
                      <span className="chip-price">₹{fmtPrice(q?.price)}</span>
                      <span style={{ color, fontSize: '.75rem', fontWeight: 600 }}>
                         {chg >= 0 ? '▲' : '▼'}{Math.abs(chg)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
