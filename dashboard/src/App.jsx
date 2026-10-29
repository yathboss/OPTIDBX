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
  Sparkles,
} from 'lucide-react';
import Header from './components/Header';
import AmbientBackground from './components/AmbientBackground';
import Welcome from './components/Welcome';
import HomeView from './components/HomeView';
import LiveSessionView from './components/LiveSessionView';
import LiveMetricsModal from './components/LiveMetricsModal';
import ResultsHistory from './components/ResultsHistory';
import SessionRunner from './components/SessionRunner';
import ScenarioGallery from './components/ScenarioGallery';
import PerformanceEvidence from './components/PerformanceEvidence';
import SystemView from './components/SystemView';
import AlgorithmView from './components/AlgorithmView';
import ErrorBoundary from './components/ErrorBoundary';
import TopSummary from './components/TopSummary';
import WorkloadPanel from './components/WorkloadPanel';
import ActionControls from './components/ActionControls';
import MetricCard from './components/MetricCard';
import AutotunerPanel from './components/AutotunerPanel';
import TimeSeriesChart from './components/TimeSeriesChart';
import BeforeAfterCard from './components/BeforeAfterCard';
import TuningHistoryTable from './components/TuningHistoryTable';
import EvaluationView from './components/EvaluationView';
import MemorySafetyPanel from './components/MemorySafetyPanel';
import ExportModal from './components/ExportModal';
import ShortcutsModal from './components/ShortcutsModal';
import { PAGES, resolveRoute, routeHref } from './navigation.mjs';
import { useNotify, useNotice } from './components/Notifications';
import { scenarioById } from './scenarios.mjs';
import { recordSession } from './sessionHistory.mjs';
import { api } from './services/api';
import { formatBytesToMB } from './utils/formatters.mjs';

