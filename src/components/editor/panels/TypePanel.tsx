'use client'

import { useStore } from '@/core/state/store'
import { Slider } from '@/components/controls/Slider'
import { SegmentedControl } from '@/components/controls/SegmentedControl'
import { TextField } from '@/components/controls/TextField'
import { ColorField } from '@/components/controls/ColorField'
import { Toggle } from '@/components/controls/Toggle'
import { FONT_LABELS } from '@/core/typography/fonts'
import { INK, PAPER } from '@/core/state/defaults'
import { getDerived } from '@/core/pipeline'
import type { FontFamilyId, TypeAlign, TypeBlockState } from '@/core/state/types'

const int = (v: number) => String(Math.round(v))
const em = (v: number) => v.toFixed(2)

export function TypePanel() {
  const project = useStore((s) => s.project)
  const selectedBlockId = useStore((s) => s.ui.selectedBlockId)
  const setUi = useStore((s) => s.setUi)
  const setT = useStore((s) => s.setTransient)
  const commit = useStore((s) => s.commitTransient)

  const blocks = project.typeBlocks
  const block = blocks.find((b) => b.id === selectedBlockId) ?? blocks[0]
  const grid = getDerived(project).grid
  const nCols = grid.columnBoundaries.length - 1
  const nRows = grid.rowBoundaries.length - 1

  if (!block) return null

  const patchBlock = (patch: Partial<TypeBlockState>) => {
    setT({ typeBlocks: blocks.map((b) => (b.id === block.id ? { ...b, ...patch } : b)) })
  }
  const patchAnchor = (patch: Partial<TypeBlockState['anchor']>) => {
    patchBlock({ anchor: { ...block.anchor, ...patch } })
  }

  return (
    <div className="panel">
      <div className="panel-section">
        <SegmentedControl
          value={block.id}
          options={blocks.map((b) => ({ value: b.id, label: b.role.toUpperCase() }))}
          onChange={(id) => setUi({ selectedBlockId: id })}
        />
        <TextField label="TEXT" value={block.text} multiline={block.role !== 'metadata'}
          onChange={(text) => patchBlock({ text })} onCommit={commit} />
      </div>
      <div className="panel-section">
        <SegmentedControl<FontFamilyId>
          label="FAMILY"
          value={block.fontFamily}
          options={(Object.keys(FONT_LABELS) as FontFamilyId[]).map((f) => ({ value: f, label: FONT_LABELS[f] }))}
          onChange={(fontFamily) => { patchBlock({ fontFamily }); commit() }}
        />
        <Slider label="SIZE" value={block.size} min={10} max={400} step={1} format={int}
          onChange={(size) => patchBlock({ size })} onCommit={commit} />
        <Slider label="WEIGHT" value={block.weight} min={100} max={1000} step={10} format={int}
          onChange={(weight) => patchBlock({ weight })} onCommit={commit} />
        <Slider label="WIDTH" value={block.width} min={25} max={151} step={1} format={int}
          onChange={(width) => patchBlock({ width })} onCommit={commit} />
        <Slider label="OPTICAL" value={block.opticalSize} min={8} max={144} step={1} format={int}
          onChange={(opticalSize) => patchBlock({ opticalSize })} onCommit={commit} />
        <Slider label="LEADING" value={block.lineHeight} min={0.8} max={2} step={0.02} format={em}
          onChange={(lineHeight) => patchBlock({ lineHeight })} onCommit={commit} />
        <Slider label="TRACKING" value={block.tracking} min={-0.08} max={0.4} step={0.005} format={em}
          onChange={(tracking) => patchBlock({ tracking })} onCommit={commit} />
      </div>
      <div className="panel-section">
        <SegmentedControl<TypeAlign>
          label="ALIGN"
          value={block.align}
          options={[
            { value: 'left', label: 'LEFT' },
            { value: 'center', label: 'CENTER' },
            { value: 'right', label: 'RIGHT' },
          ]}
          onChange={(align) => { patchBlock({ align }); commit() }}
        />
      </div>
      <div className="panel-section">
        <div className="panel-heading">STYLE</div>
        <ColorField label="COLOR" value={block.color ?? INK}
          onChange={(color) => { patchBlock({ color }); commit() }} />
        <Slider label="STROKE" value={block.strokeWidth ?? 0} min={0} max={4} step={0.5}
          format={(v) => `${v.toFixed(1)}px`}
          onChange={(strokeWidth) => patchBlock({ strokeWidth })} onCommit={commit} />
        {(block.strokeWidth ?? 0) > 0 ? (
          <ColorField label="STROKE CLR" value={block.strokeColor ?? INK}
            onChange={(strokeColor) => { patchBlock({ strokeColor }); commit() }} />
        ) : null}
        <Toggle label="BACKGROUND" value={block.background != null}
          onChange={(on) => { patchBlock({ background: on ? PAPER : undefined }); commit() }} />
        {block.background != null ? (
          <ColorField label="BG COLOR" value={block.background}
            onChange={(background) => { patchBlock({ background }); commit() }} />
        ) : null}
      </div>
      <div className="panel-section">
        <Slider label="COLUMN" value={block.anchor.col} min={0} max={nCols - 1} step={1} format={int}
          onChange={(col) => patchAnchor({ col })} onCommit={commit} />
        <Slider label="SPAN" value={block.anchor.colSpan} min={1} max={nCols} step={1} format={int}
          onChange={(colSpan) => patchAnchor({ colSpan })} onCommit={commit} />
        <Slider label="ROW" value={block.anchor.row} min={0} max={nRows} step={1} format={int}
          onChange={(row) => patchAnchor({ row })} onCommit={commit} />
      </div>
    </div>
  )
}
