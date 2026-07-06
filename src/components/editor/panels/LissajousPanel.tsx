'use client'

import { useStore } from '@/core/state/store'
import { Slider } from '@/components/controls/Slider'
import { PresetStrip } from '../PresetStrip'

const deg = (rad: number) => `${Math.round((rad * 180) / Math.PI)}°`
const pct = (v: number) => `${Math.round(v * 100)}`

export function LissajousPanel() {
  const liss = useStore((s) => s.project.lissajous)
  const setT = useStore((s) => s.setTransient)
  const commit = useStore((s) => s.commitTransient)

  return (
    <div className="panel">
      <div className="panel-section">
        <div className="panel-heading">RATIO</div>
        <PresetStrip />
      </div>
      <div className="panel-section">
        <Slider label="FREQ X" value={liss.frequencyX} min={1} max={12} step={1}
          onChange={(v) => setT({ lissajous: { frequencyX: v, presetId: undefined } })} onCommit={commit} />
        <Slider label="FREQ Y" value={liss.frequencyY} min={1} max={12} step={1}
          onChange={(v) => setT({ lissajous: { frequencyY: v, presetId: undefined } })} onCommit={commit} />
        <Slider label="PHASE" value={liss.phase} min={0} max={Math.PI} step={Math.PI / 180}
          format={deg}
          onChange={(v) => setT({ lissajous: { phase: v } })} onCommit={commit} />
      </div>
      <div className="panel-section">
        <Slider label="AMP X" value={liss.amplitudeX} min={0.2} max={1} format={pct}
          onChange={(v) => setT({ lissajous: { amplitudeX: v } })} onCommit={commit} />
        <Slider label="AMP Y" value={liss.amplitudeY} min={0.2} max={1} format={pct}
          onChange={(v) => setT({ lissajous: { amplitudeY: v } })} onCommit={commit} />
        <Slider label="ROTATION" value={liss.rotation} min={-Math.PI / 4} max={Math.PI / 4}
          step={Math.PI / 360} format={deg}
          onChange={(v) => setT({ lissajous: { rotation: v } })} onCommit={commit} />
        <Slider label="OFFSET X" value={liss.offsetX} min={-0.4} max={0.4} format={pct}
          onChange={(v) => setT({ lissajous: { offsetX: v } })} onCommit={commit} />
        <Slider label="OFFSET Y" value={liss.offsetY} min={-0.4} max={0.4} format={pct}
          onChange={(v) => setT({ lissajous: { offsetY: v } })} onCommit={commit} />
      </div>
    </div>
  )
}
