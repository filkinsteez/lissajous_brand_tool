'use client'

import { useStore } from '@/core/state/store'
import { Slider } from '@/components/controls/Slider'
import { SegmentedControl } from '@/components/controls/SegmentedControl'
import { TextField } from '@/components/controls/TextField'
import { Toggle } from '@/components/controls/Toggle'
import type { GlyphFieldMode, GlyphOrientation } from '@/core/state/types'

const pct = (v: number) => `${Math.round(v * 100)}`
const int = (v: number) => String(Math.round(v))

export function GlyphFieldPanel() {
  const gf = useStore((s) => s.project.glyphField)
  const apply = useStore((s) => s.apply)
  const setT = useStore((s) => s.setTransient)
  const commit = useStore((s) => s.commitTransient)

  return (
    <div className="panel">
      <div className="panel-section">
        <Toggle label="GLYPH FIELD" value={gf.enabled}
          onChange={(enabled) => apply({ glyphField: { enabled } })} />
        <TextField label="SOURCE TEXT" value={gf.sourceText}
          onChange={(sourceText) => setT({ glyphField: { sourceText } })} onCommit={commit} />
        <TextField label="CHARACTER SET (OPTIONAL)" value={gf.charset}
          onChange={(charset) => setT({ glyphField: { charset } })} onCommit={commit} />
      </div>
      <div className="panel-section">
        <SegmentedControl<GlyphFieldMode>
          label="MODE"
          value={gf.mode}
          options={[
            { value: 'sparse', label: 'SPARSE' },
            { value: 'dense', label: 'DENSE' },
            { value: 'verticalStream', label: 'STREAM' },
            { value: 'fieldContour', label: 'CONTOUR' },
          ]}
          onChange={(mode) => apply({ glyphField: { mode } })}
        />
        <SegmentedControl<GlyphOrientation>
          label="ORIENTATION"
          value={gf.orientation}
          options={[
            { value: 'grid', label: 'GRID' },
            { value: 'tangent', label: 'TANGENT' },
            { value: 'normal', label: 'NORMAL' },
            { value: 'mixed', label: 'MIXED' },
          ]}
          onChange={(orientation) => apply({ glyphField: { orientation } })}
        />
      </div>
      <div className="panel-section">
        <Slider label="DENSITY" value={gf.density} min={0} max={1} format={pct}
          onChange={(density) => setT({ glyphField: { density } })} onCommit={commit} />
        <Slider label="CONTRAST" value={gf.contrast} min={0} max={1} format={pct}
          onChange={(contrast) => setT({ glyphField: { contrast } })} onCommit={commit} />
        <Slider label="SCALE" value={gf.scale} min={8} max={64} step={1} format={int}
          onChange={(scale) => setT({ glyphField: { scale } })} onCommit={commit} />
        <SegmentedControl
          label="SIZE LEVELS"
          value={String(gf.sizeLevels)}
          options={[
            { value: '1', label: 'ONE' },
            { value: '2', label: 'TWO' },
            { value: '3', label: 'THREE' },
          ]}
          onChange={(v) => apply({ glyphField: { sizeLevels: Number(v) } })}
        />
        <Slider label="TRACKING" value={gf.tracking} min={-0.1} max={0.8} step={0.01}
          format={(v) => v.toFixed(2)}
          onChange={(tracking) => setT({ glyphField: { tracking } })} onCommit={commit} />
        <Slider label="LINE RHYTHM" value={gf.lineRhythm} min={0.7} max={2.4} step={0.02}
          format={(v) => v.toFixed(2)}
          onChange={(lineRhythm) => setT({ glyphField: { lineRhythm } })} onCommit={commit} />
        <Slider label="PRESSURE" value={gf.pressureResponse} min={0} max={1} format={pct}
          onChange={(pressureResponse) => setT({ glyphField: { pressureResponse } })} onCommit={commit} />
        <Slider label="RANDOMNESS" value={gf.randomness} min={0} max={1} format={pct}
          onChange={(randomness) => setT({ glyphField: { randomness } })} onCommit={commit} />
        <Slider label="SEED" value={gf.seedOffset} min={0} max={64} step={1} format={int}
          onChange={(seedOffset) => setT({ glyphField: { seedOffset } })} onCommit={commit} />
      </div>
      <div className="panel-section">
        <Toggle label="OVERPRINT" value={gf.overprint}
          onChange={(overprint) => apply({ glyphField: { overprint } })} />
      </div>
    </div>
  )
}
