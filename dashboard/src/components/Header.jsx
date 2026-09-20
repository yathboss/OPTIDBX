import React from 'react';

export default function Header({ activeTab, setActiveTab, isLive, isWaiting, telemetryAvailable }) {
  const getConnectionBadge = () => {
    if (!isLive) {
      return (
        <div className="badge badge-rose">
          <span className="pulse-indicator" style={{ backgroundColor: 'var(--accent-rose)' }} />
          Backend Offline (Port 8000)
        </div>
      );
    }
    if (isWaiting || !telemetryAvailable) {
      return (
        <div className="badge badge-amber">
          <span className="pulse-indicator" style={{ backgroundColor: 'var(--accent-amber)' }} />
          Waiting for Telemetry
        </div>
      );
    }
    return (
      <div className="badge badge-green">
        <span className="pulse-indicator" style={{ backgroundColor: 'var(--accent-green)' }} />
        Live Telemetry Active
      </div>
    );
  };

  return (
    <header className="app-header">
      <div className="header-left">
        <div className="logo-icon">
          <span>O</span>
        </div>
        <div>
          <h1 className="brand-title">OptiDBX</h1>
          <p className="brand-subtitle">Understand. Tune. Verify.</p>
        </div>

        <nav className="nav-tabs" aria-label="Main navigation">
          {[['demo','Demo'],['dashboard','Live Metrics'],['tuning','Recommendations'],['experiments','Results & Reports']].map(([key,label]) =>
            <button key={key} className={`nav-tab ${(activeTab === key || key === 'experiments' && activeTab === 'evidence') ? 'active' : ''}`} aria-current={activeTab === key ? 'page' : undefined} onClick={() => setActiveTab(key)}>{label}</button>)}
        </nav>
      </div>

      <div className="header-right">
        <div className="badge badge-blue">
          Safe V1
        </div>
        {getConnectionBadge()}
      </div>
    </header>
  );
}
