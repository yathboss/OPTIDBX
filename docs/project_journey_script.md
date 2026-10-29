# OptiDBX — My Project Journey (Personal Script)

> A first-person account of what I built, what broke, how I fixed it, and what I
> learned. Written to be spoken or read. Three lengths: 30-second, 2-minute, and
> the full story. Everything here is honest — including the failures, which are
> the best part.

---

## The 30-second version (elevator pitch)

- I built **OptiDBX**, a system that watches a live PostgreSQL database, detects
  when it's struggling, safely changes one setting, and then **checks whether the
  change actually helped** — keeping it only if it did, and undoing it if it
  didn't.
- When I inherited it, the tuner had **never once succeeded** — every action it
  ever took got rolled back. Zero wins in its entire history.
- I found *why*, fixed it, and got it to genuinely keep beneficial changes — a
  **50% success rate** under the conditions it's designed for — and I did it
  **honestly**: I caught and threw away a result that looked twice as good as it
  really was.

---

## The 2-minute version

- **What it is:** OptiDBX auto-tunes PostgreSQL's query parallelism
  (`max_parallel_workers_per_gather`). It monitors the OS and the database,
  detects CPU/parallelism contention, reduces parallelism by one safe step,
  observes for 30 seconds, and decides **KEEP** or **ROLLBACK** — with a full
  safety net (verified rollback, fail-closed recovery).
- **The problem I hit:** the tuner had **0 KEEP outcomes ever**. It could detect
  and safely undo, but it had never proven it improved anything.
- **Root cause #1 — it measured the wrong thing.** The keep/rollback decision was
  based on *database-wide* statistics that barely move when you tune one workload.
  I switched it to measure the **actual owned workload's** query latency and
  throughput, client-side.
- **Root cause #2 — a hidden bug.** In automatic mode the tuner could *never*
  apply a stable recommendation because it never refreshed the recommendation's
  timestamp — so every auto-approval silently failed the freshness check. One-line
  class of fix; huge impact.
- **The honesty moment:** my first "win" showed a ~2× improvement. I didn't trust
  it — I re-measured properly and proved it was a **cold-start artifact** (I was
  comparing a warm system against a cold one). The real gain was much smaller. I
  deleted the fake win and kept the truth.
- **The result:** on a genuinely overloaded database, the tuner now detects,
  applies, and keeps real improvements — **50% keep rate**, every kept change
  backed by a measured latency improvement, every rejected change correctly
  declined. On a healthy database it correctly does **nothing** — which is also
  the right answer.

---

## 🏆 What I achieved (the wins, at a glance)

- **Took the tuner from 0 → working.** It had **never once** kept a beneficial
  change in its entire history; I got it to genuinely detect, apply, and keep real
  improvements.
- **Hit the target honestly: 50% KEEP rate** among completed evaluations under the
  conditions the tuner is built for — every kept change backed by a measured
  latency improvement, every rejected one correctly declined.
- **Found the root cause of the failure** — the decision was measuring the wrong
  thing (database-wide stats) — and rewired it to use **real owned-workload p95
  latency and throughput**.
- **Fixed a silent, critical bug** — in auto mode the tuner could never apply a
  stable recommendation (stale-timestamp freshness check). This alone likely
  explains years of zero KEEPs.
- **Built the decision layer:** net-benefit KEEP policy (with a hard latency-cap),
  rejection memory, and a warm-up-aware baseline.
- **Protected the project's integrity** — caught a result that looked ~2× better
  than reality, proved it was a cold-start artifact, and discarded it instead of
  shipping it.
- **Ran a real empirical study** — characterized exactly *when* reducing
  parallelism helps (CPU oversubscription) and *why it didn't* on a healthy box
  (16 cores vs an 8-worker pool; query only used 3 workers), using sweeps and
  `EXPLAIN ANALYZE`.
- **Hardened it with 250 passing tests** and kept the whole system green.
- **Produced professional deliverables** — a full technical report + polished PDF,
  a UI build plan, and this journey script.
- **Kept a live end-to-end system running** — FastAPI backend + React dashboard +
  real PostgreSQL — and recovered ~64 GB when the machine's disk hit zero mid-run.

---

## The full story

### 1. The mission
- I'm the **Autotuner & Integration lead** on OptiDBX, a team project to build a
  safe, explainable, measurable database auto-tuner.
- The autotuner's job: turn raw OS + PostgreSQL telemetry into a *decision* — is
  there a real bottleneck, and if so, is there a safe change worth making?

### 2. The wall I inherited
- History check: **38 experiments, 13 applied actions, every single one rolled
  back. Zero KEEPs.** The tuner had never demonstrated a real improvement.
- The goal I set: reach **at least 50% KEEP among valid evaluations** — but
  *honestly*, not by lowering the bar or faking numbers.

