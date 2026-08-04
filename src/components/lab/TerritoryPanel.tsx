'use client'

import { useLabStore } from '@/core/lab/labStore'
import { createFieldSource, mintSourceId } from '@/core/lab/territory'
import { clearPaintRuntime } from '@/core/lab/paintRuntime'
import type {
  BoundaryMode,
  CombineMode,
  CurveSnapshot,
  FieldSourceKind,
  FieldSourceState,
  TreatmentId,
} from '@/core/lab/types'
import { TREATMENTS } from '@/core/lab/types'
import { deserializeProject } from '@/core/state/serialize'
import { Slider } from '@/components/controls/Slider'
import { Toggle } from '@/components/controls/Toggle'
import { SegmentedControl } from '@/components/controls/SegmentedControl'
import { ColorField } from '@/components/controls/ColorField'
import { INK, PAPER } from '@/core/state/defaults'

const pct = (v: number) => String(Math.round(v * 100))
const deg = (v: number) => String(Math.round((v * 180) / Math.PI))
const px = (v: number) => String(Math.round(v))

const KIND_LABEL: Record<FieldSourceKind, string> = {
  curve: 'The curve',
  linear: 'Linear',
  radial: 'Radial',
  tone: 'Image tone',
  detail: 'Image detail',
  paint: 'Painted mask',
}

// THE CURVE source snapshots the editor's actual system curve out of
// its autosave, so the lab composes with the same figure the brand
// runs on; without an autosave it falls back to the meta ∞.
function editorCurveSnapshot(): CurveSnapshot | undefined {
  try {
    const raw = localStorage.getItem('lbs-autosave')
    if (!raw) return undefined
    const p = deserializeProject(raw)
    if (!p) return undefined
    const l = p.lissajous
    return {
      frequencyX: l.frequencyX,
      frequencyY: l.frequencyY,
      phase: l.phase,
      amplitudeX: l.amplitudeX,
      amplitudeY: l.amplitudeY,
      rotation: l.rotation,
      offsetX: l.offsetX,
      offsetY: l.offsetY,
      curve: l.curve === 'meta' ? 'meta' : undefined,
    }
  } catch {
    return undefined
  }
}

