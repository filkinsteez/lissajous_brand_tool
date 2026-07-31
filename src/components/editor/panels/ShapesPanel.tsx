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
        <div className="panel-heading">SHEET</div>
        <Toggle
          label="ENABLED"
          value={project.sheet.enabled}
          onChange={(enabled) => apply({ sheet: { enabled } })}
        />
        <SegmentedControl<'circle' | 'square' | 'triangle' | 'half' | 'quarter' | 'cross' | 'meta' | 'mixed'>
          label="SHAPE"
          value={project.sheet.shape}
          options={[
            { value: 'circle', label: 'CIRCLE' },
            { value: 'square', label: 'SQUARE' },
            { value: 'triangle', label: 'TRI' },
            { value: 'half', label: 'HALF' },
            { value: 'quarter', label: 'QTR' },
            { value: 'cross', label: 'CROSS' },
            { value: 'meta', label: 'META' },
            { value: 'mixed', label: 'MIX' },
          ]}
          onChange={(shape) => apply({ sheet: { shape } })}
        />
        <SegmentedControl<'grid' | 'packed'>
          label="LAYOUT"
          value={project.sheet.layout}
          options={[
            { value: 'grid', label: 'GRID' },
            { value: 'packed', label: 'PACKED' },
          ]}
          onChange={(layout) => apply({ sheet: { layout } })}
        />
        <Slider label="COUNT X" value={project.sheet.countX} min={2} max={64} step={1} format={int}
          onChange={(v) => setT({ sheet: { countX: v } })} onCommit={commit} />
        <Slider label="COUNT Y" value={project.sheet.countY} min={2} max={80} step={1} format={int}
          onChange={(v) => setT({ sheet: { countY: v } })} onCommit={commit} />
        <Slider label="LAYERS" value={project.sheet.countZ} min={1} max={3} step={1} format={int}
          onChange={(v) => setT({ sheet: { countZ: v } })} onCommit={commit} />
        <Slider label="SIZE" value={project.sheet.size} min={0.1} max={0.9} step={0.05} format={pct}
          onChange={(v) => setT({ sheet: { size: v } })} onCommit={commit} />
        <Slider label="DEPTH" value={project.sheet.depth} min={0} max={1} format={pct} defaultValue={0.35}
          onChange={(v) => setT({ sheet: { depth: v } })} onCommit={commit} />
        <Slider label="RANDOM" value={project.sheet.random} min={0} max={1} format={pct} defaultValue={0.15}
          onChange={(v) => setT({ sheet: { random: v } })} onCommit={commit} />
        <Slider label="NOISE" value={project.sheet.noise} min={0} max={1} format={pct} defaultValue={0.6}
          onChange={(v) => setT({ sheet: { noise: v } })} onCommit={commit} />
        <Slider label="STROKE MIX" value={project.sheet.strokeMix} min={0} max={1} format={pct} defaultValue={0.35}
          onChange={(v) => setT({ sheet: { strokeMix: v } })} onCommit={commit} />
        <Slider label="CURVE" value={project.sheet.curve} min={0} max={1} format={pct} defaultValue={0}
          onChange={(v) => setT({ sheet: { curve: v } })} onCommit={commit} />
        <div className="panel-note">
          The grid cloner. PACKED subdivides the grid recursively — big
          editorial cells against dense clusters. RANDOM is white jitter
          per clone; NOISE is a smooth field over the sheet, so size,
          stroke-vs-fill and shape choice vary in coherent patches. HALF
          and QTR rotate in 90° steps — truchet tiles that join into
          larger figures by accident. CURVE is the field effector: clones
          swell along the figure and flip to filled inside its lobes, so
          the mark prints itself through the sheet.
        </div>
      </div>
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
        <div className="panel-note">
          A grid of primitives whose state swaps where the curve passes —
          dot, circle, ring, square by proximity. LATTICE keeps the whole
          grid running; TRACE draws only the curve&apos;s cells.
        </div>
      </div>
    </div>
  )
}
