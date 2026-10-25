import React from 'react';
import { Keyboard, X } from 'lucide-react';

export default function ShortcutsModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  const shortcuts = [
    { key: '1', desc: 'Navigate to Performance Evidence' },
    { key: '2', desc: 'Navigate to Live Dashboard' },
    { key: '3', desc: 'Navigate to Telemetry Trends' },
    { key: '4', desc: 'Navigate to Tuning Recommendations' },
    { key: '5', desc: 'Navigate to Evaluation & Benchmarks' },
    { key: 'r', desc: 'Instantly refresh live telemetry' },
    { key: 'e', desc: 'Open Evidence & Telemetry Export' },
    { key: '?', desc: 'Toggle this keyboard shortcuts menu' },
    { key: 'Esc', desc: 'Close any open modal window' },
  ];

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(10, 15, 29, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        className="modal-card"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-card, #131b2e)',
          border: '1px solid var(--border-color, #1e293b)',
          borderRadius: '12px',
          width: '90%',
          maxWidth: '460px',
          padding: '24px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
          color: 'var(--text-primary, #f1f5f9)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Keyboard size={20} style={{ color: 'var(--accent-blue, #38bdf8)' }} />
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600 }}>Keyboard Shortcuts</h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted, #94a3b8)',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <X size={18} />
          </button>
        </div>

        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted, #94a3b8)', marginBottom: '18px' }}>
          Navigate OptiDBX efficiently during live evaluation and workload testing with global hotkeys:
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {shortcuts.map(({ key, desc }) => (
            <div
              key={key}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                borderRadius: '6px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                fontSize: '0.85rem',
              }}
            >
              <span>{desc}</span>
              <kbd
                style={{
                  background: 'var(--bg-secondary, #1e293b)',
                  border: '1px solid var(--border-color, #334155)',
                  borderRadius: '4px',
                  padding: '2px 8px',
                  fontFamily: 'monospace',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: 'var(--accent-cyan, #22d3ee)',
                  boxShadow: '0 2px 0 rgba(0,0,0,0.4)',
                }}
              >
                {key}
              </kbd>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              background: 'var(--bg-secondary, #1e293b)',
              border: '1px solid var(--border-color, #334155)',
              color: 'var(--text-primary, #f1f5f9)',
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
