"""
OptiDBX Study Series — Document 2: Viva Question Bank.

Questions a panel is likely to ask, each with a grounded, defensible answer.
Every answer is drawn from docs/optidbx_technical_report.md and the system
design; section references (e.g. §4.3) point back to that report. Cross-links
point to Document 1 (scenarios) and Document 3 (glossary).

Run:  python scripts/build_pdf2_viva.py
Out:  docs/optidbx_viva_question_bank.pdf
"""

from __future__ import annotations
import datetime
import os

import studypdf as sp
from studypdf import esc

# Doc-2-specific styles layered on top of the shared BASE_CSS.
QA_CSS = """
<style>
  .toc10 { border: 1px solid #e4e8ee; border-radius: 12px; padding: 14px 18px; margin: 14px 0 6px;
           background: #fafbfc; page-break-inside: avoid; }
  .toc10 h3 { font-size: 13px; margin-bottom: 8px; }
  .toc10 ol { margin: 0; padding-left: 20px; }
  .toc10 li { margin-bottom: 4px; font-size: 10.6px; }
  .grp { margin-top: 6px; }
  .grp h3 { font-size: 14px; margin: 16px 0 4px; color: #101826; }
  .grp .gsub { color: #5b6675; font-size: 10.8px; margin-bottom: 10px; }
  .qa { border: 1px solid #e8ebf0; border-radius: 10px; padding: 12px 15px; margin: 0 0 11px;
        page-break-inside: avoid; }
  .qa .q { display: flex; gap: 9px; align-items: baseline; font-weight: 700; font-size: 11.8px;
           color: #101826; }
  .qnum { flex: none; min-width: 30px; height: 20px; padding: 0 7px; border-radius: 6px;
          background: #fff3ea; color: #d24e05; font-weight: 800; font-size: 10.5px;
          display: inline-flex; align-items: center; justify-content: center; }
  .qa .a { margin: 7px 0 0 39px; font-size: 11px; color: #26313f; }
  .qa .a b { color: #101826; }
  .qmeta { margin: 8px 0 0 39px; font-size: 9.3px; color: #8a94a3; }
  .qmeta .g { color: #b7560a; font-weight: 700; }
  .qmeta .s { color: #5b6675; }
</style>
"""


