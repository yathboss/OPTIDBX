"""
OptiDBX Study Series — Document 1: Demo Scenarios Study Guide.

Explains every scenario the dashboard can demonstrate: what it shows, how the
decision pipeline behaves, the measured before/after evidence, why it matters,
and a one-line presenter script. All numbers are copied from
dashboard/src/scenarios.mjs, which in turn seeds them from the measured runs in
docs/optidbx_technical_report.md — nothing here is invented.

Run:  python scripts/build_pdf1_scenarios.py
Out:  docs/optidbx_scenarios_study_guide.pdf
"""

from __future__ import annotations
import datetime
import os

import studypdf as sp
from studypdf import esc, bars


# --- shared foundations (Part A) -------------------------------------------
PIPELINE = [
    ("Baseline", "Collect a warm, steady-state reading of the owned workload. No change yet."),
    ("Detection", "Require three consecutive problematic readings before acting — a single spike is ignored."),
    ("Apply", "Journal the action to disk, then reduce parallelism one approved step and verify the new value."),
    ("Observation", "Measure the effect on the owned workload itself — client p95 latency and throughput."),
    ("Decision", "Apply the net-benefit rule: keep only a measured improvement; otherwise revert."),
    ("Report", "Produce a before/after report with provenance and honest caveats."),
]

VERDICTS = [
    ("KEEP", "keep", "The change measurably helped and cleared the net-benefit threshold, so it was kept."),
    ("ROLLBACK", "rollback", "The change measurably hurt, so the original value was restored with a verified rollback."),
    ("NO_ACTION", "noaction", "No sustained contention was confirmed, so nothing was changed — correct restraint."),
    ("RECOMMENDATION", "recommendation", "A condition outside the safe automatic scope was surfaced for an operator, with evidence."),
    ("RECOVERY", "recovery", "A rollback could not be verified, so the tuner fails closed and blocks further actions."),
]


# --- the nine scenarios, mirrored from scenarios.mjs ------------------------
def applied(qb, qa, pb, pa):
    def pct(b, a):
        return None if not b else round((a - b) / b * 100, 1)
    return [
        {"label": "Owned throughput", "unit": "qps", "before": qb, "after": qa,
         "betterWhen": "higher", "change": pct(qb, qa)},
        {"label": "Owned p95 latency", "unit": "ms", "before": pb, "after": pa,
         "betterWhen": "lower", "change": pct(pb, pa)},
    ]


def observed(rows):
    def pct(b, a):
        return None if not b else round((a - b) / b * 100, 1)
    return [{**r, "change": pct(r["before"], r["after"])} for r in rows]