### 3. The investigation
- I traced exactly how the KEEP/ROLLBACK decision was made and found **two
  separate measurement systems** in the codebase — and the decision was using the
  wrong one:
  - It judged success on **database-wide throughput/latency** (server counters
    that include background noise and barely respond to tuning one workload).
  - Meanwhile a **client-observed, owned-workload** measurement already existed —
    it just wasn't wired into the decision.

### 4. What I built
- **Owned-workload measurement:** KEEP/ROLLBACK now uses the real per-query
  latency (p95) and throughput of the sessions the tuner actually controls.
- **Net-benefit policy:** keep a change when the weighted throughput gain
  outweighs the latency cost, with a hard cap so a latency blow-up is never kept.
- **Rejection memory:** remember a reduction that didn't help so it isn't retried
  under the same conditions.
- **Warm-up-aware baseline:** never compare a cold baseline against a warm result.

### 5. The failures and dead-ends (the real grind)
- **The fake 2× win.** My first live KEEP looked amazing (~2× throughput). I
  re-measured with proper warm-up handling and it *vanished* — it was a cold-start
  artifact. Painful, but catching it was the right call.
- **"It just doesn't help here."** On my 16-core machine, reducing parallelism did
  nothing — sweeps were flat. I dug in with `EXPLAIN ANALYZE` and found the query
  only ever used **3 workers** and was memory-bandwidth-bound, not CPU-bound. The
  machine simply wasn't oversubscribed (16 cores, but PostgreSQL's worker pool was
  capped at 8). There was genuinely nothing to fix — and reporting *that* honestly
  is itself correct behavior.
- **The paired study that failed.** My rigorous benchmark run died on a query
  cancellation — a real limitation I documented rather than hid.
- **The monitor starving itself.** When I finally created real CPU pressure, the
  tuner's *own monitoring loop* got starved by the load it was supposed to watch,
  so it couldn't act. I had to reserve CPU for the monitor (core pinning) to fix it.
- **The disk crisis.** Mid-experiment the machine's C: drive hit **0 bytes free**
  from accumulated logs; I had to stop the bleed, diagnose it, and reclaim ~64 GB
  (Windows.old + caches) before continuing.

### 6. The breakthroughs
- **The auto-approve bug.** The single most important fix: in auto mode the tuner
  reused a recommendation with its *original* timestamp while the baseline window
  moved on, so the freshness check rejected it forever. It could never apply a
  stable recommendation. Refreshing the timestamp (matching the manual path) is
  almost certainly a big reason it had never recorded a KEEP.
- **Proving the benefit is real.** I constructed the exact condition the tuner is
  built for — a genuinely CPU-oversubscribed, over-parallelized database — and a
  controlled sweep showed reducing parallelism **halved tail latency** at equal
  throughput. A real, measurable win.
- **Hitting the goal honestly.** In closed-loop runs the tuner reached a
  **50% keep rate**: it kept the changes that measurably helped and rolled back
  the ones that didn't (including one that genuinely made things worse — correctly
  reverted).

### 7. What I shipped
- The engineering fixes, all covered by **250 passing tests**.
- A professional **technical report** (and a polished PDF) documenting the design,
  methodology, results, and honest limitations.
- A running end-to-end system: FastAPI backend + React dashboard + real PostgreSQL.

### 8. What I learned
- **Measurement beats cleverness.** The difference between "never works" and "50%
  success" wasn't a smarter algorithm — it was measuring the right thing, the right
  way, and fixing the plumbing.
- **The scariest bugs are silent.** The cold-start artifact and the timestamp bug
  didn't crash — they quietly produced wrong answers. For an autonomous system,
  that's the most dangerous class of failure.
- **"Do nothing" is a valid, honest answer.** A tuner that correctly makes no
  change when there's nothing to gain is working — not failing.
- **Integrity is the product.** I could have shipped the fake 2×. Choosing the
  true, smaller number is what makes the result trustworthy.

---

## Lines I can actually say to a judge

- *"It had never worked — zero successes in its whole history. I found out why, and
  fixed it."*
- *"My first result looked twice as good as it really was. I proved it was a
  measurement artifact and threw it away — because a database tuner that lies to
  you is worse than one that does nothing."*
- *"The hardest bug wasn't a crash — it was a silent one that made the system
  reject every automatic action forever."*
- *"On a healthy server it correctly does nothing. On an overloaded one it keeps
  changes that genuinely help — 50% of the time, every one backed by a real
  measurement."*

---

*Honest note to self: the 50% result was demonstrated under a deliberately
overloaded (over-parallelized) database — the exact condition the tool targets —
and the scripted demo scenarios are illustrative, seeded from real measured runs.
Keep that framing; it's what makes the story bulletproof.*
