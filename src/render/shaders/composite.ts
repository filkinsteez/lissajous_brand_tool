// The finishing chain — half of what makes a raster gradient read as
// physical. In order:
//   tone map    — soft filmic shoulder, no hard clip to white
//   film grain  — multi-scale, exposure-weighted (lives in the midtones,
//                 thins in deep shadow and highlight), with a small
//                 chroma component. Static per seed when frozen.
//   dither      — interleaved-gradient noise before 8-bit quantization,
//                 so smooth ramps never band
// Diffusion (the blur pyramid) is folded in at low weight — atmosphere,
// not glow.
export const COMPOSITE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSceneTex;
uniform sampler2D uBloomHalfTex;
uniform sampler2D uBloomQuarterTex;
uniform vec2 uResolution;
uniform float uGrain;
uniform float uTime;

// integer hash — same precision fix as the field pass; grain must be
// per-pixel decorrelated, and the sin-style hash blocks up at large
// coordinates on some GPUs
float hash12(vec2 p) {
  uvec2 v = uvec2(ivec2(floor(p + 0.5)) + 32768);
  v = v * 1664525u + 1013904223u;
  v.x += v.y * 1664525u;
  v.y += v.x * 1013904223u;
  v ^= v >> 16u;
  v.x += v.y * 1664525u;
  v.y += v.x * 1013904223u;
  v ^= v >> 16u;
  return float((v.x ^ v.y) & 0xffffffu) / 16777215.0;
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(
    mix(hash12(i + vec2(0.0, 0.0)), hash12(i + vec2(1.0, 0.0)), u.x),
    mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

vec3 aces(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

vec3 linearToSrgb(vec3 x) {
  vec3 lo = x * 12.92;
  vec3 hi = 1.055 * pow(x, vec3(1.0 / 2.4)) - 0.055;
  bvec3 useLo = lessThanEqual(x, vec3(0.0031308));
  return mix(hi, lo, vec3(useLo));
}

void main() {
  vec3 scene = texture(uSceneTex, vUv).rgb;
  vec3 bloomHalf = texture(uBloomHalfTex, vUv).rgb;
  vec3 bloomQuarter = texture(uBloomQuarterTex, vUv).rgb;

  // diffusion, not glow: the blurred pyramid feathers edges the way ink
  // bleeds into paper — weights stay low so nothing halos
  vec3 hdr = scene + bloomHalf * 0.22 + bloomQuarter * 0.2;
  vec3 mapped = aces(hdr * 0.94);

  vec2 px = vUv * uResolution;
  // grain lives at a fixed size relative to the artboard, not the pixel
  // grid — the same emulsion at preview and at 4x export
  float minDim = max(min(uResolution.x, uResolution.y), 1.0);
  vec2 gpx = px * (760.0 / minDim);

  // film grain: two octaves of smooth noise + fine per-pixel salt,
  // weighted into the midtones like real emulsion. Density is NOT
  // uniform — a slow field disperses it, heavy where the emulsion
  // pooled, thin where it didn't, the way spray and film actually fall
  float clump = vnoise(gpx * 0.045 + vec2(uTime * 0.7, -uTime * 0.4));
  float clump2 = vnoise(gpx * 0.13 - vec2(uTime * 0.3, uTime * 0.5));
  float disperse = 0.4 + 0.75 * clump + 0.45 * (clump2 - 0.5);
  float g1 = vnoise(gpx * 0.62 + vec2(uTime * 3.1, uTime * 1.7)) - 0.5;
  float g2 = vnoise(gpx * 1.9 + vec2(-uTime * 2.3, uTime * 4.1)) - 0.5;
  float g3 = hash12(gpx + vec2(fract(uTime) * 61.7, 9.1)) - 0.5;
  // coarse grain clumps ride the dispersion; fine salt stays even
  float grain = g1 * (0.3 + 0.35 * clump) + g2 * 0.35 + g3 * 0.2;
  float lum = dot(mapped, vec3(0.2126, 0.7152, 0.0722));
  float emulsion = 0.3 + 0.7 * smoothstep(0.0, 0.16, lum) * (1.0 - 0.65 * smoothstep(0.55, 1.0, lum));
  mapped += grain * uGrain * 1.35 * emulsion * disperse;
  mapped.rb += vec2(g2, -g2) * uGrain * 0.32 * emulsion * disperse;
  mapped = clamp(mapped, 0.0, 1.0);

  vec3 srgb = linearToSrgb(mapped);

  // interleaved-gradient dither: kills banding at 8 bits
  float ign = fract(52.9829189 * fract(0.06711056 * px.x + 0.00583715 * px.y));
  srgb += (ign - 0.5) * (2.0 / 255.0);

  fragColor = vec4(srgb, 1.0);
}
`