export default function App() {
  const [route, setRoute] = useState(() => resolveRoute(window.location.hash));
  const mainRef = useRef(null);
  const navigate = (page, id) => { window.location.hash = routeHref(page, id); };
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState('ALL');

  const [entered, setEntered] = useState(() => {
    try { return sessionStorage.getItem('optidbx_entered') === '1'; } catch { return false; }
  });
  const enterApp = useCallback(() => {
    try { sessionStorage.setItem('optidbx_entered', '1'); } catch { /* ignore */ }
    setEntered(true);
  }, []);

  const [metrics, setMetrics] = useState(null);
  const [history, setHistory] = useState([]);
  const [tunerStatus, setTunerStatus] = useState(null);
  const [workloadStatus, setWorkloadStatus] = useState(null);
  const [tuningHistory, setTuningHistory] = useState([]);
  const [experiments, setExperiments] = useState([]);
  const [trace, setTrace] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [experimentError, setExperimentError] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const fetching = useRef(false);
  const mutating = useRef(false);

  const notify = useNotify();
  useNotice(actionError || errorMessage);
  useNotice(tunerStatus?.last_error);
  useNotice(workloadStatus?.error);

  const previousState = useRef(null);
  useEffect(() => {
    const state = tunerStatus?.state;
    if (state && previousState.current && state !== previousState.current) {
      notify(`Tuning stage: ${state.replaceAll('_', ' ')}`, state === 'ROLLBACK_FAILED' ? 'error' : 'info');
    }
    if (state) previousState.current = state;
  }, [tunerStatus?.state, notify]);

  // 5-second Polling fetch function
  const fetchData = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    setIsRefreshing(true);
    try {
      const [currRes, histRes, tunerRes, workRes, expRes, traceRes, tuneHistRes] = await Promise.all([
        api.getCurrentMetrics(),
        api.getMetricsHistory(20),
        api.getTunerStatus(),
        api.getWorkloadStatus(),
        api.getExperiments(),
        api.getDecisionTrace ? api.getDecisionTrace(30) : Promise.resolve({ status: 200, data: null }),
        api.getTuningHistory ? api.getTuningHistory(50) : Promise.resolve({ status: 200, data: [] }),
      ]);

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

      if (Array.isArray(histRes?.data)) setHistory(histRes.data);
      setTunerStatus(tunerRes?.data || null);
      setWorkloadStatus(workRes?.data || null);
      if (Array.isArray(expRes?.data)) setExperiments(expRes.data);
      if (traceRes?.status === 200 && traceRes.data) setTrace(traceRes.data);
      if (Array.isArray(tuneHistRes?.data)) setTuningHistory(tuneHistRes.data);

      setExperimentError(expRes.status === 200 ? null : expRes.message);
      setLastUpdated(new Date());
      setErrorMessage(currRes.status === 0 ? currRes.message : null);
    } catch {
      setIsLive(false);
      setErrorMessage('Failed to connect to the backend server.');
    } finally {
      fetching.current = false;
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Global hotkeys for evaluation presentation and quick navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) return;
      if (e.key === '1') navigate('study');
      else if (e.key === '2') navigate('live');
      else if (e.key === '3') navigate('system');
      else if (e.key === '4') navigate('results');
      else if (e.key === '5') navigate('scenarios');
      else if (e.key === 'r' || e.key === 'R') fetchData();
      else if (e.key === 'e' || e.key === 'E') setIsExportOpen(prev => !prev);
      else if (e.key === '?') setIsShortcutsOpen(prev => !prev);
      else if (e.key === 'Escape') {
        setIsExportOpen(false);
        setIsShortcutsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fetchData]);

  const mutate = async (operation, success) => {
    if (mutating.current) return;
    mutating.current = true;
    setPending(true);
    setActionError(null);
    try {
      const result = await operation();
      if (result.status !== 200) setActionError(typeof result.message === 'string' ? result.message : JSON.stringify(result.message));
      else if (success) notify(success, 'success');
      await fetchData();
      return result;
    } catch (error) {
      setActionError(error.message || 'Request failed.');
    } finally {
      mutating.current = false;
      setPending(false);
    }
  };

  const sessionLocked = Boolean(workloadStatus?.running);
  const comparisonActive = Boolean(workloadStatus?.benchmark_id);
  const scenario = route.page === 'scenario' ? scenarioById(route.scenarioId) : null;
  const activeTab = route.page === 'scenario' ? 'scenarios' : route.page;
  const livePage = route.page === 'live' || scenario?.kind === 'live';
  const missingPage = route.page === 'not-found' || (route.page === 'scenario' && !scenario);

  useEffect(() => {
    const update = () => setRoute(resolveRoute(window.location.hash));
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);

  useEffect(() => {
    document.title = `${missingPage ? 'Page not found' : scenario?.title || PAGES[route.page]?.label || 'OptiDBX'} | OptiDBX`;
    window.scrollTo({ top: 0, behavior: 'auto' });
    mainRef.current?.focus({ preventScroll: true });
  }, [route, scenario, missingPage]);

  const handleComplete = useCallback(({ session, outcome }) => {
    if (session.kind === 'live') {
      notify(`Session complete: ${outcome.headline}`, 'success');
      return;
    }
    recordSession({
      scenarioId: session.id,
      title: session.title,
      subtitle: session.subtitle,
      category: session.category,
      outcome,
    });
  }, [notify]);

  const os = metrics?.os || {};
  const db = metrics?.db || {};

  return (
    <div className="app-container">
      <AmbientBackground />
      <Header
        activeTab={activeTab}
        isLive={isLive}
        isWaiting={isWaiting}
        telemetryAvailable={Boolean(tunerStatus?.telemetry_available)}
        locked={sessionLocked}
        onOpenExport={() => setIsExportOpen(true)}
      />

      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        history={history}
        tuningHistory={tuningHistory}
      />

      <ShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />

      <main className="main-content" ref={mainRef} tabIndex={-1}>
        {sessionLocked && !comparisonActive && !livePage && (
          <div className="alert-banner alert-warning" role="status">
            <span>A live workload is still running. Changing pages does not stop it.</span>
            <a className="btn-secondary" href={routeHref('live')}>Return to live session</a>
          </div>
        )}
        {comparisonActive && (
          <div className="alert-banner alert-warning" role="status">
            <span><strong>A paired comparison controls this workload.</strong> Session controls are paused until it finishes.</span>
            <button className="btn btn-danger" disabled={pending} onClick={() => mutate(api.cancelBenchmark, 'Comparison cancelled.')}>Cancel comparison</button>
          </div>
        )}

        {/* Auto Mode Notification Banner */}
        {tunerStatus?.mode === 'auto' && ['BOTTLENECK_CONFIRMED', 'ACTION_APPLIED', 'OBSERVING', 'COOLDOWN'].includes(tunerStatus?.state) && (
          <div
            className="alert-banner alert-warning"
            style={{
              background: 'rgba(168, 85, 247, 0.15)',
              borderColor: 'rgba(168, 85, 247, 0.4)',
              color: '#d8b4fe',
            }}
          >
            <Sparkles size={18} color="#a855f7" />
            <span>
              <strong>Auto-Tuning Active:</strong>{' '}
              {tunerStatus.state === 'BOTTLENECK_CONFIRMED'
                ? 'Confirmed bottleneck detected. Applying safe tuning action automatically...'
                : tunerStatus.state === 'ACTION_APPLIED'
                ? `Tuning action applied (${tunerStatus.active_action?.action?.parameter}: ${tunerStatus.active_action?.action?.old_value} -> ${tunerStatus.active_action?.action?.new_value}). Entering 30s observation.`
                : tunerStatus.state === 'OBSERVING'
                ? `Observing workload under tuned configuration (${tunerStatus.observation_remaining_seconds}s remaining).`
                : tunerStatus.state === 'COOLDOWN'
                ? `Tuning cycle evaluated (${tunerStatus.active_action?.state}). In 30s safety cooldown (${tunerStatus.cooldown_remaining_seconds}s remaining).`
                : 'Autonomous tuning engine running.'}
            </span>
          </div>
        )}

        <ErrorBoundary resetKey={route.page + (route.scenarioId || '')}>
          {route.page === 'home' && (
            <div className="studio">
              <HomeView
                onExploreScenarios={() => navigate('scenarios')}
                onStartLive={() => navigate('live')}
              />
            </div>
          )}

          {route.page === 'scenarios' && (
            <div className="studio page-scenarios">
              <ScenarioGallery />
            </div>
          )}

          {scenario && (
            <nav className="page-breadcrumb" aria-label="Breadcrumb">
              <a href={routeHref('scenarios')}>Scenarios</a>
              <span aria-hidden="true">/</span>
              <span aria-current="page">{scenario.title}</span>
            </nav>
          )}

          {scenario?.kind === 'scripted' && (
            <div className="studio">
              <SessionRunner
                key={scenario.id}
                session={scenario}
                onExit={() => navigate('scenarios')}
                onComplete={handleComplete}
              />
            </div>
          )}

          {livePage && (
            <div className="studio">
              <LiveSessionView
                metrics={metrics}
                history={history}
                tunerStatus={tunerStatus}
                workloadStatus={workloadStatus}
                trace={trace}
                pending={pending}
                locked={comparisonActive}
                onOpenMetrics={() => setMetricsOpen(true)}
                onComplete={handleComplete}
                onStart={(options) => mutate(async () => {
                  const mode = await api.setTunerMode('recommendation');
                  if (mode.status !== 200) return mode;
                  return api.startWorkload({
                    profile: options.profile,
                    duration_seconds: options.duration,
                    workload_type: options.workloadType,
                    initial_parallelism: options.initialParallelism,
                    initial_work_mem_mb: options.initialWorkMemMb,
                  });
                }, 'Live session started.')}
                onStop={() => mutate(api.stopWorkload, 'Session stopped.')}
              />
            </div>
          )}

          {route.page === 'algorithm' && (
            <div className="studio">
              <AlgorithmView trace={trace} />
            </div>
          )}

          {route.page === 'system' && (
            <div className="studio">
              <SystemView />
            </div>
          )}

          {route.page === 'results' && (
            <div className="studio">
              <ResultsHistory experiments={experiments} error={experimentError} />
            </div>
          )}

          {route.page === 'study' && (
            <section className="studio study-page" aria-labelledby="study-title">
              <p className="section-eyebrow">Performance Study</p>
              <h2 id="study-title" className="section-heading">Compare baseline and tuned performance</h2>
              <p className="section-sub">Configure a paired study, follow its progress, and inspect the evidence on this dedicated page.</p>
              <PerformanceEvidence />
            </section>
          )}

          {missingPage && (
            <section className="studio empty-state">
              <h2>Page not found</h2>
              <p>This page or scenario does not exist.</p>
              <a className="btn-primary" href={routeHref('scenarios')}>Browse scenarios</a>
            </section>
          )}

          {/* Advanced Controls & Live Status Dropdown for Full Direct Tuning Control */}
          <details className="advanced-controls" style={{ marginTop: '2rem' }}>
            <summary style={{ cursor: 'pointer', padding: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Advanced controls & live status
            </summary>

            <ActionControls
              tunerStatus={tunerStatus}
              onToggleMonitoring={(active) => mutate(() => api.toggleMonitoring(active))}
              pending={pending}
              controlsLocked={comparisonActive}
              onMode={(mode) => mutate(() => api.setTunerMode(mode))}
              onApprove={(id) => mutate(() => api.approve(id))}
              onRollback={(id) => mutate(() => api.rollback(id))}
              onManualRefresh={fetchData}
              lastUpdated={lastUpdated}
              isRefreshing={isRefreshing}
            />

            <TopSummary tunerStatus={tunerStatus} workloadStatus={workloadStatus} />

            <WorkloadPanel
              workloadStatus={workloadStatus}
              pending={pending}
              canStart={!!workloadStatus && !!tunerStatus && !comparisonActive && !tunerStatus.recovery_required && !tunerStatus.cooldown_remaining_seconds}
              onStart={(profile, duration) => mutate(() => api.startWorkload(profile, duration))}
              onStop={() => mutate(() => api.stopWorkload())}
            />

            {/* Interactive Demonstration Scenarios Filter */}
            <div style={{ display: 'flex', gap: '0.75rem', margin: '1.25rem 0', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Demonstration Scenarios:
              </span>
              <button
                className={`action-btn ${selectedScenario === 'CPU_PARALLELISM' ? 'primary' : 'secondary'}`}
                onClick={() => setSelectedScenario(selectedScenario === 'CPU_PARALLELISM' ? 'ALL' : 'CPU_PARALLELISM')}
              >
                Scenario 1: CPU Contention (workers 8 -&gt; 6)
              </button>
              <button
                className={`action-btn ${selectedScenario === 'WORK_MEM_SPILL' ? 'primary' : 'secondary'}`}
                onClick={() => setSelectedScenario(selectedScenario === 'WORK_MEM_SPILL' ? 'ALL' : 'WORK_MEM_SPILL')}
              >
                Scenario 2: Temp Spill (work_mem 8MB -&gt; 16MB)
              </button>
              {selectedScenario !== 'ALL' && (
                <button
                  className="action-btn secondary"
                  onClick={() => setSelectedScenario('ALL')}
                  style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                >
                  Clear Filter
                </button>
              )}
            </div>

            {/* OS Metrics Grid */}
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
                tooltip="Aggregate CPU core utilization. Values > 85% indicate potential contention."
              />
              <MetricCard
                title="RAM Usage"
                value={os.memory_percent !== undefined ? `${os.memory_percent}` : null}
                unit="%"
                icon={Gauge}
                status={os.memory_percent > 85 ? 'warning' : 'normal'}
                subtitle="System Memory"
                isWaiting={isWaiting}
                tooltip="Host physical RAM utilization percentage. Guardrail threshold at 85%."
              />
              <MetricCard
                title="Disk Read"
                value={formatBytesToMB(os.disk_read_bytes)}
                unit="MB / interval"
                icon={HardDrive}
                subtitle="Window Read I/O"
                isWaiting={isWaiting}
                tooltip="Bytes read from storage during this 5-second interval."
              />
              <MetricCard
                title="Disk Write"
                value={formatBytesToMB(os.disk_write_bytes)}
                unit="MB / interval"
                icon={HardDrive}
                subtitle="Window Write I/O"
                isWaiting={isWaiting}
                tooltip="Bytes written to storage (WAL, checkpoints, and temp files) during this interval."
              />
              <MetricCard
                title="Context Switches"
                value={os.context_switches !== undefined ? Number(os.context_switches).toLocaleString() : null}
                unit="/ interval"
                icon={Activity}
                status={os.context_switches > 3000 ? 'warning' : 'normal'}
                subtitle="OS Scheduler Events"
                isWaiting={isWaiting}
                tooltip="Rate of involuntary and voluntary CPU thread context switches."
              />
            </div>

            {/* OS Memory Safety & work_mem Admission Control */}
            <MemorySafetyPanel memorySafety={tunerStatus?.memory_safety} osMetrics={os} />

            {/* DBMS Metrics Grid */}
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
                tooltip="Mean PostgreSQL query execution time. Lower is better."
              />
              <MetricCard
                title="Throughput"
                value={db.throughput_tps !== undefined ? Number(db.throughput_tps).toFixed(1) : null}
                unit="TPS"
                icon={Activity}
                subtitle="Transactions / Sec"
                isWaiting={isWaiting}
                tooltip="Total completed database transactions per second (TPS). Higher is better."
              />
              <MetricCard
                title="Temp File Spill"
                value={formatBytesToMB(db.temp_files_bytes)}
                unit="MB"
                icon={FileCode2}
                status={db.temp_files_bytes > 0 ? 'warning' : 'normal'}
                subtitle="work_mem Spills to Disk"
                isWaiting={isWaiting}
                tooltip="Temp bytes spilled to disk when sort or hash operations exceed work_mem. Zero is optimal."
              />
              <MetricCard
                title="Active Workers"
                value={db.active_workers !== undefined ? db.active_workers : null}
                unit="parallel workers"
                icon={Users}
                status={db.active_workers >= 4 ? 'warning' : 'normal'}
                subtitle="Parallel Gather Processes"
                isWaiting={isWaiting}
                tooltip="Current number of parallel worker processes executing PostgreSQL queries."
              />
            </div>

            {/* Autotuner Status Panel */}
            <AutotunerPanel tunerStatus={tunerStatus} />

            {/* Live Time-Series Chart */}
            <TimeSeriesChart historyData={history} />

            {/* 30-Second Observation & Decision Loop */}
            <div className="section-title">
              <Layers size={18} color="var(--accent-green)" />
              30-Second Observation & Decision Loop
            </div>
            <BeforeAfterCard action={tunerStatus?.active_action} />

            {/* Tuning History Table */}
            <div className="section-title">
              <Layers size={18} color="var(--accent-green)" />
              Tuning Recommendations History (PostgreSQL <code>tuning_actions</code>)
            </div>
            <TuningHistoryTable history={tuningHistory} />

            {/* Evaluation & Benchmarks View */}
            <EvaluationView experiments={experiments} error={experimentError} />
          </details>
        </ErrorBoundary>
      </main>

      <LiveMetricsModal
        open={metricsOpen}
        onClose={() => setMetricsOpen(false)}
        metrics={metrics}
        history={history}
        isWaiting={isWaiting}
      />

      <footer className="app-footer">
        <div><strong>OptiDBX</strong> — safe PostgreSQL auto-tuning</div>
        <div>Mode: {tunerStatus?.mode || 'Unavailable'} · Telemetry every 5s</div>
      </footer>

      {!entered && <Welcome onEnter={enterApp} />}
    </div>
  );
}
