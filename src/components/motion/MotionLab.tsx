'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/core/state/store'
import { renderController } from '@/render/renderController'
import { evalEase, overshootOf, springLUT, toCssLinear, velocityOf } from '@/core/motion/spring'
import { buildArcLUT } from '@/core/motion/arcLength'
import { samplePathShape } from '@/core/motion/pathShapes'
import { samplesToDoubledPathD, samplesToPathD } from '@/core/lissajous/svgPath'
import { lbsDebug } from '@/core/state/debug'

const HOLD_MS = 350

// Ping-pong timeline: eased out, hold, eased back, hold.
// Returns the eased display position 0..1 and the raw leg progress.
function pingPong(elapsedMs: number, durationMs: number, lut: Float32Array) {
  const cycle = 2 * (durationMs + HOLD_MS)
  const t = elapsedMs % cycle
  if (t < durationMs) {
    const p = t / durationMs
    return { pos: evalEase(lut, p), p }
  }
  if (t < durationMs + HOLD_MS) return { pos: 1, p: 1 }
  if (t < 2 * durationMs + HOLD_MS) {
    const p = (t - durationMs - HOLD_MS) / durationMs
    return { pos: 1 - evalEase(lut, p), p }
  }
  return { pos: 0, p: 0 }
}

export function MotionLab() {
  const project = useStore((s) => s.project)
  const playing = useStore((s) => s.ui.motionPlaying)
  const setUi = useStore((s) => s.setUi)
  const ml = project.motionLab

  const elapsedRef = useRef(0)
  const [, setFrame] = useState(0)

  const lut = useMemo(
    () => springLUT({ stiffness: ml.stiffness, damping: ml.damping, initialVelocity: ml.initialVelocity }),
    [ml.stiffness, ml.damping, ml.initialVelocity],
  )
  const vel = useMemo(() => velocityOf(lut), [lut])

  // system-curve lane geometry (lab-local coordinate space)
  const laneW = 640
  const laneH = 340
  const systemSamples = useMemo(
    () => samplePathShape('system', { ...project.lissajous, amplitudeX: 0.86, amplitudeY: 0.78 }, laneW, laneH, 720),
    [project.lissajous],
  )
  const systemArc = useMemo(() => buildArcLUT(systemSamples), [systemSamples])
  const systemPathD = useMemo(() => samplesToPathD(systemSamples, 500), [systemSamples])

  // text-on-path lane
  const textSamples = useMemo(
    () => samplePathShape(ml.pathShape, project.lissajous, laneW, laneH, 720),
    [ml.pathShape, project.lissajous],
  )
  const textArc = useMemo(() => buildArcLUT(textSamples), [textSamples])
  // doubled path: the text run can cross the loop seam without a second copy
  const textPathD = useMemo(() => samplesToDoubledPathD(textSamples, 500), [textSamples])
  const repeatedText = useMemo(() => {
    // bias the estimate short: a hairline gap at the loop seam reads fine,
    // an overlap reads broken (textLength through textPath is unreliable)
    const charW = Math.max(4, ml.pathTextSize * 0.64)
    const chars = Math.max(ml.pathText.length, Math.floor(textArc.total / charW))
    let s = ''
    while (s.length < chars) s += ml.pathText
    return s.slice(0, chars)
  }, [ml.pathText, ml.pathTextSize, textArc.total])

  useEffect(() => {
    lbsDebug('motion', {
      overshoot: +overshootOf(lut).toFixed(4),
      easeMid: +evalEase(lut, 0.5).toFixed(4),
      cssLinear: toCssLinear(lut),
      pathTotal: Math.round(textArc.total),
    })
  }, [lut, textArc.total])

  useEffect(() => {
    if (!playing) return
    return renderController.subscribe((dt) => {
      elapsedRef.current += dt * 1000
      setFrame((f) => f + 1)
    })
  }, [playing])

  const elapsed = elapsedRef.current
  const { pos, p } = pingPong(elapsed, ml.durationMs, lut)

  // ---- lane 1: velocity curve plot geometry ----
  const plotW = 640
  const plotH = 180
  const maxVal = Math.max(1.15, ...lut) + 0.05
  const px = (t: number) => t * plotW
  const py = (v: number) => plotH - (v / maxVal) * (plotH - 14) - 7
  const positionPath = useMemo(() => {
    let d = `M ${px(0)} ${py(lut[0])}`
    for (let i = 1; i < lut.length; i++) d += ` L ${px(i / (lut.length - 1)).toFixed(1)} ${py(lut[i]).toFixed(1)}`
    return d
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lut, maxVal])
  const velocityPath = useMemo(() => {
    let d = `M 0 ${plotH}`
    for (let i = 0; i < vel.length; i++) {
      d += ` L ${px(i / (vel.length - 1)).toFixed(1)} ${(plotH - Math.abs(vel[i]) * (plotH * 0.55)).toFixed(1)}`
    }
    return d + ` L ${plotW} ${plotH} Z`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vel])

  // ---- lane 2: line traversal ----
  const lineX0 = 28
  const lineX1 = plotW - 28
  const dotX = lineX0 + pos * (lineX1 - lineX0)

  // ---- lane 3: circle along the system curve ----
  const curvePos = systemArc.posAt(pos * (systemArc.total - 1))

  // ---- lane 4: text on path offset ----
  const speed = Math.max(0.01, ml.pathSpeed)
  let textOffset: number
  if (ml.pathEased) {
    const k = (elapsed / 1000) * speed * 2
    const beat = Math.floor(k)
    textOffset = ((beat + evalEase(lut, k - beat)) * textArc.total) / 6
  } else {
    textOffset = (elapsed / 1000) * speed * textArc.total
  }
  textOffset %= textArc.total

  return (
    <div className="motion-lab" data-testid="motion-lab">
      <div className="lab-header">
        <span className="lab-title">MOTION LAB</span>
        <span className="lab-sub">
          ω {ml.stiffness.toFixed(0)} · ζ {ml.damping.toFixed(2)} ·{' '}
          {overshootOf(lut) > 0.001 ? `overshoot ${(overshootOf(lut) * 100).toFixed(0)}%` : 'no overshoot'}
        </span>
        <button
          className="ctl-action"
          data-testid="motion-play"
          onClick={() => setUi({ motionPlaying: !playing })}
        >
          {playing ? 'PAUSE' : 'PLAY'}
        </button>
      </div>

      <div className="lane">
        <div className="lane-label">VELOCITY CURVE</div>
        <svg viewBox={`0 0 ${plotW} ${plotH}`} className="lane-svg" data-testid="lane-plot">
          <line x1={0} y1={py(1)} x2={plotW} y2={py(1)} className="lane-rule" />
          <line x1={0} y1={py(0)} x2={plotW} y2={py(0)} className="lane-rule" />
          <path d={velocityPath} className="plot-velocity" />
          <path d={positionPath} className="plot-position" />
          <line x1={px(p)} y1={0} x2={px(p)} y2={plotH} className="plot-cursor" />
          <circle cx={px(p)} cy={py(evalEase(lut, p))} r={4} className="plot-dot" />
        </svg>
      </div>

      <div className="lane">
        <div className="lane-label">LINE</div>
        <svg viewBox={`0 0 ${plotW} 64`} className="lane-svg" data-testid="lane-line">
          <line x1={lineX0} y1={32} x2={lineX1} y2={32} className="lane-rule" />
          {Array.from({ length: 11 }, (_, i) => {
            const tx = lineX0 + evalEase(lut, i / 10) * (lineX1 - lineX0)
            return <line key={i} x1={tx} y1={24} x2={tx} y2={40} className="lane-tick" />
          })}
          <circle data-testid="line-dot" cx={dotX} cy={32} r={9} className="lane-dot" />
        </svg>
      </div>

      <div className="lane-row">
        <div className="lane">
          <div className="lane-label">ALONG THE SYSTEM CURVE</div>
          <svg viewBox={`0 0 ${laneW} ${laneH}`} className="lane-svg" data-testid="lane-curve">
            <path d={systemPathD} className="lane-curve-path" />
            <circle data-testid="curve-dot" cx={curvePos.x} cy={curvePos.y} r={8} className="lane-dot" />
          </svg>
        </div>
        <div className="lane">
          <div className="lane-label">TEXT ON PATH — {ml.pathShape.toUpperCase()}</div>
          <svg viewBox={`0 0 ${laneW} ${laneH}`} className="lane-svg" data-testid="lane-textpath">
            <path id="lbs-text-path" d={textPathD} fill="none" className="lane-curve-path faint" />
            <text
              className="path-text"
              style={{ fontSize: ml.pathTextSize, fontFamily: 'var(--font-flex), sans-serif' }}
            >
              <textPath href="#lbs-text-path" startOffset={textOffset} data-testid="textpath-a">
                {repeatedText}
              </textPath>
            </text>
          </svg>
        </div>
      </div>
    </div>
  )
}
