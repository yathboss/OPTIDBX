import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import {PAGES, resolveRoute, routeHref} from './navigation.mjs';
import { useNotify, useNotice } from './components/Notifications';
import { scenarioById } from './scenarios.mjs';
import { recordSession } from './sessionHistory.mjs';
import { api } from './services/api';

export default function App() {
  const [route, setRoute] = useState(() => resolveRoute(window.location.hash));
  const mainRef = useRef(null);
  const navigate = (page, id) => {window.location.hash = routeHref(page, id);};
  const [metricsOpen, setMetricsOpen] = useState(false);
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
  const [experiments, setExperiments] = useState([]);
  const [isLive, setIsLive] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
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

  const fetchData = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    try {
      const [currRes, histRes, tunerRes, workRes, expRes] = await Promise.all([
        api.getCurrentMetrics(), api.getMetricsHistory(20), api.getTunerStatus(),
        api.getWorkloadStatus(), api.getExperiments(),
      ]);

      if (currRes.status === 200 && currRes.data) {
        setMetrics(currRes.data); setIsWaiting(false); setIsLive(true);
      } else if (currRes.status === 503 || currRes.isWaiting) {
        setMetrics(null); setIsWaiting(true); setIsLive(true);
      } else {
        setMetrics(null); setIsLive(currRes.isLive);
      }

      if (Array.isArray(histRes?.data)) setHistory(histRes.data);
      setTunerStatus(tunerRes?.data || null);
      setWorkloadStatus(workRes?.data || null);
      if (Array.isArray(expRes?.data)) setExperiments(expRes.data);
      setExperimentError(expRes.status === 200 ? null : expRes.message);
      setErrorMessage(currRes.status === 0 ? currRes.message : null);
    } catch {
      setIsLive(false);
      setErrorMessage('Failed to connect to the backend server.');
    } finally {
      fetching.current = false;
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
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
    window.scrollTo({top:0,behavior:'auto'});
    mainRef.current?.focus({preventScroll:true});
  }, [route, scenario, missingPage]);

  const handleComplete = useCallback(({ session, outcome }) => {
    if (session.kind === 'live') {
      notify(`Session complete: ${outcome.headline}`, 'success');
      return;
    }
    recordSession({
      scenarioId: session.id, title: session.title, subtitle: session.subtitle,
      category: session.category, outcome,
    });
  }, [notify]);

  return (
    <div className="app-container">
      <AmbientBackground />
      <Header
        activeTab={activeTab}
        isLive={isLive}
        isWaiting={isWaiting}
        telemetryAvailable={Boolean(tunerStatus?.telemetry_available)}
        locked={sessionLocked}
      />

      <main className="main-content" ref={mainRef} tabIndex={-1}>
        {sessionLocked && !comparisonActive && !livePage && <div className="alert-banner alert-warning" role="status">
          <span>A live workload is still running. Changing pages does not stop it.</span>
          <a className="btn-secondary" href={routeHref('live')}>Return to live session</a>
        </div>}
        {comparisonActive && (
          <div className="alert-banner alert-warning" role="status">
            <span><strong>A paired comparison controls this workload.</strong> Session controls are paused until it finishes.</span>
            <button className="btn btn-danger" disabled={pending} onClick={() => mutate(api.cancelBenchmark, 'Comparison cancelled.')}>Cancel comparison</button>
          </div>
        )}

        <ErrorBoundary resetKey={route.page + (route.scenarioId || '')}>
        {route.page === 'home' && <div className="studio"><HomeView onExploreScenarios={() => navigate('scenarios')} onStartLive={() => navigate('live')} /></div>}

        {route.page === 'scenarios' && <div className="studio page-scenarios"><ScenarioGallery /></div>}

        {scenario && <nav className="page-breadcrumb" aria-label="Breadcrumb"><a href={routeHref('scenarios')}>Scenarios</a><span aria-hidden="true">/</span><span aria-current="page">{scenario.title}</span></nav>}
        {scenario?.kind === 'scripted' && <div className="studio"><SessionRunner key={scenario.id} session={scenario} onExit={() => navigate('scenarios')} onComplete={handleComplete} /></div>}

        {livePage && (
          <div className="studio">
            <LiveSessionView
              metrics={metrics} tunerStatus={tunerStatus} workloadStatus={workloadStatus}
              pending={pending} locked={comparisonActive}
              onOpenMetrics={() => setMetricsOpen(true)}
              onComplete={handleComplete}
              onStart={(profile, duration) => mutate(async () => {
                const mode = await api.setTunerMode('recommendation');
                if (mode.status !== 200) return mode;
                return api.startWorkload(profile, duration);
              }, 'Live session started.')}
              onStop={() => mutate(api.stopWorkload, 'Session stopped.')}
            />
          </div>
        )}

        {route.page === 'algorithm' && <div className="studio"><AlgorithmView /></div>}

        {route.page === 'system' && <div className="studio"><SystemView /></div>}

        {route.page === 'results' && (
          <div className="studio"><ResultsHistory experiments={experiments} error={experimentError} /></div>
        )}
        {route.page === 'study' && <section className="studio study-page" aria-labelledby="study-title">
          <p className="section-eyebrow">Performance Study</p><h2 id="study-title" className="section-heading">Compare baseline and tuned performance</h2>
          <p className="section-sub">Configure a paired study, follow its progress, and inspect the evidence on this dedicated page.</p>
          <PerformanceEvidence />
        </section>}
        {missingPage && <section className="studio empty-state"><h2>Page not found</h2><p>This page or scenario does not exist.</p><a className="btn-primary" href={routeHref('scenarios')}>Browse scenarios</a></section>}
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
