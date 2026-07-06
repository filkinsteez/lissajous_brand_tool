'use client'

import { useStore } from '@/core/state/store'
import { Slider } from '@/components/controls/Slider'
import { SegmentedControl } from '@/components/controls/SegmentedControl'
import { Toggle } from '@/components/controls/Toggle'
import { ARTBOARD_PRESETS } from '@/core/state/defaults'
import type { ArtboardPresetId, GridMode } from '@/core/state/types'

const pct = (v: number) => `${Math.round(v * 100)}`
const int = (v: number) => String(Math.round(v))

export function GridPanel() {
  const grid = useStore((s) => s.project.grid)
  const artboardPreset = useStore((s) => s.project.artboard.preset)
  const showGuides = useStore((s) => s.ui.showGuides)
  const setUi = useStore((s) => s.setUi)
  const apply = useStore((s) => s.apply)
  const setT = useStore((s) => s.setTransient)
  const commit = useStore((s) => s.commitTransient)

  return (
    <div className="panel">
      <div className="panel-section">
        <SegmentedControl<ArtboardPresetId>
          label="ARTBOARD"
          value={artboardPreset}
          options={(Object.keys(ARTBOARD_PRESETS) as ArtboardPresetId[]).map((id) => ({
            value: id,
            label: ARTBOARD_PRESETS[id].label.toUpperCase(),
          }))}
          onChange={(preset) =>
            apply({
              artboard: {
                preset,
                width: ARTBOARD_PRESETS[preset].width,
                height: ARTBOARD_PRESETS[preset].height,
              },
            })
          }
        />
      </div>
      <div className="panel-section">
        <SegmentedControl<GridMode>
          label="EXTRACTION"
          value={grid.mode}
          options={[
            { value: 'strict', label: 'STRICT EDITORIAL' },
            { value: 'projection', label: 'PROJECTION' },
          ]}
          onChange={(mode) => apply({ grid: { mode } })}
        />
      </div>
      <div className="panel-section">
        <Slider label="MARGIN" value={grid.marginRestraint} min={0} max={1} format={pct}
          onChange={(v) => setT({ grid: { marginRestraint: v } })} onCommit={commit} />
        <Slider label="COLUMNS" value={grid.columnBias} min={2} max={8} step={1} format={int}
          onChange={(v) => setT({ grid: { columnBias: v } })} onCommit={commit} />
        <Slider label="ROWS" value={grid.rowBias} min={2} max={12} step={1} format={int}
          onChange={(v) => setT({ grid: { rowBias: v } })} onCommit={commit} />
        <Slider label="GUTTER" value={grid.gutterScale} min={0} max={2} format={pct}
          onChange={(v) => setT({ grid: { gutterScale: v } })} onCommit={commit} />
        <Slider label="BASELINE" value={grid.baselineRhythm} min={0.5} max={2} format={pct}
          onChange={(v) => setT({ grid: { baselineRhythm: v } })} onCommit={commit} />
        <Slider label="SNAP" value={grid.snapStrength} min={0} max={1} format={pct}
          onChange={(v) => setT({ grid: { snapStrength: v } })} onCommit={commit} />
      </div>
      <div className="panel-section">
        <Toggle label="GUIDES IN COMPOSE" value={showGuides} onChange={(v) => setUi({ showGuides: v })} />
        {grid.selectedNodeIds.length > 0 ? (
          <button className="ctl-action" onClick={() => apply({ grid: { selectedNodeIds: [] } })}>
            CLEAR NODE SELECTION ({grid.selectedNodeIds.length})
          </button>
        ) : (
          <div className="panel-note">Click nodes in Lissajous Setup to pin the grid to them.</div>
        )}
      </div>
    </div>
  )
}
