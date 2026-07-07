'use client'

import { useMemo } from 'react'
import { useStore } from '@/core/state/store'
import { evalEase, figureLibrary, lissajousEasing, type MotionPreset } from '@/core/motion/spring'

const CARD_W = 120
const CARD_H = 76
const PAD_X = 8
const V_MIN = -0.35
const V_MAX = 1.35

const cx = (t: number) => PAD_X + t * (CARD_W - 2 * PAD_X)
const cy = (v: number) => CARD_H - ((v - V_MIN) / (V_MAX - V_MIN)) * CARD_H

function cardPath(lut: Float32Array): string {
  let d = `M ${cx(0).toFixed(1)} ${cy(lut[0]).toFixed(1)}`
  for (let i = 1; i < lut.length; i += 4) {
    d += ` L ${cx(i / (lut.length - 1)).toFixed(1)} ${cy(lut[i]).toFixed(1)}`
  }
  return d
}

// The current figure as a wall of position-vs-time charts: its distinct
// arches, the picked arch's ramps and pushes, and its value read. Every
// path is an arc of THE figure on the panel; click a card to load it.
export function EasingLibrary({ p }: { p: number }) {
  const ml = useStore((s) => s.project.motionLab)
  const apply = useStore((s) => s.apply)

  const cards = useMemo(
    () =>
      figureLibrary(ml.ratioX, ml.ratioY, ml.phase, ml.lobe).map((row) => ({
        family: row.family,
        variants: row.variants.map((v) => ({
          recipe: v,
          lut: lissajousEasing(v).lut,
        })),
      })),
    [ml.ratioX, ml.ratioY, ml.phase, ml.lobe],
  )

  const isActive = (r: MotionPreset) =>
    ml.read === r.read &&
    ml.lobe === (r.lobe ?? -1) &&
    ml.reverse === !!r.reverse &&
    ml.half === (r.half ?? 'full') &&
    Math.abs(ml.strength - (r.strength ?? 0)) < 1e-6 &&
    Math.abs(ml.decay - (r.decay ?? 0)) < 1e-6

  const load = (r: MotionPreset) =>
    apply({
      motionLab: {
        ratioX: r.ratioX, ratioY: r.ratioY, phase: r.phase, read: r.read,
        reverse: !!r.reverse, strength: r.strength ?? 0, decay: r.decay ?? 0,
        lobe: r.lobe ?? -1, half: r.half ?? 'full', presetId: undefined,
      },
    })

  return (
    <div className="lane">
      <div className="lane-label">
        EASING LIBRARY — EVERY PATH IS AN ARC OF THE {ml.ratioX}:{ml.ratioY} FIGURE
      </div>
      <div className="lib-grid" data-testid="easing-library">
        {cards.map((row) => (
          <div key={row.family} className="lib-row">
            <span className="lib-family">{row.family}</span>
            {row.variants.map(({ recipe, lut }) => (
              <button
                key={recipe.id}
                className={isActive(recipe) ? 'lib-card active' : 'lib-card'}
                data-testid={`lib-${recipe.id}`}
                onClick={() => load(recipe)}
              >
                <svg viewBox={`0 0 ${CARD_W} ${CARD_H}`} className="lib-svg">
                  <line x1={PAD_X} y1={cy(0)} x2={CARD_W - PAD_X} y2={cy(0)} className="lane-rule" />
                  <line x1={PAD_X} y1={cy(1)} x2={CARD_W - PAD_X} y2={cy(1)} className="lane-rule" />
                  <path d={cardPath(lut)} className="lib-path" />
                  <circle cx={cx(p)} cy={cy(evalEase(lut, p))} r={3} className="lane-dot" />
                </svg>
                <span className="lib-label">{recipe.label}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
