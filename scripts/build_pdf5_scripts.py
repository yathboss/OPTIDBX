"""
OptiDBX Study Series — Document 5: Page-by-Page Presentation Scripts.

A spoken walkthrough for demonstrating the dashboard live. For every page it
gives what to SAY, what to DO (clicks / where to point), what to expect if
ASKED, and how to TRANSITION to the next page. Scripts match the current UI
and cross-reference the scenarios (Doc 1), viva answers (Doc 2), and glossary
(Doc 3).

Run:  python scripts/build_pdf5_scripts.py
Out:  docs/optidbx_presentation_scripts.pdf
"""

from __future__ import annotations
import datetime
import os

import studypdf as sp
from studypdf import esc

SCRIPT_CSS = """
<style>
  .flow { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 2px; font-size: 10px; color: #5b6675; }
  .flow .step { padding: 3px 9px; border-radius: 999px; background: #f1f3f6; }
  .flow .step.on { background: #f4610c; color: #fff; font-weight: 700; }
  .flow .arr { color: #c3ccd6; }

  .pg-card { border: 1px solid #e4e8ee; border-radius: 12px; padding: 0; margin: 0 0 18px;
             overflow: hidden; page-break-inside: avoid; }
  .pg-top { background: #fff8f3; border-bottom: 1px solid #f3ddc4; padding: 11px 16px;
            display: flex; align-items: baseline; gap: 10px; }
  .pg-n { font-weight: 800; color: #f4610c; font-size: 15px; }
  .pg-name { font-weight: 800; font-size: 15px; color: #101826; }
  .pg-purpose { margin-left: auto; color: #8a6a4f; font-size: 10px; font-style: italic;
                max-width: 58%; text-align: right; }
  .pg-body { padding: 13px 16px; }
  .blk { margin-bottom: 12px; }
  .blk:last-child { margin-bottom: 0; }
  .blk .lab { font-size: 9.5px; font-weight: 800; letter-spacing: .07em; text-transform: uppercase;
              display: inline-block; padding: 2px 9px; border-radius: 6px; margin-bottom: 6px; }
  .lab.say { background: #fff3ea; color: #d24e05; }
  .lab.do { background: #eef1f5; color: #47566a; }
  .lab.ask { background: #f2f0ee; color: #6a5140; }
  .lab.next { background: #fdf0e6; color: #b7560a; }
  .say-quote { border-left: 3px solid #f4610c; background: #fafbfc; border-radius: 0 8px 8px 0;
               padding: 9px 13px; font-size: 11.3px; color: #1e2733; line-height: 1.6; }
  .say-quote p { margin: 0 0 7px; }
  .say-quote p:last-child { margin: 0; }
  .blk ul { margin: 3px 0 0; padding-left: 20px; }
  .blk li { font-size: 10.6px; margin-bottom: 4px; color: #26313f; }
  .blk li b { color: #101826; }
  .askline { font-size: 10.4px; color: #26313f; }
  .askline b { color: #101826; }
  .nextline { font-size: 10.6px; color: #26313f; }
  .nextline b { color: #b7560a; }
  .timing { font-size: 9.3px; color: #8a94a3; margin-top: 3px; }
</style>
"""

FLOW = ["Home", "Scenarios", "Live Session", "Results & History", "Performance Study"]


def flow_bar(active_idx: int) -> str:
    cells = []
    for i, name in enumerate(FLOW):
        cells.append(f'<span class="step {"on" if i == active_idx else ""}">{esc(name)}</span>')
        if i < len(FLOW) - 1:
            cells.append('<span class="arr">→</span>')
    return f'<div class="flow">{"".join(cells)}</div>'


