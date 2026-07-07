'use client'

import { useRef, useState } from 'react'
import { useStore } from '@/core/state/store'
import { SegmentedControl } from '@/components/controls/SegmentedControl'
import { downloadPNG } from '@/core/export/png'
import { downloadRecipe, readRecipeFile } from '@/core/export/recipe'
import { encodeShareHash } from '@/core/state/compress'

// variant 'motion' drops the poster-only pieces (PNG render, gallery):
// recipes and share links carry the motion system, so they live in both tabs
export function ExportPanel({ variant = 'compose' }: { variant?: 'compose' | 'motion' }) {
  const project = useStore((s) => s.project)
  const apply = useStore((s) => s.apply)
  const replaceProject = useStore((s) => s.replaceProject)
  const fileRef = useRef<HTMLInputElement>(null)
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
              await downloadPNG(project, project.export.scale)
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
        <button className="ctl-action" onClick={() => { downloadRecipe(project); flash('RECIPE SAVED') }}>
          DOWNLOAD BRAND RECIPE
        </button>
        <button className="ctl-action" onClick={() => fileRef.current?.click()}>
          IMPORT RECIPE
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file) return
            const loaded = await readRecipeFile(file)
            if (loaded) {
              replaceProject(loaded)
              flash('RECIPE LOADED')
            } else {
              flash('INVALID RECIPE')
            }
            e.target.value = ''
          }}
        />
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
