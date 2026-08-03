'use client'

import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, KeyboardEvent } from 'react'

export type SliderProps = {
  label: string
  value: number
  min: number
  max: number
  step?: number
  format?: (v: number) => string
  onChange: (v: number) => void
  // fires once at the end of a drag / key adjustment — the store commits
  // one history entry there instead of one per pixel of drag
  onCommit?: () => void
  // double-click snaps back to this value (one committed history entry)
  defaultValue?: number
}

// The parameter row, DialKit-style: the LABEL scrubs (drag left/right,
// Alt = fine, Shift = coarse), the VALUE is click-to-type, the track
// still drags directly. One component — every panel in the app gets the
// same hand-feel.
export function Slider({ label, value, min, max, step = 0.01, format, onChange, onCommit, defaultValue }: SliderProps) {
  const [editing, setEditing] = useState(false)
  const scrub = useRef<{ id: number; startX: number; startV: number; moved: boolean } | null>(null)

  const quant = (v: number) => {
    const q = Math.round((v - min) / step) * step + min
    return Math.min(max, Math.max(min, Number(q.toFixed(6))))
  }

  const onLabelDown = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (e.button !== 0) return
    scrub.current = { id: e.pointerId, startX: e.clientX, startV: value, moved: false }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // synthetic pointers have no active pointer to capture
    }
  }
  const onLabelMove = (e: ReactPointerEvent<HTMLSpanElement>) => {
    const s = scrub.current
    if (!s || e.pointerId !== s.id) return
    const dx = e.clientX - s.startX
    if (!s.moved && Math.abs(dx) < 3) return
    s.moved = true
    // ~220px of travel sweeps the full range; Alt refines, Shift races
    const perPx = (max - min) / 220
    const mult = e.altKey ? 0.1 : e.shiftKey ? 4 : 1
    onChange(quant(s.startV + dx * perPx * mult))
  }
  const onLabelUp = () => {
    if (scrub.current?.moved) onCommit?.()
    scrub.current = null
  }

  const commitText = (raw: string) => {
    setEditing(false)
    const parsed = Number.parseFloat(raw.replace(',', '.'))
    if (!Number.isFinite(parsed)) return
    // formatted displays are usually percentages — accept either scale
    const looksPct = format && Math.abs(parsed) > max && Math.abs(parsed / 100) <= Math.max(Math.abs(min), Math.abs(max))
    const next = quant(looksPct ? parsed / 100 : parsed)
    onChange(next)
    onCommit?.()
  }

  const onEditKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commitText(e.currentTarget.value)
    else if (e.key === 'Escape') setEditing(false)
  }

  return (
    <label
      className="ctl"
      onDoubleClick={
        defaultValue === undefined
          ? undefined
          : () => {
              onChange(defaultValue)
              onCommit?.()
            }
      }
      title={defaultValue === undefined ? undefined : 'Double-click to reset'}
    >
      <span
        className="ctl-label ctl-scrub"
        title="Drag to scrub — Alt fine, Shift coarse"
        onPointerDown={onLabelDown}
        onPointerMove={onLabelMove}
        onPointerUp={onLabelUp}
        onPointerCancel={onLabelUp}
      >
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={(e) => {
          if (e.key.startsWith('Arrow')) onCommit?.()
        }}
      />
      {editing ? (
        <input
          className="ctl-value-input"
          type="text"
          inputMode="decimal"
          autoFocus
          defaultValue={format ? format(value) : String(value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => commitText(e.currentTarget.value)}
          onKeyDown={onEditKey}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span
          className="ctl-value ctl-value-editable"
          title="Click to type a value"
          onClick={(e) => {
            e.preventDefault()
            setEditing(true)
          }}
        >
          {format ? format(value) : String(value)}
        </span>
      )}
    </label>
  )
}
