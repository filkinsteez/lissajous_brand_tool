'use client'

import { useStore } from '@/core/state/store'
import { Slider } from '@/components/controls/Slider'
import { SegmentedControl } from '@/components/controls/SegmentedControl'
import { TextField } from '@/components/controls/TextField'
import { META_PHASE, type CurveKind } from '@/core/lissajous/equation'
import type { PathScene } from '@/core/state/types'

const int = (v: number) => String(Math.round(v))
const deg = (rad: number) => `${Math.round((rad * 180) / Math.PI)}°`

// Path figure presets: the shapes that read instantly as tracks. META ∞ is
// the warped 1:2 mark, offered as a track like the rest.
type PathPreset = { id: string; label: string; ratioX: number; ratioY: number; phase: number; curve?: CurveKind }
const PATH_PRESETS: PathPreset[] = [
  { id: 'meta', label: 'Meta', ratioX: 1, ratioY: 2, phase: META_PHASE, curve: 'meta' },
  { id: 'circle', label: 'Circle', ratioX: 1, ratioY: 1, phase: Math.PI / 2 },
  { id: 'arch', label: 'Arch', ratioX: 1, ratioY: 2, phase: Math.PI / 2 },
  { id: 'eight', label: 'Eight', ratioX: 2, ratioY: 1, phase: Math.PI / 2 },
]

export function PathPanel() {
  const project = useStore((s) => s.project)
  const pl = project.pathLab
  const apply = useStore((s) => s.apply)
  const setT = useStore((s) => s.setTransient)
  const commit = useStore((s) => s.commitTransient)

  return (
    <div className="panel">
      <div className="panel-section">
        <div className="panel-heading">Scene</div>
        <SegmentedControl<PathScene>
          value={pl.scene}
          options={[
            { value: 'flow', label: 'Flow' },
            { value: 'orbit', label: 'Orbit' },
            { value: 'assemble', label: 'Assemble' },
            { value: 'reveal', label: 'Reveal' },
          ]}
          onChange={(scene) => apply({ pathLab: { scene } })}
        />
        <div className="panel-note">
          FLOW runs the text along the figure. ORBIT rides tiles around it.
          ASSEMBLE scatters the headline onto the curve and flies it in with
          the MOTION tab&apos;s easing. Lab principle: nothing on the path
          ever stops — only a set headline is allowed to rest.
        </div>
      </div>
      <div className="panel-section">
        <div className="panel-heading">Path — A lissajous figure</div>
        <div className="preset-strip">
          {PATH_PRESETS.map((p) => (
            <button
              key={p.id}
              className="preset-chip"
              onClick={() => apply({ pathLab: { ratioX: p.ratioX, ratioY: p.ratioY, phase: p.phase, curve: p.curve } })}
            >
              {p.label}
            </button>
          ))}
          <button
            className="preset-chip"
            onClick={() =>
              apply({
                pathLab: {
                  ratioX: project.lissajous.frequencyX,
                  ratioY: project.lissajous.frequencyY,
                  phase: project.lissajous.phase,
                  curve: project.lissajous.curve,
                },
              })
            }
          >
            SYSTEM ({project.lissajous.curve === 'meta' ? 'META' : `${project.lissajous.frequencyX}:${project.lissajous.frequencyY}`})
          </button>
        </div>
        <Slider label="Ratio X" value={pl.ratioX} min={1} max={8} step={1} format={int}
          onChange={(ratioX) => setT({ pathLab: { ratioX } })} onCommit={commit} />
        <Slider label="Ratio Y" value={pl.ratioY} min={1} max={8} step={1} format={int}
          onChange={(ratioY) => setT({ pathLab: { ratioY } })} onCommit={commit} />
        <Slider label="Phase" value={pl.phase} min={0} max={Math.PI} step={Math.PI / 180} format={deg}
          onChange={(phase) => setT({ pathLab: { phase } })} onCommit={commit} />
      </div>
      <div className="panel-section">
        <div className="panel-heading">Content</div>
        <TextField label="Text" value={pl.text}
          onChange={(text) => setT({ pathLab: { text } })} onCommit={commit} />
        <Slider label="Size" value={pl.textSize} min={16} max={110} step={1} format={int}
          onChange={(textSize) => setT({ pathLab: { textSize } })} onCommit={commit} />
        {pl.scene === 'flow' ? (
          <Slider label="Speed" value={pl.speed} min={0.01} max={0.2} step={0.005}
            format={(v) => `${Math.round(v * 500)}`}
            onChange={(speed) => setT({ pathLab: { speed } })} onCommit={commit} />
        ) : null}
        {pl.scene === 'orbit' ? (
          <>
            <Slider label="Tiles" value={pl.count} min={2} max={16} step={1} format={int}
              onChange={(count) => setT({ pathLab: { count } })} onCommit={commit} />
            <Slider label="Flocks" value={pl.groups} min={1} max={4} step={1} format={int}
              onChange={(groups) => setT({ pathLab: { groups } })} onCommit={commit} />
            <Slider label="Distance" value={pl.spacing} min={30} max={320} step={5} format={int}
              onChange={(spacing) => setT({ pathLab: { spacing } })} onCommit={commit} />
            <Slider label="Lap" value={pl.lapMs} min={2000} max={24000} step={500}
              format={(v) => `${(v / 1000).toFixed(1)}s`}
              onChange={(lapMs) => setT({ pathLab: { lapMs } })} onCommit={commit} />
          </>
        ) : null}
        {pl.scene === 'assemble' || pl.scene === 'reveal' ? (
          <Slider label="Duration" value={pl.durationMs} min={800} max={12000} step={100}
            format={(v) => `${Math.round(v)}ms`}
            onChange={(durationMs) => setT({ pathLab: { durationMs } })} onCommit={commit} />
        ) : null}
        {pl.scene === 'reveal' ? (
          <div className="panel-note">
            DURATION is the writing time; the pull-back at the end plays with
            the MOTION tab&apos;s easing.
          </div>
        ) : null}
        {pl.scene === 'orbit' ? (
          <div className="panel-note">
            Each flock laps the figure once per LAP with the MOTION tab&apos;s
            easing — crank its STRENGTH for a dramatic whip. Try a 1:1 path
            at 150°+ phase: the flat ellipse plus back-scaling reads as a
            carousel in perspective.
          </div>
        ) : null}
        {pl.scene === 'assemble' ? (
          <div className="panel-note">
            The headline is the text up to the first &quot;—&quot;. Its easing
            comes from the MOTION tab — change it there, it plays here.
          </div>
        ) : null}
      </div>
    </div>
  )
}
