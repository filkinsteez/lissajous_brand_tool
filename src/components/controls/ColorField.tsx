'use client'

// Label + native color well + hex readout, in the panel's control grid.
export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="ctl ctl-color">
      <span className="ctl-label">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="color-well"
      />
      <span className="color-hex">{value.toUpperCase()}</span>
    </label>
  )
}
