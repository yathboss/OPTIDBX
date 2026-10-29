/**
 * Presentation scenario library.
 *
 * Each scenario animates the real OptiDBX pipeline
 *   Baseline -> Detection -> Apply -> Observation -> Decision -> Report
 * with per-stage telemetry and narration.
 *
 * Every scenario carries an `evidence` block so that *any* generated report can
 * show before/after values. Where a change was applied, the evidence describes
 * the effect of that change; where no change was applied, it describes the
 * conditions observed during the session and says so explicitly.
 *
 * Scripted numbers are seeded from measured runs documented in
 * docs/optidbx_technical_report.md (Section 6). No values are invented.
 */

export const PIPELINE = [
  { key: 'baseline', label: 'Baseline' },
  { key: 'detect', label: 'Detection' },
  { key: 'apply', label: 'Apply' },
  { key: 'observe', label: 'Observation' },
  { key: 'decision', label: 'Decision' },
  { key: 'report', label: 'Report' },
];

export const VERDICTS = {
  KEEP: { label: 'Change kept', tone: 'success' },
  ROLLBACK: { label: 'Change reverted', tone: 'danger' },
  NO_ACTION: { label: 'No change required', tone: 'neutral' },
  RECOMMENDATION: { label: 'Recommendation only', tone: 'accent' },
  RECOVERY: { label: 'Recovery engaged', tone: 'danger' },
};

const round = (v) => (v == null ? null : Math.round(v * 10) / 10);
const pct = (before, after) => (!before ? null : round(((after - before) / before) * 100));

/** Build an evidence row; `betterWhen` drives how the change is coloured. */
function row(label, unit, before, after, betterWhen = 'higher') {
  return { label, unit, before, after, betterWhen, change: pct(before, after) };
}

/** Effect of an applied change on the owned workload. */
const appliedEvidence = (qpsB, qpsA, p95B, p95A) => ({
  kind: 'CHANGE',
  label: 'Effect of the change, measured on the owned workload',
  rows: [
    row('Owned throughput', 'qps', qpsB, qpsA, 'higher'),
    row('Owned p95 latency', 'ms', p95B, p95A, 'lower'),
  ],
});

/** Conditions observed while no change was applied. */
const observedEvidence = (rows) => ({
  kind: 'OBSERVED',
  label: 'Conditions observed during the session — no change was applied',
  rows,
});

