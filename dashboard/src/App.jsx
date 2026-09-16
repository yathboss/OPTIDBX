import React, { useState, useEffect, useCallback } from 'react';
import {
  Cpu,
  Database,
  HardDrive,
  Activity,
  Gauge,
  Zap,
  Layers,
  FileCode2,
  Users,
  AlertCircle,
} from 'lucide-react';
import Header from './components/Header';
import TopSummary from './components/TopSummary';
import ActionControls from './components/ActionControls';
import MetricCard from './components/MetricCard';
import AutotunerPanel from './components/AutotunerPanel';
import TimeSeriesChart from './components/TimeSeriesChart';
import BeforeAfterCard from './components/BeforeAfterCard';
import TuningHistoryTable from './components/TuningHistoryTable';
import ExperimentsView from './components/ExperimentsView';
import { api, FALLBACK_METRICS } from './services/api';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [metrics, setMetrics] = useState(FALLBACK_METRICS);
  const [history, setHistory] = useState([]);
  const [tunerStatus, setTunerStatus] = useState(null);
  const [tuningHistory, setTuningHistory] = useState([]);
  const [experiments, setExperiments] = useState([]);
  const [isLive, setIsLive] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [userNotification, setUserNotification] = useState(null);

  // Helper to format byte counts into MB
  const formatBytesToMB = (bytes) => {
    if (!bytes && bytes !== 0) return '0.0';
    return (bytes / (1024 * 1024)).toFixed(1);
  };

  // Fetch all dashboard data
  const fetchData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // Parallel requests to backend
      const [currRes, histRes, tunerRes, tuneHistRes, expRes] = await Promise.all([
        api.getCurrentMetrics(),
        api.getMetricsHistory(20),
        api.getTunerStatus(),
        api.getTuningHistory(),
        api.getExperiments(),
      ]);

      if (currRes?.data) setMetrics(currRes.data);
      if (histRes?.data && Array.isArray(histRes.data)) setHistory(histRes.data);
      if (tunerRes?.data) setTunerStatus(tunerRes.data);
      if (tuneHistRes?.data && Array.isArray(tuneHistRes.data)) setTuningHistory(tuneHistRes.data);
      if (expRes?.data && Array.isArray(expRes.data)) setExperiments(expRes.data);

      setIsLive(currRes?.isLive || false);
      setLastUpdated(new Date());
    } catch (err) {
      console.warn('Dashboard fetch error, using fallback:', err);
      setIsLive(false);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // 5-second polling loop matching telemetry interval
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Mode Switch Handler
  const handleModeChange = async (newMode) => {
    const res = await api.setTunerMode(newMode);
    if (res?.data) {
      setTunerStatus(res.data);
      showNotification(`Switched operating mode to ${newMode.toUpperCase()}`);
    }
  };

  // Start / Stop Monitoring Handler
  const handleToggleMonitoring = async (active) => {
    const res = await api.toggleMonitoring(active);
    if (res?.data) {
      setTunerStatus(res.data);
      showNotification(active ? 'Monitoring started' : 'Monitoring paused');
    }
  };

  // Manual Apply Recommendation Placeholder
  const handleApplyAction = () => {
    showNotification(
      `Applied recommendation: ${tunerStatus?.recommended_action || 'Safe parameter update'}`
    );
  };

  // Manual Rollback Placeholder
  const handleRollbackAction = () => {
    showNotification('Manual rollback triggered: restoring baseline configuration');
  };

  const showNotification = (msg) => {
    setUserNotification(msg);
    setTimeout(() => setUserNotification(null), 4000);
  };

  const os = metrics?.os || {};
  const db = metrics?.db || {};

  return (
    <div className="app-container">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isLive={isLive}
        tunerMode={tunerStatus?.mode}
      />

      <main className="main-content">
        {/* Notification Toast */}
        {userNotification && (
          <div className="alert-banner alert-warning" style={{ marginBottom: '1rem' }}>
            <AlertCircle size={16} />
            {userNotification}
          </div>
        )}

        {/* Action Controls Bar */}
        <ActionControls
          tunerStatus={tunerStatus}
          onModeChange={handleModeChange}
          onToggleMonitoring={handleToggleMonitoring}
          onApplyAction={handleApplyAction}
          onRollbackAction={handleRollbackAction}
          onManualRefresh={fetchData}
          lastUpdated={lastUpdated}
          isRefreshing={isRefreshing}
        />

        {/* Top Summary KPI Bar */}
        <TopSummary tunerStatus={tunerStatus} />

        {/* VIEW 1: MAIN DASHBOARD */}
        {activeTab === 'dashboard' && (
          <>
            {/* OS Metrics Grid */}
            <div className="section-title">
              <Cpu size={18} color="var(--accent-blue)" />
              Operating System Telemetry (Aryaman - Developer 3)
            </div>
            <div className="metric-cards-grid">
              <MetricCard
                title="CPU Utilization"
                value={os.cpu_percent}
                unit="%"
                icon={Cpu}
                trend="+4.2%"
                status={os.cpu_percent > 75 ? 'warning' : 'normal'}
                subtitle="All Cores (WSL2)"
              />
              <MetricCard
                title="RAM Usage"
                value={os.memory_percent}
                unit="%"
                icon={Gauge}
                status={os.memory_percent > 85 ? 'warning' : 'normal'}
                subtitle="System Memory"
              />
              <MetricCard
                title="Disk Read"
                value={formatBytesToMB(os.disk_read_bytes)}
                unit="MB"
                icon={HardDrive}
                subtitle="Window Read I/O"
              />
              <MetricCard
                title="Disk Write"
                value={formatBytesToMB(os.disk_write_bytes)}
                unit="MB"
                icon={HardDrive}
                subtitle="Window Write I/O"
              />
              <MetricCard
                title="Context Switches"
                value={os.context_switches ? os.context_switches.toLocaleString() : '--'}
                unit="/interval"
                icon={Activity}
                status={os.context_switches > 2000 ? 'warning' : 'normal'}
                subtitle="Scheduler Events"
              />
            </div>

            {/* DBMS Metrics Grid */}
            <div className="section-title">
              <Database size={18} color="var(--accent-cyan)" />
              PostgreSQL DBMS Telemetry (Kartikeya - Developer 2)
            </div>
            <div className="metric-cards-grid">
              <MetricCard
                title="Query Latency"
                value={db.query_latency_ms}
                unit="ms"
                icon={Zap}
                status={db.query_latency_ms > 200 ? 'warning' : 'normal'}
                subtitle="Mean Response Time"
              />
              <MetricCard
                title="Throughput"
                value={db.throughput_tps}
                unit="TPS"
                icon={Activity}
                subtitle="Queries Executed / Sec"
              />
              <MetricCard
                title="Temp File Spill"
                value={formatBytesToMB(db.temp_files_bytes)}
                unit="MB"
                icon={FileCode2}
                status={db.temp_files_bytes > 0 ? 'warning' : 'normal'}
                subtitle="work_mem Spills to Disk"
              />
              <MetricCard
                title="Active Workers"
                value={db.active_workers}
                unit="workers"
                icon={Users}
                subtitle="Parallel Gather Processes"
              />
            </div>

            {/* Autotuner Decision & Status Panel */}
            <AutotunerPanel tunerStatus={tunerStatus} />

            {/* Live Time-Series Chart */}
            <TimeSeriesChart historyData={history} />

            {/* Before vs After Observation View */}
            <div className="section-title">
              <Layers size={18} color="var(--accent-green)" />
              30-Second Observation & Decision Evaluation
            </div>
            <BeforeAfterCard
              before={{ latency: 250, throughput: 500, cpu: 84 }}
              after={{ latency: 180, throughput: 620, cpu: 68 }}
              decision="KEEP"
              parameter="max_parallel_workers_per_gather (8 → 4)"
            />
          </>
        )}

        {/* VIEW 2: TELEMETRY TRENDS */}
        {activeTab === 'metrics' && (
          <div>
            <div className="section-title">
              <Activity size={18} color="var(--accent-blue)" />
              Consolidated Telemetry Visualizer
            </div>
            <TimeSeriesChart historyData={history} />
          </div>
        )}

        {/* VIEW 3: TUNING HISTORY */}
        {activeTab === 'tuning' && (
          <div>
            <div className="section-title">
              <Layers size={18} color="var(--accent-green)" />
              Safe Tuning Parameter Actions History
            </div>
            <TuningHistoryTable history={tuningHistory} />
          </div>
        )}

        {/* VIEW 4: EXPERIMENTS & BENCHMARKS */}
        {activeTab === 'experiments' && (
          <ExperimentsView experiments={experiments} />
        )}
      </main>

      <footer className="app-footer">
        <div>
          <strong>OptiDBX</strong> Phase 1 — Developer 4: Shivansh Bhardwaj (Dashboard & Evaluation)
        </div>
        <div>
          Polling: 5s | API Port: 8000 | Frontend: 3000
        </div>
      </footer>
    </div>
  );
}

