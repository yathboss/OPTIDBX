import React from 'react';
import { Lock, Download } from 'lucide-react';
import { PAGES, routeHref } from '../navigation.mjs';
import ConnectionStatusBadge from './ConnectionStatusBadge';

const HIDDEN_TABS = new Set(['algorithm']);
const TABS = Object.entries(PAGES)
  .filter(([key]) => !HIDDEN_TABS.has(key))
  .map(([key, page]) => [key, page.label]);

export default function Header({ activeTab, isLive, isWaiting, telemetryAvailable, locked, onOpenExport, pingMs }) {
  const connection = !isLive
    ? { cls: 'badge-rose', dot: 'var(--accent-rose)', text: 'Backend offline' }
    : (isWaiting || !telemetryAvailable)
      ? { cls: 'badge-amber', dot: 'var(--accent-amber)', text: 'Standing by' }
      : { cls: 'badge-green', dot: 'var(--accent-blue)', text: 'Telemetry live' };

  return (
    <header className="app-header">
      <div className="header-left">
        <div className="logo-icon"><span>O</span></div>
        <div>
          <h1 className="brand-title">OptiDBX</h1>
          <p className="brand-subtitle">Understand. Tune. Verify.</p>
        </div>

        <nav className="nav-tabs" aria-label="Main navigation">
          {TABS.map(([key, label]) => (
            <a
              key={key}
              href={routeHref(key)}
              className={`nav-tab ${activeTab === key ? 'active' : ''}`}
              aria-current={activeTab === key ? 'page' : undefined}
              aria-disabled={locked && activeTab !== key || undefined}
              title={locked && activeTab !== key ? 'Navigation is locked while a session runs' : undefined}
              onClick={event => {if(locked && activeTab !== key) event.preventDefault();}}
            >
              {label}
            </a>
          ))}
        </nav>
      </div>

      <div className="header-right">
        {onOpenExport && (
          <button
            className="action-btn"
            onClick={onOpenExport}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              fontSize: '0.8rem',
              fontWeight: 500,
              cursor: 'pointer',
              background: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              color: 'var(--accent-blue, #38bdf8)',
              borderRadius: '6px',
            }}
          >
            <Download size={14} />
            Export Data
          </button>
        )}
        {locked && <div className="badge badge-amber"><Lock size={12} /> Session running</div>}
        <div className="badge badge-blue">Safe V1</div>
        <ConnectionStatusBadge
          isLive={isLive}
          isWaiting={isWaiting}
          telemetryAvailable={telemetryAvailable}
          pingMs={pingMs}
        />
      </div>
    </header>
  );
}
