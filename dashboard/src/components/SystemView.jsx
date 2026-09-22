import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, Cpu, MemoryStick, HardDriveDownload, HardDriveUpload, Repeat, Timer, Gauge, Users, FileStack, Radio } from 'lucide-react';
import { api } from '../services/api';
import { routeHref } from '../navigation.mjs';
import MetricChart from './MetricChart';

// 5 s telemetry cadence — used to turn cumulative disk bytes into a per-second rate.
const INTERVAL_S = 5;
const kbPerS = (bytes) => (Number.isFinite(bytes) ? Math.round((bytes / 1024 / INTERVAL_S) * 10) / 10 : null);

const METRICS = [
  { key: 'cpu', group: 'os', icon: Cpu, label: 'CPU utilisation', unit: '%',
    accessor: (d) => d?.os?.cpu_percent, threshold: { value: 85, label: 'contention 85%' } },
  { key: 'mem', group: 'os', icon: MemoryStick, label: 'Memory usage', unit: '%',
    accessor: (d) => d?.os?.memory_percent, threshold: { value: 85, label: 'pressure 85%' } },
  { key: 'dread', group: 'os', icon: HardDriveDownload, label: 'Disk read', unit: 'KB/s',
    accessor: (d) => kbPerS(d?.os?.disk_read_bytes) },
  { key: 'dwrite', group: 'os', icon: HardDriveUpload, label: 'Disk write', unit: 'KB/s',
    accessor: (d) => kbPerS(d?.os?.disk_write_bytes) },
  { key: 'ctx', group: 'os', icon: Repeat, label: 'Context switches', unit: '/int',
    accessor: (d) => d?.os?.context_switches },
  { key: 'lat', group: 'db', icon: Timer, label: 'Query latency', unit: 'ms',
    accessor: (d) => d?.db?.query_latency_ms, threshold: { value: 200, label: 'slow 200ms' } },
  { key: 'tps', group: 'db', icon: Gauge, label: 'Throughput', unit: 'qps',
    accessor: (d) => d?.db?.throughput_tps },
  { key: 'work', group: 'db', icon: Users, label: 'Active workers', unit: '',
    accessor: (d) => d?.db?.active_workers, threshold: { value: 8, label: 'pool 8' } },
  { key: 'temp', group: 'db', icon: FileStack, label: 'Temp files', unit: 'B',
    accessor: (d) => d?.db?.temp_files_bytes },
];

export default function SystemView() {
  const [history, setHistory] = useState([]);
  const [focus, setFocus] = useState('cpu');
  const [live, setLive] = useState(false);
  const fetching = useRef(false);

  const refresh = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    try {
      const res = await api.getMetricsHistory(60);
      if (res.status === 200 && Array.isArray(res.data)) {
        setHistory(res.data);
        setLive(res.data.length > 0);
      } else {
        setLive(false);
      }
    } finally {
      fetching.current = false;
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, INTERVAL_S * 1000);
    return () => clearInterval(t);
  }, [refresh]);

  const focused = METRICS.find((m) => m.key === focus) || METRICS[0];
  const hasData = history.length > 0;

  const group = (name) => METRICS.filter((m) => m.group === name).map((m) => {
    const Icon = m.icon;
    return (
      <button key={m.key} className={`sys-card ${focus === m.key ? 'active' : ''}`}
        onClick={() => setFocus(m.key)} aria-pressed={focus === m.key}>
        <div className="sys-card-head"><Icon size={14} /><span>{m.label}</span></div>
        <MetricChart data={history} accessor={m.accessor} label={m.label} unit={m.unit}
          threshold={m.threshold} compact height={74} />
      </button>
    );
  });

  return (
    <section className="system-view">
      <p className="section-eyebrow">System</p>
      <h2 className="section-heading">Live OS &amp; database telemetry</h2>
      <p className="section-sub">
        The same five-second signals OptiDBX reads to make its decisions, drawn as live graphs.
        Data appears while a workload or Live Session is running. Click any card to focus it.
      </p>

      <div className="sys-status">
        <span className={`sys-pill ${live ? 'on' : ''}`}>
          <Radio size={13} /> {live ? 'Live · updates every 5s' : 'Waiting for telemetry'}
        </span>
        {hasData && <span className="sys-count">{history.length} samples</span>}
      </div>

      {!hasData ? (
        <div className="empty-state">
          <Activity size={26} />
          <h3>No telemetry yet</h3>
          <p>Start a Live Session (or a workload) and the graphs will populate here.</p>
          <a className="btn-primary" href={routeHref('live')}>Go to Live Session</a>
        </div>
      ) : (
        <>
          <div className="sys-focus">
            <div className="sys-focus-head">
              <focused.icon size={16} />
              <h3>{focused.label}</h3>
              <span className="muted">last {history.length} readings · {focused.unit || 'count'}</span>
            </div>
            <MetricChart data={history} accessor={focused.accessor} label={focused.label}
              unit={focused.unit} threshold={focused.threshold} height={220} />
          </div>

          <h4 className="sys-group-title">Operating system</h4>
          <div className="sys-grid">{group('os')}</div>

          <h4 className="sys-group-title">Database</h4>
          <div className="sys-grid">{group('db')}</div>
        </>
      )}
    </section>
  );
}
