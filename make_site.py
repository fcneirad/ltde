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

# Base data locations (same as the paper notebooks).  Override via env if needed.
DATA_ROOT = os.environ.get("LTDE_DATA_ROOT", "/media/data/TDC")
LCS_ROOT = os.path.join(DATA_ROOT, "standard_lcs")

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
        ("scores", export_scores),
        ("lightcurves", export_lightcurves),
    ]
    for label, fn in exporters:
        try:
            fn()
        except Exception as e:  # noqa: BLE001 - keep building the rest
            print(f"[data] SKIPPED {label}: {type(e).__name__}: {e}")


# ---------------------------------------------------------------------------
# Metric functions -- EXACT copies of paper_plots/tdc_tools.py so the browser
# playground reproduces the paper numbers.  (chi2_offset: reduced chi^2 with a
# free constant offset.)
# ---------------------------------------------------------------------------

def _chi2_offset(model, data, error):
    import numpy as np
    N = 106
    f = len(model) / N
    alpha = np.sum(((data - model) / error) ** 2)
    beta = -2 * np.sum((data - model) / error ** 2)
    gamma = np.sum(1 / error ** 2)
    chi2 = gamma * (alpha / gamma - beta ** 2 / (4 * gamma ** 2)) / (f * N)
    return float(chi2)


def _dump_json(obj, path):
    """Write JSON that is valid for browsers: Python's json.dump emits bare
    NaN/Infinity tokens which are NOT valid JSON and break JSON.parse()."""
    import re
    with open(path, "w") as fh:
        json.dump(obj, fh)
    with open(path) as fh:
        txt = fh.read()
    txt = re.sub(r"\bNaN\b", "null", txt)
    txt = re.sub(r"\bInfinity\b", "1e308", txt)
    txt = re.sub(r"\b-Infinity\b", "-1e308", txt)
    with open(path, "w") as fh:
        fh.write(txt)


# ---------------------------------------------------------------------------
# Data exporters -- read the SAME files as the paper notebooks.
# ---------------------------------------------------------------------------

TEAMS = ["lightcurver", "starred_v1", "heidelberg", "luras_v1"]
STARRED_TEAMS = ["starred_v1", "starred_v2"]
GEOMETRIES = ["cross", "cusp", "fold", "double"]
R_ES = ["07", "10", "15"]
HOST_FLUXES = ["010", "050", "100"]
LENS_FLUXES = ["010", "050", "100"]


def export_scores():
    """Replicate the Fig_10/11/13 data cell: for every (team, geometry, image,
    theta_E, host, lens) and round, compute chi2_offset of the team's submitted
    light curve against the true one, plus f_cont and f_tot.  Written as a flat
    table so the browser can filter/aggregate on demand."""
    import numpy as np
    import pandas as pd

    rows = []
    for team in TEAMS + STARRED_TEAMS:
        for geometry in GEOMETRIES:
            images = ["A", "B"] if geometry == "double" else ["A", "B", "C", "D"]
            for R_E in R_ES:
                for host_flux in HOST_FLUXES:
                    for lens_flux in LENS_FLUXES:
                        filename = f"{geometry}_{R_E}_{host_flux}_{lens_flux}.csv"
                        true_path = os.path.join(LCS_ROOT, "true", filename)
                        if not os.path.exists(true_path):
                            continue
                        true_lc = pd.read_csv(true_path)
                        if team == "heidelberg":
                            true_lc["time"] = np.round(true_lc["time"], 3)

                        # per-image contamination + total-flux metrics (true LC)
                        f_cont, f_tot = {}, {}
                        for image in images:
                            bg = true_lc[f"background_{image}"]
                            fl = true_lc[f"flux_{image}"]
                            f_cont[image] = float(1 - np.median(fl / (bg + fl)))
                            f_tot[image] = float(np.median(bg))

                        for rnd in ("round1", "round2"):
                            sub_path = os.path.join(LCS_ROOT, team, rnd, filename)
                            if not os.path.exists(sub_path):
                                continue
                            goodie_lc = pd.read_csv(sub_path)
                            aux = pd.merge(true_lc, goodie_lc, on="time")
                            for image in images:
                                fx = f"flux_{image}_x"      # true (left df)
                                fy = f"flux_{image}_y"      # team (right df)
                                ey = f"flux_{image}_err_y"  # team error (matches notebook)
                                if not ({fx, fy, ey} <= set(aux.columns)):
                                    continue
                                chi2 = _chi2_offset(aux[fx], aux[fy], aux[ey])
                                rows.append({
                                    "team": team, "geometry": geometry, "image": image,
                                    "theta_E": R_E, "host_flux": host_flux, "lens_flux": lens_flux,
                                    "round": rnd, "chi2_offset": chi2,
                                    "f_cont": f_cont[image], "f_tot": f_tot[image],
                                })

    cols = ["team", "geometry", "image", "theta_E", "host_flux", "lens_flux",
            "round", "chi2_offset", "f_cont", "f_tot"]
    out = {"columns": cols, "rows": rows,
           "teams": TEAMS + STARRED_TEAMS, "geometries": GEOMETRIES}
    _dump_json(out, os.path.join(DATADST, "scores.json"))
    print(f"[data] wrote scores.json ({len(rows)} rows)")


def export_lightcurves():
    """Export the per-visit light curves for a few representative systems so the
    playground can show interactive time-series (image A/B/C/D toggles).  We pick
    one config/theta_E/host/lens per geometry to keep the file small."""
    import pandas as pd

    picks = [("cross", "10", "050", "050"), ("cusp", "10", "050", "050"),
             ("fold", "10", "050", "050"), ("double", "10", "050", "050")]
    out = {}
    for geometry, R_E, host, lens in picks:
        filename = f"{geometry}_{R_E}_{host}_{lens}.csv"
        true_path = os.path.join(LCS_ROOT, "true", filename)
        if not os.path.exists(true_path):
            continue
        df = pd.read_csv(true_path)
        images = ["A", "B"] if geometry == "double" else ["A", "B", "C", "D"]
        cols = ["time"] + [f"flux_{i}" for i in images] + [f"flux_err_{i}" for i in images]
        cols = [c for c in cols if c in df.columns]
        out[filename] = {
            "geometry": geometry, "theta_E": R_E, "host_flux": host, "lens_flux": lens,
            "columns": cols,
            "data": df[cols].where(pd.notna(df[cols]), None).values.tolist(),
        }
    _dump_json(out, os.path.join(DATADST, "lightcurves.json"))
    print(f"[data] wrote lightcurves.json ({len(out)} systems)")


if __name__ == "__main__":
    copy_figures()
    write_manifest()
    export_data()
    print("done.")
