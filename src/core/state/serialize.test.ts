import { describe, expect, it } from 'vitest'
import { createDefaultProject } from './defaults'
import { deserializeProject, serializeProject } from './serialize'
import { decodeShareHash, encodeShareHash } from './compress'
import { BRAND_PALETTE } from '@/core/color/palette'

describe('recipe serialization', () => {
  it('round-trips the full project', () => {
    const project = createDefaultProject(4242)
    project.glyphField.enabled = true
    project.material.motion = 0.3
    expect(deserializeProject(serializeProject(project))).toEqual(project)
  })

  it('fills missing fields from defaults (partial recipes stay valid)', () => {
    const loaded = deserializeProject('{"version":1,"seed":7,"lissajous":{"frequencyX":5}}')
    expect(loaded).not.toBeNull()
    expect(loaded!.seed).toBe(7)
    expect(loaded!.lissajous.frequencyX).toBe(5)
    expect(loaded!.lissajous.frequencyY).toBe(createDefaultProject().lissajous.frequencyY)
    expect(loaded!.typeBlocks.length).toBe(3)
    expect(loaded!.background.mode).toBe(createDefaultProject().background.mode)
    expect(loaded!.background.paletteId).toBe(BRAND_PALETTE.id)
  })

  it('normalizes unsupported palette ids', () => {
    const loaded = deserializeProject(
      '{"version":1,"seed":7,"background":{"paletteId":"unknown","roles":["cyan"],"lockedRoles":["yellow"]}}',
    )
    expect(loaded).not.toBeNull()
    expect(loaded!.background.paletteId).toBe(BRAND_PALETTE.id)
    expect(loaded!.background.roles).toEqual(['cyan'])
    expect(loaded!.background.lockedRoles).toEqual(['yellow'])
  })

  it('migrates pre-layer-stack registers into layers', () => {
    // an old save: enabled repeater + sheet, disabled pattern — enabled
    // registers become layers in the legacy z-order, params carried over
    const loaded = deserializeProject(
      JSON.stringify({
        version: 1,
        seed: 3,
        sheet: { enabled: true, shape: 'circle', countX: 12, tone: 'ink' },
        repeater: { enabled: true, mode: 'linear', count: 9 },
        pattern: { enabled: false, cells: 20 },
      }),
    )
    expect(loaded).not.toBeNull()
    expect(loaded!.layers.map((l) => l.type)).toEqual(['sheet', 'repeater'])
    const sheet = loaded!.layers[0]
    expect(sheet.type === 'sheet' && sheet.params.countX).toBe(12)
    expect(sheet.params).not.toHaveProperty('enabled')
    expect(sheet.params).not.toHaveProperty('tone')
    const rep = loaded!.layers[1]
    expect(rep.type === 'repeater' && rep.params.count).toBe(9)
    // defaults fill the unspecified params
    expect(rep.type === 'repeater' && rep.params.radius).toBe(0.28)
    // the old singleton keys do not ghost into the project
    expect(loaded).not.toHaveProperty('sheet')
    expect(loaded).not.toHaveProperty('repeater')
  })

  it('rejects wrong versions and garbage', () => {
    expect(deserializeProject('{"version":99}')).toBeNull()
    expect(deserializeProject('not json')).toBeNull()
    expect(deserializeProject('')).toBeNull()
    expect(deserializeProject(null)).toBeNull()
  })
})

describe('share hash', () => {
  it('round-trips through the URL-safe encoding', () => {
    const project = createDefaultProject(999)
    project.typeBlocks[0].text = 'ÜNICODE — & <tags> 日本語'
    const hash = encodeShareHash(project)
    expect(hash.startsWith('s=')).toBe(true)
    expect(/^[A-Za-z0-9+\-$_=]+$/.test(hash)).toBe(true)
    expect(decodeShareHash('#' + hash)).toEqual(project)
  })

  it('stays comfortably under URL limits', () => {
    const hash = encodeShareHash(createDefaultProject())
    expect(hash.length).toBeLessThan(4000)
  })

  it('returns null for malformed hashes', () => {
    expect(decodeShareHash('#s=!!!notvalid')).toBeNull()
    expect(decodeShareHash('#other=1')).toBeNull()
    expect(decodeShareHash('')).toBeNull()
  })
})
