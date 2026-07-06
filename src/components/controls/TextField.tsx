'use client'

export function TextField({
  label,
  value,
  onChange,
  onCommit,
  multiline,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  onCommit?: () => void
  multiline?: boolean
}) {
  return (
    <label className="ctl ctl-col">
      <span className="ctl-label">{label}</span>
      {multiline ? (
        <textarea
          className="text-field"
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onCommit}
        />
      ) : (
        <input
          className="text-field"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onCommit}
        />
      )}
    </label>
  )
}
