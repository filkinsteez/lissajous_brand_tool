'use client'

import { useRef, useState } from 'react'
import { useLabStore } from '@/core/lab/labStore'
import { getLabSource, clearLabSource } from '@/core/lab/sourceCache'
import type { LabFit } from '@/core/lab/types'
import { SegmentedControl } from '@/components/controls/SegmentedControl'
import { Slider } from '@/components/controls/Slider'
import { importLabSource } from './importSource'

const pct = (v: number) => String(Math.round(v * 100))

export function LabSourcePanel() {
  const source = useLabStore((s) => s.lab.source)
  const sourceNonce = useLabStore((s) => s.ui.sourceNonce)
  const sourceVisibility = useLabStore((s) => s.lab.sourceVisibility)
  const apply = useLabStore((s) => s.apply)
  const setT = useLabStore((s) => s.setTransient)
  const commit = useLabStore((s) => s.commitTransient)
  const setUi = useLabStore((s) => s.setUi)
  const fileRef = useRef<HTMLInputElement>(null)

  const live = getLabSource()
  // a recipe can reference a source that has not been re-dropped yet
  const missing = !!source && (!live || (source.contentHash && live.hash !== source.contentHash))
  void sourceNonce // subscription keeps this panel in step with the cache
  const [dragOver, setDragOver] = useState(false)

  // the whole section takes drops, same handling as the canvas
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = Array.from(e.dataTransfer.files).find((x) => x.type.startsWith('image/'))
    if (f) void importLabSource(f)
  }

  return (
    <div
      className="panel-section"
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div className="panel-heading">Image</div>
      <button
        className={dragOver ? 'ctl-action lab-drop' : 'ctl-action'}
        onClick={() => fileRef.current?.click()}
      >
        {dragOver ? 'Drop it' : source ? 'Replace image' : 'Load image'}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void importLabSource(f)
          e.target.value = ''
        }}
      />
      {source ? (
        <>
          <div className="panel-note">
            {source.filename ?? 'image'} — {source.width}×{source.height}
            {source.contentHash ? ` · ${source.contentHash.slice(0, 8)}` : ''}
          </div>
          {missing ? (
            <div className="panel-note lab-warn">
              This recipe expects {source.filename ?? 'its source image'} — drop the matching
              file to rehydrate it.
            </div>
          ) : null}
          <SegmentedControl<LabFit>
            label="Fit"
            value={source.fit}
            options={[
              { value: 'contain', label: 'Contain' },
              { value: 'cover', label: 'Cover' },
            ]}
            onChange={(fit) => apply({ source: { ...source, fit } })}
          />
          <Slider label="Show through" value={sourceVisibility} min={0} max={1} step={0.01}
            format={pct} defaultValue={0}
            onChange={(v) => setT({ sourceVisibility: v })} onCommit={commit} />
          <button
            className="ctl-action"
            onClick={() => {
              clearLabSource()
              apply({ source: null })
              setUi({ sourceNonce: useLabStore.getState().ui.sourceNonce + 1 })
            }}
          >
            Remove image
          </button>
        </>
      ) : (
        <div className="panel-note">
          Drop an image on the canvas or load one here. Nothing uploads — the file stays in
          this tab.
        </div>
      )}
    </div>
  )
}
