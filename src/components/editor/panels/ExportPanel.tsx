'use client'

import { useEffect, useState } from 'react'
import { history, useStore } from '@/core/state/store'
import { createDefaultProject } from '@/core/state/defaults'
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
  const [confirming, setConfirming] = useState(false)

  // "changes were made" = anything on the undo stack, or a project that
  // simply is not the pristine default (a shared link opens with an
  // empty history but a full composition)
  const isDirty = () => {
    const s = useStore.getState()
    if (history.depth.past > 0) return true
    return JSON.stringify(s.project) !== JSON.stringify(createDefaultProject(s.project.seed))
  }

  const startNew = () => {
    // the outgoing composition goes onto the undo stack, so Ctrl+Z
    // brings it straight back
    const s = useStore.getState()
    history.push(s.project)
    s.replaceProject(createDefaultProject(), { keepHistory: true })
    s.setUi({
      selectedLayerId: undefined,
      selectedBlockId: 'headline',
      selectedBlockIds: ['headline'],
      selectedShapeIds: [],
      selectedImageIds: [],
      isolateLayerId: undefined,
    })
    setConfirming(false)
    flash('New composition — undo restores')
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

  const flash = (msg: string) => {
    setNote(msg)
    setTimeout(() => setNote(''), 2500)
  }

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
      <div className="panel-section">
        {confirming ? (
          // starting fresh throws the current composition away, so it
          // asks first — and says how to get back
          <>
            <div className="panel-note">
              Start a new composition? This replaces what is on the canvas.
              Undo brings it back.
            </div>
            <button className="ctl-action primary" onClick={startNew}>
              Discard and start new
            </button>
            <button className="ctl-action" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button
            className="ctl-action"
            onClick={() => {
              if (isDirty()) setConfirming(true)
              else startNew()
            }}
          >
            New composition
          </button>
        )}
        {note ? <div className="panel-note">{note}</div> : null}
      </div>
    </div>
  )
}
