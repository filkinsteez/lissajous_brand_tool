import { buildCurveKnotTextureData } from '@/core/background/curveTexture'
import { buildPaletteLUT, PALETTES } from '@/core/color/palette'
import { getDerived } from '@/core/pipeline'
import type { ProjectState } from '@/core/state/types'
import { layoutTypeBlock } from '@/core/typography/textBlocks'
import { TAU } from '@/core/lissajous/equation'
import { BLUR_FRAGMENT_SHADER, BRIGHT_PASS_FRAGMENT_SHADER } from './shaders/bloom'
import { COMPOSITE_FRAGMENT_SHADER } from './shaders/composite'
import { FIELD_FRAGMENT_SHADER } from './shaders/field'
import { FULLSCREEN_VERTEX_SHADER } from './shaders/fullscreen'
import { SMEAR_FRAGMENT_SHADER } from './shaders/smear'

type CanvasLike = HTMLCanvasElement | OffscreenCanvas

type RenderOpts = {
  frozen?: boolean
  timeMs?: number
}

type InternalTarget = {
  tex: WebGLTexture
  fbo: WebGLFramebuffer
  width: number
  height: number
}

type Programs = {
  field: WebGLProgram
  smear: WebGLProgram
  bright: WebGLProgram
  blur: WebGLProgram
  composite: WebGLProgram
}

type RendererStatus = 'ready' | 'unavailable' | 'lost'

const HALF_FLOAT = 0x140b
const RGBA16F = 0x881a
const RGBA32F = 0x8814
const NOOP = () => {}

function pickPalette(project: ProjectState) {
  return PALETTES[project.background.paletteId] ?? PALETTES['brand-v1']
}

function createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('shader allocation failed')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'unknown shader compile error'
    gl.deleteShader(shader)
    throw new Error(log)
  }
  return shader
}

function createProgram(gl: WebGL2RenderingContext, vsSource: string, fsSource: string): WebGLProgram {
  const vs = createShader(gl, gl.VERTEX_SHADER, vsSource)
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource)
  const program = gl.createProgram()
  if (!program) throw new Error('program allocation failed')
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? 'unknown program link error'
    gl.deleteProgram(program)
    throw new Error(log)
  }
  return program
}

function createRenderTarget(gl: WebGL2RenderingContext, width: number, height: number): InternalTarget {
  const tex = gl.createTexture()
  const fbo = gl.createFramebuffer()
  if (!tex || !fbo) throw new Error('render target allocation failed')
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(gl.TEXTURE_2D, 0, RGBA16F, width, height, 0, gl.RGBA, HALF_FLOAT, null)

  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
  if (!ok) throw new Error('incomplete framebuffer')
  return { tex, fbo, width, height }
}

function deleteTarget(gl: WebGL2RenderingContext, target?: InternalTarget): void {
  if (!target) return
  gl.deleteTexture(target.tex)
  gl.deleteFramebuffer(target.fbo)
}

export class BackgroundRenderer {
  private gl: WebGL2RenderingContext | null = null
  private status: RendererStatus = 'unavailable'
  private floatLinear = false
  private programs: Programs | null = null
  private quadVao: WebGLVertexArrayObject | null = null
  private curveTex: WebGLTexture | null = null
  private paletteTex: WebGLTexture | null = null
  private sceneTarget: InternalTarget | null = null
  private smearTarget: InternalTarget | null = null
  private bloomHalfA: InternalTarget | null = null
  private bloomHalfB: InternalTarget | null = null
  private bloomQuarterA: InternalTarget | null = null
  private bloomQuarterB: InternalTarget | null = null
  private onLost: (event: Event) => void = NOOP
  private onRestored: () => void = NOOP

  constructor(private readonly canvas: CanvasLike) {
    this.init()
  }

  isAvailable(): boolean {
    return this.status === 'ready' && this.gl !== null
  }

  getStatus(): RendererStatus {
    return this.status
  }

