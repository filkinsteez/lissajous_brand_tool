'use client'

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
}

export function Slider({ label, value, min, max, step = 0.01, format, onChange, onCommit }: SliderProps) {
  return (
    <label className="ctl">
      <span className="ctl-label">{label}</span>
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
      <span className="ctl-value">{format ? format(value) : String(value)}</span>
    </label>
  )
}
