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
let SCORES = null, LC_INDEX = null;
const LCS_CACHE = new Map();   // system key -> per-system JSON (lazy-loaded)

async function loadPlaygroundData() {
  if (SCORES === null) {
    try { const r = await fetch("data/scores.json"); SCORES = await r.json(); }
    catch (_) { SCORES = "missing"; }
  }
  if (LC_INDEX === null) {
    try { const r = await fetch("data/lc_index.json"); LC_INDEX = await r.json(); }
    catch (_) { LC_INDEX = "missing"; }
  }
}

async function loadSystem(key) {
  if (!LCS_CACHE.has(key)) {
    const r = await fetch(`data/lcs/${key}.json`);
    LCS_CACHE.set(key, await r.json());
  }
  return LCS_CACHE.get(key);
}

const TEAM_COLOR = { lightcurver: "#1f77b4", starred_v1: "#ff7f0e", heidelberg: "#2ca02c", luras_v1: "#d62728", starred_v2: "#9467bd" };
const TEAM_LABEL = { lightcurver: "LightCurver", starred_v1: "STARRED (v1)", heidelberg: "Heidelberg", luras_v1: "LURAS (v1)", starred_v2: "STARRED (v2)" };
const IMAGE_COLOR = { A: "#1f77b4", B: "#ff7f0e", C: "#2ca02c", D: "#d62728" };
// one dash pattern per source so image colour stays free for the image identity
const SOURCE_DASH = { true: "solid", lightcurver: "dot", starred_v1: "dash", heidelberg: "longdash", luras_v1: "dashdot", starred_v2: "longdashdot" };

function selectedValues(id) {
  const el = document.getElementById(id);
  if (!el) return [];
  return Array.from(el.selectedOptions).map((o) => o.value);
}

function checkedValues(cls) {
  return Array.from(document.querySelectorAll("." + cls + ":checked")).map((c) => c.value);
}

const sysLabel = (s) => `${s.geometry} · θE ${parseFloat(s.theta_E)}″ · host ${parseInt(s.host_flux)}% · lens ${parseInt(s.lens_flux)}%`;

async function renderPlayground() {
  await loadPlaygroundData();
  const type = $("#pg-plot").value;
  // show the relevant control group
  const groups = {
    scores_scatter: "pg-scores-controls", lc_timeseries: "pg-lc-controls",
    seeing_trend: "pg-seeing-controls", chi2_heatmap: "pg-heatmap-controls",
    geom_box: "pg-box-controls", fcont_thetae: "pg-fcont-controls",
  };
  Object.entries(groups).forEach(([t, id]) => { document.getElementById(id).hidden = type !== t; });

  const area = $("#pg-plot-area");
  const status = $("#pg-status");
  if (typeof Plotly === "undefined") {
    status.textContent = "Plotly failed to load (offline?). The static gallery still works.";
    return;
  }
  status.textContent = "";
  try {
    if (type === "scores_scatter") renderScores(area, status);
    else if (type === "lc_timeseries") await renderLC(area, status);
    else if (type === "seeing_trend") await renderSeeing(area, status);
    else if (type === "chi2_heatmap") renderHeatmap(area, status);
    else if (type === "geom_box") renderBox(area, status);
    else if (type === "fcont_thetae") renderFCont(area, status);
  } catch (e) {
    console.error(e);
    status.textContent = "Error rendering plot: " + e.message;
  }
}

function renderScores(area, status) {
  if (SCORES === "missing" || !SCORES.rows) {
    status.textContent = "scores.json not found — run `make_site.py` to export the data.";
    area.innerHTML = "";
    return;
  }
  const rows = SCORES.rows;
  const teams = selectedValues("pg-teams");
  const geoms = selectedValues("pg-config");
  const round = $("#pg-round").value;
  const image = $("#pg-image").value;
  const xkey = $("#pg-xaxis").value;   // 'f_cont' or 'f_tot'

  // filter to the chosen geometry/round/image, keep all theta_E/host/lens combos
  const sel = rows.filter((r) => geoms.includes(r.geometry) && r.round === round && r.image === image);
  if (sel.length === 0) {
    status.textContent = "No data for this selection (e.g. image D does not exist for the double configuration).";
    area.innerHTML = "";
    return;
  }

  const traces = teams.map((team) => {
    const pts = sel.filter((r) => r.team === team && r.chi2_offset != null && r[xkey] != null);
    return {
      x: pts.map((r) => r[xkey]), y: pts.map((r) => r.chi2_offset),
      mode: "markers", type: "scattergl", name: TEAM_LABEL[team] || team,
      marker: { size: 6, opacity: 0.65, color: TEAM_COLOR[team] || "#888" },
    };
  });

  const xTitle = xkey === "f_cont" ? "f<sub>cont</sub> (image / total flux ratio)" : "f<sub>tot</sub> [flux]";
  Plotly.newPlot(area, traces, {
    margin: { l: 60, r: 20, t: 30, b: 50 },
    xaxis: { title: xTitle, type: "log" },
    yaxis: { title: "&chi;&sup2;<sub>offset</sub>", type: "log", range: [-1, 2] },
    legend: { orientation: "h", y: 1.12 },
    showlegend: true,
  }, { responsive: true });
  status.textContent = `${sel.length} points across ${geoms.join(", ")} (${round}, image ${image}).`;
}