  dispose(): void {
    const gl = this.gl
    if (!gl) return
    if (this.canvas instanceof HTMLCanvasElement) {
      this.canvas.removeEventListener('webglcontextlost', this.onLost)
      this.canvas.removeEventListener('webglcontextrestored', this.onRestored)
    }
    if (this.programs) {
      gl.deleteProgram(this.programs.field)
      gl.deleteProgram(this.programs.smear)
      gl.deleteProgram(this.programs.bright)
      gl.deleteProgram(this.programs.blur)
      gl.deleteProgram(this.programs.composite)
    }
    if (this.quadVao) gl.deleteVertexArray(this.quadVao)
    if (this.curveTex) gl.deleteTexture(this.curveTex)
    if (this.paletteTex) gl.deleteTexture(this.paletteTex)
    deleteTarget(gl, this.sceneTarget ?? undefined)
    deleteTarget(gl, this.smearTarget ?? undefined)
    deleteTarget(gl, this.bloomHalfA ?? undefined)
    deleteTarget(gl, this.bloomHalfB ?? undefined)
    deleteTarget(gl, this.bloomQuarterA ?? undefined)
    deleteTarget(gl, this.bloomQuarterB ?? undefined)
    this.gl = null
    this.status = 'unavailable'
  }

  renderToCanvas(project: ProjectState, width: number, height: number, opts: RenderOpts = {}): boolean {
    const gl = this.gl
    const programs = this.programs
    if (!gl || !programs || this.status !== 'ready') return false
    if (width <= 0 || height <= 0) return false

    if (this.canvas.width !== width) this.canvas.width = width
    if (this.canvas.height !== height) this.canvas.height = height
    this.ensureTargets(width, height)
    if (
      !this.sceneTarget ||
      !this.smearTarget ||
      !this.bloomHalfA ||
      !this.bloomHalfB ||
      !this.bloomQuarterA ||
      !this.bloomQuarterB
    ) {
      return false
    }

    const nowMs = opts.timeMs ?? performance.now()
    const tSec = opts.frozen ? (project.background.seed % 10000) * 0.001 : nowMs * 0.001
    const derived = getDerived(project)
    const curveTex = buildCurveKnotTextureData(derived.samples, 256)
    const palette = buildPaletteLUT(project.background.roles, pickPalette(project), project.background.lockedRoles)
    this.uploadCurveTexture(curveTex.width, curveTex.floatData, curveTex.halfData)
    this.uploadPaletteTexture(palette.width, palette.data)

    const groundHex = pickPalette(project).roles[project.background.ground].base
    const groundColor = hexToRgb01(groundHex)

    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.CULL_FACE)
    gl.bindVertexArray(this.quadVao)

