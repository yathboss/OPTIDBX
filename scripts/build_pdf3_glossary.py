"""
OptiDBX Study Series — Document 3: Technical Terms Glossary.

Every term used across the project and the other study documents, defined
plainly and grounded in docs/optidbx_technical_report.md. Terms are the ones
Documents 1 and 2 cross-reference, plus the core PostgreSQL / infrastructure
vocabulary needed to follow them.

Run:  python scripts/build_pdf3_glossary.py
Out:  docs/optidbx_technical_terms_glossary.pdf
"""

from __future__ import annotations
import datetime
import os

import studypdf as sp
from studypdf import esc

GLOSS_CSS = """
<style>
  .legend { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 4px; }
  .letters { position: sticky; }
  .lblock { page-break-inside: avoid; margin-bottom: 4px; }
  .lhead { display: flex; align-items: center; gap: 8px; margin: 14px 0 6px; }
  .lhead .L { width: 26px; height: 26px; border-radius: 7px; background: #f4610c; color: #fff;
              font-weight: 800; font-size: 14px; display: grid; place-items: center; }
  .lhead .rule { flex: 1; height: 1px; background: #e4e8ee; }
  .term { border: 1px solid #eceef2; border-radius: 9px; padding: 9px 13px; margin-bottom: 8px;
          page-break-inside: avoid; }
  .term-head { display: flex; align-items: baseline; gap: 8px; }
  .term-name { font-weight: 800; font-size: 11.6px; color: #101826; }
  .term-name code { background: #fff3ea; color: #b7560a; padding: 0 4px; border-radius: 4px;
                    font-size: 10.6px; }
  .cat { margin-left: auto; font-size: 8.7px; font-weight: 700; letter-spacing: .04em;
         text-transform: uppercase; padding: 2px 8px; border-radius: 999px;
         background: #f1f3f6; color: #5b6675; }
  .cat.measure { background: #fff3ea; color: #c1560b; }
  .cat.decide { background: #fdf0e6; color: #b7560a; }
  .cat.safety { background: #f2f0ee; color: #6a5140; }
  .cat.arch { background: #eef1f5; color: #47566a; }
  .cat.detect { background: #f0f3f7; color: #4a5a70; }
  .cat.pg { background: #eef2ee; color: #46614a; }
  .cat.infra { background: #f4f4f6; color: #55607a; }
  .cat.result { background: #fbf1ea; color: #b25a12; }
  .term-def { font-size: 10.6px; color: #26313f; margin-top: 5px; }
  .term-def b { color: #101826; }
  .term-see { font-size: 9.1px; color: #8a94a3; margin-top: 5px; }
  .term-see .s { color: #b7560a; font-weight: 700; }
  .legend .cat { margin: 0; }
</style>
"""

M, D, S, A, DT, PG, IN, R = "measure", "decide", "safety", "arch", "detect", "pg", "infra", "result"
CAT_LABEL = {
    M: "Measurement", D: "Decision", S: "Safety", A: "Architecture",
    DT: "Detection", PG: "PostgreSQL", IN: "Infrastructure", R: "Results",
}

