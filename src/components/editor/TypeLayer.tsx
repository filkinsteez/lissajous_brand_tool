'use client'

import { useEffect, useRef, useState } from 'react'
import type { FocusEvent, KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { useStore } from '@/core/state/store'
import { getDerived } from '@/core/pipeline'
import { layoutTypeBlock, type BlockLayout } from '@/core/typography/textBlocks'
import { FONT_STACKS, nearestStaticWeight, variationSettings } from '@/core/typography/fonts'
import { INK, PAPER } from '@/core/state/defaults'
import {
  cycleHit,
  marqueeHits,
  moveAmong,
  normalizeRect,
  nudgeAnchor,
  toggleId,
  type NudgeDir,
  type Rect,
} from '@/core/canvas/selection'
import { consumedShapeIds } from '@/core/canvas/shapeProtos'
import { suppressNextClick, consumeClickSuppression } from './clickGuard'
import { imageRect, type EditorialGrid } from '@/core/grid/types'
import type { TypeBlockState } from '@/core/state/types'

type DragState = {
  id: string
  pointerId: number
  startClientX: number
  startClientY: number
  boxX: number
  boxY: number
  boxW: number // width at drag start — the free path keeps it
  moved: boolean
  alt: boolean // alt-drag: a copy stays behind at the original anchor
}

// Snap a dragged block's top-left to the grid, symmetrically: x snaps to
// column boundaries, y snaps to row boundaries — the block lands ON the
// grid lines both ways.
function snapAnchor(
  grid: EditorialGrid,
  block: TypeBlockState,
  x: number,
  y: number,
): TypeBlockState['anchor'] {
  const nCols = grid.columnBoundaries.length - 1
  let col = 0
  let best = Infinity
  for (let i = 0; i <= nCols; i++) {
    const d = Math.abs(grid.columnBoundaries[i].pos - x)
    if (d < best) {
      best = d
      col = i
    }
  }
  col = Math.max(0, Math.min(nCols - 1, col))

  const rows = grid.rowBoundaries
  let row = 0
  best = Infinity
  for (let i = 0; i < rows.length; i++) {
    const d = Math.abs(rows[i].pos - y)
    if (d < best) {
      best = d
      row = i
    }
  }

  return { ...block.anchor, col, row, baselineOffset: 0 }
}

// A new text block at a canvas point — the TEXT tool's empty-canvas
// click. Module-level on purpose: it reads everything through
// getState(), so the click effect can call it without a latest-ref
// dance (the compiler forbids ref writes during render). Returns the
// new block's id so the caller can enter edit mode.
function createBlockAt(
  layer: HTMLDivElement | null,
  clientX: number,
  clientY: number,
): string | null {
  if (!layer) return null
  const st = useStore.getState()
  const rect = layer.getBoundingClientRect()
  const scale = rect.width > 0 ? rect.width / st.project.artboard.width : 1
  const x = (clientX - rect.left) / scale
  const y = (clientY - rect.top) / scale
  const grid = getDerived(st.project).grid
  const id = `text-${Date.now().toString(36)}`
  const draft: TypeBlockState = {
    id,
    role: 'caption',
    text: 'Text',
    fontFamily: 'optimistic',
    size: 40,
    weight: 520,
    width: 100,
    opticalSize: 14,
    lineHeight: 1.25,
    tracking: 0,
    textCase: 'none',
    align: 'left',
    anchor: { col: 0, row: 0, colSpan: 2, baselineOffset: 0 },
    materialInfluence: 0.6,
  }
  draft.anchor = snapAnchor(grid, draft, x, y)
  st.apply({ typeBlocks: [...st.project.typeBlocks, draft] })
  st.setUi({
    selectedBlockId: id,
    selectedBlockIds: [id],
    activePanel: 'compose',
    tool: 'select',
  })
  return id
}

// L4: primary typography as DOM — crisp, selectable, never baked into GL.
// Blocks are draggable in the artboard; drags snap to the grid and commit
// as a single history entry on release.
export function TypeLayer() {
  const project = useStore((s) => s.project)
  const selectedBlockId = useStore((s) => s.ui.selectedBlockId)
  const selectedBlockIds = useStore((s) => s.ui.selectedBlockIds)
  const isolateLayerId = useStore((s) => s.ui.isolateLayerId)
  const derived = getDerived(project)
  const fallbackTypeColor =
    project.background.mode === 'field' && project.background.ground !== 'neutral' ? PAPER : INK
  const layerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  // anchors of every selected block when a multi-drag starts
  const multiStartRef = useRef<Map<string, TypeBlockState['anchor']> | null>(null)
  // selected images ride the same drag (mixed group moves as one)
  const imageStartRef = useRef<Map<
    string,
    { col: number; row: number; colSpan: number; rowSpan: number }
  > | null>(null)
  // start RECTS of the same group — the snap-OFF (free) path translates
  // these instead of stepping anchors
  const multiRectRef = useRef<Map<string, { x: number; y: number; w: number }> | null>(null)
  const imageRectStartRef = useRef<Map<
    string,
    { x: number; y: number; w: number; h: number }
  > | null>(null)
  const resizeRef = useRef<{ id: string; pointerId: number; startBox: BlockLayout } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [marquee, setMarquee] = useState<Rect | null>(null)

  const selectOnly = (id: string) =>
    useStore.getState().setUi({
      selectedBlockId: id,
      selectedBlockIds: [id],
      selectedImageIds: [],
      selectedShapeIds: [],
      activePanel: 'compose',
    })

  const clearSelection = () =>
    useStore.getState().setUi({
      selectedBlockId: undefined,
      selectedBlockIds: [],
      selectedImageIds: [],
      selectedShapeIds: [],
    })

  // The keyboard model, canvas-scoped (this layer only mounts on the
  // compose stage). Guards typing contexts so text editing keeps native
  // behavior. Delete removes the selection, Escape clears it, arrows
  // nudge on grid units, Ctrl/Cmd+D duplicates, Ctrl/Cmd+A selects all.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const st = useStore.getState()
      const ae = document.activeElement as HTMLElement | null
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return
      const ids = st.ui.selectedBlockIds

      if ((e.ctrlKey || e.metaKey) && (e.key === ']' || e.key === '[')) {
        // paint-order control: ] forward, [ backward, within the object's
        // own layer (text above images is the poster model and stays)
        const dir = e.key === ']' ? (1 as const) : (-1 as const)
        if (st.ui.selectedImageIds.length === 1) {
          e.preventDefault()
          const id = st.ui.selectedImageIds[0]
          st.apply({
            images: moveAmong(
              st.project.images,
              (im) => im.id !== st.project.bgImageId && !im.id.startsWith('arr-'),
              (im) => im.id === id,
              dir,
            ),
          })
        } else if (ids.length === 1) {
          e.preventDefault()
          st.apply({
            typeBlocks: moveAmong(
              st.project.typeBlocks,
              () => true,
              (b) => b.id === ids[0],
              dir,
            ),
          })
        }
        return
      }
      const imgIds = st.ui.selectedImageIds
      const shapeIds = st.ui.selectedShapeIds
      const isCanvasImage = (id: string) =>
        id !== st.project.bgImageId && !id.startsWith('arr-')

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        // consumed masters are not canvas objects; in isolation, the
        // isolated masters (shapes AND text) are the only objects there are
        const iso = st.ui.isolateLayerId
          ? st.project.layers.find((l) => l.id === st.ui.isolateLayerId)
          : undefined
        const consumed = consumedShapeIds(st.project.layers)
        const blockPool = iso
          ? st.project.typeBlocks.filter((b) => iso.params.sourceShapeIds.includes(b.id))
          : st.project.typeBlocks.filter((b) => !consumed.has(b.id))
        const shapeIds = iso
          ? st.project.shapes.filter((s) => iso.params.sourceShapeIds.includes(s.id))
          : st.project.shapes.filter((s) => !consumed.has(s.id))
        st.setUi({
          selectedBlockIds: blockPool.map((b) => b.id),
          selectedBlockId: blockPool[0]?.id,
          selectedImageIds: iso
            ? []
            : st.project.images.filter((im) => isCanvasImage(im.id)).map((im) => im.id),
          selectedShapeIds: shapeIds.map((s) => s.id),
        })
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        if (!ids.length && !imgIds.length && !shapeIds.length) return
        e.preventDefault()
        const copies = st.project.typeBlocks
          .filter((b) => ids.includes(b.id))
          .map((b, i) => ({
            ...b,
            id: `text-${Date.now().toString(36)}-${i}`,
            anchor: { ...b.anchor, baselineOffset: (b.anchor.baselineOffset ?? 0) + 2 },
          }))
        const imgCopies = st.project.images
          .filter((im) => imgIds.includes(im.id))
          .map((im, i) => ({
            ...im,
            id: `img-${Date.now().toString(36)}-${i}`,
            anchor: { ...im.anchor, row: im.anchor.row + 1 },
          }))
        const shapeCopies = st.project.shapes
          .filter((s) => shapeIds.includes(s.id))
          .map((s, i) => ({
            ...s,
            id: `shape-${Date.now().toString(36)}-${i}`,
            x: s.x + 16,
            y: s.y + 16,
          }))
        st.apply({
          typeBlocks: [...st.project.typeBlocks, ...copies],
          images: [...st.project.images, ...imgCopies],
          shapes: [...st.project.shapes, ...shapeCopies],
        })
        st.setUi({
          selectedBlockIds: copies.map((c) => c.id),
          selectedBlockId: copies[0]?.id,
          selectedImageIds: imgCopies.map((c) => c.id),
          selectedShapeIds: shapeCopies.map((c) => c.id),
        })
        return
      }
      if (e.key === 'Enter' && st.ui.isolateLayerId) {
        // Enter confirms the mode you are in — leaving source editing is
        // the only modal state on the canvas, and Esc alone reads as
        // "cancel" for something that has no cancel
        e.preventDefault()
        st.setUi({ isolateLayerId: undefined, selectedShapeIds: [] })
        return
      }
      if (e.key === 'Escape') {
        // Esc backs out one layer of intent: isolation first, then the
        // armed tool, then selection
        if (st.ui.isolateLayerId) st.setUi({ isolateLayerId: undefined, selectedShapeIds: [] })
        else if (st.ui.tool !== 'select') st.setUi({ tool: 'select' })
        else if (ids.length || imgIds.length || shapeIds.length) clearSelection()
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!ids.length && !imgIds.length && !shapeIds.length) {
          // no canvas selection: the effector highlighted in the panel
          // is the target (same fallback the panel itself displays)
          const layerId =
            st.ui.selectedLayerId ?? st.project.layers[st.project.layers.length - 1]?.id
          if (
            layerId &&
            st.ui.designTab === 'layers' &&
            st.ui.panelOpen &&
            st.project.layers.some((l) => l.id === layerId)
          ) {
            e.preventDefault()
            st.apply({ layers: st.project.layers.filter((l) => l.id !== layerId) })
            st.setUi({
              selectedLayerId: undefined,
              ...(st.ui.isolateLayerId === layerId ? { isolateLayerId: undefined } : {}),
            })
          }
          return
        }
        e.preventDefault()
        st.apply({
          typeBlocks: st.project.typeBlocks.filter((b) => !ids.includes(b.id)),
          images: st.project.images.filter((im) => !imgIds.includes(im.id)),
          shapes: st.project.shapes.filter((s) => !shapeIds.includes(s.id)),
        })
        clearSelection()
        return
      }
      if (e.key === 'Enter' && !e.shiftKey && ids.length === 1 && !imgIds.length) {
        // Enter on a single selection enters text editing (Figma's key)
        e.preventDefault()
        setEditingId(ids[0])
        return
      }
      const dirs: Record<string, NudgeDir> = {
        ArrowLeft: 'left',
        ArrowRight: 'right',
        ArrowUp: 'up',
        ArrowDown: 'down',
      }
      const dir = dirs[e.key]
      if (dir && (ids.length || imgIds.length || shapeIds.length)) {
        e.preventDefault()
        const grid = getDerived(st.project).grid
        const nCols = grid.columnBoundaries.length - 1
        const nRows = grid.rowBoundaries.length - 1
        const dc = dir === 'left' ? -1 : dir === 'right' ? 1 : 0
        const dr = dir === 'up' ? -1 : dir === 'down' ? 1 : 0
        // drawn shapes are free-positioned: they nudge in pixels
        const px = e.shiftKey ? 32 : 8
        st.apply({
          // free objects nudge in pixels like drawn shapes; anchored
          // ones step grid units
          typeBlocks: st.project.typeBlocks.map((b) =>
            ids.includes(b.id)
              ? b.free
                ? { ...b, free: { ...b.free, x: b.free.x + dc * px, y: b.free.y + dr * px } }
                : { ...b, anchor: nudgeAnchor(b.anchor, dir, nCols, e.shiftKey) }
              : b,
          ),
          // anchored images nudge whole cells: their vertical unit is the row
          images: st.project.images.map((im) =>
            imgIds.includes(im.id)
              ? im.free
                ? { ...im, free: { ...im.free, x: im.free.x + dc * px, y: im.free.y + dr * px } }
                : {
                    ...im,
                    anchor: {
                      ...im.anchor,
                      col: Math.max(0, Math.min(nCols - im.anchor.colSpan, im.anchor.col + dc)),
                      row: Math.max(0, Math.min(nRows - im.anchor.rowSpan, im.anchor.row + dr)),
                    },
                  }
              : im,
          ),
          shapes: st.project.shapes.map((s) =>
            shapeIds.includes(s.id) ? { ...s, x: s.x + dc * px, y: s.y + dr * px } : s,
          ),
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Marquee: press on empty canvas and drag — the rubber band selects
  // everything it touches (shift = additive). A plain click (no drag)
  // falls through to proximity selection below.
  useEffect(() => {
    const layer = layerRef.current
    const artboard = layer?.parentElement
    if (!artboard) return
    let start: { x: number; y: number; additive: string[] } | null = null
    let active = false

    // both object kinds live in one marquee, keyed by kind prefix
    const blockRects = (): { id: string; rect: Rect }[] => {
      const toRect = (el: Element) => {
        const r = el.getBoundingClientRect()
        return { x: r.left, y: r.top, w: r.width, h: r.height }
      }
      return [
        ...[...layer.querySelectorAll<HTMLElement>('.type-block')].map((el) => ({
          id: `t:${el.getAttribute('data-block-id') ?? ''}`,
          rect: toRect(el),
        })),
        ...[...(artboard?.querySelectorAll<HTMLElement>('.image-block-wrap') ?? [])].map((el) => ({
          id: `i:${el.getAttribute('data-image-id') ?? ''}`,
          rect: toRect(el),
        })),
        ...[...(artboard?.querySelectorAll<SVGPathElement>('.draw-shape') ?? [])].map((el) => ({
          id: `s:${el.getAttribute('data-shape-id') ?? ''}`,
          rect: toRect(el),
        })),
      ]
    }

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      if (useStore.getState().ui.tool !== 'select') return // armed tools do not marquee
      const target = e.target as HTMLElement
      if (target.closest('.type-block')) return // block drags own the pointer
      if (target.closest('.image-block-wrap')) return // image drags too
      if (target.closest('.draw-shape') || target.closest('.shape-select-frame')) return
      const st = useStore.getState()
      start = {
        x: e.clientX,
        y: e.clientY,
        additive: e.shiftKey
          ? [
              ...st.ui.selectedBlockIds.map((id) => `t:${id}`),
              ...st.ui.selectedImageIds.map((id) => `i:${id}`),
              ...st.ui.selectedShapeIds.map((id) => `s:${id}`),
            ]
          : [],
      }
      active = false
    }
    const onMove = (e: PointerEvent) => {
      if (!start) return
      if (!active) {
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < 4) return
        active = true
      }
      const rect = normalizeRect(start.x, start.y, e.clientX, e.clientY)
      const hits = marqueeHits(blockRects(), rect, start.additive)
      const textHits = hits.filter((h) => h.startsWith('t:')).map((h) => h.slice(2))
      const imageHits = hits.filter((h) => h.startsWith('i:')).map((h) => h.slice(2))
      const shapeHits = hits.filter((h) => h.startsWith('s:')).map((h) => h.slice(2))
      const layerR = layer.getBoundingClientRect()
      const scale = layerR.width > 0 ? layerR.width / useStore.getState().project.artboard.width : 1
      setMarquee({
        x: (rect.x - layerR.left) / scale,
        y: (rect.y - layerR.top) / scale,
        w: rect.w / scale,
        h: rect.h / scale,
      })
      useStore.getState().setUi({
        selectedBlockIds: textHits,
        selectedBlockId: textHits[textHits.length - 1],
        selectedImageIds: imageHits,
        selectedShapeIds: shapeHits,
      })
    }
    const onUp = () => {
      if (active) suppressNextClick()
      start = null
      active = false
      setMarquee(null)
    }
    artboard.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      artboard.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  // Stack-aware selection: one handler owns every canvas click. The hit
  // stack is built top-to-bottom (text above images, later array entries
  // above earlier), the first click takes the topmost, and clicking the
  // same spot again walks DOWN the stack — so anything behind anything
  // is always reachable. Near-miss proximity (16px) still catches tiny
  // type; truly empty clicks clear the selection.
  useEffect(() => {
    const layer = layerRef.current
    const artboard = layer?.parentElement
    if (!artboard) return
    const contains = (el: Element, x: number, y: number) => {
      const r = el.getBoundingClientRect()
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
    }
    const onClick = (e: MouseEvent) => {
      if (consumeClickSuppression()) return
      // the armed TEXT tool creates on EMPTY canvas only — clicking an
      // existing block puts the caret in it, the way every editor works
      const armedTool = useStore.getState().ui.tool
      if (armedTool === 'text') {
        const hit = (e.target as HTMLElement).closest('.type-block') as HTMLElement | null
        const id = hit?.getAttribute('data-block-id')
        if (id) {
          selectOnly(id)
          setEditingId(id)
          useStore.getState().setUi({ tool: 'select' })
        } else {
          const createdId = createBlockAt(layer, e.clientX, e.clientY)
          if (createdId) setEditingId(createdId)
        }
        return
      }
      if (armedTool !== 'select') return
      // clicks inside an editing block belong to the caret
      if ((e.target as HTMLElement).closest('.type-block.editing')) return

      const st = useStore.getState()
      // text stack: later blocks paint above earlier ones; drawn shapes
      // sit between text and images, matching the visual order
      const texts = [...st.project.typeBlocks]
        .reverse()
        .filter((b) => {
          const el = layer.querySelector(`[data-block-id="${b.id}"]`)
          return el ? contains(el, e.clientX, e.clientY) : false
        })
        .map((b) => `t:${b.id}`)
      const drawn = [...artboard.querySelectorAll('.draw-shape')]
        .reverse()
        .filter((el) => contains(el, e.clientX, e.clientY))
        .map((el) => `s:${el.getAttribute('data-shape-id')}`)
      const images = [...artboard.querySelectorAll('.image-block-wrap')]
        .reverse()
        .filter((el) => contains(el, e.clientX, e.clientY))
        .map((el) => `i:${el.getAttribute('data-image-id')}`)
      const stack = [...texts, ...drawn, ...images]

      if (stack.length) {
        const top = stack[0]
        if (e.shiftKey) {
          // shift toggles the topmost hit into the mixed selection
          if (top.startsWith('t:')) {
            const id = top.slice(2)
            const next = toggleId(st.ui.selectedBlockIds, id)
            st.setUi({
              selectedBlockIds: next,
              selectedBlockId: next.includes(id) ? id : next[next.length - 1],
            })
          } else if (top.startsWith('s:')) {
            st.setUi({ selectedShapeIds: toggleId(st.ui.selectedShapeIds, top.slice(2)) })
          } else {
            st.setUi({ selectedImageIds: toggleId(st.ui.selectedImageIds, top.slice(2)) })
          }
          return
        }
        const soloCount =
          (st.ui.selectedBlockIds.length ? 1 : 0) +
          (st.ui.selectedImageIds.length ? 1 : 0) +
          (st.ui.selectedShapeIds.length ? 1 : 0)
        const currentKey =
          soloCount !== 1
            ? undefined
            : st.ui.selectedImageIds.length === 1
              ? `i:${st.ui.selectedImageIds[0]}`
              : st.ui.selectedShapeIds.length === 1
                ? `s:${st.ui.selectedShapeIds[0]}`
                : st.ui.selectedBlockIds.length === 1
                  ? `t:${st.ui.selectedBlockId}`
                  : undefined
        const next = cycleHit(stack, currentKey)
        if (!next) return
        if (next.startsWith('t:')) selectOnly(next.slice(2))
        else if (next.startsWith('s:'))
          st.setUi({
            selectedShapeIds: [next.slice(2)],
            selectedBlockId: undefined,
            selectedBlockIds: [],
            selectedImageIds: [],
          })
        else
          st.setUi({
            selectedImageIds: [next.slice(2)],
            selectedBlockId: undefined,
            selectedBlockIds: [],
            selectedShapeIds: [],
          })
        return
      }

      // near-miss reach for tiny type
      const blocksEls = layer.querySelectorAll<HTMLElement>('.type-block')
      let bestId: string | null = null
      let bestD = 16 // px reach
      blocksEls.forEach((el) => {
        const r = el.getBoundingClientRect()
        const dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right)
        const dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom)
        const d = Math.hypot(dx, dy)
        if (d < bestD) {
          bestD = d
          bestId = el.getAttribute('data-block-id')
        }
      })
      if (bestId) {
        if (e.shiftKey) {
          const next = toggleId(st.ui.selectedBlockIds, bestId)
          st.setUi({
            selectedBlockIds: next,
            selectedBlockId: next.includes(bestId) ? bestId : next[next.length - 1],
          })
        } else {
          selectOnly(bestId)
        }
      } else if (!e.shiftKey) {
        clearSelection()
      }
    }
    artboard.addEventListener('click', onClick)
    return () => artboard.removeEventListener('click', onClick)
  }, [])

  // tool shortcuts, the Figma keys plus the shape instruments. Guarded
  // like every other canvas key.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const ae = document.activeElement as HTMLElement | null
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return
      const key = e.key.toLowerCase()
      const st = useStore.getState()
      if (key === 't') st.setUi({ tool: 'text', designTab: 'type' })
      else if (key === 'v') st.setUi({ tool: 'select' })
      else if (key === 'r') st.setUi({ tool: 'rect' })
      else if (key === 'o') st.setUi({ tool: 'ellipse' })
      else if (key === 'p') st.setUi({ tool: 'poly' })
      else if (key === 's') st.setUi({ tool: 'star' })
      else if (key === 'l') st.setUi({ tool: 'line' })
      else if (key === 'b') st.setUi({ tool: 'blob' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // entering edit mode: focus the block and select its text, the way any
  // modern page editor greets a double-click
  useEffect(() => {
    if (!editingId) return
    const el = layerRef.current?.querySelector<HTMLElement>(`[data-block-id="${editingId}"]`)
    if (!el) return
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  }, [editingId])

  const commitEdit = (block: TypeBlockState, el: HTMLElement) => {
    const text = (el.innerText ?? '').replace(/ /g, ' ').trimEnd()
    setEditingId(null)
    if (text && text !== block.text) {
      useStore.getState().apply({
        typeBlocks: useStore
          .getState()
          .project.typeBlocks.map((b) => (b.id === block.id ? { ...b, text } : b)),
      })
    }
  }

  const onEditKeyDown = (e: KeyboardEvent<HTMLDivElement>, block: TypeBlockState) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      commitEdit(block, e.currentTarget)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      // the DOM was typed into outside React, so React will not repaint an
      // unchanged text child — restore it by hand before leaving edit mode
      e.currentTarget.innerText = block.text
      setEditingId(null)
    }
  }

  const onEditBlur = (e: FocusEvent<HTMLDivElement>, block: TypeBlockState) => {
    if (editingId === block.id) commitEdit(block, e.currentTarget)
  }

  const artboardScale = (): number => {
    const el = layerRef.current
    if (!el) return 1
    const rect = el.getBoundingClientRect()
    return rect.width > 0 ? rect.width / project.artboard.width : 1
  }

  const onPointerDown = (e: ReactPointerEvent, block: TypeBlockState, box: BlockLayout) => {
    if (e.button !== 0) return
    if (editingId === block.id) return // editing: the pointer belongs to the caret
    e.preventDefault() // keeps text selection from hijacking the drag
    const st = useStore.getState()
    // dragging a member of a multi-selection moves the whole selection
    // (selected images included); grabbing an unselected block adopts it
    const ids = st.ui.selectedBlockIds
    const imgIds = st.ui.selectedImageIds
    if (ids.includes(block.id) && ids.length + imgIds.length > 1) {
      const g = getDerived(st.project).grid
      const groupBlocks = st.project.typeBlocks.filter((b) => ids.includes(b.id))
      const groupImgs = st.project.images.filter((im) => imgIds.includes(im.id))
      multiStartRef.current = new Map(groupBlocks.map((b) => [b.id, { ...b.anchor }]))
      imageStartRef.current = new Map(groupImgs.map((im) => [im.id, { ...im.anchor }]))
      multiRectRef.current = new Map(
        groupBlocks.map((b) => {
          const bx = layoutTypeBlock(b, g)
          return [b.id, { x: bx.x, y: bx.y, w: bx.w }]
        }),
      )
      imageRectStartRef.current = new Map(
        groupImgs.map((im) => [im.id, imageRect(g, im.anchor, im.free)]),
      )
    } else {
      multiStartRef.current = null
      imageStartRef.current = null
      multiRectRef.current = null
      imageRectStartRef.current = null
    }
    dragRef.current = {
      id: block.id,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      boxX: box.x,
      boxY: box.y,
      boxW: box.w,
      moved: false,
      alt: e.altKey,
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // synthetic pointers (tests, automation) have no active pointer to capture
    }
  }

  const onPointerMove = (e: ReactPointerEvent, block: TypeBlockState) => {
    const drag = dragRef.current
    if (!drag || drag.id !== block.id || e.pointerId !== drag.pointerId) return
    const scale = artboardScale()
    const dxPx = e.clientX - drag.startClientX
    const dyPx = e.clientY - drag.startClientY
    if (!drag.moved) {
      if (Math.hypot(dxPx, dyPx) < 4) return
      drag.moved = true
      const st = useStore.getState()
      const keepSelection = multiStartRef.current !== null
      // alt-drag: copies stay behind at the original anchors, the drag
      // carries the originals on — visually, you dragged out a duplicate
      if (drag.alt) {
        const dragIds = multiStartRef.current
          ? [...multiStartRef.current.keys()]
          : [block.id]
        const clones = st.project.typeBlocks
          .filter((b) => dragIds.includes(b.id))
          .map((b, i) => ({ ...b, id: `text-${Date.now().toString(36)}-c${i}` }))
        st.apply({ typeBlocks: [...st.project.typeBlocks, ...clones] })
      }
      st.setUi({
        dragging: true,
        selectedBlockId: block.id,
        ...(keepSelection ? {} : { selectedBlockIds: [block.id] }),
        activePanel: 'compose',
      })
    }
    const state = useStore.getState()
    const grid = getDerived(state.project).grid

    // SNAP OFF: free translation — the block goes exactly where the
    // pointer puts it, selected images ride along in px
    if (!state.ui.snap) {
      const dx = dxPx / scale
      const dy = dyPx / scale
      const rects = multiRectRef.current
      const imgRects = imageRectStartRef.current
      if (rects) {
        state.setTransient({
          typeBlocks: state.project.typeBlocks.map((b) => {
            const r = rects.get(b.id)
            return r ? { ...b, free: { x: r.x + dx, y: r.y + dy, w: r.w } } : b
          }),
          images: state.project.images.map((im) => {
            const r = imgRects?.get(im.id)
            return r ? { ...im, free: { x: r.x + dx, y: r.y + dy, w: r.w, h: r.h } } : im
          }),
        })
      } else {
        state.setTransient({
          typeBlocks: state.project.typeBlocks.map((b) =>
            b.id === block.id
              ? { ...b, free: { x: drag.boxX + dx, y: drag.boxY + dy, w: drag.boxW } }
              : b,
          ),
        })
      }
      return
    }

    const anchor = snapAnchor(grid, block, drag.boxX + dxPx / scale, drag.boxY + dyPx / scale)
    const multi = multiStartRef.current
    if (multi) {
      // the grabbed block's snapped delta rides the whole selection —
      // selected images included, so a mixed group moves as one
      const start = multi.get(block.id)
      if (!start) return
      const dCol = anchor.col - start.col
      const dRow = anchor.row - start.row
      const nCols = grid.columnBoundaries.length - 1
      const nRows = grid.rowBoundaries.length - 1
      const imgStarts = imageStartRef.current
      state.setTransient({
        typeBlocks: state.project.typeBlocks.map((b) => {
          const s = multi.get(b.id)
          if (!s) return b
          return {
            ...b,
            free: undefined,
            anchor: {
              ...s,
              col: Math.max(0, Math.min(nCols - 1, s.col + dCol)),
              row: Math.max(0, Math.min(nRows, s.row + dRow)),
            },
          }
        }),
        images: state.project.images.map((im) => {
          const s = imgStarts?.get(im.id)
          if (!s) return im
          return {
            ...im,
            free: undefined,
            anchor: {
              ...s,
              col: Math.max(0, Math.min(nCols - s.colSpan, s.col + dCol)),
              row: Math.max(0, Math.min(nRows - s.rowSpan, s.row + dRow)),
            },
          }
        }),
      })
    } else {
      state.setTransient({
        typeBlocks: state.project.typeBlocks.map((b) =>
          b.id === block.id ? { ...b, anchor, free: undefined } : b,
        ),
      })
    }
  }

  const onPointerUp = (e: ReactPointerEvent, block: TypeBlockState) => {
    const drag = dragRef.current
    if (!drag || drag.id !== block.id) return
    dragRef.current = null
    multiStartRef.current = null
    imageStartRef.current = null
    multiRectRef.current = null
    imageRectStartRef.current = null
    if (drag.moved) {
      suppressNextClick()
      useStore.getState().commitTransient()
      useStore.getState().setUi({ dragging: false })
    }
  }

  // ---- width handle: drag the block's right edge. Snap ON: the span
  // lands on grid columns. Snap OFF: raw px width.
  const onResizeDown = (e: ReactPointerEvent, block: TypeBlockState) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const g = getDerived(useStore.getState().project).grid
    resizeRef.current = {
      id: block.id,
      pointerId: e.pointerId,
      startBox: layoutTypeBlock(block, g),
    }
    useStore.getState().setUi({ dragging: true, selectedBlockId: block.id })
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // synthetic pointers have no active pointer to capture
    }
  }

  const onResizeMove = (e: ReactPointerEvent, block: TypeBlockState) => {
    const rs = resizeRef.current
    if (!rs || rs.id !== block.id || e.pointerId !== rs.pointerId) return
    const layer = layerRef.current
    if (!layer) return
    const rect = layer.getBoundingClientRect()
    const state = useStore.getState()
    const artX = ((e.clientX - rect.left) / Math.max(rect.width, 1)) * state.project.artboard.width
    const grid = getDerived(state.project).grid
    const bounds = grid.columnBoundaries
    const nCols = bounds.length - 1
    const blk = state.project.typeBlocks.find((b) => b.id === block.id)
    if (!blk) return

    // SNAP OFF: free width from the block's left edge to the pointer
    if (!state.ui.snap) {
      const sb = rs.startBox
      const w = Math.max(40, artX - sb.x)
      state.setTransient({
        typeBlocks: state.project.typeBlocks.map((b) =>
          b.id === block.id ? { ...b, free: { x: sb.x, y: sb.y, w } } : b,
        ),
      })
      return
    }

    let span = 1
    let best = Infinity
    for (let i = blk.anchor.col + 1; i <= nCols; i++) {
      const d = Math.abs(bounds[i].pos - artX)
      if (d < best) {
        best = d
        span = i - blk.anchor.col
      }
    }
    if (span !== blk.anchor.colSpan || blk.free !== undefined) {
      state.setTransient({
        typeBlocks: state.project.typeBlocks.map((b) =>
          b.id === block.id
            ? { ...b, free: undefined, anchor: { ...b.anchor, colSpan: span } }
            : b,
        ),
      })
    }
  }

  const onResizeUp = (e: ReactPointerEvent, block: TypeBlockState) => {
    const rs = resizeRef.current
    if (!rs || rs.id !== block.id) return
    resizeRef.current = null
    suppressNextClick()
    useStore.getState().commitTransient()
    useStore.getState().setUi({ dragging: false })
  }

  // consumed text blocks live inside their effectors; isolation flips
  // it — only the isolated effector's text masters render (mirrors the
  // drawn-shape layer exactly)
  const isolateLayer = project.layers.find((l) => l.id === isolateLayerId)
  const isolating = !!isolateLayer && isolateLayer.params.sourceShapeIds.length > 0
  const consumedIds = consumedShapeIds(project.layers)
  const visibleBlocks = isolating
    ? project.typeBlocks.filter((b) => isolateLayer.params.sourceShapeIds.includes(b.id))
    : project.typeBlocks.filter((b) => !consumedIds.has(b.id))

  return (
    <div className="artboard-layer type-layer" ref={layerRef}>
      {marquee ? (
        <div
          className="marquee-rect"
          style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
        />
      ) : null}
      {visibleBlocks.map((block) => {
        const box = layoutTypeBlock(block, derived.grid)
        const editing = editingId === block.id
        return (
          <div
            key={block.id}
            data-block-id={block.id}
            className={
              'type-block' +
              (selectedBlockIds.includes(block.id) ? ' selected' : '') +
              (editing ? ' editing' : '')
            }
            contentEditable={editing}
            suppressContentEditableWarning
            spellCheck={false}
            // selection happens in the artboard's stack-cycling click
            // handler — block clicks just bubble up to it
            onDoubleClick={() => setEditingId(block.id)}
            onKeyDown={editing ? (e) => onEditKeyDown(e, block) : undefined}
            onBlur={editing ? (e) => onEditBlur(e, block) : undefined}
            onPointerDown={(e) => onPointerDown(e, block, box)}
            onPointerMove={(e) => onPointerMove(e, block)}
            onPointerUp={(e) => onPointerUp(e, block)}
            onPointerCancel={(e) => onPointerUp(e, block)}
            style={{
              // ALIGN is typographic, not positional: the block stays
              // where it was placed and the alignment arranges the lines
              // inside it. Re-anchoring the box on align made changing
              // alignment jump the text across the canvas.
              left: box.x,
              top: box.y,
              width: 'fit-content',
              maxWidth: box.w,
              minWidth: '1ch',
              fontFamily: FONT_STACKS[block.fontFamily],
              fontSize: block.size,
              fontWeight: nearestStaticWeight(block.weight),
              fontVariationSettings: variationSettings(block),
              lineHeight: block.lineHeight,
              letterSpacing: `${block.tracking}em`,
              textAlign: block.align,
              color: block.color ?? fallbackTypeColor,
              WebkitTextStroke: block.strokeWidth
                ? `${block.strokeWidth}px ${block.strokeColor ?? INK}`
                : undefined,
              background: block.background,
            }}
          >
            {block.text}
            {selectedBlockId === block.id && selectedBlockIds.length === 1 && !editing ? (
              <>
                {/* deletion is the Delete key — no chip cluttering the box */}
                <span
                  className="type-block-handle"
                  aria-label="Resize width"
                  onPointerDown={(e) => onResizeDown(e, block)}
                  onPointerMove={(e) => onResizeMove(e, block)}
                  onPointerUp={(e) => onResizeUp(e, block)}
                  onPointerCancel={(e) => onResizeUp(e, block)}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                />
              </>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
