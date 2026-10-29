# OptiDBX "Presentation Studio" — Judge-Facing Guided Demo UI (Plan)

> **Status:** SAVED — not started. Implement in a later session on branch
> `yatharth-autotuner`. Keep everything local (no push) unless explicitly asked.

---

## 1. Context

- **Problem:** The current dashboard is hard to present to a judge — no clear
  starting point, no reliable "impressive" outcome during a timed demo, and no
  support for the presenter to narrate. The presenter is unsure what to do or
  where to start.
- **Desired outcome:** A sequential, visually striking, judge-facing flow —
  pick a scenario → click **Start** → a guided run the presenter can talk over →
  an engaging progress popup (not a dead wait) → an auto-generated report.
- **Hard constraint (integrity):** A guaranteed KEEP requires genuine CPU
  oversubscription that cannot be set up cleanly from the UI on this hardware.
  The system's credibility rests on honesty, so **simulated vs live must be clearly
  labeled**, and simulated numbers must be **seeded from real measured runs**.

### Confirmed decisions
1. **Hybrid scenarios** — 5-6 scripted scenarios (badged *"Illustrative — seeded
   from measured runs"*) **plus** at least one real **Live** run.
2. **New "Presentation" tab as the default landing**; existing tabs
   (Demo / Live Metrics / Recommendations / Results & Reports) stay intact.
3. **Bold visual redesign** in a **white + orange** light theme.

---

## 2. Current code to reuse (do not rebuild)

| File | Role / reuse |
|---|---|
| `dashboard/src/App.jsx` | Tab router + 5 s polling of the real API; renders `DemoView` for the `demo` tab. Add a `present` tab, make it default. |
| `dashboard/src/components/DemoView.jsx` | Existing real 6-step guided flow; reuse its lifecycle/stepper patterns. |
| `dashboard/src/demoModel.mjs` | `buildReport`, `reportCsv`, `phaseIndex` — reuse for the auto-report. |
| `dashboard/src/components/ReportButton.jsx`, `BeforeAfterCard.jsx`, `MetricCard.jsx`, `TimeSeriesChart.jsx`, `Notifications.jsx` | Reuse for report, gauges, trends, toasts. |
| `dashboard/src/services/api.js` | Real backend calls (`startWorkload`, `getTunerStatus`, `getWorkloadStatus`, `approve`, `rollback`, `getDemoSetup`, …). Used by the **Live** scenario. No simulation layer exists today. |
| `dashboard/src/components/Header.jsx` | Tab nav — add "Presentation". |
| `dashboard/src/index.css` | CSS-variable design system (currently dark). |

---

## 3. Scenarios (numbers seeded from `docs/optidbx_technical_report.md`, §6)

Each scenario animates the real pipeline stages
(**Baseline → Detect 3/3 → Apply → Observe → Decision → Report**) with per-stage
telemetry and presenter cues.

| # | Scenario | Flow / outcome | Kind |
|---|---|---|---|
| 1 | **CPU / Parallelism Contention** | detect → reduce `8→6` → **KEEP** (owned QPS +4.3%, p95 −8.8%) | scripted |
| 2 | **Well-Provisioned Server** | detect nothing → **No Action** (honest restraint) | **LIVE** on this host |
| 3 | **Change Backfired** | apply → observe worse → **ROLLBACK** (QPS −7.4%, p95 +8.7%) | scripted |
| 4 | **Transient Spike** | 1 bad reading then normal → **No trigger** (3-reading rule) | scripted |
| 5 | **Memory Pressure** | detected + explained → **recommendation only** (scope-limited; no auto memory/OS tuning) | scripted |
| 6 | **Rollback Failure → Recovery** | fail-closed safety → `ROLLBACK_FAILED` + recovery | scripted |

The scenario mix deliberately showcases the system's differentiators: it is
**smart** (acts on real contention), **safe** (verified rollback, fail-closed
recovery), and **honest** (does nothing when no benefit exists).

---

## 4. Architecture / files

### New
- **`dashboard/src/scenarios.mjs`** — scenario definitions: `id`, `title`,
  `subtitle`, `icon`, `category` (OS/DB), `kind` (`scripted` | `live`),
  `stages[]` (each: `key`, `label`, `durationMs`, `telemetry` snapshot,
  `tunerState`, `cue` narration, optional `notify`), `outcome`, and a `reportSeed`
  (before/after owned metrics). **All scripted numbers sourced from the technical
  report — no fabricated values.**
- **`dashboard/src/components/PresentationView.jsx`** — orchestrator with three
  phases: **gallery → run → report**. Holds the scenario "player": a timer-driven
  reducer for `scripted`; real polling (reuse `api.*`) for `live`.
- **`dashboard/src/components/ScenarioGallery.jsx`** — responsive card grid of the
  6 scenarios; each card shows category, expected outcome, and a scripted/live badge.
- **`dashboard/src/components/MissionControl.jsx`** — the run screen: animated
  pipeline stepper, live gauges (adapt `MetricCard`) + mini trend
  (`TimeSeriesChart`), a countdown, a current-stage explainer, the **start popup**,
  and a **presentation-speed** control (Fast ~60-90 s / Realtime).
- **`dashboard/src/components/PresenterCues.jsx`** — "say this now" talking-point
  panel synced to the current stage (addresses "I don't know what to say / where
  to start").

### Modify
- **`Header.jsx`** — add "Presentation" as the first tab.
- **`App.jsx`** — `useState('present')` default; render `<PresentationView/>` for
  the `present` tab; leave other tabs unchanged.
- **`index.css`** — add white+orange theme tokens and Presentation Studio styles.

### Reuse for the auto-report
- `demoModel.buildReport` / `reportCsv` + `ReportButton` + `BeforeAfterCard`;
  stamp each report **SIMULATED** or **LIVE**.

---

## 5. Theme (white + orange, bold)

- Light palette via CSS variables:
  - `--bg #ffffff`, `--surface #f7f8fa`, `--text #1a2230`
  - `--primary #f4610c`, `--primary-600 #d24e05`, `--accent #ffb020` (amber)
  - `--success #1f9d55`, `--danger #e5484d`
  - soft shadows, 12-16 px radii
- Scope the light theme to a `.studio` wrapper on the Presentation view first
  (so existing dark tabs keep working); optionally migrate the global theme later.
- Animations: active-stage pulse, gauge-fill transitions, stage cross-fades,
  a tasteful highlight/confetti on KEEP.

---

## 6. Honesty guardrails (non-negotiable)

- Every scripted scenario shows a persistent badge:
  *"Illustrative simulation — values seeded from measured runs (see technical report)."*
- Generated reports are stamped **SIMULATED** (scripted) or **LIVE** (real backend).
- The Live scenario uses only real `api.*` calls; no scripted numbers.

---

## 7. Build order (phased)

1. Theme tokens + Presentation tab scaffold + `ScenarioGallery` (static cards).
2. `scenarios.mjs` data + `MissionControl` scripted player + `PresenterCues`
   + start popup.
3. Auto-report at run end (reuse `buildReport` / `ReportButton`) + honesty badges.
4. Live scenario path (real backend) + presentation-speed control.
5. Polish: animations, responsiveness, KEEP highlight; tests; build.

---

## 8. Verification

- `npm --prefix dashboard run dev` → open `http://localhost:3000` → Presentation
  tab is the default landing.
- Click each scenario → guided run animates through stages → report auto-generates;
  scripted vs live badges correct; PDF/JSON/CSV export works.
- Live scenario runs the real pipeline against the running API (`:8000`).
- `npm --prefix dashboard test` and `npm --prefix dashboard run build` stay green;
  add unit tests for `scenarios.mjs` (stage/report-seed integrity) and the player
  reducer; optionally extend `dashboard/tests/e2e` for the scripted flow.
- Confirm existing tabs (Demo / Live Metrics / Recommendations / Reports) still work.

---

## 9. Notes for the implementing session

- Start the app first: `scripts/start_v1.ps1` (API in WSL) and
  `npm --prefix dashboard run dev` (UI) — see `docs/safe_v1.md`.
- Keep API logs off the Windows **C:** drive (redirect to `/tmp` in WSL) — C: is small.
- Measured numbers to seed scenarios live in `docs/optidbx_technical_report.md` (§6).
