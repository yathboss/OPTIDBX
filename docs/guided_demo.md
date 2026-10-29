# Panel demo guide

Open http://localhost:3000. The API must also be running on localhost:8000.
Use the existing `scripts/start_v1.ps1` launcher and its `-Dashboard` option if
the services have stopped. PostgreSQL runs in WSL Ubuntu.

1. Open **Demo**. Explain the horizontal steps. MEDIUM is the suggested starting
   workload; LOW is useful for a connection check. HIGH can cause query timeouts.
2. Click **Start demo**. This selects recommendation mode and starts 180 seconds
   of the selected owned workload. It collects actual telemetry; it does not
   guarantee a bottleneck. Session counts and timing come from shared config.
3. Explain that OS settings remain unchanged. The host capability display is
   not permission to change a process. Manual OS actions remain in the separate
   guarded Python framework; the UI does not apply OS actions.
4. When a recommendation appears, show its old/new parallelism, reason,
   measured evidence and scope. Click **Apply & Observe** for one action.
   **Enable continuous auto-tuning** is a separate choice for later automatic
   actions. The same existing execution and rollback pipeline handles both.
5. Show the observation countdown, result and cooldown. A rollback is a valid
   safety outcome. Do not describe KEEP as proof of a general speedup.
6. Click **Generate Report** on the result. Review the before/after table,
   verified values, sample counts, scope and limitations. Download JSON or CSV,
   or choose **Print / Save PDF**, then your browser's Save as PDF destination.
7. Use **Results & Reports** to open older runs and generate a report even when
   no action occurred. The report explicitly says that no comparison exists.
   Expand **Performance Evidence: paired comparisons** for repeated studies.

For a short panel session, a workload may not produce a safe recommendation.
Show that truthful result, then open an existing measured run to explain the
complete lifecycle. Label it as historical evidence. Never lower thresholds or
invent improvements just to finish the demonstration.

The six report metrics use the existing telemetry windows. TPS is database-wide,
not owned-workload QPS. CSV contains metric deltas; JSON retains the full frozen
source record. PDF is a readable observation report, not a statistical benchmark
certificate. Zero baselines and missing samples produce unavailable percentages.

Notifications appear as pop-ups, with recent events available at bottom right.
Recovery failures stay visible and block new automatic actions. Advanced controls
remain available in the expandable panel. Navigation scrolls horizontally on
narrow screens rather than wrapping tab names.
