'use client'

import { useLabStore } from '@/core/lab/labStore'
import { MARK_DEFAULTS } from '@/core/lab/markTranslation'
import type { MarkBankId, MarkColorMode } from '@/core/lab/types'
import { Slider } from '@/components/controls/Slider'
import { SegmentedControl } from '@/components/controls/SegmentedControl'

const pct = (v: number) => String(Math.round(v * 100))
const px = (v: number) => String(Math.round(v))

// Controls follow the brief's set for study 1 and nothing more — each
// one exists to test the hypothesis, not to be product UI.
export function MarkPanel() {
  const mark = useLabStore((s) => s.lab.mark)
  const seed = useLabStore((s) => s.lab.seed)
  const apply = useLabStore((s) => s.apply)
  const setT = useLabStore((s) => s.setTransient)
  const commit = useLabStore((s) => s.commitTransient)

  return (
    <div className="panel-section">
      <div className="panel-heading">Mark translation</div>
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
      <Slider label="Cell size" value={mark.cellSize} min={8} max={96} step={1} format={px}
        unit="px" defaultValue={MARK_DEFAULTS.cellSize}
        onChange={(cellSize) => setT({ mark: { cellSize } })} onCommit={commit} />
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
      <Slider label="Coherence" value={mark.coherenceScale} min={0} max={1} step={0.01}
        format={pct} defaultValue={MARK_DEFAULTS.coherenceScale}
        onChange={(coherenceScale) => setT({ mark: { coherenceScale } })} onCommit={commit} />
      <Slider label="Source" value={mark.sourceVisibility} min={0} max={1} step={0.01}
        format={pct} defaultValue={MARK_DEFAULTS.sourceVisibility}
        onChange={(sourceVisibility) => setT({ mark: { sourceVisibility } })} onCommit={commit} />
      <SegmentedControl<MarkColorMode>
        label="Color"
        value={mark.colorMode}
        options={[
          { value: 'ink', label: 'Ink' },
          { value: 'tint', label: 'Tints' },
          { value: 'source', label: 'Source' },
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
          Reset study
        </button>
      </div>
    </div>
  )
}
