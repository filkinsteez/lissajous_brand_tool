import { describe, expect, it } from 'vitest'
import { createDefaultProject } from './defaults'
import { deserializeProject, serializeProject } from './serialize'
import { decodeShareHash, encodeShareHash } from './compress'

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
