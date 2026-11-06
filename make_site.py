#!/usr/bin/env python3
"""Build the LTDE webpage.

Run from anywhere:  python3 make_site.py

Steps
 1. Copy the rendered figure PNGs (+ PDFs) from paper_plots/figures into ./figures
 2. Export the underlying data (light curves, scores, catalogue stats) as JSON
    into ./data -- the same sources the paper notebooks read, so the browser
    playground can recompute the plots on demand without any server.

The HTML/CSS/JS in this folder are static and are NOT regenerated here; only
the figures and data are refreshed.  After editing a notebook, re-run its cell
to update paper_plots/figures, then run this script and `git commit`.
"""
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TDC = os.path.dirname(HERE)                      # .../TDC
FIGSRC = os.path.join(TDC, "paper_plots", "figures")
FIGDST = os.path.join(HERE, "figures")
DATADST = os.path.join(HERE, "data")

sys.path.insert(0, HERE)
from figures_meta import FIGURES  # noqa: E402


def copy_figures():
    os.makedirs(FIGDST, exist_ok=True)
    names = [f["name"] for f in FIGURES]
    copied = []
    for name in names:
        for ext in (".png", ".pdf"):
            src = os.path.join(FIGSRC, name + ext)
            if os.path.exists(src):
                shutil.copy2(src, os.path.join(FIGDST, name + ext))
                copied.append(name + ext)
    missing = [n for n in names if not os.path.exists(os.path.join(FIGSRC, n + ".png"))]
    print(f"[figures] copied {len(copied)} files -> {FIGDST}")
    if missing:
        print(f"[figures] WARNING missing in {FIGSRC}: {missing}")


def write_manifest():
    """figures.json drives the gallery (order, groups, captions)."""
    manifest = [
        {k: f[k] for k in ("name", "group", "title", "caption")} | {"interactive": f.get("interactive", False)}
        for f in FIGURES
    ]
    with open(os.path.join(HERE, "data", "figures.json"), "w") as fh:
        json.dump(manifest, fh, indent=1)
    print(f"[data] wrote figures.json ({len(manifest)} entries)")


def export_data():
    """Export the data needed by the interactive playground.

    This is intentionally a separate step with its own try/except so that the
    site still builds (gallery-only) if some source file is missing on this
    machine.  Each exporter prints what it did.
    """
    os.makedirs(DATADST, exist_ok=True)
    exporters = [
        ("lightcurves", export_lightcurves),
        ("scores", export_scores),
        ("catalogue_stats", export_catalogue_stats),
    ]
    for label, fn in exporters:
        try:
            fn()
        except Exception as e:  # noqa: BLE001 - keep building the rest
            print(f"[data] SKIPPED {label}: {type(e).__name__}: {e}")


# ---------------------------------------------------------------------------
# Data exporters (phase 2).  Each writes one JSON file into ./data.
# They read the SAME files the paper notebooks use.
# ---------------------------------------------------------------------------

def _read_lc_submission(path):
    import pandas as pd
    df = pd.read_csv(path)
    return df


def export_lightcurves():
    """Export per-visit light-curve fluxes for the example systems used in
    Fig_06-09 (good / blended / leakage / offset)."""
    # The exact paths are defined inside the notebooks; mirror them here.
    import pandas as pd
    from paper_plots_paths import LC_EXAMPLES  # small helper, see below

    out = {}
    for key, info in LC_EXAMPLES.items():
        df = _read_lc_submission(info["lc_csv"])
        keep = [c for c in ("time", "flux_A", "flux_B", "flux_C", "flux_D",
                            "flux_err_A", "flux_err_B", "flux_err_C", "flux_err_D")
                if c in df.columns]
        out[key] = {
            "config": info["config"],
            "method": info.get("method"),
            "note": info.get("note", ""),
            "columns": keep,
            "data": df[keep].where(pd.notna(df[keep]), None).values.tolist(),
        }
    with open(os.path.join(DATADST, "lightcurves.json"), "w") as fh:
        json.dump(out, fh)
    print(f"[data] wrote lightcurves.json ({len(out)} examples)")


def export_scores():
    """Export the per-image score table (chi2_offset, contamination ratios,
    f_tot, config, method) used by Fig_10-13."""
    from paper_plots_paths import SCORES_CSV
    import pandas as pd
    df = pd.read_csv(SCORES_CSV)
    keep = [c for c in ("config", "method", "image", "chi2_offset", "f_cont",
                        "f_tot", "theta_E", "host_flux", "lens_flux") if c in df.columns]
    with open(os.path.join(DATADST, "scores.json"), "w") as fh:
        json.dump({"columns": keep,
                   "data": df[keep].where(pd.notna(df[keep]), None).values.tolist()}, fh)
    print(f"[data] wrote scores.json ({len(df)} rows)")


def export_catalogue_stats():
    """Export the small aggregate stats behind Fig_03 (catalogue distributions)."""
    from paper_plots_paths import CATALOGUE_CSV
    import pandas as pd
    df = pd.read_csv(CATALOGUE_CSV)
    # keep only a handful of numeric columns to stay small
    num = df.select_dtypes("number").columns[:12].tolist()
    with open(os.path.join(DATADST, "catalogue_stats.json"), "w") as fh:
        json.dump({"columns": num,
                   "data": df[num].where(pd.notna(df[num]), None).values.tolist(),
                   "n_rows": int(len(df))}, fh)
    print(f"[data] wrote catalogue_stats.json ({len(df)} rows)")


if __name__ == "__main__":
    copy_figures()
    write_manifest()
    export_data()
    print("done.")
