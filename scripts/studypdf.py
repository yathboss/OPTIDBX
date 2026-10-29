"""
Shared toolkit for the OptiDBX Study Series PDFs.

The study series is a set of connected documents that share one cover style,
one colour system (the app's strict orange + white), and one "series navigator"
so every PDF cross-references the others:

    Document 1 — Demo Scenarios Study Guide       (build_pdf1_scenarios.py)
    Document 2 — Viva Question Bank                (build_pdf2_viva.py)
    Document 3 — Technical Terms Glossary          (build_pdf3_glossary.py)
    Document 5 — Page-by-Page Presentation Scripts (build_pdf5_scripts.py)

This module only holds shared building blocks (CSS, cover, section helpers,
before/after bars, Chrome-headless rendering). Each document has its own builder
script that imports from here, so the look stays identical across the series.
"""

from __future__ import annotations
import html
import os
import subprocess
import sys

# --- the series, so every document can render the same navigator ------------
SERIES = [
    (1, "Demo Scenarios Study Guide", "Understand every scenario the dashboard can demonstrate."),
    (2, "Viva Question Bank", "Questions a panel may ask, with grounded answers."),
    (3, "Technical Terms Glossary", "Every term in the project, defined plainly."),
    (5, "Page-by-Page Presentation Scripts", "What to say on each page of the dashboard."),
]

BRAND_ORANGE = "#f4610c"

CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
]

