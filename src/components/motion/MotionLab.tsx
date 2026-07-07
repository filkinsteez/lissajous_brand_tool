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
  // (idle states, loaders, breathing): one revolution per 1.5 durations,
  // close to the main sweep so the whole lab plays at one tempo
  const ambT = (elapsedRef.current / 1000) * ((Math.PI * 2) / Math.max(1.2, (ml.durationMs / 1000) * 1.5))
  const ambX = Math.sin(ml.ratioX * ambT + ml.phase)
  const ambY = Math.sin(ml.ratioY * ambT)

  // ---- the SPEED GRAPH (AE's px/sec view) with the straight path under it.
  // The source of every easing is its velocity. In speed-read recipes the
  // displayed curve IS the figure's arc (ghosted context behind it); in
  // value-read recipes (springs, circ) the speed is derived — cusps where
  // the motion reverses, exactly like AE's speed graph of a bounce.
  // the speed panel shares the figure panel's exact square frame — same
  // box, same padding — so the marked arc and the curve are the same
  // drawing at the same proportions
  const W = 300
  const PAD = 26
  const plotTop = PAD
  const plotBottom = W - PAD
  const lineY = 316
  const viewH = 344
  const trackX = (v: number) => PAD + v * (W - 2 * PAD)
  const spY = (v: number) => plotBottom - (v / 1.06) * (plotBottom - plotTop)

  const speed = useMemo(() => arc.speed ?? velocityOf(arc.lut), [arc])
  const shapingActive = ml.strength > 0.01 || ml.decay > 0.01

  const speedPath = useMemo(() => {
    let d = `M ${trackX(0).toFixed(1)} ${spY(speed[0]).toFixed(1)}`
    for (let i = 1; i < speed.length; i++) {
      d += ` L ${trackX(i / (speed.length - 1)).toFixed(1)} ${spY(speed[i]).toFixed(1)}`
    }
    return d
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speed])
  const rawSpeedPath = useMemo(() => {
    if (!shapingActive) return ''
    const raw = arc.rawSpeed ?? velocityOf(arc.rawLut)
    let d = `M ${trackX(0).toFixed(1)} ${spY(raw[0]).toFixed(1)}`
    for (let i = 1; i < raw.length; i++) {
      d += ` L ${trackX(i / (raw.length - 1)).toFixed(1)} ${spY(raw[i]).toFixed(1)}`
    }
    return d
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arc, shapingActive])

  // the figure's surrounding context through the same frame — the
  // "rotate it and halve it" view, ghosted behind the speed curve
  const ghostPath = useMemo(() => {
    const frame = ml.read === 'velocity' ? arc.frame : null
    if (!frame) return ''
    const a = ml.ratioX
    const b = ml.ratioY
    const phase = ml.phase
    let d = ''
    let pen = false
    const n = 1440
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * Math.PI * 2
      const x = Math.sin(a * t + phase)
      let h = (x - frame.x0) / (frame.x1 - frame.x0 || 1e-9)
      let v = (Math.sin(b * t) - frame.y0) / frame.yScale
      if (ml.read === 'velocity') v = Math.abs(v)
      if (ml.reverse) h = 1 - h
      if (h < -0.02 || h > 1.02 || v < -0.04 || v > 1.05) {
        pen = false
        continue
      }
      d += `${pen ? ' L' : ' M'} ${trackX(h).toFixed(1)} ${spY(v).toFixed(1)}`
      pen = true
    }
    return d
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ml.ratioX, ml.ratioY, ml.phase, ml.read, ml.reverse, arc])

  // one aligned playhead: cursor line, dot on the curve, and the circle
  // all share the eased x — the whole assembly moves with the curve's speed
  const cursorX = trackX(clamp01(eased))
  const speedAtCursor = evalEase(speed, clamp01(eased))

  // ---- the underlying figure: the actual Lissajous these arcs come from
  const FIG = 300
  const figure = useMemo(() => {
    const a = ml.ratioX
    const b = ml.ratioY
    const phase = ml.phase
    const map = (u: { x: number; y: number }) => ({
      x: FIG / 2 + u.x * (FIG / 2 - 26),
      y: FIG / 2 - u.y * (FIG / 2 - 26),
    })
    let d = ''
    for (let i = 0; i <= 720; i++) {
      const t = (i / 720) * Math.PI * 2
      const m = map({ x: Math.sin(a * t + phase), y: Math.sin(b * t) })
      d += `${d ? ' L' : 'M'} ${m.x.toFixed(1)} ${m.y.toFixed(1)}`
    }
    let arcD = ''
    for (const u of arc.arcUnit) {
      const m = map(u)
      arcD += `${arcD ? ' L' : 'M'} ${m.x.toFixed(1)} ${m.y.toFixed(1)}`
    }
    const tracerAt = (t: number) => {
      const tt = arc.tAtP[Math.round(clamp01(t) * (arc.tAtP.length - 1))]
      return map({ x: Math.sin(a * tt + phase), y: Math.sin(b * tt) })
    }
    return { d: d + ' Z', arcD, tracerAt }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ml.ratioX, ml.ratioY, ml.phase, arc])
  const figTracer = figure.tracerAt(p)

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
          THE FIGURE — {ml.ratioX}:{ml.ratioY} · PHASE {Math.round((ml.phase * 180) / Math.PI)}°
        </div>
        <svg viewBox={`0 0 ${FIG} ${FIG}`} className="lane-svg" data-testid="lane-figure">
          <path d={figure.d} className="lane-curve-path" />
          <path d={figure.arcD} data-testid="figure-arc" className="lane-arc" />
          <circle cx={figTracer.x} cy={figTracer.y} r={6} className="lane-dot" />
        </svg>
        <div className="panel-note">
          The actual Lissajous curve. The marked arc is what the speed graph reads.
        </div>
      </div>
      <div className="lane lane-figure">
        <div className="lane-label">
          SPEED GRAPH — THE ARC OF THE {ml.ratioX}:{ml.ratioY} FIGURE
        </div>
        <svg viewBox={`0 0 ${W} ${viewH}`} className="lane-svg" data-testid="lane-plot">
          {/* speed graph — same square frame as the figure panel */}
          <line x1={PAD} y1={spY(1)} x2={W - PAD} y2={spY(1)} className="lane-rule" />
          <line x1={PAD} y1={spY(0)} x2={W - PAD} y2={spY(0)} className="lane-rule" />
          {ghostPath ? <path d={ghostPath} className="lane-curve-path faint" /> : null}
          {rawSpeedPath ? <path d={rawSpeedPath} className="plot-raw" /> : null}
          <path d={speedPath} data-testid="speed-arc" className="lane-arc" />
          {/* one playhead through the graph and the ruler — same clock */}
          <line data-testid="plot-cursor" x1={cursorX} y1={plotTop - 6} x2={cursorX} y2={lineY} className="plot-cursor" />
          <circle cx={cursorX} cy={spY(speedAtCursor)} r={4} className="plot-dot" />

          {/* the move: the circle travels with the ease of the speed curve;
              ticks are its footprints at equal time steps */}
          <line x1={PAD} y1={lineY} x2={W - PAD} y2={lineY} className="lane-rule" />
          {Array.from({ length: 11 }, (_, i) => {
            const tx = trackX(clamp01(evalEase(lut, i / 10)))
            return <line key={i} x1={tx} y1={lineY - 7} x2={tx} y2={lineY + 7} className="lane-tick" />
          })}
          <circle data-testid="line-dot" cx={trackX(clamp01(eased))} cy={lineY} r={8} className="lane-dot" />
        </svg>
        <div className="panel-note">
          {shapingActive
            ? 'Solid: what plays. Dashed: the arc before strength/decay.'
            : ml.read === 'velocity'
              ? 'Same frame as the figure: the marked arc and this curve are one drawing.'
              : 'Speed derived from the figure’s arc — cusps are direction changes.'}
        </div>
      </div>
      </div>

      <EasingLibrary p={p} />

      <div className="lane">
        <div className="lane-label">PRODUCT — THE SAME EASING ON REAL ELEMENTS</div>
        <div className="product-row" data-testid="product-row">
          <div className="vignette">
            <div className="v-stage">
              <div className="v-track-v">
                <div
                  className="v-move-dot"
                  data-testid="v-move"
                  style={{ transform: `translateY(${-easeAt(0) * 54}px)` }}
                />
              </div>
            </div>
            <span className="v-label">MOVE</span>
          </div>

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
