'use client'

import { useStore } from '@/core/state/store'

// Two tabs: DESIGN is the poster (canvas, field, shapes, type), MOTION
// is the animation side (the easing lab and the path lab live under it).
// 'setup' (construction view) is a state of DESIGN, not its own tab.
export function ModeSwitcher() {
  const mode = useStore((s) => s.ui.mode)
  const setUi = useStore((s) => s.setUi)
  const designActive = mode === 'compose' || mode === 'setup'
  const motionActive = mode === 'motion' || mode === 'path'
  return (
    <div className="mode-switcher" role="tablist" aria-label="Editor mode">
      <button
        role="tab"
        aria-selected={designActive}
        className={designActive ? 'mode-tab active' : 'mode-tab'}
        onClick={() => setUi({ mode: 'compose', activePanel: 'compose' })}
      >
        DESIGN
      </button>
      <button
        role="tab"
        aria-selected={motionActive}
        className={motionActive ? 'mode-tab active' : 'mode-tab'}
        onClick={() => setUi({ mode: 'motion', activePanel: 'motion' })}
      >
        MOTION
      </button>
    </div>
  )
}
