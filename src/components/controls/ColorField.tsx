'use client'

import { useEffect, useRef } from 'react'
import { ColorControl, Slider as DialSlider } from 'dialkit'

// DialKit's color control, plus the kit's slider for alpha. Values stay
// hex (#rrggbb) or hex8 (#rrggbbaa) — every consumer (CSS color,
// -webkit-text-stroke, the SVG exporter) takes hex8, so transparency
// rides along for free.
const parseColor = (v: string) => ({
  hex: v.slice(0, 7),
  alpha: v.length >= 9 ? parseInt(v.slice(7, 9), 16) / 255 : 1,
})

const composeColor = (hex: string, alpha: number) =>
  alpha >= 0.995 ? hex : `${hex}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`

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
  const dirty = useRef(false)
  const commitRef = useRef(onCommit)
  commitRef.current = onCommit

  useEffect(() => {
    const done = () => {
      if (!dirty.current) return
      dirty.current = false
      commitRef.current?.()
    }
    window.addEventListener('pointerup', done)
    window.addEventListener('keyup', done)
    return () => {
      window.removeEventListener('pointerup', done)
      window.removeEventListener('keyup', done)
    }
  }, [])

  return (
    <div className="ctl-dial">
      <ColorControl
        label={label}
        value={hex}
        onChange={(v) => {
          dirty.current = true
          onChange(composeColor(v.slice(0, 7), alpha))
        }}
      />
      <DialSlider
        label="OPACITY"
        value={Math.round(alpha * 100)}
        min={0}
        max={100}
        step={1}
        unit="%"
        onChange={(v) => {
          dirty.current = true
          onChange(composeColor(hex, v / 100))
        }}
      />
    </div>
  )
}
