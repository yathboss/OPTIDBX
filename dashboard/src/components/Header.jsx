import React from 'react';
import { Activity, LayoutDashboard, LineChart, History, FlaskConical, Server, Database } from 'lucide-react';

export default function Header({ activeTab, setActiveTab, isLive, tunerMode }) {
  return (
    <header className="app-header">
      <div className="header-left">
        <div className="logo-icon">
          <span>O</span>
        </div>
        <div>
          <h1 className="brand-title">OptiDBX</h1>
          <p className="brand-subtitle">Adaptive OS–DBMS Co-Tuner</p>
        </div>

        <nav className="nav-tabs">
          <button
            className={`nav-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <LayoutDashboard size={16} />
            Dashboard
          </button>
          <button
            className={`nav-tab ${activeTab === 'metrics' ? 'active' : ''}`}
            onClick={() => setActiveTab('metrics')}
          >
            <LineChart size={16} />
            Telemetry
          </button>
          <button
            className={`nav-tab ${activeTab === 'tuning' ? 'active' : ''}`}
            onClick={() => setActiveTab('tuning')}
          >
            <History size={16} />
            Tuning History
          </button>
          <button
            className={`nav-tab ${activeTab === 'experiments' ? 'active' : ''}`}
            onClick={() => setActiveTab('experiments')}
          >
            <FlaskConical size={16} />
            Experiments
          </button>
        </nav>
      </div>

      <div className="header-right">
        <div className="badge badge-purple">
          {tunerMode === 'auto' ? 'Auto-Tuning Active' : 'Recommendation Mode'}
        </div>
        <div className="badge" style={{ backgroundColor: isLive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)', color: isLive ? '#10b981' : '#f59e0b' }}>
          <span className="pulse-indicator" style={{ backgroundColor: isLive ? '#10b981' : '#f59e0b' }}></span>
          {isLive ? 'Backend Online (Port 8000)' : 'Using Mock Telemetry'}
        </div>
      </div>
    </header>
  );
}

