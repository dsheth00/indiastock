import { useState, useEffect, useCallback, useRef } from 'react';
import {
    BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine, Cell, Legend, Line, ComposedChart,
} from 'recharts';
import { getCloudStore, setCloudStore, ALL_SYMBOLS } from '../utils/api';

const CSV_KEY  = 'indstk_port_csv';
const DATA_KEY = 'indstk_port_data';
const PERF_RANGES = [
    { id: '1W', days: 7 }, { id: '1M', days: 30 }, { id: '3M', days: 90 },
    { id: '1Y', days: 365 }, { id: '5Y', days: 1825 }, { id: 'All', days: null },
];

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

function parseCsvLine(line) {
    if (!line || line.trim() === '') return null;
    const cols = line.split(',');
    if (cols.length < 5) return null;
    const dateStr = cols[0].trim();
    const ticker = cols[1].trim().toUpperCase();
    const action = cols[2].trim();
    if (dateStr.toLowerCase().startsWith('date') || ticker.toLowerCase().startsWith('stock') || ticker.toLowerCase().startsWith('ticker')) {
        return null; // Header
    }
    const qty = parseFloat(cols[3]) || 0;
    const price = parseFloat(cols[4]) || 0;
    if (!ticker || qty === 0 || price <= 0) return null;
    
    const isBuy = action.toLowerCase() === 'buy';
    const isSell = action.toLowerCase() === 'sell';
    if (!isBuy && !isSell) return null;
    
    return {
        ticker,
        qty: isBuy ? Math.abs(qty) : -Math.abs(qty),
        price,
        date: dateStr,
        time: '10:00'
    };
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
    const [manualTrades, setManualTrades] = useState([]);
    const [showTradeForm, setShowTradeForm] = useState(false);
    const [isUnlocked, setIsUnlocked] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [editingPosTicker, setEditingPosTicker] = useState(null);
    const [posEditForm, setPosEditForm] = useState({ qty: '', avgPrice: '' });
    const [tradeForm, setTradeForm] = useState({ 
        ticker: 'HDFCBANK', qty: '', price: '', 
        date: new Date().toLocaleDateString('en-CA'), 
        time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) 
    });
    const [chartType, setChartType] = useState('pnl');
    const [portTab, setPortTab] = useState('positions');
    const [trades, setTrades] = useState([]);
    const [performance, setPerformance] = useState([]);
    const [perfRange, setPerfRange] = useState('All');
    const [perfMode, setPerfMode] = useState('holdings'); // 'holdings' or 'cash'
    const [addTradeTab, setAddTradeTab] = useState('manual'); // 'manual' or 'csv'
    const [csvPasteText, setCsvPasteText] = useState('');
    const fileRef = useRef(null);
    const tradebookFileRef = useRef(null);

    useEffect(() => {
        let mounted = true;
        async function loadCloud() {
            setCloudLoading(true);
            const [csv, data, trades] = await Promise.all([
                getCloudStore(CSV_KEY),
                getCloudStore(DATA_KEY),
                getCloudStore('indstk_manual_trades')
            ]);
            if (mounted) {
                if (csv) setCsvTextData(csv);
                if (trades) setManualTrades(trades);
                if (data) {
                    setPositions(data.positions || []);
                    setSummary(data.summary || null);
                    setTrades(data.trades || []);
                    setPerformance(data.performance || []);
                    setLastUpdate(data.updatedAt || null);
                }
                setCloudLoading(false);
            }
        }
        loadCloud();
        return () => { mounted = false; };
    }, []);

    // Core: parse CSV via API, persist everything
    const process = useCallback(async (csvText, trades = [], silent = false) => {
        if (silent) setRefreshing(true); else setLoading(true);
        setError('');
        try {
            let finalCsv = csvText || '';
            if (trades.length > 0) {
                const hasHeader = finalCsv.toLowerCase().includes('date,stock,action');
                if (!hasHeader && finalCsv) finalCsv += '\n';
                if (!hasHeader) finalCsv += 'Date,Stock,Action,Qty,Price\n';
                trades.forEach(t => {
                    const action = t.qty >= 0 ? 'Buy' : 'Sell';
                    const date = t.date || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
                    finalCsv += `${date},${t.ticker},${action},${Math.abs(t.qty)},${t.price}\n`;
                });
            }
            const result = await parseCsv(finalCsv);
            const updatedAt = new Date().toLocaleTimeString('en-IN', {
                timeZone: 'Asia/Kolkata', hour12: false, hour: '2-digit', minute: '2-digit'
            }) + ' IST';
            result.updatedAt = updatedAt;
            setPositions(result.positions || []);
            setSummary(result.summary || null);
            setTrades(result.trades || []);
            setPerformance(result.performance || []);
            setLastUpdate(updatedAt);
            setCsvTextData(csvText || '');
            // Persist both CSV and parsed data
            setCloudStore(CSV_KEY, csvText || '');
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
        reader.onload = (ev) => process(ev.target.result, manualTrades, false);
        reader.readAsText(file);
    };



    const handleEditClick = (trade) => {
        if (isUnlocked) {
            setEditingId(trade.id);
            return;
        }
        const code = prompt("Enter passcode to edit trades:");
        if (code === 'drs12papa') {
            setIsUnlocked(true);
            setEditingId(trade.id);
        } else if (code !== null) {
            alert('Incorrect passcode');
        }
    };


    const deleteTrade = (id) => {
        const updated = manualTrades.filter(t => t.id !== id);
        setManualTrades(updated);
        setCloudStore('indstk_manual_trades', updated);
        process(csvTextData, updated, false);
    };

    const saveEdit = (id, updatedFields) => {
        const updated = manualTrades.map(t => t.id === id ? { ...t, ...updatedFields } : t);
        setManualTrades(updated);
        setCloudStore('indstk_manual_trades', updated);
        setEditingId(null);
        process(csvTextData, updated, false);
    };

    const handlePosEditSave = (ticker, currentPos) => {
        const targetQty = parseFloat(posEditForm.qty);
        const targetPrice = parseFloat(posEditForm.avgPrice);
        if (isNaN(targetQty) || isNaN(targetPrice)) return alert('Invalid values');

        // Logic: Add a trade that makes the total qty and avg price match target.
        // If current qty is 10 and target is 25, we need +15.
        // Price is harder if we want the weighted average to match exactly.
        // For simplicity, we'll just add a trade of the delta qty at the target price.
        // If qty doesn't change, we just add a 0-qty price adjustment trade? No.
        // We'll replace all manual trades for this ticker with one single trade that reconciles the whole position.
        // Total Qty = CSV Qty + Manual Qty. 
        // We need: Manual Qty = Target Qty - CSV Qty.
        // However, we don't easily have 'CSV Qty' here.
        // So we'll just add a new trade: Ticker, Qty: Target - Current, Price: Target.
        const deltaQty = targetQty - currentPos.qty;
        if (Math.abs(deltaQty) < 0.001 && Math.abs(targetPrice - currentPos.avgPrice) < 0.01) {
            setEditingPosTicker(null);
            return;
        }

        const newTrade = {
            ticker,
            qty: deltaQty,
            price: targetPrice,
            id: Date.now(),
            date: new Date().toLocaleDateString('en-CA'),
            time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
            isAdjustment: true
        };

        const updated = [...manualTrades, newTrade];
        setManualTrades(updated);
        setCloudStore('indstk_manual_trades', updated);
        setEditingPosTicker(null);
        process(csvTextData, updated, false);
    };

    const submitTrade = () => {
        const qty = parseFloat(tradeForm.qty);
        const price = parseFloat(tradeForm.price);
        if (!qty || !price || price <= 0) return alert('Invalid qty or price');
        const newTrade = { 
            ticker: tradeForm.ticker, 
            qty, 
            price, 
            id: Date.now(),
            date: tradeForm.date,
            time: tradeForm.time
        };
        const updated = [...manualTrades, newTrade];
        setManualTrades(updated);
        setCloudStore('indstk_manual_trades', updated);
        setShowTradeForm(false);
        setTradeForm({ 
            ticker: 'HDFCBANK', qty: '', price: '',
            date: new Date().toLocaleDateString('en-CA'),
            time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
        });
        process(csvTextData, updated, false);
    };

    const submitCsvTrades = () => {
        if (!csvPasteText.trim()) return alert('Please paste some CSV data.');
        const lines = csvPasteText.split('\n');
        const newTrades = [];
        let errorCount = 0;
        
        lines.forEach((line, index) => {
            const trimmed = line.trim();
            if (!trimmed) return;
            const parsed = parseCsvLine(trimmed);
            if (parsed) {
                newTrades.push({
                    ...parsed,
                    id: Date.now() + index + Math.random()
                });
            } else {
                errorCount++;
            }
        });

        if (newTrades.length === 0) {
            alert('No valid trade rows could be parsed. Check format: Date,Stock,Action,Qty,Price');
            return;
        }

        const updated = [...manualTrades, ...newTrades];
        setManualTrades(updated);
        setCloudStore('indstk_manual_trades', updated);
        setShowTradeForm(false);
        setCsvPasteText('');
        process(csvTextData, updated, false);
        
        if (errorCount > 0) {
            alert(`Successfully imported ${newTrades.length} trades. Skipped ${errorCount} invalid rows.`);
        } else {
            alert(`Successfully imported ${newTrades.length} trades.`);
        }
    };

    const hasData = (positions.length > 0 || trades.length > 0) && summary;

    const perfData = (() => {
        const range = PERF_RANGES.find(r => r.id === perfRange);
        const cutoff = range?.days
            ? new Date(Date.now() - range.days * 86400000).toISOString().slice(0, 10)
            : null;
        const filtered = cutoff
            ? performance.filter(p => p.dateSort >= cutoff || p.date === 'Today')
            : performance;
        return filtered.length > 1 ? filtered : performance;
    })();

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
                <input
                    ref={tradebookFileRef}
                    type="file"
                    accept=".csv,.txt"
                    style={{ display: 'none' }}
                    onChange={handleFileRead}
                />

                {(csvTextData || manualTrades.length > 0) && (
                    <button className="btn" onClick={() => process(csvTextData, manualTrades, false)} disabled={loading || refreshing || cloudLoading}>
                        🔄 Force Refresh Prices
                    </button>
                )}

                {!isUnlocked ? (
                    <button 
                        className="btn" 
                        onClick={() => {
                            const code = prompt("Enter passcode to edit trades:");
                            if (code === 'drs12papa') {
                                setIsUnlocked(true);
                            } else if (code !== null) {
                                alert('Incorrect passcode');
                            }
                        }}
                        style={{ border: '1px dashed var(--accent)', color: 'var(--accent)' }}
                    >
                        ⚙️ Edit Trade
                    </button>
                ) : (
                    <>
                        <button 
                            className="btn" 
                            onClick={() => {
                                setIsUnlocked(false);
                                setShowTradeForm(false);
                            }}
                            style={{ borderColor: 'var(--red)', color: 'var(--red)' }}
                        >
                            🔒 Lock Editing
                        </button>
                        <button className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={loading}>
                            📂 Upload port.csv
                        </button>
                        <button className="btn" onClick={() => tradebookFileRef.current?.click()} disabled={loading}>
                            📒 Upload tradeBook.csv
                        </button>
                        <button className="btn" onClick={() => setShowTradeForm(!showTradeForm)} disabled={loading || cloudLoading}>
                            {showTradeForm ? '✖ Close Add Form' : '➕ Add Trade'}
                        </button>
                    </>
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

            {showTradeForm && (
                <div className="card mb-24" style={{ border: '1px solid var(--accent)', padding: '20px' }}>
                    <div className="flex gap-12 mb-16" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8, flexWrap: 'wrap' }}>
                        <button 
                            className="btn" 
                            style={{ 
                                padding: '4px 12px', fontSize: '.8rem', border: 'none', borderRadius: 4,
                                background: addTradeTab === 'manual' ? 'var(--accent)' : 'transparent',
                                color: addTradeTab === 'manual' ? '#fff' : 'var(--text-2)',
                                boxShadow: addTradeTab === 'manual' ? 'var(--shadow-sm)' : 'none'
                            }}
                            onClick={() => setAddTradeTab('manual')}
                        >
                            ✍️ Manual Entry
                        </button>
                        <button 
                            className="btn" 
                            style={{ 
                                padding: '4px 12px', fontSize: '.8rem', border: 'none', borderRadius: 4,
                                background: addTradeTab === 'csv' ? 'var(--accent)' : 'transparent',
                                color: addTradeTab === 'csv' ? '#fff' : 'var(--text-2)',
                                boxShadow: addTradeTab === 'csv' ? 'var(--shadow-sm)' : 'none'
                            }}
                            onClick={() => setAddTradeTab('csv')}
                        >
                            📄 Paste CSV Row(s)
                        </button>
                    </div>

                    {addTradeTab === 'manual' ? (
                        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                            <div className="input-group" style={{ flex: 1, minWidth: 150 }}>
                                <label>Ticker</label>
                                <input 
                                    list="ticker-list"
                                    className="input" 
                                    placeholder="Type Ticker..."
                                    value={tradeForm.ticker} 
                                    onChange={e => setTradeForm({ ...tradeForm, ticker: e.target.value.toUpperCase() })} 
                                />
                            </div>
                            <div className="input-group" style={{ width: 140 }}>
                                <label>Qty (+Buy, -Sell)</label>
                                <input className="input" type="number" placeholder="e.g. 10 or -5" value={tradeForm.qty} onChange={e => setTradeForm({ ...tradeForm, qty: e.target.value })} />
                            </div>
                            <div className="input-group" style={{ width: 120 }}>
                                <label>Avg Price (₹)</label>
                                <input className="input" type="number" step="0.05" placeholder="0.00" value={tradeForm.price} onChange={e => setTradeForm({ ...tradeForm, price: e.target.value })} />
                            </div>
                            <div className="input-group" style={{ width: 140 }}>
                                <label>Date</label>
                                <input className="input" type="date" value={tradeForm.date} onChange={e => setTradeForm({ ...tradeForm, date: e.target.value })} />
                            </div>
                            <div className="input-group" style={{ width: 100 }}>
                                <label>Time</label>
                                <input className="input" type="time" value={tradeForm.time} onChange={e => setTradeForm({ ...tradeForm, time: e.target.value })} />
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn btn-primary" onClick={submitTrade}>Confirm Trade</button>
                                <button className="btn" onClick={() => setShowTradeForm(false)}>Cancel</button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-12">
                            <div className="input-group">
                                <label style={{ marginBottom: 4, display: 'block' }}>Paste CSV trade row(s) (format: Date, Stock, Action, Qty, Price, ...)</label>
                                <textarea 
                                    className="input" 
                                    rows={4} 
                                    placeholder="e.g. 18-Jun-2026,RELIANCE,Buy,130,1322.70,171951.00,20260618N100007522,..."
                                    value={csvPasteText}
                                    onChange={e => setCsvPasteText(e.target.value)}
                                    style={{ fontFamily: 'var(--mono)', fontSize: '.82rem' }}
                                />
                            </div>
                            <div className="flex gap-8 mt-16">
                                <button className="btn btn-primary" onClick={submitCsvTrades}>Import Trades</button>
                                <button className="btn" onClick={() => { setShowTradeForm(false); setCsvPasteText(''); }}>Cancel</button>
                            </div>
                        </div>
                    )}
                </div>
            )}

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
                        Upload your broker's portfolio or trade book CSV to see positions, P&amp;L breakdown, and charts.
                        <br />Once uploaded, your data persists across sessions and prices refresh automatically.
                    </div>
                    <div className="flex gap-12" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
                        {!isUnlocked ? (
                            <button 
                                className="btn" 
                                onClick={() => {
                                    const code = prompt("Enter passcode to edit trades:");
                                    if (code === 'drs12papa') {
                                        setIsUnlocked(true);
                                    } else if (code !== null) {
                                        alert('Incorrect passcode');
                                    }
                                }}
                                style={{ border: '1px dashed var(--accent)', color: 'var(--accent)' }}
                            >
                                ⚙️ Edit Trade
                            </button>
                        ) : (
                            <>
                                <button 
                                    className="btn" 
                                    onClick={() => {
                                        setIsUnlocked(false);
                                        setShowTradeForm(false);
                                    }}
                                    style={{ borderColor: 'var(--red)', color: 'var(--red)' }}
                                >
                                    🔒 Lock Editing
                                </button>
                                <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>
                                    📂 Upload port.csv
                                </button>
                                <button className="btn" onClick={() => tradebookFileRef.current?.click()}>
                                    📒 Upload tradeBook.csv
                                </button>
                                <button className="btn" onClick={() => setShowTradeForm(true)}>
                                    ➕ Add Trade
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {hasData && !cloudLoading && (
                <>
                    {/* ── Summary cards ── */}
                    <div className="flex gap-12 mb-24" style={{ flexWrap: 'wrap' }}>
                        <SummaryCard label="Starting Balance" value={fmtRupee(summary.startingBalance || 7272047.74)} sub="Account opening" />
                        <SummaryCard label="Cash Available" value={fmtRupee(summary.cash)}
                            sub={`${summary.cashPct || 0}% of account`} />
                        <SummaryCard label="Current Invested" value={fmtRupee(summary.totalInvested)} />
                        <SummaryCard label="Holdings Value" value={fmtRupee(summary.totalCurrent)}
                            sub={`Account total ${fmtRupee(summary.totalAccountValue)}`} />
                        <SummaryCard label="Unrealized P&L" value={fmtRupee(summary.totalUnrealized)}
                            color={pnlColor(summary.totalUnrealized)} />
                        <SummaryCard label="Realized P&L" value={fmtRupee(summary.totalRealized)}
                            color={pnlColor(summary.totalRealized)} sub="Booked from sells" />
                        <SummaryCard label="Total Net P&L" value={fmtRupee(summary.totalPnl)}
                            sub={`${summary.totalPnlPct > 0 ? '+' : ''}${summary.totalPnlPct}% on invested`}
                            color={pnlColor(summary.totalPnl)} />
                    </div>

                    {/* ── Sub-tabs ── */}
                    <div className="flex gap-8 mb-20" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
                        {[
                            { id: 'positions', label: '📋 Positions' },
                            { id: 'tradebook', label: '📒 Trade Book' },
                            { id: 'performance', label: '📈 Performance' },
                        ].map(t => (
                            <button
                                key={t.id}
                                onClick={() => setPortTab(t.id)}
                                style={{
                                    padding: '8px 16px', fontSize: '.85rem', fontWeight: 600,
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    color: portTab === t.id ? 'var(--accent)' : 'var(--text-3)',
                                    borderBottom: portTab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
                                    marginBottom: -1,
                                }}
                            >{t.label}</button>
                        ))}
                    </div>

                    {portTab === 'performance' && (
                        <div className="mb-24">
                            <div className="flex justify-between items-center mb-16" style={{ flexWrap: 'wrap', gap: 12 }}>
                                <div className="flex gap-8">
                                    {PERF_RANGES.map(r => (
                                        <button
                                            key={r.id}
                                            className={`btn ${perfRange === r.id ? 'btn-primary' : ''}`}
                                            style={{ padding: '4px 12px', fontSize: '.78rem', borderRadius: 20 }}
                                            onClick={() => setPerfRange(r.id)}
                                        >{r.id}</button>
                                    ))}
                                </div>
                                <div className="flex gap-8 items-center" style={{ background: 'var(--bg-card)', padding: '2px', borderRadius: 8, border: '1px solid var(--border)' }}>
                                    <button
                                        className="btn"
                                        style={{ 
                                            padding: '4px 12px', 
                                            fontSize: '.78rem', 
                                            border: 'none', 
                                            borderRadius: 6,
                                            background: perfMode === 'holdings' ? 'var(--accent)' : 'transparent', 
                                            color: perfMode === 'holdings' ? '#fff' : 'var(--text-2)',
                                            boxShadow: perfMode === 'holdings' ? 'var(--shadow-sm)' : 'none'
                                        }}
                                        onClick={() => setPerfMode('holdings')}
                                    >
                                        💼 Holdings Value
                                    </button>
                                    <button
                                        className="btn"
                                        style={{ 
                                            padding: '4px 12px', 
                                            fontSize: '.78rem', 
                                            border: 'none', 
                                            borderRadius: 6,
                                            background: perfMode === 'cash' ? 'var(--accent)' : 'transparent', 
                                            color: perfMode === 'cash' ? '#fff' : 'var(--text-2)',
                                            boxShadow: perfMode === 'cash' ? 'var(--shadow-sm)' : 'none'
                                        }}
                                        onClick={() => setPerfMode('cash')}
                                    >
                                        💵 Cash Component
                                    </button>
                                </div>
                            </div>
                            <div className="chart-container" style={{ padding: '16px 8px 8px', background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border)' }}>
                                <ResponsiveContainer width="100%" height={340}>
                                    <ComposedChart 
                                        data={perfData.map(d => {
                                            const startBal = summary?.startingBalance || 7272047.74;
                                            const pctGain = startBal ? ((d.totalValue - startBal) / startBal) * 100 : 0;
                                            return {
                                                ...d,
                                                pctGain: parseFloat(pctGain.toFixed(2))
                                            };
                                        })} 
                                        margin={{ top: 8, right: 16, bottom: 0, left: 16 }}
                                    >
                                        <defs>
                                            <linearGradient id="cashGrad" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                                                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
                                            </linearGradient>
                                            <linearGradient id="holdingsGrad" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.35} />
                                                <stop offset="100%" stopColor="#14b8a6" stopOpacity={0.05} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-3)' }} />
                                        
                                        {/* Left YAxis for % Gain */}
                                        <YAxis 
                                            yAxisId="left"
                                            orientation="left"
                                            tick={{ fontSize: 11, fill: 'var(--text-3)' }}
                                            tickFormatter={v => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`}
                                            domain={['auto', 'auto']}
                                            stroke="var(--accent)"
                                        />
                                        
                                        {/* Right YAxis for Rupee Values */}
                                        <YAxis 
                                            yAxisId="right"
                                            orientation="right"
                                            tick={{ fontSize: 11, fill: 'var(--text-3)' }}
                                            tickFormatter={v => `₹${(v / 100000).toFixed(1)}L`}
                                            domain={['auto', 'auto']}
                                            stroke={perfMode === 'holdings' ? '#14b8a6' : '#3b82f6'}
                                        />
                                        
                                        <Tooltip content={({ active, payload, label }) => {
                                            if (!active || !payload?.length) return null;
                                            const d = payload[0]?.payload;
                                            return (
                                                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: '.82rem' }}>
                                                    <div style={{ fontWeight: 700, marginBottom: 6 }}>{label}</div>
                                                    <div style={{ marginBottom: 4 }}>Total Account: <strong>{fmtRupee(d?.totalValue)}</strong></div>
                                                    <div style={{ color: 'var(--accent)', marginBottom: 6 }}>
                                                        Account Gain: <strong>{d?.pctGain >= 0 ? '+' : ''}{d?.pctGain}%</strong>
                                                    </div>
                                                    <div style={{ color: '#14b8a6', display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 2 }}>
                                                        <span>Holdings Value</span><strong>{fmtRupee(d?.holdingsValue)}</strong>
                                                    </div>
                                                    <div style={{ color: '#3b82f6', display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                                                        <span>Cash Component</span><strong>{fmtRupee(d?.cash)}</strong>
                                                    </div>
                                                </div>
                                            );
                                        }} />
                                        <Legend wrapperStyle={{ fontSize: '.78rem', paddingTop: 8 }} />
                                        
                                        {perfMode === 'holdings' ? (
                                            <Area 
                                                yAxisId="right"
                                                type="monotone" 
                                                dataKey="holdingsValue" 
                                                name="Holdings Value" 
                                                stroke="#14b8a6" 
                                                strokeWidth={2} 
                                                fill="url(#holdingsGrad)" 
                                                dot={false} 
                                            />
                                        ) : (
                                            <Area 
                                                yAxisId="right"
                                                type="monotone" 
                                                dataKey="cash" 
                                                name="Cash Component" 
                                                stroke="#3b82f6" 
                                                strokeWidth={2} 
                                                fill="url(#cashGrad)" 
                                                dot={false} 
                                            />
                                        )}
                                        
                                        <Line 
                                            yAxisId="left"
                                            type="monotone"
                                            dataKey="pctGain"
                                            name="Account % Gain"
                                            stroke="var(--accent)"
                                            strokeWidth={2}
                                            dot={false}
                                        />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}

                    {portTab === 'tradebook' && (
                        <div className="mb-24">
                            <h3 style={{ fontWeight: 700, marginBottom: 12 }}>📒 Full Trade Book ({trades.length} trades)</h3>
                            <div className="table-wrap">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Date</th><th>Stock</th><th>Action</th><th>Qty</th>
                                            <th>Price</th><th>Trade Value</th><th>Cash After</th><th>Account Value</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {trades.map((t, i) => (
                                            <tr key={`${t.dateSort}-${t.stock}-${i}`}>
                                                <td className="text-sm">{t.date || '—'}</td>
                                                <td className="mono" style={{ fontWeight: 700 }}>{t.stock}</td>
                                                <td>
                                                    <span className={`badge ${t.action === 'Buy' ? 'badge-green' : 'badge-red'}`} style={{ fontSize: '.7rem' }}>
                                                        {t.action?.toUpperCase()}
                                                    </span>
                                                </td>
                                                <td className="mono">{t.qty}</td>
                                                <td className="mono">{fmtRupee(t.price)}</td>
                                                <td className="mono">{fmtRupee(t.value)}</td>
                                                <td className="mono">{fmtRupee(t.cashAfter)}</td>
                                                <td className="mono" style={{ fontWeight: 600 }}>{fmtRupee(t.totalValue)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {portTab === 'positions' && (
                    <>

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
                                    {isUnlocked && <th>Actions</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {positions.map(p => (
                                    <tr key={p.stock} style={editingPosTicker === p.stock ? { background: 'var(--bg-active)' } : {}}>
                                        <td className="mono" style={{ fontWeight: 700 }}>{p.stock}</td>
                                        
                                        {editingPosTicker === p.stock ? (
                                            <>
                                                <td>
                                                    <input 
                                                        type="number" 
                                                        className="input" 
                                                        style={{ padding: '2px 4px', fontSize: '.75rem', width: 70 }} 
                                                        value={posEditForm.qty} 
                                                        onChange={e => setPosEditForm({ ...posEditForm, qty: e.target.value })} 
                                                    />
                                                </td>
                                                <td>
                                                    <input 
                                                        type="number" 
                                                        step="0.05" 
                                                        className="input" 
                                                        style={{ padding: '2px 4px', fontSize: '.75rem', width: 90 }} 
                                                        value={posEditForm.avgPrice} 
                                                        onChange={e => setPosEditForm({ ...posEditForm, avgPrice: e.target.value })} 
                                                    />
                                                </td>
                                                <td className="mono">{fmtRupee(p.ltp)}</td>
                                                <td colSpan={5} className="text-3 text-sm">
                                                    Adjusting position... (delta will be added as a trade)
                                                </td>
                                                <td>
                                                    <div className="flex gap-4">
                                                        <button className="btn btn-primary" style={{ padding: '2px 8px', fontSize: '.7rem' }} onClick={() => handlePosEditSave(p.stock, p)}>Save</button>
                                                        <button className="btn" style={{ padding: '2px 8px', fontSize: '.7rem' }} onClick={() => setEditingPosTicker(null)}>Cancel</button>
                                                    </div>
                                                </td>
                                            </>
                                        ) : (
                                            <>
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
                                                {isUnlocked && (
                                                    <td>
                                                        <button 
                                                            className="btn" 
                                                            style={{ padding: '2px 8px', fontSize: '.7rem', color: 'var(--accent)', borderColor: 'var(--accent)', opacity: 0.7 }}
                                                            onClick={() => {
                                                                setEditingPosTicker(p.stock);
                                                                setPosEditForm({ qty: p.qty, avgPrice: p.avgPrice });
                                                            }}
                                                        >
                                                            Edit
                                                        </button>
                                                    </td>
                                                )}
                                            </>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* ── Trade History Log ── */}
                    {manualTrades.length > 0 && (
                        <div style={{ marginTop: 40 }}>
                            <h3 style={{ fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                                📜 Manual Trade Log
                                <span style={{ fontSize: '.75rem', fontWeight: 500, color: 'var(--text-3)' }}>({manualTrades.length} trades)</span>
                            </h3>
                            <div className="table-wrap">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Date / Time</th>
                                            <th>Ticker</th>
                                            <th>Action</th>
                                            <th>Qty</th>
                                            <th>Price</th>
                                            <th>Total</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[...manualTrades].reverse().map(t => (
                                            <tr key={t.id}>
                                                {editingId === t.id ? (
                                                    <>
                                                        <td>
                                                            <div className="flex gap-4">
                                                                <input type="date" className="input" style={{ padding: '2px 4px', fontSize: '.75rem' }} value={t.date} onChange={e => saveEdit(t.id, { date: e.target.value })} />
                                                                <input type="time" className="input" style={{ padding: '2px 4px', fontSize: '.75rem' }} value={t.time} onChange={e => saveEdit(t.id, { time: e.target.value })} />
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <input type="text" className="input" style={{ padding: '2px 4px', fontSize: '.75rem', width: 80 }} value={t.ticker} onChange={e => saveEdit(t.id, { ticker: e.target.value.toUpperCase() })} />
                                                        </td>
                                                        <td>
                                                            <select className="select" style={{ padding: '2px 4px', fontSize: '.75rem' }} value={t.qty >= 0 ? 'Buy' : 'Sell'} onChange={e => {
                                                                const newQty = e.target.value === 'Buy' ? Math.abs(t.qty) : -Math.abs(t.qty);
                                                                saveEdit(t.id, { qty: newQty });
                                                            }}>
                                                                <option value="Buy">BUY</option>
                                                                <option value="Sell">SELL</option>
                                                            </select>
                                                        </td>
                                                        <td>
                                                            <input type="number" className="input" style={{ padding: '2px 4px', fontSize: '.75rem', width: 60 }} value={Math.abs(t.qty)} onChange={e => {
                                                                const val = parseFloat(e.target.value) || 0;
                                                                const newQty = t.qty >= 0 ? val : -val;
                                                                saveEdit(t.id, { qty: newQty });
                                                            }} />
                                                        </td>
                                                        <td>
                                                            <input type="number" step="0.05" className="input" style={{ padding: '2px 4px', fontSize: '.75rem', width: 80 }} value={t.price} onChange={e => saveEdit(t.id, { price: parseFloat(e.target.value) || 0 })} />
                                                        </td>
                                                        <td className="mono">₹{fmt(Math.abs(t.qty * t.price))}</td>
                                                        <td>
                                                            <button className="btn btn-primary" style={{ padding: '2px 8px', fontSize: '.7rem' }} onClick={() => setEditingId(null)}>Done</button>
                                                        </td>
                                                    </>
                                                ) : (
                                                    <>
                                                        <td className="text-3 text-sm">
                                                            {t.date || '—'} <span style={{ opacity: 0.6 }}>{t.time || ''}</span>
                                                        </td>
                                                        <td className="mono" style={{ fontWeight: 700 }}>{t.ticker}</td>
                                                        <td>
                                                            <span className={`badge ${t.qty >= 0 ? 'badge-green' : 'badge-red'}`} style={{ fontSize: '.7rem' }}>
                                                                {t.qty >= 0 ? 'BUY' : 'SELL'}
                                                            </span>
                                                        </td>
                                                        <td className="mono">{Math.abs(t.qty)}</td>
                                                        <td className="mono">₹{fmt(t.price)}</td>
                                                        <td className="mono">₹{fmt(Math.abs(t.qty * t.price))}</td>
                                                        <td>
                                                            <div className="flex gap-6">
                                                                <button 
                                                                    className="btn" 
                                                                    style={{ padding: '2px 8px', fontSize: '.7rem', color: 'var(--accent)', borderColor: 'var(--accent)', opacity: 0.7 }}
                                                                    onClick={() => handleEditClick(t)}
                                                                >
                                                                    Edit
                                                                </button>
                                                                <button 
                                                                    className="btn" 
                                                                    style={{ padding: '2px 8px', fontSize: '.7rem', color: 'var(--red)', borderColor: 'var(--red)', opacity: 0.7 }}
                                                                    onClick={() => { if(confirm('Delete this trade?')) deleteTrade(t.id); }}
                                                                >
                                                                    Delete
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                    </>
                    )}
                </>
            )}
        </div>
    );
}
