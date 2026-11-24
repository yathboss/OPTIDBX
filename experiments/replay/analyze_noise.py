"""Phase 0 analysis: run-to-run noise, ground truth, and keep/rollback decision replay.

Input: traces written by ``record_traces.py`` (one directory per condition).
Output: ``results.json`` plus PNG figures. Every number is recomputed from raw traces.

Decision replay. OptiDBX's live rule compares a 25 s pre-apply window with a 25 s
post-apply window of the owned workload (``autotuner/lifecycle.py::_keep_decision``):
    net = dQPS% - 0.5 * dP95%;  KEEP iff net >= 5 and no veto
    (veto: p95 change >= +10 %, QPS change <= -10 %, or error rate rose).
We draw thousands of (before, after) window pairs from the recorded traces:
  * A/A        : both windows from the SAME setting (no true change) -> any KEEP is spurious.
  * A/A-adj    : two adjacent windows inside one run (closest to the live before/after).
  * A/B        : before from the baseline setting, after from the candidate setting.
  * A/B-cold   : like A/B but the baseline window starts at t=0 (warm-up not excluded).
Each is repeated for several window lengths. A CI-gated variant keeps only when the
bootstrap 95 % lower bound of ``net`` clears the threshold.
"""

import argparse
import json
from pathlib import Path

import numpy as np

THRESH, W_QPS, W_LAT, CAP = 5.0, 1.0, 0.5, 10.0
MIN_Q = 30


def load(cond_dir):
    meta = json.loads((cond_dir / "meta.json").read_text())
    runs = []
    for r in meta["runs"]:
        d = json.loads((cond_dir / r["file"]).read_text())
        rec = np.array(d["records"], dtype=float)  # start_s, latency_ms, ok, session
        d["arr"] = rec
        runs.append(d)
    return meta, runs


def window(rec, start, length):
    """Owned-window summary: queries wholly contained in [start, start+length)."""
    s, lat, ok = rec[:, 0], rec[:, 1], rec[:, 2]
    fin = s + lat / 1000
    m = (s >= start) & (fin <= start + length)
    good = m & (ok == 1)
    n_ok, n_err = int(good.sum()), int((m & (ok == 0)).sum())
    if n_ok < MIN_Q:
        return None
    lats = lat[good]
    return {"qps": n_ok / length, "p95": float(np.percentile(lats, 95)),
            "p50": float(np.percentile(lats, 50)), "err": n_err / max(1, n_ok + n_err),
            "lats": lats}


def decide(b, a):
    dq = (a["qps"] / b["qps"] - 1) * 100
    dp = (a["p95"] / b["p95"] - 1) * 100
    net = W_QPS * dq - W_LAT * dp
    if a["err"] > b["err"] or dp >= CAP or dq <= -CAP:
        return False, net, dq, dp
    return net >= THRESH, net, dq, dp


def ci_gated(b, a, length, rng, n_boot=200):
    """KEEP only if the bootstrap 95% lower bound of net clears the threshold."""
    nets = np.empty(n_boot)
    nb, na = len(b["lats"]), len(a["lats"])
    for i in range(n_boot):
        lb = rng.choice(b["lats"], nb)
        la = rng.choice(a["lats"], na)
        qb = rng.poisson(nb) / length  # count noise for throughput
        qa = rng.poisson(na) / length
        dq = (qa / max(qb, 1e-9) - 1) * 100
        dp = (np.percentile(la, 95) / np.percentile(lb, 95) - 1) * 100
        nets[i] = W_QPS * dq - W_LAT * dp
    keep, *_ = decide(b, a)
    return keep and np.percentile(nets, 2.5) >= THRESH


def steady(run):
    return window(run["arr"], run["warmup"], run["measure"])


def boot_diff(xs, ys, rng, n=5000):
    xs, ys = np.asarray(xs), np.asarray(ys)
    d = [(rng.choice(ys, len(ys)).mean() / rng.choice(xs, len(xs)).mean() - 1) * 100
         for _ in range(n)]
    return float(np.mean(ys) / np.mean(xs) * 100 - 100), [float(np.percentile(d, 2.5)),
                                                         float(np.percentile(d, 97.5))]


