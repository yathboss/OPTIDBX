import React from 'react';
import { Lock } from 'lucide-react';
import {PAGES, routeHref} from '../navigation.mjs';

// The algorithm visualization now lives inline inside a running session/scenario,
// so it is no longer a top-level tab. The `#/algorithm` route stays reachable as a
// secondary entry point, just off the main navigation.
const HIDDEN_TABS = new Set(['algorithm']);
const TABS = Object.entries(PAGES)
  .filter(([key]) => !HIDDEN_TABS.has(key))
  .map(([key, page]) => [key, page.label]);

export default function Header({ activeTab, isLive, isWaiting, telemetryAvailable, locked }) {
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
        {locked && <div className="badge badge-amber"><Lock size={12} /> Session running</div>}
        <div className={`badge ${connection.cls}`}>
          <span className="pulse-indicator" style={{ backgroundColor: connection.dot }} />
          {connection.text}
        </div>
      </div>
    </header>
  );
}
