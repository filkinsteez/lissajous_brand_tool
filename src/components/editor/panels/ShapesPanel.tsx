'use client'

import { useRef, useState } from 'react'
import { useStore } from '@/core/state/store'
import { Slider } from '@/components/controls/Slider'
import { SegmentedControl } from '@/components/controls/SegmentedControl'
import { Toggle } from '@/components/controls/Toggle'
import { ColorField } from '@/components/controls/ColorField'
import { importImageFile } from '@/core/images'
import { createShapeLayer, LAYER_TYPE_LABELS } from '@/core/state/defaults'
import { consumedShapeIds } from '@/core/canvas/shapeProtos'
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
  ShapeLayerType,
  SheetShape,
  TilesState,
} from '@/core/state/types'
import { BRAND_PALETTE } from '@/core/color/palette'
import { INK, PAPER } from '@/core/state/defaults'

const pct = (v: number) => `${Math.round(v * 100)}`
const int = (v: number) => String(Math.round(v))
const deg = (v: number) => `${Math.round((v * 180) / Math.PI)}°`

const ADD_ORDER: ShapeLayerType[] = ['organic', 'cloner', 'tiles', 'array', 'clones', 'pattern']

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
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  // the object tree: unbound canvas objects in reverse paint order
  // (text paints above drawn shapes), plus each effector's bound sources
  const consumed = consumedShapeIds(layers)
  const treeObjects: TreeObject[] = [
    ...[...project.typeBlocks]
      .reverse()
      .filter((b) => !consumed.has(b.id))
      .map((b) => ({
        id: b.id,
        kind: 'text' as const,
        label: (b.text.trim() || 'TEXT').slice(0, 18).toUpperCase(),
        fill: b.color,
      })),
    ...[...project.shapes]
      .reverse()
      .filter((s) => !consumed.has(s.id))
      .map((s) => ({ id: s.id, kind: 'shape' as const, label: s.kind.toUpperCase(), fill: s.fill })),
  ]
  const objById = new Map<string, TreeObject>()
  for (const b of project.typeBlocks)
    objById.set(b.id, {
      id: b.id,
      kind: 'text',
      label: (b.text.trim() || 'TEXT').slice(0, 18).toUpperCase(),
      fill: b.color,
    })
  for (const s of project.shapes)
    objById.set(s.id, { id: s.id, kind: 'shape', label: s.kind.toUpperCase(), fill: s.fill })

  const sourcesFor = (layerId: string): TreeObject[] => {
    const l = layers.find((x) => x.id === layerId)
    if (!l) return []
    return l.params.sourceShapeIds
      .map((id) => objById.get(id))
      .filter((o): o is TreeObject => !!o)
  }
  const bindTo = (objId: string, layerId: string) => {
    const l = layers.find((x) => x.id === layerId)
    if (!l || l.params.sourceShapeIds.includes(objId)) return
    patchParams(layerId, { sourceShapeIds: [...l.params.sourceShapeIds, objId] })
    // the object leaves the canvas — an invisible selection would ghost-drag
    setUi({
      selectedLayerId: layerId,
      selectedShapeIds: [],
      selectedBlockIds: [],
      selectedBlockId: undefined,
    })
  }
  const unbindFrom = (objId: string, layerId: string) => {
    const l = layers.find((x) => x.id === layerId)
    if (!l) return
    patchParams(layerId, {
      sourceShapeIds: l.params.sourceShapeIds.filter((id) => id !== objId),
    })
  }
  // click on a bound source: open its master for editing — isolation on
  // that effector with the clicked object selected, frame and all
  const editSource = (o: TreeObject, layerId: string) => {
    setUi({
      isolateLayerId: layerId,
      selectedLayerId: layerId,
      ...(o.kind === 'text'
        ? {
            selectedBlockIds: [o.id],
            selectedBlockId: o.id,
            selectedShapeIds: [],
            selectedImageIds: [],
          }
        : {
            selectedShapeIds: [o.id],
            selectedBlockIds: [],
            selectedBlockId: undefined,
            selectedImageIds: [],
          }),
    })
  }

  const selectObject = (o: TreeObject) => {
    if (o.kind === 'text') {
      setUi({
        selectedBlockIds: [o.id],
        selectedBlockId: o.id,
        selectedShapeIds: [],
        selectedImageIds: [],
      })
    } else {
      setUi({
        selectedShapeIds: [o.id],
        selectedBlockIds: [],
        selectedBlockId: undefined,
        selectedImageIds: [],
      })
    }
  }

  const addLayer = (type: ShapeLayerType) => {
    const layer = createShapeLayer(type, layers)
    // draw → select → effect: adding an effector while objects are
    // selected binds them as its source — shapes AND text blocks; they
    // leave the canvas with it
    const sel = [...ui.selectedShapeIds, ...ui.selectedBlockIds]
    if (sel.length) {
      layer.params.sourceShapeIds = sel
    }
    apply({ layers: [...layers, layer] })
    setUi({
      selectedLayerId: layer.id,
      selectedShapeIds: [],
      selectedBlockIds: [],
      selectedBlockId: undefined,
    })
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
        <div className="layer-add-row">
          {/* one add control, Figma's + — not a wall of buttons */}
          <select
            className="ctl-select layer-add-select"
            value=""
            title="Add an effector — with objects selected it binds them as its source"
            onChange={(e) => {
              const t = e.target.value as ShapeLayerType
              if (t) addLayer(t)
            }}
          >
            <option value="">+ ADD EFFECTOR</option>
            {ADD_ORDER.map((t) => (
              <option key={t} value={t}>
                {LAYER_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <ObjectRows
          objects={treeObjects}
          onBind={bindTo}
          onSelect={selectObject}
          setDropTarget={setDropTarget}
        />
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
            sourcesFor={sourcesFor}
            onUnbind={unbindFrom}
            onBind={bindTo}
            onEditSource={editSource}
            setDropTarget={setDropTarget}
            dropTargetId={dropTarget}
          />
        ) : treeObjects.length ? null : (
          // a quiet empty layer panel, not a manual
          <div className="panel-empty">Empty — draw on the canvas or add an effector.</div>
        )}
        {/* the ground truth at the bottom of the stack, Figma's canvas row */}
        <div
          className="object-row background-row"
          title="The shader field — the poster's ground. Click to edit."
          onClick={() => setUi({ designTab: 'field' })}
        >
          <span className="source-row-glyph" aria-hidden>
            ▨
          </span>
          <span className="source-row-label">BACKGROUND — SHADER</span>
        </div>
      </div>

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
        <div className="panel-section">
          <div className="panel-heading">TEXT SELECTED</div>
          <button className="ctl-action" onClick={() => setUi({ designTab: 'type' })}>
            EDIT STYLE IN TYPE
          </button>
        </div>
      ) : null}

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

// ---------------------------------------------------------------------------
// The layer stack list: pointer-drag reordering (click still selects —
// a drag only starts after a 5px move), double-click rename, duplicate,
// visibility and delete on hover-revealed tools.

const TYPE_GLYPHS: Record<ShapeLayerType, string> = {
  organic: '✳',
  cloner: '▦',
  tiles: '▩',
  array: '▣',
  clones: '◌',
  pattern: '∷',
}

// A canvas object as the tree sees it — a drawn shape or a text block
export type TreeObject = { id: string; kind: 'shape' | 'text'; label: string; fill?: string }

function LayerStack({
  layers,
  selectedId,
  onSelect,
  onReorder,
  onToggle,
  onRemove,
  onDuplicate,
  onRename,
  sourcesFor,
  onUnbind,
  onBind,
  onEditSource,
  setDropTarget,
  dropTargetId,
}: {
  layers: ShapeLayer[]
  selectedId?: string
  onSelect: (id: string) => void
  onReorder: (id: string, gap: number) => void
  onToggle: (id: string, visible: boolean) => void
  onRemove: (id: string) => void
  onDuplicate: (id: string) => void
  onRename: (id: string, name: string) => void
  sourcesFor: (layerId: string) => TreeObject[]
  onUnbind: (objId: string, layerId: string) => void
  onBind: (objId: string, layerId: string) => void
  onEditSource: (obj: TreeObject, layerId: string) => void
  setDropTarget: (layerId: string | null) => void
  dropTargetId?: string | null
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
        const nested = sourcesFor(l.id)
        return (
          <div key={l.id} className="layer-node">
          {/* the OBJECT is the parent; the effector reads as a modifier
              applied to it, indented underneath — the Cavalry read */}
          <SourceRows
            layerId={l.id}
            sources={nested}
            onUnbind={onUnbind}
            onBind={onBind}
            onEdit={onEditSource}
            setDropTarget={setDropTarget}
          />
          <div
            className={
              classes +
              (dropTargetId === l.id ? ' drop-target' : '') +
              (nested.length ? ' modifier-row' : '')
            }
            data-layer-id={l.id}
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
          </div>
        )
      })}
    </div>
  )
}

