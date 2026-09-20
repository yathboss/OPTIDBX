import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Clock,
  ShieldCheck,
} from 'lucide-react';
import Header from './components/Header';
import TopSummary from './components/TopSummary';
import WorkloadPanel from './components/WorkloadPanel';
import ActionControls from './components/ActionControls';
import MetricCard from './components/MetricCard';
import AutotunerPanel from './components/AutotunerPanel';
import TimeSeriesChart from './components/TimeSeriesChart';
import BeforeAfterCard from './components/BeforeAfterCard';
import TuningHistoryTable from './components/TuningHistoryTable';
import EvaluationView from './components/EvaluationView';
import PerformanceEvidence from './components/PerformanceEvidence';
import { api } from './services/api';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [metrics, setMetrics] = useState(null);
  const [history, setHistory] = useState([]);
  const [tunerStatus, setTunerStatus] = useState(null);
  const [workloadStatus, setWorkloadStatus] = useState(null);
  const [tuningHistory, setTuningHistory] = useState([]);
  const [experiments, setExperiments] = useState([]);
  const [isLive, setIsLive] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [experimentError, setExperimentError] = useState(null);
  const fetching = useRef(false);
  const mutating = useRef(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // Helper to format byte counts into MB
  const formatBytesToMB = (bytes) => {
    if (bytes === null || bytes === undefined) return null;
    return (Number(bytes) / (1024 * 1024)).toFixed(1);
  };

  // 5-second Polling fetch function (Task 8)
  const fetchData = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    setIsRefreshing(true);
    try {
      const [currRes, histRes, tunerRes, workRes, tuneHistRes, expRes] = await Promise.all([
        api.getCurrentMetrics(),
        api.getMetricsHistory(20),
        api.getTunerStatus(),
        api.getWorkloadStatus(),
        api.getTuningHistory(),
        api.getExperiments(),
      ]);

      // Handle Current Metrics
      if (currRes.status === 200 && currRes.data) {
        setMetrics(currRes.data);
        setIsWaiting(false);
        setIsLive(true);
      } else if (currRes.status === 503 || currRes.isWaiting) {
        setMetrics(null);
        setIsWaiting(true);
        setIsLive(true);
      } else {
        setMetrics(null);
        setIsLive(currRes.isLive);
      }

      // Handle History Points
      if (histRes?.data && Array.isArray(histRes.data)) {
        setHistory(histRes.data);
      }

      // Handle Autotuner Status
      setTunerStatus(tunerRes?.data || null);

      // Handle Workload Status
      setWorkloadStatus(workRes?.data || null);

      // Handle Tuning History
      if (tuneHistRes?.data && Array.isArray(tuneHistRes.data)) {
        setTuningHistory(tuneHistRes.data);
      }

      // Handle Experiments
      if (expRes?.data && Array.isArray(expRes.data)) {
        setExperiments(expRes.data);
      }

      setExperimentError(expRes.status === 200 ? null : expRes.message);
      setLastUpdated(new Date());
      setErrorMessage(currRes.status === 0 ? currRes.message
        : tunerRes.status !== 200 ? tunerRes.message
        : workRes.status !== 200 ? workRes.message
        : tuneHistRes.status !== 200 ? tuneHistRes.message
        : histRes.status !== 200 ? histRes.message : null);
    } catch (err) {
      console.warn('Dashboard fetch error:', err);
      setIsLive(false);
      setErrorMessage('Failed to connect to backend server.');
    } finally {
      fetching.current = false;
      setIsRefreshing(false);
    }
  }, []);

  // Set up 5-second polling interval
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const mutate = async operation => {
    if (mutating.current) return;
    mutating.current = true;
    setPending(true);
    setActionError(null);
    try {
      const result = await operation();
      if (result.status !== 200) setActionError(typeof result.message === 'string' ? result.message : JSON.stringify(result.message));
      await fetchData();
    } finally {
      mutating.current = false;
      setPending(false);
    }
  };

  const os = metrics?.os || {};
  const db = metrics?.db || {};
  const telemetryAvailable = Boolean(tunerStatus?.telemetry_available);
  const comparisonActive = Boolean(workloadStatus?.benchmark_id);

  return (
    <div className="app-container">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isLive={isLive}
        isWaiting={isWaiting}
        telemetryAvailable={telemetryAvailable}
      />

      <main className="main-content">
        {comparisonActive && <div className="alert-banner alert-warning" role="status">
          <span><strong>A comparison controls this workload.</strong> Manual workload and tuning controls are paused until it finishes or you cancel it.</span>
          <button className="btn btn-secondary" onClick={() => setActiveTab('evidence')}>View comparison</button>
          <button className="btn btn-danger" disabled={pending} onClick={() => mutate(api.cancelBenchmark)}>Cancel active comparison</button>
        </div>}
        {(actionError || errorMessage) && <div className="alert-banner alert-danger" role="alert">{actionError || errorMessage}</div>}
        {tunerStatus?.last_error && <div className="alert-banner alert-warning" role="alert">{tunerStatus.last_error}</div>}
        {/* Offline / Warning Alerts (Task 25) */}
        {!isLive && (
          <div className="alert-banner alert-danger">
            <AlertCircle size={18} />
            <span>
              <strong>Backend Offline:</strong> FastAPI is not responding on <code>http://localhost:8000</code>. Run <code>uvicorn backend.main:app --port 8000</code> to start the live telemetry engine.
            </span>
          </div>
        )}

        {isLive && isWaiting && (
          <div className="alert-banner alert-warning">
            <Clock size={18} />
            <span>
              <strong>{tunerStatus?.running ? 'Waiting for Real Telemetry: ' : 'Telemetry paused: '}</strong>
              {tunerStatus?.running ? 'Collectors are warming up or waiting for a valid paired interval.' : 'Start a workload or the telemetry loop to collect new samples.'}
            </span>
          </div>
        )}

        {/* Action Controls Bar (Tasks 15, 16, 17) */}
        <ActionControls
          tunerStatus={tunerStatus}
          onToggleMonitoring={active => mutate(() => api.toggleMonitoring(active))}
          pending={pending}
          controlsLocked={comparisonActive}
          onMode={mode => mutate(() => api.setTunerMode(mode))}
          onApprove={id => mutate(() => api.approve(id))}
          onRollback={id => mutate(() => api.rollback(id))}
          onManualRefresh={fetchData}
          lastUpdated={lastUpdated}
          isRefreshing={isRefreshing}
        />

        {/* Top Summary Bar */}
        <TopSummary tunerStatus={tunerStatus} workloadStatus={workloadStatus} />

        {/* Workload Status Panel (Task 12) */}
        <WorkloadPanel workloadStatus={workloadStatus} pending={pending}
          canStart={!!workloadStatus && !!tunerStatus && !comparisonActive && !tunerStatus.recovery_required && !tunerStatus.cooldown_remaining_seconds}
          onStart={(profile, duration) => mutate(() => api.startWorkload(profile, duration))}
          onStop={() => mutate(() => api.stopWorkload())} />

        {/* VIEW 1: MAIN DASHBOARD */}
        {activeTab === 'evidence' && <PerformanceEvidence />}
        {activeTab === 'dashboard' && (
          <>
            {/* OS Metrics Grid (Task 9 & 26) */}
            <div className="section-title">
              <Cpu size={18} color="var(--accent-blue)" />
              Operating System Telemetry
            </div>
            <div className="metric-cards-grid">
              <MetricCard
                title="CPU Utilization"
                value={os.cpu_percent !== undefined ? `${os.cpu_percent}` : null}
                unit="%"
                icon={Cpu}
                status={os.cpu_percent > 85 ? 'critical' : os.cpu_percent > 70 ? 'warning' : 'normal'}
                subtitle="All Cores (WSL2)"
                isWaiting={isWaiting}
              />
              <MetricCard
                title="RAM Usage"
                value={os.memory_percent !== undefined ? `${os.memory_percent}` : null}
                unit="%"
                icon={Gauge}
                status={os.memory_percent > 85 ? 'warning' : 'normal'}
                subtitle="System Memory"
                isWaiting={isWaiting}
              />
              <MetricCard
                title="Disk Read"
                value={formatBytesToMB(os.disk_read_bytes)}
                unit="MB / interval"
                icon={HardDrive}
                subtitle="Window Read I/O"
                isWaiting={isWaiting}
              />
              <MetricCard
                title="Disk Write"
                value={formatBytesToMB(os.disk_write_bytes)}
                unit="MB / interval"
                icon={HardDrive}
                subtitle="Window Write I/O"
                isWaiting={isWaiting}
              />
              <MetricCard
                title="Context Switches"
                value={os.context_switches !== undefined ? Number(os.context_switches).toLocaleString() : null}
                unit="/ interval"
                icon={Activity}
                status={os.context_switches > 3000 ? 'warning' : 'normal'}
                subtitle="OS Scheduler Events"
                isWaiting={isWaiting}
              />
            </div>

            {/* DBMS Metrics Grid (Task 10 & 26) */}
            <div className="section-title">
              <Database size={18} color="var(--accent-cyan)" />
              PostgreSQL Telemetry
            </div>
            <div className="metric-cards-grid">
              <MetricCard
                title="Query Latency"
                value={db.query_latency_ms !== undefined ? Number(db.query_latency_ms).toFixed(1) : null}
                unit="ms"
                icon={Zap}
                status={db.query_latency_ms > 200 ? 'critical' : 'normal'}
                subtitle="Mean Response Time"
                isWaiting={isWaiting}
              />
              <MetricCard
                title="Throughput"
                value={db.throughput_tps !== undefined ? Number(db.throughput_tps).toFixed(1) : null}
                unit="TPS"
                icon={Activity}
                subtitle="Transactions / Sec"
                isWaiting={isWaiting}
              />
              <MetricCard
                title="Temp File Spill"
                value={formatBytesToMB(db.temp_files_bytes)}
                unit="MB"
                icon={FileCode2}
                status={db.temp_files_bytes > 0 ? 'warning' : 'normal'}
                subtitle="work_mem Spills to Disk"
                isWaiting={isWaiting}
              />
              <MetricCard
                title="Active Workers"
                value={db.active_workers !== undefined ? db.active_workers : null}
                unit="parallel workers"
                icon={Users}
                status={db.active_workers >= 4 ? 'warning' : 'normal'}
                subtitle="Parallel Gather Processes"
                isWaiting={isWaiting}
              />
            </div>

            {/* Autotuner Status Panel (Tasks 13, 14, 15, 27) */}
            <AutotunerPanel tunerStatus={tunerStatus} />

            {/* Live Time-Series Chart (Task 11) */}
            <TimeSeriesChart historyData={history} />

            {/* Before / After Evaluation Card (Task 19 - Truthful Phase 2 State) */}
            <div className="section-title">
              <Layers size={18} color="var(--accent-green)" />
              30-Second Observation & Decision Loop
            </div>
            <BeforeAfterCard action={tunerStatus?.active_action} />
          </>
        )}

        {/* VIEW 2: TELEMETRY TRENDS */}
        {activeTab === 'metrics' && (
          <div>
            <div className="section-title">
              <Activity size={18} color="var(--accent-blue)" />
              Real-Time Telemetry Visualizer (4 Metrics)
            </div>
            <TimeSeriesChart historyData={history} />
          </div>
        )}

        {/* VIEW 3: TUNING HISTORY */}
        {activeTab === 'tuning' && (
          <div>
            <div className="section-title">
              <Layers size={18} color="var(--accent-green)" />
              Tuning Recommendations History (PostgreSQL <code>tuning_actions</code>)
            </div>
            <TuningHistoryTable history={tuningHistory} />
          </div>
        )}

        {/* VIEW 4: EVALUATION & BENCHMARKS (Tasks 20, 21, 29) */}
        {activeTab === 'experiments' && (
          <EvaluationView experiments={experiments} error={experimentError} />
        )}
      </main>

      <footer className="app-footer">
        <div>
          <strong>OptiDBX Safe V1</strong> - Local PostgreSQL tuning and evaluation
        </div>
        <div>
          Polling: 5s | API Port: 8000 | Frontend: 3000 | Mode: {tunerStatus?.mode || 'Unavailable'}
        </div>
      </footer>
    </div>
  );
}
