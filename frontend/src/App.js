import { useState, useEffect, useCallback } from 'react';
import './App.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';
const POLL_MS = 3000;
const STALE_THRESHOLD_S = 10;

// ── StationTile ──────────────────────────────────────────────────────────────

function StationTile({ station, onSelect, sizeTier }) {
  const [imgSrc, setImgSrc] = useState(null);

  const refresh = useCallback(() => {
    if (!station.online) return;
    setImgSrc(`${API}/frame/${station.idx}?size=${sizeTier}&t=${Date.now()}`);
  }, [station.idx, station.online, sizeTier]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const stale = station.online && (Date.now() / 1000 - station.last_update) > STALE_THRESHOLD_S;
  const statusClass = !station.online ? 'offline' : stale ? 'stale' : 'online';

  return (
    <div className={`tile ${statusClass}`} onClick={() => onSelect(station)}>
      <div className="tile-header">
        <span className="tile-label">{station.label}</span>
        <span className={`tile-badge ${statusClass}`}>
          {!station.online ? 'Offline' : stale ? 'Stale' : 'Live'}
        </span>
      </div>
      <div className="tile-body">
        {station.online && imgSrc ? (
          <img src={imgSrc} alt={station.label} onError={() => setImgSrc(null)} />
        ) : (
          <div className="tile-placeholder">
            <span>{station.online ? 'Loading…' : station.error || 'Offline'}</span>
          </div>
        )}
      </div>
      <div className="tile-footer">{station.ip}</div>
    </div>
  );
}

// ── FullscreenModal ──────────────────────────────────────────────────────────

function FullscreenModal({ station, onClose }) {
  const [imgSrc, setImgSrc] = useState(null);

  useEffect(() => {
    if (!station) return;
    const refresh = () => setImgSrc(`${API}/frame/${station.idx}?size=full&t=${Date.now()}`);
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [station]);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!station) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{station.label} — {station.ip}</span>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        {imgSrc
          ? <img src={imgSrc} alt={station.label} className="modal-img" />
          : <div className="modal-placeholder">Loading…</div>}
      </div>
    </div>
  );
}

// ── StationPicker ────────────────────────────────────────────────────────────

