'use client'

import { Toggle as DialToggle } from 'dialkit'

export function Toggle({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="ctl-dial">
      <DialToggle label={label} checked={value} onChange={onChange} />
    </div>
  )
}
