'use client'

import { useLabStore } from '@/core/lab/labStore'
import { MARK_DEFAULTS } from '@/core/lab/composition'
import type { MarkBankId, MarkColorMode } from '@/core/lab/types'
import { Slider } from '@/components/controls/Slider'
import { SegmentedControl } from '@/components/controls/SegmentedControl'

const pct = (v: number) => String(Math.round(v * 100))

// The mark treatment's law: tone is coverage and size, structure is
// selection and rotation, FLOW hands orientation over to the curve.
export function MarkPanel() {
  const mark = useLabStore((s) => s.lab.mark)
  const seed = useLabStore((s) => s.lab.seed)
  const apply = useLabStore((s) => s.apply)
  const setT = useLabStore((s) => s.setTransient)
  const commit = useLabStore((s) => s.commitTransient)

  return (
    <div className="panel-section">
      <div className="panel-heading">Marks</div>
      <SegmentedControl<MarkBankId>
        label="Bank"
        value={mark.bank}
        options={[
          { value: 'dots', label: 'Dots' },
          { value: 'geo', label: 'Geo' },
          { value: 'brand', label: 'Brand' },
        ]}
        onChange={(bank) => apply({ mark: { bank } })}
      />
      <Slider label="Evidence" value={mark.evidenceMix} min={0} max={1} step={0.01} format={pct}
        defaultValue={MARK_DEFAULTS.evidenceMix}
        onChange={(evidenceMix) => setT({ mark: { evidenceMix } })} onCommit={commit} />
      <div className="panel-note">0% tone chooses the mark · 100% structure chooses it</div>
      <Slider label="Occupancy" value={mark.occupancy} min={0} max={1} step={0.01} format={pct}
        defaultValue={MARK_DEFAULTS.occupancy}
        onChange={(occupancy) => setT({ mark: { occupancy } })} onCommit={commit} />
      <Slider label="Scale min" value={mark.minScale} min={0.05} max={1} step={0.01} format={pct}
        defaultValue={MARK_DEFAULTS.minScale}
        onChange={(minScale) => setT({ mark: { minScale } })} onCommit={commit} />
      <Slider label="Scale max" value={mark.maxScale} min={0.1} max={1.6} step={0.01} format={pct}
        defaultValue={MARK_DEFAULTS.maxScale}
        onChange={(maxScale) => setT({ mark: { maxScale } })} onCommit={commit} />
      <Slider label="Rotation" value={mark.rotationInfluence} min={0} max={1} step={0.01}
        format={pct} defaultValue={MARK_DEFAULTS.rotationInfluence}
        onChange={(rotationInfluence) => setT({ mark: { rotationInfluence } })} onCommit={commit} />
      <Slider label="Flow" value={mark.flow} min={0} max={1} step={0.01} format={pct}
        defaultValue={MARK_DEFAULTS.flow}
        onChange={(flow) => setT({ mark: { flow } })} onCommit={commit} />
      <div className="panel-note">
        0% marks follow the image&apos;s edges · 100% they flow with the curve
      </div>
      <Slider label="Coherence" value={mark.coherenceScale} min={0} max={1} step={0.01}
        format={pct} defaultValue={MARK_DEFAULTS.coherenceScale}
        onChange={(coherenceScale) => setT({ mark: { coherenceScale } })} onCommit={commit} />
      <Slider label="Echo" value={mark.echo ?? 0} min={0} max={6} step={1}
        format={(v) => String(Math.round(v))} defaultValue={0}
        onChange={(echo) => setT({ mark: { echo } })} onCommit={commit} />
      <div className="panel-note">Echo trails each mark along the flow — motion left on the page.</div>
      <SegmentedControl<MarkColorMode>
        label="Color"
        value={mark.colorMode}
        options={[
          { value: 'ink', label: 'Ink' },
          { value: 'tint', label: 'Tints' },
          { value: 'source', label: 'Source' },
          { value: 'palette', label: 'Palette' },
        ]}
        onChange={(colorMode) => apply({ mark: { colorMode } })}
      />
      <div className="lab-row">
        <button
          className="ctl-action"
          onClick={() => apply({ seed: ((Date.now() ^ 0x9e3779b9) >>> 0) % 100000 })}
        >
          Reroll seed · {seed}
        </button>
        <button className="ctl-action" onClick={() => apply({ mark: { ...MARK_DEFAULTS } })}>
          Reset marks
        </button>
      </div>
    </div>
  )
}