SCENARIOS = [
    {
        "n": 1, "id": "cpu-contention", "title": "CPU / Parallelism Contention",
        "cat": "CPU", "kind": "sim", "verdict": "KEEP",
        "demonstrates": "The core success case — a real bottleneck is found, one safe step is applied, and the measured improvement earns a KEEP.",
        "situation": "An over-parallelized server is under heavy analytical load. CPU sits at ~94%, ~30 parallel workers are active, context switches are high and query latency is climbing.",
        "stages": [
            ("Baseline", "Warm baseline collected in recommendation mode.", "CPU 94% · 30 workers · 280 ms"),
            ("Detection", "Three consecutive readings confirm sustained contention.", "CPU 95% · 31 workers · 293 ms"),
            ("Apply", "Journalled, then max_parallel_workers_per_gather 8 → 6, verified.", "CPU 93% · 24 workers · 270 ms"),
            ("Observation", "Owned workload measured for ~30 s (client p95 & QPS).", "CPU 92% · 22 workers · 250 ms"),
            ("Decision", "Throughput +4.3%, tail latency −8.8%: net benefit clears threshold.", "CPU 92% · 22 workers · 245 ms"),
        ],
        "action": "max_parallel_workers_per_gather 8 → 6 (kept)",
        "why": "Shows the whole point of the tool: it does not guess — it applies one reversible step and keeps it only because the owned-workload tail latency genuinely fell.",
        "script": "“Here the server is drowning in parallel workers. OptiDBX steps parallelism down once, measures a real 8.8% drop in tail latency, and keeps the change.”",
        "evidence": applied(10.16, 10.6, 439, 401),
        "glossary": ["max_parallel_workers_per_gather", "p95 latency", "net-benefit rule", "context switches"],
        "viva": "Why reduce parallelism to make a database faster?",
    },
    {
        "n": 2, "id": "reporting-peak", "title": "Analytical Reporting Peak",
        "cat": "DB", "kind": "sim", "verdict": "KEEP",
        "demonstrates": "The same success path under a different trigger — a burst of dashboard/report queries that saturates the CPU.",
        "situation": "Many reporting queries arrive together during a refresh storm. Every worker slot is busy and latency keeps rising.",
        "stages": [
            ("Baseline", "Warm baseline captured during the peak.", "CPU 92% · 28 workers · 300 ms"),
            ("Detection", "Latency climbs across three consecutive readings.", "CPU 96% · 31 workers · 318 ms"),
            ("Apply", "8 → 6 on owned sessions only, journalled and verified.", "CPU 94% · 23 workers · 300 ms"),
            ("Observation", "Queueing falls; queries complete more predictably.", "CPU 91% · 21 workers · 268 ms"),
            ("Decision", "Throughput +4.5%, tail latency −6.6%: KEPT.", "CPU 91% · 21 workers · 262 ms"),
        ],
        "action": "max_parallel_workers_per_gather 8 → 6 (kept)",
        "why": "Proves the behaviour generalises beyond one workload shape: a reporting peak is absorbed with lower tail latency at slightly higher throughput.",
        "script": "“A reporting storm hits. Same safe step, same honest measurement — 6.6% better tail latency, so we keep it.”",
        "evidence": applied(9.88, 10.32, 441, 412),
        "glossary": ["throughput (QPS)", "p95 latency", "owned workload"],
        "viva": "How does the tuner avoid acting only on the very peak second?",
    },
    {
        "n": 3, "id": "batch-window", "title": "Nightly Batch Window",
        "cat": "DB", "kind": "sim", "verdict": "KEEP",
        "demonstrates": "A sustained (not bursty) load — long overnight aggregations competing for cores.",
        "situation": "Heavy overnight aggregations pin the CPU for an extended period; individual aggregations fight each other for cores.",
        "stages": [
            ("Baseline", "Baseline taken after the batch warms up.", "CPU 93% · 29 workers · 330 ms"),
            ("Detection", "CPU pinned and workers saturated for three intervals.", "CPU 97% · 31 workers · 352 ms"),
            ("Apply", "One approved step down, applied and verified.", "CPU 95% · 24 workers · 335 ms"),
            ("Observation", "Same aggregate pace; less core contention per query.", "CPU 92% · 22 workers · 300 ms"),
            ("Decision", "Throughput +4.5%, tail latency −5.5%: KEPT.", "CPU 92% · 22 workers · 296 ms"),
        ],
        "action": "max_parallel_workers_per_gather 8 → 6 (kept)",
        "why": "Distinguishes a sustained bottleneck from a transient one (contrast Scenario 7): sustained contention is exactly what the action targets.",
        "script": "“The nightly batch keeps its pace, but the slowest aggregations get measurably faster. That earns a keep.”",
        "evidence": applied(9.72, 10.16, 480, 453),
        "glossary": ["parallel workers", "tail latency", "warm-up exclusion"],
        "viva": "What is the difference between throughput and latency here?",
    },
    {
        "n": 4, "id": "second-step", "title": "Second Step-Down",
        "cat": "CPU", "kind": "sim", "verdict": "KEEP",
        "demonstrates": "Cascading tuning done safely — after a first kept change, a second independent step from 6 to 4.",
        "situation": "A previous change (to 6) is already in effect and cooldown has finished, but contention is still confirmed on a fresh baseline.",
        "stages": [
            ("Baseline", "Fresh baseline — evidence never carries over between actions.", "CPU 93% · 24 workers · 295 ms"),
            ("Detection", "Contention re-confirmed over three new readings.", "CPU 95% · 25 workers · 308 ms"),
            ("Apply", "6 → 4, the next approved value (never arbitrary).", "CPU 93% · 18 workers · 290 ms"),
            ("Observation", "Second reduction measured on its own merits.", "CPU 90% · 16 workers · 262 ms"),
            ("Decision", "Throughput +4.6%, tail latency −8.5%: KEPT.", "CPU 90% · 16 workers · 256 ms"),
        ],
        "action": "max_parallel_workers_per_gather 6 → 4 (kept)",
        "why": "Shows the tuner can improve step by step without stacking evidence — each action gets its own fresh baseline, one change at a time.",
        "script": "“Contention persists, so we take one more approved step to 4 — judged against its own fresh baseline, not the first change's.”",
        "evidence": applied(11.28, 11.8, 404, 370),
        "glossary": ["cooldown", "approved values", "fresh baseline"],
        "viva": "Why not jump straight from 8 to 4 in one move?",
    },
    {
        "n": 5, "id": "change-backfired", "title": "Change Made It Worse",
        "cat": "DB", "kind": "sim", "verdict": "ROLLBACK",
        "demonstrates": "The safety net — a change is applied, the observation shows a regression, and it is reverted.",
        "situation": "Contention is confirmed and a reduction is applied, but under observation the owned workload degrades instead of improving.",
        "stages": [
            ("Baseline", "Warm baseline on the owned workload.", "CPU 91% · 28 workers · 260 ms"),
            ("Detection", "Contention confirmed; a reduction is recommended.", "CPU 93% · 30 workers · 275 ms"),
            ("Apply", "Journalled, applied 8 → 6, verified.", "CPU 92% · 24 workers · 280 ms"),
            ("Observation", "Owned workload gets worse — throughput down, latency up.", "CPU 93% · 24 workers · 300 ms"),
            ("Decision", "Throughput −7.4%, tail latency +8.7%: ROLLED BACK.", "CPU 92% · 28 workers · 285 ms"),
        ],
        "action": "Reverted to max_parallel_workers_per_gather 8",
        "why": "This is the credibility scenario: the tuner keeps changes only when they help. When a change backfires, the verified rollback restores the original setting.",
        "script": "“This time the change hurt — throughput fell 7.4%. The safety net catches it and reverts, verified. That's why you can trust the keeps.”",
        "evidence": applied(11.4, 10.56, 387, 421),
        "glossary": ["verified rollback", "net-benefit rule", "regression guard"],
        "viva": "How do you know a rollback actually restored the old value?",
    },
    {
        "n": 6, "id": "well-provisioned", "title": "Well-Provisioned Server",
        "cat": "CPU", "kind": "live", "verdict": "NO_ACTION",
        "demonstrates": "Restraint on a healthy database — and this one runs live against the real backend.",
        "situation": "A healthy, non-oversubscribed database. CPU has headroom and only a few parallel workers are active.",
        "stages": [
            ("Baseline", "Real workload starts; telemetry streams in.", "CPU 46% · 3 workers · 120 ms"),
            ("Detection", "No sustained contention; counter never reaches three.", "CPU 52% · 3 workers · 130 ms"),
            ("Decision", "No bottleneck, no action — reported honestly.", "CPU 50% · 3 workers · 128 ms"),
        ],
        "action": "No change applied",
        "why": "A tuner that always changes something is dangerous. Doing nothing on a healthy system — and saying so — is the correct, honest outcome.",
        "script": "“This one is live. The database is healthy, so OptiDBX does nothing — and tells you why. Restraint is a feature.”",
        "evidence": observed([
            {"label": "CPU utilisation", "unit": "%", "before": 46, "after": 50, "betterWhen": "lower"},
            {"label": "Query latency", "unit": "ms", "before": 120, "after": 128, "betterWhen": "lower"},
            {"label": "Parallel workers", "unit": "", "before": 3, "after": 3, "betterWhen": "lower"},
        ]),
        "glossary": ["NO_ACTION", "oversubscription", "recommendation mode"],
        "viva": "When is the right answer to change nothing?",
    },
    {
        "n": 7, "id": "transient-spike", "title": "Transient Spike",
        "cat": "OS", "kind": "sim", "verdict": "NO_ACTION",
        "demonstrates": "Noise rejection — one bad reading is not a bottleneck.",
        "situation": "A momentary spike appears, then conditions return to normal within the next interval.",
        "stages": [
            ("Baseline", "A quiet baseline is collected.", "CPU 55% · 4 workers · 140 ms"),
            ("Detection", "One interval spikes (1 of 3); next reading resets it to 0.", "CPU 96% · 12 workers · 260 ms"),
            ("Decision", "Not sustained across three readings, so no action.", "CPU 57% · 4 workers · 145 ms"),
        ],
        "action": "No change applied",
        "why": "Demonstrates why the three-consecutive-reading rule exists: it prevents the tuner from overreacting to a single blip and thrashing the configuration.",
        "script": "“CPU spikes for one second, then recovers. The three-reading rule refuses to act on noise — no change.”",
        "evidence": observed([
            {"label": "CPU utilisation", "unit": "%", "before": 55, "after": 57, "betterWhen": "lower"},
            {"label": "Query latency", "unit": "ms", "before": 140, "after": 145, "betterWhen": "lower"},
            {"label": "Peak CPU during spike", "unit": "%", "before": 55, "after": 96, "betterWhen": "lower"},
        ]),
        "glossary": ["three-reading confirmation", "debouncing", "false positive"],
        "viva": "Why require three readings instead of acting immediately?",
    },
    {
        "n": 8, "id": "memory-pressure", "title": "Memory Pressure",
        "cat": "DB", "kind": "sim", "verdict": "RECOMMENDATION",
        "demonstrates": "Staying inside a safe scope — a real problem is detected but is not one the tuner is approved to fix automatically.",
        "situation": "Memory utilisation climbs and temporary files spill to disk. This is a genuine issue, but memory/OS tuning is outside the approved automatic action set.",
        "stages": [
            ("Baseline", "Baseline collected as memory climbs.", "CPU 70% · 6 workers · 190 ms · mem 78%"),
            ("Detection", "High memory and temp-file spill detected and explained.", "CPU 74% · 6 workers · 220 ms · mem 90%"),
            ("Decision", "Out of safe scope — surfaced as an operator recommendation.", "CPU 73% · 6 workers · 218 ms · mem 90%"),
        ],
        "action": "Recommendation only — no automatic change",
        "why": "Shows disciplined boundaries: the tuner explains a problem with evidence instead of reaching for a knob it was never approved to touch.",
        "script": "“It clearly sees the memory pressure — but memory tuning isn't in its safe scope, so it hands the operator an explained recommendation instead of guessing.”",
        "evidence": observed([
            {"label": "Memory utilisation", "unit": "%", "before": 78, "after": 90, "betterWhen": "lower"},
            {"label": "Query latency", "unit": "ms", "before": 190, "after": 220, "betterWhen": "lower"},
            {"label": "CPU utilisation", "unit": "%", "before": 70, "after": 74, "betterWhen": "lower"},
        ]),
        "glossary": ["RECOMMENDATION", "safe action scope", "temp-file spill"],
        "viva": "Why not let the tuner also fix memory settings?",
    },
    {
        "n": 9, "id": "recovery", "title": "Rollback Failure → Recovery",
        "cat": "DB", "kind": "sim", "verdict": "RECOVERY",
        "demonstrates": "The strongest safety guarantee — fail-closed behaviour when a rollback cannot be verified.",
        "situation": "A change underperforms and a rollback is requested, but restoration cannot be verified.",
        "stages": [
            ("Apply", "Change journalled to disk before any mutation.", "CPU 92% · 26 workers · 270 ms"),
            ("Observation", "Change underperforms; rollback requested.", "CPU 93% · 26 workers · 300 ms"),
            ("Recovery", "ROLLBACK_FAILED: keep original sessions, block all further actions.", "CPU 93% · 26 workers · 300 ms"),
        ],
        "action": "Fail-closed — further actions blocked pending an operator",
        "why": "The worst case is an ambiguous state. Here the durable journal stays authoritative, new connections cannot impersonate the recovery target, and the system refuses to do anything risky until a human resolves it.",
        "script": "“If it can't even verify a rollback, it stops — keeps the original sessions, blocks new actions, and waits for a human. Fail-closed, never fail-dangerous.”",
        "evidence": observed([
            {"label": "Query latency", "unit": "ms", "before": 270, "after": 300, "betterWhen": "lower"},
            {"label": "Parallel workers", "unit": "", "before": 26, "after": 26, "betterWhen": "lower"},
        ]),
        "glossary": ["fail-closed", "recovery journal", "ROLLBACK_FAILED"],
        "viva": "What happens if a rollback itself fails?",
    },
]