# --- the bank ---------------------------------------------------------------
# Each item: (question, answer_html, grounds, see)
GROUPS = [
    ("1", "Foundations & motivation",
     "What the project is and why online tuning is hard.",
     [
        ("In one sentence, what is OptiDBX?",
         "A <b>safe online auto-tuner</b> for a single PostgreSQL parallelism knob "
         "(<span class='accent'>max_parallel_workers_per_gather</span>) that reduces parallelism one approved "
         "step under confirmed CPU oversubscription, then <b>keeps the change only if warm-up-excluded, "
         "owned-workload measurements show a net benefit</b>, with verified rollback and fail-closed recovery.",
         "Abstract", "Doc 1 Part A"),
        ("What problem does it solve?",
         "Online tuners must decide <i>while the system is live</i> whether a change actually helped — without "
         "destabilising the database or being fooled by noisy measurements. Keeping a harmful change degrades "
         "production; reverting a helpful one forfeits benefit and churns the system.",
         "§1", None),
        ("Offline vs online tuning — where does OptiDBX sit?",
         "Offline tuning explores configurations on a replica or session and then installs one. <b>Online</b> tuning "
         "observes a live workload, applies a change, and must immediately judge its effect. OptiDBX is online, which "
         "is why the decision and safety layer is the hard part.",
         "§1", None),
        ("What are your three contributions?",
         "(1) A <b>safe online action lifecycle</b> — pre-mutation journaling, verified apply, bounded observation, "
         "verified rollback, fail-closed recovery. (2) A <b>measurement methodology</b> for KEEP/ROLLBACK based on "
         "owned-workload, warm-up-excluded, client-observed metrics under a net-benefit rule. (3) An <b>empirical "
         "characterisation</b> of when parallelism reduction helps, with three documented failure modes.",
         "§1", None),
        ("Is this a new tuning algorithm?",
         "No — that is an explicit non-goal. It is an <b>engineering and measurement study</b> focused on the online "
         "decision and safety layer, not on knob breadth or a learned multi-knob model.",
         "§1, §8", None),
     ]),

    ("2", "The knob & the action",
     "Why this parameter, and why reducing it can speed things up.",
     [
        ("Why max_parallel_workers_per_gather specifically?",
         "It caps how many parallel workers a single Gather node may use. It is a <b>single, reversible, bounded</b> "
         "action whose effect is understandable — ideal for a safety-first prototype. OptiDBX only moves it within the "
         "approved whitelist <b>1, 2, 4, 6, 8</b>, one step at a time.",
         "§3.3", "Doc 3 'per-gather parallelism'"),
        ("Why does <i>reducing</i> parallelism make queries faster?",
         "Under CPU oversubscription too many workers fight for cores; context-switching and queueing inflate the tail. "
         "Fewer workers relieve the oversubscription, so the same work completes with <b>lower p95 latency</b> while "
         "throughput stays roughly flat. In the ground-truth sweep, tail latency roughly halved (606→290 ms) as "
         "per-gather went 8→1.",
         "§6.4", "Doc 1 Scenario 1"),
        ("Why not increase parallelism, or tune other knobs?",
         "Out of the approved action set. The targeted problem is oversubscription, and the planner will not spawn more "
         "workers than a query's cost warrants — raising the shared pool to 48 left the sweep flat. Breadth is future work.",
         "§6.1, §9", None),
        ("Why restrict to a single knob at all?",
         "Deliberate narrowing: invest complexity in <b>deciding correctly and acting safely</b> rather than exploring a "
         "large configuration space. A narrow, reversible action is what makes acting on a live database safe.",
         "§1", None),
     ]),

    ("3", "Architecture & pipeline",
     "The closed loop and the six decision stages.",
     [
        ("Describe the closed monitoring loop.",
         "workload → OS + DB telemetry → detection → recommendation → (display | safe apply) → bounded observation → "
         "KEEP/ROLLBACK → cooldown → monitor. There is a <b>strict separation</b> between passive monitoring and active "
         "tuning.",
         "§3", "Doc 1 Part A"),
        ("What telemetry do you collect, and how often?",
         "OS: CPU utilisation, memory pressure, disk I/O, context switches. DB: query latency, throughput, temporary-file "
         "usage, active parallel workers. Fixed <b>5-second</b> sampling. Samples with excessive timestamp skew, missing "
         "intervals, or counter resets are <b>rejected, not imputed</b>.",
         "§3.1", "Doc 3 'context switches'"),
        ("How does detection decide there is a bottleneck?",
         "A bottleneck is confirmed only after <b>three consecutive</b> problematic intervals (~15 s). Each interval must "
         "satisfy a conjunction: elevated CPU, elevated context-switch rate, high active-worker count, and elevated query "
         "latency. Thresholds are externalised and treated as calibratable, not universal.",
         "§3.2", "Doc 1 Scenario 7"),
        ("Why three readings instead of acting immediately?",
         "To debounce transient spikes. A single bad interval takes the counter to 1 of 3; the next normal reading resets "
         "it to 0. Without this, the tuner would thrash the configuration on noise.",
         "§3.2", "Doc 1 Scenario 7"),
        ("Walk through the safe action lifecycle.",
         "<b>Journal before mutation</b> (fsync a recovery record + persist an audit row; if either write fails, no change "
         "happens) → <b>verified apply</b> (set the value, read it back) → <b>bounded observation</b> (fixed 30 s, first "
         "interval excluded) → <b>decision</b> → <b>verified rollback + 30 s cooldown</b> → <b>fail-closed recovery</b> if "
         "a rollback cannot be verified.",
         "§3.3", "Doc 1 Scenarios 5 & 9"),
        ("Which sessions can the tuner actually change?",
         "Only an explicitly bound, <b>application-owned</b> workload session. External sessions are monitor-only, and only "
         "<b>one action at a time</b> is permitted.",
         "§3.3", None),
     ]),

    ("4", "Measurement methodology (the heart)",
     "How the KEEP/ROLLBACK question is answered — where most of the real work is.",
     [
        ("Why measure the owned workload instead of database-wide counters?",
         "Database-wide counters are available but unsuitable as a <i>decision</i> signal. "
         "<span class='accent'>pg_stat_database</span> throughput counts all transactions — including the monitor's own "
         "commits — and is insensitive to a few large analytical queries; <span class='accent'>pg_stat_statements</span> "
         "means aggregate coarsely across statement types. OptiDBX instead <b>times each owned query at the client</b> and "
         "summarises median/p95 latency and QPS — the signal the user actually feels.",
         "§4.1", "Doc 3 'owned workload'"),
        ("What is p95 latency and why lead with it?",
         "The 95th-percentile query latency — the slow tail. Parallelism reduction chiefly improves the <b>tail</b> (throughput "
         "stays flat), so p95 is the decisive signal; a mean would hide exactly the improvement that matters.",
         "§4.3, §6.4", "Doc 3 'p95 latency'"),
        ("Why exclude warm-up from the baseline?",
         "A baseline captured while the workload is still ramping (cold caches, connection warm-up) understates the baseline "
         "and <b>inflates the apparent improvement</b>. A cold baseline once made reductions look like a ~2× gain "
         "(≈6.4→≈12 QPS); the warm-up-excluded truth was ≈11 ≈ 11 QPS — no real gain.",
         "§4.2, §6.2", "Doc 3 'warm-up exclusion'"),
        ("What must be true before you apply a change?",
         "The owned workload must have been warm for a configured interval, an initial warm-up slice is excluded, and a "
         "complete warm baseline window with a <b>minimum of ~30 completed queries</b> must exist.",
         "§4.2, §5", None),
        ("State the net-benefit decision criterion precisely.",
         "Keep when a weighted combination of throughput gain and latency improvement exceeds a <b>5% net threshold</b>. Hard "
         "guards override: never keep if tail latency regresses beyond a <b>10% cap</b>, if throughput regresses beyond its "
         "cap, or if error rate rises. OS resource degradation (CPU/memory/disk) is an <b>independent veto</b>.",
         "§4.3, §5", "Doc 3 'net-benefit rule'"),
        ("Why not a latency-only or throughput-only rule?",
         "A parallelism reduction <b>trades</b> single-query latency against aggregate behaviour, so a single-axis rule is "
         "inadequate. latency_first and throughput_first policies exist only for comparison.",
         "§4.3", None),
        ("Is every decision auditable?",
         "Yes. Each decision records its <b>source</b> (owned vs telemetry fallback), the <b>measured percentage changes</b>, "
         "and the <b>policy</b> applied — fully reconstructable after the fact.",
         "§4.3", None),
     ]),

    ("5", "Safety, rollback & recovery",
     "What makes acting on a live database defensible.",
     [
        ("How do you know a rollback truly restored the old value?",
         "<b>Verified rollback</b>: the original value is set again and then <b>read back</b> for confirmation. Only a "
         "confirmed read-back counts as a successful rollback.",
         "§3.3", "Doc 1 Scenario 5"),
        ("What is fail-closed recovery?",
         "If a rollback cannot be verified, the system marks itself <b>ROLLBACK_FAILED</b>, retains the original sessions, "
         "and <b>blocks all further actions</b> until an operator intervenes. After a crash the on-disk journal stays "
         "authoritative and cannot be impersonated by a new connection.",
         "§3.3", "Doc 1 Scenario 9"),
        ("What does 'journal before mutation' mean?",
         "A recovery record (target, before-state, scope) is <b>fsync-ed</b> and an audit row persisted <i>before</i> any "
         "change. If either write fails, no mutation occurs — the durable journal is always ahead of the live change.",
         "§3.3", "Doc 3 'recovery journal'"),
        ("How do you avoid repeatedly trying a change that never helps?",
         "Performance-based rollbacks are recorded against a coarse workload-condition signature (parallel-worker band, CPU "
         "band). The detector then <b>suppresses the same reduction under comparable conditions</b> until a TTL elapses or "
         "conditions change materially — while still allowing reconsideration on a genuine workload shift.",
         "§3.4", "Doc 3 'rejection memory'"),
        ("Why a cooldown after every action?",
         "A 30 s cooldown follows either outcome so the system settles and the tuner does not immediately re-trigger on the "
         "same conditions.",
         "§3.3, §5", None),
     ]),

    ("6", "Results & the 50% keep rate",
     "Stated honestly — including what the number does and does not mean.",
     [
        ("What keep rate did you achieve?",
         "<b>50% (3 of 6)</b> completed actions under higher oversubscription (PostgreSQL pinned to 8 cores) — up from the "
         "system historically <b>never</b> keeping a change. At moderate oversubscription (12 cores) it was 20% (1/5), which "
         "is correctly conservative.",
         "§6.5", "Doc 1 Scenarios 1–5"),
        ("Isn't 50% cherry-picked?",
         "Be candid: <b>no outcome was relabelled and no run discarded</b>. But the regime is <b>constructed</b> — deliberately "
         "over-parallelized and CPU-constrained — realistic but not sampled from production traces, over small samples without "
         "confidence intervals. Read it as: <i>under the conditions the action targets, the tuner captures the available "
         "benefit.</i>",
         "§8", None),
        ("Why is a low keep rate not a failure?",
         "Every completed action gave a <b>small real improvement</b>, but only those clearing the 5% net threshold were kept. "
         "Keeping marginal changes would churn the system; conservatism is the intended behaviour. Cycle 5 (worse on both axes) "
         "was correctly reverted.",
         "§6.5", "Doc 1 Scenario 5"),
        ("On a healthy, well-provisioned host, what happens?",
         "No benefit exists — the fixed-parallelism sweep spread only ~4%, within noise — so the correct action is <b>no "
         "action</b>. The workload requested only 3 workers regardless of the setting; it was memory-bandwidth bound, not CPU "
         "bound.",
         "§6.1", "Doc 1 Scenario 6"),
        ("What actually moved the system from 0% to 50%?",
         "<b>Correct measurement and apply plumbing</b> — owned-workload signals, warm-up exclusion, and the timestamp-refresh "
         "fix — <i>not</i> a smarter policy. The report's headline lesson is that <b>measurement dominates policy</b>.",
         "§7", None),
     ]),

    ("7", "The three failure modes",
     "The bugs that silently defeat naive online tuners — know these cold.",
     [
        ("Failure mode 1 — the cold-start artifact?",
         "Measuring the baseline immediately after workload start (cold caches/connections) versus a warm observation made "
         "reductions look like a <b>~2× throughput gain</b> (≈6.4→≈12 QPS). The warm-up-excluded truth was ≈11 ≈ 11 QPS. This "
         "motivated warm-up exclusion; any tuner comparing pre/post windows without controlling warm-up is exposed to it.",
         "§6.2", "Doc 3 'cold-start artifact'"),
        ("Failure mode 2 — the stale-timestamp defect?",
         "The auto-approval path submitted a recommendation whose timestamp was fixed at first detection while the baseline "
         "window advanced each interval. The apply-time continuity check then rejected it as discontinuous <b>every</b> interval, "
         "so a <i>stable</i> recommendation could never be applied automatically. Fix: <b>refresh the timestamp to the current "
         "interval at approval time</b>. This is consistent with the system's prior inability to ever record a KEEP.",
         "§6.3", None),
        ("Failure mode 3 — monitor starvation under saturation?",
         "Near 100% CPU the monitoring loop shares cores with the saturating workload and cannot hold its 5 s cadence; the "
         "continuity check then intermittently rejects valid actions. There is a <b>constraint conflict</b>: detection needs high "
         "CPU, but stable monitoring needs spare CPU. Reserving CPU for the monitor (core pinning) restored cadence and enabled "
         "the keep-rate results.",
         "§6.6", None),
        ("Why do these failure modes matter beyond this project?",
         "Two of the three <b>corrupt results silently</b> rather than failing loudly — the most dangerous class of bug for an "
         "autonomous system, because it keeps producing plausible-looking but wrong decisions.",
         "§7", None),
     ]),

    ("8", "Limitations, future work & stack",
     "Scope honesty and the engineering context.",
     [
        ("What are the main limitations?",
         "One parallelism knob, analytical read workloads, a single host; a <b>constructed</b> positive regime; <b>small samples "
         "without confidence intervals</b>; no comparison against other tuners or DBA heuristics; and a prototype scope (single "
         "local process, no auth/multi-node).",
         "§8", None),
        ("What is the future work?",
         "Standard benchmarks (TPC-C/H/DS, YCSB) and real traces with confidence intervals; baselines vs default, DBA heuristics "
         "and a learned tuner; adaptive thresholds and a multi-knob extension that preserves the safety layer; portable monitor "
         "isolation (cgroups/CPU affinity); and a statistical decision procedure (e.g. sequential testing).",
         "§9", None),
        ("Is it production-ready?",
         "No. It is a <b>prototype and methodology study</b>; the reusable contribution is the safety and measurement layer, not a "
         "deployable product.",
         "§8, §10", None),
        ("What is the technology stack?",
         "PostgreSQL 16 on Ubuntu (WSL2) under Windows 11, 16 logical cores; a FastAPI backend; a React + Vite dashboard; dataset "
         "is pgbench scale factor 10 (~1M rows, ≈150 MB).",
         "§5", None),
        ("How does the dashboard relate to the tuner?",
         "It visualises the same six-stage pipeline. <b>Simulated</b> scenarios are illustrative walkthroughs seeded from measured "
         "runs; a <b>Live Session</b> exercises the real backend. Every report shows before/after owned-workload evidence and is "
         "labelled simulated or live.",
         "—", "Doc 1, Doc 5"),
     ]),

    ("9", "Curveballs",
     "Sharper questions a panel may use to probe your understanding.",
     [
        ("Could OptiDBX make production worse?",
         "A bad change is caught by <b>bounded observation + the net-benefit rule + hard regression guards</b> and reverted "
         "(Scenario 5). The worst case — a rollback that cannot be verified — <b>fails closed</b> and blocks further action, so it "
         "never leaves an ambiguous, unsafe state.",
         "§3.3, §4.3", "Doc 1 Scenarios 5 & 9"),
        ("What if the telemetry itself is unreliable?",
         "Samples with excessive OS/DB timestamp skew, missing intervals, or counter resets are <b>rejected, not imputed</b>, so a "
         "decision is never made on corrupted data.",
         "§3.1", None),
        ("Why should a judge trust your KEEP decisions?",
         "Because the <b>same system reverts</b> changes that do not help (visible rollbacks) and <b>does nothing</b> on a healthy "
         "host. The keeps are the residue of a conservative, auditable rule — not the tuner trying to justify itself.",
         "§6.1, §6.5", None),
        ("If you could keep only one sentence from this project, what is it?",
         "The difficulty of online DB auto-tuning lies less in choosing a configuration than in <b>safely applying a live change "
         "and honestly measuring its effect</b> — measurement dominates policy.",
         "§10", None),
     ]),
]

