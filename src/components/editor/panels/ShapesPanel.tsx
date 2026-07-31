'use client'

import { useRef, useState } from 'react'
import { useStore } from '@/core/state/store'
import { Slider } from '@/components/controls/Slider'
import { SegmentedControl } from '@/components/controls/SegmentedControl'
import { Toggle } from '@/components/controls/Toggle'
import { importImageFile } from '@/core/images'
import { createShapeLayer, LAYER_TYPE_LABELS } from '@/core/state/defaults'
import type {
  ClonerState,
  ImageArrayState,
  LayerBlend,
  LayerColor,
  LayerTexture,
  PatternState,
  ProjectState,
  RepeaterState,
  ShapeLayer,
  ShapeLayerType,
  SheetShape,
  SheetState,
} from '@/core/state/types'
import { BRAND_PALETTE } from '@/core/color/palette'
import { INK, PAPER } from '@/core/state/defaults'

const pct = (v: number) => `${Math.round(v * 100)}`
const int = (v: number) => String(Math.round(v))
const deg = (v: number) => `${Math.round((v * 180) / Math.PI)}°`

const ADD_ORDER: ShapeLayerType[] = ['sheet', 'repeater', 'array', 'clones', 'pattern']

// The SHAPES panel is a LAYER STACK now — the Shader Lab model. Every
// register is a layer type you instantiate: add as many as you want,
// reorder, hide, blend. The selected layer's controls render below the
// stack.
export function ShapesPanel() {
  const project = useStore((s) => s.project)
  const apply = useStore((s) => s.apply)
  const setT = useStore((s) => s.setTransient)
  const commit = useStore((s) => s.commitTransient)
  const ui = useStore((s) => s.ui)
  const setUi = useStore((s) => s.setUi)

  const layers = project.layers
  const selected =
    layers.find((l) => l.id === ui.selectedLayerId) ?? layers[layers.length - 1]

  const addLayer = (type: ShapeLayerType) => {
    const layer = createShapeLayer(type, layers)
    apply({ layers: [...layers, layer] })
    setUi({ selectedLayerId: layer.id })
  }

  const removeLayer = (id: string) => {
    apply({ layers: layers.filter((l) => l.id !== id) })
    if (ui.selectedLayerId === id) setUi({ selectedLayerId: undefined })
  }

  // drag-and-drop reorder: `gap` is an insertion slot in DISPLAY space
  // (0 = very top of the stack = end of the array)
  const reorderLayer = (id: string, gap: number) => {
    const displayed = [...layers].reverse()
    const from = displayed.findIndex((l) => l.id === id)
    if (from < 0) return
    const moved = displayed[from]
    const without = displayed.filter((l) => l.id !== id)
    const insert = from < gap ? gap - 1 : gap
    without.splice(insert, 0, moved)
    const next = [...without].reverse()
    if (next.every((l, i) => l.id === layers[i].id)) return // no-op drop
    apply({ layers: next })
  }

  const duplicateLayer = (id: string) => {
    const i = layers.findIndex((l) => l.id === id)
    if (i < 0) return
    const src = layers[i]
    const copy = {
      ...src,
      id: `ly-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: `${src.name} COPY`,
      params: { ...src.params },
    } as ShapeLayer
    const next = [...layers]
    next.splice(i + 1, 0, copy)
    apply({ layers: next })
    setUi({ selectedLayerId: copy.id })
  }

  const renameLayer = (id: string, name: string) => {
    const clean = name.trim().toUpperCase().slice(0, 24)
    if (!clean) return
    apply({
      layers: layers.map((l) => (l.id === id ? ({ ...l, name: clean } as ShapeLayer) : l)),
    })
  }

  // discrete layer field change (toggles, chips): one history entry
  const patchLayer = (id: string, patch: Partial<ShapeLayer>) => {
    apply({
      layers: layers.map((l) => (l.id === id ? ({ ...l, ...patch } as ShapeLayer) : l)),
    })
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
      <div className="panel-section">
        <div className="panel-heading">LAYERS</div>
        <div className="layer-add-row">
          {ADD_ORDER.map((t) => (
            <button key={t} className="ctl-action" onClick={() => addLayer(t)}>
              + {LAYER_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        {layers.length ? (
          <LayerStack
            layers={layers}
            selectedId={selected?.id}
            onSelect={(id) => setUi({ selectedLayerId: id })}
            onReorder={reorderLayer}
            onToggle={(id, visible) => patchLayer(id, { visible })}
            onRemove={removeLayer}
            onDuplicate={duplicateLayer}
            onRename={renameLayer}
          />
        ) : (
          <div className="panel-note">
            No shape layers yet. Add one — layers stack bottom-up over the
            color field, each with its own blend, color and texture.
          </div>
        )}
      </div>

      {selected ? (
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
          <div className="panel-section">
            <div className="panel-heading">{selected.name} SETTINGS</div>
            {selected.type === 'sheet' ? (
              <SheetControls
                params={selected.params}
                set={(p) => patchParamsT(selected.id, p)}
                setD={(p) => patchParams(selected.id, p)}
                commit={commit}
              />
            ) : selected.type === 'repeater' ? (
              <RepeaterControls
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

// ---------------------------------------------------------------------------
// The layer stack list: pointer-drag reordering (click still selects —
// a drag only starts after a 5px move), double-click rename, duplicate,
// visibility and delete on hover-revealed tools.

const TYPE_GLYPHS: Record<ShapeLayerType, string> = {
  sheet: '▦',
  repeater: '◎',
  array: '▣',
  clones: '◌',
  pattern: '∷',
}

function LayerStack({
  layers,
  selectedId,
  onSelect,
  onReorder,
  onToggle,
  onRemove,
  onDuplicate,
  onRename,
}: {
  layers: ShapeLayer[]
  selectedId?: string
  onSelect: (id: string) => void
  onReorder: (id: string, gap: number) => void
  onToggle: (id: string, visible: boolean) => void
  onRemove: (id: string) => void
  onDuplicate: (id: string) => void
  onRename: (id: string, name: string) => void
}) {
  const displayed = [...layers].reverse()
  const listRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ id: string; gap: number | null } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const info = useRef<{
    id: string
    startY: number
    active: boolean
    mids: number[]
    gap: number | null
  } | null>(null)

  const onPointerDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    // tool buttons and the rename input never start a drag
    if (target.closest('.layer-tools') || target.tagName === 'INPUT') return
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      // synthetic events carry no live pointer — the drag still tracks
    }
    info.current = { id, startY: e.clientY, active: false, mids: [], gap: null }
  }

  const onPointerMove = (e: React.PointerEvent, id: string) => {
    const st = info.current
    if (!st || st.id !== id) return
    if (!st.active) {
      if (Math.abs(e.clientY - st.startY) < 5) return
      st.active = true
      const rows = listRef.current?.querySelectorAll('.layer-row') ?? []
      st.mids = [...rows].map((r) => {
        const b = (r as HTMLElement).getBoundingClientRect()
        return (b.top + b.bottom) / 2
      })
    }
    let gap = st.mids.length
    for (let i = 0; i < st.mids.length; i++) {
      if (e.clientY < st.mids[i]) {
        gap = i
        break
      }
    }
    st.gap = gap
    setDrag({ id, gap })
  }

  const onPointerUp = (id: string) => {
    const st = info.current
    info.current = null
    if (!st) return
    if (!st.active) {
      onSelect(id)
      return
    }
    setDrag(null)
    if (st.gap !== null) onReorder(id, st.gap)
  }

  const commitRename = (id: string, value: string) => {
    setEditingId(null)
    onRename(id, value)
  }

  return (
    <div className={`layer-stack${drag ? ' dragging-list' : ''}`} ref={listRef}>
      {displayed.map((l, di) => {
        const classes = [
          'layer-row',
          selectedId === l.id ? 'active' : '',
          l.visible ? '' : 'hidden-layer',
          drag?.id === l.id ? 'dragging' : '',
          drag && drag.gap === di ? 'drop-above' : '',
          drag && di === displayed.length - 1 && drag.gap === displayed.length
            ? 'drop-below'
            : '',
        ]
          .filter(Boolean)
          .join(' ')
        return (
          <div
            key={l.id}
            className={classes}
            onPointerDown={(e) => onPointerDown(e, l.id)}
            onPointerMove={(e) => onPointerMove(e, l.id)}
            onPointerUp={() => onPointerUp(l.id)}
          >
            <span className="layer-grip" aria-hidden>
              ⋮⋮
            </span>
            <span className="layer-type-glyph" aria-hidden>
              {TYPE_GLYPHS[l.type]}
            </span>
            {editingId === l.id ? (
              <input
                className="layer-rename"
                defaultValue={l.name}
                autoFocus
                onFocus={(e) => e.currentTarget.select()}
                onBlur={(e) => commitRename(l.id, e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (e.key === 'Escape') setEditingId(null)
                }}
              />
            ) : (
              <span
                className="layer-name"
                title="Double-click to rename"
                onDoubleClick={() => setEditingId(l.id)}
              >
                {l.name}
              </span>
            )}
            <span className="layer-tools">
              <button
                className="layer-tool"
                aria-label="Duplicate layer"
                title="Duplicate"
                onClick={() => onDuplicate(l.id)}
              >
                ⧉
              </button>
              <button
                className="layer-tool"
                aria-label={l.visible ? 'Hide layer' : 'Show layer'}
                title={l.visible ? 'Hide' : 'Show'}
                onClick={() => onToggle(l.id, !l.visible)}
              >
                {l.visible ? '●' : '○'}
              </button>
              <button
                className="layer-tool"
                aria-label="Delete layer"
                title="Delete"
                onClick={() => onRemove(l.id)}
              >
                ×
              </button>
            </span>
          </div>
        )
      })}
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
    { value: 'paper', hex: PAPER, label: 'PAPER' },
    { value: 'ink', hex: INK, label: 'INK' },
    { value: 'r0', hex: roleHex(0), label: 'R1' },
    { value: 'r1', hex: roleHex(1), label: 'R2' },
    { value: 'r2', hex: roleHex(2), label: 'R3' },
  ]
  const canSample = layer.type === 'sheet' || layer.type === 'repeater'
  const canTexture = layer.type === 'sheet' || layer.type === 'repeater'

  return (
    <div className="panel-section">
      <div className="panel-heading">LAYER</div>
      <Slider label="OPACITY" value={layer.opacity} min={0.05} max={1} format={pct} defaultValue={1}
        onChange={setOpacityT} onCommit={commit} />
      <SegmentedControl<LayerBlend>
        label="BLEND"
        value={layer.blend}
        options={[
          { value: 'normal', label: 'NORMAL' },
          { value: 'multiply', label: 'MULT' },
          { value: 'screen', label: 'SCREEN' },
          { value: 'overlay', label: 'OVERLAY' },
        ]}
        onChange={(blend) => patchLayer(layer.id, { blend })}
      />
      {layer.type !== 'array' ? (
        <div className="layer-color-row">
          <span className="ctl-sub-label">COLOR</span>
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
            label="TEXTURE"
            value={layer.texture}
            options={[
              { value: 'solid', label: 'SOLID' },
              { value: 'dither', label: 'DITHER' },
              { value: 'hatch', label: 'HATCH' },
              { value: 'dots', label: 'DOTS' },
            ]}
            onChange={(texture) => patchLayer(layer.id, { texture })}
          />
          {layer.texture !== 'solid' ? (
            <Slider label="WEAVE" value={layer.texDensity} min={0} max={1} format={pct} defaultValue={0.5}
              onChange={setDensityT} onCommit={commit} />
          ) : null}
        </>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Per-type parameter sections. `set` is transient (sliders), `setD`
// discrete (segmented/toggles) — one history entry per change.

const SHAPE_OPTIONS: { value: SheetShape; label: string }[] = [
  { value: 'circle', label: 'CIRCLE' },
  { value: 'square', label: 'SQUARE' },
  { value: 'triangle', label: 'TRI' },
  { value: 'half', label: 'HALF' },
  { value: 'quarter', label: 'QTR' },
  { value: 'cross', label: 'CROSS' },
  { value: 'meta', label: 'META' },
  { value: 'mixed', label: 'MIX' },
]

function SheetControls({
  params,
  set,
  setD,
  commit,
}: {
  params: SheetState
  set: (p: Partial<SheetState>) => void
  setD: (p: Partial<SheetState>) => void
  commit: () => void
}) {
  return (
    <>
      <SegmentedControl<SheetShape>
        label="SHAPE"
        value={params.shape}
        options={SHAPE_OPTIONS}
        onChange={(shape) => setD({ shape })}
      />
      <SegmentedControl<'grid' | 'packed'>
        label="LAYOUT"
        value={params.layout}
        options={[
          { value: 'grid', label: 'GRID' },
          { value: 'packed', label: 'PACKED' },
        ]}
        onChange={(layout) => setD({ layout })}
      />
      <Slider label="COUNT X" value={params.countX} min={2} max={64} step={1} format={int}
        onChange={(v) => set({ countX: v })} onCommit={commit} />
      <Slider label="COUNT Y" value={params.countY} min={2} max={80} step={1} format={int}
        onChange={(v) => set({ countY: v })} onCommit={commit} />
      <Slider label="LAYERS" value={params.countZ} min={1} max={3} step={1} format={int}
        onChange={(v) => set({ countZ: v })} onCommit={commit} />
      <Slider label="SIZE" value={params.size} min={0.1} max={0.9} step={0.05} format={pct}
        onChange={(v) => set({ size: v })} onCommit={commit} />
      <Slider label="DEPTH" value={params.depth} min={0} max={1} format={pct} defaultValue={0.35}
        onChange={(v) => set({ depth: v })} onCommit={commit} />
      <Slider label="RANDOM" value={params.random} min={0} max={1} format={pct} defaultValue={0.15}
        onChange={(v) => set({ random: v })} onCommit={commit} />
      <Slider label="NOISE" value={params.noise} min={0} max={1} format={pct} defaultValue={0.6}
        onChange={(v) => set({ noise: v })} onCommit={commit} />
      <Slider label="STROKE MIX" value={params.strokeMix} min={0} max={1} format={pct} defaultValue={0.35}
        onChange={(v) => set({ strokeMix: v })} onCommit={commit} />
      <Slider label="CURVE" value={params.curve} min={0} max={1} format={pct} defaultValue={0}
        onChange={(v) => set({ curve: v })} onCommit={commit} />
      <div className="panel-note">
        The grid cloner. PACKED subdivides recursively; RANDOM is per-clone
        jitter; NOISE varies size, stroke and shape in coherent patches;
        CURVE is the field effector — clones swell along the figure and
        fill inside its lobes.
      </div>
    </>
  )
}

function RepeaterControls({
  params,
  set,
  setD,
  commit,
}: {
  params: RepeaterState
  set: (p: Partial<RepeaterState>) => void
  setD: (p: Partial<RepeaterState>) => void
  commit: () => void
}) {
  return (
    <>
      <SegmentedControl<'linear' | 'radial' | 'grid'>
        label="MODE"
        value={params.mode}
        options={[
          { value: 'linear', label: 'LINEAR' },
          { value: 'radial', label: 'RADIAL' },
          { value: 'grid', label: 'GRID' },
        ]}
        onChange={(mode) => setD({ mode })}
      />
      <SegmentedControl<SheetShape>
        label="SHAPE"
        value={params.shape}
        options={SHAPE_OPTIONS}
        onChange={(shape) => setD({ shape })}
      />
      {params.mode === 'grid' ? (
        <>
          <Slider label="COUNT X" value={params.countX} min={2} max={12} step={1} format={int}
            onChange={(v) => set({ countX: v })} onCommit={commit} />
          <Slider label="COUNT Y" value={params.countY} min={2} max={12} step={1} format={int}
            onChange={(v) => set({ countY: v })} onCommit={commit} />
        </>
      ) : (
        <Slider label="COUNT" value={params.count} min={2} max={48} step={1} format={int}
          onChange={(v) => set({ count: v })} onCommit={commit} />
      )}
      <Slider label="SIZE" value={params.size} min={0.02} max={0.3} step={0.005} format={pct}
        onChange={(v) => set({ size: v })} onCommit={commit} />
      <Slider label="ORIGIN X" value={params.originX} min={0} max={1} step={0.01} format={pct} defaultValue={0.5}
        onChange={(v) => set({ originX: v })} onCommit={commit} />
      <Slider label="ORIGIN Y" value={params.originY} min={0} max={1} step={0.01} format={pct} defaultValue={0.5}
        onChange={(v) => set({ originY: v })} onCommit={commit} />
      {params.mode !== 'radial' ? (
        <>
          <Slider label="STEP X" value={params.stepX} min={-0.2} max={0.2} step={0.005} format={pct} defaultValue={0.05}
            onChange={(v) => set({ stepX: v })} onCommit={commit} />
          <Slider label="STEP Y" value={params.stepY} min={-0.2} max={0.2} step={0.005} format={pct} defaultValue={0.035}
            onChange={(v) => set({ stepY: v })} onCommit={commit} />
        </>
      ) : (
        <>
          <Slider label="RADIUS" value={params.radius} min={0.05} max={0.6} step={0.01} format={pct}
            onChange={(v) => set({ radius: v })} onCommit={commit} />
          <Slider label="SPAN" value={params.span} min={Math.PI / 6} max={Math.PI * 2} step={Math.PI / 36} format={deg}
            onChange={(v) => set({ span: v })} onCommit={commit} />
        </>
      )}
      <Slider label="ROTATE" value={params.rotate} min={-Math.PI / 4} max={Math.PI / 4} step={Math.PI / 180}
        format={deg} defaultValue={0}
        onChange={(v) => set({ rotate: v })} onCommit={commit} />
      <Slider label="SCALE STEP" value={params.scaleStep} min={0.7} max={1.3} step={0.01} format={pct} defaultValue={1}
        onChange={(v) => set({ scaleStep: v })} onCommit={commit} />
      <Slider label="FADE" value={params.fade} min={0} max={1} format={pct} defaultValue={0.2}
        onChange={(v) => set({ fade: v })} onCommit={commit} />
      <Toggle
        label="STROKE"
        value={params.stroked}
        onChange={(stroked) => setD({ stroked })}
      />
      <div className="panel-note">
        One seed shape echoed with an accumulating step. LINEAR cascades;
        RADIAL fans and rosettes riding their spokes; GRID a lattice with
        the turn and scale sweeping in reading order.
      </div>
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
          ADD IMAGE — OR DROP ONE HERE
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
      <Slider label="CELLS" value={params.cells} min={16} max={96} step={1} format={int}
        onChange={(v) => set({ cells: v })} onCommit={commit} />
      <Slider label="SIZE" value={params.size} min={0.2} max={1} step={0.05} format={pct}
        onChange={(v) => set({ size: v })} onCommit={commit} />
      <Slider label="THRESHOLD" value={params.threshold} min={0.1} max={1} step={0.02} format={pct}
        onChange={(v) => set({ threshold: v })} onCommit={commit} />
      <Slider label="BLEND" value={params.blend} min={0} max={1} format={pct} defaultValue={0}
        onChange={(v) => set({ blend: v })} onCommit={commit} />
      <Toggle
        label="INVERT"
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

function ClonesControls({
  params,
  set,
  commit,
}: {
  params: ClonerState
  set: (p: Partial<ClonerState>) => void
  commit: () => void
}) {
  return (
    <>
      <Slider label="COUNT" value={params.count} min={1} max={14} step={1} format={int}
        onChange={(v) => set({ count: v })} onCommit={commit} />
      <Slider label="SPACING" value={params.spacing} min={0.01} max={0.16} step={0.005} format={pct}
        onChange={(v) => set({ spacing: v })} onCommit={commit} />
      <Slider label="GROWTH" value={params.growth} min={1} max={2.2} step={0.05} format={pct}
        onChange={(v) => set({ growth: v })} onCommit={commit} />
      <Slider label="WEIGHT" value={params.weight} min={0.5} max={4} step={0.25}
        format={(v) => `${v.toFixed(2)}px`}
        onChange={(v) => set({ weight: v })} onCommit={commit} />
      <div className="ctl-sub-label">EFFECTORS</div>
      <Slider label="STEP" value={params.step} min={0} max={1} format={pct} defaultValue={0}
        onChange={(v) => set({ step: v })} onCommit={commit} />
      <Slider label="RANDOM" value={params.random} min={0} max={1} format={pct} defaultValue={0}
        onChange={(v) => set({ random: v })} onCommit={commit} />
      <Slider label="DEPTH" value={params.depth} min={0} max={1} format={pct} defaultValue={0}
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
        label="MODE"
        value={params.mode}
        options={[
          { value: 'lattice', label: 'LATTICE' },
          { value: 'trace', label: 'TRACE' },
        ]}
        onChange={(mode) => setD({ mode })}
      />
      <Slider label="CELLS" value={params.cells} min={12} max={64} step={1} format={int}
        onChange={(v) => set({ cells: v })} onCommit={commit} />
      <Slider label="SIZE" value={params.size} min={0.2} max={1} step={0.05} format={pct}
        onChange={(v) => set({ size: v })} onCommit={commit} />
      <Slider label="RANGE" value={params.range} min={0.5} max={4} step={0.1} format={(v) => v.toFixed(1)}
        onChange={(v) => set({ range: v })} onCommit={commit} />
      <div className="panel-note">
        A lattice of primitives whose state flips where the curve passes —
        the figure appears by substitution.
      </div>
    </>
  )
}
