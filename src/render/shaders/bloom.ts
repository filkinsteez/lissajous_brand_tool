export const BRIGHT_PASS_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSceneTex;
uniform float uThreshold;

void main() {
  vec3 c = texture(uSceneTex, vUv).rgb;
  float luma = max(max(c.r, c.g), c.b);
  float w = max((luma - uThreshold) / max(luma, 1e-4), 0.0);
  fragColor = vec4(c * w, 1.0);
}
`

export const BLUR_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uInputTex;
uniform vec2 uTexel;
uniform vec2 uDir;

void main() {
  vec3 sum = vec3(0.0);
  sum += texture(uInputTex, vUv).rgb * 0.227027;
  sum += texture(uInputTex, vUv + uTexel * uDir * 1.384615).rgb * 0.316216;
  sum += texture(uInputTex, vUv - uTexel * uDir * 1.384615).rgb * 0.316216;
  sum += texture(uInputTex, vUv + uTexel * uDir * 3.230769).rgb * 0.070270;
  sum += texture(uInputTex, vUv - uTexel * uDir * 3.230769).rgb * 0.070270;
  fragColor = vec4(sum, 1.0);
}
`
