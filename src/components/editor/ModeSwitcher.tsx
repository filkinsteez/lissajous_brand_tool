'use client'

import { useStore, type EditorMode } from '@/core/state/store'

const MODES: { id: EditorMode; label: string }[] = [
  { id: 'compose', label: 'COMPOSE' },
  { id: 'motion', label: 'MOTION' },
]

export function ModeSwitcher() {
  const mode = useStore((s) => s.ui.mode)
  const setUi = useStore((s) => s.setUi)
  return (
    <div className="mode-switcher" role="tablist" aria-label="Editor mode">
      {MODES.map((m) => (
        <button
          key={m.id}
          role="tab"
          aria-selected={m.id === 'compose' ? mode !== 'motion' : mode === 'motion'}
          className={
            (m.id === 'compose' ? mode !== 'motion' : mode === 'motion')
              ? 'mode-tab active'
              : 'mode-tab'
          }
          onClick={() =>
            m.id === 'motion'
              ? setUi({ mode: 'motion', activePanel: 'motion' })
              : setUi({ mode: 'compose', activePanel: 'compose' })
          }
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}
