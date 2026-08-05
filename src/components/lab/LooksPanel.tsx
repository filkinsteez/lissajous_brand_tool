'use client'

import { useEffect, useRef } from 'react'
import { useLabStore } from '@/core/lab/labStore'
import { LOOKS, lookPatchFor } from '@/core/lab/looks'
import { mergeDeep } from '@/core/state/store'
import { renderLab } from '@/core/lab/render'
import { getLabSource } from '@/core/lab/sourceCache'
import { resolveBankCached } from './bankCache'
import { Slider } from '@/components/controls/Slider'

const pct = (v: number) => String(Math.round(v * 100))

// The looks strip: every look rendered as a live thumbnail of YOUR
// image through the real pipeline. Clicking applies the look as one
// normal undo entry — every control underneath lands on real values.
// STRENGTH blends the photo back over the result.

const THUMB_H = 72

export function LooksPanel() {
  const lookId = useLabStore((s) => s.lab.look?.id ?? null)
  const strength = useLabStore((s) => s.lab.look?.strength ?? 1)
  const lab = useLabStore((s) => s.lab)
  const sourceNonce = useLabStore((s) => s.ui.sourceNonce)
  const apply = useLabStore((s) => s.apply)
  const setT = useLabStore((s) => s.setTransient)
  const commit = useLabStore((s) => s.commitTransient)
  const stripRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef(0)

  // thumbnails: real renders at small scale, redrawn only when the
  // state they inherit changes. The key deliberately uses the source
  // CONTENT hash and the COMMITTED paint (pointer-up), never the
  // per-stroke nonce — one brush stroke must not re-render ten full
  // pipelines per pointer sample.
  const thumbKey = [
    lab.source?.contentHash ?? 'none',
    lab.source?.fit ?? '',
    lab.seed,
    lab.colors.palette.join(),
    lab.colors.ink,
    lab.colors.paper,
    `${lab.output.width}x${lab.output.height}`,
    JSON.stringify(lab.territory.sources),
    lab.territory.gain ?? 1,
    lab.paint?.data.length ?? 0,
    // bitmap PRESENCE, not the per-stroke nonce: flips exactly when an
    // image arrives (rehydration included) or is removed
    getLabSource() ? 'img' : 'none',
  ].join('|')
  void sourceNonce // subscription: re-render (and re-key) on cache changes
  useEffect(() => {
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      const strip = stripRef.current
      if (!strip) return
      const source = getLabSource()
      const canvases = strip.querySelectorAll('canvas')
      const base = useLabStore.getState().lab
      LOOKS.forEach((look, i) => {
        const canvas = canvases[i]
        if (!canvas) return
        const scale = THUMB_H / base.output.height
        canvas.width = Math.max(1, Math.round(base.output.width * scale))
        canvas.height = THUMB_H
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.setTransform(scale, 0, 0, scale, 0, 0)
        const preview = mergeDeep(base, lookPatchFor(look, !!source))
        preview.look = { id: look.id, strength: 1 }
        // thumbnails skip grain — unreadable at 72px and 10x the cost
        preview.finish = { grain: 0 }
        renderLab(ctx, preview, source, resolveBankCached(preview.mark.bank), 'composite')
      })
    })
    return () => cancelAnimationFrame(rafRef.current)
  }, [thumbKey])

  return (
    <div className="panel-section">
      <div className="panel-heading">Looks</div>
      <div className="lab-looks" ref={stripRef}>
        {LOOKS.map((look) => (
          <button
            key={look.id}
            className={lookId === look.id ? 'lab-look active' : 'lab-look'}
            title={look.label}
            onClick={() => {
              const hasSource = !!getLabSource()
              apply({ ...lookPatchFor(look, hasSource), look: { id: look.id, strength: 1 } })
            }}
          >
            <canvas className="lab-look-thumb" />
            <span className="lab-look-label">{look.label}</span>
          </button>
        ))}
      </div>
      {getLabSource() ? (
        <Slider label="Strength" value={strength} min={0} max={1} step={0.01} format={pct}
          defaultValue={1}
          onChange={(v) => setT({ look: { strength: v } })} onCommit={commit} />
      ) : null}
    </div>
  )
}
