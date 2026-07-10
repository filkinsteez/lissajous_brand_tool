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
  // double-click snaps back to this value (one committed history entry)
  defaultValue?: number
}

export function Slider({ label, value, min, max, step = 0.01, format, onChange, onCommit, defaultValue }: SliderProps) {
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
