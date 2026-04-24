import { useState } from 'react';
import Analysis from './components/Analysis';
import Movers from './components/Movers';

const TABS = [
  { id: 'analysis', label: 'Stock Analysis', icon: '🔍' },
  { id: 'movers', label: 'Winners & Losers', icon: '🏆' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('analysis');

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
        {activeTab === 'analysis' && <Analysis />}
        {activeTab === 'movers' && <Movers />}
      </main>
    </div>
  );
}
