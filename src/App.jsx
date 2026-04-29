import { useState } from 'react';
import Dashboard from './components/Dashboard';
import Analysis from './components/Analysis';
import Screener from './components/Screener';
import Movers from './components/Movers';
import { ALL_SYMBOLS, TICKER_DIRECTORY } from './utils/api';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'analysis', label: 'Stock Analysis', icon: '🔍' },
  { id: 'screener', label: 'Screener', icon: '🎯' },
  { id: 'movers', label: 'Winners & Losers', icon: '🏆' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="app">
      {/* ── Top Bar ─────────────────────────────── */}
      <header className="topbar">
        <div className="topbar-inner">
          <div className="logo">
            <span>India</span><span className="logo-dot">Stock</span>
            <span className="logo-tag">NSE Screener</span>
          </div>
          <nav className="tabs">
            {TABS.map(t => (
              <button
                key={t.id}
                className={`tab ${activeTab === t.id ? 'active' : ''}`}
                onClick={() => setActiveTab(t.id)}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* ── Main Content ────────────────────────── */}
      <main className="main">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'analysis' && <Analysis />}
        {activeTab === 'screener' && <Screener />}
        {activeTab === 'movers' && <Movers />}
      </main>

      <datalist id="ticker-list">
        {ALL_SYMBOLS.map(sym => (
          <option key={sym} value={sym}>{TICKER_DIRECTORY[sym] || sym}</option>
        ))}
      </datalist>
    </div>
  );
}
