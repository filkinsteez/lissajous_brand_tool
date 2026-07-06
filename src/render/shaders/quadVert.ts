export const QUAD_VERT = /* glsl */ `#version 300 es
// fullscreen triangle from gl_VertexID; uv in [0,1] with y DOWN so it
// matches artboard/texture space directly
out vec2 v_uv;
void main() {
  vec2 pos = vec2(
    gl_VertexID == 1 ? 3.0 : -1.0,
    gl_VertexID == 2 ? 3.0 : -1.0
  );
  v_uv = vec2(pos.x * 0.5 + 0.5, 0.5 - pos.y * 0.5);
  gl_Position = vec4(pos, 0.0, 1.0);
}
`