# Each page: idx, number label, name, purpose, say(list of paragraphs), do(list),
# ask(list of (q, pointer)), nxt(str), timing(str)
PAGES = [
    dict(
        idx=0, n="1", name="Home", purpose="Set the story: what OptiDBX is and why it is trustworthy.",
        timing="~60–90 seconds",
        say=[
            "This is OptiDBX — a safe auto-tuner for PostgreSQL. Its whole job is to watch a live database, "
            "make one small, reversible change when there is a genuine bottleneck, and keep that change only if the "
            "measurements prove it actually helped.",
            "The headline is this number: it went from never keeping a beneficial change to keeping half of them — "
            "and every kept change is backed by a real, measured improvement. The tagline sums up the philosophy: "
            "Understand, Tune, Verify.",
            "Below that we explain the signals it reads — the operating system's CPU, memory and disk, and the database "
            "itself — and the four steps it always follows: Monitor, Detect, Act safely, Verify.",
        ],
        do=[
            "Start on the hero. Point at the <b>0 → 50%</b> statistic as you say the headline.",
            "Scroll slowly through <b>How it works</b> (four steps) and the three pillars — <b>Smart, Safe, Honest</b>.",
            "Do not rush; this page is the promise you will prove on the later pages.",
        ],
        ask=[
            ("What exactly does it tune?", "One knob — max_parallel_workers_per_gather. Doc 2 Q2.1, Doc 3 term."),
            ("Is 50% good?", "Yes, and honest — it was 0% before. Full context in Doc 2 Q6.1–6.2."),
        ],
        nxt="Say: “Let me show you the situations it handles.” → click <b>Scenarios</b>.",
    ),
    dict(
        idx=1, n="2", name="Scenarios", purpose="Offer the menu of situations; pick one to walk through.",
        timing="~30 seconds on this page",
        say=[
            "These nine cards are the situations OptiDBX can face. Four end in a change being kept, one is caught and "
            "reverted, two correctly do nothing, and the last two show it staying inside its safe scope and its "
            "worst-case recovery.",
            "Each card shows its category, whether it is a simulated walkthrough or a live run, and the expected outcome. "
            "Let's open the clearest success case first.",
        ],
        do=[
            "Point out the grouping: keeps, a rollback, the no-action cases, scope & recovery.",
            "Note the <b>Simulated</b> vs <b>Live</b> badges — call this out; the honesty matters.",
            "Click <b>CPU / Parallelism Contention</b> (Scenario 1) to begin.",
        ],
        ask=[
            ("Are the simulated numbers made up?", "No — seeded from measured runs. Doc 1 honesty note, Doc 2 Q6.2."),
            ("Which should I demo?", "1 (keep) → 5 (rollback) → 6 (live, no-action). Doc 1 Part C order."),
        ],
        nxt="A scenario opens in the runner. Narrate the pipeline as it plays, then <b>Download PDF report</b> at the end.",
    ),
    dict(
        idx=1, n="2b", name="Scenarios → a scenario run", purpose="Prove the decision pipeline end to end.",
        timing="~60 seconds per scenario",
        say=[
            "Watch the pipeline across the top: Baseline, Detection, Apply, Observation, Decision, Report. On the left is "
            "the telemetry; on the right, a plain-language read-out of what the system is thinking at each step.",
            "It takes a warm baseline, then needs three consecutive bad readings before it will act — no reacting to a "
            "single spike. It applies one step down, measures the owned workload, and only keeps the change because the "
            "tail latency genuinely fell. The outcome card shows the before-and-after, and every run produces a PDF report.",
        ],
        do=[
            "Let the stepper advance; point at each stage as it lights up.",
            "At the end, read the <b>before/after bars</b> aloud (grey is before, orange is after).",
            "Click <b>Download PDF report</b> to show the artifact. Use <b>Replay</b> or go back for another scenario.",
        ],
        ask=[
            ("Why three readings?", "Debounce transient spikes. Doc 1 Scenario 7, Doc 2 Q3.4."),
            ("Why keep this one?", "Net-benefit rule — measured tail-latency gain, no regression. Doc 2 Q4.5."),
        ],
        nxt="Say: “That was illustrative — now the same pipeline on a real database.” → click <b>Live Session</b>.",
    ),
    dict(
        idx=2, n="3", name="Live Session", purpose="Run the identical pipeline against the real PostgreSQL backend.",
        timing="setup ~20 s, then the run (2–5 min)",
        say=[
            "This is the real thing. I pick a pressure level — Low, Medium or High — and a duration, then start. From here "
            "the interface is deliberately identical to the scenario you just saw, but every number is now measured live on "
            "PostgreSQL.",
            "While it runs, the controls lock so nothing disturbs the measurement, and I can pop open live metrics at any "
            "time. When the duration ends, it reaches a verdict on its own and produces the same before/after report — on "
            "a healthy database, the correct answer is often to change nothing, and it will say so.",
        ],
        do=[
            "Choose a profile (Medium is a safe default) and a duration, then click <b>Start live session</b>.",
            "Point out the <b>session lock</b> and the <b>Live metrics</b> popup button.",
            "If presenting time is short, start a short run earlier and return to it here already finishing.",
        ],
        ask=[
            ("Why did it do nothing?", "No sustained contention on a healthy host — correct. Doc 1 Scenario 6, Doc 2 Q6.4."),
            ("Is it really live?", "Yes — measured on the real backend; the badge says Live. Doc 2 Q8.5."),
        ],
        nxt="When it completes, say: “Every run is recorded.” → click <b>Results & History</b>.",
    ),
    dict(
        idx=3, n="4", name="Results & History", purpose="Show the audit trail and the exportable evidence.",
        timing="~30–45 seconds",
        say=[
            "Everything that has run — live sessions and simulated walkthroughs — is listed here, clearly labelled, newest "
            "first. Open any row and you get its before-and-after evidence and a downloadable PDF report.",
            "This is the accountability layer: nothing is hidden, live and simulated are never mixed up, and every claim on "
            "the earlier pages can be traced back to a specific run right here.",
        ],
        do=[
            "Point at the <b>Live</b> vs <b>Simulated</b> badges in the table.",
            "Open the live session you just ran; read its before/after and click <b>Download PDF</b>.",
            "Mention <b>Clear simulated history</b> exists for a clean start before a demo.",
        ],
        ask=[
            ("Where are live results stored?", "In PostgreSQL; simulated ones are local and labelled. Doc 2 Q8.5."),
            ("Can I trust the keeps?", "Yes — the same log shows the rollbacks and no-actions. Doc 2 Q9.3."),
        ],
        nxt="Say: “If you want a rigorous head-to-head, there's a dedicated study.” → click <b>Performance Study</b>.",
    ),
    dict(
        idx=4, n="5", name="Performance Study", purpose="Offer the fair, paired baseline-vs-tuned comparison for the sceptic.",
        timing="~45 seconds to explain (a full study runs for minutes)",
        say=[
            "This page is for the sceptic. It runs a fair, paired comparison: the same owned workload with unchanged "
            "settings versus with OptiDBX tuning, repeated and interleaved to cancel out ordering and cache effects.",
            "You fix the success criteria before the run — so the result can't be rationalised afterwards — and it reports "
            "queries per second, median and p95 latency for each side, with a clear verdict. Every claim stays linked to "
            "the exact runs that produced it.",
        ],
        do=[
            "Point at the two presets (<b>Pilot</b> for a quick look, <b>Evidence study</b> for the rigorous one).",
            "Show the config: workload, paired repetitions, warm-up, measurement seconds, starting parallelism.",
            "Note <b>success criteria fixed before the run</b> and that safety evidence is kept separate from speed.",
            "For a live demo use the Pilot preset; a full Evidence study is best run beforehand.",
        ],
        ask=[
            ("Why paired and interleaved?", "To cancel order/cache bias. Doc 2 Q4.3, Doc 3 'warm-up exclusion'."),
            ("Isn't the regime constructed?", "Yes, and we say so — Doc 2 Q6.2, report §8."),
        ],
        nxt="Close here, or loop back to Home for the summary line.",
    ),
]


