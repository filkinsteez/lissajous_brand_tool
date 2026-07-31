// The gradient field: a few large color masses anchored to the curve,
// mixed like pigment, sitting on a calm ground.
//
// Principles (from the reference board):
//   - color is an EVENT on a ground, not a full-bleed condition — the
//     ground's weight never drops to zero, so far from the curve the
//     poster stays quiet
//   - contributions are mixed as a WEIGHTED MEAN in Oklab, never summed:
//     a mean is bounded by its inputs, so nothing can blow out to white,
//     and overlaps read as pigment meeting pigment instead of light
//     stacking on light. A chroma-preserving nudge keeps mixtures from
//     sagging into gray valleys (paint behavior, not digital averaging).
//   - few masses, big scale: a ribbon along the curve, one long breath
//     around it, and 2..4 blooms at the figure's own anchor points
//   - palette positions ride the curve's arc length through a triangle
//     wave, so hue relationships are ordered and seamless — no fract()
//     jumps, no accidental neighbors
export const FIELD_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uCurveTex;
uniform sampler2D uPaletteTex;
uniform vec2 uResolution;
uniform vec2 uCurveScale;
uniform vec3 uGroundColor;
uniform float uTime;
uniform float uSeed;
uniform float uWidth;
uniform float uFieldScale;
uniform vec2 uFieldOffset;
uniform float uForm;
uniform float uSoftness;
uniform float uWarp;
uniform float uDrift;
uniform float uArcSpread;
uniform float uContrast;
uniform int uLayers;
uniform int uKnotCount;
uniform int uMassCount;
uniform vec4 uMasses[8];
// TYPE CALM (optional, toggled): pigment thins where type sits. The
// host passes zero rects when the feature is off, so the field is fully
// independent of text layout by default.
uniform int uTypeRectCount;
uniform vec4 uTypeRects[8];

#define MAX_KNOTS 256

// integer hash (LCG + xorshift): the classic fract(sin(...)) hash loses
// float precision at large lattice coordinates — on ANGLE/D3D it decays
// into correlated blocks, which the curl warp then prints onto every
// edge as a visible grid. Integer math is exact on every GPU.
vec2 hash22(vec2 p) {
  uvec2 v = uvec2(ivec2(floor(p + 0.5)) + 32768);
  v = v * 1664525u + 1013904223u;
  v.x += v.y * 1664525u;
  v.y += v.x * 1013904223u;
  v ^= v >> 16u;
  v.x += v.y * 1664525u;
  v.y += v.x * 1013904223u;
  v ^= v >> 16u;
  return vec2(v & 0xffffu) / 32767.5 - 1.0;
}

