import { mergeDeep } from '@/core/state/store'
import { INK, PAPER } from '@/core/state/defaults'
import type { LabState } from './types'
import { LAB_VERSION } from './types'
import { MARK_DEFAULTS } from './composition'
import { createFieldSource } from './territory'

// Lab recipes follow the editor's contract: whole state as JSON,
// partial saves healed by mergeDeep over defaults, a hard version gate.
// The source bitmap is NOT embedded — filename + dims + contentHash
// identify it, and a restored recipe asks for the matching file.

export function createDefaultLab(seed = 1913): LabState {
  return {
    version: LAB_VERSION,
    studyId: 'territory',
    seed,
    output: { width: 1400, height: 1400, transparent: false },
    source: null,
    // The default composition tells the thesis: the brand curve is the
    // organizing form — the photo survives only near it, marks carry
    // tone further out, contours band the transition, the far field
    // goes empty. Tone deepens the territory where the image is dark.
    territory: {
      sources: [
        createFieldSource('curve', 'src-curve'),
        { ...createFieldSource('tone', 'src-tone'), weight: 0.35 },
      ],
      bands: ['empty', 'marks', 'contours', 'photo'],
      boundary: 'hard',
    },
    structure: { baseCell: 28, maxLevels: 2, subdivide: 0.55 },
    mark: { ...MARK_DEFAULTS },
    paint: null,
    sourceVisibility: 0,
    colors: { ink: INK, paper: PAPER },
  }
}

export function serializeLab(lab: LabState): string {
  return JSON.stringify(lab)
}

export function deserializeLab(json: string): LabState | null {
  try {
    const raw = JSON.parse(json) as Partial<LabState> & { studyId?: string }
    if (typeof raw !== 'object' || raw === null) return null
    if (raw.version !== LAB_VERSION) return null
    // older lab saves carried 'mark-translation'; the territory engine
    // supersedes it and heals their params in
    raw.studyId = 'territory'
    const lab = mergeDeep(createDefaultLab(typeof raw.seed === 'number' ? raw.seed : undefined), raw)
    lab.output.width = clampInt(lab.output.width, 64, 8192)
    lab.output.height = clampInt(lab.output.height, 64, 8192)
    lab.structure.baseCell = Math.max(8, Math.min(160, lab.structure.baseCell))
    lab.structure.maxLevels = Math.max(0, Math.min(2, Math.round(lab.structure.maxLevels))) as 0 | 1 | 2
    if (!lab.territory.bands.length) lab.territory.bands = ['empty', 'marks']
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