function StationPicker({ stations, pickedIdxs, limit, onChange }) {
  function toggle(idx) {
    if (pickedIdxs.includes(idx)) {
      onChange(pickedIdxs.filter((i) => i !== idx));
    } else if (pickedIdxs.length < limit) {
      onChange([...pickedIdxs, idx]);
    }
  }
  return (
    <div className="picker-bar">
      <span className="picker-label">Showing {pickedIdxs.length}/{limit}:</span>
      <div className="picker-chips">
        {stations.map((s) => {
          const active = pickedIdxs.includes(s.idx);
          const disabled = !active && pickedIdxs.length >= limit;
          return (
            <button
              key={s.idx}
              className={`chip ${active ? 'chip-active' : ''} ${disabled ? 'chip-disabled' : ''}`}
              onClick={() => toggle(s.idx)}
              title={s.ip}
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── SettingsModal ────────────────────────────────────────────────────────────

const EMPTY_STATION = { label: '', ip: '' };

function SettingsModal({ onClose, onSaved }) {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API}/config`)
      .then((r) => r.json())
      .then(setCfg)
      .catch(() => setError('Failed to load config'));
  }, []);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  function setField(key, val) {
    setCfg((c) => ({ ...c, [key]: val }));
  }

  function setStation(i, key, val) {
    const stations = cfg.stations.map((s, idx) => idx === i ? { ...s, [key]: val } : s);
    setCfg((c) => ({ ...c, stations }));
  }

  function addStation() {
    setCfg((c) => ({ ...c, stations: [...c.stations, { ...EMPTY_STATION }] }));
  }

  function removeStation(i) {
    setCfg((c) => ({ ...c, stations: c.stations.filter((_, idx) => idx !== i) }));
  }

  function moveStation(i, dir) {
    const stations = [...cfg.stations];
    const j = i + dir;
    if (j < 0 || j >= stations.length) return;
    [stations[i], stations[j]] = [stations[j], stations[i]];
    setCfg((c) => ({ ...c, stations }));
  }

  async function save() {
    setError('');
    setSaving(true);
    try {
      const res = await fetch(`${API}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      if (!res.ok) throw new Error(await res.text());
      onSaved();
      onClose();
    } catch (e) {
      setError(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  if (!cfg) return (
    <div className="modal-overlay">
      <div className="modal-content settings-modal">
        <div className="modal-header"><span>Settings</span></div>
        <div className="settings-body">{error || 'Loading…'}</div>
      </div>
    </div>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>Settings</span>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="settings-body">

          {/* Connection settings */}
          <section className="settings-section">
            <h2 className="settings-section-title">Connection</h2>
            <div className="settings-row">
              <label>VNC Port</label>
              <input
                type="number" className="settings-input short"
                value={cfg.vnc_port}
                onChange={(e) => setField('vnc_port', Number(e.target.value))}
              />
            </div>
            <div className="settings-row">
              <label>VNC Password</label>
              <input
                type="password" className="settings-input"
                placeholder="leave blank if none"
                value={cfg.vnc_password}
                onChange={(e) => setField('vnc_password', e.target.value)}
              />
            </div>
            <div className="settings-row">
              <label>Poll interval (s)</label>
              <input
                type="number" className="settings-input short" min="0.5" step="0.5"
                value={cfg.poll_interval}
                onChange={(e) => setField('poll_interval', Number(e.target.value))}
              />
            </div>
            <div className="settings-row">
              <label>JPEG quality (1–95)</label>
              <input
                type="number" className="settings-input short" min="1" max="95"
                value={cfg.jpeg_quality}
                onChange={(e) => setField('jpeg_quality', Number(e.target.value))}
              />
            </div>
          </section>

          {/* Stations */}
          <section className="settings-section">
            <h2 className="settings-section-title">
              Stations
              <span className="station-count">{cfg.stations.length}</span>
            </h2>
            <div className="station-list">
              <div className="station-list-header">
                <span>Label</span><span>IP Address</span><span></span>
              </div>
              {cfg.stations.map((s, i) => (
                <div className="station-row" key={i}>
                  <input
                    className="settings-input"
                    value={s.label}
                    placeholder="Station label"
                    onChange={(e) => setStation(i, 'label', e.target.value)}
                  />
                  <input
                    className="settings-input"
                    value={s.ip}
                    placeholder="192.168.x.x"
                    onChange={(e) => setStation(i, 'ip', e.target.value)}
                  />
                  <div className="station-actions">
                    <button className="icon-btn" title="Move up"    onClick={() => moveStation(i, -1)} disabled={i === 0}>↑</button>
                    <button className="icon-btn" title="Move down"  onClick={() => moveStation(i,  1)} disabled={i === cfg.stations.length - 1}>↓</button>
                    <button className="icon-btn danger" title="Remove" onClick={() => removeStation(i)}>✕</button>
                  </div>
                </div>
              ))}
              <button className="add-station-btn" onClick={addStation}>+ Add station</button>
            </div>
          </section>

        </div>

        <div className="settings-footer">
          {error && <span className="settings-error">{error}</span>}
          <button className="settings-cancel-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="settings-save-btn" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save & Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── App ──────────────────────────────────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [2, 4, 8, 10, 12];

export default function App() {
  const [stations, setStations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [pageSize, setPageSize] = useState('all');
  const [pickedIdxs, setPickedIdxs] = useState([]);
  const [light, setLight] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const fetchStations = useCallback(async () => {
    try {
      const res = await fetch(`${API}/stations`);
      const data = await res.json();
      setStations(data);
    } catch (e) {
      console.error('Failed to fetch stations:', e);
    }
  }, []);

  useEffect(() => {
    fetchStations();
    const id = setInterval(fetchStations, POLL_MS);
    return () => clearInterval(id);
  }, [fetchStations]);

  function applyPageSize(val) {
    setPageSize(val);
    if (val !== 'all') {
      const n = Number(val);
      setPickedIdxs(stations.slice(0, n).map((s) => s.idx));
    }
  }

  useEffect(() => {
    if (pageSize !== 'all' && pickedIdxs.length === 0 && stations.length > 0) {
      setPickedIdxs(stations.slice(0, Number(pageSize)).map((s) => s.idx));
    }
  }, [stations, pageSize, pickedIdxs.length]);

  const limit = pageSize === 'all' ? stations.length : Number(pageSize);
  const visible = pageSize === 'all'
    ? stations
    : stations.filter((s) => pickedIdxs.includes(s.idx));

  const onlineCount = stations.filter((s) => s.online).length;

  const n = visible.length || 1;
  const viewAspect = window.innerWidth / (window.innerHeight - 80);
  let bestCols = 1, bestScore = Infinity;
  for (let c = 1; c <= n; c++) {
    const r = Math.ceil(n / c);
    const lastRow = n - (r - 1) * c;
    if (lastRow < Math.ceil(c / 2)) continue;
    const score = Math.abs((viewAspect * r) / c - 16 / 9);
    if (score < bestScore) { bestScore = score; bestCols = c; }
  }
  const cols = bestCols;
  const rows = Math.ceil(n / cols);
  const sizeTier = visible.length <= 4 ? 'medium' : 'thumb';

  return (
    <div className={`app${light ? ' light' : ''}`}>
      <header className="app-header">
        <h1>Classroom Monitor</h1>
        <div className="header-controls">
          <button className="theme-btn" onClick={() => setLight((v) => !v)}>
            {light ? '🌙 Dark' : '☀️ Light'}
          </button>
          <button className="theme-btn" onClick={() => setShowSettings(true)}>
            ⚙ Settings
          </button>
          <label className="page-size-label">
            View:
            <select
              value={pageSize}
              onChange={(e) => applyPageSize(e.target.value)}
              className="page-size-select"
            >
              {PAGE_SIZE_OPTIONS.filter((n) => n <= stations.length).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
              <option value="all">All ({stations.length})</option>
            </select>
          </label>
        </div>
        <span className="status-summary">{onlineCount}/{stations.length} online</span>
      </header>

      {pageSize !== 'all' && (
        <StationPicker
          stations={stations}
          pickedIdxs={pickedIdxs}
          limit={limit}
          onChange={setPickedIdxs}
        />
      )}

      <main
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
        }}
      >
        {visible.map((s) => (
          <StationTile key={s.idx} station={s} onSelect={setSelected} sizeTier={sizeTier} />
        ))}
      </main>

      <FullscreenModal station={selected} onClose={() => setSelected(null)} />

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onSaved={fetchStations}
        />
      )}
    </div>
  );
}
