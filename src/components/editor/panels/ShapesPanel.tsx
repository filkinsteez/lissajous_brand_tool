'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useStore } from '@/core/state/store'
import { setLabHandoff } from '@/core/lab/handoff'
import { Slider } from '@/components/controls/Slider'
import { SegmentedControl } from '@/components/controls/SegmentedControl'
import { Toggle } from '@/components/controls/Toggle'
import { ColorField } from '@/components/controls/ColorField'
import { niceLabel } from '@/components/controls/label'
import { importImageFile } from '@/core/images'
import { TypePanel } from './TypePanel'
import type {
  ClonerState,
  ContourState,
  ImageArrayState,
  LayerBlend,
  LayerColor,
  LayerTexture,
  OrganicProto,
  OrganicState,
  PatternState,
  ProjectState,
  ShapeItem,
  ShapeLayer,
  TilesState,
  SheetShape,
} from '@/core/state/types'
import { BRAND_PALETTE } from '@/core/color/palette'
import { INK, PAPER } from '@/core/state/defaults'

const pct = (v: number) => `${Math.round(v * 100)}`
const int = (v: number) => String(Math.round(v))
const deg = (v: number) => `${Math.round((v * 180) / Math.PI)}°`

// PROPERTIES — the right inspector for whatever is selected: a drawn
// shape's fill/stroke/opacity, or the selected effector's source
// binding and parameters. The document tree lives in the left rail.
export function ShapesPanel() {
  const project = useStore((s) => s.project)
  const apply = useStore((s) => s.apply)
  const setT = useStore((s) => s.setTransient)
  const commit = useStore((s) => s.commitTransient)
  const ui = useStore((s) => s.ui)
  const setUi = useStore((s) => s.setUi)

  const layers = project.layers
  // explicit selection only — the rail is the picker (see LayersRail)
  const selected = layers.find((l) => l.id === ui.selectedLayerId)

  const patchLayer = (id: string, patch: Partial<ShapeLayer>) => {
    apply({ layers: layers.map((l) => (l.id === id ? ({ ...l, ...patch } as ShapeLayer) : l)) })
  }
  // slider drags: transient params patch + commit on release
  const patchParamsT = (id: string, params: Record<string, unknown>) => {
    setT({
      layers: layers.map((l) =>
        l.id === id ? ({ ...l, params: { ...l.params, ...params } } as ShapeLayer) : l,
      ),
    })
  }
  const patchParams = (id: string, params: Record<string, unknown>) => {
    apply({
      layers: layers.map((l) =>
        l.id === id ? ({ ...l, params: { ...l.params, ...params } } as ShapeLayer) : l,
      ),
    })
  }

  return (
    <div className="panel">
      {ui.selectedShapeIds.length ? (
        <ShapeProperties
          project={project}
          selectedIds={ui.selectedShapeIds}
          set={(patch) => {
            setT({
              shapes: project.shapes.map((s) =>
                ui.selectedShapeIds.includes(s.id) ? { ...s, ...patch } : s,
              ),
            })
          }}
          setD={(patch) => {
            apply({
              shapes: project.shapes.map((s) =>
                ui.selectedShapeIds.includes(s.id) ? { ...s, ...patch } : s,
              ),
            })
          }}
          commit={commit}
        />
      ) : ui.selectedBlockIds.length ? (
        // a selected text block edits IN PLACE — the panel adapts to the
        // selection instead of sending you to another tab
        // no second heading — the inspector title already names the
        // selection, and two stacked labels never lined up
        <TypePanel embedded />
      ) : ui.selectedImageIds.length ? (
        <ImageProperties project={project} selectedIds={ui.selectedImageIds} />
      ) : null}
      {/* the effector's own settings, only when IT is the selection */}
      {selected &&
      !ui.selectedShapeIds.length &&
      !ui.selectedBlockIds.length &&
      !ui.selectedImageIds.length ? (
        <>
          <LayerControls
            layer={selected}
            project={project}
            patchLayer={patchLayer}
            setOpacityT={(v) =>
              setT({
                layers: layers.map((l) =>
                  l.id === selected.id ? ({ ...l, opacity: v } as ShapeLayer) : l,
                ),
              })
            }
            setDensityT={(v) =>
              setT({
                layers: layers.map((l) =>
                  l.id === selected.id ? ({ ...l, texDensity: v } as ShapeLayer) : l,
                ),
              })
            }
            commit={commit}
          />
          <SourceControls
            layer={selected}
            project={project}
            selectedIds={[...ui.selectedShapeIds, ...ui.selectedBlockIds]}
            bind={(ids) => {
              patchParams(selected.id, { sourceShapeIds: ids })
              // bound objects leave the canvas — an invisible selection
              // would ghost-drag, so it clears with them
              setUi({ selectedShapeIds: [], selectedBlockIds: [], selectedBlockId: undefined })
            }}
            isolating={ui.isolateLayerId === selected.id}
            onIsolate={() =>
              setUi(
                ui.isolateLayerId === selected.id
                  ? { isolateLayerId: undefined, selectedShapeIds: [] }
                  : { isolateLayerId: selected.id, selectedShapeIds: [] },
              )
            }
          />
          <div className="panel-section">
            <div className="panel-heading">{selected.name} SETTINGS</div>
            {selected.type === 'organic' ? (
              <OrganicControls
                params={selected.params}
                set={(p) => patchParamsT(selected.id, p)}
                setD={(p) => patchParams(selected.id, p)}
                commit={commit}
              />
            ) : selected.type === 'cloner' ? (
              <ClonerControls
                params={selected.params}
                set={(p) => patchParamsT(selected.id, p)}
                setD={(p) => patchParams(selected.id, p)}
                commit={commit}
              />
            ) : selected.type === 'array' ? (
              <ArrayControls
                params={selected.params}
                project={project}
                set={(p) => patchParamsT(selected.id, p)}
                setD={(p) => patchParams(selected.id, p)}
                commit={commit}
              />
            ) : selected.type === 'tiles' ? (
              <TilesControls
                params={selected.params}
                project={project}
                set={(p) => patchParamsT(selected.id, p)}
                setD={(p) => patchParams(selected.id, p)}
                commit={commit}
              />
            ) : selected.type === 'clones' ? (
              <ClonesControls
                params={selected.params}
                set={(p) => patchParamsT(selected.id, p)}
                commit={commit}
              />
            ) : (
              <PatternControls
                params={selected.params}
                set={(p) => patchParamsT(selected.id, p)}
                setD={(p) => patchParams(selected.id, p)}
                commit={commit}
              />
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}

function ShapeProperties({
  project,
  selectedIds,
  set,
  setD,
  commit,
}: {
  project: ProjectState
  selectedIds: string[]
  set: (patch: Partial<ShapeItem>) => void
  setD: (patch: Partial<ShapeItem>) => void
  commit: () => void
}) {
  const first = project.shapes.find((s) => selectedIds.includes(s.id))
  if (!first) return null
  const stroked = !!(first.stroke && first.strokeWidth)
  return (
    <div className="panel-section">
      <div className="panel-heading">
        {selectedIds.length > 1 ? `${selectedIds.length} shapes` : niceLabel(first.kind)}
      </div>
      <ColorField
        label="Fill"
        value={first.fill}
        onChange={(fill) => set({ fill })}
        onCommit={commit}
      />
      <Slider label="Opacity" value={first.opacity} min={0.05} max={1} format={pct} defaultValue={1}
        onChange={(opacity) => set({ opacity })} onCommit={commit} />
      <Toggle
        label="Stroke"
        value={stroked}
        onChange={(on) =>
          setD(on ? { stroke: first.stroke ?? INK, strokeWidth: first.strokeWidth || 3 } : { stroke: undefined, strokeWidth: undefined })
        }
      />
      {stroked ? (
        <>
          <Slider label="Width" value={first.strokeWidth ?? 3} min={1} max={24} step={0.5}
            format={(v) => v.toFixed(1)} defaultValue={3}
            onChange={(strokeWidth) => set({ strokeWidth })} onCommit={commit} />
          <ColorField
            label="Stroke"
            value={first.stroke ?? INK}
            onChange={(stroke) => set({ stroke })}
            onCommit={commit}
          />
        </>
      ) : null}
    </div>
  )
}

// A selected image block: span controls, remove, and the door into the
// lab — the crit was that lab editing had no entry point from the
// design canvas, so the image you're LOOKING AT is the one you edit.
function ImageProperties({
  project,
  selectedIds,
}: {
  project: ProjectState
  selectedIds: string[]
}) {
  const apply = useStore((s) => s.apply)
  const setUi = useStore((s) => s.setUi)
  const router = useRouter()
  const images = project.images.filter((im) => selectedIds.includes(im.id))
  const first = images[0]
  if (!first) return null
  // no size dials here — the corner handles ON the image are the size
  // control; a second slider affordance for the same thing is noise
  return (
    <div className="panel-section">
      <div className="panel-heading">
        {images.length > 1 ? `${images.length} images` : 'Image'}
      </div>
      {images.length === 1 ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={first.src}
          alt=""
          style={{ display: 'block', width: '100%', borderRadius: 4, marginBottom: 8 }}
        />
      ) : null}
      <button
        className="ctl-action primary"
        onClick={() => {
          setLabHandoff({ src: first.src, name: 'design-image.png' })
          router.push('/lab')
        }}
      >
        Edit in Lab
      </button>
      <div className="panel-note">
        The lab opens with this image loaded. Export the result there and
        drop it back onto the canvas.
      </div>
      <button
        className="ctl-action"
        onClick={() => {
          apply({ images: project.images.filter((im) => !selectedIds.includes(im.id)) })
          setUi({ selectedImageIds: [] })
        }}
      >
        {images.length > 1 ? 'Remove images' : 'Remove image'}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared per-layer controls: opacity, blend, color, texture

function LayerControls({
  layer,
  project,
  patchLayer,
  setOpacityT,
  setDensityT,
  commit,
}: {
  layer: ShapeLayer
  project: ProjectState
  patchLayer: (id: string, patch: Partial<ShapeLayer>) => void
  setOpacityT: (v: number) => void
  setDensityT: (v: number) => void
  commit: () => void
}) {
  const roleHex = (i: number) => {
    const role = project.background.roles[i]
    return role ? BRAND_PALETTE.roles[role].base : PAPER
  }
  const colorOptions: { value: LayerColor; hex: string; label: string }[] = [
    { value: 'paper', hex: PAPER, label: 'Paper' },
    { value: 'ink', hex: INK, label: 'Ink' },
    { value: 'r0', hex: roleHex(0), label: 'R1' },
    { value: 'r1', hex: roleHex(1), label: 'R2' },
    { value: 'r2', hex: roleHex(2), label: 'R3' },
  ]
  const canSample = layer.type === 'cloner'
  const canTexture = layer.type === 'cloner'

  return (
    <div className="panel-section">
      <div className="panel-heading">Layer</div>
      <Slider label="Opacity" value={layer.opacity} min={0.05} max={1} format={pct} defaultValue={1}
        onChange={setOpacityT} onCommit={commit} />
      <SegmentedControl<LayerBlend>
        label="Blend"
        value={layer.blend}
        options={[
          { value: 'normal', label: 'Normal' },
          { value: 'multiply', label: 'Mult' },
          { value: 'screen', label: 'Screen' },
          { value: 'overlay', label: 'Overlay' },
        ]}
        onChange={(blend) => patchLayer(layer.id, { blend })}
      />
      {layer.type !== 'array' && layer.type !== 'organic' ? (
        <div className="layer-color-row">
          <span className="ctl-sub-label">Color</span>
          {colorOptions.map((o) => (
            <button
              key={o.value}
              className={`layer-swatch${layer.color === o.value ? ' active' : ''}`}
              style={{ background: o.hex }}
              title={o.label}
              onClick={() => patchLayer(layer.id, { color: o.value })}
            />
          ))}
          {canSample ? (
            <button
              className={`layer-swatch field-swatch${layer.color === 'sampled' ? ' active' : ''}`}
              title="FIELD — each shape samples the gradient beneath it"
              onClick={() => patchLayer(layer.id, { color: 'sampled' })}
            >
              F
            </button>
          ) : null}
        </div>
      ) : null}
      {canTexture ? (
        <>
          <SegmentedControl<LayerTexture>
            label="Texture"
            value={layer.texture}
            options={[
              { value: 'solid', label: 'Solid' },
              { value: 'dither', label: 'Dither' },
              { value: 'hatch', label: 'Hatch' },
              { value: 'dots', label: 'Dots' },
            ]}
            onChange={(texture) => patchLayer(layer.id, { texture })}
          />
          {layer.texture !== 'solid' ? (
            <Slider label="Weave" value={layer.texDensity} min={0} max={1} format={pct} defaultValue={0.5}
              onChange={setDensityT} onCommit={commit} />
          ) : null}
        </>
      ) : null}
    </div>
  )
}

// The effector's source: which drawn shapes it distributes. Bound shapes
// stay editable on the canvas — they are the masters; every instance the
// effector places follows them live. Empty = built-in glyph vocabulary.
function SourceControls({
  layer,
  project,
  selectedIds,
  bind,
  isolating,
  onIsolate,
}: {
  layer: ShapeLayer
  project: ProjectState
  selectedIds: string[]
  bind: (ids: string[]) => void
  isolating: boolean
  onIsolate: () => void
}) {
  const bound = layer.params.sourceShapeIds
  const liveIds = new Set([
    ...project.shapes.map((s) => s.id),
    ...project.typeBlocks.map((b) => b.id),
  ])
  const live = bound.filter((id) => liveIds.has(id))
  return (
    <div className="panel-section">
      <div className="panel-heading">Source</div>
      <div className="layer-add-row">
        <button
          className="ctl-action"
          disabled={!selectedIds.length}
          title="Bind the objects selected on the canvas (shapes or text) as this effector's source"
          onClick={() => bind([...selectedIds])}
        >
          Use selected{selectedIds.length ? ` (${selectedIds.length})` : ''}
        </button>
        {live.length ? (
          <>
            <button
              className={isolating ? 'ctl-action primary' : 'ctl-action'}
              title="Edit the masters in isolation — the canvas dims, the effector follows live (Esc exits)"
              onClick={onIsolate}
            >
              {isolating ? 'Done' : 'Edit sources'}
            </button>
            <button
              className="ctl-action"
              title="Back to the built-in glyph vocabulary"
              onClick={() => bind([])}
            >
              Clear
            </button>
          </>
        ) : null}
      </div>
      {live.length ? (
        <div className="panel-note">
          Bound objects leave the canvas — this effector renders them
          (they nest under it in the stack; × unbinds). EDIT SOURCES
          opens the masters while everything else dims; the instances
          follow your edits live.
        </div>
      ) : (
        <div className="panel-note">
          Nothing bound — built-in glyphs. Drag an object from CANVAS
          onto this effector in the stack, or select objects on the
          canvas and Use selected.
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Per-type parameter sections. `set` is transient (sliders), `setD`
// discrete (segmented/toggles) — one history entry per change.

const ORGANIC_PROTOS: { value: OrganicProto; label: string }[] = [
  { value: 'blob', label: 'Blob' },
  { value: 'super', label: 'Super' },
  { value: 'capsule', label: 'Capsule' },
  { value: 'star', label: 'Star' },
  { value: 'ribbon', label: 'Ribbon' },
  { value: 'circle', label: 'Circle' },
  { value: 'meta', label: 'Meta' },
]

function OrganicControls({
  params,
  set,
  setD,
  commit,
}: {
  params: OrganicState
  set: (p: Partial<OrganicState>) => void
  setD: (p: Partial<OrganicState>) => void
  commit: () => void
}) {
  const toggleProto = (proto: OrganicProto) => {
    const has = params.protos.includes(proto)
    if (has && params.protos.length === 1) return // the vocabulary never empties
    setD({ protos: has ? params.protos.filter((x) => x !== proto) : [...params.protos, proto] })
  }
  return (
    <>
      <button
        className="ctl-action primary"
        onClick={() => setD({ seed: (params.seed * 16807 + 11) % 2147483646 })}
      >
        Reseed
      </button>
      <SegmentedControl<OrganicState['distribution']>
        label="Spread"
        value={params.distribution}
        options={[
          { value: 'poisson', label: 'Poisson' },
          { value: 'phyllo', label: 'Phyllo' },
          { value: 'hex', label: 'Hex' },
          { value: 'curve', label: 'Curve' },
          { value: 'cluster', label: 'Cluster' },
        ]}
        onChange={(distribution) => setD({ distribution })}
      />
      <Slider label="Count" value={params.count} min={40} max={2400} step={20} format={int} defaultValue={900}
        onChange={(v) => set({ count: v })} onCommit={commit} />
      <Slider label="Spacing" value={params.spacing} min={0.01} max={0.09} step={0.002} format={pct} defaultValue={0.022}
        onChange={(v) => set({ spacing: v })} onCommit={commit} />
      {params.sourceShapeIds.length ? (
        <div className="panel-note">
          Form comes from the bound drawn shapes ({params.sourceShapeIds.length}) —
          clear SOURCE above to use the built-in vocabulary.
        </div>
      ) : (
        <>
          <div className="ctl-sub-label">Form</div>
          <div className="preset-strip">
            {ORGANIC_PROTOS.map((o) => (
              <button
                key={o.value}
                className={params.protos.includes(o.value) ? 'preset-chip active' : 'preset-chip'}
                onClick={() => toggleProto(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
      <Slider label="Size" value={params.size} min={0.008} max={0.1} step={0.002} format={pct} defaultValue={0.02}
        onChange={(v) => set({ size: v })} onCommit={commit} />
      <Slider label="Size var" value={params.sizeRange} min={0} max={1} format={pct} defaultValue={0.6}
        onChange={(v) => set({ sizeRange: v })} onCommit={commit} />
      <Slider label="Field size" value={params.sizeField} min={-1} max={1} format={pct} defaultValue={0.6}
        onChange={(v) => set({ sizeField: v })} onCommit={commit} />
      <div className="ctl-sub-label">Influence</div>
      <Slider label="Curve pull" value={params.curvePull} min={0} max={1} format={pct} defaultValue={0.7}
        onChange={(v) => set({ curvePull: v })} onCommit={commit} />
      <Slider label="Focal" value={params.focalStrength} min={0} max={1} format={pct} defaultValue={0}
        onChange={(v) => set({ focalStrength: v })} onCommit={commit} />
      <Slider label="Focal X" value={params.focalX} min={0} max={1} format={pct} defaultValue={0.5}
        onChange={(v) => set({ focalX: v })} onCommit={commit} />
      <Slider label="Focal Y" value={params.focalY} min={0} max={1} format={pct} defaultValue={0.5}
        onChange={(v) => set({ focalY: v })} onCommit={commit} />
      <Slider label="Noise" value={params.noiseAmount} min={0} max={1} format={pct} defaultValue={0.5}
        onChange={(v) => set({ noiseAmount: v })} onCommit={commit} />
      <Slider label="Noise scale" value={params.noiseScale} min={0.5} max={6} step={0.1} format={(v) => v.toFixed(1)} defaultValue={2.2}
        onChange={(v) => set({ noiseScale: v })} onCommit={commit} />
      <div className="ctl-sub-label">Variation</div>
      <SegmentedControl<OrganicState['rotation']>
        label="Turn"
        value={params.rotation}
        options={[
          { value: 'flow', label: 'Flow' },
          { value: 'tangent', label: 'Tangent' },
          { value: 'random', label: 'Random' },
          { value: 'fixed', label: 'Fixed' },
        ]}
        onChange={(rotation) => setD({ rotation })}
      />
      <Slider label="Turn jit" value={params.rotationJitter} min={0} max={1} format={pct} defaultValue={0.3}
        onChange={(v) => set({ rotationJitter: v })} onCommit={commit} />
      <Slider label="Field color" value={params.colorField} min={0} max={1} format={pct} defaultValue={0.5}
        onChange={(v) => set({ colorField: v })} onCommit={commit} />
      <Slider label="Opacity var" value={params.opacityRange} min={0} max={1} format={pct} defaultValue={0.25}
        onChange={(v) => set({ opacityRange: v })} onCommit={commit} />
      <div className="ctl-sub-label">Finish</div>
      <Slider label="Goo" value={params.goo} min={0} max={1} format={pct} defaultValue={0.35}
        onChange={(v) => set({ goo: v })} onCommit={commit} />
      <Slider label="Soft" value={params.soft} min={0} max={1} format={pct} defaultValue={0.25}
        onChange={(v) => set({ soft: v })} onCommit={commit} />
      <Slider label="Grain" value={params.grain} min={0} max={1} format={pct} defaultValue={0.2}
        onChange={(v) => set({ grain: v })} onCommit={commit} />
      <div className="panel-note">
        The procedural composition engine: a seeded distribution lays the
        points, fields (curve distance, focal falloff, coherent noise)
        shape density, size, color and orientation, and the raster finish
        fuses it — Goo melts neighbors into one body, grain prints it.
        Every choice is deterministic per seed; RESEED deals again.
      </div>
    </>
  )
}

const SHAPE_OPTIONS: { value: SheetShape; label: string }[] = [
  { value: 'circle', label: 'Circle' },
  { value: 'square', label: 'Square' },
  { value: 'triangle', label: 'Tri' },
  { value: 'half', label: 'Half' },
  { value: 'quarter', label: 'Qtr' },
  { value: 'cross', label: 'Cross' },
  { value: 'meta', label: 'Meta' },
  { value: 'mixed', label: 'Mix' },
]

function ClonerControls({
  params,
  set,
  setD,
  commit,
}: {
  params: ClonerState
  set: (p: Partial<ClonerState>) => void
  setD: (p: Partial<ClonerState>) => void
  commit: () => void
}) {
  const grid = params.mode === 'grid'
  const radial = params.mode === 'radial'
  const linear = params.mode === 'linear'
  const curveMode = params.mode === 'curve'
  return (
    <>
      <SegmentedControl<ClonerState['mode']>
        label="Mode"
        value={params.mode}
        options={[
          { value: 'grid', label: 'Grid' },
          { value: 'radial', label: 'Radial' },
          { value: 'linear', label: 'Linear' },
          { value: 'curve', label: 'Curve' },
        ]}
        onChange={(mode) => setD({ mode })}
      />
      {params.sourceShapeIds.length ? null : (
        <SegmentedControl<SheetShape>
          label="Shape"
          value={params.shape}
          options={SHAPE_OPTIONS}
          onChange={(shape) => setD({ shape })}
        />
      )}
      {grid ? (
        <>
          <SegmentedControl<'grid' | 'packed'>
            label="Layout"
            value={params.layout}
            options={[
              { value: 'grid', label: 'Uniform' },
              { value: 'packed', label: 'Packed' },
            ]}
            onChange={(layout) => setD({ layout })}
          />
          <Slider label="Count X" value={params.countX} min={2} max={64} step={1} format={int} defaultValue={8}
            onChange={(v) => set({ countX: v })} onCommit={commit} />
          <Slider label="Count Y" value={params.countY} min={2} max={80} step={1} format={int} defaultValue={10}
            onChange={(v) => set({ countY: v })} onCommit={commit} />
          <Slider label="Size" value={params.size} min={0.1} max={0.9} step={0.05} format={pct} defaultValue={0.5}
            onChange={(v) => set({ size: v })} onCommit={commit} />
          <Slider label="Random" value={params.random} min={0} max={1} format={pct} defaultValue={0}
            onChange={(v) => set({ random: v })} onCommit={commit} />
          <Slider label="Noise" value={params.noise} min={0} max={1} format={pct} defaultValue={0}
            onChange={(v) => set({ noise: v })} onCommit={commit} />
          <Slider label="Stroke mix" value={params.strokeMix} min={0} max={1} format={pct} defaultValue={0}
            onChange={(v) => set({ strokeMix: v })} onCommit={commit} />
          <Slider label="Curve" value={params.curve} min={0} max={1} format={pct} defaultValue={0}
            onChange={(v) => set({ curve: v })} onCommit={commit} />
          <div className="panel-note">
            An exact grid by default — the dashed frame on the canvas is
            its bounds: drag to place, corner-resize to size, double-click
            for full bleed. Random adds jitter, noise varies the
            population in patches, Curve swells clones along the figure,
            Packed subdivides recursively.
          </div>
        </>
      ) : (
        <>
          <Slider label="Count" value={params.count} min={2} max={48} step={1} format={int} defaultValue={12}
            onChange={(v) => set({ count: v })} onCommit={commit} />
          <Slider label="Size" value={params.stampSize} min={0.02} max={0.3} step={0.005} format={pct} defaultValue={0.08}
            onChange={(v) => set({ stampSize: v })} onCommit={commit} />
          {curveMode ? null : (
            <>
              <Slider label="Origin X" value={params.originX} min={0} max={1} step={0.01} format={pct} defaultValue={0.5}
                onChange={(v) => set({ originX: v })} onCommit={commit} />
              <Slider label="Origin Y" value={params.originY} min={0} max={1} step={0.01} format={pct} defaultValue={0.5}
                onChange={(v) => set({ originY: v })} onCommit={commit} />
            </>
          )}
          {linear ? (
            <>
              <Slider label="Step X" value={params.stepX} min={-0.2} max={0.2} step={0.005} format={pct} defaultValue={0.05}
                onChange={(v) => set({ stepX: v })} onCommit={commit} />
              <Slider label="Step Y" value={params.stepY} min={-0.2} max={0.2} step={0.005} format={pct} defaultValue={0.035}
                onChange={(v) => set({ stepY: v })} onCommit={commit} />
            </>
          ) : null}
          {radial ? (
            <>
              <Slider label="Radius" value={params.radius} min={0.05} max={0.6} step={0.01} format={pct} defaultValue={0.28}
                onChange={(v) => set({ radius: v })} onCommit={commit} />
              <Slider label="Span" value={params.span} min={Math.PI / 6} max={Math.PI * 2} step={Math.PI / 36} format={deg} defaultValue={Math.PI * 2}
                onChange={(v) => set({ span: v })} onCommit={commit} />
            </>
          ) : null}
          <Slider label="Rotate" value={params.rotate} min={-Math.PI / 4} max={Math.PI / 4} step={Math.PI / 180}
            format={deg} defaultValue={0}
            onChange={(v) => set({ rotate: v })} onCommit={commit} />
          <Slider label="Scale step" value={params.scaleStep} min={0.7} max={1.3} step={0.01} format={pct} defaultValue={1}
            onChange={(v) => set({ scaleStep: v })} onCommit={commit} />
          <Slider label="Fade" value={params.fade} min={0} max={1} format={pct} defaultValue={0}
            onChange={(v) => set({ fade: v })} onCommit={commit} />
          <Toggle
            label="Stroke"
            value={params.stroked}
            onChange={(stroked) => setD({ stroked })}
          />
          <div className="panel-note">
            An accumulating echo: ROTATE, SCALE STEP and FADE sweep across
            the copies. Linear cascades from the origin, radial fans and
            rosettes on their spokes, curve rides the figure itself —
            copies sit at equal distances along the mark, turned to its
            direction of travel.
          </div>
        </>
      )}
    </>
  )
}

function ArrayControls({
  params,
  project,
  set,
  setD,
  commit,
}: {
  params: ImageArrayState
  project: ProjectState
  set: (p: Partial<ImageArrayState>) => void
  setD: (p: Partial<ImageArrayState>) => void
  commit: () => void
}) {
  const apply = useStore((s) => s.apply)
  const fileRef = useRef<HTMLInputElement>(null)
  const [dropHot, setDropHot] = useState(false)

  // array assets live in project.images with an arr- prefix: available to
  // array layers, invisible to the grid's image blocks
  const addAsset = async (files: FileList | null) => {
    if (!files?.length) return
    try {
      const src = await importImageFile(files[0])
      const id = `arr-${Date.now().toString(36)}`
      apply({
        images: [
          ...project.images,
          { id, src, anchor: { col: 0, row: 0, colSpan: 1, rowSpan: 1 } },
        ],
      })
      setD({ imageId: id })
    } catch {
      // unreadable file — skip it
    }
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          void addAsset(e.target.files)
          e.target.value = ''
        }}
      />
      <div
        className={`array-dropzone${dropHot ? ' hot' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDropHot(true)
        }}
        onDragLeave={() => setDropHot(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDropHot(false)
          void addAsset(e.dataTransfer.files)
        }}
      >
        <button className="ctl-action" onClick={() => fileRef.current?.click()}>
          Add image — or drop one here
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
                    (params.imageId ?? project.images[0]?.id) === im.id
                      ? 'img-thumb bg-active'
                      : 'img-thumb'
                  }
                  onClick={() => setD({ imageId: im.id })}
                />
                {im.id.startsWith('arr-') ? (
                  <button
                    className="thumb-remove"
                    aria-label="Remove array image"
                    onClick={() => {
                      apply({ images: project.images.filter((x) => x.id !== im.id) })
                      if (params.imageId === im.id) setD({ imageId: null })
                    }}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <Slider label="Cells" value={params.cells} min={16} max={96} step={1} format={int} defaultValue={48}
        onChange={(v) => set({ cells: v })} onCommit={commit} />
      <Slider label="Size" value={params.size} min={0.2} max={1} step={0.05} format={pct} defaultValue={0.7}
        onChange={(v) => set({ size: v })} onCommit={commit} />
      <Slider label="Threshold" value={params.threshold} min={0.1} max={1} step={0.02} format={pct} defaultValue={0.72}
        onChange={(v) => set({ threshold: v })} onCommit={commit} />
      <Slider label="Blend" value={params.blend} min={0} max={1} format={pct} defaultValue={0}
        onChange={(v) => set({ blend: v })} onCommit={commit} />
      <Toggle
        label="Invert"
        value={params.invert}
        onChange={(invert) => setD({ invert })}
      />
      <div className="panel-note">
        An image re-drawn as a glyph array: darkness picks the mark, color
        deals from the palette, BLEND pulls glyphs toward the image&apos;s
        own color. ADD IMAGE keeps the asset array-only; grid images work
        too.
      </div>
    </>
  )
}

function TilesControls({
  params,
  project,
  set,
  setD,
  commit,
}: {
  params: TilesState
  project: ProjectState
  set: (p: Partial<TilesState>) => void
  setD: (p: Partial<TilesState>) => void
  commit: () => void
}) {
  const roleHex = (i: number) => {
    const role = project.background.roles[i]
    return role ? BRAND_PALETTE.roles[role].base : PAPER
  }
  const inkOptions: { value: LayerColor; hex: string; label: string }[] = [
    { value: 'paper', hex: PAPER, label: 'Paper' },
    { value: 'ink', hex: INK, label: 'Ink' },
    { value: 'r0', hex: roleHex(0), label: 'R1' },
    { value: 'r1', hex: roleHex(1), label: 'R2' },
    { value: 'r2', hex: roleHex(2), label: 'R3' },
  ]
  return (
    <>
      <button
        className="ctl-action primary"
        onClick={() => setD({ seed: (params.seed * 16807 + 11) % 2147483646 })}
      >
        Reseed
      </button>
      <div className="layer-color-row">
        <span className="ctl-sub-label">Ink B</span>
        {inkOptions.map((o) => (
          <button
            key={o.value}
            className={`layer-swatch${(params.colorB ?? 'ink') === o.value ? ' active' : ''}`}
            style={{ background: o.hex }}
            title={`${o.label} — the counter ink Duo deals to`}
            onClick={() => setD({ colorB: o.value })}
          />
        ))}
      </div>
      <SegmentedControl<TilesState['style']>
        label="Style"
        value={params.style}
        options={[
          { value: 'checker', label: 'Checker' },
          { value: 'rings', label: 'Rings' },
        ]}
        onChange={(style) => setD({ style })}
      />
      <Slider label="Cols" value={params.cols} min={4} max={32} step={1} format={int} defaultValue={14}
        onChange={(v) => set({ cols: v })} onCommit={commit} />
      <Slider label="Density" value={params.density} min={0} max={1} format={pct} defaultValue={0.55}
        onChange={(v) => set({ density: v })} onCommit={commit} />
      {params.style === 'checker' ? (
        <>
          <Slider label="Levels" value={params.levels} min={1} max={3} step={1} format={int} defaultValue={3}
            onChange={(v) => set({ levels: v })} onCommit={commit} />
          <Slider label="Weight" value={params.weight} min={0} max={1} format={pct} defaultValue={0.35}
            onChange={(v) => set({ weight: v })} onCommit={commit} />
        </>
      ) : (
        <Slider label="Rings" value={params.rings} min={2} max={10} step={1} format={int} defaultValue={6}
          onChange={(v) => set({ rings: v })} onCommit={commit} />
      )}
      <Slider label="Curve" value={params.curve} min={0} max={1} format={pct} defaultValue={0.6}
        onChange={(v) => set({ curve: v })} onCommit={commit} />
      <Slider label="Duo" value={params.duo} min={0} max={1} format={pct} defaultValue={0.35}
        onChange={(v) => set({ duo: v })} onCommit={commit} />
      <div className="panel-note">
        Flush modular tiles — cells fill their bounds, so neighbors
        connect. Checker deals solid and subdivided cells with the
        lattice drawn over them; Rings spins quarter-arc bands per cell
        and the weave appears where arcs meet. Curve clusters the fine
        state along the figure; Duo deals the counter ink.
      </div>
    </>
  )
}

function ClonesControls({
  params,
  set,
  commit,
}: {
  params: ContourState
  set: (p: Partial<ContourState>) => void
  commit: () => void
}) {
  return (
    <>
      <Slider label="Count" value={params.count} min={1} max={14} step={1} format={int} defaultValue={7}
        onChange={(v) => set({ count: v })} onCommit={commit} />
      <Slider label="Spacing" value={params.spacing} min={0.01} max={0.16} step={0.005} format={pct} defaultValue={0.045}
        onChange={(v) => set({ spacing: v })} onCommit={commit} />
      <Slider label="Growth" value={params.growth} min={1} max={2.2} step={0.05} format={pct} defaultValue={1.35}
        onChange={(v) => set({ growth: v })} onCommit={commit} />
      <Slider label="Weight" value={params.weight} min={0.5} max={4} step={0.25}
        format={(v) => `${v.toFixed(2)}px`} defaultValue={1.5}
        onChange={(v) => set({ weight: v })} onCommit={commit} />
      <div className="ctl-sub-label">Effectors</div>
      <Slider label="Step" value={params.step} min={0} max={1} format={pct} defaultValue={0}
        onChange={(v) => set({ step: v })} onCommit={commit} />
      <Slider label="Random" value={params.random} min={0} max={1} format={pct} defaultValue={0}
        onChange={(v) => set({ random: v })} onCommit={commit} />
      <Slider label="Depth" value={params.depth} min={0} max={1} format={pct} defaultValue={0}
        onChange={(v) => set({ depth: v })} onCommit={commit} />
      <div className="panel-note">
        The curve echoed as nested contour offsets — field lines around
        the mark. STEP fades the family outward, RANDOM jitters, DEPTH
        stacks it in 2.5D.
      </div>
    </>
  )
}

function PatternControls({
  params,
  set,
  setD,
  commit,
}: {
  params: PatternState
  set: (p: Partial<PatternState>) => void
  setD: (p: Partial<PatternState>) => void
  commit: () => void
}) {
  return (
    <>
      <SegmentedControl<'lattice' | 'trace'>
        label="Mode"
        value={params.mode}
        options={[
          { value: 'lattice', label: 'Lattice' },
          { value: 'trace', label: 'Trace' },
        ]}
        onChange={(mode) => setD({ mode })}
      />
      <Slider label="Cells" value={params.cells} min={12} max={64} step={1} format={int} defaultValue={32}
        onChange={(v) => set({ cells: v })} onCommit={commit} />
      <Slider label="Size" value={params.size} min={0.2} max={1} step={0.05} format={pct} defaultValue={0.55}
        onChange={(v) => set({ size: v })} onCommit={commit} />
      <Slider label="Range" value={params.range} min={0.5} max={4} step={0.1} format={(v) => v.toFixed(1)} defaultValue={1.6}
        onChange={(v) => set({ range: v })} onCommit={commit} />
      <div className="panel-note">
        A lattice of primitives whose state flips where the curve passes —
        the figure appears by substitution.
      </div>
    </>
  )
}
