import React, { useState } from 'react';
import { Download, FileSpreadsheet, FileJson, X, CheckCircle, Database } from 'lucide-react';
import {
  exportTelemetryToCSV,
  exportTelemetryToJSON,
  exportTuningHistoryToCSV,
  downloadFile,
} from '../utils/exportTelemetry.mjs';

export default function ExportModal({ isOpen, onClose, history = [], tuningHistory = [] }) {
  const [copied, setCopied] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(null);

  if (!isOpen) return null;

  const handleExportTelemetryCSV = () => {
    const csv = exportTelemetryToCSV(history);
    const filename = `optidbx_telemetry_${Date.now()}.csv`;
    downloadFile(filename, csv, 'text/csv');
    setDownloadSuccess(`Exported ${history.length} samples to ${filename}`);
    setTimeout(() => setDownloadSuccess(null), 3500);
  };

  const handleExportTelemetryJSON = () => {
    const json = exportTelemetryToJSON(history, {
      exportedAt: new Date().toISOString(),
      source: 'OptiDBX Live Dashboard',
    });
    const filename = `optidbx_telemetry_${Date.now()}.json`;
    downloadFile(filename, json, 'application/json');
    setDownloadSuccess(`Exported JSON report to ${filename}`);
    setTimeout(() => setDownloadSuccess(null), 3500);
  };

  const handleExportTuningCSV = () => {
    const csv = exportTuningHistoryToCSV(tuningHistory);
    const filename = `optidbx_tuning_actions_${Date.now()}.csv`;
    downloadFile(filename, csv, 'text/csv');
    setDownloadSuccess(`Exported ${tuningHistory.length} tuning decisions to ${filename}`);
    setTimeout(() => setDownloadSuccess(null), 3500);
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={{
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
    }}>
      <div
        className="modal-card"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-card, #131b2e)',
          border: '1px solid var(--border-color, #1e293b)',
          borderRadius: '12px',
          width: '90%',
          maxWidth: '520px',
          padding: '24px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4)',
          color: 'var(--text-primary, #f1f5f9)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Download size={22} style={{ color: 'var(--accent-blue, #38bdf8)' }} />
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Export Evidence & Telemetry</h3>
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
            <X size={20} />
          </button>
        </div>

        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted, #94a3b8)', marginBottom: '20px' }}>
          Download raw telemetry data and autotuning decisions as CSV or JSON for evaluation reports, viva presentations, or external benchmark analysis.
        </p>

        {downloadSuccess && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 14px',
            borderRadius: '6px',
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            color: '#10b981',
            marginBottom: '16px',
            fontSize: '0.85rem',
          }}>
            <CheckCircle size={16} />
            <span>{downloadSuccess}</span>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button
            onClick={handleExportTelemetryCSV}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderRadius: '8px',
              background: 'rgba(56, 189, 248, 0.08)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              color: '#38bdf8',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <FileSpreadsheet size={18} />
              <span>Telemetry Interval History (CSV)</span>
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted, #94a3b8)' }}>{history.length} samples</span>
          </button>

          <button
            onClick={handleExportTelemetryJSON}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderRadius: '8px',
              background: 'rgba(168, 85, 247, 0.08)',
              border: '1px solid rgba(168, 85, 247, 0.25)',
              color: '#c084fc',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <FileJson size={18} />
              <span>Full Telemetry Report (JSON)</span>
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted, #94a3b8)' }}>Structured format</span>
          </button>

          <button
            onClick={handleExportTuningCSV}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderRadius: '8px',
              background: 'rgba(52, 211, 153, 0.08)',
              border: '1px solid rgba(52, 211, 153, 0.25)',
              color: '#34d399',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Database size={18} />
              <span>Tuning Decisions & Evidence (CSV)</span>
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted, #94a3b8)' }}>{tuningHistory.length} actions</span>
          </button>
        </div>

        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              background: 'var(--bg-secondary, #1e293b)',
              border: '1px solid var(--border-color, #334155)',
              color: 'var(--text-primary, #f1f5f9)',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
