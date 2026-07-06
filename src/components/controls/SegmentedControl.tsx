'use client'

export type SegmentedOption<T extends string> = { value: T; label: string }

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
