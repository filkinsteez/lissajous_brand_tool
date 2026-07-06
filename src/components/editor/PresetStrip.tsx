'use client'

import { useStore } from '@/core/state/store'
import { applyRatioPreset, RATIO_PRESETS } from '@/core/lissajous/presets'

export function PresetStrip() {
  const presetId = useStore((s) => s.project.lissajous.presetId)
  const apply = useStore((s) => s.apply)
  return (
    <div className="preset-strip">
      {RATIO_PRESETS.map((p) => (
        <button
          key={p.id}
          className={p.id === presetId ? 'preset-chip active' : 'preset-chip'}
          onClick={() => apply({ lissajous: applyRatioPreset(p) })}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}
