# LTDE — figures & playground

Static website (GitHub Pages) showing the figures from the **Lens Time Delay
Experiment** paper, plus an interactive playground to re-create them from the
underlying data.

## Layout

| Path | Purpose |
|---|---|
| `index.html` | single-page app (Gallery + Playground tabs) |
| `css/style.css` | styling |
| `js/app.js` | gallery, lightbox, Plotly playground |
| `figures/` | rendered figure PNGs (+ PDFs) — copied from `paper_plots/figures` |
| `data/*.json` | data exported for the browser (light curves, scores, …) |
| `make_site.py` | **build script**: refreshes `figures/` and `data/` |
| `figures_meta.py` | figure order, groups, captions (from `aanda.tex`) |

## Updating the site

1. Re-run the relevant notebook cell(s) in `paper_plots/` so the PNGs in
   `paper_plots/figures/` are current.
2. Run:
   ```bash
   python3 make_site.py
   ```
3. Commit & push:
   ```bash
   git add -A && git commit -m "update figures" && git push
   ```

GitHub Pages serves this repo's `main` branch (or the `/` root) — no build step
is needed on GitHub; everything here is static.

## Notes

- The playground computes plots **client-side** from `data/*.json`; there is no
  server and no new physics is computed in the browser.
- Data exporters in `make_site.py` read the same files as the paper notebooks.
  If a source file is missing, that export is skipped and the site still builds
  as a static gallery.
