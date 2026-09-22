import React, {useEffect, useState} from 'react';
import {api} from '../services/api';
import {actionState} from '../actionState.mjs';
import {phaseIndex} from '../demoModel.mjs';
import {useNotice} from './Notifications';
import BeforeAfterCard from './BeforeAfterCard';

const descriptions={LOW:'Light load for checking the connection and collecting a quiet baseline.',MEDIUM:'Suggested demo starting point: moderate concurrency. A bottleneck is not guaranteed.',HIGH:'Stress workload. Can cause contention or query timeouts; use after checking MEDIUM.'};
const steps=['Choose workload','Collect baseline','Review recommendation','Apply','Observe','Compare & report'];
export default function DemoView({status,workload,pending,onStart,onStop,onApprove,onRollback,onMode}) {
  const [setup,setSetup]=useState(null),[setupError,setSetupError]=useState(null);
  const [profile,setProfile]=useState('MEDIUM');
  useEffect(() => {
    let live=true, timer;
    const refresh=async()=>{
      const result=await api.getDemoSetup();
      if(!live) return;
      const valid=result.status===200 && result.data?.profiles;
      setSetup(valid?result.data:null);
      setSetupError(valid?null:'Demo configuration unavailable. Reconnecting to the backend…');
      if(!valid) timer=setTimeout(refresh,5000);
    };
    refresh();return()=>{live=false;clearTimeout(timer);};
  },[]);
  useNotice(setupError);
  const safe=actionState(status || {},pending || !!workload?.benchmark_id);
  const locked=pending || !status || !workload || !!workload.benchmark_id || status.recovery_required || workload.recovery_required;
  const step=phaseIndex(status?.state,workload?.running);
  const recommendation=status?.recommendation, action=status?.active_action;
  const selected=workload?.running ? workload.profile : profile;
  return <section className="demo-view">
    <div className="demo-heading"><div><p className="eyebrow">GUIDED DEMO</p><h2>See what changes. Understand why.</h2>
      <p>Run a workload, review a measured recommendation, then compare the result.</p></div>
      <span className="badge badge-blue">{status?.mode === 'auto' ? 'Automatic tuning enabled' : 'You approve each change'}</span></div>
    <ol className="demo-steps" aria-label="Demo progress">{steps.map((label,i)=><li key={label} className={i===step?'current':i<step?'complete':''} aria-current={i===step?'step':undefined}><span>{i+1}</span>{label}</li>)}</ol>
    {status?.recovery_required && <div className="recovery-panel" role="alertdialog" aria-label="Recovery required"><h3>Recovery required — automatic actions are blocked</h3><p>The previous setting could not be verified after rollback. Resolve this before starting another demo.</p><button className="btn btn-danger" disabled={!safe.canRollback} onClick={()=>onRollback(safe.rollbackId)}>Retry recovery</button></div>}
    <div className="demo-grid">
      <section className="demo-card"><p className="eyebrow">1 · WORKLOAD</p><h3>Choose the pressure level</h3>
        <label htmlFor="demo-profile">Demo workload</label><select id="demo-profile" value={selected || profile} disabled={locked || workload?.running} onChange={e=>setProfile(e.target.value)}>{['LOW','MEDIUM','HIGH'].map(p=><option key={p}>{p}</option>)}</select>
        <p>{descriptions[selected]}</p><p><strong>{setup?.profiles?.[selected] ?? '—'} owned sessions · 180 seconds</strong></p>
        <button className="btn btn-primary" disabled={locked || !setup || workload?.running || !!status?.cooldown_remaining_seconds} onClick={()=>onStart(profile)}>Start demo</button>
        {workload?.running && <button className="btn btn-danger" disabled={locked} onClick={onStop}>Stop demo</button>}
        <p className="muted">{workload?.running ? `Running ${workload.profile} · experiment #${workload.experiment_id} · ${workload.completed_queries ?? 0} completed queries` : 'Start collects real telemetry in recommendation mode.'}</p>
      </section>
      <section className="demo-card"><p className="eyebrow">2 · DATABASE SETTING</p><h3>Reduce competing workers</h3>
        <code>max_parallel_workers_per_gather</code>
        <p>Approved values: {setup?.approved_values?.join(' · ') || 'Unavailable'}. A confirmed bottleneck can recommend the next lower value.</p>
        <p>Current recommendation: <strong>{recommendation ? `${recommendation.old_value ?? 'Unavailable'} → ${recommendation.new_value ?? 'Unavailable'}` : 'Waiting for evidence'}</strong></p>
        <p className="muted">Only connections owned by this workload can be changed. External pgbench is monitor-only.</p>
      </section>
      <section className="demo-card"><p className="eyebrow">3 · OS SETTINGS</p><h3>Kept unchanged</h3>
        <p>OS settings stay stable so the database change is easy to interpret. OptiDBX never auto-tunes the operating system.</p>
      </section>
    </div>
    <section className="demo-card recommendation-card"><p className="eyebrow">NEXT STEP</p>
      <h3>{status?.state === 'OBSERVING' ? 'Measuring the effect of the change' : recommendation ? 'Review your recommendation' : workload?.running ? 'Collecting evidence' : 'Ready when you are'}</h3>
      <p>{recommendation?.reason || (workload?.running ? status?.reason : 'Press "Start demo" above to begin. A recommendation appears only when the measurements justify it.')}</p>
      {recommendation && <div className="recommendation-evidence"><p><strong>Expected effect:</strong> fewer competing PostgreSQL workers may reduce CPU contention. The observation decides whether to keep the change.</p>
        <p><strong>Affected scope:</strong> {status?.capabilities?.sessions?.length ?? 'Bound'} owned workload sessions only.</p>
        <dl>{Object.entries(status?.evidence || {}).map(([key,value])=><div key={key}><dt>{key.replaceAll('_',' ')}</dt><dd>{Number.isFinite(value)?value.toLocaleString(undefined,{maximumFractionDigits:2}):'Unavailable'}</dd></div>)}</dl></div>}
      <p>Confirmation: {status?.consecutive_bad_readings ?? 0}/{setup?.confirmation_readings ?? '—'} consecutive readings · Baseline: {setup?.baseline_samples ?? '—'} samples · Observation: {setup?.observation_seconds ?? '—'}s · Cooldown: {setup?.cooldown_seconds ?? '—'}s</p>
      {!!status?.observation_remaining_seconds && <p className="countdown">Observation: {Math.ceil(status.observation_remaining_seconds)} seconds remaining</p>}
      {!!status?.cooldown_remaining_seconds && <p className="countdown">Cooldown: {Math.ceil(status.cooldown_remaining_seconds)} seconds remaining. Telemetry continues.</p>}
      <div className="control-group"><button className="btn btn-primary" disabled={!safe.canApply} onClick={()=>onApprove(safe.approveId)}>Apply & Observe</button>
        <button className="btn btn-secondary" disabled={!safe.canRollback} onClick={()=>onRollback(safe.rollbackId)}>Restore previous setting</button>
        <button className="btn btn-secondary" disabled={!safe.canAuto} onClick={()=>onMode(status?.mode==='auto'?'recommendation':'auto')}>{status?.mode==='auto'?'Return to manual approval':'Enable continuous auto-tuning'}</button></div>
      <p className="muted">Apply &amp; Observe approves one change &mdash; kept only if the measurements support it.</p>
    </section>
    {action && <section className="demo-card"><BeforeAfterCard action={action} runMeta={action.experiment_id === workload?.experiment_id ? workload : {}}/>
      <p>Lifecycle: {[...new Set(action.transitions || [])].map(t=>typeof t==='string'?t:(t.state || '')).filter(Boolean).join(' → ') || status?.state}</p>
    </section>}
    {!workload?.running && workload?.experiment_id && !action && <div className="demo-card"><p>This workload has stopped. Open Results & Reports for its stored evidence. No completed action is currently available.</p></div>}
  </section>;
}