BASE_CSS = """
  @page { size: A4; margin: 16mm 15mm 18mm 15mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #1a2230; margin: 0;
         font-size: 11.2px; line-height: 1.55; }
  h1, h2, h3, h4 { color: #101826; margin: 0; }
  p { margin: 0 0 9px; }
  a { color: #d24e05; text-decoration: none; }
  .muted { color: #5b6675; }
  .accent { color: #d24e05; }

  /* cover */
  .cover { min-height: 247mm; display: flex; flex-direction: column;
           page-break-after: always; }
  .cover-top { display: flex; align-items: center; gap: 12px;
               border-bottom: 3px solid #f4610c; padding-bottom: 14px; }
  .logo { width: 40px; height: 40px; border-radius: 9px; background: #f4610c;
          color: #fff; display: grid; place-items: center; font-weight: 800;
          font-size: 22px; }
  .cover-top .brand { font-size: 20px; font-weight: 800; }
  .cover-top .tagline { color: #5b6675; font-size: 11px; letter-spacing: .09em;
                        text-transform: uppercase; }
  .cover-mid { margin-top: auto; margin-bottom: auto; }
  .doc-index { display: inline-block; background: #fff3ea; color: #d24e05;
               font-weight: 700; font-size: 12px; padding: 6px 13px;
               border-radius: 999px; border: 1px solid #f7d6bf; }
  .cover-mid h1 { font-size: 34px; margin: 16px 0 8px; line-height: 1.15; }
  .cover-mid .lede { font-size: 14px; color: #3a4557; max-width: 150mm; }
  .cover-meta { margin-top: 26px; font-size: 11px; color: #5b6675; }
  .cover-meta b { color: #1a2230; }

  /* series navigator */
  .series-nav { border: 1px solid #e4e8ee; border-radius: 12px; overflow: hidden;
                margin: 20px 0; }
  .series-nav .sn-head { background: #f7f8fa; padding: 9px 14px; font-weight: 700;
                         border-bottom: 1px solid #e4e8ee; font-size: 11px;
                         letter-spacing: .06em; text-transform: uppercase;
                         color: #5b6675; }
  .series-nav table { width: 100%; border-collapse: collapse; }
  .series-nav td { padding: 8px 14px; border-bottom: 1px solid #eef1f5;
                   vertical-align: top; }
  .series-nav tr:last-child td { border-bottom: none; }
  .series-nav .sn-n { width: 30px; font-weight: 800; color: #f4610c; }
  .series-nav .sn-this { background: #fff8f3; }
  .series-nav .sn-title { font-weight: 700; }
  .series-nav .sn-here { color: #d24e05; font-weight: 700; font-size: 10px;
                         letter-spacing: .05em; text-transform: uppercase; }

  /* running header on content pages */
  .part { page-break-before: always; }
  .kicker { color: #d24e05; font-weight: 700; font-size: 10.5px;
            letter-spacing: .12em; text-transform: uppercase; margin-bottom: 4px; }
  h2.section { font-size: 21px; margin-bottom: 6px; }
  h2.section + .sub { color: #5b6675; margin-bottom: 16px; font-size: 12px; }

  .callout { background: #f7f8fa; border: 1px solid #e4e8ee; border-left: 3px solid #f4610c;
             border-radius: 8px; padding: 11px 14px; margin: 12px 0; }
  .callout b { color: #101826; }

  ul.tight, ol.tight { margin: 4px 0 10px; padding-left: 20px; }
  ul.tight li, ol.tight li { margin-bottom: 4px; }

  table.grid { width: 100%; border-collapse: collapse; margin: 10px 0 14px;
               font-size: 10.6px; }
  table.grid th, table.grid td { border: 1px solid #e4e8ee; padding: 7px 9px;
                                 text-align: left; vertical-align: top; }
  table.grid th { background: #f7f8fa; font-size: 10px; letter-spacing: .03em;
                  text-transform: uppercase; color: #5b6675; }

  /* scenario card */
  .scn { border: 1px solid #e4e8ee; border-radius: 12px; padding: 16px 18px;
         margin: 0 0 16px; page-break-inside: avoid; }
  .scn-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;
              border-bottom: 1px solid #eef1f5; padding-bottom: 9px; margin-bottom: 11px; }
  .scn-num { font-weight: 800; color: #f4610c; font-size: 15px; }
  .scn-title { font-size: 15px; font-weight: 800; }
  .scn-tags { margin-left: auto; display: flex; gap: 6px; }
  .tag { font-size: 9.5px; font-weight: 700; padding: 3px 9px; border-radius: 999px;
         letter-spacing: .03em; text-transform: uppercase; }
  .tag.sim { background: #eef1f5; color: #5b6675; }
  .tag.live { background: #fff3ea; color: #d24e05; border: 1px solid #f7d6bf; }
  .tag.cat { background: #f4f6f9; color: #47566a; }
  .verdict { display: inline-block; font-weight: 700; font-size: 11px;
             padding: 4px 11px; border-radius: 8px; }
  .verdict.keep { background: #fff3ea; color: #d24e05; border: 1px solid #f7d6bf; }
  .verdict.rollback { background: #eef1f5; color: #47566a; border: 1px solid #dfe4ea; }
  .verdict.noaction { background: #f4f6f9; color: #5b6675; border: 1px solid #e4e8ee; }
  .verdict.recommendation { background: #fff8f0; color: #b7560a; border: 1px solid #f3ddc4; }
  .verdict.recovery { background: #f2f0ee; color: #6a5140; border: 1px solid #e6ddd5; }

  .scn h4 { font-size: 11px; letter-spacing: .05em; text-transform: uppercase;
            color: #5b6675; margin: 12px 0 5px; }
  .demonstrates { font-size: 12px; }

  /* before/after bars */
  .chart { background: #fafbfc; border: 1px solid #eef1f5; border-radius: 10px;
           padding: 12px 14px; }
  .row { margin-bottom: 12px; }
  .row:last-child { margin-bottom: 0; }
  .rowhead { display: flex; justify-content: space-between; align-items: center;
             margin-bottom: 5px; }
  .metric { font-weight: 700; font-size: 11px; }
  .chg { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 999px;
         background: #eef1f5; color: #5b6675; }
  .chg.good { background: #fff3ea; color: #d24e05; }
  .bar { display: flex; align-items: center; gap: 8px; margin: 3px 0; }
  .bartag { width: 44px; font-size: 9px; color: #8a94a3; text-transform: uppercase;
            letter-spacing: .04em; }
  .track { flex: 1; height: 12px; background: #e9edf2; border-radius: 999px;
           overflow: hidden; }
  .fill { height: 100%; border-radius: 999px; }
  .fill.before { background: #b6c0cc; }
  .fill.after { background: #f4610c; }
  .num { width: 84px; text-align: right; font-size: 10px; font-weight: 700;
         font-variant-numeric: tabular-nums; }

  .connect { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
  .connect .box { background: #f7f8fa; border: 1px solid #e4e8ee; border-radius: 8px;
                  padding: 9px 12px; font-size: 10.4px; }
  .connect .box b { display: block; color: #101826; margin-bottom: 3px;
                    font-size: 9.5px; letter-spacing: .05em; text-transform: uppercase; }

  footer.doc-foot { margin-top: 26px; border-top: 1px solid #e4e8ee; padding-top: 10px;
                    color: #8a94a3; font-size: 9.5px; }
"""


