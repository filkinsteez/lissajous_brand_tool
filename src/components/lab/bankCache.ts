import type { ShapeProto } from '@/core/canvas/shapeProtos'
import { resolveBank } from '@/core/lab/markBank'
import type { MarkBankId } from '@/core/lab/types'

// The brand bank parses the editor's autosaved project out of
// localStorage — cheap, but not per-rAF cheap. Cache per (bank, raw
// autosave string identity); localStorage is not reactive, so entering
// the lab after drawing new shapes naturally refreshes it.

let key = ''
let cached: ShapeProto[] = []

export function resolveBankCached(id: MarkBankId): ShapeProto[] {
  let raw: string | null = null
  if (id === 'brand') {
    try {
      raw = localStorage.getItem('lbs-autosave')
    } catch {
      raw = null
    }
  }
  const k = `${id}|${raw?.length ?? 0}|${raw?.slice(0, 64) ?? ''}`
  if (k !== key) {
    key = k
    cached = resolveBank(id, raw)
  }
  return cached
}