    gl.viewport(0, 0, width, height)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneTarget.fbo)
    gl.useProgram(programs.field)
    this.bindTexture(0, this.curveTex)
    this.bindTexture(1, this.paletteTex)
    setUniform1i(gl, programs.field, 'uCurveTex', 0)
    setUniform1i(gl, programs.field, 'uPaletteTex', 1)
    setUniform2f(gl, programs.field, 'uResolution', width, height)
    setUniform2f(gl, programs.field, 'uCurveScale', width / project.artboard.width, height / project.artboard.height)
    setUniform3f(gl, programs.field, 'uGroundColor', groundColor[0], groundColor[1], groundColor[2])
    setUniform1f(gl, programs.field, 'uTime', tSec)
    setUniform1f(gl, programs.field, 'uSeed', project.background.seed)
    setUniform1f(gl, programs.field, 'uWidth', project.background.width)
    setUniform1f(gl, programs.field, 'uFieldScale', project.background.fieldScale ?? 1)
    setUniform2f(
      gl, programs.field, 'uFieldOffset',
      project.background.fieldOffsetX ?? 0,
      project.background.fieldOffsetY ?? 0,
    )
    setUniform1f(gl, programs.field, 'uForm', project.background.form ?? 0)
    setUniform1f(gl, programs.field, 'uSoftness', project.background.softness)
    setUniform1f(gl, programs.field, 'uWarp', project.background.warp)
    setUniform1f(gl, programs.field, 'uDrift', project.background.drift)
    setUniform1f(gl, programs.field, 'uArcSpread', project.background.arcSpread)
    setUniform1f(gl, programs.field, 'uContrast', project.background.contrast)
    setUniform1f(gl, programs.field, 'uGrain', project.background.grain)
    setUniform1i(gl, programs.field, 'uLayers', Math.max(1, Math.floor(project.background.layers)))
    setUniform1i(gl, programs.field, 'uKnotCount', curveTex.width)
    const sx = width / project.artboard.width
    const sy = height / project.artboard.height
    // TYPE CALM is opt-in: with it off, zero rects are passed and the
    // field is fully independent of text layout — dragging copy around
    // must never reshape the gradient
    const maxRects = 8
    const rectData = new Float32Array(maxRects * 4)
    const rectCount = project.background.typeCalm
      ? Math.min(maxRects, project.typeBlocks.length)
      : 0
    for (let i = 0; i < rectCount; i++) {
      const blockRect = layoutTypeBlock(project.typeBlocks[i], derived.grid)
      const o = i * 4
      rectData[o] = blockRect.x * sx
      rectData[o + 1] = blockRect.y * sy
      rectData[o + 2] = blockRect.w * sx
      rectData[o + 3] = blockRect.estH * sy
    }
    setUniform1i(gl, programs.field, 'uTypeRectCount', rectCount)
    setUniform4fv(gl, programs.field, 'uTypeRects[0]', rectData)
    const masses = buildAtmosphereMasses(derived, sx, sy, Math.min(width, height))
    setUniform1i(gl, programs.field, 'uMassCount', masses.count)
    setUniform4fv(gl, programs.field, 'uMasses[0]', masses.data)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

    // smear: pull the composed field along the curve's flow
    gl.viewport(0, 0, width, height)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.smearTarget.fbo)
    gl.useProgram(programs.smear)
    this.bindTexture(0, this.sceneTarget.tex)
    this.bindTexture(1, this.curveTex)
    setUniform1i(gl, programs.smear, 'uSceneTex', 0)
    setUniform1i(gl, programs.smear, 'uCurveTex', 1)
    setUniform2f(gl, programs.smear, 'uResolution', width, height)
    setUniform2f(gl, programs.smear, 'uCurveScale', sx, sy)
    setUniform1i(gl, programs.smear, 'uKnotCount', curveTex.width)
    setUniform1f(gl, programs.smear, 'uFieldScale', project.background.fieldScale ?? 1)
    setUniform2f(
      gl, programs.smear, 'uFieldOffset',
      project.background.fieldOffsetX ?? 0,
      project.background.fieldOffsetY ?? 0,
    )
    setUniform1f(gl, programs.smear, 'uDrift', project.background.drift)
    setUniform1f(gl, programs.smear, 'uWarp', project.background.warp)
    setUniform1f(gl, programs.smear, 'uSeed', project.background.seed)
    setUniform1f(gl, programs.smear, 'uTime', tSec)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

    gl.viewport(0, 0, this.bloomHalfA.width, this.bloomHalfA.height)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomHalfA.fbo)
    gl.useProgram(programs.bright)
    this.bindTexture(0, this.smearTarget.tex)
    setUniform1i(gl, programs.bright, 'uSceneTex', 0)
    setUniform1f(gl, programs.bright, 'uThreshold', 0.34)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

    this.blurPass(this.bloomHalfA, this.bloomHalfB, 1, 0)
    this.blurPass(this.bloomHalfB, this.bloomHalfA, 0, 1)
    this.blurPass(this.bloomHalfA, this.bloomHalfB, 1, 0)
    this.blurPass(this.bloomHalfB, this.bloomHalfA, 0, 1)

    gl.viewport(0, 0, this.bloomQuarterA.width, this.bloomQuarterA.height)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomQuarterA.fbo)
    gl.useProgram(programs.bright)
    this.bindTexture(0, this.bloomHalfA.tex)
    setUniform1i(gl, programs.bright, 'uSceneTex', 0)
    setUniform1f(gl, programs.bright, 'uThreshold', 0.14)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

    this.blurPass(this.bloomQuarterA, this.bloomQuarterB, 1, 0)
    this.blurPass(this.bloomQuarterB, this.bloomQuarterA, 0, 1)
    this.blurPass(this.bloomQuarterA, this.bloomQuarterB, 1, 0)
    this.blurPass(this.bloomQuarterB, this.bloomQuarterA, 0, 1)

    gl.viewport(0, 0, width, height)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.useProgram(programs.composite)
    this.bindTexture(0, this.smearTarget.tex)
    this.bindTexture(1, this.bloomHalfA.tex)
    this.bindTexture(2, this.bloomQuarterA.tex)
    setUniform1i(gl, programs.composite, 'uSceneTex', 0)
    setUniform1i(gl, programs.composite, 'uBloomHalfTex', 1)
    setUniform1i(gl, programs.composite, 'uBloomQuarterTex', 2)
    setUniform2f(gl, programs.composite, 'uResolution', width, height)
    setUniform1f(gl, programs.composite, 'uGrain', project.background.grain)
    setUniform1f(gl, programs.composite, 'uTime', tSec)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.bindVertexArray(null)
    return true
  }

  private init(): void {
    const gl = this.canvas.getContext('webgl2', { antialias: false, alpha: true, premultipliedAlpha: false })
    if (!gl) {
      this.status = 'unavailable'
      return
    }
    if (!gl.getExtension('EXT_color_buffer_float')) {
      this.status = 'unavailable'
      return
    }
    // full-float knot texture wants linear filtering; without the
    // extension the curve texture falls back to half floats. Half
    // precision quantizes knot coords to ~1px past x=1024, which makes
    // the fill's ray-parity test miscount in thin bands — the "sharp
    // spikes" artifact.
    this.floatLinear = !!gl.getExtension('OES_texture_float_linear')

    try {
      this.programs = {
        field: createProgram(gl, FULLSCREEN_VERTEX_SHADER, FIELD_FRAGMENT_SHADER),
        smear: createProgram(gl, FULLSCREEN_VERTEX_SHADER, SMEAR_FRAGMENT_SHADER),
        bright: createProgram(gl, FULLSCREEN_VERTEX_SHADER, BRIGHT_PASS_FRAGMENT_SHADER),
        blur: createProgram(gl, FULLSCREEN_VERTEX_SHADER, BLUR_FRAGMENT_SHADER),
        composite: createProgram(gl, FULLSCREEN_VERTEX_SHADER, COMPOSITE_FRAGMENT_SHADER),
      }
    } catch {
      this.status = 'unavailable'
      return
    }

    this.quadVao = gl.createVertexArray()
    const vbo = gl.createBuffer()
    if (!this.quadVao || !vbo) {
      this.status = 'unavailable'
      return
    }
    gl.bindVertexArray(this.quadVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0)
    gl.bindVertexArray(null)
    gl.deleteBuffer(vbo)

    this.curveTex = gl.createTexture()
    this.paletteTex = gl.createTexture()
    if (!this.curveTex || !this.paletteTex) {
      this.status = 'unavailable'
      return
    }

    if (this.canvas instanceof HTMLCanvasElement) {
      this.onLost = (event: Event) => {
        event.preventDefault()
        this.status = 'lost'
      }
      this.onRestored = () => {
        this.dispose()
        this.init()
      }
      this.canvas.addEventListener('webglcontextlost', this.onLost)
      this.canvas.addEventListener('webglcontextrestored', this.onRestored)
    }

    this.gl = gl
    this.status = 'ready'
  }

  private blurPass(src: InternalTarget, dst: InternalTarget, dirX: number, dirY: number): void {
    const gl = this.gl
    const program = this.programs?.blur
    if (!gl || !program) return
    gl.viewport(0, 0, dst.width, dst.height)
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo)
    gl.useProgram(program)
    this.bindTexture(0, src.tex)
    setUniform1i(gl, program, 'uInputTex', 0)
    setUniform2f(gl, program, 'uTexel', 1 / src.width, 1 / src.height)
    setUniform2f(gl, program, 'uDir', dirX, dirY)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  private bindTexture(unit: number, tex: WebGLTexture | null): void {
    if (!this.gl || !tex) return
    this.gl.activeTexture(this.gl.TEXTURE0 + unit)
    this.gl.bindTexture(this.gl.TEXTURE_2D, tex)
  }

  private uploadCurveTexture(width: number, floatData: Float32Array, halfData: Uint16Array): void {
    const gl = this.gl
    if (!gl || !this.curveTex) return
    gl.bindTexture(gl.TEXTURE_2D, this.curveTex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    // the knots are a CLOSED loop parameterized by arc: sampling must
    // wrap, or tangents read near the arc seam come back clamped and
    // spray a fan of bad smear directions from the curve's start point
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    // full float keeps the fill's ray test exact; half floats are the
    // fallback where linear-filtered float textures are unsupported
    if (this.floatLinear) {
      gl.texImage2D(gl.TEXTURE_2D, 0, RGBA32F, width, 1, 0, gl.RGBA, gl.FLOAT, floatData)
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, RGBA16F, width, 1, 0, gl.RGBA, HALF_FLOAT, halfData)
    }
  }

  private uploadPaletteTexture(width: number, data: Uint8Array): void {
    const gl = this.gl
    if (!gl || !this.paletteTex) return
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data)
  }

  private ensureTargets(width: number, height: number): void {
    const gl = this.gl
    if (!gl) return
    if (this.sceneTarget && this.sceneTarget.width === width && this.sceneTarget.height === height) return
    deleteTarget(gl, this.sceneTarget ?? undefined)
    deleteTarget(gl, this.smearTarget ?? undefined)
    deleteTarget(gl, this.bloomHalfA ?? undefined)
    deleteTarget(gl, this.bloomHalfB ?? undefined)
    deleteTarget(gl, this.bloomQuarterA ?? undefined)
    deleteTarget(gl, this.bloomQuarterB ?? undefined)

    this.sceneTarget = createRenderTarget(gl, width, height)
    this.smearTarget = createRenderTarget(gl, width, height)
    const halfW = Math.max(1, Math.floor(width * 0.5))
    const halfH = Math.max(1, Math.floor(height * 0.5))
    const quarterW = Math.max(1, Math.floor(width * 0.25))
    const quarterH = Math.max(1, Math.floor(height * 0.25))
    this.bloomHalfA = createRenderTarget(gl, halfW, halfH)
    this.bloomHalfB = createRenderTarget(gl, halfW, halfH)
    this.bloomQuarterA = createRenderTarget(gl, quarterW, quarterH)
    this.bloomQuarterB = createRenderTarget(gl, quarterW, quarterH)
  }
}

