import React from 'react';
import { LayoutDashboard, LineChart, History, FlaskConical, Download } from 'lucide-react';
import ConnectionStatusBadge from './ConnectionStatusBadge';

export default function Header({ activeTab, setActiveTab, isLive, isWaiting, telemetryAvailable, onOpenExport, pingMs }) {

  return (
    <header className="app-header">
      <div className="header-left">
        <div className="logo-icon">
          <span>O</span>
        </div>
        <div>
          <h1 className="brand-title">OptiDBX</h1>
          <p className="brand-subtitle">Adaptive OS–DBMS Co-Tuning System</p>
        </div>

        <nav className="nav-tabs">
          <button className={`nav-tab ${activeTab === 'evidence' ? 'active' : ''}`}
            onClick={() => setActiveTab('evidence')}>
            <FlaskConical size={16} /> Performance Evidence
          </button>
          <button
            className={`nav-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <LayoutDashboard size={16} />
            Live Dashboard
          </button>
          <button
            className={`nav-tab ${activeTab === 'metrics' ? 'active' : ''}`}
            onClick={() => setActiveTab('metrics')}
          >
            <LineChart size={16} />
            Telemetry Trends
          </button>
          <button
            className={`nav-tab ${activeTab === 'tuning' ? 'active' : ''}`}
            onClick={() => setActiveTab('tuning')}
          >
            <History size={16} />
            Tuning Recommendations
          </button>
          <button
            className={`nav-tab ${activeTab === 'experiments' ? 'active' : ''}`}
            onClick={() => setActiveTab('experiments')}
          >
            <FlaskConical size={16} />
            Evaluation & Benchmarks
          </button>
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
        <div className="badge badge-blue">
          Safe V1
        </div>
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