async function renderLC(area, status) {
  if (LC_INDEX === "missing") {
    status.textContent = "lc_index.json not found — run `make_site.py` to export the data.";
    area.innerHTML = "";
    return;
  }
  const key = $("#pg-lc-system").value;
  if (!key) { area.innerHTML = ""; return; }
  status.textContent = "Loading system…";
  const lc = await loadSystem(key);
  const teams = checkedValues("lc-team");
  const imgs = checkedValues("lc-img").filter((i) => lc.images.includes(i));

  const traces = [];
  // true curves: solid lines with error bands
  ["true", ...teams].forEach((src) => {
    const block = lc.sources[src];
    if (!block) return;
    imgs.forEach((img) => {
      const b = block[img];
      if (!b || !b.mag) return;
      const label = src === "true" ? `image ${img} (true)` : `${TEAM_LABEL[src] || src}, image ${img}`;
      if (src === "true") {
        if (b.err) traces.push({
          x: block.time, y: b.mag.map((m, i) => m - b.err[i]),
          mode: "lines", line: { width: 0 }, showlegend: false, hoverinfo: "skip",
        });
        traces.push({
          x: block.time, y: b.mag.map((m, i) => m + b.err[i]),
          fill: "tonexty", fillcolor: IMAGE_COLOR[img] + "26",
          mode: "lines", line: { width: 0 }, showlegend: false, hoverinfo: "skip",
        });
      }
      traces.push({
        x: block.time, y: b.mag,
        mode: src === "true" ? "lines" : "markers",
        type: "scattergl", name: label,
        line: { color: IMAGE_COLOR[img], width: 2, dash: SOURCE_DASH[src] || "solid" },
        marker: { size: 4, color: IMAGE_COLOR[img] },
      });
    });
  });

  Plotly.newPlot(area, traces, {
    margin: { l: 60, r: 20, t: 30, b: 50 },
    xaxis: { title: "time [days]" }, yaxis: { title: "brightness [mag]", autorange: "reversed" },
    legend: { orientation: "h", y: 1.12 },
  }, { responsive: true });
  status.textContent = `${sysLabel(lc)} — solid lines = true, markers/dotted = submitted.`;
}

/* ------------------------------------------------------------------ */
/* Seeing trend (generalized Fig_seeing): per-epoch chi2_offset vs FWHM */
/* ------------------------------------------------------------------ */
const SEEING_BINS = [0.30, 0.438, 0.575, 0.712, 0.850, 0.987, 1.125, 1.262, 1.40];

function binnedMedian(pairs) {
  // pairs: [[fwhm, chi2], ...] -> [{x, y, lo, hi, n}] per seeing bin (>=3 pts)
  const out = [];
  for (let b = 0; b < SEEING_BINS.length - 1; b++) {
    const sel = pairs.filter((p) => p[0] >= SEEING_BINS[b] && p[0] < SEEING_BINS[b + 1]);
    if (sel.length < 3) continue;
    const vals = sel.map((p) => p[1]).sort((a, c) => a - c);
    const med = vals[Math.floor(vals.length / 2)];
    out.push({ x: 0.5 * (SEEING_BINS[b] + SEEING_BINS[b + 1]), y: med, n: sel.length });
  }
  return out;
}

