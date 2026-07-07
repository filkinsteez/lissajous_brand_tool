'use client'

// Label + color well + opacity slider. Values are hex (#rrggbb) or hex8
// (#rrggbbaa) — every consumer (CSS color/background/text-stroke, the
// SVG exporter) takes hex8, so transparency rides along for free.
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
  return (
    <div className="ctl ctl-color">
      <span className="ctl-label">{label}</span>
      <input
        type="color"
        value={hex}
        onChange={(e) => onChange(composeColor(e.target.value, alpha))}
        onBlur={onCommit}
        className="color-well"
        aria-label={label}
      />
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(alpha * 100)}
        onChange={(e) => onChange(composeColor(hex, Number(e.target.value) / 100))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        className="color-alpha"
        aria-label={`${label} opacity`}
      />
      <span className="color-hex">{Math.round(alpha * 100)}%</span>
    </div>
  )
}
