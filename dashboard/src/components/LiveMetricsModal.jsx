import React, { useEffect, useRef } from 'react';
import { Cpu, Database, Gauge, HardDrive, Activity, Zap, FileCode2, Users, X } from 'lucide-react';
import MetricCard from './MetricCard';
import TimeSeriesChart from './TimeSeriesChart';

const toMB = (bytes) => (bytes === null || bytes === undefined ? null : (Number(bytes) / (1024 * 1024)).toFixed(1));

export default function LiveMetricsModal({ open, onClose, metrics, history, isWaiting }) {
  const ref = useRef(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  const os = metrics?.os || {};
  const db = metrics?.db || {};

  return (
    <dialog ref={ref} className="metrics-dialog" onCancel={onClose} onClose={onClose}>
      <div className="metrics-dialog-head">
        <div>
          <p className="section-eyebrow">Live telemetry</p>
          <h2 className="section-heading">Operating system &amp; PostgreSQL</h2>
        </div>
        <button className="btn-ghost" onClick={onClose} aria-label="Close live metrics"><X size={18} /></button>
      </div>

      <div className="metrics-dialog-body">
        <div className="section-title"><Cpu size={18} color="var(--accent-blue)" /> Operating System</div>
        <div className="metric-cards-grid">
          <MetricCard title="CPU Utilization" value={os.cpu_percent !== undefined ? `${os.cpu_percent}` : null} unit="%" icon={Cpu}
            status={os.cpu_percent > 85 ? 'critical' : os.cpu_percent > 70 ? 'warning' : 'normal'} subtitle="All cores" isWaiting={isWaiting} />
          <MetricCard title="RAM Usage" value={os.memory_percent !== undefined ? `${os.memory_percent}` : null} unit="%" icon={Gauge}
            status={os.memory_percent > 85 ? 'warning' : 'normal'} subtitle="System memory" isWaiting={isWaiting} />
          <MetricCard title="Disk Read" value={toMB(os.disk_read_bytes)} unit="MB / interval" icon={HardDrive} subtitle="Read I/O" isWaiting={isWaiting} />
          <MetricCard title="Disk Write" value={toMB(os.disk_write_bytes)} unit="MB / interval" icon={HardDrive} subtitle="Write I/O" isWaiting={isWaiting} />
          <MetricCard title="Context Switches" value={os.context_switches !== undefined ? Number(os.context_switches).toLocaleString() : null}
            unit="/ interval" icon={Activity} status={os.context_switches > 3000 ? 'warning' : 'normal'} subtitle="Scheduler events" isWaiting={isWaiting} />
        </div>

        <div className="section-title"><Database size={18} color="var(--accent-blue)" /> PostgreSQL</div>
        <div className="metric-cards-grid">
          <MetricCard title="Query Latency" value={db.query_latency_ms !== undefined ? Number(db.query_latency_ms).toFixed(1) : null} unit="ms" icon={Zap}
            status={db.query_latency_ms > 200 ? 'critical' : 'normal'} subtitle="Mean response time" isWaiting={isWaiting} />
          <MetricCard title="Throughput" value={db.throughput_tps !== undefined ? Number(db.throughput_tps).toFixed(1) : null} unit="TPS" icon={Activity}
            subtitle="Transactions / sec" isWaiting={isWaiting} />
          <MetricCard title="Temp File Spill" value={toMB(db.temp_files_bytes)} unit="MB" icon={FileCode2}
            status={db.temp_files_bytes > 0 ? 'warning' : 'normal'} subtitle="Spills to disk" isWaiting={isWaiting} />
          <MetricCard title="Active Workers" value={db.active_workers !== undefined ? db.active_workers : null} unit="parallel workers" icon={Users}
            status={db.active_workers >= 4 ? 'warning' : 'normal'} subtitle="Parallel gather" isWaiting={isWaiting} />
        </div>

        <TimeSeriesChart historyData={history} />
      </div>
    </dialog>
  );
}
