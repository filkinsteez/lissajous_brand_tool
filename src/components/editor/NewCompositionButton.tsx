'use client'

import { useState } from 'react'
import { history, useStore } from '@/core/state/store'
import { createDefaultProject } from '@/core/state/defaults'
import { ConfirmDialog } from '@/components/controls/ConfirmDialog'

// Composition-level actions live in the topbar next to Shuffle, not
// buried under EXPORT: they act on the whole document, the way Shuffle
// does, and nothing about them belongs to exporting a file.
export function NewCompositionButton() {
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
  }

  return (
    <>
      <button
        className="topbar-shuffle"
        title="Start a new composition (undo brings this one back)"
        onClick={() => {
          if (isDirty()) setConfirming(true)
          else startNew()
        }}
      >
        New Composition
      </button>
      {/* starting fresh throws the composition away, so it asks first */}
      <ConfirmDialog
        open={confirming}
        title="Start a new composition?"
        body="This replaces what is on the canvas. Undo brings it back."
        confirmLabel="Discard and start new"
        onConfirm={startNew}
        onCancel={() => setConfirming(false)}
      />
    </>
  )
}
