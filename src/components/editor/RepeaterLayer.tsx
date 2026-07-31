'use client'

import { useMemo } from 'react'
import { useStore } from '@/core/state/store'
import { buildRepeats } from '@/core/repeater/repeater'
import type { SheetClone } from '@/core/sheet/sheet'
import { shapeD, metaGlyphD } from './SheetLayer'
import { PAPER } from '@/core/state/defaults'

// The repeater drawn as SVG — same painters as the sheet, so the two
// registers stay one drawing language. Meta glyphs instance a private
// def (the sheet's may not be mounted).
export function RepeaterLayer() {
  const project = useStore((s) => s.project)
  const rep = project.repeater

  const clones = useMemo(() => {
    if (!rep.enabled) return null
    return buildRepeats(rep, project.artboard.width, project.artboard.height)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rep, project.artboard.width, project.artboard.height])

  if (!rep.enabled || !clones) return null

  const strokeW = Math.max(
    1.5,
    Math.min(project.artboard.width, project.artboard.height) * 0.0035,
  )
  const metas: SheetClone[] = []
  let filledD = ''
  let strokedD = ''
  for (const c of clones) {
    if (c.shape === 'meta') {
      metas.push(c)
      continue
    }
    if (c.stroked) strokedD += shapeD(c)
    else filledD += shapeD(c)
  }
  // per-clone opacity varies (FADE), so batched paths only work when the
  // fade is flat — otherwise draw individually
  const flatFade = rep.fade < 0.01

  return (
    <svg
      className="artboard-layer shape-layer"
      viewBox={`0 0 ${project.artboard.width} ${project.artboard.height}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <path id="repeater-meta-glyph" d={metaGlyphD()} />
      </defs>
      {flatFade ? (
        <>
          {filledD ? <path d={filledD} fill={PAPER} fillRule="evenodd" /> : null}
          {strokedD ? (
            <path d={strokedD} fill="none" stroke={PAPER} strokeWidth={strokeW} />
          ) : null}
        </>
      ) : (
        clones
          .filter((c) => c.shape !== 'meta')
          .map((c, i) => (
            <path
              key={i}
              d={shapeD(c)}
              fill={c.stroked ? 'none' : PAPER}
              stroke={c.stroked ? PAPER : 'none'}
              strokeWidth={c.stroked ? strokeW : undefined}
              opacity={c.opacity}
              fillRule="evenodd"
            />
          ))
      )}
      {metas.map((c, i) => (
        <use
          key={i}
          href="#repeater-meta-glyph"
          fill="none"
          stroke={PAPER}
          strokeWidth={strokeW / Math.max(c.r, 0.5)}
          opacity={c.opacity}
          transform={`translate(${c.x.toFixed(1)} ${c.y.toFixed(1)}) rotate(${((c.rotate * 180) / Math.PI).toFixed(1)}) scale(${c.r.toFixed(2)})`}
        />
      ))}
    </svg>
  )
}
