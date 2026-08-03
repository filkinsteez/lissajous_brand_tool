'use client'

import { useEffect, useRef, useState } from 'react'
import { niceLabel } from './label'

// DialKit's ColorControl opens the browser's native picker — a white OS
// sheet in the middle of a dark tool. This is the same control built to
// the kit's aesthetic: kit row anatomy, kit tokens, and a dark popover
// with a saturation field, hue and alpha strips, and a hex input.
//
// Values are hex (#rrggbb) or hex8 (#rrggbbaa) — every consumer (CSS
// color, -webkit-text-stroke, the SVG exporter) takes hex8, so
// transparency rides along for free.

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16) || 0,
    parseInt(h.slice(2, 4), 16) || 0,
    parseInt(h.slice(4, 6), 16) || 0,
  ]
}

const toHex = (n: number) => Math.round(clamp01(n) * 255).toString(16).padStart(2, '0')

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
  }
  h = (h * 60 + 360) % 360
  return [h, max === 0 ? 0 : d / max, max]
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  const [r, g, b] =
    h < 60 ? [c, x, 0]
    : h < 120 ? [x, c, 0]
    : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c]
    : h < 300 ? [x, 0, c]
    : [c, 0, x]
  return [r + m, g + m, b + m]
}

const parseColor = (v: string) => ({
  hex: v.slice(0, 7) || '#000000',
  alpha: v.length >= 9 ? parseInt(v.slice(7, 9), 16) / 255 : 1,
})

const composeColor = (hex: string, alpha: number) =>
  alpha >= 0.995 ? hex : `${hex}${toHex(alpha)}`

// a pointer-drag surface: reports normalized x/y on down and every move
function useDragSurface(onPos: (x: number, y: number) => void) {
  const ref = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const report = (e: PointerEvent | React.PointerEvent) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    onPos(clamp01((e.clientX - r.left) / r.width), clamp01((e.clientY - r.top) / r.height))
  }
  useEffect(() => {
    const move = (e: PointerEvent) => dragging.current && report(e)
    const up = () => (dragging.current = false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  })
  return {
    ref,
    onPointerDown: (e: React.PointerEvent) => {
      dragging.current = true
      report(e)
    },
  }
}

export function ColorField({
  label,
  value,
  onChange,
  onCommit,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  onCommit?: () => void
}) {
  const { hex, alpha } = parseColor(value)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(hex)
  const wrapRef = useRef<HTMLDivElement>(null)
  const commitRef = useRef(onCommit)
  commitRef.current = onCommit

  const [r, g, b] = hexToRgb(hex)
  const [h, s, v] = rgbToHsv(r / 255, g / 255, b / 255)

  useEffect(() => setDraft(hex), [hex])

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', esc)
    }
  }, [open])

  const emit = (hh: number, ss: number, vv: number, aa: number = alpha) => {
    const [nr, ng, nb] = hsvToRgb(hh, ss, vv)
    onChange(composeColor(`#${toHex(nr)}${toHex(ng)}${toHex(nb)}`, aa))
  }

  const sv = useDragSurface((x, y) => emit(h, x, 1 - y))
  const hue = useDragSurface((x) => emit(x * 360, s, v))
  const alphaBar = useDragSurface((x) => emit(h, s, v, x))

  return (
    <div className="ctl-dial" ref={wrapRef}>
      <div className="dial-row">
        <span className="dial-row-label">{niceLabel(label)}</span>
        <button
          className="dial-swatch"
          aria-label={`${label} — open the color picker`}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="dial-swatch-chip" style={{ background: value }} />
          <span className="dial-swatch-hex">{hex.toUpperCase()}</span>
        </button>
      </div>

      {open ? (
        <div className="dial-picker">
          <div
            className="dial-picker-sv"
            ref={sv.ref}
            onPointerDown={sv.onPointerDown}
            onPointerUp={() => commitRef.current?.()}
            style={{ background: `hsl(${h} 100% 50%)` }}
          >
            <div className="dial-picker-sv-white" />
            <div className="dial-picker-sv-black" />
            <span
              className="dial-picker-dot"
              style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%` }}
            />
          </div>

          <div
            className="dial-picker-strip dial-picker-hue"
            ref={hue.ref}
            onPointerDown={hue.onPointerDown}
            onPointerUp={() => commitRef.current?.()}
          >
            <span className="dial-picker-thumb" style={{ left: `${(h / 360) * 100}%` }} />
          </div>

          <div
            className="dial-picker-strip dial-picker-alpha"
            ref={alphaBar.ref}
            onPointerDown={alphaBar.onPointerDown}
            onPointerUp={() => commitRef.current?.()}
            style={{ ['--stop' as string]: hex }}
          >
            <span className="dial-picker-thumb" style={{ left: `${alpha * 100}%` }} />
          </div>

          <div className="dial-picker-foot">
            <input
              className="dial-picker-hex"
              value={draft}
              spellCheck={false}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                if (/^#[0-9a-f]{6}$/i.test(draft)) {
                  onChange(composeColor(draft, alpha))
                  commitRef.current?.()
                } else setDraft(hex)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
            />
            <span className="dial-picker-pct">{Math.round(alpha * 100)}%</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
