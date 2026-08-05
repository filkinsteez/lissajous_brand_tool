import { beforeEach, describe, expect, it } from 'vitest'
import {
  getLabReturnTarget,
  resolveReturnImageId,
  setDesignHandoff,
  setLabHandoff,
  setLabReturnTarget,
  takeDesignHandoff,
  takeLabHandoff,
} from './handoff'

// The round trip's identity rules. sessionStorage does not exist in the
// test environment, so these exercise the in-memory path — which is the
// one a same-session navigation actually uses.

beforeEach(() => {
  setLabReturnTarget(null)
  takeLabHandoff()
  takeDesignHandoff()
})

describe('handoff channels', () => {
  it('hands over once, in the right direction', () => {
    setLabHandoff({ src: 'a', name: 'a.png', imageId: 'img-1' })
    // the design channel is separate — a lab handoff must not appear here
    expect(takeDesignHandoff()).toBeNull()
    const first = takeLabHandoff()
    expect(first?.imageId).toBe('img-1')
    // consumed exactly once
    expect(takeLabHandoff()).toBeNull()
  })

  it('carries the block rect so the lab can match its shape', () => {
    setLabHandoff({ src: 'a', name: 'a.png', imageId: 'img-1', rect: { w: 300, h: 700 } })
    expect(takeLabHandoff()?.rect).toEqual({ w: 300, h: 700 })
  })

  it('keeps the two channels independent', () => {
    setDesignHandoff({ src: 'b', name: 'b.png', imageId: 'img-2' })
    expect(takeLabHandoff()).toBeNull()
    expect(takeDesignHandoff()?.imageId).toBe('img-2')
  })
})

describe('return target is bound to the source it came from', () => {
  it('replaces while the lab is still working on that source', () => {
    setLabReturnTarget({ imageId: 'img-1', sourceHash: 'abc123' })
    expect(resolveReturnImageId('abc123')).toBe('img-1')
  })

  it('REFUSES to replace once a different image is loaded', () => {
    setLabReturnTarget({ imageId: 'img-1', sourceHash: 'abc123' })
    expect(resolveReturnImageId('deadbe')).toBeNull()
  })

  it('refuses when the lab has no source at all (curve-only work)', () => {
    setLabReturnTarget({ imageId: 'img-1', sourceHash: 'abc123' })
    expect(resolveReturnImageId(undefined)).toBeNull()
  })

  it('has no target after it is cleared', () => {
    setLabReturnTarget({ imageId: 'img-1', sourceHash: 'abc123' })
    setLabReturnTarget(null)
    expect(getLabReturnTarget()).toBeNull()
    expect(resolveReturnImageId('abc123')).toBeNull()
  })

  it('an unbound target (no hash recorded) still resolves', () => {
    setLabReturnTarget({ imageId: 'img-1' })
    expect(resolveReturnImageId('anything')).toBe('img-1')
    expect(resolveReturnImageId(undefined)).toBe('img-1')
  })
})
