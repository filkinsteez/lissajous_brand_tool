'use client'

import { useEffect, useState } from 'react'
import { useStore } from '@/core/state/store'
import { SegmentedControl } from '@/components/controls/SegmentedControl'
import { downloadPNG, exportPNG } from '@/core/export/png'

// variant 'motion' drops the poster-only PNG render; the share link
// carries the whole project (motion system included), so it lives in both
export function ExportPanel({ variant = 'compose' }: { variant?: 'compose' | 'motion' }) {
  const project = useStore((s) => s.project)
  const mode = useStore((s) => s.ui.mode)
  const apply = useStore((s) => s.apply)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const flash = (msg: string) => {
    setNote(msg)
    setTimeout(() => setNote(''), 2500)
  }

  // dev capture hook: the REAL export pipeline as a dataURL, so the
  // devshot loop can verify exports without touching the filesystem
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return
    ;(window as unknown as { __lbsExportPng?: (s?: 1 | 2 | 4) => Promise<string> }).__lbsExportPng =
      async (s = 1) => {
        const blob = await exportPNG(useStore.getState().project, s)
        return await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.readAsDataURL(blob)
        })
      }
  }, [])

  return (
    <div className="panel">
      {variant === 'compose' ? (
      <div className="panel-section">
        <SegmentedControl
          label="Export scale"
          value={String(project.export.scale)}
          options={[
            { value: '1', label: '1×' },
            { value: '2', label: '2×' },
            { value: '4', label: '4×' },
          ]}
          onChange={(v) => apply({ export: { scale: Number(v) as 1 | 2 | 4 } })}
        />
        <button
          className="ctl-action primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await downloadPNG(project, project.export.scale, {
                includeConstruction: mode === 'setup',
              })
              flash('PNG exported')
            } catch {
              flash('Export failed')
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? 'Rendering…' : 'Export PNG'}
        </button>
      </div>
      ) : null}
      {/* New Composition moved to the topbar beside Shuffle Composition:
          both act on the whole document, and neither is about export */}
      {note ? <div className="panel-note">{note}</div> : null}
    </div>
  )
}
