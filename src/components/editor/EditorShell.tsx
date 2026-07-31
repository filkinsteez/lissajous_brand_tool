'use client'

import { useEffect } from 'react'
import { history as projectHistory, useStore } from '@/core/state/store'
import { installDebugHook } from '@/core/state/debug'
import { renderController } from '@/render/renderController'
import { decodeShareHash, encodeShareHash } from '@/core/state/compress'
import { deserializeProject, serializeProject } from '@/core/state/serialize'
import { CanvasStage } from './CanvasStage'
import { Inspector } from './Inspector'
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

    // restore: share hash → localStorage autosave → defaults
    const fromHash = decodeShareHash(window.location.hash)
    const fromLocal = fromHash ? null : deserializeProject(localStorage.getItem(AUTOSAVE_KEY))
    if (fromHash || fromLocal) {
      useStore.getState().replaceProject((fromHash ?? fromLocal)!)
    }
    useStore.getState().setUi({ mounted: true })

    // write-back: debounced autosave + share hash
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsub = useStore.subscribe((state, prev) => {
      if (state.project === prev.project) return
      clearTimeout(timer)
      timer = setTimeout(() => {
        try {
          localStorage.setItem(AUTOSAVE_KEY, serializeProject(state.project))
          history.replaceState(null, '', '#' + encodeShareHash(state.project))
        } catch {
          // storage full / privacy mode — hash alone still works
        }
      }, 500)
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
      unsub()
      renderController.stop()
    }
  }, [])

  return (
    <div className="editor">
      <header className="topbar">
        <div className="wordmark">
          LISSAJOUS<span className="wordmark-dim"> BRAND SYSTEM</span>
        </div>
        <ModeSwitcher />
        <div className="topbar-right">
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
        <main className="stage-wrap">
          {mounted ? (
            mode === 'motion' ? <MotionLab /> : mode === 'path' ? <PathLab /> : <CanvasStage />
          ) : null}
        </main>
        <aside className="inspector-wrap">
          <Inspector />
        </aside>
      </div>
    </div>
  )
}
