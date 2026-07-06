'use client'

import { useStore } from '@/core/state/store'
import { Slider } from '@/components/controls/Slider'
import { Toggle } from '@/components/controls/Toggle'
import { MATERIAL_PRESETS } from '@/core/materials/presets'

const pct = (v: number) => `${Math.round(v * 100)}`

export function MaterialPanel() {
  const mat = useStore((s) => s.project.material)
  const apply = useStore((s) => s.apply)
  const setT = useStore((s) => s.setTransient)
  const commit = useStore((s) => s.commitTransient)

  return (
    <div className="panel">
      <div className="panel-section">
        <Toggle label="LISSAJOUS GRAIN" value={mat.enabled}
          onChange={(enabled) => apply({ material: { enabled } })} />
        <div className="preset-strip">
          {MATERIAL_PRESETS.map((p) => (
            <button
              key={p.id}
              className={mat.preset === p.id ? 'preset-chip active' : 'preset-chip'}
              onClick={() => apply({ material: { ...p.values, preset: p.id, enabled: true } })}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="panel-section">
        <Slider label="PRESSURE" value={mat.pressure} min={0} max={1} format={pct}
          onChange={(pressure) => setT({ material: { pressure } })} onCommit={commit} />
        <Slider label="DENSITY" value={mat.density} min={0} max={1} format={pct}
          onChange={(density) => setT({ material: { density } })} onCommit={commit} />
        <Slider label="GRAIN SIZE" value={mat.grainSize} min={0} max={1} format={pct}
          onChange={(grainSize) => setT({ material: { grainSize } })} onCommit={commit} />
        <Slider label="DRIFT" value={mat.drift} min={0} max={1} format={pct}
          onChange={(drift) => setT({ material: { drift } })} onCommit={commit} />
        <Slider label="FOLD" value={mat.fold} min={0} max={1} format={pct}
          onChange={(fold) => setT({ material: { fold } })} onCommit={commit} />
        <Slider label="RING" value={mat.ring} min={0} max={1} format={pct}
          onChange={(ring) => setT({ material: { ring } })} onCommit={commit} />
        <Slider label="CONTRAST" value={mat.contrast} min={0} max={1} format={pct}
          onChange={(contrast) => setT({ material: { contrast } })} onCommit={commit} />
        <Slider label="VOID" value={mat.voidStrength} min={0} max={1} format={pct}
          onChange={(voidStrength) => setT({ material: { voidStrength } })} onCommit={commit} />
        <Slider label="MOTION" value={mat.motion} min={0} max={1} format={pct}
          onChange={(motion) => setT({ material: { motion } })} onCommit={commit} />
      </div>
      <div className="panel-section">
        <button
          className="ctl-action"
          onClick={() => apply({ seed: Math.floor(Math.random() * 99991) + 1 })}
        >
          REROLL SYSTEM SEED
        </button>
        <div className="panel-note">
          The seed drives grain and glyph placement together — one system, one hand.
        </div>
      </div>
    </div>
  )
}
