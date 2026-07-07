'use client'

import { useStore } from '@/core/state/store'
import { Slider } from '@/components/controls/Slider'
import { SegmentedControl } from '@/components/controls/SegmentedControl'
import { MOTION_PRESETS, MOTION_TOKENS } from '@/core/motion/spring'

const int = (v: number) => String(Math.round(v))
const deg = (rad: number) => `${Math.round((rad * 180) / Math.PI)}°`

export function MotionPanel() {
  const project = useStore((s) => s.project)
  const ml = project.motionLab
  const apply = useStore((s) => s.apply)
  const setT = useStore((s) => s.setTransient)
  const commit = useStore((s) => s.commitTransient)

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
                    lobe: -1, half: p.half ?? 'full', presetId: p.id,
                  },
                })
              }
            >
              {p.label}
            </button>
          ))}
        </div>
        <Slider label="RATIO X" value={ml.ratioX} min={1} max={12} step={1} format={int}
          onChange={(ratioX) => setT({ motionLab: { ratioX, lobe: -1, presetId: undefined } })} onCommit={commit} />
        <Slider label="RATIO Y" value={ml.ratioY} min={1} max={12} step={1} format={int}
          onChange={(ratioY) => setT({ motionLab: { ratioY, lobe: -1, presetId: undefined } })} onCommit={commit} />
        <Slider label="PHASE" value={ml.phase} min={0} max={Math.PI} step={Math.PI / 180} format={deg}
          onChange={(phase) => setT({ motionLab: { phase, presetId: undefined } })} onCommit={commit} />
        <SegmentedControl
          label="DIRECTION"
          value={ml.reverse ? 'reverse' : 'forward'}
          options={[
            { value: 'forward', label: 'FORWARD' },
            { value: 'reverse', label: 'REVERSED' },
          ]}
          onChange={(v) => apply({ motionLab: { reverse: v === 'reverse', presetId: undefined } })}
        />
        {ml.read === 'velocity' ? (
          <SegmentedControl
            label="ARC"
            value={ml.half}
            options={[
              { value: 'full', label: 'FULL ARCH' },
              { value: 'rise', label: 'RISE' },
              { value: 'fall', label: 'FALL' },
            ]}
            onChange={(v) =>
              apply({ motionLab: { half: v as 'full' | 'rise' | 'fall', presetId: undefined } })
            }
          />
        ) : null}
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
                lobe: -1,
                half: 'full',
                presetId: undefined,
              },
            })
          }
        >
          MATCH SYSTEM CURVE ({project.lissajous.frequencyX}:{project.lissajous.frequencyY})
        </button>
        <div className="panel-note">
          The source is the velocity: the figure&apos;s arc is the speed graph, and
          position is its integral — same as After Effects.
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
                    lobe: -1, half: t.half ?? 'full', presetId: undefined,
                  },
                })
              }
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="panel-note">
          Four roles from one family: standard (the arch), enter (decelerate),
          exit (accelerate), emphasis (the 1:3 swing). Click a role to inspect
          it above.
        </div>
      </div>
    </div>
  )
}
