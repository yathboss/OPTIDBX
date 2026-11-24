"""Build the IEEE-style paper (HTML + PDF) from measured results.

Every Phase 0 number in the paper comes from ``results/results.json`` (written by
``experiments/replay/analyze_noise.py``). Interpretive prose that depends on the
outcome lives in ``narrative.json`` and is written only after the results exist.

    python docs/paper/build_paper.py
"""

import json
import os
import subprocess
import sys
from datetime import date
from pathlib import Path
from string import Template

HERE = Path(__file__).resolve().parent
CHROME = [r"C:\Program Files\Google\Chrome\Application\chrome.exe",
          r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
          r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"]
LABEL = {"pin8": "pin8 (8 cores)", "unpinned16": "unpinned16 (16 cores)"}

ARCH_SVG = """<svg viewBox="0 0 340 168" xmlns="http://www.w3.org/2000/svg" font-family="Times New Roman, serif" font-size="8.5">
<defs><marker id="a" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#000"/></marker></defs>
<g fill="none" stroke="#000" stroke-width="0.8">
<rect x="4" y="8" width="78" height="26"/><rect x="4" y="62" width="78" height="26"/>
<rect x="4" y="116" width="78" height="26"/><rect x="118" y="62" width="78" height="26"/>
<rect x="232" y="8" width="102" height="26"/><rect x="232" y="62" width="102" height="26"/>
<rect x="232" y="116" width="102" height="26"/><rect x="118" y="116" width="78" height="26"/>
</g>
<g stroke="#000" stroke-width="0.8" marker-end="url(#a)" fill="none">
<line x1="43" y1="34" x2="43" y2="60"/><line x1="82" y1="75" x2="116" y2="75"/>
<line x1="43" y1="116" x2="43" y2="90"/><line x1="196" y1="75" x2="230" y2="75"/>
<path d="M196,70 L214,70 L214,21 L230,21"/><line x1="283" y1="88" x2="283" y2="114"/>
<line x1="232" y1="129" x2="198" y2="129"/><path d="M118,129 L96,129 L96,82 L84,82"/>
</g>
<g text-anchor="middle">
<text x="43" y="19">Owned workload</text><text x="43" y="29">sessions (clients)</text>
<text x="43" y="73">PostgreSQL 16</text><text x="43" y="83">pg_stat_* views</text>
<text x="43" y="127">OS telemetry</text><text x="43" y="137">/proc, psutil</text>
<text x="157" y="73">Paired interval</text><text x="157" y="83">(5 s, skew &#8804; 1 s)</text>
<text x="283" y="19">Recommendation mode</text><text x="283" y="29">(show only)</text>
<text x="283" y="73">Detector: 4 signals</text><text x="283" y="83">&#215; 3 readings</text>
<text x="283" y="127">Apply one step, observe</text><text x="283" y="137">owned p95 / QPS (25 s)</text>
<text x="157" y="127">KEEP or verified</text><text x="157" y="137">ROLLBACK + cooldown</text>
</g>
<text x="102" y="110" font-size="7.5" font-style="italic">journaled lifecycle</text>
</svg>"""


def pct(x, sign=True):
    return f"{x:+.1f} %" if sign else f"{x:.1f} %"


def stats_table(res):
    rows = []
    for c, r in res.items():
        for pg in ("8", "2"):
            s = r["stats"][pg]
            rows.append(
                f"<tr><td class='l'>{LABEL.get(c, c)}</td><td>{pg}</td><td>{s['n']}</td>"
                f"<td>{s['qps_mean']:.2f}</td><td>{s['qps_cv']:.1f}</td><td>{s['qps_range_pct']:.1f}</td>"
                f"<td>{s['p95_mean']:.0f}</td><td>{s['p95_cv']:.1f}</td><td>{s['p95_range_pct']:.1f}</td></tr>")
    return ("<div class='tbl'><div class='tcap'>TABLE III<span>Steady-state results per setting "
            "(180-s windows; CV and max/min range across runs, in %)</span></div><table><thead>"
            "<tr><th class='l'>Condition</th><th>Set.</th><th>Runs</th><th>QPS</th><th>CV</th>"
            "<th>Range</th><th>p95 (ms)</th><th>CV</th><th>Range</th></tr></thead><tbody>"
            + "".join(rows) + "</tbody></table></div>")


def truth_text(res):
    parts = []
    for c, r in res.items():
        t, d = r["truth"], r["drift"]
        parts.append(
            f"in <em>{c}</em> the paired net benefit of 8 &rarr; 2 is {pct(t['paired_net_mean'])} "
            f"(95 % CI [{t['paired_net_ci95'][0]:+.1f}, {t['paired_net_ci95'][1]:+.1f}], "
            f"per-block SD {t['paired_net_sd']:.1f} points), so the correct verdict is "
            f"<b>{t['correct_decision']}</b>; a linear fit of throughput against run order "
            f"changes by {pct(d['fit_change_pct'])} across the condition")
    return ("<p>TABLE III summarises the runs. " + "; ".join(parts) + ". The pin8 drift is "
            "independent of the setting (Fig. 2) and larger than both the 5 % threshold and the "
            "effect under test. The unpaired estimate, which ignores blocks, is wider: "
            f"{pct(res['pin8']['truth']['dqps_pct'])} QPS with CI "
            f"[{res['pin8']['truth']['dqps_ci95'][0]:+.1f}, {res['pin8']['truth']['dqps_ci95'][1]:+.1f}] in pin8.</p>")


def replay_table(res):
    rows = []
    names = [("AA", "A/A"), ("AA_adj", "A/A-adj."), ("AB", "A/B"), ("AB_cold", "A/B-cold")]
    for c, r in res.items():
        for L in ("25", "60", "120"):
            rep = r["replay"][L]
            cells = "".join(
                f"<td>{rep[k]['keep_rate'] * 100:.1f}</td>" if rep[k]["keep_rate"] is not None
                else "<td>–</td>" for k, _ in names)
            rows.append(f"<tr><td class='l'>{c}</td><td>{L} s</td>{cells}</tr>")
        ci = r["replay_ci25"]
        cells = "".join(f"<td>{ci[k]['keep_rate'] * 100:.1f}</td>" for k, _ in names)
        rows.append(f"<tr><td class='l'>{c}</td><td>25 s, CI-gated</td>{cells}</tr>")
    head = "".join(f"<th>{n}</th>" for _, n in names)
    return ("<div class='tbl'><div class='tcap'>TABLE IV<span>Replayed KEEP rate (%) of the "
            "OptiDBX rule; under A/A every KEEP is spurious</span></div><table><thead><tr>"
            f"<th class='l'>Condition</th><th>Window</th>{head}</tr></thead><tbody>"
            + "".join(rows) + "</tbody></table></div>")


def main():
    res = json.loads((HERE / "results" / "results.json").read_text())
    narrative = json.loads((HERE / "narrative.json").read_text(encoding="utf-8"))
    n_runs = sum(len(r["per_run"]) for r in res.values())
    n_q = 0
    trace_root = HERE.parents[1] / "experiments" / "replay" / "data" / "phase0"
    for c in res:
        for f in (trace_root / c).glob("run*.json"):
            n_q += len(json.loads(f.read_text())["records"])
    settings = next(iter(res.values()))["meta"].get("settings", {})
    pg_version = settings.get("server_version", "16").split(" ")[0]
    html = Template((HERE / "paper_template.html").read_text(encoding="utf-8")).substitute(
        build_date=date.today().isoformat(), n_runs=n_runs, n_queries_k=f"{n_q / 1000:.0f}",
        pg_version=pg_version, arch_svg=ARCH_SVG, stats_table=stats_table(res),
        truth_text=truth_text(res), replay_table=replay_table(res), **narrative)
    out_html = HERE / "optidbx_ieee_paper.html"
    out_html.write_text(html, encoding="utf-8")
    chrome = next((c for c in CHROME if os.path.exists(c)), None)
    if not chrome:
        sys.exit("No Chrome/Edge found; open the HTML and print to PDF manually.")
    out_pdf = HERE / "optidbx_ieee_paper.pdf"
    subprocess.run([chrome, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                    f"--print-to-pdf={out_pdf}", out_html.as_uri()], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
    print("wrote", out_html, out_pdf, f"runs={n_runs} queries={n_q}")


if __name__ == "__main__":
    main()