// Selection-driven properties, the Figma inspector move: select shapes
// on the canvas (or via the tree) and their fill, stroke and opacity
// live here. Values read from the first selected shape; edits hit the
// whole selection.
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
        {selectedIds.length > 1 ? `${selectedIds.length} SHAPES` : first.kind.toUpperCase()}
      </div>
      <ColorField
        label="FILL"
        value={first.fill}
        onChange={(fill) => set({ fill })}
        onCommit={commit}
      />
      <Slider label="OPACITY" value={first.opacity} min={0.05} max={1} format={pct} defaultValue={1}
        onChange={(opacity) => set({ opacity })} onCommit={commit} />
      <Toggle
        label="STROKE"
        value={stroked}
        onChange={(on) =>
          setD(on ? { stroke: first.stroke ?? INK, strokeWidth: first.strokeWidth || 3 } : { stroke: undefined, strokeWidth: undefined })
        }
      />
      {stroked ? (
        <>
          <Slider label="WIDTH" value={first.strokeWidth ?? 3} min={1} max={24} step={0.5}
            format={(v) => v.toFixed(1)} defaultValue={3}
            onChange={(strokeWidth) => set({ strokeWidth })} onCommit={commit} />
          <ColorField
            label="STROKE"
            value={first.stroke ?? INK}
            onChange={(stroke) => set({ stroke })}
            onCommit={commit}
          />
        </>
      ) : null}
    </div>
  )
}

