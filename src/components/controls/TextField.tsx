'use client'

import { useEffect, useRef } from 'react'
import { TextControl } from 'dialkit'

// DialKit's text control. It is single-line by design; the one
// multiline consumer (the shader expression editor) keeps a textarea
// styled from the kit's tokens.
export function TextField({
  label,
  value,
  onChange,
  onCommit,
  multiline,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  onCommit?: () => void
  multiline?: boolean
  placeholder?: string
}) {
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
    return () => window.removeEventListener('pointerup', done)
  }, [])

  if (multiline) {
    return (
      <label className="ctl-dial ctl-dial-multiline">
        <span className="dial-ish-label">{label}</span>
        <textarea
          className="text-field"
          rows={3}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onCommit}
        />
      </label>
    )
  }

  return (
    <div className="ctl-dial">
      <TextControl
        label={label}
        value={value}
        placeholder={placeholder}
        onChange={(v) => {
          dirty.current = true
          onChange(v)
          commitRef.current?.()
          dirty.current = false
        }}
      />
    </div>
  )
}
