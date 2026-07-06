export function createGL(canvas: HTMLCanvasElement): WebGL2RenderingContext | null {
  // preserveDrawingBuffer stays false: exports render on demand into the
  // same frame they are read, so nothing depends on buffer persistence
  // (the OSCILLA resize-clears-paint gotcha is designed out).
  return canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
    premultipliedAlpha: true,
  })
}
