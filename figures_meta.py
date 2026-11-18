"""Figure metadata for the LTDE webpage.

Captions are taken from paper/LTDE_results/aanda.tex (lightly trimmed of
LaTeX markup).  `group` is used to organise the gallery into sections.
The playground entries mark which figures can be re-plotted interactively
from the exported JSON data (see make_site.py / js/app.js).
"""

FIGURES = [
    # --- Section: lensed quasar examples (paper Fig. 1, four panels) -------
    dict(name="large_space", group="Lensed quasars", title="Large separation — space-based",
         caption="Lensed quasar with large image separation (J1537-3010), space-based "
                 "telescope (HST WFC3 F814W)."),
    dict(name="large_ground", group="Lensed quasars", title="Large separation — ground-based",
         caption="Same lensed quasar as above, observed with a ground-based telescope "
                 "(Legacy Survey DR10, z-band)."),
    dict(name="small_space", group="Lensed quasars", title="Small separation — space-based",
         caption="Lensed quasar with small image separation (DESJ0405-3308), space-based "
                 "telescope (HST WFC3 F814W)."),
    dict(name="small_ground", group="Lensed quasars", title="Small separation — ground-based",
         caption="Same lensed quasar as above, observed with a ground-based telescope "
                 "(Legacy Survey DR10, i-band)."),

    # --- Section: overview -------------------------------------------------
    dict(name="geometries", group="Overview", title="Lens configurations",
         caption="Examples of the four typical lens configurations found in lensed quasars. "
                 "The inner (solid) and outer (dashed) caustics are shown. The position of "
                 "the quasar is denoted with a cross, and the multiple images for this "
                 "position of the source are indicated as black dots."),
    dict(name="psf_distortion", group="Overview", title="PSF distortion field",
         caption="Example of a distortion field due to atmospheric effects taken from the "
                 "LSST DP0.2. The direction of the distortion is indicated by small ticks "
                 "whose length is exaggerated for illustration. Each tick is aligned with "
                 "the major axis of the ellipse that represents it."),
    dict(name="pipeline", group="Overview", title="Simulation pipeline",
         caption="Schematic description of how each exposure is generated, starting from a "
                 "Damped Random Walk (DRW) noise-free light curve at the bottom, to the final "
                 "observed frame, along with the main astrophysical and instrumental effects."),

    # --- Section: observations --------------------------------------------
    dict(name="fwhm_vs_seeing", group="Observations", title="Atmospheric conditions",
         caption="Distribution of the atmospheric conditions for each visit."),
    dict(name="seeing_effect_v2", group="Observations", title="Effect of seeing on light-curve recovery",
         caption=r"Per-epoch $\chi^2_{\rm offset}$ as a function of the atmospheric seeing "
                 r"(FWHM) for the four lens configurations (rows) and two extreme "
                 r"configurations per geometry: the hardest ($\theta_E=0.7''$, lens/host 100%) "
                 r"and the easiest ($\theta_E=1.5''$, lens/host 10%). Each point is one epoch of "
                 r"one image; the solid line and shaded band show the binned median (8 equal-width "
                 r"seeing bins) and its 68% bootstrap confidence interval per method. The dotted "
                 r"line marks $\chi^2_{\rm offset}=1$ (recovery within the noise).", interactive=True),

    # --- Section: light curves --------------------------------------------
    dict(name="lc_good", group="Light curves", title="Good light curve",
         caption="Example of a good light curve submission.", interactive=True),
    dict(name="lc_blended", group="Light curves", title="Blended (unresolved) images",
         caption="Example of a light curve submission where the close pair images are "
                 "unresolved, thus no light curves for image A and B are obtained.",
         interactive=True),
    dict(name="lc_leakage", group="Light curves", title="Flux leakage",
         caption="Example of a light curve submission where the flux of one image leaks "
                 "onto its close pair.", interactive=True),
    dict(name="lc_offset", group="Light curves", title="Offset light curve",
         caption="Example of a light curve submission that has an offset.", interactive=True),

    # --- Section: scores ----------------------------------------------------
    dict(name="scores_vs_contamination", group="Scores", title=r"$\chi^2_{\rm offset}$ vs contamination ratio",
         caption="From top to bottom we show the cross, cusp, fold, and double configurations. "
                 "The left panels show the ratio between the quasar image and total flux in an "
                 r"aperture vs. $\chi^2_{\rm offset}$. The right panels show the histogram of "
                 r"$\chi^2_{\rm offset}$ for each method.", interactive=True),
    dict(name="scores_vs_contamination_absolute", group="Scores", title=r"$\chi^2_{\rm offset}$ vs $f_{\rm tot}$",
         caption="Same as the previous figure but as a function of $f_{\\rm tot}$ (total flux).",
         interactive=True),
    dict(name="scores_vs_parameters", group="Scores", title=r"$\chi^2_{\rm offset}$ vs lens parameters",
         caption=r"$\chi^2_{\rm offset}$ as a function of $\theta_E$ (left), host (middle), and "
                 r"lens (right) flux, while keeping the remaining respective parameters fixed. "
                 r"The $\chi^2_{\rm offset}$ values correspond to image A (the brightest) of the "
                 "cross configuration.", interactive=True),
    dict(name="round1v2", group="Scores", title="STARRED: distortion on/off",
         caption="Same as the contamination figure but comparing STARRED submissions where they "
                 "turn off the modelling of atmospheric distortion of the PSF.", interactive=True),

    # --- Section: errors ----------------------------------------------------
    dict(name="error_estimation", group="Errors", title="Error estimation",
         caption="Median of the error estimation vs true error for all quasar images.",
         interactive=True),
]

GROUPS = ["Lensed quasars", "Overview", "Observations", "Light curves", "Scores", "Errors"]
