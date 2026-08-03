import { describe, expect, it } from 'vitest'
import { cycleHit, marqueeHits, moveAmong, normalizeRect, nudgeAnchor, toggleId } from './selection'

const blocks = [
  { id: 'a', rect: { x: 0, y: 0, w: 100, h: 40 } },
  { id: 'b', rect: { x: 200, y: 0, w: 100, h: 40 } },
  { id: 'c', rect: { x: 0, y: 200, w: 100, h: 40 } },
]

describe('marquee selection', () => {
  it('normalizes rects dragged in any direction', () => {
    expect(normalizeRect(120, 90, 20, 10)).toEqual({ x: 20, y: 10, w: 100, h: 80 })
  })

  it('selects everything the band touches, not only what it encloses', () => {
    // clips the corner of a and stops short of b
    expect(marqueeHits(blocks, { x: 90, y: 30, w: 60, h: 60 })).toEqual(['a'])
    // spans across a and b
    expect(marqueeHits(blocks, { x: 50, y: 10, w: 200, h: 20 })).toEqual(['a', 'b'])
    // empty region selects nothing
    expect(marqueeHits(blocks, { x: 120, y: 100, w: 40, h: 40 })).toEqual([])
  })

  it('additive marquee unions with the existing selection without duplicates', () => {
    expect(marqueeHits(blocks, { x: 50, y: 10, w: 200, h: 20 }, ['c', 'a'])).toEqual([
      'c',
      'a',
      'b',
    ])
  })

  it('shift-click toggles membership', () => {
    expect(toggleId(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleId(['a', 'b'], 'a')).toEqual(['b'])
  })
})

describe('cycleHit', () => {
  it('selects the topmost first, then walks down the stack and wraps', () => {
    const stack = ['top', 'mid', 'bottom']
    expect(cycleHit(stack, undefined)).toBe('top')
    expect(cycleHit(stack, 'nothere')).toBe('top')
    expect(cycleHit(stack, 'top')).toBe('mid')
    expect(cycleHit(stack, 'mid')).toBe('bottom')
    expect(cycleHit(stack, 'bottom')).toBe('top')
    expect(cycleHit([], 'x')).toBeUndefined()
  })
})

describe('moveAmong', () => {
  const arr = ['bg', 'a', 'arr-x', 'b', 'c']
  const isMember = (s: string) => s !== 'bg' && !s.startsWith('arr-')

  it('trades places with the next member, hopping non-members', () => {
    expect(moveAmong(arr, isMember, (s) => s === 'a', 1)).toEqual(['bg', 'b', 'arr-x', 'a', 'c'])
    expect(moveAmong(arr, isMember, (s) => s === 'c', -1)).toEqual(['bg', 'a', 'arr-x', 'c', 'b'])
  })

  it('clamps at the ends and ignores non-members', () => {
    expect(moveAmong(arr, isMember, (s) => s === 'c', 1)).toEqual(arr)
    expect(moveAmong(arr, isMember, (s) => s === 'a', -1)).toEqual(arr)
    expect(moveAmong(arr, isMember, (s) => s === 'bg', 1)).toEqual(arr)
  })
})

describe('nudgeAnchor', () => {
  const anchor = { col: 2, row: 3, colSpan: 2, baselineOffset: 0 }

  it('moves one column horizontally and clamps at the edges', () => {
    expect(nudgeAnchor(anchor, 'left', 6).col).toBe(1)
    expect(nudgeAnchor(anchor, 'right', 6).col).toBe(3)
    expect(nudgeAnchor({ ...anchor, col: 0 }, 'left', 6).col).toBe(0)
    expect(nudgeAnchor({ ...anchor, col: 5 }, 'right', 6).col).toBe(5)
  })

  it('moves in baseline steps vertically, big nudge = 4', () => {
    expect(nudgeAnchor(anchor, 'down', 6).baselineOffset).toBe(1)
    expect(nudgeAnchor(anchor, 'up', 6).baselineOffset).toBe(-1)
    expect(nudgeAnchor(anchor, 'down', 6, true).baselineOffset).toBe(4)
    // missing offset reads as zero
    expect(nudgeAnchor({ col: 0, row: 0, colSpan: 1 }, 'up', 6).baselineOffset).toBe(-1)
  })
})