VMAP = {v: cls for v, cls, _ in VERDICTS}
VLABEL = {
    "KEEP": "Change kept", "ROLLBACK": "Change reverted", "NO_ACTION": "No change required",
    "RECOMMENDATION": "Recommendation only", "RECOVERY": "Recovery engaged",
}


def scenario_card(s: dict) -> str:
    stage_rows = "".join(
        f"<tr><td><b>{esc(st[0])}</b></td><td>{esc(st[1])}</td><td class='muted'>{esc(st[2])}</td></tr>"
        for st in s["stages"]
    )
    gloss = ", ".join(esc(g) for g in s["glossary"])
    kind_tag = ('<span class="tag live">Live</span>' if s["kind"] == "live"
                else '<span class="tag sim">Simulated</span>')
    return f"""
    <div class="scn">
      <div class="scn-head">
        <span class="scn-num">{s['n']}</span>
        <span class="scn-title">{esc(s['title'])}</span>
        <span class="scn-tags">
          <span class="tag cat">{esc(s['cat'])}</span>
          {kind_tag}
          <span class="verdict {VMAP[s['verdict']]}">{esc(VLABEL[s['verdict']])}</span>
        </span>
      </div>
      <p class="demonstrates"><b>What it demonstrates.</b> {esc(s['demonstrates'])}</p>
      <h4>The situation</h4>
      <p>{esc(s['situation'])}</p>
      <h4>Pipeline walkthrough</h4>
      <table class="grid"><thead><tr><th style="width:80px">Stage</th><th>What happens</th><th style="width:140px">Key telemetry</th></tr></thead>
        <tbody>{stage_rows}</tbody></table>
      <h4>Outcome &amp; evidence &mdash; {esc(s['action'])}</h4>
      {bars(s['evidence'])}
      <h4>Why it matters</h4>
      <p>{esc(s['why'])}</p>
      <div class="connect">
        <div class="box"><b>Presenter script</b>{esc(s['script'])}</div>
        <div class="box"><b>Connects to</b>Glossary (Doc 3): {gloss}.<br>Likely viva (Doc 2): &ldquo;{esc(s['viva'])}&rdquo;</div>
      </div>
    </div>
    """