def esc(s) -> str:
    return html.escape(str(s))


def cover(doc_no: int, title: str, lede: str, meta_rows: list[tuple[str, str]]) -> str:
    meta = "<br>".join(f"<b>{esc(k)}:</b> {esc(v)}" for k, v in meta_rows)
    return f"""
    <section class="cover">
      <div class="cover-top">
        <div class="logo">O</div>
        <div>
          <div class="brand">OptiDBX</div>
          <div class="tagline">Understand. Tune. Verify.</div>
        </div>
      </div>
      <div class="cover-mid">
        <span class="doc-index">OptiDBX Study Series &middot; Document {doc_no}</span>
        <h1>{esc(title)}</h1>
        <p class="lede">{esc(lede)}</p>
        <div class="cover-meta">{meta}</div>
      </div>
      {series_nav(doc_no)}
    </section>
    """


def series_nav(current: int) -> str:
    rows = []
    for n, title, blurb in SERIES:
        here = n == current
        rows.append(
            f'<tr class="{"sn-this" if here else ""}">'
            f'<td class="sn-n">{n}</td>'
            f'<td><span class="sn-title">{esc(title)}</span><br>'
            f'<span class="muted">{esc(blurb)}</span></td>'
            f'<td>{"<span class=sn-here>You are here</span>" if here else ""}</td></tr>'
        )
    return (
        '<div class="series-nav"><div class="sn-head">The OptiDBX Study Series — '
        "read these together</div><table>" + "".join(rows) + "</table></div>"
    )


def bars(rows: list[dict]) -> str:
    """rows: [{label, unit, before, after, betterWhen, change}]"""
    out = []
    for r in rows:
        b = r.get("before")
        a = r.get("after")
        mx = max(b or 0, a or 0) or 1
        chg = r.get("change")
        if chg is None:
            improved = None
        else:
            improved = (chg < 0) if r.get("betterWhen") == "lower" else (chg > 0)
        wb = f"{(b or 0) / mx * 100:.1f}%"
        wa = f"{(a or 0) / mx * 100:.1f}%"
        unit = r.get("unit", "")
        chip = ""
        if chg is not None:
            sign = "+" if chg >= 0 else ""
            chip = f'<span class="chg {"good" if improved else ""}">{sign}{chg}%</span>'
        out.append(
            f'<div class="row"><div class="rowhead"><span class="metric">{esc(r["label"])}</span>{chip}</div>'
            f'<div class="bar"><span class="bartag">Before</span><div class="track">'
            f'<div class="fill before" style="width:{wb}"></div></div>'
            f'<span class="num">{"" if b is None else b} {esc(unit)}</span></div>'
            f'<div class="bar"><span class="bartag">After</span><div class="track">'
            f'<div class="fill after" style="width:{wa}"></div></div>'
            f'<span class="num">{"" if a is None else a} {esc(unit)}</span></div></div>'
        )
    return '<div class="chart">' + "".join(out) + "</div>"


def page(title: str, body: str) -> str:
    return (
        f"<!doctype html><html><head><meta charset='utf-8'><title>{esc(title)}</title>"
        f"<style>{BASE_CSS}</style></head><body>{body}</body></html>"
    )


def render_pdf(html_str: str, out_pdf: str, work_dir: str) -> None:
    """Write HTML then render to PDF with headless Chrome/Edge."""
    os.makedirs(work_dir, exist_ok=True)
    html_path = os.path.join(work_dir, "_source.html")
    with open(html_path, "w", encoding="utf-8") as fh:
        fh.write(html_str)

    chrome = next((c for c in CHROME_CANDIDATES if os.path.exists(c)), None)
    if not chrome:
        sys.exit("No Chrome/Edge found for PDF rendering.")

    file_url = "file:///" + html_path.replace("\\", "/")
    out_abs = os.path.abspath(out_pdf)
    os.makedirs(os.path.dirname(out_abs), exist_ok=True)
    cmd = [
        chrome, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
        f"--print-to-pdf={out_abs}", file_url,
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if not os.path.exists(out_abs):
        sys.exit(f"PDF not produced.\n{res.stderr}")
    print(f"OK  {out_abs}  ({os.path.getsize(out_abs):,} bytes)")
