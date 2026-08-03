'use client'

import { useRef, useState } from 'react'
import { useStore } from '@/core/state/store'
import { createShapeLayer, LAYER_TYPE_LABELS } from '@/core/state/defaults'
import { niceLabel } from '@/components/controls/label'
import { consumedShapeIds } from '@/core/canvas/shapeProtos'
import type { ShapeLayer, ShapeLayerType } from '@/core/state/types'

// THE LAYERS RAIL — the document, always on screen (Figma's left panel).
// Canvas objects, the effectors applied to them, and the background sit
// here permanently; the right inspector is for the SELECTION's
// properties. Nothing in this file edits parameters — it only selects,
// binds, reorders and names.

const ADD_ORDER: ShapeLayerType[] = ['organic', 'cloner', 'tiles', 'array', 'clones', 'pattern']

export function LayersRail() {
  const project = useStore((s) => s.project)
  const apply = useStore((s) => s.apply)
  const ui = useStore((s) => s.ui)
  const setUi = useStore((s) => s.setUi)

  const layers = project.layers
  // selection is EXPLICIT: falling back to the last layer made a row
  // look permanently active, so clicking it appeared to do nothing and
  // nothing could be deselected
  const selected = layers.find((l) => l.id === ui.selectedLayerId)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const selectedObjectIds = [...ui.selectedShapeIds, ...ui.selectedBlockIds, ...ui.selectedImageIds]

  // the object tree: unbound canvas objects in reverse paint order
  // (text paints above drawn shapes), plus each effector's bound sources
  const consumed = consumedShapeIds(layers)
  // the user's own words, verbatim — never re-cased
  const label = (t: string) => t.trim().slice(0, 18) || 'Text'
  // paint order, top first: text, drawn shapes, then images. Array
  // assets (arr- prefix) belong to their effector, not the canvas.
  const treeObjects: TreeObject[] = [
    ...[...project.typeBlocks]
      .reverse()
      .filter((b) => !consumed.has(b.id))
      .map((b) => ({ id: b.id, kind: 'text' as const, label: label(b.text), fill: b.color })),
    ...[...project.shapes]
      .reverse()
      .filter((s) => !consumed.has(s.id))
      .map((s) => ({ id: s.id, kind: 'shape' as const, label: niceLabel(s.kind), fill: s.fill })),
    ...[...project.images]
      .reverse()
      .filter((im) => !im.id.startsWith('arr-') && im.id !== project.bgImageId)
      .map((im) => ({ id: im.id, kind: 'image' as const, label: 'Image', src: im.src })),
  ]
  const objById = new Map<string, TreeObject>()
  for (const b of project.typeBlocks)
    objById.set(b.id, { id: b.id, kind: 'text', label: label(b.text), fill: b.color })
  for (const s of project.shapes)
    objById.set(s.id, { id: s.id, kind: 'shape', label: niceLabel(s.kind), fill: s.fill })

  const patchParams = (id: string, params: Record<string, unknown>) => {
    apply({
      layers: layers.map((l) =>
        l.id === id ? ({ ...l, params: { ...l.params, ...params } } as ShapeLayer) : l,
      ),
    })
  }
  const patchLayer = (id: string, patch: Partial<ShapeLayer>) => {
    apply({ layers: layers.map((l) => (l.id === id ? ({ ...l, ...patch } as ShapeLayer) : l)) })
  }

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
        ? { selectedBlockIds: [o.id], selectedBlockId: o.id, selectedShapeIds: [], selectedImageIds: [] }
        : { selectedShapeIds: [o.id], selectedBlockIds: [], selectedBlockId: undefined, selectedImageIds: [] }),
    })
  }
  const selectObject = (o: TreeObject) => {
    setUi(
      o.kind === 'text'
        ? { selectedBlockIds: [o.id], selectedBlockId: o.id, selectedShapeIds: [], selectedImageIds: [] }
        : o.kind === 'image'
          ? { selectedImageIds: [o.id], selectedShapeIds: [], selectedBlockIds: [], selectedBlockId: undefined }
          : { selectedShapeIds: [o.id], selectedBlockIds: [], selectedBlockId: undefined, selectedImageIds: [] },
    )
  }

  const addLayer = (type: ShapeLayerType) => {
    const layer = createShapeLayer(type, layers)
    // draw -> select -> effect: adding an effector while objects are
    // selected binds them as its source (shapes AND text blocks)
    const sel = [...ui.selectedShapeIds, ...ui.selectedBlockIds]
    if (sel.length) layer.params.sourceShapeIds = sel
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

  // drag-and-drop reorder: gap is an insertion slot in DISPLAY space
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
    const clean = name.trim().slice(0, 24)
    if (!clean) return
    apply({ layers: layers.map((l) => (l.id === id ? ({ ...l, name: clean } as ShapeLayer) : l)) })
  }

  return (
    <div className="layers-rail">
      <div className="rail-title">Layers</div>
      <div className="rail-body">
        <div className="layer-add-row">
          <select
            className="ctl-select layer-add-select"
            value=""
            title="Add an effector — with objects selected it binds them as its source"
            onChange={(e) => {
              const t = e.target.value as ShapeLayerType
              if (t) addLayer(t)
            }}
          >
            {/* a select cannot take ::first-letter, so its casing lives
                in the strings themselves */}
            <option value="">+ Add effector</option>
            {ADD_ORDER.map((t) => (
              <option key={t} value={t}>
                {niceLabel(LAYER_TYPE_LABELS[t])}
              </option>
            ))}
          </select>
        </div>
        <ObjectRows
          objects={treeObjects}
          selectedIds={selectedObjectIds}
          onBind={bindTo}
          onSelect={selectObject}
          setDropTarget={setDropTarget}
        />
        {layers.length ? (
          <LayerStack
            layers={layers}
            selectedId={selected?.id}
            // one selection at a time: picking an effector drops the
            // canvas-object selection, so PROPERTIES shows one thing
            onSelect={(id) =>
              setUi({
                selectedLayerId: id,
                selectedShapeIds: [],
                selectedBlockIds: [],
                selectedBlockId: undefined,
              })
            }
            onReorder={reorderLayer}
            onToggle={(id, visible) => patchLayer(id, { visible })}
            onRemove={removeLayer}
            onDuplicate={duplicateLayer}
            onRename={renameLayer}
            sourcesFor={sourcesFor}
            selectedObjectIds={selectedObjectIds}
            onUnbind={unbindFrom}
            onBind={bindTo}
            onEditSource={editSource}
            setDropTarget={setDropTarget}
            dropTargetId={dropTarget}
          />
        ) : null}
        {/* the ground truth at the bottom of the stack, Figma's canvas row */}
        <div
          className="object-row background-row"
          title="The shader field — the poster's ground. Click to edit."
          onClick={() => setUi({ designTab: 'field', panelOpen: true })}
        >
          <span className="source-row-glyph" aria-hidden>
            &#9640;
          </span>
          <span className="source-row-label">Background — shader</span>
        </div>
      </div>
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
// each object kind reads at a glance: text by its T, images by their own
// thumbnail, drawn shapes by their fill
function ObjectGlyph({ o }: { o: TreeObject }) {
  if (o.kind === 'text')
    return (
      <span className="source-row-glyph" aria-hidden>
        T
      </span>
    )
  if (o.kind === 'image')
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={o.src} alt="" className="row-thumb" />
  return <span className="source-chip-swatch" style={{ background: o.fill }} />
}

export type TreeObject = {
  id: string
  kind: 'shape' | 'text' | 'image'
  label: string
  fill?: string
  src?: string
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
  sourcesFor,
  selectedObjectIds,
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
  selectedObjectIds: string[]
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
            selectedIds={selectedObjectIds}
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
function ObjectRows({
  objects,
  selectedIds,
  onBind,
  onSelect,
  setDropTarget,
}: {
  objects: TreeObject[]
  selectedIds: string[]
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
      {objects.map((o) => (
        <div
          key={o.id}
          className={selectedIds.includes(o.id) ? 'object-row selected' : 'object-row'}
          title="Click to select and edit — drag onto an effector to bind"
          onPointerDown={(e) => down(e, o.id)}
          onPointerMove={(e) => move(e, o.id)}
          onPointerUp={() => up(o.id, o)}
          onPointerCancel={() => up(o.id, o)}
        >
          <span className="layer-grip" aria-hidden>
            ⋮⋮
          </span>
          <ObjectGlyph o={o} />
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
  selectedIds,
  onUnbind,
  onBind,
  onEdit,
  setDropTarget,
}: {
  layerId: string
  sources: TreeObject[]
  selectedIds: string[]
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
          className={selectedIds.includes(o.id) ? 'source-row selected' : 'source-row'}
          title="Click to edit this master (Esc exits) — drag onto another effector to stack it"
          onPointerDown={(e) => down(e, o.id)}
          onPointerMove={(e) => move(e, o.id)}
          onPointerUp={() => up(o)}
          onPointerCancel={() => up(o)}
        >
          <ObjectGlyph o={o} />
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
