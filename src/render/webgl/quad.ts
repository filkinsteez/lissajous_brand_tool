// Fullscreen triangle — no buffers needed, vertices generated in the
// vertex shader from gl_VertexID.
export function drawFullscreen(gl: WebGL2RenderingContext): void {
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}
