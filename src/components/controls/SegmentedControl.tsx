'use client'

import { SelectControl } from 'dialkit'

export type SegmentedOption<T extends string> = { value: T; label: string }

// One value-picker idiom for the whole app: DialKit's select. The old
// hand-rolled segment chips are gone — the kit owns this control.
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
    <div className="ctl-dial">
      <SelectControl
        label={label ?? ''}
        value={value}
        options={options.map((o) => ({ value: o.value, label: o.label }))}
        onChange={(v) => onChange(v as T)}
      />
    </div>
  )
}