export function TerritoryPanel() {
  const territory = useLabStore((s) => s.lab.territory)
  const structure = useLabStore((s) => s.lab.structure)
  const sourceVisibility = useLabStore((s) => s.lab.sourceVisibility)
  const colors = useLabStore((s) => s.lab.colors)
  const apply = useLabStore((s) => s.apply)
  const setT = useLabStore((s) => s.setTransient)
  const commit = useLabStore((s) => s.commitTransient)

  const patchSource = (id: string, patch: Partial<FieldSourceState>, transient = false) => {
    const sources = useLabStore
      .getState()
      .lab.territory.sources.map((s) => (s.id === id ? { ...s, ...patch } : s))
    if (transient) setT({ territory: { sources } })
    else apply({ territory: { sources } })
  }

  const addSource = (kind: FieldSourceKind) => {
    const src = createFieldSource(kind, mintSourceId(), kind === 'curve' ? editorCurveSnapshot() : undefined)
    apply({ territory: { sources: [...territory.sources, src] } })
  }

  const setBands = (bands: TreatmentId[]) => apply({ territory: { bands } })

  return (
    <>
      <div className="panel-section">
        <div className="panel-heading">Territory</div>
        <div className="panel-note">
          Fields stack into one territory; bands carve it into regions that obey
          different laws.
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
            <Slider label="Weight" value={src.weight} min={0} max={1} step={0.01} format={pct}
              onChange={(weight) => patchSource(src.id, { weight }, true)} onCommit={commit} />
            {src.kind === 'linear' ? (
              <>
                <Slider label="Angle" value={src.angle} min={0} max={Math.PI * 2} step={Math.PI / 36}
                  format={deg} onChange={(angle) => patchSource(src.id, { angle }, true)} onCommit={commit} />
                <Slider label="Position" value={src.offset} min={0} max={1} step={0.01} format={pct}
                  onChange={(offset) => patchSource(src.id, { offset }, true)} onCommit={commit} />
              </>
            ) : null}
            {src.kind === 'radial' ? (
              <>
                <Slider label="Center X" value={src.centerX} min={0} max={1} step={0.01} format={pct}
                  onChange={(centerX) => patchSource(src.id, { centerX }, true)} onCommit={commit} />
                <Slider label="Center Y" value={src.centerY} min={0} max={1} step={0.01} format={pct}
                  onChange={(centerY) => patchSource(src.id, { centerY }, true)} onCommit={commit} />
                <Slider label="Radius" value={src.radius} min={0.05} max={0.9} step={0.01} format={pct}
                  onChange={(radius) => patchSource(src.id, { radius }, true)} onCommit={commit} />
              </>
            ) : null}
            {src.kind === 'linear' || src.kind === 'radial' || src.kind === 'curve' ? (
              <Slider label="Softness" value={src.softness} min={0.02} max={1} step={0.01} format={pct}
                onChange={(softness) => patchSource(src.id, { softness }, true)} onCommit={commit} />
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
              {i > 0 ? (
                <SegmentedControl<CombineMode>
                  value={src.combine}
                  options={[
                    { value: 'add', label: 'Add' },
                    { value: 'multiply', label: 'Mult' },
                    { value: 'max', label: 'Max' },
                  ]}
                  onChange={(combine) => patchSource(src.id, { combine })}
                />
              ) : null}
            </div>
          </div>
        ))}
        <div className="lab-add-row">
          {(['curve', 'linear', 'radial', 'tone', 'detail', 'paint'] as FieldSourceKind[]).map((k) => (
            <button key={k} className="lab-chip" onClick={() => addSource(k)}>
              + {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </div>

      <div className="panel-section">
        <div className="panel-heading">Bands</div>
        <Slider label="Count" value={territory.bands.length} min={2} max={5} step={1} format={px}
          onChange={(n) => {
            const count = Math.round(n)
            // dialkit fires onChange per pointermove — only a REAL count
            // change may reach apply(), or one drag floods the undo stack
            if (count === territory.bands.length) return
            const bands = [...territory.bands]
            while (bands.length < count) bands.push('marks')
            bands.length = count
            setBands(bands)
          }} />
        {territory.bands.map((treatment, i) => (
          <SegmentedControl<TreatmentId>
            key={i}
            label={i === 0 ? 'Far' : i === territory.bands.length - 1 ? 'Near' : `Band ${i + 1}`}
            value={treatment}
            options={TREATMENTS.map((t) => ({ value: t.id, label: t.label }))}
            onChange={(t) => {
              const bands = [...territory.bands]
              bands[i] = t
              setBands(bands)
            }}
          />
        ))}
        <SegmentedControl<BoundaryMode>
          label="Boundary"
          value={territory.boundary}
          options={[
            { value: 'hard', label: 'Hard' },
            { value: 'dither', label: 'Dither' },
            { value: 'porous', label: 'Porous' },
          ]}
          onChange={(boundary) => apply({ territory: { boundary } })}
        />
      </div>

      <div className="panel-section">
        <div className="panel-heading">Structure</div>
        <Slider label="Base cell" value={structure.baseCell} min={12} max={96} step={1} format={px}
          unit="px" onChange={(baseCell) => setT({ structure: { baseCell } })} onCommit={commit} />
        <SegmentedControl<'0' | '1' | '2'>
          label="Levels"
          value={String(structure.maxLevels) as '0' | '1' | '2'}
          options={[
            { value: '0', label: '1' },
            { value: '1', label: '2' },
            { value: '2', label: '3' },
          ]}
          onChange={(v) => apply({ structure: { maxLevels: Number(v) as 0 | 1 | 2 } })}
        />
        <Slider label="Subdivide" value={structure.subdivide} min={0} max={1} step={0.01} format={pct}
          onChange={(subdivide) => setT({ structure: { subdivide } })} onCommit={commit} />
        <div className="panel-note">
          Cells split where image detail earns finer resolution — the grid is
          hierarchical, not uniform.
        </div>
        <Slider label="Source" value={sourceVisibility} min={0} max={1} step={0.01} format={pct}
          onChange={(v) => setT({ sourceVisibility: v })} onCommit={commit} />
      </div>

      <div className="panel-section">
        <div className="panel-heading">Inks</div>
        <ColorField label="Ink" value={colors?.ink ?? INK}
          onChange={(ink) => setT({ colors: { ink } })} onCommit={commit} />
        <ColorField label="Paper" value={colors?.paper ?? PAPER}
          onChange={(paper) => setT({ colors: { paper } })} onCommit={commit} />
        <div className="panel-note">
          Marks, flat cells, and contours draw in ink; the ground is paper.
          Mosaic and photo bands keep the source&apos;s own color — the
          MARKS color mode can also sample it.
        </div>
      </div>
    </>
  )
}
