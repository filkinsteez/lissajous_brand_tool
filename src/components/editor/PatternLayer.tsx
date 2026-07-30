'use client'

import { useMemo } from 'react'
import { useStore } from '@/core/state/store'
import { getDerived } from '@/core/pipeline'
import { buildLattice } from '@/core/pattern/lattice'
import { INK, PAPER } from '@/core/state/defaults'

// The lattice register: primitives on a grid, state swapped where the
// curve passes. Rides the background's zoom + pan like every register.
export function PatternLayer() {
  const project = useStore((s) => s.project)
  const pattern = project.pattern

  const tiers = useMemo(() => {
    if (!pattern.enabled) return null
    const derived = getDerived(project)
    return buildLattice(
      derived.samples,
      project.artboard.width,
      project.artboard.height,
      { cells: pattern.cells, size: pattern.size, range: pattern.range, mode: pattern.mode },
      {
        scale: project.background.fieldScale ?? 1,
        offsetX: project.background.fieldOffsetX ?? 0,
        offsetY: project.background.fieldOffsetY ?? 0,
      },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    project.lissajous,
    project.artboard.width,
    project.artboard.height,
    pattern.enabled,
    pattern.cells,
    pattern.size,
    pattern.range,
    pattern.mode,
    project.background.fieldScale,
    project.background.fieldOffsetX,
    project.background.fieldOffsetY,
  ])

  if (!pattern.enabled || !tiers) return null

  const tone = pattern.tone === 'ink' ? INK : PAPER

  return (
    <svg
      className="artboard-layer"
      viewBox={`0 0 ${project.artboard.width} ${project.artboard.height}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      {tiers.dots ? <path d={tiers.dots} fill={tone} opacity={0.45} /> : null}
      {tiers.circles ? <path d={tiers.circles} fill={tone} opacity={0.8} /> : null}
      {tiers.rings ? (
        <path d={tiers.rings} fill="none" stroke={tone} strokeWidth={2} opacity={0.95} />
      ) : null}
      {tiers.squares ? <path d={tiers.squares} fill={tone} /> : null}
    </svg>
  )
}
