'use client'

import { useLabStore } from '@/core/lab/labStore'
import { labHistory } from '@/core/lab/labStore'
import { mintShuffleSeed, shuffleLab } from '@/core/lab/shuffle'
import type { ShuffleScopes } from '@/core/lab/shuffle'

const SCOPES: { key: keyof ShuffleScopes; label: string }[] = [
  { key: 'seed', label: 'Seed' },
  { key: 'fields', label: 'Fields' },
  { key: 'bands', label: 'Bands' },
  { key: 'marks', label: 'Marks' },
  { key: 'colors', label: 'Colors' },
]

// One click, one variant, one undo entry — Back walks the options
// you've already seen. The chips scope what varies; everything not
// selected (and the painted mask, always) stays exactly as authored.
export function ShufflePanel() {
  const scopes = useLabStore((s) => s.ui.shuffleScopes)
  const historyVersion = useLabStore((s) => s.historyVersion)
  const setUi = useLabStore((s) => s.setUi)
  const undo = useLabStore((s) => s.undo)
  void historyVersion // Back's disabled state tracks history depth

  const anyScope = Object.values(scopes).some(Boolean)

  return (
    <div className="panel-section">
      <div className="panel-heading">Shuffle</div>
      <div className="lab-row">
        <button
          className="ctl-action primary"
          disabled={!anyScope}
          onClick={() => {
            const s = useLabStore.getState()
            s.apply(shuffleLab(s.lab, mintShuffleSeed(), s.ui.shuffleScopes))
          }}
        >
          Shuffle
        </button>
        <button className="ctl-action" disabled={labHistory.depth.past === 0} onClick={undo}>
          Back
        </button>
      </div>
      <div className="lab-add-row">
        {SCOPES.map(({ key, label }) => (
          <button
            key={key}
            className={scopes[key] ? 'lab-chip active' : 'lab-chip'}
            aria-pressed={scopes[key]}
            onClick={() => setUi({ shuffleScopes: { ...scopes, [key]: !scopes[key] } })}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
