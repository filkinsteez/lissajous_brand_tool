'use client'

import { useEffect } from 'react'
import { useStore } from '@/core/state/store'
import { installDebugHook } from '@/core/state/debug'
import { renderController } from '@/render/renderController'
import { CanvasStage } from './CanvasStage'
import { Inspector } from './Inspector'
import { ModeSwitcher } from './ModeSwitcher'

export function EditorShell() {
  const mounted = useStore((s) => s.ui.mounted)

  useEffect(() => {
    installDebugHook()
    renderController.start()
    useStore.getState().setUi({ mounted: true })

    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) useStore.getState().redo()
        else useStore.getState().undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
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
        <div className="topbar-right" />
      </header>
      <div className="editor-body">
        <main className="stage-wrap">{mounted ? <CanvasStage /> : null}</main>
        <aside className="inspector-wrap">
          <Inspector />
        </aside>
      </div>
    </div>
  )
}
