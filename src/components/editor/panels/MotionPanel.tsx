'use client'

import { useState } from 'react'
import { useStore } from '@/core/state/store'
import { Slider } from '@/components/controls/Slider'
import { SegmentedControl } from '@/components/controls/SegmentedControl'
import {
  cssMotionSystem,
  lissajousEasing,
  MOTION_PRESETS,
  MOTION_TOKENS,
  toCssLinear,
  type EasingRead,
} from '@/core/motion/spring'

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

  const copy = async (text: string, msg: string) => {
    try {
      await navigator.clipboard.writeText(text)
      flash(msg)
    } catch {
      flash('CLIPBOARD BLOCKED')
    }
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
                  motionLab: {
                    ratioX: p.ratioX, ratioY: p.ratioY, phase: p.phase, read: p.read,
                    reverse: !!p.reverse, strength: p.strength ?? 0, decay: p.decay ?? 0,
                    presetId: p.id,
                  },
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
        <SegmentedControl<EasingRead>
          label="READ ARC AS"
          value={ml.read}
          options={[
            { value: 'velocity', label: 'SPEED GRAPH' },
            { value: 'position', label: 'VALUE GRAPH' },
          ]}
          onChange={(read) => apply({ motionLab: { read, presetId: undefined } })}
        />
        <SegmentedControl
          label="DIRECTION"
          value={ml.reverse ? 'reverse' : 'forward'}
          options={[
            { value: 'forward', label: 'FORWARD' },
            { value: 'reverse', label: 'REVERSED' },
          ]}
          onChange={(v) => apply({ motionLab: { reverse: v === 'reverse', presetId: undefined } })}
        />
        <Slider label="STRENGTH" value={ml.strength} min={0} max={1}
          format={(v) => `${Math.round(v * 100)}`}
          onChange={(strength) => setT({ motionLab: { strength, presetId: undefined } })} onCommit={commit} />
        <Slider label="DECAY" value={ml.decay} min={0} max={1}
          format={(v) => `${Math.round(v * 100)}`}
          onChange={(decay) => setT({ motionLab: { decay, presetId: undefined } })} onCommit={commit} />
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
          As a speed graph the arc is AE&apos;s default view: an arch means ease in and
          out. As a value graph the arc is the position itself — lobes overshoot.
        </div>
      </div>
      <div className="panel-section">
        <Slider label="DURATION" value={ml.durationMs} min={400} max={3000} step={50}
          format={(v) => `${Math.round(v)}ms`}
          onChange={(durationMs) => setT({ motionLab: { durationMs } })} onCommit={commit} />
      </div>
      <div className="panel-section">
        <div className="panel-heading">MOTION SYSTEM</div>
        <div className="preset-strip">
          {MOTION_TOKENS.map((t) => (
            <button
              key={t.id}
              className="preset-chip"
              onClick={() =>
                apply({
                  motionLab: {
                    ratioX: t.ratioX, ratioY: t.ratioY, phase: t.phase, read: t.read,
                    reverse: !!t.reverse, strength: t.strength ?? 0, decay: t.decay ?? 0,
                    presetId: undefined,
                  },
                })
              }
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          className="ctl-action primary"
          onClick={() => copy(cssMotionSystem(ml.durationMs), 'MOTION SYSTEM COPIED')}
        >
          COPY MOTION SYSTEM (CSS)
        </button>
        <button
          className="ctl-action"
          onClick={() =>
            copy(
              toCssLinear(lissajousEasing({
                ratioX: ml.ratioX, ratioY: ml.ratioY, phase: ml.phase, read: ml.read,
                reverse: ml.reverse, strength: ml.strength, decay: ml.decay,
              }).lut),
              'CSS EASING COPIED',
            )
          }
        >
          COPY CURRENT EASING
        </button>
        {note ? <div className="panel-note">{note}</div> : null}
        <div className="panel-note">
          Four roles from one family: standard (the arch), enter (decelerate),
          exit (accelerate), emphasis (the 1:3 swing) — plus a duration scale.
          Click a role to inspect it above.
        </div>
      </div>
    </div>
  )
}