// Unbound canvas objects (text + drawn shapes), draggable onto an
// effector row to bind — the "put the shape under the cloner" gesture.
// A plain click selects the object on the canvas.
function ObjectRows({
  objects,
  onBind,
  onSelect,
  setDropTarget,
}: {
  objects: TreeObject[]
  onBind: (objId: string, layerId: string) => void
  onSelect: (obj: TreeObject) => void
  setDropTarget: (layerId: string | null) => void
}) {
  const dragRef = useRef<{
    id: string
    pointerId: number
    startX: number
    startY: number
    active: boolean
    over: string | null
  } | null>(null)

  const layerRowAt = (x: number, y: number): string | null => {
    const el = document.elementFromPoint(x, y)
    return (el?.closest?.('[data-layer-id]') as HTMLElement | null)?.dataset.layerId ?? null
  }

  const down = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return
    dragRef.current = {
      id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
      over: null,
    }
    try {
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    } catch {
      // synthetic pointers have no active pointer to capture
    }
  }
  const move = (e: React.PointerEvent, id: string) => {
    const d = dragRef.current
    if (!d || d.id !== id || e.pointerId !== d.pointerId) return
    if (!d.active) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 5) return
      d.active = true
    }
    const over = layerRowAt(e.clientX, e.clientY)
    if (over !== d.over) {
      d.over = over
      setDropTarget(over)
    }
  }
  const up = (id: string, obj: TreeObject) => {
    const d = dragRef.current
    dragRef.current = null
    setDropTarget(null)
    if (!d || d.id !== id) return
    if (d.active) {
      if (d.over) onBind(id, d.over)
    } else {
      onSelect(obj)
    }
  }

  if (!objects.length) return null
  return (
    <div className="object-rows">
      <div className="ctl-sub-label">CANVAS — drag onto an effector to bind</div>
      {objects.map((o) => (
        <div
          key={o.id}
          className="object-row"
          title="Drag onto an effector to bind — click to select on the canvas"
          onPointerDown={(e) => down(e, o.id)}
          onPointerMove={(e) => move(e, o.id)}
          onPointerUp={() => up(o.id, o)}
          onPointerCancel={() => up(o.id, o)}
        >
          <span className="layer-grip" aria-hidden>
            ⋮⋮
          </span>
          {o.kind === 'text' ? (
            <span className="source-row-glyph" aria-hidden>
              T
            </span>
          ) : (
            <span className="source-chip-swatch" style={{ background: o.fill }} />
          )}
          <span className="source-row-label">{o.label}</span>
        </div>
      ))}
    </div>
  )
}

