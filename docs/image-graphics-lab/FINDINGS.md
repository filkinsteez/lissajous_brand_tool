# Findings — image & graphics research lab

Evaluation capture per study. Updated as studies land; the recommendation
section stays empty until the stop gate (all four studies rendered and
compared). Judged against the brief's criteria: visual range, brand
leverage, source robustness, art direction, predictability, serendipity,
composability, legibility control, complexity cost, distinctiveness.

## Study 1 — Mark Translation

**Hypothesis.** A source image translated through the brand-shape
vocabulary feels more specific and useful than generic ASCII, halftone,
or dot conversion.

**Implemented.** Uniform cell grid over the fitted source; per-cell
evidence (tone, edge strength, edge orientation, fine detail) sampled
bilinearly from a ~1MP analysis raster; density-ordered mark ramps
(DOTS = generic halftone baseline, GEO = built-in glyphs, BRAND = the
editor's own drawn shapes + meta); tone drives presence weight and mark
size, structure drives mark choice and rotation, EVIDENCE slides
selection between them; a seeded regional-coherence field shifts the
pick and shares a tilt per neighborhood; three color modes (ink /
quantized tints / source color). Debug views: tone, edges, direction
(hue), regions, marks-only. Deterministic per (source hash, params,
seed) with independent chan channels.

- Source images tested: synthetic fixture (tonal gradient + dark silhouette +
  hard bar + checker texture). Real photography/portrait/illustration still to
  run — the fixture proves mechanics, not aesthetics.
- Parameter ranges that produced useful results: defaults (cell 26, evidence
  35%, occupancy 85%, coherence 45%) already separate the three banks clearly
  on the fixture; contact sheet `.devshots/lab-{dots,geo,brand}-composite.png`.
- Behaviors that felt generic: the DOTS baseline reads as exactly the
  commodity halftone it is meant to be — good, that is the control condition.
- Behaviors that felt brand-specific: with two drawn shapes + meta, output is
  immediately recognizable as this vocabulary (`lab-brand-user-shapes.png`);
  regional coherence makes neighborhoods commit to a mark family instead of
  sprinkling, which is the poster-reference behavior. Edge-driven rotation on
  asymmetric marks (halves, ellipses) visibly traces contours.
- Where direct art direction was needed: not yet exercised — masks/focus
  fields arrive in study 3.
- Performance observations: 640×480 fixture renders imperceptibly; analysis is
  one-time per load. No jank at drag-rate with the 0.5× preview gate. Untested
  at 2048² with sub-10px cells (thousands of stamps) — profile in M2.
- Primitives that recurred (so far, within one study): the Field closure
  carried both image evidence and the coherence lattice with the same
  interface; the fit-rect coordinate contract; chan channels per decision.
- Open questions: does tone→size + structure→selection stay legible on real
  photographs? Should presence use blue-noise-ish dither instead of per-cell
  chan (current sparkle is uniform)? Is one detail scale enough, or does the
  coarse map earn its place?
- Recommendation (continue / revise / merge / stop): continue — mechanics
  verified; judgment needs real sources and the M2 compare grid.

## Study 2 — Regional Encoding

_Not yet implemented._

## Study 3 — Shared Territory

_Not yet implemented._

## Study 4 — Material Field

_Not yet implemented._

## Cross-study primitive map

_Filled at the stop gate. Candidates being watched: the Field
(sample(x,y)→0..1 over output space), the fit-rect coordinate contract,
chan-channel seeded decisions, the density-ordered mark ramp, the
single stamp function._
