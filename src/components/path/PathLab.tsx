'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/core/state/store'
import { renderController } from '@/render/renderController'
import { sampleCurve } from '@/core/lissajous/sampler'
import { samplesToPathD, samplesToSmoothDoubledPathD } from '@/core/lissajous/svgPath'
import { buildArcLUT } from '@/core/motion/arcLength'
import { evalEase, lissajousEasing } from '@/core/motion/spring'
import type { LissajousState } from '@/core/state/types'

// Advert-style brand animation: objects riding the figure. FLOW is a
// text marquee on the path, ORBIT a ring of tiles, ASSEMBLE a headline
// whose characters fly in FROM the path with the MOTION tab's easing —
// the same figure family drives the layout grid, the easing, and this.
const W = 1000
const H = 760
const HOLD_MS = 700

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)

function pathLiss(ratioX: number, ratioY: number, phase: number): LissajousState {
  // reduce by the gcd: a 2:2 figure IS the 1:1 ellipse traced twice, and a
  // retraced path makes everything riding it overprint itself
  const g = Math.max(1, gcd(Math.round(ratioX), Math.round(ratioY)))
  return {
    frequencyX: Math.round(ratioX) / g, frequencyY: Math.round(ratioY) / g, phase,
    amplitudeX: 0.8, amplitudeY: 0.76, rotation: 0, offsetX: 0, offsetY: 0,
    sampleDensity: 1024,
  }
}

