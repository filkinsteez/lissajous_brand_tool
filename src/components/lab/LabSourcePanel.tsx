'use client'

import { useRef } from 'react'
import { useLabStore } from '@/core/lab/labStore'
import { getLabSource, clearLabSource } from '@/core/lab/sourceCache'
import type { LabFit } from '@/core/lab/types'
import { SegmentedControl } from '@/components/controls/SegmentedControl'
import { importLabSource } from './importSource'

export function LabSourcePanel() {
  const source = useLabStore((s) => s.lab.source)
  const sourceNonce = useLabStore((s) => s.ui.sourceNonce)
  const apply = useLabStore((s) => s.apply)
  const setUi = useLabStore((s) => s.setUi)
  const fileRef = useRef<HTMLInputElement>(null)

  const live = getLabSource()
  // a recipe can reference a source that has not been re-dropped yet
  const missing = !!source && (!live || (source.contentHash && live.hash !== source.contentHash))
  void sourceNonce // subscription keeps this panel in step with the cache

  return (
    <div className="panel-section">
      <div className="panel-heading">Source</div>
      <button className="ctl-action" onClick={() => fileRef.current?.click()}>
        {source ? 'Replace image' : 'Load image'}
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
          <button
            className="ctl-action"
            onClick={() => {
              clearLabSource()
              apply({ source: null })
              setUi({ sourceNonce: useLabStore.getState().ui.sourceNonce + 1 })
            }}
          >
            Clear source
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
