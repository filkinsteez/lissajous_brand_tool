import { packHalf } from '@/core/math/halfFloat'

function baseTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const tex = gl.createTexture()
  if (!tex) throw new Error('createTexture failed')
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return tex
}

// RGBA16F upload from CPU float data (linearly filterable in core WebGL2).
export function uploadRGBA16F(
  gl: WebGL2RenderingContext,
  tex: WebGLTexture | null,
  width: number,
  height: number,
  data: Float32Array,
): WebGLTexture {
  const texture = tex ?? baseTexture(gl)
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, packHalf(data))
  return texture
}

// Single-channel R8 upload from 0..1 float data.
export function uploadR8(
  gl: WebGL2RenderingContext,
  tex: WebGLTexture | null,
  width: number,
  height: number,
  data: Float32Array,
): WebGLTexture {
  const texture = tex ?? baseTexture(gl)
  const bytes = new Uint8Array(data.length)
  for (let i = 0; i < data.length; i++) {
    bytes[i] = Math.max(0, Math.min(255, Math.round(data[i] * 255)))
  }
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, width, height, 0, gl.RED, gl.UNSIGNED_BYTE, bytes)
  return texture
}
