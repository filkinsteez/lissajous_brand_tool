'use client'

import { useEffect } from 'react'
import { history as projectHistory, useStore } from '@/core/state/store'
import { shuffleProject } from '@/core/state/shuffle'
import { takeDesignHandoff } from '@/core/lab/handoff'
import { getDerived } from '@/core/pipeline'
import { installDebugHook } from '@/core/state/debug'
import { renderController } from '@/render/renderController'
import { decodeShareHash, encodeShareHash } from '@/core/state/compress'
import { deserializeProject, serializeProject } from '@/core/state/serialize'
import { CanvasStage } from './CanvasStage'
import { Inspector } from './Inspector'
import { LayersRail } from './LayersRail'
import { ModeSwitcher } from './ModeSwitcher'
import { MotionLab } from '@/components/motion/MotionLab'
import { PathLab } from '@/components/path/PathLab'

const AUTOSAVE_KEY = 'lbs-autosave'

export function EditorShell() {
  const mounted = useStore((s) => s.ui.mounted)
  const mode = useStore((s) => s.ui.mode)
  // subscribing to historyVersion keeps the depth-derived disabled states live
  useStore((s) => s.historyVersion)
  const depth = projectHistory.depth

  useEffect(() => {
    installDebugHook()
    renderController.start()

    // /?pristine — a scratch session for verification runs: no restore,
    // no write-back, so nothing here can touch the saved composition
    // (the editor twin of /lab?pristine)
    const pristine = window.location.search.includes('pristine')

    // restore: share hash → localStorage autosave → defaults
    if (!pristine) {
      const fromHash = decodeShareHash(window.location.hash)
      const fromLocal = fromHash ? null : deserializeProject(localStorage.getItem(AUTOSAVE_KEY))
      if (fromHash || fromLocal) {
        useStore.getState().replaceProject((fromHash ?? fromLocal)!)
      }
    }
    useStore.getState().setUi({ mounted: true })

    // "Send to Design" handoff from the lab: the rendered image lands
    // as a centered block, selected — one undoable entry
    const handoff = takeDesignHandoff()
    if (handoff) {
      const st = useStore.getState()
      const grid = getDerived(st.project).grid
      const nCols = grid.columnBoundaries.length - 1
      const nRows = grid.rowBoundaries.length - 1
      const colSpan = Math.max(1, Math.min(2, nCols))
      const rowSpan = Math.max(1, Math.min(3, nRows))
      const id = `img-${Date.now().toString(36)}`
      st.apply({
        images: [
          ...st.project.images,
          {
            id,
            src: handoff.src,
            anchor: {
              col: Math.max(0, Math.floor((nCols - colSpan) / 2)),
              row: Math.max(0, Math.floor((nRows - rowSpan) / 2)),
              colSpan,
              rowSpan,
            },
          },
        ],
      })
      st.setUi({
        selectedImageIds: [id],
        selectedBlockId: undefined,
        selectedBlockIds: [],
        selectedShapeIds: [],
      })
    }

    // write-back: debounced autosave + share hash. `dirty` tracks a
    // pending debounce so unmount (Design→Lab navigation) can flush it —
    // without the flush, edits made in the last 500ms silently vanish.
    let timer: ReturnType<typeof setTimeout> | undefined
    let dirty = false
    const save = (project: ReturnType<typeof useStore.getState>['project']) => {
      dirty = false
      try {
        localStorage.setItem(AUTOSAVE_KEY, serializeProject(project))
        history.replaceState(null, '', '#' + encodeShareHash(project))
      } catch {
        // storage full / privacy mode — hash alone still works
      }
    }
    const unsub = pristine
      ? () => {}
      : useStore.subscribe((state, prev) => {
          if (state.project === prev.project) return
          clearTimeout(timer)
          dirty = true
          timer = setTimeout(() => save(useStore.getState().project), 500)
        })

    // Figma behavior: picking an object (canvas or rail) surfaces its
    // properties on the right. Keyed on the selection so a later section
    // switch is never fought — only a NEW selection moves the panel.
    const keyOf = (u: ReturnType<typeof useStore.getState>['ui']) =>
      `${u.selectedShapeIds.join()}|${u.selectedBlockIds.join()}|${u.selectedImageIds.join()}|${u.selectedLayerId ?? ''}`
    let selKey = keyOf(useStore.getState().ui)
    const unsubSel = useStore.subscribe((s) => {
      const key = keyOf(s.ui)
      if (key === selKey) return
      selKey = key
      if (key === '|||') return // selection cleared — leave the panel alone
      if (s.ui.designTab !== 'layers' || !s.ui.panelOpen) {
        useStore.getState().setUi({ designTab: 'layers', panelOpen: true })
      }
    })

    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      // while typing (rename inputs, on-canvas text editing) the browser's
      // native text undo must win — hijacking it there is what makes
      // undo feel broken
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const key = e.key.toLowerCase()
      if (key === 'z') {
        e.preventDefault()
        if (e.shiftKey) useStore.getState().redo()
        else useStore.getState().undo()
      } else if (key === 'y') {
        // the Windows redo
        e.preventDefault()
        useStore.getState().redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      clearTimeout(timer)
      if (dirty) save(useStore.getState().project)
      unsub()
      unsubSel()
      renderController.stop()
    }
  }, [])

  return (
    /* dialkit-root supplies the kit's design tokens to every control
       rendered inside the editor */
    <div className="editor dialkit-root">
      <header className="topbar">
        <div className="wordmark">
          Lissajous<span className="wordmark-dim"> Brand System</span>
        </div>
        <ModeSwitcher />
        <div className="topbar-right">
          <button
            className="topbar-shuffle"
            title="Shuffle the grid, layout and shader (one undo step)"
            onClick={() => {
              const s = useStore.getState()
              s.apply(shuffleProject(s.project, getDerived(s.project).grid, s.project.layoutSeed + 1))
            }}
          >
            Shuffle
          </button>
          <button
            className="topbar-history"
            aria-label="Undo"
            title="Undo (Ctrl+Z)"
            disabled={!depth.past}
            onClick={() => useStore.getState().undo()}
          >
            ↶
          </button>
          <button
            className="topbar-history"
            aria-label="Redo"
            title="Redo (Ctrl+Shift+Z)"
            disabled={!depth.future}
            onClick={() => useStore.getState().redo()}
          >
            ↷
          </button>
        </div>
      </header>
      <div className="editor-body">
        {/* the document, always on screen — Figma's left panel */}
        {mode !== 'motion' && mode !== 'path' ? <LayersRail /> : null}
        <main className="stage-wrap">
          {mounted ? (
            mode === 'motion' ? <MotionLab /> : mode === 'path' ? <PathLab /> : <CanvasStage />
          ) : null}
        </main>
        {/* always present — toggling it away reflowed the whole canvas,
            which read as jank. Deselecting a section shows EXPORT. */}
        <aside className="inspector-wrap">
          <Inspector />
        </aside>
      </div>
    </div>
  )
}
