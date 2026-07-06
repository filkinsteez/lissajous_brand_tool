'use client'

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
    <button className="ctl ctl-toggle" onClick={() => onChange(!value)} aria-pressed={value}>
      <span className="ctl-label">{label}</span>
      <span className={value ? 'toggle-pip on' : 'toggle-pip'} />
    </button>
  )
}
