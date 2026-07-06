'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/core/state/store'
import { renderController } from '@/render/renderController'
import {
  curveArcEasing,
  evalEase,
  overshootOf,
  toCssLinear,
  velocityOf,
} from '@/core/motion/spring'
import { lbsDebug } from '@/core/state/debug'

const HOLD_MS = 600

// Forward-only loop: run 0→1 over durationMs, hold at the end, restart.
// The plot cursor and the line dot always travel the same direction, in
// sync — the whole point is reading the velocity curve against the dot.
function loopProgress(elapsedMs: number, durationMs: number): number {
  const t = elapsedMs % (durationMs + HOLD_MS)
  return Math.min(1, t / durationMs)
}

export function MotionLab() {
  const project = useStore((s) => s.project)
  const playing = useStore((s) => s.ui.motionPlaying)
  const setUi = useStore((s) => s.setUi)
  const ml = project.motionLab

  const elapsedRef = useRef(0)
  const [, setFrame] = useState(0)

  // the easing IS a Lissajous figure: ratio + phase pick the member,
  // its x-rising arc read as a graph is the curve
  const arc = useMemo(
    () => curveArcEasing({ frequencyX: ml.ratioX, frequencyY: ml.ratioY, phase: ml.phase }),
    [ml.ratioX, ml.ratioY, ml.phase],
  )
  const lut = arc.lut
  const vel = useMemo(() => velocityOf(lut), [lut])

  useEffect(() => {
    lbsDebug('motion', {
      ratio: `${ml.ratioX}:${ml.ratioY}`,
      phase: ml.phase,
      overshoot: +overshootOf(lut).toFixed(4),
      easeMid: +evalEase(lut, 0.5).toFixed(4),
      cssLinear: toCssLinear(lut),
    })
  }, [lut, ml.ratioX, ml.ratioY, ml.phase])

  useEffect(() => {
    if (!playing) return
    return renderController.subscribe((dt) => {
      elapsedRef.current += dt * 1000
      setFrame((f) => f + 1)
    })
  }, [playing])

  const p = loopProgress(elapsedRef.current, ml.durationMs)
  const eased = evalEase(lut, p)

  // ---- geometry: figure left, graph + straight path right ----
  const W = 640
  const PAD = 14
  const plotTop = 6
  const plotBottom = 226
  const lineY = 292
  const viewH = 320
  const trackX = (v: number) => PAD + v * (W - 2 * PAD)
  const maxVal = Math.max(1.15, ...lut) + 0.05
  const minVal = Math.min(-0.15, ...lut) - 0.05
  const py = (v: number) =>
    plotBottom - ((v - minVal) / (maxVal - minVal)) * (plotBottom - plotTop - 10) - 5

  const positionPath = useMemo(() => {
    let d = `M ${trackX(0).toFixed(1)} ${py(lut[0]).toFixed(1)}`
    for (let i = 1; i < lut.length; i++) {
      d += ` L ${trackX(i / (lut.length - 1)).toFixed(1)} ${py(lut[i]).toFixed(1)}`
    }
    return d
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lut, maxVal, minVal])
  const velocityPath = useMemo(() => {
    let d = `M ${trackX(0)} ${plotBottom}`
    for (let i = 0; i < vel.length; i++) {
      d += ` L ${trackX(i / (vel.length - 1)).toFixed(1)} ${(plotBottom - Math.abs(vel[i]) * ((plotBottom - plotTop) * 0.45)).toFixed(1)}`
    }
    return d + ` L ${trackX(1)} ${plotBottom} Z`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vel])

  const cursorX = trackX(p)
  const dotX = trackX(Math.max(0, Math.min(1, eased)))

  // ---- the figure itself, arc bold, tracer synced ----
  const FIG = 300
  const figPad = 26
  const figure = useMemo(() => {
    const a = ml.ratioX
    const b = ml.ratioY
    const phase = ml.phase
    const map = (u: { x: number; y: number }) => ({
      x: FIG / 2 + u.x * (FIG / 2 - figPad),
      y: FIG / 2 - u.y * (FIG / 2 - figPad),
    })
    let d = ''
    const n = 720
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * Math.PI * 2
      const m = map({ x: Math.sin(a * t + phase), y: Math.sin(b * t) })
      d += `${d ? ' L' : 'M'} ${m.x.toFixed(1)} ${m.y.toFixed(1)}`
    }
    let arcD = ''
    for (const u of arc.arcUnit) {
      const m = map(u)
      arcD += `${arcD ? ' L' : 'M'} ${m.x.toFixed(1)} ${m.y.toFixed(1)}`
    }
    const tracerAt = (t: number) => {
      const tt = arc.tAtP[Math.round(t * (arc.tAtP.length - 1))]
      return map({ x: Math.sin(a * tt + phase), y: Math.sin(b * tt) })
    }
    return { d: d + ' Z', arcD, tracerAt }
  }, [ml.ratioX, ml.ratioY, ml.phase, arc])
  const tracer = figure.tracerAt(p)

  const overshoot = overshootOf(lut)

  return (
    <div className="motion-lab" data-testid="motion-lab">
      <div className="lab-header">
        <span className="lab-title">MOTION</span>
        <span className="lab-sub">
          {ml.ratioX}:{ml.ratioY} · phase {Math.round((ml.phase * 180) / Math.PI)}°
          {overshoot > 0.001 ? ` · overshoot ${(overshoot * 100).toFixed(0)}%` : ''}
        </span>
        <button
          className="ctl-action"
          data-testid="motion-play"
          onClick={() => setUi({ motionPlaying: !playing })}
        >
          {playing ? 'PAUSE' : 'PLAY'}
        </button>
      </div>

      <div className="lane-row">
        <div className="lane lane-figure">
          <div className="lane-label">
            THE {ml.ratioX}:{ml.ratioY} FIGURE — THE MARKED ARC IS THE EASING
          </div>
          <svg viewBox={`0 0 ${FIG} ${FIG}`} className="lane-svg" data-testid="lane-figure">
            <path d={figure.d} className="lane-curve-path faint" />
            <path d={figure.arcD} data-testid="figure-arc" className="lane-arc" />
            <circle data-testid="figure-tracer" cx={tracer.x} cy={tracer.y} r={6} className="lane-dot" />
          </svg>
          <div className="panel-note">
            The marked arc, read left to right, is the position curve on the right.
          </div>
        </div>
        <div className="lane">
          <div className="lane-label">POSITION / VELOCITY OVER TIME — SAME MOVE ON THE PATH BELOW</div>
          <svg viewBox={`0 0 ${W} ${viewH}`} className="lane-svg" data-testid="lane-plot">
            <line x1={PAD} y1={py(1)} x2={W - PAD} y2={py(1)} className="lane-rule" />
            <line x1={PAD} y1={py(0)} x2={W - PAD} y2={py(0)} className="lane-rule" />
            <path d={velocityPath} className="plot-velocity" />
            <path d={positionPath} className="plot-position" />
            <line data-testid="plot-cursor" x1={cursorX} y1={plotTop} x2={cursorX} y2={plotBottom} className="plot-cursor" />
            <circle cx={cursorX} cy={py(eased)} r={4} className="plot-dot" />

            <line x1={cursorX} y1={py(eased)} x2={dotX} y2={lineY - 11} className="plot-connector" />

            <line x1={PAD} y1={lineY} x2={W - PAD} y2={lineY} className="lane-rule" />
            {Array.from({ length: 11 }, (_, i) => {
              const tx = trackX(Math.max(0, Math.min(1, evalEase(lut, i / 10))))
              return <line key={i} x1={tx} y1={lineY - 8} x2={tx} y2={lineY + 8} className="lane-tick" />
            })}
            <circle data-testid="line-dot" cx={dotX} cy={lineY} r={9} className="lane-dot" />
          </svg>
          <div className="panel-note">
            Tick marks sit at equal time steps — their spacing is the velocity.
          </div>
        </div>
      </div>
    </div>
  )
}