// quintic fade (C2): smoothstep noise has creased derivatives, and the
// warp is built from this field's CURL — derivatives — so those creases
// printed the lattice straight onto the mass edges (the "boxy" tell)
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(
    mix(dot(hash22(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
        dot(hash22(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
    mix(dot(hash22(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
        dot(hash22(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
    u.y
  );
}

// octaves rotate ~37 degrees each so no two share lattice axes, and the
// whole domain starts pre-rotated — nothing aligns with the artboard
const mat2 OCT = mat2(0.7986, -0.6018, 0.6018, 0.7986);

float fbm(vec2 p) {
  p = OCT * p;
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = OCT * p * 2.03 + vec2(14.7, -9.2);
    a *= 0.5;
  }
  return v;
}

vec2 curl(vec2 p) {
  const float e = 0.06;
  float n1 = fbm(p + vec2(0.0, e));
  float n2 = fbm(p - vec2(0.0, e));
  float n3 = fbm(p + vec2(e, 0.0));
  float n4 = fbm(p - vec2(e, 0.0));
  float dx = (n1 - n2) / (2.0 * e);
  float dy = (n3 - n4) / (2.0 * e);
  return vec2(dx, -dy);
}

// SCALE zooms the figure's GEOMETRY about the artboard center and PAN
// translates it, so at high scale one lobe can fill the whole poster
// (the reference dome) and PAN chooses WHICH part of the figure shows
vec4 readKnot(int i) {
  float x = (float(i) + 0.5) / float(uKnotCount);
  vec4 knot = texture(uCurveTex, vec2(x, 0.5));
  vec2 center = uResolution * 0.5;
  knot.xy = center + (knot.xy * uCurveScale - center) * uFieldScale + uFieldOffset * uResolution;
  return knot;
}

float sdSegment(vec2 p, vec2 a, vec2 b, out float h) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float denom = max(dot(ba, ba), 1e-5);
  h = clamp(dot(pa, ba) / denom, 0.0, 1.0);
  return length(pa - ba * h);
}

float sdBox(vec2 p, vec4 rect) {
  vec2 c = rect.xy + rect.zw * 0.5;
  vec2 d = abs(p - c) - rect.zw * 0.5;
  return length(max(d, vec2(0.0))) + min(max(d.x, d.y), 0.0);
}

vec3 srgbToLinear(vec3 x) {
  vec3 lo = x / 12.92;
  vec3 hi = pow((x + 0.055) / 1.055, vec3(2.4));
  bvec3 useLo = lessThanEqual(x, vec3(0.04045));
  return mix(hi, lo, vec3(useLo));
}

vec3 linToOklab(vec3 c) {
  float l = dot(c, vec3(0.4122214708, 0.5363325363, 0.0514459929));
  float m = dot(c, vec3(0.2119034982, 0.6806995451, 0.1073969566));
  float s = dot(c, vec3(0.0883024619, 0.2817188376, 0.6299787005));
  vec3 lms = pow(max(vec3(l, m, s), vec3(0.0)), vec3(1.0 / 3.0));
  return vec3(
    0.2104542553 * lms.x + 0.7936177850 * lms.y - 0.0040720468 * lms.z,
    1.9779984951 * lms.x - 2.4285922050 * lms.y + 0.4505937099 * lms.z,
    0.0259040371 * lms.x + 0.7827717662 * lms.y - 0.8086757660 * lms.z
  );
}

vec3 oklabToLin(vec3 lab) {
  float l_ = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
  float m_ = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
  float s_ = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;
  vec3 lms = vec3(l_, m_, s_);
  lms = lms * lms * lms;
  return vec3(
    4.0767416621 * lms.x - 3.3077115913 * lms.y + 0.2309699292 * lms.z,
    -1.2684380046 * lms.x + 2.6097574011 * lms.y - 0.3413193965 * lms.z,
    -0.0041960863 * lms.x - 0.7034186147 * lms.y + 1.7076147010 * lms.z
  );
}

// seamless palette walk: ping-pong instead of wrap, so the LUT's two ends
// (a shade and a tint) never sit next to each other by accident
float triWave(float x) {
  return 1.0 - abs(1.0 - 2.0 * fract(x * 0.5));
}

vec3 lutLin(float u) {
  return srgbToLinear(texture(uPaletteTex, vec2(clamp(u, 0.0, 1.0), 0.5)).rgb);
}

// pigment mixer state: weighted mean in Oklab plus the weighted mean of
// the inputs' own chroma, so the mixture can be pulled back toward the
// vividness its ingredients had
vec3 accLab = vec3(0.0);
float accW = 0.0;
float accC = 0.0;

void addPigment(vec3 lin, float w) {
  // a plain weighted mean: the LONGEST, smoothest possible transitions —
  // the graphic references live on huge airbrushed ramps, and any
  // dominance sharpening reads as a programmatic edge
  float ws = max(w, 0.0);
  vec3 lab = linToOklab(max(lin, vec3(0.0)));
  accLab += lab * ws;
  accC += length(lab.yz) * ws;
  accW += ws;
}

void main() {
  vec2 px = vUv * uResolution;
  float minDim = max(min(uResolution.x, uResolution.y), 1.0);
  vec2 p = px / minDim;

  // two scales of domain warp: a macro warp that bends the composition
  // and a fine one that keeps edges from reading as geometry
  vec2 seedOff = vec2(uSeed * 0.07, -uSeed * 0.29);
  // a constant directional lean in the macro warp pushes the whole field
  // off-axis — the figure is symmetric, the weather over it is not
  float leanAng = fract(uSeed * 0.7548777) * 6.2831853;
  vec2 lean = vec2(cos(leanAng), sin(leanAng)) * (0.012 + uWarp * 0.02);
  // the warp works at COMPOSITION scale only: one slow bend across the
  // whole frame. Mid-frequency warp is what read as smoke and fire licks
  // — the references' unevenness is in where the shapes SIT, not in
  // their edges, which are glass-smooth.
  vec2 warpMacro = lean + curl(p * 0.72 + seedOff + uTime * uDrift * 0.05) * (0.02 + uWarp * 0.045);
  vec2 warpFine = curl(p * 3.4 - seedOff.yx) * (0.0015 + uWarp * 0.004);
  vec2 samplePx = (p + warpMacro + warpFine) * minDim;

  // nearest point on the curve — and the nearest point on a DIFFERENT
  // stretch of it. Where two branches pass close (the crossing), hue is
  // blended between them instead of snapping at the equidistance line.
  float minD = 1e9;
  float minArc = 0.0;
  float minD2 = 1e9;
  float minArc2 = 0.0;
  int crossings = 0;
  vec4 firstKnot = readKnot(0);
  vec2 prev = firstKnot.xy;
  float prevArc = firstKnot.z;
  for (int i = 1; i < MAX_KNOTS; i++) {
    if (i >= uKnotCount) break;
    vec4 knot = readKnot(i);
    float h = 0.0;
    float d = sdSegment(samplePx, prev, knot.xy, h);
    float arcCand = mix(prevArc, knot.z, h);
    float sep = abs(arcCand - minArc);
    sep = min(sep, 1.0 - sep);
    if (d < minD) {
      if (sep > 0.08) {
        minD2 = minD;
        minArc2 = minArc;
      }
      minD = d;
      minArc = arcCand;
    } else {
      float sep2 = abs(arcCand - minArc);
      sep2 = min(sep2, 1.0 - sep2);
      if (d < minD2 && sep2 > 0.08) {
        minD2 = d;
        minArc2 = arcCand;
      }
    }
    // even-odd ray test: is this (warped) point INSIDE the figure? The
    // lobes of the closed curve become fillable shapes.
    if ((prev.y > samplePx.y) != (knot.y > samplePx.y)) {
      float xInt = prev.x + ((samplePx.y - prev.y) / (knot.y - prev.y)) * (knot.x - prev.x);
      if (xInt > samplePx.x) crossings++;
    }
    prev = knot.xy;
    prevArc = knot.z;
  }
  float insideFig = mod(float(crossings), 2.0);

  // type calm (when rects are passed): color steps aside for the copy
  float typeCalm = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= uTypeRectCount) break;
    float d = sdBox(px, uTypeRects[i]);
    typeCalm = max(typeCalm, exp(-pow(max(d, 0.0) / 190.0, 2.0)));
  }
  float damp = 1.0 - 0.55 * clamp(typeCalm, 0.0, 1.0);

  // proportions are curve-relative, and SCALE sizes the whole event:
  // ribbon, breath, blooms and the calm horizon all grow together
  float baseWidth = max(6.0, uWidth * minDim * 0.25 * uFieldScale);
  float energy = 0.85 + uContrast * 0.55;

  // FORM's fill mask comes first: inside the figure the body pigment
  // OCCLUDES what sits under it (paint over paint), so the shape commits
  // to its color instead of averaging toward the ground
  float fillEdge = baseWidth * (0.6 + uSoftness * 1.2) * (1.0 - 0.3 * uForm);
  float fillMask = insideFig * smoothstep(0.0, fillEdge, minD);
  float occl = 1.0 - fillMask * uForm * 0.9;

  float calmFar = smoothstep(baseWidth * 2.2, baseWidth * 5.0, minD);
  addPigment(srgbToLinear(uGroundColor), (1.7 + 2.6 * calmFar) * occl);

  // one render commits to a NEIGHBORHOOD of the palette, not the whole
  // ramp — the references hold 2..4 hue identities against the ground.
  // The seed picks the window; ARC SPREAD widens it.
  float windowSpan = clamp(0.34 + uArcSpread * 0.14, 0.2, 0.75);
  float windowPos = windowSpan * 0.5 + fract(uSeed * 0.618034) * (1.0 - windowSpan);
  #define HUE(t) (windowPos + ((t) - 0.5) * windowSpan)

  // the ribbon: the curve wearing its palette, arc position -> hue,
  // blended across nearby branches so the crossing has no hue seam.
  // The hue walk's rate is quantized to an even integer so it is exactly
  // periodic around the CLOSED curve — no seam where the arc wraps.
  float kArc = 2.0 * clamp(floor(uArcSpread + 0.5), 1.0, 3.0);
  float drift = uTime * uDrift * 0.03 + uSeed * 0.061;
  // the odd harmonic is 1-periodic (still seamless) but flips sign under
  // mirroring, so the two lobes never wear identical color
  float asym = 0.16 * sin(minArc * 6.2831853 + uSeed * 0.37);
  float asym2 = 0.16 * sin(minArc2 * 6.2831853 + uSeed * 0.37);
  float arcT = triWave(minArc * kArc + drift + asym);
  float arcT2 = triWave(minArc2 * kArc + drift + asym2);
  float branchBlend = 0.5 * exp(-max(minD2 - minD, 0.0) / (baseWidth * 0.8));
  vec3 ribbonLin = mix(lutLin(HUE(arcT)), lutLin(HUE(arcT2)), branchBlend);
  // FORM: the figure itself as a filled shape. The lobes' interiors take
  // one committed body color with an airbrushed edge; the curve line
  // becomes the shape's rim. 0 = pure abstract field, 1 = the mark reads.
  // the body color deliberately BREAKS the harmony window: a raw warm
  // stop from mid-palette, so the shape pops against the blue ground the
  // way the comet reference's yellow sits on gray. The edge tightens as
  // FORM rises — legible means committed.
  float fillU = 0.42 + 0.22 * fract(uSeed * 0.377);
  // commitment grows with zoom: at high SCALE the long ramps cover more
  // of the frame, so the body has to hold its color harder or everything
  // averages toward pastel wash
  float wFill = fillMask * uForm * energy * (3.2 + 0.6 * max(uFieldScale - 1.0, 0.0));
  addPigment(lutLin(fillU), wFill * damp);
  // the rim fringe: a tighter contrasting band riding the shape's edge
  // (the comet reference's teal rim on the yellow body)
  float wFringe = exp(-pow(minD / (baseWidth * 0.5), 1.3)) * uForm * energy * 1.1;
  addPigment(lutLin(clamp(fillU + 0.24, 0.0, 1.0)), wFringe * damp);

  // low exponents = long entries and releases: airbrush, not marker.
  // The arc-walking ribbon and blooms belong to the ABSTRACT register,
  // so they step back as FORM rises and the filled figure occludes them.
  float abstractV = (1.0 - 0.6 * uForm) * occl;
  float wRibbon = exp(-pow(minD / (baseWidth * (0.8 + uSoftness * 0.7)), 1.15)) * energy * 1.7 * abstractV;
  addPigment(ribbonLin, wRibbon * damp);

  // one long breath around it: same family, a step over, long tail
  float wBreath = exp(-pow(minD / (baseWidth * (2.6 + uSoftness * 1.6)), 1.05)) * 0.36 * abstractV;
  addPigment(lutLin(HUE(clamp(arcT + 0.3, 0.0, 1.0))), wBreath * damp);

  // a few blooms at the figure's anchor points — tight cores, so they
  // read as placed color, not fog
  // ONE protagonist: the highest-scored anchor is the compositional
  // heart — bigger and brighter, with its halo. The others support from
  // the shadows at half voice. Every reference has a single dominant
  // gesture; equal blooms read as wallpaper.
  int massCap = clamp(uLayers - 2, 1, 8);
  for (int i = 0; i < 8; i++) {
    if (i >= uMassCount || i >= massCap) break;
    vec4 m = uMasses[i];
    // blooms ride the zoomed + panned geometry with the rest of the figure
    vec2 massPos = uResolution * 0.5 + (m.xy - uResolution * 0.5) * uFieldScale + uFieldOffset * uResolution;
    float md = length(samplePx - massPos);
    // per-bloom jitter: twin anchor points stop producing twin blooms
    float jitter = fract(sin(float(i) * 12.9898 + uSeed * 0.173) * 43758.5453);
    float lead = i == 0 ? 1.0 : 0.0;
    float r = max(m.z * (0.6 + uSoftness * 0.3) * (0.75 + jitter * 0.55) * (1.0 + lead * 0.25) * uFieldScale, 1.0);
    float w = exp(-pow(md / r, 1.5)) * energy * mix(0.85 + jitter * 0.4, 1.3, lead) * abstractV;
    float massT = triWave(m.w * uArcSpread + uSeed * 0.043 + float(i) * 0.11);
    addPigment(lutLin(HUE(massT)), w * damp);
    if (i == 0) {
      // one ordered halo ring around the dominant bloom
      float ring = exp(-pow(abs(md - r * 1.45) / (r * 0.42), 1.8)) * 0.5;
      addPigment(lutLin(HUE(clamp(massT + 0.28, 0.0, 1.0))), ring * damp);
    }
  }

  // finalize the mix: mean in Oklab, then pull chroma back toward what
  // the ingredients carried — the difference between paint and cement
  vec3 lab = accLab / accW;
  float cNow = length(lab.yz);
  float cTarget = accC / accW;
  // vibrance holds as the zoom stretches the mixes: the chroma restore
  // strengthens with SCALE so wide ramps stay saturated, not washed
  float restore = clamp(0.78 + 0.08 * (uFieldScale - 1.0), 0.72, 0.92);
  lab.yz *= mix(1.0, cTarget / max(cNow, 1e-4), restore);

  fragColor = vec4(max(oklabToLin(lab), vec3(0.0)), 1.0);
}
`
