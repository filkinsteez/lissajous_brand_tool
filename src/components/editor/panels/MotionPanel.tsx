'use client'

import { useState } from 'react'
import { useStore } from '@/core/state/store'
import { Slider } from '@/components/controls/Slider'
import { SegmentedControl } from '@/components/controls/SegmentedControl'
import { TextField } from '@/components/controls/TextField'
import { Toggle } from '@/components/controls/Toggle'
import { MOTION_PRESETS, springLUT, toCssLinear } from '@/core/motion/spring'
import type { PathShape } from '@/core/state/types'

const int = (v: number) => String(Math.round(v))
const dec = (v: number) => v.toFixed(2)

export function MotionPanel() {
  const ml = useStore((s) => s.project.motionLab)
  const mode = useStore((s) => s.ui.mode)
  const apply = useStore((s) => s.apply)
  const setT = useStore((s) => s.setTransient)
  const commit = useStore((s) => s.commitTransient)
  const setUi = useStore((s) => s.setUi)
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
      {mode !== 'motion' ? (
        <div className="panel-section">
          <button className="ctl-action primary" onClick={() => setUi({ mode: 'motion' })}>
            OPEN MOTION LAB
          </button>
        </div>
      ) : null}
      <div className="panel-section">
        <div className="panel-heading">VELOCITY CURVE</div>
        <div className="preset-strip">
          {MOTION_PRESETS.map((p) => (
            <button
              key={p.id}
              className={ml.presetId === p.id ? 'preset-chip active' : 'preset-chip'}
              onClick={() => apply({ motionLab: { ...p.params, presetId: p.id } })}
            >
              {p.label}
            </button>
          ))}
        </div>
        <Slider label="STIFFNESS" value={ml.stiffness} min={0} max={40} step={1} format={int}
          onChange={(stiffness) => setT({ motionLab: { stiffness, presetId: undefined } })} onCommit={commit} />
        <Slider label="DAMPING" value={ml.damping} min={0.15} max={2} step={0.01} format={dec}
          onChange={(damping) => setT({ motionLab: { damping, presetId: undefined } })} onCommit={commit} />
        <Slider label="VELOCITY" value={ml.initialVelocity} min={-3} max={3} step={0.1} format={dec}
          onChange={(initialVelocity) => setT({ motionLab: { initialVelocity, presetId: undefined } })} onCommit={commit} />
        <Slider label="DURATION" value={ml.durationMs} min={400} max={3000} step={50}
          format={(v) => `${Math.round(v)}ms`}
          onChange={(durationMs) => setT({ motionLab: { durationMs } })} onCommit={commit} />
      </div>
      <div className="panel-section">
        <div className="panel-heading">TEXT ON PATH</div>
        <SegmentedControl<PathShape>
          label="PATH"
          value={ml.pathShape}
          options={[
            { value: 'circle', label: 'CIRCLE' },
            { value: 'oval', label: 'OVAL' },
            { value: 'eight', label: 'EIGHT' },
            { value: 'system', label: 'SYSTEM' },
          ]}
          onChange={(pathShape) => apply({ motionLab: { pathShape } })}
        />
        <TextField label="TEXT" value={ml.pathText}
          onChange={(pathText) => setT({ motionLab: { pathText } })} onCommit={commit} />
        <Slider label="SIZE" value={ml.pathTextSize} min={16} max={96} step={1} format={int}
          onChange={(pathTextSize) => setT({ motionLab: { pathTextSize } })} onCommit={commit} />
        <Slider label="SPEED" value={ml.pathSpeed} min={0.05} max={1.5} step={0.01} format={dec}
          onChange={(pathSpeed) => setT({ motionLab: { pathSpeed } })} onCommit={commit} />
        <Toggle label="SPRING PULSES" value={ml.pathEased}
          onChange={(pathEased) => apply({ motionLab: { pathEased } })} />
      </div>
      <div className="panel-section">
        <div className="panel-heading">TOKENS</div>
        <button
          className="ctl-action"
          onClick={() =>
            copy(
              toCssLinear(springLUT({
                stiffness: ml.stiffness, damping: ml.damping, initialVelocity: ml.initialVelocity,
              })),
              'CSS EASING COPIED',
            )
          }
        >
          COPY CSS EASING
        </button>
        <button
          className="ctl-action"
          onClick={() =>
            copy(
              JSON.stringify(
                { type: 'spring', stiffness: ml.stiffness, damping: ml.damping, velocity: ml.initialVelocity },
                null, 2,
              ),
              'SPRING TOKEN COPIED',
            )
          }
        >
          COPY SPRING TOKEN
        </button>
        {note ? <div className="panel-note">{note}</div> : null}
        <div className="panel-note">
          The spring token maps 1:1 to Framer Motion / react-spring; the CSS
          easing is a linear() function usable anywhere.
        </div>
      </div>
    </div>
  )
}
