'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/core/state/store'
import { renderController } from '@/render/renderController'
import { sampleCurve } from '@/core/lissajous/sampler'
import { samplesToPathD, samplesToDoubledPathD } from '@/core/lissajous/svgPath'
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

function pathLiss(ratioX: number, ratioY: number, phase: number): LissajousState {
  return {
    frequencyX: ratioX, frequencyY: ratioY, phase,
    amplitudeX: 0.8, amplitudeY: 0.76, rotation: 0, offsetX: 0, offsetY: 0,
    sampleDensity: 1024,
  }
}

// resolve the display font's real family so canvas measureText matches
// what SVG renders (canvas can't read CSS variables)
function useResolvedFont(): string {
  return useMemo(() => {
    if (typeof document === 'undefined') return 'sans-serif'
    const el = document.createElement('span')
    el.style.fontFamily = 'var(--font-flex)'
    document.body.appendChild(el)
    const family = getComputedStyle(el).fontFamily || 'sans-serif'
    el.remove()
    return family
  }, [])
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
      doubledD: samplesToDoubledPathD(samples),
      lut: buildArcLUT(samples),
      samples,
    }
  }, [pl.ratioX, pl.ratioY, pl.phase])
  const total = path.lut.total

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

  const family = useResolvedFont()

  // ---- FLOW: marquee — measure the text, repeat it to the nearest whole
  // number of copies per revolution, and pin it to EXACTLY one loop with
  // textLength so the tail meets the head without overprinting
  const flowText = useMemo(() => {
    let copyW = pl.text.length * pl.textSize * 0.62
    if (typeof document !== 'undefined') {
      const ctx = document.createElement('canvas').getContext('2d')
      if (ctx) {
        ctx.font = `640 ${pl.textSize}px ${family}`
        copyW = ctx.measureText(pl.text).width + pl.text.length * pl.textSize * 0.05
      }
    }
    const copies = Math.max(1, Math.round(total / Math.max(1, copyW)))
    return pl.text.repeat(copies)
  }, [pl.text, pl.textSize, total, family])
  const flowOffset = ((t / 1000) * pl.speed * total) % total

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

  // ---- ASSEMBLE: headline chars fly from the path into the set line
  const asmLabel = useMemo(() => {
    const head = pl.text.split('—')[0].trim()
    return (head || 'LISSAJOUS').slice(0, 24)
  }, [pl.text])

  const asmLayout = useMemo(() => {
    if (typeof document === 'undefined') return null
    const ctx = document.createElement('canvas').getContext('2d')
    if (!ctx) return null
    ctx.font = `640 ${pl.textSize * 1.6}px ${family}`
    const widths = [...asmLabel].map((c) => ctx.measureText(c).width)
    const totalW = widths.reduce((a, w) => a + w, 0)
    let x = (W - totalW) / 2
    const rest = widths.map((w) => {
      const cx = x + w / 2
      x += w
      return cx
    })
    return { rest, y: H * 0.54 }
  }, [asmLabel, pl.textSize, family])

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
          {/* the figure itself, always present under the animation */}
          <path d={path.d} className="path-ghost" />

          {pl.scene === 'flow' ? (
            <>
              <path id="flow-path" d={path.doubledD} fill="none" stroke="none" />
              <text className="flow-text" style={{ fontSize: pl.textSize }}>
                <textPath
                  href="#flow-path"
                  startOffset={flowOffset}
                  textLength={total}
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
