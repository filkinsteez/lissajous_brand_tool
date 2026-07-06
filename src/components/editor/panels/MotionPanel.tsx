'use client'

import { useState } from 'react'
import { useStore } from '@/core/state/store'
import { Slider } from '@/components/controls/Slider'
import { SegmentedControl } from '@/components/controls/SegmentedControl'
import { curveArcEasing, MOTION_PRESETS, springLUT, toCssLinear } from '@/core/motion/spring'

const int = (v: number) => String(Math.round(v))
const dec = (v: number) => v.toFixed(2)

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

  const activeLUT = () =>
    ml.easingSource === 'curve'
      ? curveArcEasing(project.lissajous).lut
      : springLUT({ stiffness: ml.stiffness, damping: ml.damping, initialVelocity: ml.initialVelocity })

  return (
    <div className="panel">
      <div className="panel-section">
        <SegmentedControl<'spring' | 'curve'>
          label="EASING SOURCE"
          value={ml.easingSource}
          options={[
            { value: 'spring', label: 'SPRING' },
            { value: 'curve', label: 'SYSTEM CURVE' },
          ]}
          onChange={(easingSource) => apply({ motionLab: { easingSource } })}
        />
        {ml.easingSource === 'curve' ? (
          <div className="panel-note">
            The easing is one arc of the {project.lissajous.frequencyX}:
            {project.lissajous.frequencyY} figure — its x-sweep is time, its y is
            position. Change the curve in SYSTEM and the easing follows.
          </div>
        ) : null}
      </div>
      {ml.easingSource === 'spring' ? (
        <div className="panel-section">
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
        </div>
      ) : null}
      <div className="panel-section">
        <Slider label="DURATION" value={ml.durationMs} min={400} max={3000} step={50}
          format={(v) => `${Math.round(v)}ms`}
          onChange={(durationMs) => setT({ motionLab: { durationMs } })} onCommit={commit} />
      </div>
      <div className="panel-section">
        <div className="panel-heading">TOKENS</div>
        <button className="ctl-action" onClick={() => copy(toCssLinear(activeLUT()), 'CSS EASING COPIED')}>
          COPY CSS EASING
        </button>
        {ml.easingSource === 'spring' ? (
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
        ) : null}
        {note ? <div className="panel-note">{note}</div> : null}
        <div className="panel-note">
          CSS easing is a linear() function. The spring token maps 1:1 to
          Framer Motion / react-spring.
        </div>
      </div>
    </div>
  )
}
