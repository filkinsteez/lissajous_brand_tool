'use client'

import { useStore } from '@/core/state/store'
import { Slider } from '@/components/controls/Slider'
import { SegmentedControl } from '@/components/controls/SegmentedControl'
import { TextField } from '@/components/controls/TextField'
import { FONT_LABELS } from '@/core/typography/fonts'
import { getDerived } from '@/core/pipeline'
import { shuffleLayout } from '@/core/typography/layoutShuffle'
import type { FontFamilyId, TypeAlign, TypeBlockState, TypeCase } from '@/core/state/types'

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
  const applyLayoutSeed = (layoutSeed: number, transient: boolean) => {
    const patch = { layoutSeed, typeBlocks: shuffleLayout(project, grid, layoutSeed) }
    if (transient) setT(patch)
    else useStore.getState().apply(patch)
  }

  return (
    <div className="panel">
      <div className="panel-section">
        <button className="ctl-action primary" onClick={() => applyLayoutSeed(project.layoutSeed + 1, false)}>
          SHUFFLE LAYOUT
        </button>
        <Slider label="LAYOUT" value={project.layoutSeed} min={0} max={99} step={1} format={int}
          onChange={(v) => applyLayoutSeed(v, true)} onCommit={commit} />
        <div className="panel-note">
          Layouts are grid archetypes, deterministic per seed. Drag blocks on the
          artboard to snap them to columns and baselines.
        </div>
      </div>
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
        <SegmentedControl<TypeCase>
          label="CASE"
          value={block.textCase}
          options={[
            { value: 'none', label: 'AS TYPED' },
            { value: 'upper', label: 'UPPER' },
            { value: 'lower', label: 'LOWER' },
          ]}
          onChange={(textCase) => { patchBlock({ textCase }); commit() }}
        />
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
        <Slider label="COLUMN" value={block.anchor.col} min={0} max={nCols - 1} step={1} format={int}
          onChange={(col) => patchAnchor({ col })} onCommit={commit} />
        <Slider label="SPAN" value={block.anchor.colSpan} min={1} max={nCols} step={1} format={int}
          onChange={(colSpan) => patchAnchor({ colSpan })} onCommit={commit} />
        <Slider label="ROW" value={block.anchor.row} min={0} max={nRows} step={1} format={int}
          onChange={(row) => patchAnchor({ row })} onCommit={commit} />
        <Slider label="PRESSURE" value={block.materialInfluence} min={0} max={1}
          format={(v) => `${Math.round(v * 100)}`}
          onChange={(materialInfluence) => patchBlock({ materialInfluence })} onCommit={commit} />
      </div>
    </div>
  )
}
