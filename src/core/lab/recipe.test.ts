import { describe, expect, it } from 'vitest'
import { createDefaultLab, deserializeLab, labContentHash, serializeLab } from './recipe'
import { LAB_VERSION } from './types'

describe('lab recipes', () => {
  it('round-trips exactly', () => {
    const lab = createDefaultLab(42)
    lab.structure.baseCell = 31
    lab.territory.bands = ['flat', 'marks', 'photo']
    lab.paint = { w: 4, h: 4, data: 'AAAA' }
    lab.source = { filename: 'a.png', width: 800, height: 600, contentHash: 'ff00aa11', fit: 'cover' }
    expect(deserializeLab(serializeLab(lab))).toEqual(lab)
  })

  it('rejects other versions and garbage', () => {
    expect(deserializeLab(JSON.stringify({ version: LAB_VERSION + 1 }))).toBeNull()
    expect(deserializeLab('not json')).toBeNull()
    expect(deserializeLab('null')).toBeNull()
  })

  it('heals partial recipes from defaults and coerces the old study id', () => {
    const lab = deserializeLab(
      JSON.stringify({ version: LAB_VERSION, seed: 5, studyId: 'mark-translation' }),
    )
    expect(lab).not.toBeNull()
    expect(lab!.seed).toBe(5)
    expect(lab!.studyId).toBe('territory')
    expect(lab!.structure.baseCell).toBe(createDefaultLab().structure.baseCell)
    expect(lab!.territory.sources.length).toBeGreaterThan(0)
    expect(lab!.output.width).toBeGreaterThan(0)
  })

  it('clamps hand-edited extremes', () => {
    const lab = deserializeLab(
      JSON.stringify({
        version: LAB_VERSION,
        output: { width: 10, height: 999999, transparent: false },
        structure: { baseCell: 1, maxLevels: 9 },
        territory: { bands: [] },
      }),
    )
    expect(lab!.output.width).toBe(64)
    expect(lab!.output.height).toBe(8192)
    expect(lab!.structure.baseCell).toBe(8)
    expect(lab!.structure.maxLevels).toBe(2)
    expect(lab!.territory.bands.length).toBeGreaterThan(0)
  })
})

describe('labContentHash', () => {
  it('is deterministic and content-sensitive', () => {
    const a = new Uint8ClampedArray(64 * 64 * 4).fill(7)
    const b = new Uint8ClampedArray(64 * 64 * 4).fill(7)
    b[0] = 8
    expect(labContentHash(a, 64, 64)).toBe(labContentHash(Uint8ClampedArray.from(a), 64, 64))
    expect(labContentHash(a, 64, 64)).not.toBe(labContentHash(b, 64, 64))
    expect(labContentHash(a, 64, 64)).toMatch(/^[0-9a-f]{8}$/)
  })
})
