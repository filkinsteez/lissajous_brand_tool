'use client'

import { useStore } from '@/core/state/store'
import { applyRatioPreset, RATIO_PRESETS, type RatioPreset } from '@/core/lissajous/presets'

const W = 56
const H = 40

// each chip SHOWS its figure — "3:2" means nothing until you see the curve
function figurePath(p: RatioPreset): string {
  let d = ''
  for (let i = 0; i <= 240; i++) {
    const t = (i / 240) * Math.PI * 2
    const x = W / 2 + Math.sin(p.frequencyX * t + p.phase) * (W / 2 - 5)
    const y = H / 2 - Math.sin(p.frequencyY * t) * (H / 2 - 5)
    d += `${d ? ' L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`
  }
  return d + ' Z'
}

export function PresetStrip() {
  const presetId = useStore((s) => s.project.lissajous.presetId)
  const apply = useStore((s) => s.apply)
  return (
    <div className="preset-strip ratio-strip">
      {RATIO_PRESETS.map((p) => (
        <button
          key={p.id}
          className={p.id === presetId ? 'preset-chip figure-chip active' : 'preset-chip figure-chip'}
          onClick={() => apply({ lissajous: applyRatioPreset(p) })}
        >
          <svg viewBox={`0 0 ${W} ${H}`} className="figure-chip-svg" aria-hidden>
            <path d={figurePath(p)} />
          </svg>
          {p.label}
        </button>
      ))}
    </div>
  )
}
