// The panels were written in the old mono-caps voice ('FREQ X', 'STROKE
// MIX'). DialKit's controls are sentence case, so labels are normalized
// here — one place, instead of rewriting every call site. Single letters
// and known acronyms stay upper (Freq X, not Freq x).
const KEEP_UPPER = new Set(['x', 'y', 'z', 'png', 'svg', 'css', 'rgb', 'hq', 'id', 'b'])

export function niceLabel(s: string): string {
  const words = s.toLowerCase().split(/\s+/)
  return words
    .map((w, i) => {
      if (KEEP_UPPER.has(w)) return w.toUpperCase()
      if (i === 0) return w.charAt(0).toUpperCase() + w.slice(1)
      return w
    })
    .join(' ')
}
