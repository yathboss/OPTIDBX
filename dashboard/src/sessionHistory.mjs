/**
 * Local history of completed demo (simulated) sessions.
 *
 * Real sessions are recorded in PostgreSQL and read back through the API; those
 * remain the authoritative record. Simulated scenario walkthroughs have no
 * server-side row, so they are kept here purely so the Results & History screen
 * can present one unified list. Entries are always labelled SIMULATED.
 */

const KEY = 'optidbx.sessionHistory.v2';
const LIMIT = 50;

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(entries) {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries.slice(0, LIMIT)));
  } catch {
    /* Storage unavailable or full: history is a convenience, never required. */
  }
}

/** Persist one completed simulated session. Returns the stored record. */
export function recordSession({ scenarioId, title, subtitle, category, outcome }) {
  const entry = {
    id: `sim-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    source: 'SIMULATED',
    scenarioId,
    title,
    subtitle,
    category,
    verdict: outcome?.verdict ?? 'NO_ACTION',
    headline: outcome?.headline ?? '',
    detail: outcome?.detail ?? '',
    evidence: outcome?.evidence ?? null,
    completed_at: new Date().toISOString(),
  };
  write([entry, ...read()]);
  return entry;
}

export function listSessions() {
  return read();
}

export function clearSessions() {
  write([]);
}