def page_card(p: dict) -> str:
    say = "".join(f"<p>{esc(s)}</p>" for s in p["say"])
    do = "".join(f"<li>{d}</li>" for d in p["do"])
    ask = "".join(
        f'<li><b>“{esc(q)}”</b> — <span class="askline">{esc(ptr)}</span></li>'
        for q, ptr in p["ask"]
    )
    return f"""
    <div class="pg-card">
      <div class="pg-top">
        <span class="pg-n">{esc(p['n'])}</span>
        <span class="pg-name">{esc(p['name'])}</span>
        <span class="pg-purpose">{esc(p['purpose'])}</span>
      </div>
      <div class="pg-body">
        {flow_bar(p['idx'])}
        <div class="timing">Suggested timing: {esc(p['timing'])}</div>
        <div class="blk"><span class="lab say">Say this</span><div class="say-quote">{say}</div></div>
        <div class="blk"><span class="lab do">Do this</span><ul>{do}</ul></div>
        <div class="blk"><span class="lab ask">If asked</span><ul>{ask}</ul></div>
        <div class="blk"><span class="lab next">Then</span><p class="nextline">{p['nxt']}</p></div>
      </div>
    </div>
    """


def build() -> str:
    today = datetime.date.today().strftime("%d %B %Y")

    opening = """
    <section class="part">
      <div class="kicker">Before you start</div>
      <h2 class="section">Page-by-Page Presentation Scripts</h2>
      <p class="sub">A spoken walkthrough of the dashboard. Each page has four blocks: <b>Say this</b> (a script you can
      read aloud), <b>Do this</b> (clicks and where to point), <b>If asked</b> (quick answers with a pointer to the Viva
      Bank), and <b>Then</b> (how to move on). The orange trail shows where you are in the flow.</p>
      <div class="callout"><b>The one-line pitch</b> (memorise this): &ldquo;OptiDBX safely tunes one PostgreSQL knob on
      a live database — it changes something only when there's a real bottleneck, and keeps the change only when the
      measurements prove it helped.&rdquo;</div>
      <div class="callout"><b>Setup checklist.</b> Backend and dashboard running; on <b>Home</b> to start; optionally use
      <i>Clear simulated history</i> for a clean Results page; and, if you want to show a completed live run quickly, kick
      off a short Live Session a few minutes before you reach that page. Suggested full run: <b>7–9 minutes</b>.</div>
    </section>
    """

    cards = "".join(page_card(p) for p in PAGES)
    body_pages = (
        '<section class="part"><div class="kicker">The walkthrough</div>'
        '<h2 class="section">Five pages, in order</h2>'
        '<p class="sub">Home → Scenarios → Live Session → Results &amp; History → Performance Study.</p>'
        + cards + "</section>"
    )

    closing = """
    <section class="part">
      <div class="kicker">Landing it</div>
      <h2 class="section">Closing & handling questions</h2>
      <div class="callout"><b>Closing line.</b> &ldquo;So: it understands the system, tunes one thing safely, and verifies
      the result — keeping the change only when the numbers earn it, and doing nothing when nothing is wrong. That honesty
      is the point.&rdquo;</div>
      <p class="sub">Three reflexes for tough questions:</p>
      <ul class="tight">
        <li><b>Volunteer the caveat first.</b> The 50% keep rate is real but from a constructed, small-sample regime — say
        so before you're asked (Doc 2 Q6.2).</li>
        <li><b>Point to the evidence.</b> Any claim can be opened in Results &amp; History or reproduced in the Performance
        Study — don't argue, demonstrate.</li>
        <li><b>Fall back to the bank.</b> Every likely question has a grounded answer in Document 2; every term is in
        Document 3.</li>
      </ul>
    </section>
    """

    body = (
        SCRIPT_CSS
        + sp.cover(
            5, "Page-by-Page Presentation Scripts",
            "Exactly what to say and do on each page of the dashboard — Home, Scenarios, Live Session, Results & History, and Performance Study — with answers ready for every likely question.",
            [("Project", "OptiDBX — Safe PostgreSQL Auto-Tuning"),
             ("Document", "5 of the OptiDBX Study Series"),
             ("Use with", "the live dashboard open in front of you"),
             ("Prepared", today)],
        )
        + opening + body_pages + closing
        + '<footer class="doc-foot">OptiDBX Study Series &middot; Document 5 &mdash; Page-by-Page Presentation Scripts. '
          'Scripts match the current dashboard; pointers reference the companion documents. '
          'Companion documents: 1 Demo Scenarios Study Guide, 2 Viva Question Bank, 3 Technical Terms Glossary.</footer>'
    )
    return sp.page("OptiDBX — Page-by-Page Presentation Scripts", body)


if __name__ == "__main__":
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = os.path.join(root, "docs", "optidbx_presentation_scripts.pdf")
    work = os.path.join(root, ".optidbx", "pdfbuild")
    sp.render_pdf(build(), out, work)
