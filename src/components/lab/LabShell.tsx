'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { LAB_AUTOSAVE_KEY, useLabStore } from '@/core/lab/labStore'
import { serializeLab, deserializeLab } from '@/core/lab/recipe'
import { LabCanvas } from './LabCanvas'
import { LabSourcePanel } from './LabSourcePanel'
import { MarkPanel } from './MarkPanel'
import { LabExportPanel } from './LabExportPanel'

// The research lab shell — an isolated route, deliberately NOT a fourth
// editor mode: it has its own store, its own undo history, its own
// autosave key, and it never writes the editor's URL hash or storage.
// The root layout gives it the font, the dark tokens, and dialkit.

export function LabShell() {
  const undo = useLabStore((s) => s.undo)
  const redo = useLabStore((s) => s.redo)

  // restore autosave -> defaults, then keep a debounced write-back
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAB_AUTOSAVE_KEY)
      if (saved) {
        const lab = deserializeLab(saved)
        if (lab) useLabStore.getState().replaceLab(lab)
      }
    } catch {
      // storage unavailable — the lab still runs, it just forgets
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsub = useLabStore.subscribe((s, prev) => {
      if (s.lab === prev.lab) return
      clearTimeout(timer)
      timer = setTimeout(() => {
        try {
          localStorage.setItem(LAB_AUTOSAVE_KEY, serializeLab(useLabStore.getState().lab))
        } catch {
          // quota/privacy failures stay silent, same as the editor
        }
      }, 500)
    })
    return () => {
      clearTimeout(timer)
      unsub()
    }
  }, [])

  // lab-local undo/redo — window-scoped but unmounts with the route
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ae = document.activeElement as HTMLElement | null
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  return (
    <div className="lab-root dialkit-root">
      <header className="lab-topbar">
        <Link className="lab-back" href="/">
          ← Editor
        </Link>
        <span className="lab-title">Research lab</span>
        <span className="lab-study-name">01 · Mark translation</span>
      </header>
      <div className="lab-columns">
        <aside className="lab-side">
          <LabSourcePanel />
          <div className="panel-section">
            <div className="panel-heading">Hypothesis</div>
            <div className="panel-note">
              A source image translated through the brand-shape vocabulary
              should feel more specific than generic ASCII, halftone, or
              dot conversion. The DOTS bank is the generic baseline to
              beat; BRAND stamps the shapes drawn in the editor.
            </div>
          </div>
        </aside>
        <main className="lab-stage">
          <LabCanvas />
        </main>
        <aside className="lab-side lab-side-right">
          <MarkPanel />
          <LabExportPanel />
        </aside>
      </div>
    </div>
  )
}
