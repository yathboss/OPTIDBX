import React from 'react';
import { ShieldAlert, ShieldCheck, AlertTriangle, AlertOctagon, Gauge, HardDrive } from 'lucide-react';

export default function MemorySafetyPanel({ memorySafety, osMetrics }) {
  // Use memorySafety from tunerStatus or fallback to osMetrics
  const usage = memorySafety?.usage_percent ?? osMetrics?.memory_percent ?? 0;
  const availableGb = memorySafety?.available_gb ?? (
    (memorySafety?.available_bytes ?? osMetrics?.available_memory_bytes) !== undefined && (memorySafety?.available_bytes ?? osMetrics?.available_memory_bytes) !== null
      ? Number(((memorySafety?.available_bytes ?? osMetrics?.available_memory_bytes) / (1024 ** 3)).toFixed(2))
      : null
  );

  const pressure = memorySafety?.pressure_level ?? osMetrics?.memory_pressure ?? (
    usage > 90 ? 'CRITICAL' : usage > 80 ? 'HIGH' : usage > 70 ? 'ELEVATED' : 'NORMAL'
  );

  const safe = memorySafety?.safe_for_memory_increase ?? osMetrics?.safe_for_memory_increase ?? (
    usage < 80
  );

  const reason = memorySafety?.reason || (
    safe ? 'OS memory within safe operating margins' : `High OS memory pressure (${usage}%)`
  );

  const getPressureConfig = () => {
    switch (pressure) {
      case 'CRITICAL':
        return {
          label: 'CRITICAL',
          color: 'var(--accent-rose, #ef4444)',
          bg: 'rgba(239, 68, 68, 0.15)',
          border: 'rgba(239, 68, 68, 0.4)',
          icon: AlertOctagon,
        };
      case 'HIGH':
        return {
          label: 'HIGH',
          color: '#f97316',
          bg: 'rgba(249, 115, 22, 0.15)',
          border: 'rgba(249, 115, 22, 0.4)',
          icon: ShieldAlert,
        };
      case 'ELEVATED':
        return {
          label: 'ELEVATED',
          color: 'var(--accent-amber, #f59e0b)',
          bg: 'rgba(245, 158, 11, 0.15)',
          border: 'rgba(245, 158, 11, 0.4)',
          icon: AlertTriangle,
        };
      case 'NORMAL':
      default:
        return {
          label: 'NORMAL',
          color: 'var(--accent-green, #10b981)',
          bg: 'rgba(16, 185, 129, 0.15)',
          border: 'rgba(16, 185, 129, 0.4)',
          icon: ShieldCheck,
        };
    }
  };

  const config = getPressureConfig();
  const IconComponent = config.icon;

  return (
    <div
      style={{
        background: 'var(--bg-card, #1e293b)',
        border: '1px solid var(--border-color, #334155)',
        borderRadius: '8px',
        padding: '1rem',
        marginBottom: '1rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, fontSize: '0.9rem', color: '#fff' }}>
          <ShieldCheck size={18} color="var(--accent-cyan, #06b6d4)" />
          <span>OS Memory Safety & work_mem Admission Control</span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span
            style={{
              padding: '0.2rem 0.6rem',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontWeight: 700,
              background: config.bg,
              color: config.color,
              border: `1px solid ${config.border}`,
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
            }}
          >
            <IconComponent size={12} />
            PRESSURE: {config.label}
          </span>
          <span
            style={{
              padding: '0.2rem 0.6rem',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontWeight: 700,
              background: safe ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: safe ? 'var(--accent-green, #10b981)' : 'var(--accent-rose, #ef4444)',
              border: `1px solid ${safe ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
            }}
          >
            Safe for work_mem Increase: {safe ? 'YES' : 'NO (BLOCKED)'}
          </span>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '0.75rem',
          marginBottom: '0.75rem',
        }}
      >
        <div style={{ background: 'var(--bg-secondary, #0f172a)', padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid var(--border-color, #334155)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #94a3b8)' }}>OS Memory Usage</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-mono, monospace)', color: config.color }}>
            {usage !== null && usage !== undefined ? `${Number(usage).toFixed(1)}%` : 'N/A'}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted, #64748b)' }}>Live OS virtual_memory</div>
        </div>

        <div style={{ background: 'var(--bg-secondary, #0f172a)', padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid var(--border-color, #334155)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #94a3b8)' }}>Available OS Memory</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-mono, monospace)', color: '#93c5fd' }}>
            {availableGb !== null ? `${availableGb} GB` : 'N/A'}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted, #64748b)' }}>Headroom for PostgreSQL</div>
        </div>

        <div style={{ background: 'var(--bg-secondary, #0f172a)', padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid var(--border-color, #334155)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #94a3b8)' }}>Admission Policy</div>
          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: safe ? '#10b981' : '#ef4444', marginTop: '0.2rem' }}>
            {safe ? 'Allowed (<80% threshold)' : 'Inhibited (>=80% threshold)'}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted, #64748b)' }}>Protects system from OOM</div>
        </div>
      </div>

      {!safe && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: '6px',
            padding: '0.6rem 0.8rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: '#fca5a5',
            fontSize: '0.8rem',
          }}
        >
          <AlertOctagon size={16} color="#ef4444" style={{ flexShrink: 0 }} />
          <span>
            <strong>work_mem increase is blocked due to high OS memory pressure:</strong> {reason}. The dashboard inhibits tuning apply until OS memory drops back below 80%.
          </span>
        </div>
      )}
    </div>
  );
}
