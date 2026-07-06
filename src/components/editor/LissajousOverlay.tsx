'use client'

import { useMemo, useState } from 'react'
import { useStore } from '@/core/state/store'
import { getDerived } from '@/core/pipeline'

// L5 construction overlay. Setup mode: faint curve, intersection nodes,
// derived guides, hover cross-highlighting, click-to-select nodes.
// Compose mode (guides enabled): guides only — the curve stays hidden.
export function LissajousOverlay() {
  const project = useStore((s) => s.project)
  const mode = useStore((s) => s.ui.mode)
  const systemAdjusting = useStore((s) => s.ui.systemAdjusting)
  const dragging = useStore((s) => s.ui.dragging)
  const apply = useStore((s) => s.apply)
  const [hover, setHover] = useState<{ kind: 'node' | 'guide'; id: number | string } | null>(null)

  const { width: W, height: H } = project.artboard
  const derived = getDerived(project)
  const isSetup = mode === 'setup'
  // the curve is the backbone: it surfaces during ANY adjustment — system
  // sliders or dragging things on the compose canvas — not only in setup
  const showCurve = isSetup || systemAdjusting || dragging

  const curvePath = useMemo(() => {
    const pts = derived.samples
    const step = Math.max(1, Math.floor((pts.length - 1) / 900))
    let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
    for (let i = step; i < pts.length; i += step) {
      d += ` L ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`
    }
    return d + ' Z'
  }, [derived.samples])

  const guides = [...derived.grid.columnBoundaries, ...derived.grid.rowBoundaries]
  const box = derived.grid.contentBox
  const selectedIds = project.grid.selectedNodeIds

  const hoveredNodeId = hover?.kind === 'node' ? (hover.id as number) : null
  const hoveredGuide = hover?.kind === 'guide' ? guides.find((g) => g.id === hover.id) : null

  const toggleNode = (id: number) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((v) => v !== id)
      : [...selectedIds, id]
    apply({ grid: { selectedNodeIds: next } })
  }

  return (
    <svg
      className="artboard-layer overlay"
      viewBox={`0 0 ${W} ${H}`}
      data-testid="lissajous-overlay"
    >
      {/* margins */}
      <rect
        x={box.x} y={box.y} width={box.w} height={box.h}
        fill="none" stroke="var(--overlay-line)" strokeWidth={1.5}
      />

      {/* derived guides */}
      {guides.map((g) => {
        const emphasized =
          hover?.id === g.id ||
          (hoveredNodeId !== null && g.sources.includes(hoveredNodeId))
        return (
          <line
            key={g.id}
            x1={g.axis === 'x' ? g.pos : box.x}
            x2={g.axis === 'x' ? g.pos : box.x + box.w}
            y1={g.axis === 'y' ? g.pos : box.y}
            y2={g.axis === 'y' ? g.pos : box.y + box.h}
            stroke={emphasized ? 'var(--overlay-strong)' : 'var(--overlay-line)'}
            strokeWidth={emphasized ? 2.5 : 1.5}
            onMouseEnter={isSetup ? () => setHover({ kind: 'guide', id: g.id }) : undefined}
            onMouseLeave={isSetup ? () => setHover(null) : undefined}
          />
        )
      })}

      {showCurve ? (
        /* the curve itself: construction geometry, low opacity */
        <path d={curvePath} fill="none" stroke="var(--overlay-curve)" strokeWidth={2} />
      ) : null}

      {isSetup ? (
        <>
          {/* intersection nodes */}
          {derived.ranked.map((n) => {
            const isPrimary = derived.primary.some((p) => p.id === n.id)
            const isSelected = selectedIds.includes(n.id)
            const emphasized =
              hoveredNodeId === n.id ||
              (hoveredGuide ? hoveredGuide.sources.includes(n.id) : false)
            const r = 6 + n.score * 10
            return (
              <g
                key={n.id}
                onMouseEnter={() => setHover({ kind: 'node', id: n.id })}
                onMouseLeave={() => setHover(null)}
                onClick={() => toggleNode(n.id)}
                style={{ cursor: 'pointer' }}
              >
                <circle cx={n.x} cy={n.y} r={r + 10} fill="transparent" />
                <line x1={n.x - r} y1={n.y} x2={n.x + r} y2={n.y}
                  stroke={emphasized || isSelected ? 'var(--overlay-node-strong)' : 'var(--overlay-node)'}
                  strokeWidth={emphasized ? 3 : 1.5} />
                <line x1={n.x} y1={n.y - r} x2={n.x} y2={n.y + r}
                  stroke={emphasized || isSelected ? 'var(--overlay-node-strong)' : 'var(--overlay-node)'}
                  strokeWidth={emphasized ? 3 : 1.5} />
                {isSelected ? (
                  <circle cx={n.x} cy={n.y} r={r} fill="none"
                    stroke="var(--overlay-node-strong)" strokeWidth={2} />
                ) : null}
                {isPrimary && !isSelected ? (
                  <circle cx={n.x} cy={n.y} r={2.5} fill="var(--overlay-node)" />
                ) : null}
              </g>
            )
          })}
        </>
      ) : null}
    </svg>
  )
}
