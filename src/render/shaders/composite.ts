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

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
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
  vec2 centered = vUv * 2.0 - 1.0;
  vec2 chromaOffset = centered * vec2(1.0 / max(uResolution.x, 1.0), 1.0 / max(uResolution.y, 1.0)) * 3.5;
  float bloomR = texture(uBloomHalfTex, vUv + chromaOffset).r;
  float bloomG = texture(uBloomHalfTex, vUv).g;
  float bloomB = texture(uBloomHalfTex, vUv - chromaOffset).b;
  vec3 chromaBloom = vec3(bloomR, bloomG, bloomB);

  vec3 hdr = scene + bloomHalf * 1.34 + bloomQuarter * 1.18 + chromaBloom * 0.34;
  vec3 mapped = aces(hdr);
  mapped = pow(mapped, vec3(0.9));
  float luma = dot(mapped, vec3(0.2126, 0.7152, 0.0722));
  mapped = mix(vec3(luma), mapped, 1.22);
  float vignette = 1.0 - dot(centered * vec2(0.82, 1.12), centered * vec2(0.82, 1.12)) * 0.22;
  mapped *= clamp(vignette, 0.8, 1.02);

  vec2 px = vUv * uResolution;
  float scanFine = sin(px.y * 3.14159265) * 0.5 + 0.5;
  float scanSlow = sin(px.y * 0.72 + px.x * 0.018 + uTime * 0.03) * 0.5 + 0.5;
  float columnWeave = sin(px.x * 1.21 + hash12(vec2(floor(px.y * 0.25), 7.0)) * 6.28318) * 0.5 + 0.5;
  float printedSurface =
    (scanFine - 0.5) * (0.005 + uGrain * 0.03) +
    (scanSlow - 0.5) * (0.006 + uGrain * 0.018) +
    (columnWeave - 0.5) * (0.002 + uGrain * 0.012);
  mapped *= 1.0 + printedSurface;

  float nA = hash12(px + vec2(uTime * 0.13, uTime * 0.07)) - 0.5;
  float nB = hash12(px * 1.73 + vec2(17.0, -11.0 + uTime * 0.03)) - 0.5;
  float paperFiber = hash12(floor(px * vec2(0.55, 0.23)) + vec2(3.0, 19.0)) - 0.5;
  float n = nA * 0.54 + nB * 0.28 + paperFiber * 0.18;
  mapped += n * (0.0018 + uGrain * 0.014);
  mapped = clamp(mapped, 0.0, 1.0);

  fragColor = vec4(linearToSrgb(mapped), 1.0);
}
`
