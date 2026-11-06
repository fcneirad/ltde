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

const TEAM_COLOR = { lightcurver: "#1f77b4", starred_v1: "#ff7f0e", heidelberg: "#2ca02c", luras_v1: "#d62728", starred_v2: "#9467bd" };
const TEAM_LABEL = { lightcurver: "LightCurver", starred_v1: "STARRED (v1)", heidelberg: "Heidelberg", luras_v1: "LURAS (v1)", starred_v2: "STARRED (v2)" };

function selectedValues(id) {
  const el = document.getElementById(id);
  if (!el) return [];
  return Array.from(el.selectedOptions).map((o) => o.value);
}

async function renderPlayground() {
  await loadPlaygroundData();
  const type = $("#pg-plot").value;
  // show the relevant control group
  $("#pg-scores-controls").hidden = type !== "scores_scatter";
  $("#pg-lc-controls").hidden = type !== "lc_timeseries";

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

function renderLC(area, status) {
  if (LCS === "missing" || Object.keys(LCS).length === 0) {
    status.textContent = "lightcurves.json not found — run `make_site.py` to export the data.";
    area.innerHTML = "";
    return;
  }
  const key = $("#pg-system").value;
  const lc = LCS[key];
  if (!lc) { area.innerHTML = ""; return; }
  const ci = lc.columns.indexOf("time");
  const t = lc.data.map((r) => r[ci]);
  const traces = [];
  ["A", "B", "C", "D"].forEach((img) => {
    const fi = lc.columns.indexOf("flux_" + img);
    if (fi < 0) return;
    traces.push({
      x: t, y: lc.data.map((r) => r[fi]),
      mode: "lines+markers", name: `image ${img}`, type: "scattergl", marker: { size: 4 },
    });
  });
  Plotly.newPlot(area, traces, {
    margin: { l: 60, r: 20, t: 30, b: 50 },
    xaxis: { title: "time" }, yaxis: { title: "flux" },
    legend: { orientation: "h", y: 1.12 },
  }, { responsive: true });
  status.textContent = `${key} — ${lc.geometry}, &theta;<sub>E</sub>=${lc.theta_E}, host=${lc.host_flux}, lens=${lc.lens_flux}`;
}

function populateSystemSelect() {
  if (LCS === null || LCS === "missing") return;
  const sel = $("#pg-system");
  sel.innerHTML = "";
  Object.keys(LCS).forEach((k) => {
    const o = document.createElement("option");
    o.value = k; o.textContent = k;
    sel.appendChild(o);
  });
}

function initPlayground() {
  $("#pg-apply").addEventListener("click", renderPlayground);
  $("#pg-plot").addEventListener("change", renderPlayground);
  ["pg-teams", "pg-config", "pg-round", "pg-image", "pg-xaxis", "pg-system"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", renderPlayground);
  });
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
  // pre-load playground data so the system dropdown is populated on first open
  await loadPlaygroundData();
  populateSystemSelect();
});
