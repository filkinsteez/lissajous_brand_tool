'use client'

import { useStore } from '@/core/state/store'
import { Slider } from '@/components/controls/Slider'
import { SegmentedControl } from '@/components/controls/SegmentedControl'
import { Toggle } from '@/components/controls/Toggle'

const pct = (v: number) => `${Math.round(v * 100)}`
const int = (v: number) => String(Math.round(v))

// The SHAPES panel: the procedural registers drawn from the curve —
// CLONES (nested contour offsets with C4D-style effectors) and PATTERN
// (a lattice of primitives whose state changes where the curve passes).
export function ShapesPanel() {
  const project = useStore((s) => s.project)
  const apply = useStore((s) => s.apply)
  const setT = useStore((s) => s.setTransient)
  const commit = useStore((s) => s.commitTransient)

  return (
    <div className="panel">
      <div className="panel-section">
        <div className="panel-heading">CLONES</div>
        <Toggle
          label="ENABLED"
          value={project.cloner.enabled}
          onChange={(enabled) => apply({ cloner: { enabled } })}
        />
        <Slider label="COUNT" value={project.cloner.count} min={1} max={14} step={1} format={int}
          onChange={(v) => setT({ cloner: { count: v } })} onCommit={commit} />
        <Slider label="SPACING" value={project.cloner.spacing} min={0.01} max={0.16} step={0.005} format={pct}
          onChange={(v) => setT({ cloner: { spacing: v } })} onCommit={commit} />
        <Slider label="GROWTH" value={project.cloner.growth} min={1} max={2.2} step={0.05} format={pct}
          onChange={(v) => setT({ cloner: { growth: v } })} onCommit={commit} />
        <Slider label="WEIGHT" value={project.cloner.weight} min={0.5} max={4} step={0.25}
          format={(v) => `${v.toFixed(2)}px`}
          onChange={(v) => setT({ cloner: { weight: v } })} onCommit={commit} />
        <SegmentedControl<'paper' | 'ink'>
          label="TONE"
          value={project.cloner.tone}
          options={[
            { value: 'paper', label: 'PAPER' },
            { value: 'ink', label: 'INK' },
          ]}
          onChange={(tone) => apply({ cloner: { tone } })}
        />
        <div className="ctl-sub-label">EFFECTORS</div>
        <Slider label="STEP" value={project.cloner.step} min={0} max={1} format={pct} defaultValue={0}
          onChange={(v) => setT({ cloner: { step: v } })} onCommit={commit} />
        <Slider label="RANDOM" value={project.cloner.random} min={0} max={1} format={pct} defaultValue={0}
          onChange={(v) => setT({ cloner: { random: v } })} onCommit={commit} />
        <Slider label="DEPTH" value={project.cloner.depth} min={0} max={1} format={pct} defaultValue={0}
          onChange={(v) => setT({ cloner: { depth: v } })} onCommit={commit} />
        <div className="panel-note">
          Nested hairline offsets of the curve — contour lines of its own
          distance field. STEP fades the family progressively, RANDOM adds
          seeded drift and tilt per clone, DEPTH stacks them as 2.5D
          planes with parallax. All ride the field&apos;s SCALE and PAN.
        </div>
      </div>
      <div className="panel-section">
        <div className="panel-heading">PATTERN</div>
        <Toggle
          label="ENABLED"
          value={project.pattern.enabled}
          onChange={(enabled) => apply({ pattern: { enabled } })}
        />
        <SegmentedControl<'lattice' | 'trace'>
          label="MODE"
          value={project.pattern.mode}
          options={[
            { value: 'lattice', label: 'LATTICE' },
            { value: 'trace', label: 'TRACE' },
          ]}
          onChange={(mode) => apply({ pattern: { mode } })}
        />
        <Slider label="CELLS" value={project.pattern.cells} min={12} max={64} step={1} format={int}
          onChange={(v) => setT({ pattern: { cells: v } })} onCommit={commit} />
        <Slider label="SIZE" value={project.pattern.size} min={0.2} max={1} step={0.05} format={pct}
          onChange={(v) => setT({ pattern: { size: v } })} onCommit={commit} />
        <Slider label="RANGE" value={project.pattern.range} min={0.5} max={4} step={0.1} format={pct}
          onChange={(v) => setT({ pattern: { range: v } })} onCommit={commit} />
        <SegmentedControl<'paper' | 'ink'>
          label="TONE"
          value={project.pattern.tone}
          options={[
            { value: 'paper', label: 'PAPER' },
            { value: 'ink', label: 'INK' },
          ]}
          onChange={(tone) => apply({ pattern: { tone } })}
        />
        <div className="panel-note">
          A grid of primitives whose state swaps where the curve passes —
          dot, circle, ring, square by proximity. LATTICE keeps the whole
          grid running; TRACE draws only the curve&apos;s cells.
        </div>
      </div>
    </div>
  )
}
