// Shared GLSL helpers. hash21/vnoise are the OSCILLA lineage — but per the
// PRD, noise is only ever a whisper (paper mottle), never the main driver.
export const GLSL_COMMON = /* glsl */ `
// Hoskins-style hash — keeps precision for inputs up to a few thousand.
// (The classic fract(p*bignum) hash collapses into visible lattices once
// its intermediate products exceed float32 fract precision.)
float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
`
