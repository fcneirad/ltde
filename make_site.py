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
PAPER_PLOTS = os.path.join(TDC, "paper_plots")   # notebooks + shared helpers
FIGSRC = os.path.join(PAPER_PLOTS, "figures")
FIGDST = os.path.join(HERE, "figures")
DATADST = os.path.join(HERE, "data")

# Base data locations (same as the paper notebooks).  Override via env if needed.
DATA_ROOT = os.environ.get("LTDE_DATA_ROOT", "/media/data/TDC")
LCS_ROOT = os.path.join(DATA_ROOT, "standard_lcs")

sys.path.insert(0, HERE)
sys.path.insert(0, PAPER_PLOTS)   # for lc_plot (the paper's standardized LC pipeline)
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
    """Export per-system light curves for ALL 108 systems, one JSON file each
    (data/lcs/<system>.json), so the browser can lazy-load any system on demand.

    Data come from lc_plot.load_lc_data -- the SAME standardized pipeline as the
    paper's Fig_10-13 and Fig_seeing code: the true catalogue is built from
    catalogues/sys_catalogue.csv (scaled by image magnitudes, relabelled so A =
    brightest) and each team's submission is normalised to the same A..D
    convention.  Reading standard_lcs/true/*.csv directly would mislabel images
    (e.g. B/C are swapped for some systems).

    Each file contains, per source ('true' + 5 teams):
      time[], fwhm[] (true only), and mag_<img> / mag_<img>_err arrays for the
      images that exist in that geometry (A..D, or A/B for double).
    Plus precomputed per-epoch chi2_offset pairs [fwhm, chi2] per team+image
    (same definition as Fig_seeing: squared residual after removing the best-fit
    global constant offset), so the 'seeing trend' playground plot needs no
    client-side fitting.

    Magnitudes are used (not fluxes) to match the paper's light-curve figures.
    """
    import numpy as np
    import pandas as pd
    from lc_plot import load_lc_data, _images_for

    lcs_dir = os.path.join(DATADST, "lcs")
    os.makedirs(lcs_dir, exist_ok=True)
    # remove stale per-system files from previous builds
    for fn in os.listdir(lcs_dir):
        if fn.endswith(".json"):
            os.remove(os.path.join(lcs_dir, fn))

    n_written = 0
    for geometry in GEOMETRIES:
        images = _images_for(geometry)
        for R_E in R_ES:
            for host_flux in HOST_FLUXES:
                for lens_flux in LENS_FLUXES:
                    key = f"{geometry}_{R_E}_{host_flux}_{lens_flux}"
                    try:
                        true_d = load_lc_data("lightcurver", geometry, R_E, host_flux, lens_flux)
                    except Exception as e:  # noqa: BLE001 - skip missing system
                        print(f"[data] SKIPPED {key}: {type(e).__name__}: {e}")
                        continue
                    sysc = true_d["sys_catalogue"]

                    out = {
                        "geometry": geometry, "theta_E": R_E,
                        "host_flux": host_flux, "lens_flux": lens_flux,
                        "images": images,
                        "fwhm": sysc["fwhm"].round(4).tolist(),
                        "sources": {},
                    }

                    def _mag_block(df):
                        block = {"time": df["time"].round(6).tolist()}
                        for img in images:
                            mcol, ecol = f"mag_{img}", f"mag_{img}_err"
                            if mcol not in df.columns:
                                continue
                            block[img] = {
                                "mag": [None if v != v else round(float(v), 4) for v in df[mcol]],
                                "err": ([None if v != v else round(float(v), 5) for v in df[ecol]]
                                        if ecol in df.columns else None),
                            }
                        return block

                    out["sources"]["true"] = _mag_block(sysc)

                    # per-epoch chi2_offset pairs (Fig_seeing definition), per image
                    epoch_pairs = {}
                    for team in TEAMS + STARRED_TEAMS:
                        rnd = "round2" if team == "starred_v2" else "round1"
                        sub_path = os.path.join(LCS_ROOT, team, rnd, key + ".csv")
                        if not os.path.exists(sub_path):
                            continue
                        try:
                            d = load_lc_data(team, geometry, R_E, host_flux, lens_flux, rnd=rnd)
                        except Exception as e:  # noqa: BLE001
                            print(f"[data] SKIPPED {key}/{team}: {type(e).__name__}: {e}")
                            continue
                        good = d["goodie_lc"]
                        out["sources"][team] = _mag_block(good)

                        if team == "heidelberg":
                            sysc_t = sysc.copy()
                            sysc_t["time"] = np.round(sysc_t["time"], 3)
                            m = pd.merge(sysc_t, good, on="time", suffixes=("_t", "_s"))
                        else:
                            m = pd.merge(sysc, good, on="time", suffixes=("_t", "_s"))
                        per_img = {}
                        for img in images:
                            model = m[f"flux_{img}_t"].to_numpy()
                            data = m[f"flux_{img}_s"].to_numpy()
                            if f"flux_err_{img}" in m.columns and m[f"flux_err_{img}"].notna().any():
                                err = m[f"flux_err_{img}"].to_numpy()
                            else:  # luras_v1 uses the suffix convention
                                err = m[f"flux_{img}_err_s"].to_numpy()
                            ok = (np.isfinite(model) & np.isfinite(data)
                                  & np.isfinite(err) & (err > 0))
                            if ok.sum() < 3:
                                continue
                            model, data, err = model[ok], data[ok], err[ok]
                            fw = m["fwhm"].to_numpy()[ok]
                            beta = -2.0 * np.sum((data - model) / err**2)
                            gamma = np.sum(1.0 / err**2)
                            cstar = -beta / (2.0 * gamma)
                            per = ((data - model - cstar) / err)**2
                            per_img[img] = [[round(float(f), 4), round(float(c), 4)]
                                            for f, c in zip(fw, per)]
                        if per_img:
                            epoch_pairs[team] = per_img

                    out["epoch_chi2"] = epoch_pairs
                    _dump_json(out, os.path.join(lcs_dir, key + ".json"))
                    n_written += 1

    # index file so the browser can list all systems without fetching each one
    index = []
    for fn in sorted(os.listdir(lcs_dir)):
        if not fn.endswith(".json"):
            continue
        with open(os.path.join(lcs_dir, fn)) as fh:
            d = json.load(fh)
        index.append({"key": fn[:-5], "geometry": d["geometry"], "theta_E": d["theta_E"],
                      "host_flux": d["host_flux"], "lens_flux": d["lens_flux"],
                      "images": d["images"]})
    _dump_json(index, os.path.join(DATADST, "lc_index.json"))
    print(f"[data] wrote {n_written} per-system LC files -> {lcs_dir} (+ lc_index.json)")


if __name__ == "__main__":
    copy_figures()
    write_manifest()
    export_data()
    print("done.")
