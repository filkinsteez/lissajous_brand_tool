'use client'

import { useEffect, useRef } from 'react'
import { useStore } from '@/core/state/store'
import { Slider } from '@/components/controls/Slider'
import { SegmentedControl } from '@/components/controls/SegmentedControl'
import { Toggle } from '@/components/controls/Toggle'
import { PresetStrip } from '../PresetStrip'
import { ARTBOARD_PRESETS } from '@/core/state/defaults'
import type { ArtboardPresetId, GridMode } from '@/core/state/types'

const deg = (rad: number) => `${Math.round((rad * 180) / Math.PI)}°`
const pct = (v: number) => `${Math.round(v * 100)}`
const int = (v: number) => String(Math.round(v))

// One tool, one idea: the curve IS the grid. Curve parameters and the
// structure extracted from them live in a single SYSTEM panel; while any
// of it is being adjusted, the construction overlay reveals itself.
export function SystemPanel() {
  const liss = useStore((s) => s.project.lissajous)
  const grid = useStore((s) => s.project.grid)
  const glyphsOn = useStore((s) => s.project.glyphField.enabled)
  const artboardPreset = useStore((s) => s.project.artboard.preset)
  const showGuides = useStore((s) => s.ui.showGuides)
  const mode = useStore((s) => s.ui.mode)
  const setUi = useStore((s) => s.setUi)
  const apply = useStore((s) => s.apply)
  const setT = useStore((s) => s.setTransient)
  const commit = useStore((s) => s.commitTransient)

  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const touch = () => {
    clearTimeout(settleTimer.current)
    if (!useStore.getState().ui.systemAdjusting) setUi({ systemAdjusting: true })
  }
  const settle = () => {
    commit()
    clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(() => setUi({ systemAdjusting: false }), 800)
  }
  useEffect(() => () => clearTimeout(settleTimer.current), [])

  const curve = (patch: Parameters<typeof setT>[0]) => {
    touch()
    setT(patch)
  }

  return (
    <div className="panel">
      <div className="panel-section">
        <div className="panel-heading">RATIO</div>
        <PresetStrip />
      </div>
      <div className="panel-section">
        <div className="panel-heading">CURVE</div>
        <Slider label="FREQ X" value={liss.frequencyX} min={1} max={12} step={1}
          onChange={(v) => curve({ lissajous: { frequencyX: v, presetId: undefined } })} onCommit={settle} />
        <Slider label="FREQ Y" value={liss.frequencyY} min={1} max={12} step={1}
          onChange={(v) => curve({ lissajous: { frequencyY: v, presetId: undefined } })} onCommit={settle} />
        <Slider label="PHASE" value={liss.phase} min={0} max={Math.PI} step={Math.PI / 180} format={deg}
          onChange={(v) => curve({ lissajous: { phase: v } })} onCommit={settle} />
        <Slider label="AMP X" value={liss.amplitudeX} min={0.2} max={1} format={pct}
          onChange={(v) => curve({ lissajous: { amplitudeX: v } })} onCommit={settle} />
        <Slider label="AMP Y" value={liss.amplitudeY} min={0.2} max={1} format={pct}
          onChange={(v) => curve({ lissajous: { amplitudeY: v } })} onCommit={settle} />
        <Slider label="ROTATION" value={liss.rotation} min={-Math.PI / 4} max={Math.PI / 4}
          step={Math.PI / 360} format={deg}
          onChange={(v) => curve({ lissajous: { rotation: v } })} onCommit={settle} />
        <Slider label="OFFSET X" value={liss.offsetX} min={-0.4} max={0.4} format={pct}
          onChange={(v) => curve({ lissajous: { offsetX: v } })} onCommit={settle} />
        <Slider label="OFFSET Y" value={liss.offsetY} min={-0.4} max={0.4} format={pct}
          onChange={(v) => curve({ lissajous: { offsetY: v } })} onCommit={settle} />
      </div>
      <div className="panel-section">
        <div className="panel-heading">STRUCTURE</div>
        <SegmentedControl<GridMode>
          label="GRID LINES"
          value={grid.mode}
          options={[
            { value: 'strict', label: 'SNAPPED' },
            { value: 'projection', label: 'AT CROSSINGS' },
          ]}
          onChange={(mode) => apply({ grid: { mode } })}
        />
        <div className="panel-note">
          Lines come from where the curve crosses itself. SNAPPED disciplines
          them into even columns and baselines; AT CROSSINGS keeps them exactly
          where the crossings fall.
        </div>
        <Slider label="MARGIN" value={grid.marginRestraint} min={0} max={1} format={pct}
          onChange={(v) => curve({ grid: { marginRestraint: v } })} onCommit={settle} />
        <Slider label="COLUMNS" value={grid.columnBias} min={2} max={8} step={1} format={int}
          onChange={(v) => curve({ grid: { columnBias: v } })} onCommit={settle} />
        <Slider label="ROWS" value={grid.rowBias} min={2} max={12} step={1} format={int}
          onChange={(v) => curve({ grid: { rowBias: v } })} onCommit={settle} />
        <Slider label="GUTTER" value={grid.gutterScale} min={0} max={2} format={pct}
          onChange={(v) => curve({ grid: { gutterScale: v } })} onCommit={settle} />
        <Slider label="BASELINE" value={grid.baselineRhythm} min={0.5} max={2} format={pct}
          onChange={(v) => curve({ grid: { baselineRhythm: v } })} onCommit={settle} />
        <Slider label="SNAP" value={grid.snapStrength} min={0} max={1} format={pct}
          onChange={(v) => curve({ grid: { snapStrength: v } })} onCommit={settle} />
        <Toggle label="SHOW GUIDES" value={showGuides} onChange={(v) => setUi({ showGuides: v })} />
        <Toggle
          label="CONSTRUCTION VIEW"
          value={mode === 'setup'}
          onChange={(v) => setUi({ mode: v ? 'setup' : 'compose' })}
        />
        {grid.selectedNodeIds.length > 0 ? (
          <button className="ctl-action" onClick={() => apply({ grid: { selectedNodeIds: [] } })}>
            CLEAR NODE SELECTION ({grid.selectedNodeIds.length})
          </button>
        ) : (
          <div className="panel-note">
            CONSTRUCTION VIEW shows the curve and its crossings on the artboard;
            click crossings to pin the grid to them.
          </div>
        )}
      </div>
      <div className="panel-section">
        <div className="panel-heading">LAYERS</div>
        <Toggle label="GLYPH FIELD" value={glyphsOn}
          onChange={(enabled) => apply({ glyphField: { enabled } })} />
      </div>
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
    </div>
  )
}
