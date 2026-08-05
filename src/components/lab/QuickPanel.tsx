'use client'

import { useState } from 'react'
import { labHistory, useLabStore } from '@/core/lab/labStore'
import { resetLab } from '@/core/lab/recipe'
import { mintShuffleSeed, shuffleLab } from '@/core/lab/shuffle'
import { Slider } from '@/components/controls/Slider'

const pct = (v: number) => String(Math.round(v * 100))
const px = (v: number) => String(Math.round(v))

// The primary dials: three perceptual controls that always do
// something, plus try/undo/reset. Everything else lives under Adjust.
export function QuickPanel() {
  const baseCell = useLabStore((s) => s.lab.structure.baseCell)
  const gain = useLabStore((s) => s.lab.territory.gain ?? 1)
  const grain = useLabStore((s) => s.lab.finish.grain)
  const historyVersion = useLabStore((s) => s.historyVersion)
  const setT = useLabStore((s) => s.setTransient)
  const commit = useLabStore((s) => s.commitTransient)
  const undo = useLabStore((s) => s.undo)
  const [confirmReset, setConfirmReset] = useState(false)
  void historyVersion

  return (
    <div className="panel-section">
      <div className="lab-row">
        <button
          className="ctl-action primary"
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
        <button className="ctl-action" onClick={() => setConfirmReset(true)}>
          Reset
        </button>
      </div>
      {confirmReset ? (
        <div
          role="alertdialog"
          aria-label="Confirm reset"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setConfirmReset(false)
          }}
        >
          <div className="panel-note">
            Start over with a clean setup? Your image stays. Undo brings this back.
          </div>
          <div className="lab-row">
            <button
              className="ctl-action primary"
              autoFocus
              onClick={() => {
                const s = useLabStore.getState()
                labHistory.push(s.lab)
                s.replaceLab(resetLab(s.lab), { keepHistory: true })
                setConfirmReset(false)
              }}
            >
              Start over
            </button>
            <button className="ctl-action" onClick={() => setConfirmReset(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      <Slider label="Coarseness" value={baseCell} min={12} max={96} step={1} format={px}
        unit="px" defaultValue={30}
        onChange={(baseCell) => setT({ structure: { baseCell } })} onCommit={commit} />
      <Slider label="Coverage" value={gain} min={0.2} max={1.6} step={0.01} format={pct}
        defaultValue={1}
        onChange={(gain) => setT({ territory: { gain } })} onCommit={commit} />
      <Slider label="Grain" value={grain} min={0} max={1} step={0.01} format={pct}
        defaultValue={0.1}
        onChange={(grain) => setT({ finish: { grain } })} onCommit={commit} />
    </div>
  )
}