# (term, category, definition_html, see_or_None)
TERMS = [
    ("Approved values (whitelist)", D,
     "The fixed set <b>{1, 2, 4, 6, 8}</b> that <code>max_parallel_workers_per_gather</code> may take. The tuner only "
     "moves between adjacent approved values, one step at a time, so every change is bounded and reversible.",
     "Doc 1 Scenario 4 · §3.3"),
    ("Audit row", S,
     "A persisted record written <i>before</i> a mutation describing the action. Part of journal-before-mutation; if it "
     "cannot be written, no change occurs.", "§3.3"),
    ("Baseline", M,
     "A warm, steady-state reading of the owned workload taken before any change — the &lsquo;before&rsquo; in the "
     "KEEP/ROLLBACK comparison. Each action gets a <b>fresh</b> baseline; evidence never carries over between actions.",
     "Doc 1 Scenario 4 · §4.2"),
    ("Bounded observation", A,
     "The fixed <b>30-second</b> window after a change during which the owned workload is measured. The first interval is "
     "excluded to avoid transition effects.", "§3.3"),
    ("Client-observed measurement", M,
     "Timing each query at the <b>client</b> around its round trip, instead of reading server counters — it captures what "
     "the user actually experiences.", "§4.1"),
    ("Closed monitoring loop", A,
     "The full cycle: workload → OS+DB telemetry → detection → recommendation → (display | safe apply) → bounded "
     "observation → KEEP/ROLLBACK → cooldown → monitor.", "§3"),
    ("Cold-start artifact", R,
     "The bias where a baseline taken on cold caches/connections understates baseline performance and <b>inflates the "
     "apparent improvement</b>. It once made a reduction look like a ~2× gain (≈6.4→≈12 QPS) versus a true ≈11 QPS. The "
     "reason warm-up exclusion exists.", "Doc 2 Q7.1 · §6.2"),
    ("Context switches", DT,
     "OS events where a CPU switches between threads/processes. A high rate signals CPU oversubscription (too many workers "
     "contending) and is one of the detection signals.", "§3.2"),
    ("Cooldown", A,
     "A <b>30-second</b> pause after any KEEP or ROLLBACK before the tuner may act again, letting the system settle.",
     "§3.3"),
    ("Core pinning (CPU affinity)", IN,
     "Binding PostgreSQL (or the monitor) to a subset of CPU cores. Used both to <i>construct</i> oversubscription for the "
     "experiments and to <i>reserve</i> CPU so the monitor keeps cadence.", "§6.5 · §6.6"),
    ("CPU oversubscription", R,
     "When more parallel workers demand CPU than there are cores to run them, so they contend. This is exactly the "
     "condition the reduction action targets.", "Doc 1 Scenario 1 · §6.4"),
    ("Debouncing", DT,
     "Requiring a signal to persist before acting. Here, three consecutive problematic readings are needed, so a single "
     "spike is ignored.", "Doc 1 Scenario 7 · §3.2"),
    ("Detection", A,
     "The stage that confirms a bottleneck via three consecutive intervals, each meeting a conjunction of CPU, "
     "context-switch, worker-count and latency conditions.", "§3.2"),
    ("Fail-closed", S,
     "A design where, on uncertainty (e.g. an unverifiable rollback), the system <b>stops and blocks further action</b> "
     "rather than risk an unsafe change.", "Doc 1 Scenario 9 · §3.3"),
    ("False positive", DT,
     "Acting on a bottleneck that is not real (e.g. a transient spike). The three-reading rule exists to prevent this.",
     "Doc 1 Scenario 7"),
    ("fsync", S,
     "A system call that forces buffered data to durable storage. The recovery journal is fsync-ed <i>before</i> any "
     "mutation so it survives a crash.", "§3.3"),
    ("Gather node", PG,
     "The query-plan node that collects rows from parallel workers. <code>max_parallel_workers_per_gather</code> caps how "
     "many workers a single Gather may use.", None),
    ("Ground-truth sweep", R,
     "Measuring performance at fixed parallelism with the tuner <b>off</b>, to establish whether a reduction <i>can</i> "
     "help at all — independent of the tuner's decisions.", "§6.1 · §6.4"),
    ("Hard guard / cap / veto", D,
     "Overrides in the net-benefit rule: never keep if tail latency regresses beyond ~<b>10%</b>, throughput regresses "
     "beyond its cap, error rate rises, or OS resources degrade.", "§4.3"),
    ("Journal-before-mutation", S,
     "Writing and fsync-ing the recovery record plus audit row <b>before</b> changing anything. If either write fails, no "
     "mutation happens — the durable journal is always ahead of the live change.", "§3.3"),
    ("KEEP", D,
     "The verdict that a change measurably helped — it cleared the net threshold with no regression — and is retained.",
     "Doc 1 Scenarios 1–4 · §4.3"),
    ("latency_first / throughput_first", D,
     "Alternative single-axis decision policies, provided only for comparison. The default is <code>net_benefit</code>.",
     "§4.3"),
    ("Median latency (p50)", M,
     "The middle query latency, reported alongside p95. Less sensitive to the slow tail than p95.", "§4.1"),
    ("Memory-bandwidth bound", R,
     "When performance is limited by RAM throughput rather than CPU. On the well-provisioned host the workload was "
     "memory-bandwidth bound, so changing worker count did not help.", "Doc 1 Scenario 6 · §6.1"),
    ("Monitor starvation", R,
     "When near-100% CPU starves the monitoring loop so it cannot hold its 5 s cadence, causing valid actions to be "
     "rejected. Reserving CPU for the monitor fixes it.", "Doc 2 Q7.3 · §6.6"),
    ("max_parallel_workers_per_gather", PG,
     "The single knob OptiDBX tunes: the maximum parallel workers a single Gather node may use. Also called "
     "<b>per-gather parallelism</b>.", "§3.3"),
    ("net-benefit rule (net_benefit)", D,
     "The default KEEP rule: keep when a weighted combination of throughput gain and latency improvement exceeds a "
     "<b>5% net threshold</b>, subject to the hard guards.", "Doc 2 Q4.5 · §4.3"),
    ("Net threshold", D,
     "The <b>5%</b> minimum net improvement a change must clear to be kept.", "§5"),
    ("NO_ACTION", D,
     "The verdict that no sustained contention was confirmed, so nothing is changed — a first-class <i>correct</i> outcome "
     "on a healthy host.", "Doc 1 Scenarios 6 & 7 · §7"),
    ("Offline tuning", A,
     "Exploring configurations on a replica or session and then installing one. Contrast <b>online tuning</b>.", "§1"),
    ("Online tuning", A,
     "Observing a live workload, applying a change, and judging its effect immediately — OptiDBX's setting, and the reason "
     "the safety and measurement layer is hard.", "§1"),
    ("Owned workload", M,
     "The queries OptiDBX itself runs on explicitly bound sessions. It is the <b>only</b> workload measured for decisions "
     "and the only sessions the tuner may change.", "Doc 2 Q4.1 · §4.1"),
    ("p95 latency (tail latency)", M,
     "The 95th-percentile query latency — the slow tail users feel. The <b>decisive</b> signal, because reducing "
     "parallelism mainly improves the tail while throughput stays flat.", "Doc 2 Q4.2 · §4.3"),
    ("Parallel sequential scan", PG,
     "A table scan split across parallel workers. It dominated the well-provisioned workload (~119 ms over cached data), "
     "making that workload memory-bandwidth bound.", "§6.1"),
    ("Parallel worker", PG,
     "A background process executing part of a parallel query. Too many under CPU pressure cause contention.", None),
    ("pgbench", IN,
     "PostgreSQL's built-in benchmarking tool. Used here at <b>scale factor 10</b> (~1M rows, ≈150 MB) to build the "
     "dataset.", "§5"),
    ("pg_stat_database", PG,
     "A server view of database-wide counters. Unsuitable as a <i>decision</i> signal because it counts all transactions "
     "(including the monitor's own) and misses a few large queries.", "§4.1"),
    ("pg_stat_statements", PG,
     "A server view of per-statement aggregate statistics. Too coarse across statement types to decide on.", "§4.1"),
    ("Recommendation mode", A,
     "A mode where the tuner detects and <b>recommends</b> but does not auto-apply. Live sessions start here.", None),
    ("RECOMMENDATION (verdict)", D,
     "Surfacing a real condition that is <b>outside the safe action set</b> (e.g. memory pressure) to an operator, with "
     "evidence, instead of acting on it.", "Doc 1 Scenario 8"),
    ("Recovery journal", S,
     "The fsync-ed on-disk record (target, before-state, scope) that stays authoritative after a crash and cannot be "
     "impersonated by a new connection.", "Doc 2 Q5.3 · §3.3"),
    ("Regression guard", D,
     "See <b>hard guard</b>: the cap that forbids keeping a change if tail latency (or throughput) worsens beyond a limit.",
     "Doc 1 Scenario 5 · §4.3"),
    ("Rejection memory", S,
     "Recording performance rollbacks against a coarse workload-condition signature and suppressing the same reduction "
     "under comparable conditions until a TTL elapses.", "§3.4"),
    ("ROLLBACK", D,
     "The verdict that a change did not help (or hurt), so the original value is restored and verified.",
     "Doc 1 Scenario 5 · §4.3"),
    ("ROLLBACK_FAILED", S,
     "The fail-closed state entered when a rollback cannot be verified: original sessions are retained and further actions "
     "blocked until an operator intervenes.", "Doc 1 Scenario 9 · §3.3"),
    ("Sampling interval", A,
     "The fixed <b>5-second</b> cadence at which OS and DB telemetry are collected.", "§3.1"),
    ("Scale factor", IN,
     "pgbench's dataset-size multiplier; <b>10</b> here (~1M <code>pgbench_accounts</code> rows).", "§5"),
    ("Stale-timestamp defect", R,
     "The bug where an auto-approved recommendation kept its first-detection timestamp while the baseline advanced, so the "
     "continuity check rejected it every interval. Fixed by refreshing the timestamp at approval. Explains the prior "
     "inability to ever KEEP.", "Doc 2 Q7.2 · §6.3"),
    ("Telemetry", A,
     "The OS and DB metrics sampled each interval: CPU, memory, disk I/O, context switches; query latency, throughput, "
     "temp-file usage, active parallel workers.", "§3.1"),
    ("Temp-file spill", PG,
     "When a query's working data exceeds memory and spills to temporary files on disk — a symptom of memory pressure.",
     "Doc 1 Scenario 8"),
    ("Three-reading confirmation", DT,
     "The rule that a bottleneck must persist across <b>three consecutive</b> intervals (~15 s) before any action.",
     "Doc 1 Scenario 7 · §3.2"),
    ("Throughput (QPS)", M,
     "Queries completed per second on the owned workload — one of the two decision axes (with p95 latency). QPS = "
     "queries per second.", "§4.1"),
    ("Timestamp continuity check", A,
     "An apply-time check that a recommendation's baseline is continuous with the current interval. It misfired in the "
     "stale-timestamp defect.", "§6.3"),
    ("TTL (time-to-live)", S,
     "The expiry after which a suppressed reduction may be reconsidered in rejection memory.", "§3.4"),
    ("Verified apply", S,
     "Setting the new value and then <b>reading it back</b> to confirm the change actually took effect.", "§3.3"),
    ("Verified rollback", S,
     "Restoring the original value and <b>reading it back</b> to confirm. Only a confirmed read-back counts as a "
     "successful rollback.", "Doc 1 Scenario 5 · §3.3"),
    ("Warm-up exclusion", M,
     "Requiring the workload to be warm and discarding an initial slice before the baseline and observation, to avoid "
     "cold-start inflation.", "Doc 2 Q4.3 · §4.2"),
    ("Workload-condition signature", S,
     "The coarse fingerprint (parallel-worker band, CPU band) rejection memory uses to match &lsquo;comparable "
     "conditions&rsquo;.", "§3.4"),
    ("FastAPI", IN,
     "The Python web framework serving the tuner's backend API to the dashboard.", None),
    ("React + Vite", IN,
     "The dashboard's frontend library (React) and build tool (Vite).", None),
    ("WSL2", IN,
     "Windows Subsystem for Linux v2 — the Ubuntu environment where PostgreSQL 16 runs under Windows 11.", "§5"),
]


