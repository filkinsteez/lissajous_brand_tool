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
uniform float uSoftness;
uniform float uWarp;
uniform float uDrift;
uniform float uArcSpread;
uniform float uContrast;
uniform float uGrain;
uniform int uLayers;
uniform int uKnotCount;
uniform vec4 uCalmBox;
uniform int uTypeRectCount;
uniform vec4 uTypeRects[8];
uniform int uMassCount;
uniform vec4 uMasses[8];

#define MAX_KNOTS 256
#define PI 3.141592653589793
#define TAU 6.283185307179586

vec2 hash22(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(dot(hash22(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
        dot(hash22(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
    mix(dot(hash22(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
        dot(hash22(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(14.7, -9.2);
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

mat2 rot2(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

float softEllipse(vec2 p, vec2 center, vec2 radius, float angle) {
  vec2 q = rot2(angle) * (p - center);
  q /= max(radius, vec2(0.001));
  return exp(-dot(q, q));
}

float softRect(vec2 p, vec2 center, vec2 halfSize, float blur) {
  vec2 d = abs(p - center) - halfSize;
  float outside = length(max(d, vec2(0.0)));
  float inside = min(max(d.x, d.y), 0.0);
  return 1.0 - smoothstep(0.0, blur, outside + inside);
}

vec4 readKnot(int i) {
  float x = (float(i) + 0.5) / float(uKnotCount);
  vec4 knot = texture(uCurveTex, vec2(x, 0.5));
  knot.xy *= uCurveScale;
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

float luma3(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  vec2 px = vUv * uResolution;
  float minDim = max(min(uResolution.x, uResolution.y), 1.0);
  vec2 p = px / minDim;
  vec2 uv = vUv;

  vec2 flowBase = p * (2.2 + uWarp * 2.8) + vec2(
    uTime * uDrift * 0.12 + uSeed * 0.07,
    -uSeed * 0.29 + uTime * uDrift * 0.05
  );
  vec2 flowA = curl(flowBase);
  vec2 flowB = curl(flowBase * 1.73 + vec2(11.3, -8.7));
  vec2 samplePx = (p + flowA * (0.015 + uWarp * 0.055) + flowB * (0.008 + uWarp * 0.035)) * minDim;

  float minD = 1e9;
  float minArc = 0.0;
  vec4 firstKnot = readKnot(0);
  vec2 prev = firstKnot.xy;
  float prevArc = firstKnot.z;
  vec2 bestDir = vec2(1.0, 0.0);
  vec2 bestPoint = samplePx;

  for (int i = 1; i < MAX_KNOTS; i++) {
    if (i >= uKnotCount) break;
    vec4 knot = readKnot(i);
    vec2 seg = knot.xy - prev;
    float segLen = max(length(seg), 1e-4);
    vec2 segDir = seg / segLen;
    float h = 0.0;
    float d = sdSegment(samplePx, prev, knot.xy, h);
    if (d < minD) {
      minD = d;
      minArc = mix(prevArc, knot.z, h);
      bestDir = segDir;
      bestPoint = prev + seg * h;
    }
    prev = knot.xy;
    prevArc = knot.z;
  }

  float baseWidth = max(6.0, uWidth * minDim);
  vec2 toCurve = samplePx - bestPoint;
  vec2 normalDir = vec2(-bestDir.y, bestDir.x);
  float signedAlong = dot(toCurve, bestDir);
  float signedAcross = dot(toCurve, normalDir);
  float dAlong = abs(signedAlong);
  float dAcross = abs(signedAcross);
  float anisotropy = exp(
    -(dAcross * dAcross) / max(baseWidth * baseWidth * 5.8, 1.0) -
    (dAlong * dAlong) / max(baseWidth * baseWidth * 18.0, 1.0)
  );

  float core = exp(-pow(minD / max(baseWidth * 0.55, 1.0), 2.0));
  float ribbon = exp(-pow(dAcross / max(baseWidth * (1.55 + uSoftness * 0.55), 1.0), 2.0));
  float halo = exp(-pow(minD / max(baseWidth * (3.9 + uSoftness * 1.2), 1.0), 2.0));
  float aura = exp(-pow(minD / max(baseWidth * (8.5 + uSoftness * 2.0), 1.0), 2.0));
  float glow = core * 1.55 + ribbon * 1.35 + halo * 0.95 + aura * 0.48 + anisotropy * (0.8 + uSoftness * 0.42);
  int layers = max(1, min(uLayers, 6));
  for (int i = 0; i < 6; i++) {
    if (i >= layers) break;
    float fi = float(i) + 1.0;
    float side = mod(float(i), 2.0) * 2.0 - 1.0;
    float offset = side * fi * baseWidth * (0.42 + uSoftness * 0.28);
    float bandWidth = baseWidth * (0.72 + fi * 0.24);
    float band = exp(-pow((signedAcross - offset) / max(bandWidth, 1.0), 2.0));
    float arcPulse = 0.62 + 0.38 * cos((minArc * uArcSpread * 3.0 + fi * 0.21) * TAU);
    glow += band * arcPulse * (0.74 / sqrt(fi));
  }

  float typeCalm = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= uTypeRectCount) break;
    vec4 rect = uTypeRects[i];
    float area = max(rect.z * rect.w, 1.0);
    float areaWeight = clamp(42000.0 / area, 0.22, 1.0);
    float d = sdBox(px, rect);
    float localCalm = exp(-pow(max(d, 0.0) / 190.0, 2.0)) * areaWeight;
    typeCalm = max(typeCalm, localCalm);
  }
  float calmMask = clamp(typeCalm, 0.0, 1.0);
  glow *= mix(1.0, 0.92, calmMask);

  float curveLobes = 0.0;
  vec3 curveLobeColor = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    if (i >= uMassCount) break;
    vec4 m = uMasses[i];
    float radius = max(m.z * (1.2 + uSoftness * 0.9), 1.0);
    float md = length(samplePx - m.xy);
    float lobeCore = exp(-pow(md / radius, 2.0));
    float lobeHalo = exp(-pow(md / (radius * 2.8), 2.0));
    float massAmount = lobeCore * 1.15 + lobeHalo * 0.72;

    float massU = fract(m.w * uArcSpread + 0.03 * fbm(p * 1.3 + vec2(float(i) * 3.1, uSeed * 0.4)));
    vec3 massA = srgbToLinear(texture(uPaletteTex, vec2(massU, 0.5)).rgb);
    vec3 massB = srgbToLinear(texture(uPaletteTex, vec2(fract(massU + 0.18), 0.5)).rgb);
    vec3 massColor = mix(massA, massB, 0.45 + 0.18 * fbm(p * 2.0 + vec2(float(i), uSeed * 0.2)));

    curveLobes += massAmount;
    curveLobeColor += massColor * massAmount;
  }
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    int knotIndex = int(floor(((fi + 0.5) / 12.0) * float(uKnotCount - 1)));
    vec4 k = readKnot(knotIndex);
    float radius = baseWidth * (2.35 + uSoftness * 2.6 + 0.18 * sin(fi * 1.7 + uSeed));
    float md = length(samplePx - k.xy);
    float amount = exp(-pow(md / max(radius, 1.0), 2.0));
    float ring = exp(-pow((md - radius * 0.58) / max(radius * 0.52, 1.0), 2.0));
    float colorU = fract(k.z * uArcSpread + 0.045 * sin(fi * 2.1 + uSeed));
    vec3 knotA = srgbToLinear(texture(uPaletteTex, vec2(colorU, 0.5)).rgb);
    vec3 knotB = srgbToLinear(texture(uPaletteTex, vec2(fract(colorU + 0.14), 0.5)).rgb);
    vec3 knotColor = mix(knotA, knotB, ring * 0.55);
    float weight = amount * 0.88 + ring * 0.34;
    curveLobes += weight;
    curveLobeColor += knotColor * weight;
  }
  if (curveLobes > 0.0001) curveLobeColor /= curveLobes;

  float arcBase = fract(minArc * uArcSpread + uTime * uDrift * 0.08 + uSeed * 0.173);
  float paletteU = pow(arcBase, 1.28);
  vec3 ribbonA = srgbToLinear(texture(uPaletteTex, vec2(paletteU, 0.5)).rgb);
  vec3 ribbonB = srgbToLinear(texture(uPaletteTex, vec2(fract(paletteU + 0.17 + 0.09 * fbm(p * 2.4 + uSeed)), 0.5)).rgb);
  float swirl = 0.5 + 0.5 * fbm(p * 3.1 + vec2(uSeed * 0.12, uTime * uDrift * 0.16));
  vec3 ribbonColor = mix(ribbonA, ribbonB, clamp(swirl, 0.0, 1.0));
  vec3 ghostColor = srgbToLinear(texture(
    uPaletteTex,
    vec2(fract(paletteU + 0.24 + 0.07 * fbm(p * 2.9 + vec2(-uSeed * 0.4, uTime * uDrift * 0.3))), 0.5)
  ).rgb);
  vec3 hazeColor = srgbToLinear(texture(uPaletteTex, vec2(fract(paletteU + 0.33), 0.5)).rgb);
  vec3 ground = srgbToLinear(uGroundColor);

  vec3 color = ground;
  color += curveLobeColor * curveLobes * (0.28 + uSoftness * 0.36);
  color += ribbonColor * glow * (1.18 + uContrast * 0.68);
  float ghostBand = exp(-pow(
    (minD - baseWidth * (1.25 + uSoftness * 0.75)) / max(baseWidth * (1.1 + uSoftness * 0.8), 1.0),
    2.0
  ));
  color += ghostColor * ghostBand * (0.46 + uSoftness * 0.34);

  float curveInterior = 1.0 - smoothstep(baseWidth * 1.2, baseWidth * 9.0, minD);
  float hazeNoise = fbm(p * 1.6 + vec2(uSeed * 0.3, uTime * uDrift * 0.05));
  float haze = clamp(0.18 * hazeNoise + 0.68 * halo + 0.38 * curveInterior + 0.2 * curveLobes, 0.0, 1.0);
  color += hazeColor * haze * (0.38 + uSoftness * 0.56);

  float veilField = 0.5 + 0.5 * fbm(p * 0.95 + flowA * 0.85 + vec2(uSeed * 0.13, -uTime * uDrift * 0.03));
  float veil = smoothstep(0.25, 0.95, veilField) * (0.05 + uSoftness * 0.11);
  color += mix(ribbonColor, hazeColor, 0.45) * veil * curveInterior;

  float curveStripePhase = minArc * uArcSpread * (2.5 + float(layers) * 0.72) + signedAcross / max(baseWidth * 2.9, 1.0);
  float broadStripe = pow(0.5 + 0.5 * cos(curveStripePhase * TAU + uSeed * 0.11), 1.65);
  vec3 stripeColor = srgbToLinear(texture(
    uPaletteTex,
    vec2(fract(paletteU + 0.39 + broadStripe * 0.12 + uSeed * 0.003), 0.5)
  ).rgb);
  float stripeMask = broadStripe * halo * (0.46 + uContrast * 0.2);
  color += stripeColor * stripeMask;

  float panelFoldX = exp(-pow(abs(uv.x - 0.5 - 0.018 * fbm(vec2(uv.y * 2.0, uSeed * 0.07))) / 0.012, 2.0));
  float panelFoldY = exp(-pow(abs(uv.y - 0.5 - 0.012 * fbm(vec2(uv.x * 2.0, uSeed * 0.11))) / 0.012, 2.0));
  color *= 1.0 - (panelFoldX + panelFoldY) * (0.018 + uGrain * 0.055);

  float highlight = pow(max(glow - 0.22, 0.0), 1.25);
  color += ribbonColor * highlight * 2.18;
  float interference = 0.5 + 0.5 * cos(minD / max(baseWidth * 0.42, 1.0) + swirl * 5.0 + uTime * uDrift * 0.6);
  float caustic = pow(max(core, 0.0), 0.8) * interference;
  color += mix(ribbonColor, ghostColor, 0.35) * caustic * 0.52;
  color = mix(color, ground, calmMask * 0.03);

  float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  float edgeBurn = exp(-pow(edge / (0.026 + uSoftness * 0.025), 2.0));
  vec3 edgeHue = srgbToLinear(texture(uPaletteTex, vec2(fract(paletteU + 0.58), 0.5)).rgb);
  color += edgeHue * edgeBurn * (0.025 + uSoftness * 0.055);
  color *= 1.0 - edgeBurn * (0.12 + uContrast * 0.045);

  float luma = luma3(color);
  color = mix(vec3(luma), color, mix(1.0, 0.74, calmMask));
  color = mix(vec3(luma3(color)), color, 0.96 + uContrast * 0.3);

  fragColor = vec4(max(color, 0.0), 1.0);
}
`
