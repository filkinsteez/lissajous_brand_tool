// The smear pass: drags the composed field along a flow built from the
// curve's own tangents, bending into curl noise away from the figure —
// paint pulled by the mark, not a formula evaluated near it.
//
// Implemented as a line-integral convolution: each pixel walks forward
// and backward through the flow, gathering color with a decaying kernel.
// The backward tail is shorter than the forward one, so every streak has
// a direction — a sharp entry and a long release, the way a brush loads
// and lets go. DRIFT is the length of the pull.
export const SMEAR_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSceneTex;
uniform sampler2D uCurveTex;
uniform vec2 uResolution;
uniform vec2 uCurveScale;
uniform int uKnotCount;
uniform float uFieldScale;
uniform vec2 uFieldOffset;
uniform float uDrift;
uniform float uWarp;
uniform float uSeed;
uniform float uTime;

#define MAX_KNOTS 256

// integer hash — same precision fix as the field pass
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

// quintic fade + rotated octaves: same lattice-artifact fix as the field
// pass — the flow is this field's curl, and creased derivatives would
// print boxes into the streaks
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

const mat2 OCT = mat2(0.7986, -0.6018, 0.6018, 0.7986);

float fbm3(vec2 p) {
  p = OCT * p;
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * noise(p);
    p = OCT * p * 2.03 + vec2(14.7, -9.2);
    a *= 0.5;
  }
  return v;
}

vec2 curl(vec2 p) {
  const float e = 0.07;
  float n1 = fbm3(p + vec2(0.0, e));
  float n2 = fbm3(p - vec2(0.0, e));
  float n3 = fbm3(p + vec2(e, 0.0));
  float n4 = fbm3(p - vec2(e, 0.0));
  return vec2((n1 - n2) / (2.0 * e), -(n3 - n4) / (2.0 * e));
}

// same geometry zoom + pan as the field pass, so the flow follows the
// figure the smeared image actually shows
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

vec2 safeDir(vec2 v, vec2 fallback) {
  float len = length(v);
  return len > 1e-4 ? v / len : fallback;
}

// screen space (y down, matching the knot texture) back to texture UV
vec2 screenToUv(vec2 p) {
  return vec2(p.x / uResolution.x, 1.0 - p.y / uResolution.y);
}

// taps that walk off the canvas fade out instead of piling up on the
// border texels — clamping there smeared the edge row into hard streak
// bands whenever the figure sat near a border
float edgeFade(vec2 uv) {
  vec2 m = smoothstep(vec2(-0.02), vec2(0.02), uv)
         * smoothstep(vec2(-0.02), vec2(0.02), vec2(1.0) - uv);
  return m.x * m.y;
}

void main() {
  // artboard pixel space, y down — matches the knots (see field.ts)
  vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uResolution;
  float minDim = max(min(uResolution.x, uResolution.y), 1.0);

  float smearPx = uDrift * minDim * 0.9;
  // resolution-independent early-out: thresholding smearPx (device px)
  // made near-zero drift a no-op live but active at 2x/4x export
  if (uDrift < 0.002) {
    fragColor = vec4(texture(uSceneTex, vUv).rgb, 1.0);
    return;
  }

  // The stroke direction is a smooth ORIENTATION FIELD: every curve
  // segment contributes its direction weighted by distance, averaged in
  // doubled-angle space (where a tangent and its negation are the same
  // line). Nearest-branch schemes snap at equidistance loci — near the
  // crossing that painted hard-edged streak wedges and fans; a weighted
  // orientation average has no branches to snap between.
  float minD = 1e9;
  vec2 orient = vec2(0.0);
  float sigma = minDim * 0.07;
  vec4 firstKnot = readKnot(0);
  vec2 prev = firstKnot.xy;
  for (int i = 1; i < MAX_KNOTS; i++) {
    if (i >= uKnotCount) break;
    vec4 knot = readKnot(i);
    float h = 0.0;
    float d = sdSegment(px, prev, knot.xy, h);
    minD = min(minD, d);
    vec2 seg = knot.xy - prev;
    float len2 = dot(seg, seg);
    if (len2 > 1e-6) {
      vec2 tn = seg * inversesqrt(len2);
      // doubled angle: (cos2a, sin2a) — sign-free line direction
      float w = exp(-d / sigma);
      orient += vec2(tn.x * tn.x - tn.y * tn.y, 2.0 * tn.x * tn.y) * w;
    }
    prev = knot.xy;
  }
  float ang = 0.5 * atan(orient.y, orient.x + 1e-6);
  vec2 tangent = vec2(cos(ang), sin(ang));
  // a whisper of per-pixel angular dither breaks streak bundles apart so
  // long walks never band into combs (hash22 is already signed — no
  // recentering, or every stroke picks up a systematic tilt)
  vec2 dith = hash22(px * 0.73 + vec2(uSeed));
  float jit = dith.x * 0.1;
  float cj = cos(jit);
  float sj = sin(jit);
  tangent = vec2(tangent.x * cj - tangent.y * sj, tangent.x * sj + tangent.y * cj);
  // the halved angle always lands in the +x hemisphere; flip half the
  // pixels so the longer forward walk has no canvas-wide direction bias
  if (dith.y > 0.0) tangent = -tangent;

  // near the curve the pull follows the stroke; away from it the flow
  // belongs to the curl field almost entirely
  float obey = mix(0.2, 0.85, exp(-minD / (minDim * 0.3)));
  vec2 seedOff = vec2(uSeed * 0.11, -uSeed * 0.23) + uTime * 0.02;
  // slow, broad curl: tight curl turned the drag into fire licks — the
  // pull should read as one wide gesture
  float curlScale = 1.1 + uWarp * 0.8;

  const int TAPS = 14;
  float stepLen = smearPx / float(TAPS);
  vec3 acc = texture(uSceneTex, vUv).rgb;
  float wsum = 1.0;

  vec2 posF = px;
  vec2 posB = px;
  vec2 dirF = tangent;
  vec2 dirB = -tangent;
  for (int i = 1; i <= TAPS; i++) {
    vec2 cF = curl(posF / minDim * curlScale + seedOff);
    dirF = safeDir(mix(safeDir(cF, dirF), dirF, obey), dirF);
    posF += dirF * stepLen;
    vec2 uvF = screenToUv(posF);
    float wF = exp(-float(i) * 0.11) * edgeFade(uvF);
    acc += texture(uSceneTex, clamp(uvF, vec2(0.0), vec2(1.0))).rgb * wF;
    wsum += wF;

    vec2 cB = curl(posB / minDim * curlScale + seedOff);
    dirB = safeDir(mix(safeDir(cB, dirB), dirB, obey), dirB);
    posB += dirB * stepLen;
    // shorter memory backward: streaks get a direction
    vec2 uvB = screenToUv(posB);
    float wB = exp(-float(i) * 0.26) * edgeFade(uvB);
    acc += texture(uSceneTex, clamp(uvB, vec2(0.0), vec2(1.0))).rgb * wB;
    wsum += wB;
  }

  fragColor = vec4(acc / wsum, 1.0);
}
`
