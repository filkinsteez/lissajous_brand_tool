'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { LAB_AUTOSAVE_KEY, labHydration, useLabStore } from '@/core/lab/labStore'
import { serializeLab, deserializeLab } from '@/core/lab/recipe'
import { setLabReturnTarget, takeLabHandoff } from '@/core/lab/handoff'
import { usePristineHref } from '@/components/usePristineHref'
import { importLabSource } from './importSource'
import { refreshCurveSources } from './refreshCurve'
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
  const designPath = usePristineHref('/')

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

  // the curve follows the design tab — on mount and whenever the window
  // refocuses (the user may have reshaped it in another tab)
  useEffect(() => {
    refreshCurveSources()
    window.addEventListener('focus', refreshCurveSources)
    return () => window.removeEventListener('focus', refreshCurveSources)
  }, [])

  // dev state hook — the lab twin of __lbs, for scripted verification
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return
    const w = window as unknown as { __lbsLab?: unknown }
    w.__lbsLab = {
      getState: () => useLabStore.getState(),
      setUi: (p: Record<string, unknown>) => useLabStore.getState().setUi(p),
      apply: (p: Record<string, unknown>) => useLabStore.getState().apply(p),
    }
    return () => {
      delete (w as { __lbsLab?: unknown }).__lbsLab
    }
  }, [])

  // "Edit Image" handoff: an image sent over from the design canvas
  // loads exactly like a drop
  useEffect(() => {
    const h = takeLabHandoff()
    if (!h) return
    void (async () => {
      try {
        const blob = await (await fetch(h.src)).blob()
        const file = new File([blob], h.name || 'design-image.png', {
          type: blob.type || 'image/png',
        })
        // 'cover' reproduces the framing the design block already shows
        const hash = await importLabSource(file, { fit: 'cover' })
        // Gate BOTH the return binding and the output reshape on the
        // import actually succeeding. importLabSource swallows failures
        // (it only sets a note), so without this the lab would keep the
        // PREVIOUS composition on screen while claiming to be editing
        // this block — and Send to Design would overwrite the block with
        // an unrelated image.
        if (!hash) {
          useLabStore
            .getState()
            .setUi({ note: 'Could not open that image in the lab — it was left unchanged.' })
          return
        }
        if (h.imageId) setLabReturnTarget({ imageId: h.imageId, sourceHash: hash })
        // compose at the BLOCK's shape, not the photo's: the block
        // cover-fits whatever comes back, so authoring at a different
        // aspect would crop the composition's edges off on return
        if (h.rect && Number.isFinite(h.rect.w) && Number.isFinite(h.rect.h) &&
            h.rect.w > 0 && h.rect.h > 0) {
          const live = useLabStore.getState()
          const src = live.lab.source
          const long = Math.min(2048, Math.max(1200, src ? Math.max(src.width, src.height) : 1400))
          const aspect = h.rect.w / h.rect.h
          // Size the LONG edge, then rescale if the short edge would
          // fall under the 64px floor — flooring the short edge in place
          // would silently change the aspect (a 24×1080 sliver block
          // asked for 0.022 and got 0.046, and the block then visibly
          // fattened on return).
          let w = aspect >= 1 ? long : long * aspect
          let hh = aspect >= 1 ? long / aspect : long
          const short = Math.min(w, hh)
          if (short < 64) {
            const k = 64 / short
            w *= k
            hh *= k
          }
          const cap = Math.max(w, hh) > 8192 ? 8192 / Math.max(w, hh) : 1
          const even = (v: number) => Math.max(64, Math.min(8192, Math.round((v * cap) / 2) * 2))
          live.apply({ output: { width: even(w), height: even(hh) } })
        }
      } catch {
        useLabStore.getState().setUi({ note: 'Could not load the image from the editor.' })
      }
    })()
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
        <Link className="lab-back" href={designPath}>
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
