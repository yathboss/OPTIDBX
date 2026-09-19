import React from 'react';
import { LayoutDashboard, LineChart, History, FlaskConical } from 'lucide-react';

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
          <p className="brand-subtitle">Adaptive OS–DBMS Co-Tuning System</p>
        </div>

        <nav className="nav-tabs">
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
        <div className="badge badge-blue">
          Safe V1
        </div>
        {getConnectionBadge()}
      </div>
    </header>
  );
}