TOP10 = [
    "In one sentence, what is OptiDBX? (1.1)",
    "Why does reducing parallelism make queries faster? (2.2)",
    "Why measure the owned workload, not pg_stat_database? (4.1)",
    "State the net-benefit criterion (5% net, 10% regression cap). (4.5)",
    "What is p95 latency and why lead with it? (4.2)",
    "Why exclude warm-up from the baseline? (4.3)",
    "How is a rollback verified, and what is fail-closed recovery? (5.1–5.2)",
    "What keep rate did you reach, and is it cherry-picked? (6.1–6.2)",
    "Name the three failure modes. (7.1–7.3)",
    "What moved the system from 0% to 50%? (6.5)",
]


def qa_card(idx: str, q: str, a: str, grounds, see) -> str:
    meta = []
    if grounds and grounds != "—":
        meta.append(f'<span class="g">Grounds: {esc(grounds)}</span>')
    if see:
        meta.append(f'<span class="s">See: {esc(see)}</span>')
    meta_html = f'<div class="qmeta">{" &nbsp;·&nbsp; ".join(meta)}</div>' if meta else ""
    return (f'<div class="qa"><div class="q"><span class="qnum">{idx}</span>'
            f'<span>{q}</span></div><div class="a">{a}</div>{meta_html}</div>')


