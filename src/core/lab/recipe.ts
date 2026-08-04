import { mergeDeep } from '@/core/state/store'
import type { LabState } from './types'
import { LAB_VERSION } from './types'
import { MARK_DEFAULTS } from './markTranslation'

// Lab recipes follow the editor's contract: whole state as JSON,
// partial saves healed by mergeDeep over defaults, a hard version gate.
// The source bitmap is NOT embedded — filename + dims + contentHash
// identify it, and a restored recipe asks for the matching file.

export function createDefaultLab(seed = 1913): LabState {
  return {
    version: LAB_VERSION,
    studyId: 'mark-translation',
    seed,
    output: { width: 1400, height: 1400, transparent: false },
    source: null,
    mark: { ...MARK_DEFAULTS },
  }
}

export function serializeLab(lab: LabState): string {
  return JSON.stringify(lab)
}

export function deserializeLab(json: string): LabState | null {
  try {
    const raw = JSON.parse(json) as Partial<LabState>
    if (typeof raw !== 'object' || raw === null) return null
    if (raw.version !== LAB_VERSION) return null
    const lab = mergeDeep(createDefaultLab(typeof raw.seed === 'number' ? raw.seed : undefined), raw)
    // clamp what could break the render if hand-edited
    lab.output.width = clampInt(lab.output.width, 64, 8192)
    lab.output.height = clampInt(lab.output.height, 64, 8192)
    lab.mark.cellSize = Math.max(4, Math.min(160, lab.mark.cellSize))
    return lab
  } catch {
    return null
  }
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(v) || lo))
}

// FNV-1a over strided pixel samples — enough to match a re-dropped file
// to its recipe without hashing every byte
export function labContentHash(rgba: Uint8ClampedArray, w: number, h: number): string {
  let hsh = 0x811c9dc5
  const stride = Math.max(4, (Math.floor((w * h) / 4096) >> 2) << 2)
  for (let i = 0; i < rgba.length; i += stride * 4) {
    hsh ^= rgba[i]
    hsh = Math.imul(hsh, 0x01000193) >>> 0
  }
  hsh = fnvNum(fnvNum(hsh, w), h)
  return hsh.toString(16).padStart(8, '0')
}

function fnvNum(h: number, v: number): number {
  h ^= v & 0xff
  h = Math.imul(h, 0x01000193) >>> 0
  h ^= (v >> 8) & 0xff
  h = Math.imul(h, 0x01000193) >>> 0
  return h >>> 0
}
