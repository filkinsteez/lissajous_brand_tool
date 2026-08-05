'use client'

import Link from 'next/link'
import { usePristineHref } from '@/components/usePristineHref'
import { useStore } from '@/core/state/store'

// Two tabs plus a door: DESIGN is the poster (canvas, field, shapes,
// type), MOTION is the animation side (the easing lab and the path lab
// live under it). LAB is a LINK, not a mode — the research lab is its
// own route with its own store, deliberately outside this document's
// undo/autosave machinery.
// 'setup' (construction view) is a state of DESIGN, not its own tab.
export function ModeSwitcher() {
  const mode = useStore((s) => s.ui.mode)
  const setUi = useStore((s) => s.setUi)
  const designActive = mode === 'compose' || mode === 'setup'
  const motionActive = mode === 'motion' || mode === 'path'
  const labPath = usePristineHref('/lab')
  return (
    <div className="mode-switcher" role="tablist" aria-label="Editor mode">
      <button
        role="tab"
        aria-selected={designActive}
        className={designActive ? 'mode-tab active' : 'mode-tab'}
        onClick={() => setUi({ mode: 'compose', activePanel: 'compose' })}
      >
        Design
      </button>
      <button
        role="tab"
        aria-selected={motionActive}
        className={motionActive ? 'mode-tab active' : 'mode-tab'}
        onClick={() => setUi({ mode: 'motion', activePanel: 'motion' })}
      >
        Motion
      </button>
      {/* keeps ?pristine — a scratch session must never navigate into
          the real one and start writing its autosave */}
      <Link className="mode-tab" href={labPath}>
        Lab
      </Link>
    </div>
  )
}
