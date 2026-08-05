import { deserializeProject } from '@/core/state/serialize'
import { useLabStore } from '@/core/lab/labStore'
import type { CurveSnapshot } from '@/core/lab/types'

// The design tab's curve, read from its autosave. The lab keeps every
// curve field-source in lockstep with it — the crit was that a curve
// authored in the editor never propagated here, so "The curve" silently
// meant a stale copy from whenever the source was added.

export function editorCurveSnapshot(): CurveSnapshot | undefined {
  try {
    const raw = localStorage.getItem('lbs-autosave')
    if (!raw) return undefined
    const p = deserializeProject(raw)
    if (!p) return undefined
    const l = p.lissajous
    return {
      frequencyX: l.frequencyX,
      frequencyY: l.frequencyY,
      phase: l.phase,
      amplitudeX: l.amplitudeX,
      amplitudeY: l.amplitudeY,
      rotation: l.rotation,
      offsetX: l.offsetX,
      offsetY: l.offsetY,
      curve: l.curve === 'meta' ? 'meta' : undefined,
    }
  } catch {
    return undefined
  }
}

// Silent sync: called on lab mount and window focus. Geometry follows
// the editor — this is derived truth, not an authored lab edit, so it
// replaces state without pushing an undo entry.
export function refreshCurveSources(): void {
  const snap = editorCurveSnapshot()
  if (!snap) return
  const st = useLabStore.getState()
  const sources = st.lab.territory.sources
  const key = JSON.stringify(snap)
  if (!sources.some((s) => s.kind === 'curve' && JSON.stringify(s.curve ?? null) !== key)) return
  st.replaceLab(
    {
      ...st.lab,
      territory: {
        ...st.lab.territory,
        sources: sources.map((s) => (s.kind === 'curve' ? { ...s, curve: snap } : s)),
      },
    },
    { keepHistory: true },
  )
}
