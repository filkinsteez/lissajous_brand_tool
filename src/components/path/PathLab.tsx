'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/core/state/store'
import { renderController } from '@/render/renderController'
import { sampleCurve } from '@/core/lissajous/sampler'
import { samplesToPathD, samplesToSmoothDoubledPathD } from '@/core/lissajous/svgPath'
import { buildArcLUT } from '@/core/motion/arcLength'
import { evalEase, lissajousEasing } from '@/core/motion/spring'
import { PEOPLE_IMAGES as TILE_IMAGES } from '@/core/assets'
import type { LissajousState } from '@/core/state/types'

// Advert-style brand animation: objects riding the figure. FLOW is a
// text marquee on the path, ORBIT a ring of tiles, ASSEMBLE a headline
// whose characters fly in FROM the path with the MOTION tab's easing —
// the same figure family drives the layout grid, the easing, and this.
//
// LAB PRINCIPLE — FLUIDITY: nothing ON THE PATH ever comes to a complete
// stop. The curve is infinite, so everything riding it stays in motion:
// eases ride ON TOP of a base drift, never instead of it. One exception,
// by decree: an ASSEMBLED headline rests — set type reads as set.
const W = 1000
const H = 760
const HOLD_MS = 700
const DRIFT_FLOOR = 0.22 // fraction of orbit travel that is pure drift

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
        shape: { waist: ml.waist, fullness: ml.fullness, bias: ml.bias, lean: ml.lean, cross: ml.cross, morph: ml.morph },
      }).lut,
    [ml.ratioX, ml.ratioY, ml.phase, ml.read, ml.reverse, ml.strength, ml.decay, ml.lobe, ml.half, ml.waist, ml.fullness, ml.bias, ml.lean, ml.cross, ml.morph],
  )

  // ---- text metrics, measured on hidden SVG nodes with the real styles —
  // canvas measureText ran ~20% short of SVG's actual advances and the
  // textLength correction stretched glyphs visibly. Re-measure once the
  // display font finishes loading.
  const flowMeasureRef = useRef<SVGTextElement>(null)
  const asmMeasureRef = useRef<SVGTextElement>(null)
  const [flowCopyW, setFlowCopyW] = useState(0)
  const [asmMetrics, setAsmMetrics] = useState<{ label: string; centers: number[]; width: number } | null>(null)
  // per-char cumulative advances of the full text — REVEAL's writing head
  const [textCums, setTextCums] = useState<{ text: string; cums: number[] } | null>(null)
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
    if (flow) {
      setFlowCopyW(flow.getComputedTextLength())
      const n = pl.text.length
      const cums = [0]
      for (let i = 1; i <= n; i++) cums.push(flow.getSubStringLength(0, i))
      setTextCums({ text: pl.text, cums })
    }
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

  // ---- ORBIT: flocks — tiles clump into groups that lap the path with
  // the brand easing. Followers ease on a slight time lag, so a flock
  // stretches out while it accelerates and bunches up when it settles.
  // Depth: for 1:1 figures the ellipse IS a tilted circle, so the curve
  // parameter gives a true front/back (cos(t + φ/2)) — the y-heuristic
  // dies on thin ellipses (150°+ phase) where both limbs share heights.
  const orbitTiles = useMemo(() => {
    if (pl.scene !== 'orbit') return []
    const nGroups = Math.max(1, Math.min(pl.groups, pl.count))
    const perGroup = Math.max(1, Math.round(pl.count / nGroups))
    const g0 = Math.max(1, gcd(Math.round(pl.ratioX), Math.round(pl.ratioY)))
    const isCircle = Math.round(pl.ratioX) / g0 === 1 && Math.round(pl.ratioY) / g0 === 1
    const clump = pl.spacing // arc px between tiles within a flock (DISTANCE)
    const dur = Math.max(500, pl.lapMs)
    // follower time lag = the flock's breathing. Kept small so the stretch
    // is a gentle modulation on the fixed spacing, not a dramatic accordion.
    const lag = Math.min(70, dur * 0.018)
    // paint order must be STABLE: clumped members sit at near-equal depths,
    // and re-sorting per tile flips their stacking every few frames — a
    // visible z snap. So: flocks sort by MEAN depth (they only trade places
    // when far apart on the loop), and inside a flock the order is fixed —
    // followers behind, leader always on top, a fanned deck.
    const flocks = []
    for (let g = 0; g < nGroups; g++) {
      const members = []
      for (let j = 0; j < perGroup; j++) {
        const tj = t - j * lag
        const cyc = tj / dur
        const lap = Math.floor(cyc)
        const e = evalEase(brandLut, clamp01(cyc - lap))
        // fluidity principle: the ease rides on a base drift, so velocity
        // never reaches zero — the flock whips, settles, and keeps rolling
        const prog = DRIFT_FLOOR * cyc + (1 - DRIFT_FLOOR) * (lap + e)
        const s = prog * total + (g / nGroups) * total + j * clump
        const p = path.lut.posAt(s)
        const near = isCircle
          ? 0.5 - 0.5 * Math.cos(p.t + pl.phase / 2) // tilted-circle depth, 0=back 1=front
          : p.y / H // fallback: lower on stage = nearer
        const depth = lerp(0.55, 1.22, near)
        // 2.5D: cards lean into the tangent's climb (091's wheel feel,
        // without per-card rotation whiplash — sin keeps it continuous)
        const lean = 12 * Math.sin(p.angle)
        members.push({ key: `${g}-${j}`, n: g * perGroup + j + 1, x: p.x, y: p.y, depth, lean })
      }
      flocks.push({ depth: members.reduce((a, m) => a + m.depth, 0) / members.length, members })
    }
    return flocks
      .sort((a, b) => a.depth - b.depth)
      .flatMap((f) => f.members.slice().reverse())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pl.scene, pl.count, pl.groups, pl.spacing, pl.lapMs, pl.ratioX, pl.ratioY, pl.phase, brandLut, path, t])

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
    // fluidity principle, with its one exception: scattered chars DRIFT
    // along the path instead of parking on it, but the ASSEMBLED headline
    // rests — set type reads as set, that's the payoff of assembling
    const drift = total * (t / (dur * 6))
    return chars.map((c, i) => {
      let e: number
      if (ct < dur) e = easeFor(ct, i) // fly in
      else if (ct < dur + HOLD_MS) e = 1 // the line rests, set
      else if (ct < 2 * dur + HOLD_MS) e = 1 - easeFor(ct - dur - HOLD_MS, i) // scatter back
      else e = 0
      const p = path.lut.posAt(drift + (i / n) * total)
      const x = lerp(p.x, asmLayout.rest[i], e)
      const y = lerp(p.y, asmLayout.y, e)
      const rot = (1 - e) * ((p.angle * 180) / Math.PI)
      return { c, i, x, y, rot, o: 0.35 + 0.65 * e }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pl.scene, asmLabel, asmLayout, pl.durationMs, brandLut, path, t])

  // ---- REVEAL: the line types itself along the figure while the camera
  // (the viewBox) tracks the writing head, then pulls back with the brand
  // easing to show the whole figure and cuts to loop (059's path-text
  // camera, loop-driven instead of scroll-driven)
  const reveal = useMemo(() => {
    if (pl.scene !== 'reveal') return null
    const N = pl.text.length
    const dur = Math.max(1500, pl.durationMs)
    const pull = Math.max(600, dur * 0.4)
    const ct = t % (dur + pull)
    const cums = textCums && textCums.text === pl.text && textCums.cums.length === N + 1
      ? textCums.cums
      : null
    const totalW = cums ? cums[N] : N * pl.textSize * 0.62
    const zoomW = W * 0.42
    if (ct < dur) {
      const fchars = (ct / dur) * N
      const k = Math.min(N, Math.floor(fchars) + 1)
      const lo = Math.min(N, Math.floor(fchars))
      const hi = Math.min(N, lo + 1)
      const sHead = cums ? lerp(cums[lo], cums[hi], fchars - lo) : (ct / dur) * totalW
      const head = path.lut.posAt(sHead)
      return { content: pl.text.slice(0, k), cx: head.x, cy: head.y, vw: zoomW, head }
    }
    const q = evalEase(brandLut, clamp01((ct - dur) / pull))
    const head = path.lut.posAt(totalW)
    return {
      content: pl.text,
      cx: lerp(head.x, W / 2, q),
      cy: lerp(head.y, H / 2, q),
      vw: lerp(zoomW, W, q),
      head,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pl.scene, pl.text, pl.textSize, pl.durationMs, textCums, brandLut, path, t])

  const viewBox = reveal
    ? `${(reveal.cx - reveal.vw / 2).toFixed(1)} ${(reveal.cy - (reveal.vw * (H / W)) / 2).toFixed(1)} ${reveal.vw.toFixed(1)} ${(reveal.vw * (H / W)).toFixed(1)}`
    : `0 0 ${W} ${H}`

  return (
    <div className="path-lab" data-testid="path-lab">
      <div className="lab-header">
        <span className="lab-title">PATH</span>
        <span className="lab-sub">
          {pl.ratioX}:{pl.ratioY} · phase {Math.round((pl.phase * 180) / Math.PI)}° ·{' '}
          {pl.scene === 'flow'
            ? 'text on path'
            : pl.scene === 'orbit'
              ? 'tiles on path'
              : pl.scene === 'reveal'
                ? 'the line writes itself, camera following'
                : 'assemble with the brand easing'}
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
        <svg viewBox={viewBox} className="path-svg" data-testid="path-stage">
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

          {pl.scene === 'orbit' ? (
            <>
              <defs>
                <clipPath id="orbit-tile-clip">
                  <rect x={-62} y={-44} width={124} height={88} rx={10} />
                </clipPath>
              </defs>
              {orbitTiles.map((tile) => (
                <g
                  key={tile.key}
                  data-testid={`orbit-tile-${tile.key}`}
                  transform={`translate(${tile.x.toFixed(1)} ${tile.y.toFixed(1)}) scale(${tile.depth.toFixed(3)}) rotate(${tile.lean.toFixed(1)})`}
                >
                  <image
                    href={TILE_IMAGES[(tile.n - 1) % TILE_IMAGES.length]}
                    x={-62}
                    y={-44}
                    width={124}
                    height={88}
                    preserveAspectRatio="xMidYMid slice"
                    clipPath="url(#orbit-tile-clip)"
                    className="orbit-img"
                  />
                  <rect x={-62} y={-44} width={124} height={88} rx={10} className="orbit-tile-frame" />
                </g>
              ))}
            </>
          ) : null}

          {pl.scene === 'reveal' && reveal ? (
            <>
              <path id="reveal-path" d={path.doubledD} fill="none" stroke="none" />
              <text className="flow-text" style={{ fontSize: pl.textSize }}>
                <textPath href="#reveal-path">{reveal.content}</textPath>
              </text>
              {/* the pen: the writing head the camera is chasing */}
              <circle cx={reveal.head.x} cy={reveal.head.y} r={4.5} className="lane-dot" />
            </>
          ) : null}

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
              ? 'Flocks of tiles lap the figure with the MOTION tab’s easing — stretching as they whip, bunching as they settle, scaling down at the back.'
              : pl.scene === 'reveal'
                ? 'The line types itself along the figure; the camera chases the pen, then pulls back to show where it wrote.'
                : 'Characters scatter along the figure and assemble into the headline with the MOTION tab’s easing.'}
        </div>
      </div>
    </div>
  )
}
