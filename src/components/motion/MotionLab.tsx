'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/core/state/store'
import { renderController } from '@/render/renderController'
import {
  evalEase,
  lissajousEasing,
  overshootOf,
  toCssLinear,
  velocityOf,
} from '@/core/motion/spring'
import { lbsDebug } from '@/core/state/debug'
import { EasingLibrary } from './EasingLibrary'

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

  // the easing IS a Lissajous figure: ratio + phase pick the member; the
  // read decides whether its arc is the value graph or the speed graph
  const arc = useMemo(
    () =>
      lissajousEasing({
        ratioX: ml.ratioX, ratioY: ml.ratioY, phase: ml.phase, read: ml.read,
        reverse: ml.reverse, strength: ml.strength, decay: ml.decay,
      }),
    [ml.ratioX, ml.ratioY, ml.phase, ml.read, ml.reverse, ml.strength, ml.decay],
  )
  const lut = arc.lut
  // in velocity read the speed ghost IS the arc; otherwise differentiate
  const vel = useMemo(() => arc.speed ?? velocityOf(lut), [arc, lut])

  useEffect(() => {
    lbsDebug('motion', {
      ratio: `${ml.ratioX}:${ml.ratioY}`,
      phase: ml.phase,
      read: ml.read,
      overshoot: +overshootOf(lut).toFixed(4),
      easeMid: +evalEase(lut, 0.5).toFixed(4),
      speedMid: arc.speed ? +arc.speed[Math.floor(arc.speed.length / 2)].toFixed(4) : null,
      cssLinear: toCssLinear(lut),
    })
  }, [lut, arc, ml.ratioX, ml.ratioY, ml.phase, ml.read])

  useEffect(() => {
    if (!playing) return
    return renderController.subscribe((dt) => {
      elapsedRef.current += dt * 1000
      setFrame((f) => f + 1)
    })
  }, [playing])

  const p = loopProgress(elapsedRef.current, ml.durationMs)
  const eased = evalEase(lut, p)

  // shared cycle clock for the product vignettes; delays give the stagger
  const easeAt = (delayMs: number) => {
    const cycle = ml.durationMs + HOLD_MS
    const t = elapsedRef.current % cycle
    return evalEase(lut, Math.min(1, Math.max(0, (t - delayMs) / ml.durationMs)))
  }
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

  // continuous clock for ambient motion — the figure traced endlessly
  // (idle states, loaders, breathing): one revolution per ~2.5 durations
  const ambT = (elapsedRef.current / 1000) * ((Math.PI * 2) / Math.max(1.2, (ml.durationMs / 1000) * 2.5))
  const ambX = Math.sin(ml.ratioX * ambT + ml.phase)
  const ambY = Math.sin(ml.ratioY * ambT)

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
  const shapingActive = ml.strength > 0.01 || ml.decay > 0.01
  const rawPositionPath = useMemo(() => {
    if (!shapingActive) return ''
    let d = `M ${trackX(0).toFixed(1)} ${py(arc.rawLut[0]).toFixed(1)}`
    for (let i = 1; i < arc.rawLut.length; i++) {
      d += ` L ${trackX(i / (arc.rawLut.length - 1)).toFixed(1)} ${py(arc.rawLut[i]).toFixed(1)}`
    }
    return d
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arc, shapingActive, maxVal, minVal])
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

  // ---- the source panel: the arc IN GRAPH FRAME ----
  // The figure is rotated into time × value: the marked arc reads as a
  // regular easing curve, and the figure's other branches ghost behind,
  // cropped to the arc's time domain.
  const FIG = 300
  const figPad = 24
  const figure = useMemo(() => {
    const a = ml.ratioX
    const b = ml.ratioY
    const phase = ml.phase
    const frame = arc.frame
    const source = (ml.read === 'velocity' ? arc.rawSpeed : arc.rawLut) ?? arc.rawLut

    // value range with headroom for lobes above/below
    let vMin = 0
    let vMax = 1
    for (const v of source) {
      if (v < vMin) vMin = v
      if (v > vMax) vMax = v
    }
    vMin -= 0.06
    vMax += 0.06
    const hx = (h: number) => figPad + h * (FIG - 2 * figPad)
    const vy = (v: number) => FIG - figPad - ((v - vMin) / (vMax - vMin)) * (FIG - 2 * figPad)

    // bold arc = the raw source profile, plotted as a graph
    let arcD = ''
    for (let i = 0; i < source.length; i++) {
      arcD += `${arcD ? ' L' : 'M'} ${hx(i / (source.length - 1)).toFixed(1)} ${vy(source[i]).toFixed(1)}`
    }

    // ghost = the figure's surrounding context through the same frame,
    // clipped to the arc's time domain — the "rotate it and halve it" view
    let ghostD = ''
    if (frame) {
      let pen = false
      const n = 1440
      for (let i = 0; i <= n; i++) {
        let h: number
        let v: number
        if (frame.kind === 'x') {
          const t = (i / n) * Math.PI * 2
          const x = Math.sin(a * t + phase)
          h = (x - frame.x0) / (frame.x1 - frame.x0 || 1e-9)
          v = (Math.sin(b * t) - frame.y0) / frame.yScale
        } else {
          // t-frame: show one window-width of the oscillation on each side
          const span = frame.t1 - frame.t0
          const t = frame.t0 - span + (i / n) * span * 3
          h = (t - frame.t0) / span
          v = Math.abs(Math.sin(b * t)) / frame.yScale
        }
        if (ml.reverse) h = 1 - h
        const hLimit = frame.kind === 't' ? 0.09 : 0.02
        if (h < -hLimit || h > 1 + hLimit || v < vMin || v > vMax) {
          pen = false
          continue
        }
        ghostD += `${pen ? ' L' : ' M'} ${hx(h).toFixed(1)} ${vy(v).toFixed(1)}`
        pen = true
      }
    }

    const valueAt = (t: number) => source[Math.round(t * (source.length - 1))]
    return {
      arcD, ghostD,
      rule0: vy(0), rule1: vy(1),
      tracerAt: (t: number) => ({ x: hx(t), y: vy(valueAt(t)) }),
    }
  }, [ml.ratioX, ml.ratioY, ml.phase, ml.read, ml.reverse, arc])
  const tracer = figure.tracerAt(p)

  const overshoot = overshootOf(lut)

  return (
    <div className="motion-lab" data-testid="motion-lab">
      <div className="lab-header">
        <span className="lab-title">MOTION</span>
        <span className="lab-sub">
          {ml.ratioX}:{ml.ratioY} · phase {Math.round((ml.phase * 180) / Math.PI)}° · read as{' '}
          {ml.read}
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
            SOURCE — ONE ARC OF THE {ml.ratioX}:{ml.ratioY} FIGURE, AS A GRAPH
          </div>
          <svg viewBox={`0 0 ${FIG} ${FIG}`} className="lane-svg" data-testid="lane-figure">
            <line x1={figPad} y1={figure.rule1} x2={FIG - figPad} y2={figure.rule1} className="lane-rule" />
            <line x1={figPad} y1={figure.rule0} x2={FIG - figPad} y2={figure.rule0} className="lane-rule" />
            {figure.ghostD ? <path d={figure.ghostD} className="lane-curve-path faint" /> : null}
            <path d={figure.arcD} data-testid="figure-arc" className="lane-arc" />
            <circle data-testid="figure-tracer" cx={tracer.x} cy={tracer.y} r={6} className="lane-dot" />
          </svg>
          <div className="panel-note">
            {ml.read === 'velocity'
              ? 'This arc is the SPEED curve; the rest of the figure ghosts behind it.'
              : 'This arc is the position curve; the rest of the figure ghosts behind it.'}
          </div>
        </div>
        <div className="lane">
          <div className="lane-label">POSITION / VELOCITY OVER TIME — SAME MOVE ON THE PATH BELOW</div>
          <svg viewBox={`0 0 ${W} ${viewH}`} className="lane-svg" data-testid="lane-plot">
            <line x1={PAD} y1={py(1)} x2={W - PAD} y2={py(1)} className="lane-rule" />
            <line x1={PAD} y1={py(0)} x2={W - PAD} y2={py(0)} className="lane-rule" />
            <path d={velocityPath} className="plot-velocity" />
            {rawPositionPath ? <path d={rawPositionPath} className="plot-raw" /> : null}
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

      <EasingLibrary p={p} />

      <div className="lane">
        <div className="lane-label">PRODUCT — THE SAME EASING ON REAL ELEMENTS</div>
        <div className="product-row" data-testid="product-row">
          <div className="vignette">
            <div className="v-stage">
              <div className="v-toggle">
                <div
                  className="v-knob"
                  data-testid="v-knob"
                  style={{ transform: `translateX(${easeAt(0) * 24}px)` }}
                />
              </div>
            </div>
            <span className="v-label">TOGGLE</span>
          </div>

          <div className="vignette">
            <div className="v-stage">
              <div className="v-button">
                <div className="v-button-fill" style={{ width: `${clamp01(easeAt(0)) * 100}%` }} />
                <span className="v-button-label">CONTINUE</span>
              </div>
            </div>
            <span className="v-label">BUTTON</span>
          </div>

          <div className="vignette">
            <div className="v-stage">
              <div
                className="v-card"
                style={{
                  transform: `translateY(${(1 - easeAt(0)) * 26}px)`,
                  opacity: 0.05 + clamp01(easeAt(0)) * 0.95,
                }}
              >
                <div className="v-card-bar" />
                <div className="v-card-line" />
                <div className="v-card-line short" />
              </div>
            </div>
            <span className="v-label">CARD ENTER</span>
          </div>

          <div className="vignette">
            <div className="v-stage v-frame">
              <div className="v-backdrop" style={{ opacity: clamp01(easeAt(0)) * 0.45 }} />
              <div
                className="v-sheet"
                style={{ transform: `translateY(${(1 - easeAt(0)) * 100}%)` }}
              >
                <div className="v-sheet-handle" />
              </div>
            </div>
            <span className="v-label">SHEET</span>
          </div>

          <div className="vignette">
            <div className="v-stage">
              <svg viewBox="-30 -30 60 60" width="60" height="60" data-testid="v-loader">
                <path
                  d={(() => {
                    let d = ''
                    for (let i = 0; i <= 240; i++) {
                      const t = (i / 240) * Math.PI * 2
                      d += `${d ? ' L' : 'M'} ${(Math.sin(ml.ratioX * t + ml.phase) * 22).toFixed(1)} ${(-Math.sin(ml.ratioY * t) * 22).toFixed(1)}`
                    }
                    return d + ' Z'
                  })()}
                  className="v-loader-track"
                />
                <circle cx={ambX * 22} cy={-ambY * 22} r={3.5} className="lane-dot" />
              </svg>
            </div>
            <span className="v-label">LOADER — THE FIGURE ITSELF</span>
          </div>

          <div className="vignette">
            <div className="v-stage">
              <div
                className="v-orbit-chip"
                style={{ transform: `translate(${ambX * 14}px, ${-ambY * 10}px)` }}
              />
            </div>
            <span className="v-label">AMBIENT FLOAT</span>
          </div>

          <div className="vignette">
            <div className="v-stage">
              <div
                className="v-breathe"
                style={{ transform: `scale(${1 + 0.09 * ambY})` }}
              />
            </div>
            <span className="v-label">BREATHE</span>
          </div>

          <div className="vignette">
            <div className="v-stage v-list">
              {[0, 1, 2].map((i) => {
                const e = easeAt(i * Math.min(160, ml.durationMs * 0.18))
                return (
                  <div
                    key={i}
                    className="v-row"
                    style={{
                      transform: `translateY(${(1 - e) * 12}px)`,
                      opacity: 0.05 + clamp01(e) * 0.95,
                    }}
                  >
                    <div className="v-row-dot" />
                    <div className="v-row-line" />
                  </div>
                )
              })}
            </div>
            <span className="v-label">LIST STAGGER</span>
          </div>
        </div>
      </div>
    </div>
  )
}