def replay(runs, base_pg, cand_pg, length, rng, n=2000, ci=False):
    base = [r for r in runs if r["per_gather"] == base_pg]
    cand = [r for r in runs if r["per_gather"] == cand_pg]
    out = {}

    def rand_win(run, cold=False):
        lo = 0.0 if cold else run["warmup"]
        hi = run["warmup"] + run["measure"] - length
        start = lo if cold else rng.uniform(lo, hi)
        return window(run["arr"], start, length)

    def trial(kind):
        if kind == "AA":
            r1, r2 = rng.choice(len(base), 2, replace=False)
            return rand_win(base[r1]), rand_win(base[r2])
        if kind == "AA_adj":
            r = base[rng.integers(len(base))]
            if 2 * length + 5 > r["measure"]:
                return None, None  # two adjacent windows do not fit in one run
            st = rng.uniform(r["warmup"], r["warmup"] + r["measure"] - 2 * length - 5)
            return window(r["arr"], st, length), window(r["arr"], st + length + 5, length)
        if kind == "AB":
            return rand_win(base[rng.integers(len(base))]), rand_win(cand[rng.integers(len(cand))])
        if kind == "AB_cold":
            return (rand_win(base[rng.integers(len(base))], cold=True),
                    rand_win(cand[rng.integers(len(cand))]))
        raise ValueError(kind)

    for kind in ("AA", "AA_adj", "AB", "AB_cold"):
        keeps = valid = 0
        nets = []
        for _ in range(n if not ci else n // 4):
            b, a = trial(kind)
            if b is None or a is None:
                continue
            valid += 1
            k, net, *_ = decide(b, a)
            if ci:
                k = ci_gated(b, a, length, rng)
            keeps += int(k)
            nets.append(net)
        out[kind] = {"valid": valid, "keep_rate": keeps / valid if valid else None,
                     "net_p5_p50_p95": [float(np.percentile(nets, q)) for q in (5, 50, 95)]
                     if nets else None, "nets": nets}
    return out


def analyze_condition(cond_dir, base_pg, cand_pg, rng):
    meta, runs = load(cond_dir)
    per_run = []
    for r in runs:
        s = steady(r)
        per_run.append({"run": r["run"], "per_gather": r["per_gather"],
                        "qps": s["qps"], "p50": s["p50"], "p95": s["p95"], "err": s["err"]})
    stats = {}
    for pg in sorted({r["per_gather"] for r in per_run}):
        q = np.array([r["qps"] for r in per_run if r["per_gather"] == pg])
        p = np.array([r["p95"] for r in per_run if r["per_gather"] == pg])
        stats[pg] = {"n": len(q), "qps_mean": q.mean(), "qps_cv": q.std(ddof=1) / q.mean() * 100,
                     "p95_mean": p.mean(), "p95_cv": p.std(ddof=1) / p.mean() * 100,
                     "qps_range_pct": (q.max() / q.min() - 1) * 100,
                     "p95_range_pct": (p.max() / p.min() - 1) * 100}
    qb = [r["qps"] for r in per_run if r["per_gather"] == base_pg]
    qc = [r["qps"] for r in per_run if r["per_gather"] == cand_pg]
    pb = [r["p95"] for r in per_run if r["per_gather"] == base_pg]
    pc = [r["p95"] for r in per_run if r["per_gather"] == cand_pg]
    dq, dq_ci = boot_diff(qb, qc, rng)
    dp, dp_ci = boot_diff(pb, pc, rng)
    true_net = W_QPS * dq - W_LAT * dp
    # Paired (within-block) estimate: both settings ran back-to-back in each block, so the
    # per-block ratio cancels slow drift that the unpaired estimate above absorbs as noise.
    by_block = {}
    for r in runs:
        by_block.setdefault(r["block"], {})[r["per_gather"]] = steady(r)
    pq, pp = [], []
    for b in by_block.values():
        pq.append((b[cand_pg]["qps"] / b[base_pg]["qps"] - 1) * 100)
        pp.append((b[cand_pg]["p95"] / b[base_pg]["p95"] - 1) * 100)
    pnet = np.array(pq) - W_LAT / W_QPS * np.array(pp)
    boots = [rng.choice(pnet, len(pnet)).mean() for _ in range(5000)]
    truth = {"dqps_pct": dq, "dqps_ci95": dq_ci, "dp95_pct": dp, "dp95_ci95": dp_ci,
             "net_pct": true_net,
             "paired_net_per_block": [float(x) for x in pnet],
             "paired_net_mean": float(pnet.mean()), "paired_net_sd": float(pnet.std(ddof=1)),
             "paired_net_ci95": [float(np.percentile(boots, 2.5)), float(np.percentile(boots, 97.5))],
             "correct_decision": "KEEP" if pnet.mean() >= THRESH else "ROLLBACK"}
    order = sorted(per_run, key=lambda r: r["run"])
    q_all = np.array([r["qps"] for r in order])
    slope = np.polyfit(np.arange(len(q_all)), q_all, 1)[0]
    drift = {"qps_first_run": float(q_all[0]), "qps_last_run": float(q_all[-1]),
             "slope_pct_per_run": float(slope / q_all.mean() * 100),
             "fit_change_pct": float(slope * (len(q_all) - 1) / q_all.mean() * 100)}
    warm = []
    for r in runs:
        w0, st = window(r["arr"], 0, r["warmup"]), steady(r)
        if w0:
            warm.append((w0["qps"] / st["qps"] - 1) * 100)
    drift["warmup_qps_vs_steady_pct_mean"] = float(np.mean(warm))
    rep = {}
    for L in (25, 60, 120):
        rep[L] = replay(runs, base_pg, cand_pg, L, rng)
    rep_ci = replay(runs, base_pg, cand_pg, 25, rng, ci=True)
    return {"meta": meta, "per_run": per_run, "stats": stats, "truth": truth, "drift": drift,
            "replay": rep, "replay_ci25": rep_ci, "runs": runs}


def figures(results, outdir):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    plt.rcParams.update({"font.family": "serif", "font.size": 8, "axes.linewidth": 0.6,
                         "figure.dpi": 200})
    conds = list(results)
    colors = {8: "#1f4e79", 2: "#c0504d"}

    # Fig 1: per-run steady-state QPS and p95 in execution order (reveals drift).
    fig, axes = plt.subplots(1, 2, figsize=(3.5, 1.8))
    for ax, key, lab in ((axes[0], "qps", "Throughput (QPS)"), (axes[1], "p95", "p95 latency (ms)")):
        for c, mk in zip(conds, ("o", "s"), strict=False):
            order = sorted(results[c]["per_run"], key=lambda r: r["run"])
            ax.plot([r["run"] for r in order], [r[key] for r in order], color="#999", lw=0.5)
            for r in order:
                ax.scatter(r["run"], r[key], s=11, marker=mk, color=colors.get(r["per_gather"], "k"),
                           zorder=3)
            ax.text(order[-1]["run"] + 0.3, order[-1][key], c, fontsize=5.5, va="center")
        ax.set_xlabel("Run order")
        ax.set_ylabel(lab)
        ax.set_xlim(-0.5, 12.5)
        ax.grid(lw=0.3, alpha=0.5)
    from matplotlib.lines import Line2D
    axes[0].legend([Line2D([], [], marker="o", ls="", color=colors[8], ms=3),
                    Line2D([], [], marker="o", ls="", color=colors[2], ms=3)],
                   ["setting 8", "setting 2"], fontsize=5.5, frameon=False, loc="lower right")
    fig.tight_layout()
    fig.savefig(outdir / "fig_runs.png", bbox_inches="tight")
    plt.close(fig)

    # Fig 2: warm-up — rolling QPS over time for the first baseline run of each condition.
    fig, ax = plt.subplots(figsize=(3.5, 1.7))
    for c in conds:
        r = next(r for r in results[c]["runs"] if r["per_gather"] == 8)
        a = r["arr"]
        fin = a[:, 0] + a[:, 1] / 1000
        t = np.arange(0, r["warmup"] + r["measure"] - 5, 1.0)
        q = [((fin >= x) & (fin < x + 5) & (a[:, 2] == 1)).sum() / 5 for x in t]
        ax.plot(t, q, lw=0.8, label=c)
    ax.axvline(r["warmup"], color="k", ls="--", lw=0.6)
    ax.text(r["warmup"] + 2, ax.get_ylim()[1] * 0.95, "warm-up ends", fontsize=6, va="top")
    ax.set_xlabel("Time since workload start (s)")
    ax.set_ylabel("QPS (5 s bins)")
    ax.legend(fontsize=6, frameon=False)
    ax.grid(lw=0.3, alpha=0.5)
    fig.tight_layout()
    fig.savefig(outdir / "fig_warmup.png", bbox_inches="tight")
    plt.close(fig)

    # Fig 3: spurious-KEEP rate (A/A) vs window length.
    fig, ax = plt.subplots(figsize=(3.5, 1.7))
    for c in conds:
        Ls = sorted(results[c]["replay"])
        ax.plot(Ls, [results[c]["replay"][L]["AA"]["keep_rate"] * 100 for L in Ls], "o-",
                ms=3, lw=0.8, label=f"{c} A/A (random)")
        adj = [L for L in Ls if results[c]["replay"][L]["AA_adj"]["keep_rate"] is not None]
        ax.plot(adj, [results[c]["replay"][L]["AA_adj"]["keep_rate"] * 100 for L in adj], "s--",
                ms=3, lw=0.8, label=f"{c} A/A (adjacent)")
    ax.set_xlabel("Decision window length (s)")
    ax.set_ylabel("Spurious KEEP (%)")
    ax.set_xticks([25, 60, 120])
    ax.legend(fontsize=5.5, frameon=False)
    ax.grid(lw=0.3, alpha=0.5)
    fig.tight_layout()
    fig.savefig(outdir / "fig_window.png", bbox_inches="tight")
    plt.close(fig)

    # Fig 4: distribution of the decision statistic under A/A vs A/B at 25 s.
    fig, axes = plt.subplots(1, len(conds), figsize=(3.5, 1.7), sharey=True)
    for ax, c in zip(np.atleast_1d(axes), conds, strict=False):
        rep = results[c]["replay"][25]
        bins = np.linspace(-40, 40, 41)
        ax.hist(rep["AA"]["nets"], bins=bins, alpha=0.6, label="A/A (no change)", color="#7f7f7f")
        ax.hist(rep["AB"]["nets"], bins=bins, alpha=0.6, label="A/B (8→2)", color="#c0504d")
        ax.axvline(THRESH, color="k", lw=0.6, ls="--")
        ax.set_title(c, fontsize=7)
        ax.set_xlabel("net benefit (%)")
    np.atleast_1d(axes)[0].set_ylabel("trials")
    np.atleast_1d(axes)[0].legend(fontsize=5.5, frameon=False)
    fig.tight_layout()
    fig.savefig(outdir / "fig_net.png", bbox_inches="tight")
    plt.close(fig)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--traces", default="experiments/replay/data/phase0")
    ap.add_argument("--conditions", default="pin8,unpinned16")
    ap.add_argument("--base", type=int, default=8)
    ap.add_argument("--cand", type=int, default=2)
    ap.add_argument("--out", default="docs/paper/results")
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()
    rng = np.random.default_rng(args.seed)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    results = {c: analyze_condition(Path(args.traces) / c, args.base, args.cand, rng)
               for c in args.conditions.split(",")}
    figures(results, out)

    def clean(o):
        if isinstance(o, dict):
            return {str(k): clean(v) for k, v in o.items() if k not in ("runs", "nets", "lats")}
        if isinstance(o, list):
            return [clean(v) for v in o]
        if isinstance(o, (np.floating, np.integer)):
            return o.item()
        return o

    (out / "results.json").write_text(json.dumps(clean(results), indent=2))
    for c, r in results.items():
        print(f"== {c}")
        for pg, s in r["stats"].items():
            print(f"  pg={pg} n={s['n']} qps={s['qps_mean']:.2f} cv={s['qps_cv']:.1f}% "
                  f"p95={s['p95_mean']:.0f} cv={s['p95_cv']:.1f}%")
        print("  truth", {k: (round(v, 2) if isinstance(v, float) else v)
                          for k, v in r["truth"].items()})
        for L, rep in r["replay"].items():
            print(f"  L={L}s", {k: round(v["keep_rate"] * 100, 1) for k, v in rep.items()
                                if v["keep_rate"] is not None})
        print("  CI-gated 25s", {k: round(v["keep_rate"] * 100, 1)
                                 for k, v in r["replay_ci25"].items()})


if __name__ == "__main__":
    main()