export function PathLab() {
  const project = useStore((s) => s.project)
  const playing = useStore((s) => s.ui.motionPlaying)
  const setUi = useStore((s) => s.setUi)
  const pl = project.pathLab
  const ml = project.motionLab

  const elapsedRef = useRef(0)
  const [, setFrame] = useState(0)

  useEffect(() => {
    if (!playing) return
    return renderController.subscribe((dt) => {
      elapsedRef.current += dt * 1000
      setFrame((f) => f + 1)
    })
  }, [playing])
  const t = elapsedRef.current

  // the path figure and its arc-length parameterization (uniform speed
  // in SPACE — the raw curve parameter bunches up near the extremes)
  const path = useMemo(() => {
    const samples = sampleCurve(pathLiss(pl.ratioX, pl.ratioY, pl.phase), W, H, 1024)
    return {
      d: samplesToPathD(samples),
      doubledD: samplesToSmoothDoubledPathD(samples),
      lut: buildArcLUT(samples),
      samples,
    }
  }, [pl.ratioX, pl.ratioY, pl.phase])
  const total = path.lut.total

  // the marquee track is smooth Béziers, so its true length differs a hair
  // from the polyline LUT — measure it so offset wraps and the textLength
  // pin land exactly on the seam
  const flowPathRef = useRef<SVGPathElement>(null)
  const [flowRev, setFlowRev] = useState(0)
  useLayoutEffect(() => {
    const el = flowPathRef.current
    if (el) setFlowRev(el.getTotalLength() / 2)
  }, [path, pl.scene])
  const flowLen = flowRev > 1 ? flowRev : total

  // the brand easing, straight from the MOTION tab — ASSEMBLE plays it
  const brandLut = useMemo(
    () =>
      lissajousEasing({
        ratioX: ml.ratioX, ratioY: ml.ratioY, phase: ml.phase, read: ml.read,
        reverse: ml.reverse, strength: ml.strength, decay: ml.decay,
        lobe: ml.lobe, half: ml.half,
      }).lut,
    [ml.ratioX, ml.ratioY, ml.phase, ml.read, ml.reverse, ml.strength, ml.decay, ml.lobe, ml.half],
  )

  // ---- text metrics, measured on hidden SVG nodes with the real styles —
  // canvas measureText ran ~20% short of SVG's actual advances and the
  // textLength correction stretched glyphs visibly. Re-measure once the
  // display font finishes loading.
  const flowMeasureRef = useRef<SVGTextElement>(null)
  const asmMeasureRef = useRef<SVGTextElement>(null)
  const [flowCopyW, setFlowCopyW] = useState(0)
  const [asmMetrics, setAsmMetrics] = useState<{ label: string; centers: number[]; width: number } | null>(null)
  const [fontTick, setFontTick] = useState(0)

  useEffect(() => {
    let alive = true
    document.fonts?.ready.then(() => {
      if (alive) setFontTick((v) => v + 1)
    })
    return () => {
      alive = false
    }
  }, [])

  const asmLabel = useMemo(() => {
    const head = pl.text.split('—')[0].trim()
    return (head || 'LISSAJOUS').slice(0, 24)
  }, [pl.text])

  useLayoutEffect(() => {
    const flow = flowMeasureRef.current
    if (flow) setFlowCopyW(flow.getComputedTextLength())
    const asm = asmMeasureRef.current
    if (asm) {
      const n = asmLabel.length
      const centers: number[] = []
      for (let i = 0; i < n; i++) {
        const before = i === 0 ? 0 : asm.getSubStringLength(0, i)
        centers.push(before + asm.getSubStringLength(i, 1) / 2)
      }
      setAsmMetrics({ label: asmLabel, centers, width: asm.getComputedTextLength() })
    }
  }, [pl.text, pl.textSize, asmLabel, fontTick])

  // ---- FLOW: marquee — repeat the text to the nearest whole number of
  // copies per revolution and pin it to EXACTLY one loop with textLength,
  // so the tail meets the head without overprinting
  const flowText = useMemo(() => {
    const copyW = flowCopyW > 1 ? flowCopyW : pl.text.length * pl.textSize * 0.62
    const copies = Math.max(1, Math.round(flowLen / Math.max(1, copyW)))
    return pl.text.repeat(copies)
  }, [pl.text, pl.textSize, flowLen, flowCopyW])
  const flowOffset = ((t / 1000) * pl.speed * flowLen) % flowLen

  // ---- ORBIT: tiles at equal arc spacing, painted back-to-front by depth
  const orbitTiles = useMemo(() => {
    if (pl.scene !== 'orbit') return []
    const head = (t / 1000) * pl.speed * total
    const tiles = []
    for (let i = 0; i < pl.count; i++) {
      const p = path.lut.posAt(head + (i / pl.count) * total)
      const depth = 0.78 + 0.42 * (p.y / H) // lower on stage = nearer
      tiles.push({ i, x: p.x, y: p.y, depth })
    }
    return tiles.sort((a, b) => a.depth - b.depth)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pl.scene, pl.count, pl.speed, path, t])

  // ---- ASSEMBLE: headline chars fly from the path into the set line,
  // resting positions from the measured per-char advances
  const asmLayout = useMemo(() => {
    if (!asmMetrics || asmMetrics.label !== asmLabel) return null
    const left = (W - asmMetrics.width) / 2
    return { rest: asmMetrics.centers.map((c) => left + c), y: H * 0.54 }
  }, [asmMetrics, asmLabel])

  const asmChars = useMemo(() => {
    if (pl.scene !== 'assemble' || !asmLayout) return []
    const chars = [...asmLabel]
    const n = chars.length
    const dur = pl.durationMs
    const cycle = 2 * dur + 2 * HOLD_MS
    const ct = t % cycle
    // staggered window per char: each char eases over 60% of the phase
    const D = dur * 0.6
    const easeFor = (phaseT: number, i: number) => {
      const start = n > 1 ? (i / (n - 1)) * (dur - D) : 0
      return evalEase(brandLut, clamp01((phaseT - start) / D))
    }
    return chars.map((c, i) => {
      let e: number
      if (ct < dur) e = easeFor(ct, i) // fly in
      else if (ct < dur + HOLD_MS) e = 1 // hold the line
      else if (ct < 2 * dur + HOLD_MS) e = 1 - easeFor(ct - dur - HOLD_MS, i) // scatter back
      else e = 0
      const p = path.lut.posAt((i / n) * total)
      const x = lerp(p.x, asmLayout.rest[i], e)
      const y = lerp(p.y, asmLayout.y, e)
      const rot = (1 - e) * ((p.angle * 180) / Math.PI)
      return { c, i, x, y, rot, o: 0.35 + 0.65 * e }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pl.scene, asmLabel, asmLayout, pl.durationMs, brandLut, path, t])

  return (
    <div className="path-lab" data-testid="path-lab">
      <div className="lab-header">
        <span className="lab-title">PATH</span>
        <span className="lab-sub">
          {pl.ratioX}:{pl.ratioY} · phase {Math.round((pl.phase * 180) / Math.PI)}° ·{' '}
          {pl.scene === 'flow' ? 'text on path' : pl.scene === 'orbit' ? 'tiles on path' : 'assemble with the brand easing'}
        </span>
        <button
          className="ctl-action"
          data-testid="path-play"
          onClick={() => setUi({ motionPlaying: !playing })}
        >
          {playing ? 'PAUSE' : 'PLAY'}
        </button>
      </div>

      <div className="lane path-stage">
        <svg viewBox={`0 0 ${W} ${H}`} className="path-svg" data-testid="path-stage">
          {/* hidden measurers: exact advances with the real SVG styling */}
          <text ref={flowMeasureRef} className="flow-text measure-text" style={{ fontSize: pl.textSize }}>
            {pl.text}
          </text>
          <text ref={asmMeasureRef} className="asm-char measure-text" style={{ fontSize: pl.textSize * 1.6, textAnchor: 'start' }}>
            {asmLabel}
          </text>

          {/* the figure itself, always present under the animation */}
          <path d={path.d} className="path-ghost" />

          {pl.scene === 'flow' ? (
            <>
              <path id="flow-path" ref={flowPathRef} d={path.doubledD} fill="none" stroke="none" />
              <text className="flow-text" style={{ fontSize: pl.textSize }}>
                <textPath
                  href="#flow-path"
                  startOffset={flowOffset}
                  textLength={flowLen}
                  lengthAdjust="spacingAndGlyphs"
                >
                  {flowText}
                </textPath>
              </text>
            </>
          ) : null}

          {pl.scene === 'orbit'
            ? orbitTiles.map((tile) => (
                <g
                  key={tile.i}
                  data-testid={`orbit-tile-${tile.i}`}
                  transform={`translate(${tile.x.toFixed(1)} ${tile.y.toFixed(1)}) scale(${tile.depth.toFixed(3)})`}
                >
                  <rect x={-62} y={-44} width={124} height={88} rx={10} className="orbit-tile" />
                  <text y={8} className="orbit-tile-label">
                    {String(tile.i + 1).padStart(2, '0')}
                  </text>
                </g>
              ))
            : null}

          {pl.scene === 'assemble'
            ? asmChars.map(({ c, i, x, y, rot, o }) => (
                <text
                  key={i}
                  className="asm-char"
                  style={{ fontSize: pl.textSize * 1.6 }}
                  opacity={o}
                  transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot.toFixed(1)})`}
                >
                  {c}
                </text>
              ))
            : null}
        </svg>
        <div className="panel-note">
          {pl.scene === 'flow'
            ? 'The brand line runs the figure end to end — a marquee with the curve as its track.'
            : pl.scene === 'orbit'
              ? 'Tiles ride the figure at equal spacing; nearer tiles grow, like a carousel.'
              : 'Characters scatter along the figure and assemble into the headline with the MOTION tab’s easing.'}
        </div>
      </div>
    </div>
  )
}
