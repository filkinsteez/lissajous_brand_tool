'use client'

import { useState } from 'react'
import { useLabStore } from '@/core/lab/labStore'
import { createFieldSource, mintSourceId } from '@/core/lab/territory'
import { clearPaintRuntime } from '@/core/lab/paintRuntime'
import type {
  BoundaryMode,
  CombineMode,
  FieldSourceKind,
  FieldSourceState,
  FlowBasis,
  MarkBankId,
  MarkColorMode,
  TreatmentId,
} from '@/core/lab/types'
import { TREATMENTS } from '@/core/lab/types'
import { editorCurveSnapshot } from './refreshCurve'
import { Slider } from '@/components/controls/Slider'
import { Toggle } from '@/components/controls/Toggle'
import { SegmentedControl } from '@/components/controls/SegmentedControl'

const pct = (v: number) => String(Math.round(v * 100))
const deg = (v: number) => String(Math.round((v * 180) / Math.PI))

const KIND_LABEL: Record<FieldSourceKind, string> = {
  curve: 'The curve',
  linear: 'Linear',
  radial: 'Radial',
  tone: 'Image tone',
  detail: 'Image detail',
  paint: 'Painted mask',
}

// Everything that is not a primary dial lives here, closed by default.
// Sections gate on relevance: controls only appear when something on
// the canvas listens to them. The engine-room sections (Zones, Fields)
// sit one level deeper still, behind MORE.
export function AdjustPanel() {
  const [open, setOpen] = useState(false)
  const [more, setMore] = useState(false)
  const territory = useLabStore((s) => s.lab.territory)
  const structure = useLabStore((s) => s.lab.structure)
  const flow = useLabStore((s) => s.lab.flow)
  const mark = useLabStore((s) => s.lab.mark)
  const apply = useLabStore((s) => s.apply)
  const setT = useLabStore((s) => s.setTransient)
  const commit = useLabStore((s) => s.commitTransient)
  const setUi = useLabStore((s) => s.setUi)

  const bands = territory.bands
  // marks params feed the 'marks' treatment; dabs consume only density
  // and color — the section shows exactly what the canvas listens to
  const hasMarks = bands.includes('marks')
  const hasDabs = bands.includes('dabs')
  const hasFlowConsumer =
    bands.some((b) => b === 'dabs' || b === 'streams') ||
    (hasMarks && (mark.echo > 0 || mark.flow > 0))
  const hasScan = bands.includes('scan')
  const hasCurveSource = territory.sources.some((s) => s.kind === 'curve' && s.enabled)

  const patchSource = (id: string, patch: Partial<FieldSourceState>, transient = false) => {
    const sources = useLabStore
      .getState()
      .lab.territory.sources.map((s) => (s.id === id ? { ...s, ...patch } : s))
    if (transient) {
      // dragging a field dial focuses that field: the canvas overlays
      // its contours so the dial has a visible referent
      if (useLabStore.getState().ui.focusedSourceId !== id) setUi({ focusedSourceId: id })
      setT({ territory: { sources } })
    } else {
      apply({ territory: { sources } })
    }
  }
  const commitSource = () => {
    commit()
    setUi({ focusedSourceId: null })
  }

  if (!open) {
    return (
      <div className="panel-section">
        <button className="ctl-action" onClick={() => setOpen(true)}>
          Adjust…
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="panel-section">
        <button className="ctl-action" onClick={() => setOpen(false)}>
          Close adjust
        </button>
      </div>

      <div className="panel-section">
        <div className="panel-heading">Pattern</div>
        <SegmentedControl<'0' | '1' | '2'>
          label="Detail"
          value={String(structure.maxLevels) as '0' | '1' | '2'}
          options={[
            { value: '0', label: 'Low' },
            { value: '1', label: 'Medium' },
            { value: '2', label: 'High' },
          ]}
          onChange={(v) => apply({ structure: { maxLevels: Number(v) as 0 | 1 | 2 } })}
        />
        <Slider label="Adaptive" value={structure.subdivide} min={0} max={1} step={0.01}
          format={pct} defaultValue={0.5}
          onChange={(subdivide) => setT({ structure: { subdivide } })} onCommit={commit} />
        <div className="panel-note">Adaptive splits cells where the image is busy.</div>
      </div>

      {hasFlowConsumer || hasScan ? (
        <div className="panel-section">
          <div className="panel-heading">Direction</div>
          {hasFlowConsumer ? (
            <>
              <SegmentedControl<FlowBasis>
                label="Follow"
                value={flow?.basis ?? 'curve'}
                options={[
                  { value: 'curve', label: 'Curve' },
                  { value: 'noise', label: 'Swirls' },
                  { value: 'contour', label: 'Zones' },
                  { value: 'angle', label: 'Angle' },
                ]}
                onChange={(basis) => apply({ flow: { basis } })}
              />
              {flow?.basis === 'angle' ? (
                <Slider label="Angle" value={flow.angle} min={0} max={Math.PI * 2}
                  step={Math.PI / 36} format={deg} defaultValue={0}
                  onChange={(angle) => setT({ flow: { angle } })} onCommit={commit} />
              ) : null}
              <Slider label="Swirl" value={flow?.curl ?? 0.25} min={0} max={1} step={0.01}
                format={pct} defaultValue={0.25}
                onChange={(curl) => setT({ flow: { curl } })} onCommit={commit} />
              {(flow?.curl ?? 0) > 0 || flow?.basis === 'noise' ? (
                <Slider label="Swirl size" value={flow?.scale ?? 0.4} min={0} max={1} step={0.01}
                  format={pct} defaultValue={0.4}
                  onChange={(scale) => setT({ flow: { scale } })} onCommit={commit} />
              ) : null}
            </>
          ) : null}
          {hasScan ? (
            <Slider label="Bend" value={flow?.warp ?? 0.5} min={0} max={1} step={0.01}
              format={pct} defaultValue={0.5}
              onChange={(warp) => setT({ flow: { warp } })} onCommit={commit} />
          ) : null}
        </div>
      ) : null}

      {hasMarks || hasDabs ? (
        <div className="panel-section">
          <div className="panel-heading">{hasMarks ? 'Marks' : 'Dabs'}</div>
          <Slider label="Density" value={mark.occupancy} min={0} max={1} step={0.01}
            format={pct} defaultValue={0.85}
            onChange={(occupancy) => setT({ mark: { occupancy } })} onCommit={commit} />
          {hasMarks ? (
          <>
          <SegmentedControl<MarkBankId>
            label="Mark set"
            value={mark.bank}
            options={[
              { value: 'dots', label: 'Dots' },
              { value: 'geo', label: 'Geo' },
              { value: 'brand', label: 'Brand' },
            ]}
            onChange={(bank) => apply({ mark: { bank } })}
          />
          <Slider label="Pick by edges" value={mark.evidenceMix} min={0} max={1} step={0.01}
            format={pct} defaultValue={0.35}
            onChange={(evidenceMix) => setT({ mark: { evidenceMix } })} onCommit={commit} />
          <Slider label="Size min" value={mark.minScale} min={0.05} max={1} step={0.01}
            format={pct} defaultValue={0.25}
            onChange={(minScale) => setT({ mark: { minScale } })} onCommit={commit} />
          <Slider label="Size max" value={mark.maxScale} min={0.1} max={1.6} step={0.01}
            format={pct} defaultValue={0.95}
            onChange={(maxScale) => setT({ mark: { maxScale } })} onCommit={commit} />
          <Slider label="Rotate" value={mark.rotationInfluence} min={0} max={1} step={0.01}
            format={pct} defaultValue={0.6}
            onChange={(rotationInfluence) => setT({ mark: { rotationInfluence } })} onCommit={commit} />
          {hasCurveSource ? (
            <Slider label="Along curve" value={mark.flow} min={0} max={1} step={0.01}
              format={pct} defaultValue={0}
              onChange={(flow) => setT({ mark: { flow } })} onCommit={commit} />
          ) : null}
          <Slider label="Patch size" value={mark.coherenceScale} min={0} max={1} step={0.01}
            format={pct} defaultValue={0.45}
            onChange={(coherenceScale) => setT({ mark: { coherenceScale } })} onCommit={commit} />
          <Slider label="Trail" value={mark.echo ?? 0} min={0} max={6} step={1}
            format={(v) => String(Math.round(v))} defaultValue={0}
            onChange={(echo) => setT({ mark: { echo } })} onCommit={commit} />
          </>
          ) : null}
          <SegmentedControl<MarkColorMode>
            label="Color from"
            value={mark.colorMode}
            options={[
              { value: 'ink', label: 'Lines' },
              { value: 'tint', label: 'Tints' },
              { value: 'source', label: 'Photo' },
              { value: 'palette', label: 'Palette' },
            ]}
            onChange={(colorMode) => apply({ mark: { colorMode } })}
          />
        </div>
      ) : null}

      {!more ? (
        <div className="panel-section">
          <button className="ctl-action" onClick={() => setMore(true)}>
            More: zones &amp; fields…
          </button>
        </div>
      ) : (
        <>
      <div className="panel-section">
        <div className="panel-heading">Zones</div>
        <div className="panel-note">From away from the curve to on it.</div>
        <SegmentedControl<'2' | '3' | '4' | '5'>
          label="Count"
          value={String(bands.length) as '2' | '3' | '4' | '5'}
          options={[
            { value: '2', label: '2' },
            { value: '3', label: '3' },
            { value: '4', label: '4' },
            { value: '5', label: '5' },
          ]}
          onChange={(v) => {
            const count = Number(v)
            const next = [...bands]
            while (next.length < count) next.splice(next.length - 1, 0, 'marks')
            while (next.length > count) next.splice(next.length - 2, 1)
            apply({ territory: { bands: next }, look: { id: null } })
          }}
        />
        {bands.map((treatment, i) => (
          <div className="lab-zone-row" key={i}>
            <span className="lab-zone-label">
              {i === 0 ? 'Away' : i === bands.length - 1 ? 'At curve' : `Zone ${i + 1}`}
            </span>
            <select
              className="lab-select"
              value={treatment}
              onChange={(e) => {
                const next = [...bands]
                next[i] = e.target.value as TreatmentId
                apply({ territory: { bands: next }, look: { id: null } })
              }}
            >
              {TREATMENTS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        ))}
        <SegmentedControl<BoundaryMode>
          label="Edges"
          value={territory.boundary}
          options={[
            { value: 'hard', label: 'Sharp' },
            { value: 'dither', label: 'Halftone' },
            { value: 'porous', label: 'Ragged' },
          ]}
          onChange={(boundary) => apply({ territory: { boundary } })}
        />
      </div>

      <div className="panel-section">
        <div className="panel-heading">Fields</div>
        <div className="panel-note">
          What shapes the effect area. Drag a dial to see that field on
          the canvas.
        </div>
        {territory.sources.map((src, i) => (
          <div className="lab-source" key={src.id}>
            <div className="lab-source-head">
              <span className="lab-source-name">{KIND_LABEL[src.kind]}</span>
              <Toggle label="Active" value={src.enabled} onChange={(enabled) => patchSource(src.id, { enabled })} />
              <button
                className="lab-source-x"
                aria-label={`Remove ${KIND_LABEL[src.kind]}`}
                onClick={() =>
                  apply({ territory: { sources: territory.sources.filter((s) => s.id !== src.id) } })
                }
              >
                ×
              </button>
            </div>
            {/* an inactive field contributes nothing — its dials would
                all be dead, so they fold away with it */}
            {src.enabled ? (
              <>
            <Slider label="Weight" value={src.weight} min={0} max={1} step={0.01} format={pct}
              defaultValue={0.8}
              onChange={(weight) => patchSource(src.id, { weight }, true)} onCommit={commitSource} />
            {src.kind === 'linear' ? (
              <>
                <Slider label="Angle" value={src.angle} min={0} max={Math.PI * 2} step={Math.PI / 36}
                  format={deg} defaultValue={Math.PI / 2}
                  onChange={(angle) => patchSource(src.id, { angle }, true)} onCommit={commitSource} />
                <Slider label="Position" value={src.offset} min={0} max={1} step={0.01} format={pct}
                  defaultValue={0.5}
                  onChange={(offset) => patchSource(src.id, { offset }, true)} onCommit={commitSource} />
              </>
            ) : null}
            {src.kind === 'radial' ? (
              <>
                <Slider label="Center X" value={src.centerX} min={0} max={1} step={0.01} format={pct}
                  defaultValue={0.5}
                  onChange={(centerX) => patchSource(src.id, { centerX }, true)} onCommit={commitSource} />
                <Slider label="Center Y" value={src.centerY} min={0} max={1} step={0.01} format={pct}
                  defaultValue={0.5}
                  onChange={(centerY) => patchSource(src.id, { centerY }, true)} onCommit={commitSource} />
                <Slider label="Radius" value={src.radius} min={0.05} max={0.9} step={0.01} format={pct}
                  defaultValue={0.32}
                  onChange={(radius) => patchSource(src.id, { radius }, true)} onCommit={commitSource} />
              </>
            ) : null}
            {src.kind === 'linear' || src.kind === 'radial' || src.kind === 'curve' ? (
              <Slider label="Softness" value={src.softness} min={0.02} max={1} step={0.01} format={pct}
                defaultValue={0.3}
                onChange={(softness) => patchSource(src.id, { softness }, true)} onCommit={commitSource} />
            ) : null}
            {src.kind === 'paint' ? (
              <div className="lab-row">
                <button
                  className="ctl-action"
                  onClick={() => {
                    clearPaintRuntime()
                    apply({ paint: null })
                  }}
                >
                  Clear paint
                </button>
              </div>
            ) : null}
            <div className="lab-row">
              <Toggle label="Invert" value={src.invert} onChange={(invert) => patchSource(src.id, { invert })} />
              {i > 0 && src.kind !== 'paint' ? (
                <SegmentedControl<CombineMode>
                  value={src.combine}
                  options={[
                    { value: 'add', label: 'Add' },
                    { value: 'subtract', label: 'Sub' },
                    { value: 'multiply', label: 'Mult' },
                    { value: 'max', label: 'Max' },
                  ]}
                  onChange={(combine) => patchSource(src.id, { combine })}
                />
              ) : null}
            </div>
              </>
            ) : null}
          </div>
        ))}
        <div className="lab-add-row">
          {(['curve', 'linear', 'radial', 'tone', 'detail', 'paint'] as FieldSourceKind[]).map((k) => (
            <button
              key={k}
              className="lab-chip"
              onClick={() => {
                const src = createFieldSource(k, mintSourceId(), k === 'curve' ? editorCurveSnapshot() : undefined)
                apply({ territory: { sources: [...territory.sources, src] } })
              }}
            >
              + {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </div>
        </>
      )}
    </>
  )
}
