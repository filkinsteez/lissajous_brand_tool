import { GLSL_COMMON } from './common'

// Lissajous Grain — the first material and the app's quality bar.
// Everything visible is driven by the baked curve field:
//   dist    → accumulation rings, folds, near-curve gain
//   tangent → anisotropic grain stretch + slow drift direction
//   density → grain gain near intersections, voids in quiet zones
//   pressure→ material clears around typography
// No FBM drives the look; vnoise contributes only a paper-mottle whisper.
export const GRAIN_FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_field;    // R dist, GB tangent, A density
uniform sampler2D u_pressure; // R type pressure
uniform vec2 u_px;            // canvas pixel size
uniform float u_seed;
uniform float u_time;
uniform float u_pressureAmt;
uniform float u_density;
uniform float u_grainSize;
uniform float u_drift;
uniform float u_fold;
uniform float u_ring;
uniform float u_contrast;
uniform float u_void;
uniform float u_motion;
uniform vec3 u_ink;
uniform vec3 u_paper;

${GLSL_COMMON}

void main() {
  vec4 f = texture(u_field, v_uv);
  float dist = f.r;
  vec2 tangent = f.gb;
  float tl = length(tangent);
  tangent = tl > 1e-4 ? tangent / tl : vec2(1.0, 0.0);
  float density = f.a;
  float pressure = texture(u_pressure, v_uv).r;

  vec2 p = v_uv * u_px;

  // ---- keep-probability: where matter accumulates ----
  // Three regimes, all in curve-distance units:
  //   strand — a tight band riding the hidden curve
  //   halo   — blooms around intersections (density channel)
  //   rings  — standing-wave accumulation radiating outward
  // Open paper keeps only a whisper of dust.
  float strand = 1.0 - smoothstep(0.0, 0.05, dist);
  float halo = 1.0 - smoothstep(0.0, 0.17, dist);
  float hot = pow(density, 1.15);

  float ringPhase = 0.5 + 0.5 * sin(dist * mix(50.0, 140.0, u_ring) + u_seed);
  float rings = smoothstep(0.5, 0.9, ringPhase)
              * (1.0 - smoothstep(0.02, 0.26, dist))
              * smoothstep(0.012, 0.028, dist); // not on the strand itself

  float foldTerm = mix(1.0, 0.25 + 0.75 * abs(fract(dist * 18.0) * 2.0 - 1.0), u_fold * strand);

  float keep = u_density * (
      0.55 * strand * (0.38 + 0.62 * hot)
    + 0.42 * hot * halo
    + u_ring * 0.3 * rings
    + 0.012
  ) * foldTerm;
  keep *= 1.0 - u_void * (1.0 - smoothstep(0.0, 0.35, density)) * 0.75;
  keep *= 1.0 - u_pressureAmt * smoothstep(0.02, 0.35, pressure);

  // ---- grain: size-varied stipple dots on a FIXED lattice.
  // The lattice never rotates (rotated domains read as moiré); anisotropy
  // lives in the DOT SHAPE, which stretches along the local tangent.
  float cell = mix(2.5, 9.0, u_grainSize);

  // gentle domain break so the lattice never reads as halftone
  vec2 gp = p + u_drift * cell * 1.4 *
        (vec2(vnoise(p * 0.015 + u_seed), vnoise(p * 0.015 - u_seed * 1.7)) - 0.5);

  // slow material motion: grain slides along the flow of the curve
  gp -= tangent * u_time * u_motion * 6.0;

  vec2 cid = floor(gp / cell);
  vec2 seedOff = vec2(u_seed * 3.7, u_seed * 7.1); // small — big offsets break the hash
  float g = hash21(cid + seedOff);

  // dot inside the cell: jittered position, radius grows with (keep - g)
  vec2 cellUv = fract(gp / cell) - 0.5;
  vec2 jitter = vec2(hash21(cid + 7.13), hash21(cid + 13.71)) - 0.5;
  cellUv -= jitter * 0.45;

  // elongate the dot along the tangent where the field is hot
  vec2 tf = vec2(dot(cellUv, tangent), dot(cellUv, vec2(-tangent.y, tangent.x)));
  tf.x /= 1.0 + 1.7 * density;
  float dotDist = length(tf);

  float sizeT = clamp((keep - g) / max(keep, 1e-4), 0.0, 1.0);
  float radius = 0.16 + 0.36 * sqrt(sizeT);
  float ink = step(g, keep) * (1.0 - smoothstep(radius - 0.1, radius + 0.02, dotDist));

  // contrast: low = soft graphite speckle, high = hard print grain
  float tone = ink * mix(0.5 + 0.3 * density, 1.0, u_contrast);

  // paper mottle, whisper level
  float mottle = (vnoise(p * 0.012 + u_seed) - 0.5) * 0.028;

  vec3 col = mix(u_paper, u_ink, clamp(tone, 0.0, 1.0));
  col += mottle * (1.0 - tone);
  outColor = vec4(col, 1.0);
}
`
