'use client'

import { useStore } from '@/core/state/store'
import { Slider } from '@/components/controls/Slider'
import { SegmentedControl } from '@/components/controls/SegmentedControl'
import { META_SHAPE, MOTION_PRESETS, MOTION_TOKENS } from '@/core/motion/spring'

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
                    lobe: -1, half: p.half ?? 'full',
                    waist: p.shape?.waist ?? 0, fullness: p.shape?.fullness ?? 0,
                    bias: p.shape?.bias ?? 0, presetId: p.id,
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
                waist: 0,
                fullness: 0,
                bias: 0,
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
        <div className="panel-heading">FIGURE SHAPE — A DESIGN SPACE</div>
        <div className="preset-strip">
          <button
            className={ml.waist === 0 && ml.fullness === 0 && ml.bias === 0 && ml.twist === 0 ? 'preset-chip active' : 'preset-chip'}
            onClick={() =>
              apply({ motionLab: { waist: 0, fullness: 0, bias: 0, twist: 0, presetId: undefined } })
            }
          >
            CLASSIC
          </button>
          <button
            className={ml.waist === META_SHAPE.waist && ml.fullness === META_SHAPE.fullness && ml.bias === META_SHAPE.bias ? 'preset-chip active' : 'preset-chip'}
            onClick={() =>
              apply({
                motionLab: {
                  ratioX: 1, ratioY: 2, phase: Math.PI / 2, read: 'velocity',
                  waist: META_SHAPE.waist, fullness: META_SHAPE.fullness,
                  bias: META_SHAPE.bias, twist: 0, presetId: undefined,
                },
              })
            }
          >
            META ∞
          </button>
        </div>
        <Slider label="WAIST" value={ml.waist} min={0} max={1}
          format={(v) => `${Math.round(v * 100)}`}
          onChange={(waist) => setT({ motionLab: { waist, presetId: undefined } })} onCommit={commit} />
        <Slider label="FULLNESS" value={ml.fullness} min={0} max={1}
          format={(v) => `${Math.round(v * 100)}`}
          onChange={(fullness) => setT({ motionLab: { fullness, presetId: undefined } })} onCommit={commit} />
        <Slider label="BIAS" value={ml.bias} min={-1} max={1} step={0.02}
          format={(v) => `${Math.round(v * 100)}`}
          onChange={(bias) => setT({ motionLab: { bias, presetId: undefined } })} onCommit={commit} />
        <Slider label="TWIST" value={ml.twist} min={-Math.PI / 4} max={Math.PI / 4} step={Math.PI / 180}
          format={deg}
          onChange={(twist) => setT({ motionLab: { twist } })} onCommit={commit} />
        <div className="panel-note">
          One continuous space of smooth warps: WAIST narrows the crossover,
          FULLNESS fills the loops and flattens the arcs, BIAS skews the lobe
          mass, TWIST rotates the drawing. The Meta mark is one point in it —
          the classic Lissajous is another. Lobe cuts and speed curves stay
          stable everywhere in the space.
        </div>
      </div>
      <div className="panel-section">
        <Slider label="DURATION" value={ml.durationMs} min={200} max={3000} step={50}
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
                    lobe: -1, half: t.half ?? 'full',
                    waist: t.shape?.waist ?? 0, fullness: t.shape?.fullness ?? 0,
                    bias: t.shape?.bias ?? 0, presetId: undefined,
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