async function renderSeeing(area, status) {
  if (LC_INDEX === "missing") {
    status.textContent = "lc_index.json not found — run `make_site.py` to export the data.";
    area.innerHTML = "";
    return;
  }
  const key = $("#pg-seeing-system").value;
  if (!key) { area.innerHTML = ""; return; }
  status.textContent = "Loading system…";
  const lc = await loadSystem(key);
  const teams = selectedValues("pg-seeing-teams");
  const imgs = selectedValues("pg-seeing-images").filter((i) => lc.images.includes(i));

  const traces = [];
  teams.forEach((team) => {
    const perImg = (lc.epoch_chi2 || {})[team];
    if (!perImg) return;
    let pairs = [];
    imgs.forEach((img) => { if (perImg[img]) pairs = pairs.concat(perImg[img]); });
    if (!pairs.length) return;
    const col = TEAM_COLOR[team] || "#888";
    traces.push({
      x: pairs.map((p) => p[0]), y: pairs.map((p) => p[1]),
      mode: "markers", type: "scattergl", name: TEAM_LABEL[team] || team,
      marker: { size: 5, opacity: 0.3, color: col },
    });
    const med = binnedMedian(pairs);
    if (med.length) {
      traces.push({
        x: med.map((m) => m.x), y: med.map((m) => m.y),
        mode: "lines", line: { color: col, width: 2.5 }, showlegend: false, hoverinfo: "skip",
      });
    }
  });

  Plotly.newPlot(area, traces, {
    margin: { l: 60, r: 20, t: 30, b: 50 },
    xaxis: { title: "seeing [arcsec]", range: [0.30, 1.40] },
    yaxis: { title: "&chi;&sup2;<sub>offset</sub> (per epoch)", type: "log", range: [0.1, 100] },
    shapes: [{ type: "line", x0: 0.30, x1: 1.40, y0: 1, y1: 1, line: { color: "#888", dash: "dot" } }],
    legend: { orientation: "h", y: 1.12 },
  }, { responsive: true });
  status.textContent = `${sysLabel(lc)} — each point is one epoch of one image; solid line = binned median (bins with &ge;3 epochs).`;
}

/* ------------------------------------------------------------------ */
/* Heatmap: median chi2_offset over the theta_E x host/lens grid       */
/* ------------------------------------------------------------------ */
function renderHeatmap(area, status) {
  if (SCORES === "missing" || !SCORES.rows) {
    status.textContent = "scores.json not found — run `make_site.py` to export the data.";
    area.innerHTML = "";
    return;
  }
  const geom = $("#pg-hm-geometry").value;
  const round = $("#pg-hm-round").value;
  const image = $("#pg-hm-image").value;
  // starred_v2 only exists in round2; the four R1 teams only exist in round1
  const teams = SCORES.teams.filter((t) => (t === "starred_v2") === (round === "round2"));

  const thetas = ["0.7", "1.0", "1.5"];
  const fluxes = ["10%", "50%", "100%"];
  const z = teams.map((team) => {
    // Plotly heatmaps index z as [y][x] -> rows = flux (y), cols = theta_E (x)
    const grid = [];
    for (let j = 0; j < fluxes.length; j++) {
      const row = [];
      for (let i = 0; i < thetas.length; i++) {
        const re = ["07", "10", "15"][i];
        const fl = ["010", "050", "100"][j];
        const vals = SCORES.rows
          .filter((r) => r.team === team && r.geometry === geom && r.round === round
                         && r.image === image && r.theta_E === re
                         && (r.host_flux === fl || r.lens_flux === fl))
          .map((r) => r.chi2_offset).filter((v) => v != null && isFinite(v));
        row.push(vals.length ? vals.sort((a, b) => a - b)[Math.floor(vals.length / 2)] : null);
      }
      grid.push(row);
    }
    return { z: grid, name: TEAM_LABEL[team] || team };
  });

  Plotly.newPlot(area, z.map((d) => ({
    type: "heatmap", x: thetas, y: fluxes, z: d.z, name: d.name,
    colorscale: "Viridis", colorbar: { title: "&chi;&sup2;<sub>offset</sub>" },
  })), {
    margin: { l: 60, r: 20, t: 30, b: 50 },
    xaxis: { title: "&theta;<sub>E</sub> [arcsec]" },
    yaxis: { title: "host / lens flux [%]", categoryarray: fluxes, categoryorder: "array" },
    showlegend: true, legend: { orientation: "h", y: 1.12 },
  }, { responsive: true });
  status.textContent = `Median &chi;&sup2;<sub>offset</sub> per cell (image ${image}, ${geom}, ${round}); each cell pools the host and lens flux variations at fixed &theta;<sub>E</sub>.`;
}

