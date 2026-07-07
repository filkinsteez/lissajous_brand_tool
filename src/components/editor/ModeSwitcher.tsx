'use client'

import { useStore, type EditorMode } from '@/core/state/store'

const MODES: { id: EditorMode; label: string }[] = [
  { id: 'compose', label: 'LAYOUT' },
  { id: 'motion', label: 'MOTION' },
  { id: 'path', label: 'PATH' },
]

// 'setup' (construction view) is a state of LAYOUT, not its own tab
const isActive = (id: EditorMode, mode: EditorMode) =>
  id === 'compose' ? mode === 'compose' || mode === 'setup' : mode === id

export function ModeSwitcher() {
  const mode = useStore((s) => s.ui.mode)
  const setUi = useStore((s) => s.setUi)
  return (
    <div className="mode-switcher" role="tablist" aria-label="Editor mode">
      {MODES.map((m) => (
        <button
          key={m.id}
          role="tab"
          aria-selected={isActive(m.id, mode)}
          className={isActive(m.id, mode) ? 'mode-tab active' : 'mode-tab'}
          onClick={() =>
            setUi({
              mode: m.id,
              activePanel: m.id === 'motion' ? 'motion' : m.id === 'path' ? 'path' : 'compose',
            })
          }
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}