def build() -> str:
    today = datetime.date.today().strftime("%d %B %Y")

    top10 = "".join(f"<li>{esc(t)}</li>" for t in TOP10)
    intro = f"""
    <section class="part">
      <div class="kicker">How to use this bank</div>
      <h2 class="section">Viva Question Bank</h2>
      <p class="sub">Nine themed sections, each question with a short defensible answer. The
      <span class="accent">Grounds</span> tag cites the technical report section the answer comes from; <span class="accent">See</span>
      points to the matching scenario (Doc 1) or glossary term (Doc 3). Numbers are quoted, never invented.</p>
      <div class="toc10">
        <h3>If you only revise ten — the most likely questions</h3>
        <ol>{top10}</ol>
      </div>
      <div class="callout"><b>Answering style.</b> Lead with the one-line answer, then the mechanism, then a number if you have one.
      For any result, volunteer the caveat before you are asked — the honesty is the strongest part of the defence.</div>
    </section>
    """

    parts = [intro]
    for gnum, gtitle, gsub, items in GROUPS:
        cards = "".join(qa_card(f"{gnum}.{i+1}", q, a, g, s) for i, (q, a, g, s) in enumerate(items))
        parts.append(
            f'<section class="part"><div class="kicker">Section {esc(gnum)}</div>'
            f'<h2 class="section">{esc(gtitle)}</h2><p class="sub">{esc(gsub)}</p>'
            f'<div class="grp">{cards}</div></section>'
        )

    total = sum(len(items) for *_x, items in GROUPS)
    body = (
        QA_CSS
        + sp.cover(
            2, "Viva Question Bank",
            f"{total} questions a panel is likely to ask about OptiDBX, each with a grounded answer and a pointer back to the report, the scenarios, and the glossary.",
            [("Project", "OptiDBX — Safe PostgreSQL Auto-Tuning"),
             ("Document", "2 of the OptiDBX Study Series"),
             ("Grounded in", "docs/optidbx_technical_report.md"),
             ("Prepared", today)],
        )
        + "".join(parts)
        + '<footer class="doc-foot">OptiDBX Study Series &middot; Document 2 &mdash; Viva Question Bank. '
          'Answers are grounded in the OptiDBX Technical Report; section markers (e.g. §4.3) refer to it. '
          'Companion documents: 1 Demo Scenarios Study Guide, 3 Technical Terms Glossary, 5 Page-by-Page Presentation Scripts.</footer>'
    )
    return sp.page("OptiDBX — Viva Question Bank", body)


if __name__ == "__main__":
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = os.path.join(root, "docs", "optidbx_viva_question_bank.pdf")
    work = os.path.join(root, ".optidbx", "pdfbuild")
    sp.render_pdf(build(), out, work)