/* ------------------------------------------------------------------ */
/* Box plot: chi2_offset distribution per team x geometry              */
/* ------------------------------------------------------------------ */
function renderBox(area, status) {
  if (SCORES === "missing" || !SCORES.rows) {
    status.textContent = "scores.json not found — run `make_site.py` to export the data.";
    area.innerHTML = "";
    return;
  }
  const teams = selectedValues("pg-box-teams");
  const round = $("#pg-box-round").value;
  const image = $("#pg-box-image").value;
  const geoms = SCORES.geometries;

  const traces = [];
  let npts = 0;
  teams.forEach((team) => {
    geoms.forEach((geom) => {
      const vals = SCORES.rows
        .filter((r) => r.team === team && r.geometry === geom && r.round === round && r.image === image)
        .map((r) => r.chi2_offset).filter((v) => v != null && isFinite(v));
      if (!vals.length) return;
      npts += vals.length;
      const cat = `${geom} · ${TEAM_LABEL[team] || team}`;
      traces.push({
        type: "box", y: vals, x: vals.map(() => cat), name: cat,
        boxpoints: false, marker: { color: TEAM_COLOR[team] || "#888" },
      });
    });
  });

  const cats = geoms.flatMap((g) => teams.map((t) => `${g} · ${TEAM_LABEL[t] || t}`));
  Plotly.newPlot(area, traces, {
    margin: { l: 60, r: 20, t: 30, b: 70 },
    yaxis: { title: "&chi;&sup2;<sub>offset</sub>", type: "log" },
    xaxis: { tickangle: -30, categoryorder: "array", categoryarray: cats },
    showlegend: false,
    bargap: 0.1,
  }, { responsive: true });
  status.textContent = `${npts} points (image ${image}, ${round}); all &theta;<sub>E</sub> &times; host &times; lens configurations pooled per geometry.`;
}

/* ------------------------------------------------------------------ */
/* f_cont vs theta_E                                                   */
/* ------------------------------------------------------------------ */
function renderFCont(area, status) {
  if (SCORES === "missing" || !SCORES.rows) {
    status.textContent = "scores.json not found — run `make_site.py` to export the data.";
    area.innerHTML = "";
    return;
  }
  const geoms = selectedValues("pg-fc-config");
  const image = $("#pg-fc-image").value;

  // f_cont is a property of the true system: deduplicate on (geometry, theta_E,
  // host_flux, lens_flux) and take round1 rows.
  const seen = new Set();
  const pts = [];
  SCORES.rows.forEach((r) => {
    if (!geoms.includes(r.geometry) || r.image !== image || r.round !== "round1") return;
    const k = `${r.geometry}|${r.theta_E}|${r.host_flux}|${r.lens_flux}`;
    if (seen.has(k)) return;
    seen.add(k);
    pts.push({ x: parseFloat(r.theta_E), y: r.f_cont, geom: r.geometry });
  });

  const GEOM_COLOR = { cross: "#1f77b4", cusp: "#ff7f0e", fold: "#2ca02c", double: "#d62728" };
  const traces = geoms.map((geom) => ({
    x: pts.filter((p) => p.geom === geom).map((p) => p.x),
    y: pts.filter((p) => p.geom === geom).map((p) => p.y),
    mode: "markers", type: "scattergl", name: geom,
    marker: { size: 7, color: GEOM_COLOR[geom] || "#888" },
  }));

  Plotly.newPlot(area, traces, {
    margin: { l: 60, r: 20, t: 30, b: 50 },
    xaxis: { title: "&theta;<sub>E</sub> [arcsec]", tickvals: [0.7, 1.0, 1.5] },
    yaxis: { title: "f<sub>cont</sub> (image / total flux ratio)" },
    legend: { orientation: "h", y: 1.12 },
  }, { responsive: true });
  status.textContent = `${pts.length} systems (image ${image}); f<sub>cont</sub> is computed from the true light curves, so it does not depend on team or round.`;
}

function populateSystemSelects() {
  if (!Array.isArray(LC_INDEX)) return;
  const mk = (sel) => {
    sel.innerHTML = "";
    LC_INDEX.forEach((s) => {
      const o = document.createElement("option");
      o.value = s.key;
      o.textContent = sysLabel(s);
      sel.appendChild(o);
    });
  };
  mk($("#pg-lc-system"));
  mk($("#pg-seeing-system"));
}

function initPlayground() {
  $("#pg-apply").addEventListener("click", renderPlayground);
  $("#pg-plot").addEventListener("change", renderPlayground);
  const controlIds = [
    "pg-teams", "pg-config", "pg-round", "pg-image", "pg-xaxis",
    "pg-lc-system", "pg-seeing-system", "pg-seeing-teams", "pg-seeing-images",
    "pg-hm-geometry", "pg-hm-round", "pg-hm-image",
    "pg-box-teams", "pg-box-round", "pg-box-image",
    "pg-fc-config", "pg-fc-image",
  ];
  controlIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", renderPlayground);
  });
  document.querySelectorAll(".lc-team, .lc-img").forEach((c) => c.addEventListener("change", renderPlayground));
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
  // pre-load playground data so the system dropdowns are populated on first open
  await loadPlaygroundData();
  populateSystemSelects();
});
