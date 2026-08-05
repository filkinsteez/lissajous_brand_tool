'use client'

import { useLabStore } from '@/core/lab/labStore'
import { PALETTES } from '@/core/lab/colorField'
import { INK, PAPER } from '@/core/state/defaults'
import { ColorField } from '@/components/controls/ColorField'

// Color: palette presets, the swatches, and the two fixed roles. One
// home for every color decision (mark coloring included — the "Color
// from" mode lives in Adjust > Marks but palettes always feed fills).
export function ColorsPanel() {
  const colors = useLabStore((s) => s.lab.colors)
  const apply = useLabStore((s) => s.apply)
  const setT = useLabStore((s) => s.setTransient)
  const commit = useLabStore((s) => s.commitTransient)

  const activePreset = PALETTES.find(
    (p) => p.colors.length === colors.palette.length && p.colors.every((c, i) => colors.palette[i] === c),
  )?.id

  return (
    <div className="panel-section">
      <div className="panel-heading">Color</div>
      <div className="lab-add-row">
        {PALETTES.map((p) => (
          <button
            key={p.id}
            className={activePreset === p.id ? 'lab-chip active' : 'lab-chip'}
            onClick={() => apply({ colors: { palette: [...p.colors], ink: p.ink, paper: p.ground } })}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="lab-swatch-row">
        {(colors?.palette ?? []).map((c, i) => (
          <ColorField key={i} label="" value={c}
            onChange={(v) => {
              const palette = [...(useLabStore.getState().lab.colors.palette ?? [])]
              palette[i] = v
              setT({ colors: { palette } })
            }}
            onCommit={commit} />
        ))}
      </div>
      <ColorField label="Lines" value={colors?.ink ?? INK}
        onChange={(ink) => setT({ colors: { ink } })} onCommit={commit} />
      <ColorField label="Background" value={colors?.paper ?? PAPER}
        onChange={(paper) => setT({ colors: { paper } })} onCommit={commit} />
    </div>
  )
}
