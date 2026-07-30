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

void main() {
  vec2 px = vUv * uResolution;
  float minDim = max(min(uResolution.x, uResolution.y), 1.0);

  float smearPx = uDrift * minDim * 0.9;
  if (smearPx < 1.0) {
    fragColor = vec4(texture(uSceneTex, vUv).rgb, 1.0);
    return;
  }

  // nearest point on the curve: distance + ARC position. The tangent is
  // NOT taken from the winning segment — per-segment constant directions
  // tile the plane into equal-tangent cells and the smear turns those
  // cells into visible blocks. Instead the tangent is interpolated along
  // the arc through the (linearly filtered) knot texture, so it turns
  // smoothly everywhere.
  float minD = 1e9;
  float minArc = 0.0;
  float minD2 = 1e9;
  float minArc2 = 0.0;
  vec4 firstKnot = readKnot(0);
  vec2 prev = firstKnot.xy;
  float prevArc = firstKnot.z;
  for (int i = 1; i < MAX_KNOTS; i++) {
    if (i >= uKnotCount) break;
    vec4 knot = readKnot(i);
    float h = 0.0;
    float d = sdSegment(px, prev, knot.xy, h);
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
    prev = knot.xy;
    prevArc = knot.z;
  }
  // knots are equal-arc, so texture-x IS arc position; the tangent is
  // blended between the two nearest branches so the flow never snaps
  // across the crossing's equidistance line
  float dA = 1.5 / float(uKnotCount);
  vec2 kA = texture(uCurveTex, vec2(fract(minArc + dA), 0.5)).xy * uCurveScale;
  vec2 kB = texture(uCurveTex, vec2(fract(minArc - dA + 1.0), 0.5)).xy * uCurveScale;
  vec2 tangent1 = safeDir(kA - kB, vec2(1.0, 0.0));
  vec2 k2A = texture(uCurveTex, vec2(fract(minArc2 + dA), 0.5)).xy * uCurveScale;
  vec2 k2B = texture(uCurveTex, vec2(fract(minArc2 - dA + 1.0), 0.5)).xy * uCurveScale;
  vec2 tangent2 = safeDir(k2A - k2B, tangent1);
  float branchBlend = 0.5 * exp(-max(minD2 - minD, 0.0) / (minDim * 0.06));
  // sign-align before blending: a tangent and its negation are the same
  // stroke direction for a smear
  if (dot(tangent2, tangent1) < 0.0) tangent2 = -tangent2;
  vec2 tangent = safeDir(mix(tangent1, tangent2, branchBlend), tangent1);

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
    float wF = exp(-float(i) * 0.11);
    acc += texture(uSceneTex, clamp(posF / uResolution, vec2(0.0), vec2(1.0))).rgb * wF;
    wsum += wF;

    vec2 cB = curl(posB / minDim * curlScale + seedOff);
    dirB = safeDir(mix(safeDir(cB, dirB), dirB, obey), dirB);
    posB += dirB * stepLen;
    // shorter memory backward: streaks get a direction
    float wB = exp(-float(i) * 0.26);
    acc += texture(uSceneTex, clamp(posB / uResolution, vec2(0.0), vec2(1.0))).rgb * wB;
    wsum += wB;
  }

  fragColor = vec4(acc / wsum, 1.0);
}
`