function setUniform1i(gl: WebGL2RenderingContext, program: WebGLProgram, name: string, v: number): void {
  const loc = gl.getUniformLocation(program, name)
  if (loc !== null) gl.uniform1i(loc, v)
}

function setUniform1f(gl: WebGL2RenderingContext, program: WebGLProgram, name: string, v: number): void {
  const loc = gl.getUniformLocation(program, name)
  if (loc !== null) gl.uniform1f(loc, v)
}

function setUniform2f(gl: WebGL2RenderingContext, program: WebGLProgram, name: string, x: number, y: number): void {
  const loc = gl.getUniformLocation(program, name)
  if (loc !== null) gl.uniform2f(loc, x, y)
}

function setUniform3f(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string,
  x: number,
  y: number,
  z: number,
): void {
  const loc = gl.getUniformLocation(program, name)
  if (loc !== null) gl.uniform3f(loc, x, y, z)
}

function setUniform4f(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string,
  x: number,
  y: number,
  z: number,
  w: number,
): void {
  const loc = gl.getUniformLocation(program, name)
  if (loc !== null) gl.uniform4f(loc, x, y, z, w)
}

function setUniform4fv(gl: WebGL2RenderingContext, program: WebGLProgram, name: string, v: Float32Array): void {
  const loc = gl.getUniformLocation(program, name)
  if (loc !== null) gl.uniform4fv(loc, v)
}

