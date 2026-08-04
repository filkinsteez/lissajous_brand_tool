import type { ShapeProto } from '@/core/canvas/shapeProtos'
import { resolveBank } from '@/core/lab/markBank'
import type { MarkBankId } from '@/core/lab/types'

// The brand bank parses the editor's autosaved project out of
// localStorage — cheap, but not per-rAF cheap. Cache keyed on the FULL
// raw autosave string (a length+prefix key once served stale banks:
// shape edits can change neither); string equality on a few KB is
// nothing next to a JSON.parse.

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
  const k = `${id}|${raw ?? ''}`
  if (k !== key) {
    key = k
    cached = resolveBank(id, raw)
  }
  return cached
}