def build() -> str:
    today = datetime.date.today().strftime("%d %B %Y")

    # Part A — foundations
    pipe = "".join(
        f"<tr><td><b>{i+1}. {esc(n)}</b></td><td>{esc(d)}</td></tr>"
        for i, (n, d) in enumerate(PIPELINE)
    )
    verds = "".join(
        f'<tr><td><span class="verdict {cls}">{esc(v)}</span></td><td>{esc(d)}</td></tr>'
        for v, cls, d in VERDICTS
    )
    part_a = f"""
    <section class="part">
      <div class="kicker">Part A</div>
      <h2 class="section">The shared foundation</h2>
      <p class="sub">Every scenario below is the same machine seen under different conditions. Read this once; then each scenario just varies the inputs.</p>

      <div class="callout"><b>One knob.</b> OptiDBX tunes a single PostgreSQL parameter,
      <span class="accent">max_parallel_workers_per_gather</span>, and only ever moves it between the
      approved values <b>1, 2, 4, 6, 8</b> — one step at a time. A narrow, reversible action is what makes
      acting on a live database safe.</div>

      <h4>The six-stage decision pipeline</h4>
      <table class="grid"><thead><tr><th style="width:120px">Stage</th><th>Purpose</th></tr></thead><tbody>{pipe}</tbody></table>

      <div class="callout"><b>The net-benefit rule.</b> A change is kept only if the <b>owned workload</b>
      — the queries OptiDBX itself is running — shows a real improvement in client-observed
      <b>p95 latency</b> and <b>throughput</b>, with no latency regression. It is judged on what the user
      feels, not on noisy database-wide counters.</div>

      <h4>The five possible verdicts</h4>
      <table class="grid"><thead><tr><th style="width:150px">Verdict</th><th>Meaning</th></tr></thead><tbody>{verds}</tbody></table>

      <h4>How to read each scenario card</h4>
      <ul class="tight">
        <li><b>Tags</b> show the category (CPU / DB / OS), whether it is <b>Simulated</b> or <b>Live</b>, and the expected verdict.</li>
        <li><b>Pipeline walkthrough</b> traces the six stages with the telemetry at each step.</li>
        <li><b>Before/after bars</b> — grey is <i>before</i>, orange is <i>after</i>; the chip shows the percentage change (orange = improvement).</li>
        <li><b>Presenter script</b> is a line you can say out loud; <b>Connects to</b> points to the companion documents.</li>
      </ul>
    </section>
    """

    # Part B — scenarios, grouped
    def group(title, blurb, ids):
        cards = "".join(scenario_card(s) for s in SCENARIOS if s["id"] in ids)
        return f'<h3 style="font-size:15px;margin:18px 0 4px">{esc(title)}</h3><p class="muted" style="margin-bottom:12px">{esc(blurb)}</p>{cards}'

    part_b = f"""
    <section class="part">
      <div class="kicker">Part B</div>
      <h2 class="section">The nine scenarios</h2>
      <p class="sub">Grouped by what they prove: that the tuner acts when it should, reverts when it must, and shows restraint when nothing is wrong.</p>
      {group("Success — a change is kept (4)", "A genuine bottleneck is found and one safe step delivers a measured improvement.", ["cpu-contention","reporting-peak","batch-window","second-step"])}
      {group("Safety — a change is reverted (1)", "The change hurt, so it is undone with a verified rollback.", ["change-backfired"])}
      {group("Restraint — no change is made (2)", "Nothing warranted a change; doing nothing is the correct answer.", ["well-provisioned","transient-spike"])}
      {group("Scope & recovery (2)", "Problems outside the safe action set, and fail-closed behaviour when a rollback cannot be verified.", ["memory-pressure","recovery"])}
    </section>
    """

    # Part C — at a glance
    def rowline(s):
        return (f"<tr><td>{s['n']}</td><td><b>{esc(s['title'])}</b></td><td>{esc(s['cat'])}</td>"
                f"<td>{'Live' if s['kind']=='live' else 'Sim'}</td>"
                f"<td><span class='verdict {VMAP[s['verdict']]}'>{esc(VLABEL[s['verdict']])}</span></td>"
                f"<td>{esc(s['action'])}</td></tr>")
    at_glance = "".join(rowline(s) for s in SCENARIOS)
    part_c = f"""
    <section class="part">
      <div class="kicker">Part C</div>
      <h2 class="section">All nine at a glance</h2>
      <p class="sub">A single table to revise from, and a suggested order for a live walk-through.</p>
      <table class="grid"><thead><tr><th style="width:24px">#</th><th>Scenario</th><th>Cat.</th><th>Type</th><th style="width:130px">Verdict</th><th>Action</th></tr></thead>
        <tbody>{at_glance}</tbody></table>
      <div class="callout"><b>Suggested running order.</b> Open with <b>1 (CPU / Parallelism Contention)</b> to
      show a clean keep, then <b>5 (Change Made It Worse)</b> so the audience sees the rollback that makes the keeps
      trustworthy, then <b>6 (Well-Provisioned, live)</b> to prove restraint on the real backend. Use 2–4 to show
      the keep generalises, and 7–9 if asked about noise, scope, or worst-case safety.</div>
      <div class="callout"><b>Honesty note.</b> Scenarios marked <b>Simulated</b> are illustrative walk-throughs whose
      numbers are seeded from measured runs (see the Technical Report); the one marked <b>Live</b> measures the real
      PostgreSQL backend. A single before/after observation does not by itself prove causation or a general speedup.</div>
    </section>
    """

    body = (
        sp.cover(
            1, "Demo Scenarios Study Guide",
            "The nine scenarios OptiDBX can demonstrate — what each one proves, the measured before/after, and exactly what to say when you present it.",
            [("Project", "OptiDBX — Safe PostgreSQL Auto-Tuning"),
             ("Document", "1 of the OptiDBX Study Series"),
             ("Source of numbers", "dashboard/src/scenarios.mjs → docs/optidbx_technical_report.md"),
             ("Prepared", today)],
        )
        + part_a + part_b + part_c
        + '<footer class="doc-foot">OptiDBX Study Series &middot; Document 1 &mdash; Demo Scenarios Study Guide. '
          'Numbers copied verbatim from the dashboard scenario library; simulated and live runs are labelled throughout. '
          'Companion documents: 2 Viva Question Bank, 3 Technical Terms Glossary, 5 Page-by-Page Presentation Scripts.</footer>'
    )
    return sp.page("OptiDBX — Demo Scenarios Study Guide", body)


if __name__ == "__main__":
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = os.path.join(root, "docs", "optidbx_scenarios_study_guide.pdf")
    work = os.path.join(root, ".optidbx", "pdfbuild")
    sp.render_pdf(build(), out, work)
