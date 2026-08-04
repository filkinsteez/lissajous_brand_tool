'use client'

import { useEffect, useRef, useState } from 'react'
import { useLabStore } from '@/core/lab/labStore'
import { getLabSource } from '@/core/lab/sourceCache'
import { exportLabPng } from '@/core/lab/render'
import { serializeLab, deserializeLab } from '@/core/lab/recipe'
import { Toggle } from '@/components/controls/Toggle'
import { resolveBankCached } from './bankCache'

export function LabExportPanel() {
  const output = useLabStore((s) => s.lab.output)
  const apply = useLabStore((s) => s.apply)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const recipeRef = useRef<HTMLInputElement>(null)

  const flash = (msg: string) => {
    setNote(msg)
    setTimeout(() => setNote(''), 2500)
  }

  const doExport = async () => {
    setBusy(true)
    try {
      const s = useLabStore.getState()
      const blob = await exportLabPng(s.lab, getLabSource(), resolveBankCached(s.lab.mark.bank))
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `lab-mark-translation-${s.lab.seed}.png`
      a.click()
      URL.revokeObjectURL(a.href)
      flash('PNG exported')
    } catch {
      flash('Export failed')
    } finally {
      setBusy(false)
    }
  }

  // dev capture hook — the REAL export as a dataURL for the devshot loop
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return
    const w = window as unknown as { __lbsLabExportPng?: () => Promise<string> }
    w.__lbsLabExportPng = async () => {
      const s = useLabStore.getState()
      const blob = await exportLabPng(s.lab, getLabSource(), resolveBankCached(s.lab.mark.bank))
      return await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.readAsDataURL(blob)
      })
    }
    return () => {
      delete w.__lbsLabExportPng
    }
  }, [])

  // dimensions edit as free text and commit on blur/Enter — clamping
  // per keystroke turned "type 900" into 64 -> 640 -> 6400 with an undo
  // entry and a full re-render at every bogus intermediate value
  const [draft, setDraft] = useState<{ width?: string; height?: string }>({})

  const commitDim = (key: 'width' | 'height') => {
    const v = draft[key]
    setDraft((d) => ({ ...d, [key]: undefined }))
    if (v === undefined) return
    const n = Math.round(Number(v))
    if (!Number.isFinite(n) || n < 1) return
    apply({ output: { [key]: Math.max(64, Math.min(8192, n)) } })
  }

  const dimInput = (key: 'width' | 'height') => (
    <input
      className="lab-dim-input"
      type="number"
      value={draft[key] ?? String(output[key])}
      min={64}
      max={8192}
      onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
      onBlur={() => commitDim(key)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') setDraft((d) => ({ ...d, [key]: undefined }))
      }}
    />
  )

  return (
    <div className="panel-section">
      <div className="panel-heading">Export</div>
      <div className="lab-row">
        <label className="lab-dim">W{dimInput('width')}</label>
        <label className="lab-dim">H{dimInput('height')}</label>
      </div>
      <Toggle
        label="Transparent"
        value={output.transparent}
        onChange={(transparent) => apply({ output: { transparent } })}
      />
      <button className="ctl-action primary" disabled={busy} onClick={doExport}>
        {busy ? 'Rendering…' : 'Export PNG'}
      </button>

      <div className="panel-heading">Recipe</div>
      <div className="lab-row">
        <button
          className="ctl-action"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(serializeLab(useLabStore.getState().lab))
              flash('Recipe copied')
            } catch {
              flash('Clipboard unavailable')
            }
          }}
        >
          Copy JSON
        </button>
        <button
          className="ctl-action"
          onClick={() => {
            const s = useLabStore.getState()
            const blob = new Blob([serializeLab(s.lab)], { type: 'application/json' })
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = `lab-recipe-${s.lab.seed}.json`
            a.click()
            URL.revokeObjectURL(a.href)
          }}
        >
          Download
        </button>
        <button className="ctl-action" onClick={() => recipeRef.current?.click()}>
          Load
        </button>
      </div>
      <input
        ref={recipeRef}
        type="file"
        accept="application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          void f.text().then((text) => {
            const lab = deserializeLab(text)
            if (!lab) {
              flash('Not a lab recipe')
              return
            }
            useLabStore.getState().replaceLab(lab, { keepHistory: true })
            flash(lab.source ? `Loaded — expects ${lab.source.filename ?? 'a source image'}` : 'Loaded')
          })
        }}
      />
      <div className="panel-note">
        A recipe holds everything except the pixels — the source is matched back by its
        hash when you drop the same file.
      </div>
      {note ? <div className="panel-note">{note}</div> : null}
    </div>
  )
}
