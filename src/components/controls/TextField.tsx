'use client'

import { TextControl } from 'dialkit'
import { niceLabel } from './label'
import { useCommitOnRelease } from './useCommitOnRelease'

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
  const { commitNow } = useCommitOnRelease(onCommit)

  if (multiline) {
    return (
      <label className="ctl-dial ctl-dial-multiline">
        <span className="dial-ish-label">{niceLabel(label)}</span>
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
        label={niceLabel(label)}
        value={value}
        placeholder={placeholder}
        onChange={(v) => {
          onChange(v)
          commitNow()
        }}
      />
    </div>
  )
}
