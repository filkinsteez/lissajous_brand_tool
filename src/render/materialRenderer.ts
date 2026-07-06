import type { MaterialState } from '@/core/state/types'
import type { FieldBake } from '@/core/lissajous/fields'
import type { PressureMask } from '@/core/typography/pressureMask'
import { createGL } from './webgl/context'
import { compileProgram, UniformCache } from './webgl/program'
import { uploadR8, uploadRGBA16F } from './webgl/textures'
import { drawFullscreen } from './webgl/quad'
import { createFramebuffer, destroyFramebuffer } from './webgl/framebuffer'
import { QUAD_VERT } from './shaders/quadVert'
import { GRAIN_FRAG } from './shaders/grainFrag'

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? [...h].map((c) => c + c).join('') : h, 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

// Owns the GL state for the material layer: one program, two textures,
// render-to-canvas for the editor and render-to-FBO for export readback.
export class MaterialRenderer {
  private gl: WebGL2RenderingContext | null
  private program: WebGLProgram | null = null
  private uniforms: UniformCache | null = null
  private vao: WebGLVertexArrayObject | null = null
  private fieldTex: WebGLTexture | null = null
  private pressureTex: WebGLTexture | null = null
  private fieldKey = ''
  private pressureKey = ''

  constructor(private canvas: HTMLCanvasElement) {
    this.gl = createGL(canvas)
    if (this.gl) {
      this.program = compileProgram(this.gl, QUAD_VERT, GRAIN_FRAG)
      this.uniforms = new UniformCache(this.gl, this.program)
      this.vao = this.gl.createVertexArray()
    }
  }

  get available(): boolean {
    return !!this.gl && !!this.program
  }

  setField(bake: FieldBake): void {
    if (!this.gl) return
    const key = `${bake.resX}:${bake.resY}:${bake.data[0]}:${bake.data[bake.data.length - 2]}:${bake.data[(bake.data.length >> 1) | 3]}`
    if (key === this.fieldKey) return
    this.fieldTex = uploadRGBA16F(this.gl, this.fieldTex, bake.resX, bake.resY, bake.data)
    this.fieldKey = key
  }

  setPressure(mask: PressureMask): void {
    if (!this.gl) return
    const key = `${mask.width}:${mask.height}:${mask.data[0]}:${mask.data[(mask.data.length >> 1) | 0]}:${mask.data[mask.data.length - 1]}`
    if (key === this.pressureKey) return
    this.pressureTex = uploadR8(this.gl, this.pressureTex, mask.width, mask.height, mask.data)
    this.pressureKey = key
  }

  private bindAndDraw(mat: MaterialState, width: number, height: number, timeSec: number, seed: number): void {
    const gl = this.gl
    if (!gl || !this.program || !this.uniforms) return
    gl.viewport(0, 0, width, height)
    gl.useProgram(this.program)
    gl.bindVertexArray(this.vao)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.fieldTex)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.pressureTex)

    const u = this.uniforms
    u.i1('u_field', 0)
    u.i1('u_pressure', 1)
    u.f2('u_px', width, height)
    u.f1('u_seed', (seed % 289) / 17 + 0.618) // small range — see hash21 note
    u.f1('u_time', mat.motion > 0 ? timeSec : 0)
    u.f1('u_pressureAmt', mat.pressure)
    u.f1('u_density', mat.density)
    u.f1('u_grainSize', mat.grainSize)
    u.f1('u_drift', mat.drift)
    u.f1('u_fold', mat.fold)
    u.f1('u_ring', mat.ring)
    u.f1('u_contrast', mat.contrast)
    u.f1('u_void', mat.voidStrength)
    u.f1('u_motion', mat.motion)
    const ink = hexToRgb(mat.ink)
    const paper = hexToRgb(mat.paper)
    u.f3('u_ink', ink[0], ink[1], ink[2])
    u.f3('u_paper', paper[0], paper[1], paper[2])

    drawFullscreen(gl)
    gl.bindVertexArray(null)
  }

  render(mat: MaterialState, timeSec: number, seed: number): void {
    if (!this.gl) return
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null)
    this.bindAndDraw(mat, this.canvas.width, this.canvas.height, timeSec, seed)
  }

  // Render at arbitrary resolution and read back RGBA — the export path.
  renderToPixels(mat: MaterialState, width: number, height: number, seed: number): Uint8ClampedArray<ArrayBuffer> | null {
    const gl = this.gl
    if (!gl) return null
    const fb = createFramebuffer(gl, width, height)
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb.fbo)
    this.bindAndDraw(mat, width, height, 0, seed)
    const pixels = new Uint8Array(width * height * 4)
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    destroyFramebuffer(gl, fb)
    // readPixels returns rows bottom-up; flip to top-down for putImageData
    const flipped = new Uint8ClampedArray(pixels.length)
    const rowBytes = width * 4
    for (let y = 0; y < height; y++) {
      flipped.set(pixels.subarray(y * rowBytes, (y + 1) * rowBytes), (height - 1 - y) * rowBytes)
    }
    return flipped
  }

  // Read one pixel from the visible canvas (debug/verification hook).
  samplePixel(mat: MaterialState, x: number, y: number, timeSec: number, seed: number): [number, number, number] {
    const gl = this.gl
    if (!gl) return [0, 0, 0]
    this.render(mat, timeSec, seed)
    const px = new Uint8Array(4)
    gl.readPixels(
      Math.round(x), Math.round(this.canvas.height - 1 - y),
      1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px,
    )
    return [px[0], px[1], px[2]]
  }

  dispose(): void {
    const gl = this.gl
    if (!gl) return
    if (this.fieldTex) gl.deleteTexture(this.fieldTex)
    if (this.pressureTex) gl.deleteTexture(this.pressureTex)
    if (this.program) gl.deleteProgram(this.program)
    if (this.vao) gl.deleteVertexArray(this.vao)
    this.gl = null
  }
}