function hexToRgb01(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const r = Number.parseInt(clean.slice(0, 2), 16) / 255
  const g = Number.parseInt(clean.slice(2, 4), 16) / 255
  const b = Number.parseInt(clean.slice(4, 6), 16) / 255
  return [r, g, b]
}

function normArc(t: number): number {
  const wrapped = ((t % TAU) + TAU) % TAU
  return wrapped / TAU
}

function buildAtmosphereMasses(
  derived: ReturnType<typeof getDerived>,
  sx: number,
  sy: number,
  shortEdge: number,
): { count: number; data: Float32Array } {
  const maxMasses = 8
  const data = new Float32Array(maxMasses * 4)
  let count = 0

  const push = (x: number, y: number, radius: number, arc: number) => {
    if (count >= maxMasses) return
    const o = count * 4
    data[o] = x
    data[o + 1] = y
    data[o + 2] = radius
    data[o + 3] = arc
    count++
  }

  for (const node of derived.primary.slice(0, 4)) {
    const radius = shortEdge * (0.22 + node.score * 0.2)
    push(node.x * sx, node.y * sy, radius, normArc(node.ti))
  }

  const extrema = [...derived.features.xExtrema, ...derived.features.yExtrema]
  if (extrema.length) {
    const want = maxMasses - count
    const step = Math.max(1, Math.floor(extrema.length / Math.max(1, want)))
    for (let i = 0; i < extrema.length && count < maxMasses; i += step) {
      const p = extrema[i]
      const radius = shortEdge * (0.16 + 0.05 * ((count % 3) + 1))
      push(p.x * sx, p.y * sy, radius, normArc(p.t))
    }
  }

  if (count === 0) {
    const box = derived.grid.contentBox
    push((box.x + box.w * 0.25) * sx, (box.y + box.h * 0.35) * sy, shortEdge * 0.24, 0.12)
    push((box.x + box.w * 0.75) * sx, (box.y + box.h * 0.68) * sy, shortEdge * 0.28, 0.56)
  }

  return { count, data }
}

const rendererByCanvas = new WeakMap<CanvasLike, BackgroundRenderer>()

export function getBackgroundRenderer(canvas: CanvasLike): BackgroundRenderer {
  let renderer = rendererByCanvas.get(canvas)
  if (!renderer) {
    renderer = new BackgroundRenderer(canvas)
    rendererByCanvas.set(canvas, renderer)
  }
  return renderer
}

export function renderToCanvas(
  canvas: CanvasLike,
  project: ProjectState,
  width: number,
  height: number,
  opts: RenderOpts = {},
): boolean {
  const renderer = getBackgroundRenderer(canvas)
  const ok = renderer.renderToCanvas(project, width, height, opts)
  if (!ok) renderFlatFallback(canvas, project.artboard.background, width, height)
  return ok
}

function renderFlatFallback(canvas: CanvasLike, color: string, width: number, height: number): void {
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
  if (!(canvas instanceof HTMLCanvasElement)) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.fillStyle = color
  ctx.fillRect(0, 0, width, height)
}
