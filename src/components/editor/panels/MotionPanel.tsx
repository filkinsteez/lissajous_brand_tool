'use client'

import { useState } from 'react'
import { useStore } from '@/core/state/store'
import { Slider } from '@/components/controls/Slider'
import { curveArcEasing, MOTION_PRESETS, toCssLinear } from '@/core/motion/spring'

const int = (v: number) => String(Math.round(v))
const deg = (rad: number) => `${Math.round((rad * 180) / Math.PI)}°`

export function MotionPanel() {
  const project = useStore((s) => s.project)
  const ml = project.motionLab
  const apply = useStore((s) => s.apply)
  const setT = useStore((s) => s.setTransient)
  const commit = useStore((s) => s.commitTransient)
  const [note, setNote] = useState('')

  const flash = (msg: string) => {
    setNote(msg)
    setTimeout(() => setNote(''), 2500)
  }

  return (
    <div className="panel">
      <div className="panel-section">
        <div className="panel-heading">EASING — A LISSAJOUS FIGURE</div>
        <div className="preset-strip">
          {MOTION_PRESETS.map((p) => (
            <button
              key={p.id}
              className={ml.presetId === p.id ? 'preset-chip active' : 'preset-chip'}
              onClick={() =>
                apply({
                  motionLab: { ratioX: p.ratioX, ratioY: p.ratioY, phase: p.phase, presetId: p.id },
                })
              }
            >
              {p.label}
            </button>
          ))}
        </div>
        <Slider label="RATIO X" value={ml.ratioX} min={1} max={8} step={1} format={int}
          onChange={(ratioX) => setT({ motionLab: { ratioX, presetId: undefined } })} onCommit={commit} />
        <Slider label="RATIO Y" value={ml.ratioY} min={1} max={8} step={1} format={int}
          onChange={(ratioY) => setT({ motionLab: { ratioY, presetId: undefined } })} onCommit={commit} />
        <Slider label="PHASE" value={ml.phase} min={0} max={Math.PI} step={Math.PI / 180} format={deg}
          onChange={(phase) => setT({ motionLab: { phase, presetId: undefined } })} onCommit={commit} />
        <button
          className="ctl-action"
          onClick={() =>
            apply({
              motionLab: {
                ratioX: project.lissajous.frequencyX,
                ratioY: project.lissajous.frequencyY,
                phase: project.lissajous.phase,
                presetId: undefined,
              },
            })
          }
        >
          MATCH SYSTEM CURVE ({project.lissajous.frequencyX}:{project.lissajous.frequencyY})
        </button>
        <div className="panel-note">
          Ratio and phase pick a figure from the same family as the grid; one arc of
          it, read left to right, is the easing. 1:1 is linear — more lobes, more spring.
        </div>
      </div>
      <div className="panel-section">
        <Slider label="DURATION" value={ml.durationMs} min={400} max={3000} step={50}
          format={(v) => `${Math.round(v)}ms`}
          onChange={(durationMs) => setT({ motionLab: { durationMs } })} onCommit={commit} />
      </div>
      <div className="panel-section">
        <div className="panel-heading">TOKENS</div>
        <button
          className="ctl-action"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(
                toCssLinear(curveArcEasing({
                  frequencyX: ml.ratioX, frequencyY: ml.ratioY, phase: ml.phase,
                }).lut),
              )
              flash('CSS EASING COPIED')
            } catch {
              flash('CLIPBOARD BLOCKED')
            }
          }}
        >
          COPY CSS EASING
        </button>
        {note ? <div className="panel-note">{note}</div> : null}
        <div className="panel-note">A linear() easing function, usable in CSS and JS animation.</div>
      </div>
    </div>
  )
}
