/* LTDE webpage app: gallery + interactive playground.
 * All data is loaded from ./data/*.json (exported by make_site.py).
 * The site works as a static gallery even if some JSON files are missing.
 */
"use strict";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */
function initTabs() {
  $$("#tabs .tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$("#tabs .tab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const view = btn.dataset.view;
      $("#view-gallery").hidden = view !== "gallery";
      $("#view-playground").hidden = view !== "playground";
      if (view === "playground") renderPlayground();
    });
  });
}

/* ------------------------------------------------------------------ */
/* Gallery                                                             */
/* ------------------------------------------------------------------ */
let FIGS = [];

async function loadManifest() {
  try {
    const r = await fetch("data/figures.json");
    FIGS = await r.json();
  } catch (e) {
    console.error("could not load figures.json", e);
    $("#gallery").innerHTML = '<p class="status">Could not load figure manifest.</p>';
  }
}

function renderGroupFilter() {
  const sel = $("#group-filter");
  const groups = [...new Set(FIGS.map((f) => f.group))];
  groups.forEach((g) => {
    const o = document.createElement("option");
    o.value = g; o.textContent = g;
    sel.appendChild(o);
  });
  sel.addEventListener("change", renderGallery);
}

function renderGallery() {
  const filter = $("#group-filter").value;
  const box = $("#gallery");
  box.innerHTML = "";
  let lastGroup = null;
  FIGS.forEach((f) => {
    if (filter && f.group !== filter) return;
    if (f.group !== lastGroup) {
      const h = document.createElement("div");
      h.className = "group-title";
      h.textContent = f.group;
      box.appendChild(h);
      lastGroup = f.group;
    }
    const card = document.createElement("div");
    card.className = "card";
    const badge = f.interactive ? '<span class="badge">interactive</span>' : "";
    card.innerHTML = `
      <div class="thumb"><img loading="lazy" src="figures/${f.name}.png" alt="${f.title}"></div>
      <div class="body">
        <h3>${f.title}${badge}</h3>
        <p data-caption>${f.caption}</p>
      </div>`;
    card.querySelector(".thumb").addEventListener("click", () => openLightbox(f));
    box.appendChild(card);
  });
  typesetMath(box);
}

/* ------------------------------------------------------------------ */
/* Lightbox                                                            */
/* ------------------------------------------------------------------ */
function openLightbox(f) {
  const lb = $("#lightbox");
  $("#lightbox-img").src = `figures/${f.name}.png`;
  $("#lightbox-caption").textContent = f.caption;
  lb.hidden = false;
  typesetMath(lb);
}
function initLightbox() {
  const lb = $("#lightbox");
  lb.addEventListener("click", () => (lb.hidden = true));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") lb.hidden = true; });
}

/* ------------------------------------------------------------------ */
/* Math typesetting (KaTeX, optional)                                  */
/* ------------------------------------------------------------------ */
function typesetMath(root) {
  if (!window.katex) return;
  // captions use $...$ inline math
  root.querySelectorAll("[data-caption]").forEach((el) => {
    const html = el.textContent.replace(/\$(.+?)\$/g, (_, m) => {
      try { return katex.renderToString(m, { throwOnError: false }); }
      catch (_) { return `$${m}$`; }
    });
    el.innerHTML = html;
  });
}

/* ------------------------------------------------------------------ */
/* Playground                                                          */
/* ------------------------------------------------------------------ */
let SCORES = null, LCS = null;

async function loadPlaygroundData() {
  if (SCORES === null) {
    try { const r = await fetch("data/scores.json"); SCORES = await r.json(); }
    catch (_) { SCORES = "missing"; }
  }
  if (LCS === null) {
    try { const r = await fetch("data/lightcurves.json"); LCS = await r.json(); }
    catch (_) { LCS = "missing"; }
  }
}

function selectedConfigs() {
  return $$("#pg-config option:selected").map((o) => o.value);
}

async function renderPlayground() {
  await loadPlaygroundData();
  const type = $("#pg-plot").value;
  const area = $("#pg-plot-area");
  const status = $("#pg-status");
  if (typeof Plotly === "undefined") {
    status.textContent = "Plotly failed to load (offline?). The static gallery still works.";
    return;
  }
  if (type === "scores_scatter") renderScores(area, status);
  else if (type === "lc_timeseries") renderLC(area, status);
}

function renderScores(area, status) {
  if (SCORES === "missing" || !SCORES.data) {
    status.textContent = "scores.json not found — run `make_site.py` after wiring the data paths (phase 2).";
    area.innerHTML = "";
    return;
  }
  const cols = SCORES.columns, rows = SCORES.data;
  const idx = (n) => cols.indexOf(n);
  const iCfg = idx("config"), iChi = idx("chi2_offset"), iFc = idx("f_cont"), iFt = idx("f_tot");
  const cfgs = selectedConfigs();

  const traces = [];
  if (iCfg >= 0 && iChi >= 0) {
    // left: chi2 vs f_cont (or f_tot fallback)
    const xCol = iFc >= 0 ? iFc : iFt;
    cfgs.forEach((c, k) => {
      const pts = rows.filter((r) => r[iCfg] === c && r[iChi] != null && r[xCol] != null);
      traces.push({
        x: pts.map((r) => r[xCol]), y: pts.map((r) => r[iChi]),
        mode: "markers", type: "scattergl", name: c,
        marker: { size: 6, opacity: 0.7 },
      });
    });
    Plotly.newPlot(area, traces, {
      margin: { l: 55, r: 20, t: 30, b: 45 },
      xaxis: { title: cols[xCol], type: "log" },
      yaxis: { title: "chi2_offset", type: "log" },
      legend: { orientation: "h", y: 1.1 },
    }, { responsive: true });
  } else {
    status.textContent = "scores.json is missing the expected columns (config / chi2_offset).";
    area.innerHTML = "";
  }
}

function renderLC(area, status) {
  if (LCS === "missing" || Object.keys(LCS).length === 0) {
    status.textContent = "lightcurves.json not found — run `make_site.py` after wiring the data paths (phase 2).";
    area.innerHTML = "";
    return;
  }
  const keys = Object.keys(LCS);
  const traces = [];
  keys.forEach((k) => {
    const lc = LCS[k];
    const ci = lc.columns.indexOf("time");
    if (ci < 0) return;
    const t = lc.data.map((r) => r[ci]);
    ["A", "B", "C", "D"].forEach((img) => {
      const fi = lc.columns.indexOf("flux_" + img);
      if (fi < 0) return;
      traces.push({
        x: t, y: lc.data.map((r) => r[fi]),
        mode: "lines+markers", name: `${k} ${img}`, type: "scattergl",
        marker: { size: 4 },
      });
    });
  });
  Plotly.newPlot(area, traces, {
    margin: { l: 55, r: 20, t: 30, b: 45 },
    xaxis: { title: "time" }, yaxis: { title: "flux" },
    legend: { orientation: "h", y: 1.1 },
  }, { responsive: true });
}

function initPlayground() {
  $("#pg-apply").addEventListener("click", renderPlayground);
  $("#pg-plot").addEventListener("change", renderPlayground);
  $("#pg-download").addEventListener("click", () => {
    const gd = $("#pg-plot-area");
    if (gd && typeof Plotly !== "undefined") Plotly.downloadImage(gd, { format: "png", filename: "ltde_plot" });
  });
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */
document.addEventListener("DOMContentLoaded", async () => {
  initTabs();
  initLightbox();
  initPlayground();
  await loadManifest();
  renderGroupFilter();
  renderGallery();
});