def term_card(name: str, cat: str, definition: str, see) -> str:
    # allow inline <code> in names by not escaping; names are author-controlled
    see_html = (f'<div class="term-see"><span class="s">See:</span> {esc(see)}</div>'
                if see else "")
    name_html = name.replace("max_parallel_workers_per_gather", "<code>max_parallel_workers_per_gather</code>")
    return (f'<div class="term"><div class="term-head">'
            f'<span class="term-name">{name_html}</span>'
            f'<span class="cat {cat}">{esc(CAT_LABEL[cat])}</span></div>'
            f'<div class="term-def">{definition}</div>{see_html}</div>')


def build() -> str:
    today = datetime.date.today().strftime("%d %B %Y")

    # sort case-insensitively, ignoring a leading non-letter
    def sort_key(t):
        n = t[0].lstrip("_").lower()
        return n
    terms = sorted(TERMS, key=sort_key)

    # group by first letter
    groups: dict[str, list] = {}
    for t in terms:
        letter = sort_key(t)[0].upper()
        groups.setdefault(letter, []).append(t)

    legend = "".join(
        f'<span class="cat {c}">{esc(CAT_LABEL[c])}</span>'
        for c in [M, D, S, A, DT, PG, IN, R]
    )

    blocks = []
    for letter in sorted(groups):
        cards = "".join(term_card(*t) for t in groups[letter])
        blocks.append(
            f'<div class="lblock"><div class="lhead"><span class="L">{letter}</span>'
            f'<span class="rule"></span></div>{cards}</div>'
        )

    intro = f"""
    <section class="part">
      <div class="kicker">How this glossary is organised</div>
      <h2 class="section">Technical Terms Glossary</h2>
      <p class="sub">Every term used across OptiDBX and the other study documents, A–Z. Each entry has a plain
      definition, a category tag, and — where useful — a <span class="accent">See</span> link to the matching scenario
      (Doc 1), viva question (Doc 2), or technical-report section (e.g. §4.3).</p>
      <div class="legend">{legend}</div>
      <div class="callout"><b>Reading tip.</b> If you learn six terms first, learn these: <b>owned workload</b>,
      <b>p95 / tail latency</b>, <b>warm-up exclusion</b>, <b>net-benefit rule</b>, <b>verified rollback</b>, and
      <b>fail-closed</b>. Almost every decision in the project is explained by those six.</div>
    </section>
    """

    body = (
        GLOSS_CSS
        + sp.cover(
            3, "Technical Terms Glossary",
            f"{len(TERMS)} terms from the project and the study series, defined plainly and grounded in the technical report — the shared vocabulary the scenarios and viva answers rely on.",
            [("Project", "OptiDBX — Safe PostgreSQL Auto-Tuning"),
             ("Document", "3 of the OptiDBX Study Series"),
             ("Grounded in", "docs/optidbx_technical_report.md"),
             ("Prepared", today)],
        )
        + intro
        + '<section class="part"><div class="kicker">A–Z</div><h2 class="section">Definitions</h2>'
          '<p class="sub">Sorted alphabetically; category tags let you scan by theme.</p>'
        + "".join(blocks)
        + "</section>"
        + '<footer class="doc-foot">OptiDBX Study Series &middot; Document 3 &mdash; Technical Terms Glossary. '
          'Definitions are grounded in the OptiDBX Technical Report; §markers refer to it. '
          'Companion documents: 1 Demo Scenarios Study Guide, 2 Viva Question Bank, 5 Page-by-Page Presentation Scripts.</footer>'
    )
    return sp.page("OptiDBX — Technical Terms Glossary", body)


if __name__ == "__main__":
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = os.path.join(root, "docs", "optidbx_technical_terms_glossary.pdf")
    work = os.path.join(root, ".optidbx", "pdfbuild")
    sp.render_pdf(build(), out, work)
