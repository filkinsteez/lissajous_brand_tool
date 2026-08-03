'use client'

import { Slider as DialSlider } from 'dialkit'
import { niceLabel } from './label'
import { useCommitOnRelease } from './useCommitOnRelease'

export type SliderProps = {
  label: string
  value: number
  min: number
  max: number
  step?: number
  format?: (v: number) => string
  defaultValue?: number
  unit?: string
  onChange: (v: number) => void
  // fires once at the end of a drag / key adjustment — the store commits
  // one history entry there instead of one per pixel of drag
  onCommit?: () => void
}

// DialKit's slider wired to this app's history model.
//
// The kit renders the raw number, so a "display formatter" cannot work:
// the UNIT has to be real. Percent-formatted params are scaled x100 and
// radian params to degrees, then inverted on the way back — the panel
// call sites keep passing their native units untouched.
//
// `defaultValue` keeps double-click-to-reset, which the kit does not
// ship but this tool has relied on since the slider rewrite.
export function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  defaultValue,
  unit,
  onChange,
  onCommit,
}: SliderProps) {
  const { touch, commitNow } = useCommitOnRelease(onCommit)

  const isPct = !!format && format(1) === '100'
  const isDeg = !!format && format(Math.PI).startsWith('180')
  const k = isPct ? 100 : isDeg ? 180 / Math.PI : 1
  const suffix = unit ?? (isPct ? '%' : isDeg ? '°' : undefined)
  const scaledStep = step ? Math.max(Math.round(step * k * 1000) / 1000, 0.001) : undefined

  return (
    <div
      className="ctl-dial"
      onDoubleClick={() => {
        if (defaultValue === undefined) return
        onChange(defaultValue)
        commitNow()
      }}
    >
      <DialSlider
        label={niceLabel(label)}
        value={Math.round(value * k * 1000) / 1000}
        min={Math.round(min * k * 1000) / 1000}
        max={Math.round(max * k * 1000) / 1000}
        step={k === 1 ? step : (scaledStep ?? 1)}
        unit={suffix}
        onChange={(v) => {
          touch()
          onChange(k === 1 ? v : v / k)
        }}
      />
    </div>
  )
}
