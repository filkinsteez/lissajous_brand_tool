'use client'

import { Toggle as DialToggle } from 'dialkit'
import { niceLabel } from './label'

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
      <DialToggle label={niceLabel(label)} checked={value} onChange={onChange} />
    </div>
  )
}