// Bound objects rendered above their effector. A plain CLICK opens the
// master for editing (isolation, object selected); a DRAG onto another
// effector row STACKS that effector on the same object — the binding is
// additive; × removes this one.
function SourceRows({
  layerId,
  sources,
  onUnbind,
  onBind,
  onEdit,
  setDropTarget,
}: {
  layerId: string
  sources: TreeObject[]
  onUnbind: (objId: string, layerId: string) => void
  onBind: (objId: string, layerId: string) => void
  onEdit: (obj: TreeObject, layerId: string) => void
  setDropTarget: (layerId: string | null) => void
}) {
  const dragRef = useRef<{
    id: string
    pointerId: number
    startX: number
    startY: number
    active: boolean
    over: string | null
  } | null>(null)

  const layerRowAt = (x: number, y: number): string | null => {
    const el = document.elementFromPoint(x, y)
    return (el?.closest?.('[data-layer-id]') as HTMLElement | null)?.dataset.layerId ?? null
  }
  const down = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('.layer-tool')) return // × is the unbind, never a drag
    dragRef.current = {
      id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
      over: null,
    }
    try {
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    } catch {
      // synthetic pointers have no active pointer to capture
    }
  }
  const move = (e: React.PointerEvent, id: string) => {
    const d = dragRef.current
    if (!d || d.id !== id || e.pointerId !== d.pointerId) return
    if (!d.active) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 5) return
      d.active = true
    }
    const over = layerRowAt(e.clientX, e.clientY)
    const target = over && over !== layerId ? over : null
    if (target !== d.over) {
      d.over = target
      setDropTarget(target)
    }
  }
  const up = (obj: TreeObject) => {
    const d = dragRef.current
    dragRef.current = null
    setDropTarget(null)
    if (!d || d.id !== obj.id) return
    if (d.active) {
      if (d.over) onBind(obj.id, d.over)
    } else {
      onEdit(obj, layerId)
    }
  }

  if (!sources.length) return null
  return (
    <div className="source-rows">
      {sources.map((o) => (
        <div
          key={o.id}
          className="source-row"
          title="Click to edit this master (Esc exits) — drag onto another effector to stack it"
          onPointerDown={(e) => down(e, o.id)}
          onPointerMove={(e) => move(e, o.id)}
          onPointerUp={() => up(o)}
          onPointerCancel={() => up(o)}
        >
          {o.kind === 'text' ? (
            <span className="source-row-glyph" aria-hidden>
              T
            </span>
          ) : (
            <span className="source-chip-swatch" style={{ background: o.fill }} />
          )}
          <span className="source-row-label">{o.label}</span>
          <button
            className="layer-tool"
            aria-label="Unbind"
            title="Unbind — back to a canvas object"
            onClick={() => onUnbind(o.id, layerId)}
          >
            ×
          </button>
        </div>
      ))}
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
  const canSample = layer.type === 'cloner'
  const canTexture = layer.type === 'cloner'

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
      {layer.type !== 'array' && layer.type !== 'organic' ? (
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
      <div className="panel-heading">SOURCE</div>
      <div className="layer-add-row">
        <button
          className="ctl-action"
          disabled={!selectedIds.length}
          title="Bind the objects selected on the canvas (shapes or text) as this effector's source"
          onClick={() => bind([...selectedIds])}
        >
          USE SELECTED{selectedIds.length ? ` (${selectedIds.length})` : ''}
        </button>
        {live.length ? (
          <>
            <button
              className={isolating ? 'ctl-action primary' : 'ctl-action'}
              title="Edit the masters in isolation — the canvas dims, the effector follows live (Esc exits)"
              onClick={onIsolate}
            >
              {isolating ? 'DONE' : 'EDIT SOURCES'}
            </button>
            <button
              className="ctl-action"
              title="Back to the built-in glyph vocabulary"
              onClick={() => bind([])}
            >
              CLEAR
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
          canvas and USE SELECTED.
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Per-type parameter sections. `set` is transient (sliders), `setD`
// discrete (segmented/toggles) — one history entry per change.

const ORGANIC_PROTOS: { value: OrganicProto; label: string }[] = [
  { value: 'blob', label: 'BLOB' },
  { value: 'super', label: 'SUPER' },
  { value: 'capsule', label: 'CAPSULE' },
  { value: 'star', label: 'STAR' },
  { value: 'ribbon', label: 'RIBBON' },
  { value: 'circle', label: 'CIRCLE' },
  { value: 'meta', label: 'META' },
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
        RESEED
      </button>
      <SegmentedControl<OrganicState['distribution']>
        label="SPREAD"
        value={params.distribution}
        options={[
          { value: 'poisson', label: 'POISSON' },
          { value: 'phyllo', label: 'PHYLLO' },
          { value: 'hex', label: 'HEX' },
          { value: 'curve', label: 'CURVE' },
          { value: 'cluster', label: 'CLUSTER' },
        ]}
        onChange={(distribution) => setD({ distribution })}
      />
      <Slider label="COUNT" value={params.count} min={40} max={2400} step={20} format={int} defaultValue={900}
        onChange={(v) => set({ count: v })} onCommit={commit} />
      <Slider label="SPACING" value={params.spacing} min={0.01} max={0.09} step={0.002} format={pct} defaultValue={0.022}
        onChange={(v) => set({ spacing: v })} onCommit={commit} />
      {params.sourceShapeIds.length ? (
        <div className="panel-note">
          Form comes from the bound drawn shapes ({params.sourceShapeIds.length}) —
          clear SOURCE above to use the built-in vocabulary.
        </div>
      ) : (
        <>
          <div className="ctl-sub-label">FORM</div>
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
      <Slider label="SIZE" value={params.size} min={0.008} max={0.1} step={0.002} format={pct} defaultValue={0.02}
        onChange={(v) => set({ size: v })} onCommit={commit} />
      <Slider label="SIZE VAR" value={params.sizeRange} min={0} max={1} format={pct} defaultValue={0.6}
        onChange={(v) => set({ sizeRange: v })} onCommit={commit} />
      <Slider label="FIELD SIZE" value={params.sizeField} min={-1} max={1} format={pct} defaultValue={0.6}
        onChange={(v) => set({ sizeField: v })} onCommit={commit} />
      <div className="ctl-sub-label">INFLUENCE</div>
      <Slider label="CURVE PULL" value={params.curvePull} min={0} max={1} format={pct} defaultValue={0.7}
        onChange={(v) => set({ curvePull: v })} onCommit={commit} />
      <Slider label="FOCAL" value={params.focalStrength} min={0} max={1} format={pct} defaultValue={0}
        onChange={(v) => set({ focalStrength: v })} onCommit={commit} />
      <Slider label="FOCAL X" value={params.focalX} min={0} max={1} format={pct} defaultValue={0.5}
        onChange={(v) => set({ focalX: v })} onCommit={commit} />
      <Slider label="FOCAL Y" value={params.focalY} min={0} max={1} format={pct} defaultValue={0.5}
        onChange={(v) => set({ focalY: v })} onCommit={commit} />
      <Slider label="NOISE" value={params.noiseAmount} min={0} max={1} format={pct} defaultValue={0.5}
        onChange={(v) => set({ noiseAmount: v })} onCommit={commit} />
      <Slider label="NOISE SCALE" value={params.noiseScale} min={0.5} max={6} step={0.1} format={(v) => v.toFixed(1)} defaultValue={2.2}
        onChange={(v) => set({ noiseScale: v })} onCommit={commit} />
      <div className="ctl-sub-label">VARIATION</div>
      <SegmentedControl<OrganicState['rotation']>
        label="TURN"
        value={params.rotation}
        options={[
          { value: 'flow', label: 'FLOW' },
          { value: 'tangent', label: 'TANGENT' },
          { value: 'random', label: 'RANDOM' },
          { value: 'fixed', label: 'FIXED' },
        ]}
        onChange={(rotation) => setD({ rotation })}
      />
      <Slider label="TURN JIT" value={params.rotationJitter} min={0} max={1} format={pct} defaultValue={0.3}
        onChange={(v) => set({ rotationJitter: v })} onCommit={commit} />
      <Slider label="FIELD COLOR" value={params.colorField} min={0} max={1} format={pct} defaultValue={0.5}
        onChange={(v) => set({ colorField: v })} onCommit={commit} />
      <Slider label="OPACITY VAR" value={params.opacityRange} min={0} max={1} format={pct} defaultValue={0.25}
        onChange={(v) => set({ opacityRange: v })} onCommit={commit} />
      <div className="ctl-sub-label">FINISH</div>
      <Slider label="GOO" value={params.goo} min={0} max={1} format={pct} defaultValue={0.35}
        onChange={(v) => set({ goo: v })} onCommit={commit} />
      <Slider label="SOFT" value={params.soft} min={0} max={1} format={pct} defaultValue={0.25}
        onChange={(v) => set({ soft: v })} onCommit={commit} />
      <Slider label="GRAIN" value={params.grain} min={0} max={1} format={pct} defaultValue={0.2}
        onChange={(v) => set({ grain: v })} onCommit={commit} />
      <div className="panel-note">
        The procedural composition engine: a seeded distribution lays the
        points, fields (curve distance, focal falloff, coherent noise)
        shape density, size, color and orientation, and the raster finish
        fuses it — GOO melts neighbors into one body, GRAIN prints it.
        Every choice is deterministic per seed; RESEED deals again.
      </div>
    </>
  )
}

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
        label="MODE"
        value={params.mode}
        options={[
          { value: 'grid', label: 'GRID' },
          { value: 'radial', label: 'RADIAL' },
          { value: 'linear', label: 'LINEAR' },
          { value: 'curve', label: 'CURVE' },
        ]}
        onChange={(mode) => setD({ mode })}
      />
      {params.sourceShapeIds.length ? null : (
        <SegmentedControl<SheetShape>
          label="SHAPE"
          value={params.shape}
          options={SHAPE_OPTIONS}
          onChange={(shape) => setD({ shape })}
        />
      )}
      {grid ? (
        <>
          <SegmentedControl<'grid' | 'packed'>
            label="LAYOUT"
            value={params.layout}
            options={[
              { value: 'grid', label: 'UNIFORM' },
              { value: 'packed', label: 'PACKED' },
            ]}
            onChange={(layout) => setD({ layout })}
          />
          <Slider label="COUNT X" value={params.countX} min={2} max={64} step={1} format={int} defaultValue={8}
            onChange={(v) => set({ countX: v })} onCommit={commit} />
          <Slider label="COUNT Y" value={params.countY} min={2} max={80} step={1} format={int} defaultValue={10}
            onChange={(v) => set({ countY: v })} onCommit={commit} />
          <Slider label="SIZE" value={params.size} min={0.1} max={0.9} step={0.05} format={pct} defaultValue={0.5}
            onChange={(v) => set({ size: v })} onCommit={commit} />
          <Slider label="RANDOM" value={params.random} min={0} max={1} format={pct} defaultValue={0}
            onChange={(v) => set({ random: v })} onCommit={commit} />
          <Slider label="NOISE" value={params.noise} min={0} max={1} format={pct} defaultValue={0}
            onChange={(v) => set({ noise: v })} onCommit={commit} />
          <Slider label="STROKE MIX" value={params.strokeMix} min={0} max={1} format={pct} defaultValue={0}
            onChange={(v) => set({ strokeMix: v })} onCommit={commit} />
          <Slider label="CURVE" value={params.curve} min={0} max={1} format={pct} defaultValue={0}
            onChange={(v) => set({ curve: v })} onCommit={commit} />
          <div className="panel-note">
            An exact grid by default — the dashed frame on the canvas is
            its bounds: drag to place, corner-resize to size, double-click
            for full bleed. RANDOM adds jitter, NOISE varies the
            population in patches, CURVE swells clones along the figure,
            PACKED subdivides recursively.
          </div>
        </>
      ) : (
        <>
          <Slider label="COUNT" value={params.count} min={2} max={48} step={1} format={int} defaultValue={12}
            onChange={(v) => set({ count: v })} onCommit={commit} />
          <Slider label="SIZE" value={params.stampSize} min={0.02} max={0.3} step={0.005} format={pct} defaultValue={0.08}
            onChange={(v) => set({ stampSize: v })} onCommit={commit} />
          {curveMode ? null : (
            <>
              <Slider label="ORIGIN X" value={params.originX} min={0} max={1} step={0.01} format={pct} defaultValue={0.5}
                onChange={(v) => set({ originX: v })} onCommit={commit} />
              <Slider label="ORIGIN Y" value={params.originY} min={0} max={1} step={0.01} format={pct} defaultValue={0.5}
                onChange={(v) => set({ originY: v })} onCommit={commit} />
            </>
          )}
          {linear ? (
            <>
              <Slider label="STEP X" value={params.stepX} min={-0.2} max={0.2} step={0.005} format={pct} defaultValue={0.05}
                onChange={(v) => set({ stepX: v })} onCommit={commit} />
              <Slider label="STEP Y" value={params.stepY} min={-0.2} max={0.2} step={0.005} format={pct} defaultValue={0.035}
                onChange={(v) => set({ stepY: v })} onCommit={commit} />
            </>
          ) : null}
          {radial ? (
            <>
              <Slider label="RADIUS" value={params.radius} min={0.05} max={0.6} step={0.01} format={pct} defaultValue={0.28}
                onChange={(v) => set({ radius: v })} onCommit={commit} />
              <Slider label="SPAN" value={params.span} min={Math.PI / 6} max={Math.PI * 2} step={Math.PI / 36} format={deg} defaultValue={Math.PI * 2}
                onChange={(v) => set({ span: v })} onCommit={commit} />
            </>
          ) : null}
          <Slider label="ROTATE" value={params.rotate} min={-Math.PI / 4} max={Math.PI / 4} step={Math.PI / 180}
            format={deg} defaultValue={0}
            onChange={(v) => set({ rotate: v })} onCommit={commit} />
          <Slider label="SCALE STEP" value={params.scaleStep} min={0.7} max={1.3} step={0.01} format={pct} defaultValue={1}
            onChange={(v) => set({ scaleStep: v })} onCommit={commit} />
          <Slider label="FADE" value={params.fade} min={0} max={1} format={pct} defaultValue={0}
            onChange={(v) => set({ fade: v })} onCommit={commit} />
          <Toggle
            label="STROKE"
            value={params.stroked}
            onChange={(stroked) => setD({ stroked })}
          />
          <div className="panel-note">
            An accumulating echo: ROTATE, SCALE STEP and FADE sweep across
            the copies. LINEAR cascades from the origin, RADIAL fans and
            rosettes on their spokes, CURVE rides the figure itself —
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
      <Slider label="CELLS" value={params.cells} min={16} max={96} step={1} format={int} defaultValue={48}
        onChange={(v) => set({ cells: v })} onCommit={commit} />
      <Slider label="SIZE" value={params.size} min={0.2} max={1} step={0.05} format={pct} defaultValue={0.7}
        onChange={(v) => set({ size: v })} onCommit={commit} />
      <Slider label="THRESHOLD" value={params.threshold} min={0.1} max={1} step={0.02} format={pct} defaultValue={0.72}
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
    { value: 'paper', hex: PAPER, label: 'PAPER' },
    { value: 'ink', hex: INK, label: 'INK' },
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
        RESEED
      </button>
      <div className="layer-color-row">
        <span className="ctl-sub-label">INK B</span>
        {inkOptions.map((o) => (
          <button
            key={o.value}
            className={`layer-swatch${(params.colorB ?? 'ink') === o.value ? ' active' : ''}`}
            style={{ background: o.hex }}
            title={`${o.label} — the counter ink DUO deals to`}
            onClick={() => setD({ colorB: o.value })}
          />
        ))}
      </div>
      <SegmentedControl<TilesState['style']>
        label="STYLE"
        value={params.style}
        options={[
          { value: 'checker', label: 'CHECKER' },
          { value: 'rings', label: 'RINGS' },
        ]}
        onChange={(style) => setD({ style })}
      />
      <Slider label="COLS" value={params.cols} min={4} max={32} step={1} format={int} defaultValue={14}
        onChange={(v) => set({ cols: v })} onCommit={commit} />
      <Slider label="DENSITY" value={params.density} min={0} max={1} format={pct} defaultValue={0.55}
        onChange={(v) => set({ density: v })} onCommit={commit} />
      {params.style === 'checker' ? (
        <>
          <Slider label="LEVELS" value={params.levels} min={1} max={3} step={1} format={int} defaultValue={3}
            onChange={(v) => set({ levels: v })} onCommit={commit} />
          <Slider label="WEIGHT" value={params.weight} min={0} max={1} format={pct} defaultValue={0.35}
            onChange={(v) => set({ weight: v })} onCommit={commit} />
        </>
      ) : (
        <Slider label="RINGS" value={params.rings} min={2} max={10} step={1} format={int} defaultValue={6}
          onChange={(v) => set({ rings: v })} onCommit={commit} />
      )}
      <Slider label="CURVE" value={params.curve} min={0} max={1} format={pct} defaultValue={0.6}
        onChange={(v) => set({ curve: v })} onCommit={commit} />
      <Slider label="DUO" value={params.duo} min={0} max={1} format={pct} defaultValue={0.35}
        onChange={(v) => set({ duo: v })} onCommit={commit} />
      <div className="panel-note">
        Flush modular tiles — cells fill their bounds, so neighbors
        connect. CHECKER deals solid and subdivided cells with the
        lattice drawn over them; RINGS spins quarter-arc bands per cell
        and the weave appears where arcs meet. CURVE clusters the fine
        state along the figure; DUO deals the counter ink.
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
      <Slider label="COUNT" value={params.count} min={1} max={14} step={1} format={int} defaultValue={7}
        onChange={(v) => set({ count: v })} onCommit={commit} />
      <Slider label="SPACING" value={params.spacing} min={0.01} max={0.16} step={0.005} format={pct} defaultValue={0.045}
        onChange={(v) => set({ spacing: v })} onCommit={commit} />
      <Slider label="GROWTH" value={params.growth} min={1} max={2.2} step={0.05} format={pct} defaultValue={1.35}
        onChange={(v) => set({ growth: v })} onCommit={commit} />
      <Slider label="WEIGHT" value={params.weight} min={0.5} max={4} step={0.25}
        format={(v) => `${v.toFixed(2)}px`} defaultValue={1.5}
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
      <Slider label="CELLS" value={params.cells} min={12} max={64} step={1} format={int} defaultValue={32}
        onChange={(v) => set({ cells: v })} onCommit={commit} />
      <Slider label="SIZE" value={params.size} min={0.2} max={1} step={0.05} format={pct} defaultValue={0.55}
        onChange={(v) => set({ size: v })} onCommit={commit} />
      <Slider label="RANGE" value={params.range} min={0.5} max={4} step={0.1} format={(v) => v.toFixed(1)} defaultValue={1.6}
        onChange={(v) => set({ range: v })} onCommit={commit} />
      <div className="panel-note">
        A lattice of primitives whose state flips where the curve passes —
        the figure appears by substitution.
      </div>
    </>
  )
}
