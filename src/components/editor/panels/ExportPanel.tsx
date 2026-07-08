'use client'

import { useState } from 'react'
import { useStore } from '@/core/state/store'
import { SegmentedControl } from '@/components/controls/SegmentedControl'
import { downloadPNG } from '@/core/export/png'
import { encodeShareHash } from '@/core/state/compress'

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

  return (
    <div className="panel">
      {variant === 'compose' ? (
      <div className="panel-section">
        <SegmentedControl
          label="EXPORT SCALE"
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
              flash('PNG EXPORTED')
            } catch {
              flash('EXPORT FAILED')
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? 'RENDERING…' : 'EXPORT PNG'}
        </button>
      </div>
      ) : null}
      <div className="panel-section">
        <button
          className="ctl-action"
          onClick={async () => {
            const url = `${location.origin}${location.pathname}#${encodeShareHash(project)}`
            try {
              await navigator.clipboard.writeText(url)
              flash('LINK COPIED')
            } catch {
              flash('CLIPBOARD BLOCKED')
            }
          }}
        >
          COPY SHARE LINK
        </button>
        {note ? <div className="panel-note">{note}</div> : null}
      </div>
    </div>
  )
}
