'use client'

import { useStore, type EditorMode } from '@/core/state/store'

const MODES: { id: EditorMode; label: string }[] = [
  { id: 'compose', label: 'COMPOSE' },
  { id: 'setup', label: 'LISSAJOUS SETUP' },
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
          aria-selected={mode === m.id}
          className={mode === m.id ? 'mode-tab active' : 'mode-tab'}
          onClick={() => setUi({ mode: m.id })}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}
