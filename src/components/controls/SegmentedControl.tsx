'use client'

export type SegmentedOption<T extends string> = { value: T; label: string }

// Up to four options read as a segmented control; more than four becomes
// a dropdown — a row of nine tiny chips is a wall, not a control.
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label?: string
  value: T
  options: SegmentedOption<T>[]
  onChange: (v: T) => void
}) {
  if (options.length > 4) {
    return (
      <label className="ctl">
        {label ? <span className="ctl-label">{label}</span> : null}
        <select
          className="ctl-select"
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    )
  }
  return (
    <div className="ctl ctl-col">
      {label ? <span className="ctl-label">{label}</span> : null}
      <div className="segmented">
        {options.map((o) => (
          <button
            key={o.value}
            className={o.value === value ? 'segment active' : 'segment'}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
