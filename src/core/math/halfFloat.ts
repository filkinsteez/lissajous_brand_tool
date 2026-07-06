const floatView = new Float32Array(1)
const int32View = new Int32Array(floatView.buffer)

// IEEE 754 float32 → float16 bits. RGBA16F is used for the field texture
// because half-float textures are linearly filterable in core WebGL2
// (32F filtering needs an extension).
export function toHalf(val: number): number {
  floatView[0] = val
  const x = int32View[0]

  let bits = (x >> 16) & 0x8000 // sign
  let m = (x >> 12) & 0x07ff // mantissa incl. rounding bit
  const e = (x >> 23) & 0xff // exponent

  if (e < 103) return bits // too small → signed zero
  if (e > 142) {
    // overflow → inf (NaN payloads collapse to inf; fine for field data)
    bits |= 0x7c00
    return bits
  }
  if (e < 113) {
    // subnormal
    m |= 0x0800
    bits |= (m >> (114 - e)) + ((m >> (113 - e)) & 1)
    return bits
  }
  bits |= ((e - 112) << 10) | (m >> 1)
  bits += m & 1 // round-to-nearest
  return bits
}

export function packHalf(src: Float32Array): Uint16Array {
  const out = new Uint16Array(src.length)
  for (let i = 0; i < src.length; i++) out[i] = toHalf(src[i])
  return out
}
