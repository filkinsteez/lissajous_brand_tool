'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLabStore } from '@/core/lab/labStore'
import { getLabSource } from '@/core/lab/sourceCache'
import { exportLabPng } from '@/core/lab/render'
import { getLabReturnTarget, setDesignHandoff } from '@/core/lab/handoff'
import { resolveBankCached } from './bankCache'

// Export is WYSIWYG: the PNG is the preview's exact painter at full
// output size. Transparency isn't a toggle — zones set to "None"
// export as alpha, exactly as the checkerboard shows them.
export function LabExportPanel() {
  const output = useLabStore((s) => s.lab.output)
  const apply = useLabStore((s) => s.apply)
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const flash = (msg: string) => {
    setNote(msg)
    setTimeout(() => setNote(''), 2500)
  }

  const renderPng = async (): Promise<Blob> => {
    const s = useLabStore.getState()
    return exportLabPng(s.lab, getLabSource(), resolveBankCached(s.lab.mark.bank))
  }

  const doExport = async () => {
    setBusy(true)
    try {
      const blob = await renderPng()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `lab-${useLabStore.getState().lab.seed}.png`
      a.click()
      URL.revokeObjectURL(a.href)
      flash('PNG exported')
    } catch {
      flash('Export failed')
    } finally {
      setBusy(false)
    }
  }

  // the round trip back: render the real export and drop it on the
  // design canvas as an image block
  const sendToDesign = async () => {
    setBusy(true)
    try {
      const blob = await renderPng()
      const src = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(blob)
      })
      setDesignHandoff({
        src,
        name: `lab-${useLabStore.getState().lab.seed}.png`,
        // came in via EDIT IN LAB → the send REPLACES that block
        imageId: getLabReturnTarget() ?? undefined,
      })
      router.push('/')
    } catch {
      flash('Could not render the image')
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
      <button className="ctl-action primary" disabled={busy} onClick={sendToDesign}>
        {busy ? 'Rendering…' : 'Send to Design'}
      </button>
      <div className="panel-note">
        Renders the result and places it on the design canvas as an image.
      </div>
      <div className="lab-row">
        <label className="lab-dim">W{dimInput('width')}</label>
        <label className="lab-dim">H{dimInput('height')}</label>
      </div>
      <button className="ctl-action" disabled={busy} onClick={doExport}>
        Export PNG
      </button>
      <div className="panel-note">Exports exactly what you see.</div>
      {note ? <div className="panel-note">{note}</div> : null}
    </div>
  )
}
