import React from 'react';
import { AlertTriangle, CheckCircle, Info, Sparkles, Clock, ArrowRight } from 'lucide-react';

export default function AutotunerPanel({ tunerStatus }) {
  const isBottleneck = tunerStatus?.detected_bottleneck && tunerStatus.detected_bottleneck !== 'NONE';

  return (
    <div className="autotuner-panel">
      <div className="section-title">
        <Sparkles size={18} color="#8b5cf6" />
        Autotuner Engine Status & Bottleneck Analysis
      </div>

      <div className="autotuner-grid">
        <div>
          <div className="bottleneck-box">
            <div className="bottleneck-title-row">
              <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                Bottleneck Detection
              </span>
              <span className={`badge ${isBottleneck ? 'badge-amber' : 'badge-green'}`}>
                {isBottleneck ? 'Bottleneck Confirmed' : 'Normal Operation'}
              </span>
            </div>

            <div className="bottleneck-name">
              {tunerStatus?.detected_bottleneck || 'NO_BOTTLENECK'}
            </div>

            <div className="bottleneck-reason">
              {tunerStatus?.reason || 'Workload operating within normal CPU, memory, and latency thresholds.'}
            </div>

            {tunerStatus?.recommended_action && (
              <div className="recommendation-pill">
                <Info size={18} style={{ flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', color: '#93c5fd' }}>
                    Recommended Safe Tuning Action
                  </div>
                  <div>{tunerStatus.recommended_action}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div>
          {/* Observation & Cooldown details */}
          <div className="bottleneck-box" style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                Control Loop State
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <Clock size={16} color="#3b82f6" />
                <span style={{ fontWeight: 600, fontSize: '1rem', textTransform: 'capitalize' }}>
                  {tunerStatus?.state || 'Monitoring'}
                </span>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Rule: Bottlenecks require 3 consecutive bad readings (~15s) to trigger. Observation window runs for 30s.
              </p>
            </div>

            <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
              <span>Observation: <strong>{tunerStatus?.observation_remaining_seconds || 0}s</strong></span>
              <span>Cooldown: <strong>{tunerStatus?.cooldown_remaining_seconds || 0}s</strong></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

