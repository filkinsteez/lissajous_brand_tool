'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { LAB_AUTOSAVE_KEY, labHydration, useLabStore } from '@/core/lab/labStore'
import { serializeLab, deserializeLab } from '@/core/lab/recipe'
import { LabCanvas } from './LabCanvas'
import { LabSourcePanel } from './LabSourcePanel'
import { LooksPanel } from './LooksPanel'
import { QuickPanel } from './QuickPanel'
import { ColorsPanel } from './ColorsPanel'
import { AdjustPanel } from './AdjustPanel'
import { LabExportPanel } from './LabExportPanel'

// The research lab shell — an isolated route, deliberately NOT a fourth
// editor mode: it has its own store, its own undo history, its own
// autosave key, and it never writes the editor's URL hash or storage.
// The root layout gives it the font, the dark tokens, and dialkit.

export function LabShell() {
  const undo = useLabStore((s) => s.undo)
  const redo = useLabStore((s) => s.redo)

  // restore autosave -> defaults ONCE PER PAGE LOAD (the store outlives
  // route mounts — restoring on every mount would replace live state
  // with storage and wipe undo), then keep a debounced write-back that
  // FLUSHES on unmount so leaving the lab never drops the last edit.
  // /lab?pristine skips BOTH directions — a scratch session that can
  // never touch the user's saved composition (verification runs burned
  // an autosave once through a restore/debounce race; never again).
  useEffect(() => {
    if (typeof location !== 'undefined' && location.search.includes('pristine')) return
    if (!labHydration.done) {
      labHydration.done = true
      try {
        const saved = localStorage.getItem(LAB_AUTOSAVE_KEY)
        if (saved) {
          const lab = deserializeLab(saved)
          if (lab) useLabStore.getState().replaceLab(lab)
        }
      } catch {
        // storage unavailable — the lab still runs, it just forgets
      }
    }
    const write = () => {
      try {
        localStorage.setItem(LAB_AUTOSAVE_KEY, serializeLab(useLabStore.getState().lab))
      } catch {
        // quota/privacy failures stay silent, same as the editor
      }
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    let dirty = false
    const unsub = useLabStore.subscribe((s, prev) => {
      if (s.lab === prev.lab) return
      dirty = true
      clearTimeout(timer)
      timer = setTimeout(() => {
        dirty = false
        write()
      }, 500)
    })
    return () => {
      clearTimeout(timer)
      unsub()
      if (dirty) write()
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
        <span className="lab-title">Lab</span>
      </header>
      <div className="lab-columns">
        <aside className="lab-side">
          <LabSourcePanel />
        </aside>
        <main className="lab-stage">
          <LabCanvas />
        </main>
        <aside className="lab-side lab-side-right">
          <LooksPanel />
          <QuickPanel />
          <ColorsPanel />
          <AdjustPanel />
          <LabExportPanel />
        </aside>
      </div>
    </div>
  )
}
