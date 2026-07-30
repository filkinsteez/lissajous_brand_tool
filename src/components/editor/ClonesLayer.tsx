'use client'

import { useMemo } from 'react'
import { useStore } from '@/core/state/store'
import { getDerived } from '@/core/pipeline'
import { buildContourLevels } from '@/core/cloner/contours'
import { cloneTransforms } from '@/core/cloner/effectors'
import { INK, PAPER } from '@/core/state/defaults'

// The cloner: nested hairline offsets of the curve, drawn over the
// background — the reference's field-line register. The contours follow
// the SAME zoom + pan as the background figure, so the two registers
// stay one geometry.
export function ClonesLayer() {
  const project = useStore((s) => s.project)
  const cloner = project.cloner

  const levels = useMemo(() => {
    if (!cloner.enabled) return []
    const derived = getDerived(project)
    return buildContourLevels(
      derived.samples,
      project.artboard.width,
      project.artboard.height,
      { count: Math.round(cloner.count), spacing: cloner.spacing, growth: cloner.growth },
      {
        scale: project.background.fieldScale ?? 1,
        offsetX: project.background.fieldOffsetX ?? 0,
        offsetY: project.background.fieldOffsetY ?? 0,
      },
    )
    // getDerived is memoized on the project reference; the fields named
    // here are the ones that actually change the drawing
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    project.lissajous,
    project.artboard.width,
    project.artboard.height,
    cloner.enabled,
    cloner.count,
    cloner.spacing,
    cloner.growth,
    project.background.fieldScale,
    project.background.fieldOffsetX,
    project.background.fieldOffsetY,
  ])

  if (!cloner.enabled || !levels.length) return null

  const stroke = cloner.tone === 'ink' ? INK : PAPER
  const W = project.artboard.width
  const H = project.artboard.height
  const transforms = cloneTransforms(cloner, levels.length, Math.min(W, H), project.background.seed)

  return (
    <svg
      className="artboard-layer"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      {levels.map((level, i) => {
        const t = transforms[i]
        return (
          <g
            key={i}
            transform={`translate(${t.dx.toFixed(1)} ${t.dy.toFixed(1)}) rotate(${t.rotateDeg.toFixed(2)} ${W / 2} ${H / 2}) translate(${W / 2} ${H / 2}) scale(${t.scale.toFixed(4)}) translate(${-W / 2} ${-H / 2})`}
            opacity={t.opacity}
          >
            <path
              d={level.d}
              fill="none"
              stroke={stroke}
              strokeWidth={t.weight}
              strokeLinecap="round"
            />
          </g>
        )
      })}
    </svg>
  )
}