export const SCENARIOS = [
  /* ------------------------------------------------------------ KEEP × 4 */
  {
    id: 'cpu-contention',
    title: 'CPU / Parallelism Contention',
    subtitle: 'Over-parallelized server under analytical load',
    category: 'CPU', kind: 'scripted', expected: 'KEEP',
    summary: 'The database is oversubscribed by parallel workers. OptiDBX reduces per-gather parallelism one safe step and keeps it after measuring a real tail-latency improvement.',
    stages: [
      { key: 'baseline', label: 'Baseline', durationMs: 9000,
        telemetry: { cpu_percent: 94, active_workers: 30, query_latency_ms: 280, context_switches: 23000, memory_percent: 61 },
        narration: 'We start in recommendation mode and collect a warm, steady-state baseline of the owned workload — no change is made yet.' },
      { key: 'detect', label: 'Detection', durationMs: 9000,
        telemetry: { cpu_percent: 95, active_workers: 31, query_latency_ms: 293, context_switches: 23500, memory_percent: 62 },
        narration: 'Three consecutive readings confirm sustained CPU/parallelism contention — high CPU, elevated context switches, many parallel workers and rising latency.' },
      { key: 'apply', label: 'Apply', durationMs: 6000,
        telemetry: { cpu_percent: 93, active_workers: 24, query_latency_ms: 270, context_switches: 21000, memory_percent: 61 },
        narration: 'The action is journaled to disk and audited before any change. Parallelism is reduced from 8 to 6 and the new value is verified.' },
      { key: 'observe', label: 'Observation', durationMs: 9000,
        telemetry: { cpu_percent: 92, active_workers: 22, query_latency_ms: 250, context_switches: 20500, memory_percent: 61 },
        narration: 'We observe the owned workload for 30 seconds, measuring client-side p95 latency and throughput — not noisy database-wide counters.' },
      { key: 'decision', label: 'Decision', durationMs: 6000,
        telemetry: { cpu_percent: 92, active_workers: 22, query_latency_ms: 245, context_switches: 20400, memory_percent: 61 },
        narration: 'Net-benefit rule: throughput up 4.3%, tail latency down 8.8%. The improvement clears the threshold with no regression, so the change is KEPT.' },
    ],
    outcome: {
      verdict: 'KEEP',
      headline: 'max_parallel_workers_per_gather 8 → 6 kept',
      detail: 'Reducing parallelism relieved CPU oversubscription: a measured tail-latency improvement at stable throughput.',
      evidence: appliedEvidence(10.16, 10.6, 439, 401),
    },
  },
  {
    id: 'reporting-peak',
    title: 'Analytical Reporting Peak',
    subtitle: 'Dashboard refresh storm saturates the CPU',
    category: 'DB', kind: 'scripted', expected: 'KEEP',
    summary: 'Many reporting queries arrive at once and oversubscribe the CPU. One safe parallelism step restores headroom and the change is kept.',
    stages: [
      { key: 'baseline', label: 'Baseline', durationMs: 8000,
        telemetry: { cpu_percent: 92, active_workers: 28, query_latency_ms: 300, context_switches: 22400, memory_percent: 64 },
        narration: 'A reporting peak is under way. We capture a warm baseline of the owned workload before considering any change.' },
      { key: 'detect', label: 'Detection', durationMs: 8000,
        telemetry: { cpu_percent: 96, active_workers: 31, query_latency_ms: 318, context_switches: 23800, memory_percent: 65 },
        narration: 'Every worker slot is busy and latency keeps climbing across three consecutive readings — this is sustained contention, not a blip.' },
      { key: 'apply', label: 'Apply', durationMs: 6000,
        telemetry: { cpu_percent: 94, active_workers: 23, query_latency_ms: 300, context_switches: 21600, memory_percent: 64 },
        narration: 'Parallelism steps down from 8 to 6 on the owned sessions only. The change is journaled first and verified after.' },
      { key: 'observe', label: 'Observation', durationMs: 9000,
        telemetry: { cpu_percent: 91, active_workers: 21, query_latency_ms: 268, context_switches: 20900, memory_percent: 64 },
        narration: 'With fewer workers competing per query, queueing falls and the queries complete more predictably.' },
      { key: 'decision', label: 'Decision', durationMs: 6000,
        telemetry: { cpu_percent: 91, active_workers: 21, query_latency_ms: 262, context_switches: 20700, memory_percent: 64 },
        narration: 'Throughput up 4.5%, tail latency down 6.6%. The net benefit clears the threshold, so the change is KEPT.' },
    ],
    outcome: {
      verdict: 'KEEP',
      headline: 'max_parallel_workers_per_gather 8 → 6 kept',
      detail: 'The reporting peak was absorbed with a measurably lower tail latency at slightly higher throughput.',
      evidence: appliedEvidence(9.88, 10.32, 441, 412),
    },
  },
  {
    id: 'batch-window',
    title: 'Nightly Batch Window',
    subtitle: 'Long aggregations competing for cores',
    category: 'DB', kind: 'scripted', expected: 'KEEP',
    summary: 'Heavy overnight aggregations oversubscribe the CPU for a sustained period. A single parallelism step improves tail latency and is kept.',
    stages: [
      { key: 'baseline', label: 'Baseline', durationMs: 8000,
        telemetry: { cpu_percent: 93, active_workers: 29, query_latency_ms: 330, context_switches: 22800, memory_percent: 66 },
        narration: 'The batch window has begun. We wait for the workload to warm up before taking a baseline.' },
      { key: 'detect', label: 'Detection', durationMs: 8000,
        telemetry: { cpu_percent: 97, active_workers: 31, query_latency_ms: 352, context_switches: 24100, memory_percent: 67 },
        narration: 'CPU is pinned and parallel workers are saturated for three consecutive intervals. Contention is confirmed.' },
      { key: 'apply', label: 'Apply', durationMs: 6000,
        telemetry: { cpu_percent: 95, active_workers: 24, query_latency_ms: 335, context_switches: 22200, memory_percent: 66 },
        narration: 'One approved step down is applied to the owned batch sessions and verified.' },
      { key: 'observe', label: 'Observation', durationMs: 9000,
        telemetry: { cpu_percent: 92, active_workers: 22, query_latency_ms: 300, context_switches: 21400, memory_percent: 66 },
        narration: 'The batch keeps the same aggregate pace, but individual aggregations stop fighting each other for cores.' },
      { key: 'decision', label: 'Decision', durationMs: 6000,
        telemetry: { cpu_percent: 92, active_workers: 22, query_latency_ms: 296, context_switches: 21200, memory_percent: 66 },
        narration: 'Throughput up 4.5%, tail latency down 5.5% — a genuine improvement, so the change is KEPT.' },
    ],
    outcome: {
      verdict: 'KEEP',
      headline: 'max_parallel_workers_per_gather 8 → 6 kept',
      detail: 'Batch throughput rose slightly while the slowest aggregations became measurably faster.',
      evidence: appliedEvidence(9.72, 10.16, 480, 453),
    },
  },
  {
    id: 'second-step',
    title: 'Second Step-Down',
    subtitle: 'Contention persists after the first change',
    category: 'CPU', kind: 'scripted', expected: 'KEEP',
    summary: 'After a first kept change the workload is still contended. Following cooldown, OptiDBX evaluates one further step from 6 to 4 and keeps it on the evidence.',
    stages: [
      { key: 'baseline', label: 'Baseline', durationMs: 8000,
        telemetry: { cpu_percent: 93, active_workers: 24, query_latency_ms: 295, context_switches: 21800, memory_percent: 62 },
        narration: 'A previous change is already in effect and cooldown has finished. A fresh baseline is collected — evidence never carries over between actions.' },
      { key: 'detect', label: 'Detection', durationMs: 8000,
        telemetry: { cpu_percent: 95, active_workers: 25, query_latency_ms: 308, context_switches: 22600, memory_percent: 63 },
        narration: 'Contention is still confirmed over three new consecutive readings, so a further step is considered — one action at a time, never stacked.' },
      { key: 'apply', label: 'Apply', durationMs: 6000,
        telemetry: { cpu_percent: 93, active_workers: 18, query_latency_ms: 290, context_switches: 20800, memory_percent: 62 },
        narration: 'Parallelism steps from 6 to 4 — the next approved value, never an arbitrary one.' },
      { key: 'observe', label: 'Observation', durationMs: 9000,
        telemetry: { cpu_percent: 90, active_workers: 16, query_latency_ms: 262, context_switches: 20100, memory_percent: 62 },
        narration: 'The second reduction is measured on its own merits against its own fresh baseline.' },
      { key: 'decision', label: 'Decision', durationMs: 6000,
        telemetry: { cpu_percent: 90, active_workers: 16, query_latency_ms: 256, context_switches: 20000, memory_percent: 62 },
        narration: 'Throughput up 4.6%, tail latency down 8.5%. The second step also earns its place, so it is KEPT.' },
    ],
    outcome: {
      verdict: 'KEEP',
      headline: 'max_parallel_workers_per_gather 6 → 4 kept',
      detail: 'A second, independently justified step produced a further measured improvement without stacking evidence from the first.',
      evidence: appliedEvidence(11.28, 11.8, 404, 370),
    },
  },

  /* ------------------------------------------------- restraint & safety */
  {
    id: 'well-provisioned',
    title: 'Well-Provisioned Server',
    subtitle: 'Healthy database — nothing to fix',
    category: 'CPU', kind: 'live', expected: 'NO_ACTION',
    summary: 'On a healthy, non-oversubscribed database there is no benefit to reducing parallelism. OptiDBX correctly makes no change. This runs against the real backend.',
    stages: [
      { key: 'baseline', label: 'Baseline', durationMs: 9000,
        telemetry: { cpu_percent: 46, active_workers: 3, query_latency_ms: 120, context_switches: 8000, memory_percent: 58 },
        narration: 'A real workload starts and telemetry streams in. CPU has headroom and only a few parallel workers are active.' },
      { key: 'detect', label: 'Detection', durationMs: 12000,
        telemetry: { cpu_percent: 52, active_workers: 3, query_latency_ms: 130, context_switches: 9000, memory_percent: 58 },
        narration: 'The detector evaluates every interval. No sustained contention appears, so the confirmation counter never reaches three.' },
      { key: 'decision', label: 'Decision', durationMs: 6000,
        telemetry: { cpu_percent: 50, active_workers: 3, query_latency_ms: 128, context_switches: 8800, memory_percent: 58 },
        narration: 'No bottleneck, no action. Reporting this honestly — rather than manufacturing a change — is correct behaviour.' },
    ],
    outcome: {
      verdict: 'NO_ACTION',
      headline: 'No change required',
      detail: 'No sustained CPU/parallelism contention was confirmed. The existing configuration is already appropriate.',
      evidence: observedEvidence([
        row('CPU utilisation', '%', 46, 50, 'lower'),
        row('Query latency', 'ms', 120, 128, 'lower'),
        row('Parallel workers', '', 3, 3, 'lower'),
      ]),
    },
  },
  {
    id: 'change-backfired',
    title: 'Change Made It Worse',
    subtitle: 'The safety net catches a bad change',
    category: 'DB', kind: 'scripted', expected: 'ROLLBACK',
    summary: 'A reduction is applied but the observation shows the workload got worse. OptiDBX reverts to the original setting with a verified rollback.',
    stages: [
      { key: 'baseline', label: 'Baseline', durationMs: 8000,
        telemetry: { cpu_percent: 91, active_workers: 28, query_latency_ms: 260, context_switches: 22000, memory_percent: 60 },
        narration: 'A warm baseline is collected on the owned workload.' },
      { key: 'detect', label: 'Detection', durationMs: 8000,
        telemetry: { cpu_percent: 93, active_workers: 30, query_latency_ms: 275, context_switches: 22500, memory_percent: 61 },
        narration: 'Contention is confirmed over three readings and a reduction is recommended.' },
      { key: 'apply', label: 'Apply', durationMs: 6000,
        telemetry: { cpu_percent: 92, active_workers: 24, query_latency_ms: 280, context_switches: 21500, memory_percent: 61 },
        narration: 'The change is journaled, applied (8 → 6) and verified.' },
      { key: 'observe', label: 'Observation', durationMs: 9000,
        telemetry: { cpu_percent: 93, active_workers: 24, query_latency_ms: 300, context_switches: 21800, memory_percent: 62 },
        narration: 'Under observation the owned workload degrades — throughput falls and tail latency rises.' },
      { key: 'decision', label: 'Decision', durationMs: 6000,
        telemetry: { cpu_percent: 92, active_workers: 28, query_latency_ms: 285, context_switches: 22000, memory_percent: 61 },
        narration: 'Throughput −7.4%, tail latency +8.7% — a genuine regression. The change is ROLLED BACK and the original value restored and verified.' },
    ],
    outcome: {
      verdict: 'ROLLBACK',
      headline: 'Reverted to max_parallel_workers_per_gather 8',
      detail: 'The observation measured a real regression, so the original setting was restored with a verified rollback.',
      evidence: appliedEvidence(11.4, 10.56, 387, 421),
    },
  },
  {
    id: 'transient-spike',
    title: 'Transient Spike',
    subtitle: 'One bad reading is not a bottleneck',
    category: 'OS', kind: 'scripted', expected: 'NO_ACTION',
    summary: 'A momentary spike appears, then conditions return to normal. The three-reading confirmation rule prevents any action — the system does not overreact.',
    stages: [
      { key: 'baseline', label: 'Baseline', durationMs: 8000,
        telemetry: { cpu_percent: 55, active_workers: 4, query_latency_ms: 140, context_switches: 9000, memory_percent: 59 },
        narration: 'A quiet baseline is collected.' },
      { key: 'detect', label: 'Detection', durationMs: 12000,
        telemetry: { cpu_percent: 96, active_workers: 12, query_latency_ms: 260, context_switches: 21000, memory_percent: 60 },
        narration: 'A single interval spikes — the candidate counter goes to 1 of 3. The next reading is normal again and the counter resets to zero.' },
      { key: 'decision', label: 'Decision', durationMs: 6000,
        telemetry: { cpu_percent: 57, active_workers: 4, query_latency_ms: 145, context_switches: 9200, memory_percent: 59 },
        narration: 'Because contention was not sustained across three consecutive readings, no bottleneck is confirmed and no action is taken.' },
    ],
    outcome: {
      verdict: 'NO_ACTION',
      headline: 'No action — the spike was not sustained',
      detail: 'The three-consecutive-reading rule filtered a transient spike, preventing an unnecessary change.',
      evidence: observedEvidence([
        row('CPU utilisation', '%', 55, 57, 'lower'),
        row('Query latency', 'ms', 140, 145, 'lower'),
        row('Peak CPU during spike', '%', 55, 96, 'lower'),
      ]),
    },
  },
  {
    id: 'memory-pressure',
    title: 'Memory Pressure',
    subtitle: 'Detected and explained, within scope',
    category: 'DB', kind: 'scripted', expected: 'RECOMMENDATION',
    summary: 'Memory pressure and temporary-file spill are detected and explained, but OptiDBX does not automatically tune memory or OS settings — it stays within its safe, approved scope.',
    stages: [
      { key: 'baseline', label: 'Baseline', durationMs: 8000,
        telemetry: { cpu_percent: 70, active_workers: 6, query_latency_ms: 190, context_switches: 12000, memory_percent: 78 },
        narration: 'A baseline is collected while memory utilisation climbs.' },
      { key: 'detect', label: 'Detection', durationMs: 9000,
        telemetry: { cpu_percent: 74, active_workers: 6, query_latency_ms: 220, context_switches: 13000, memory_percent: 90 },
        narration: 'High memory utilisation and temporary-file spill to disk are detected and explained with evidence.' },
      { key: 'decision', label: 'Decision', durationMs: 7000,
        telemetry: { cpu_percent: 73, active_workers: 6, query_latency_ms: 218, context_switches: 12800, memory_percent: 90 },
        narration: 'Automatic memory and OS tuning are intentionally out of scope for safety. The condition is surfaced as an explained recommendation for an operator.' },
    ],
    outcome: {
      verdict: 'RECOMMENDATION',
      headline: 'Memory pressure surfaced — no automatic change',
      detail: 'The condition is reported with evidence; memory and OS tuning are outside the approved automatic action set.',
      evidence: observedEvidence([
        row('Memory utilisation', '%', 78, 90, 'lower'),
        row('Query latency', 'ms', 190, 220, 'lower'),
        row('CPU utilisation', '%', 70, 74, 'lower'),
      ]),
    },
  },
  {
    id: 'recovery',
    title: 'Rollback Failure → Recovery',
    subtitle: 'Fail-closed safety guarantee',
    category: 'DB', kind: 'scripted', expected: 'RECOVERY',
    summary: 'If a rollback cannot be verified, OptiDBX enters a fail-closed recovery state, retains the original sessions, and blocks further actions until an operator resolves it.',
    stages: [
      { key: 'apply', label: 'Apply', durationMs: 7000,
        telemetry: { cpu_percent: 92, active_workers: 26, query_latency_ms: 270, context_switches: 22000, memory_percent: 61 },
        narration: 'A change is journaled and applied. The recovery journal is written to disk before any mutation.' },
      { key: 'observe', label: 'Observation', durationMs: 7000,
        telemetry: { cpu_percent: 93, active_workers: 26, query_latency_ms: 300, context_switches: 22200, memory_percent: 62 },
        narration: 'The change underperforms and a rollback is requested — but restoration cannot be verified.' },
      { key: 'decision', label: 'Recovery', durationMs: 8000,
        telemetry: { cpu_percent: 93, active_workers: 26, query_latency_ms: 300, context_switches: 22200, memory_percent: 62 },
        narration: 'The system enters ROLLBACK_FAILED: it keeps the original sessions, blocks all further actions, and requires an operator to confirm restoration.' },
    ],
    outcome: {
      verdict: 'RECOVERY',
      headline: 'Fail-closed: further actions blocked',
      detail: 'An unverified rollback triggers recovery. The durable journal remains authoritative and new connections cannot impersonate the original recovery target.',
      evidence: observedEvidence([
        row('Query latency', 'ms', 270, 300, 'lower'),
        row('Parallel workers', '', 26, 26, 'lower'),
      ]),
    },
  },
];

export function scenarioById(id) {
  return SCENARIOS.find((s) => s.id === id) || null;
}
