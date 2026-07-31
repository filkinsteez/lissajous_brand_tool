'use client'

import { useRef } from 'react'
import { useStore } from '@/core/state/store'
import { Slider } from '@/components/controls/Slider'
import { SegmentedControl } from '@/components/controls/SegmentedControl'
import { Toggle } from '@/components/controls/Toggle'
import { importImageFile } from '@/core/images'

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

  // array assets live in project.images with an arr- prefix: available to
  // the array register, invisible to the grid's image blocks
  const arrayFileRef = useRef<HTMLInputElement>(null)
  const addArrayAsset = async (files: FileList | null) => {
    if (!files?.length) return
    try {
      const src = await importImageFile(files[0])
      const id = `arr-${Date.now().toString(36)}`
      apply({
        images: [...project.images, { id, src, anchor: { col: 0, row: 0, colSpan: 1, rowSpan: 1 } }],
        imageArray: { imageId: id, enabled: true },
      })
    } catch {
      // unreadable file — skip it
    }
  }

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
        <div className="panel-heading">ARRAY</div>
        <Toggle
          label="ENABLED"
          value={project.imageArray.enabled}
          onChange={(enabled) => apply({ imageArray: { enabled } })}
        />
        <input
          ref={arrayFileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            void addArrayAsset(e.target.files)
            e.target.value = ''
          }}
        />
        <button className="ctl-action" onClick={() => arrayFileRef.current?.click()}>
          ADD IMAGE
        </button>
        {project.images.length ? (
          <div className="thumb-strip">
            {project.images.map((im) => (
              <div key={im.id} className="thumb-wrap">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={im.src}
                  alt=""
                  className={
                    (project.imageArray.imageId ?? project.images[0]?.id) === im.id
                      ? 'img-thumb bg-active'
                      : 'img-thumb'
                  }
                  onClick={() => apply({ imageArray: { imageId: im.id } })}
                />
                {im.id.startsWith('arr-') ? (
                  <button
                    className="thumb-remove"
                    aria-label="Remove array image"
                    onClick={() =>
                      apply({
                        images: project.images.filter((x) => x.id !== im.id),
                        imageArray: {
                          imageId: project.imageArray.imageId === im.id ? null : project.imageArray.imageId,
                        },
                      })
                    }
                  >
                    ×
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        <Slider label="CELLS" value={project.imageArray.cells} min={16} max={96} step={1} format={int}
          onChange={(v) => setT({ imageArray: { cells: v } })} onCommit={commit} />
        <Slider label="SIZE" value={project.imageArray.size} min={0.2} max={1} step={0.05} format={pct}
          onChange={(v) => setT({ imageArray: { size: v } })} onCommit={commit} />
        <Slider label="THRESHOLD" value={project.imageArray.threshold} min={0.1} max={1} step={0.02} format={pct}
          onChange={(v) => setT({ imageArray: { threshold: v } })} onCommit={commit} />
        <Slider label="BLEND" value={project.imageArray.blend} min={0} max={1} format={pct} defaultValue={0}
          onChange={(v) => setT({ imageArray: { blend: v } })} onCommit={commit} />
        <Toggle
          label="INVERT"
          value={project.imageArray.invert}
          onChange={(invert) => apply({ imageArray: { invert } })}
        />
        <div className="panel-note">
          An image re-drawn as a glyph array: darkness picks the mark
          (squares and crosses in the depths, circles and rings in the
          mids, dots at the edge), color deals from the palette, and
          BLEND pulls the glyphs toward the image&apos;s own color — graphic
          array at 0, image mosaic at 100. ADD IMAGE keeps the asset
          array-only; images placed on the grid work too.
        </div>
      </div>
      <div className="panel-section">
        <div className="panel-heading">REPEATER</div>
        <Toggle
          label="ENABLED"
          value={project.repeater.enabled}
          onChange={(enabled) => apply({ repeater: { enabled } })}
        />
        <SegmentedControl<'linear' | 'radial' | 'grid'>
          label="MODE"
          value={project.repeater.mode}
          options={[
            { value: 'linear', label: 'LINEAR' },
            { value: 'radial', label: 'RADIAL' },
            { value: 'grid', label: 'GRID' },
          ]}
          onChange={(mode) => apply({ repeater: { mode } })}
        />
        <SegmentedControl<'circle' | 'square' | 'triangle' | 'half' | 'quarter' | 'cross' | 'meta' | 'mixed'>
          label="SHAPE"
          value={project.repeater.shape}
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
          onChange={(shape) => apply({ repeater: { shape } })}
        />
        {project.repeater.mode === 'grid' ? (
          <>
            <Slider label="COUNT X" value={project.repeater.countX} min={2} max={12} step={1} format={int}
              onChange={(v) => setT({ repeater: { countX: v } })} onCommit={commit} />
            <Slider label="COUNT Y" value={project.repeater.countY} min={2} max={12} step={1} format={int}
              onChange={(v) => setT({ repeater: { countY: v } })} onCommit={commit} />
          </>
        ) : (
          <Slider label="COUNT" value={project.repeater.count} min={2} max={48} step={1} format={int}
            onChange={(v) => setT({ repeater: { count: v } })} onCommit={commit} />
        )}
        <Slider label="SIZE" value={project.repeater.size} min={0.02} max={0.3} step={0.005} format={pct}
          onChange={(v) => setT({ repeater: { size: v } })} onCommit={commit} />
        <Slider label="ORIGIN X" value={project.repeater.originX} min={0} max={1} step={0.01} format={pct} defaultValue={0.5}
          onChange={(v) => setT({ repeater: { originX: v } })} onCommit={commit} />
        <Slider label="ORIGIN Y" value={project.repeater.originY} min={0} max={1} step={0.01} format={pct} defaultValue={0.5}
          onChange={(v) => setT({ repeater: { originY: v } })} onCommit={commit} />
        {project.repeater.mode !== 'radial' ? (
          <>
            <Slider label="STEP X" value={project.repeater.stepX} min={-0.2} max={0.2} step={0.005} format={pct} defaultValue={0.05}
              onChange={(v) => setT({ repeater: { stepX: v } })} onCommit={commit} />
            <Slider label="STEP Y" value={project.repeater.stepY} min={-0.2} max={0.2} step={0.005} format={pct} defaultValue={0.035}
              onChange={(v) => setT({ repeater: { stepY: v } })} onCommit={commit} />
          </>
        ) : (
          <>
            <Slider label="RADIUS" value={project.repeater.radius} min={0.05} max={0.6} step={0.01} format={pct}
              onChange={(v) => setT({ repeater: { radius: v } })} onCommit={commit} />
            <Slider label="SPAN" value={project.repeater.span} min={Math.PI / 6} max={Math.PI * 2} step={Math.PI / 36}
              format={(v) => `${Math.round((v * 180) / Math.PI)}°`}
              onChange={(v) => setT({ repeater: { span: v } })} onCommit={commit} />
          </>
        )}
        <Slider label="ROTATE" value={project.repeater.rotate} min={-Math.PI / 4} max={Math.PI / 4} step={Math.PI / 180}
          format={(v) => `${Math.round((v * 180) / Math.PI)}°`} defaultValue={0}
          onChange={(v) => setT({ repeater: { rotate: v } })} onCommit={commit} />
        <Slider label="SCALE STEP" value={project.repeater.scaleStep} min={0.7} max={1.3} step={0.01} format={pct} defaultValue={1}
          onChange={(v) => setT({ repeater: { scaleStep: v } })} onCommit={commit} />
        <Slider label="FADE" value={project.repeater.fade} min={0} max={1} format={pct} defaultValue={0.2}
          onChange={(v) => setT({ repeater: { fade: v } })} onCommit={commit} />
        <Toggle
          label="STROKE"
          value={project.repeater.stroked}
          onChange={(stroked) => apply({ repeater: { stroked } })}
        />
        <div className="panel-note">
          One seed shape echoed with an accumulating step — offset, turn
          and scale compound per copy. LINEAR makes cascades and echo
          trails; RADIAL makes fans and rosettes, each copy riding its
          spoke; GRID lays a lattice around the origin with STEP as cell
          spacing, the turn and scale sweeping in reading order. FADE
          ramps the family out.
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
