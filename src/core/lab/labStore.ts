import { create } from 'zustand'
import { History } from '@/core/state/history'
import { mergeDeep, type DeepPartial } from '@/core/state/store'
import type { LabState, LabView } from './types'
import { createDefaultLab } from './recipe'

// The lab's own store — same discipline as the editor's (apply = one
// undo entry, setTransient/commitTransient collapse drags, mergeDeep
// patches), but a separate instance with a separate History and a
// separate storage key. Lab edits never touch the editor's undo stack,
// autosave, or URL hash, and the editor never sees the lab.

export type LabPatch = DeepPartial<LabState>

export type LabUiState = {
  view: LabView
  quality: 'live' | 'hq'
  // bumped whenever the module-level source cache changes, so canvas
  // effects re-run without bitmaps entering the store
  sourceNonce: number
  zoom: 'fit' | 'actual'
  note: string
}

export type LabStoreState = {
  lab: LabState
  ui: LabUiState
  historyVersion: number
  setUi: (patch: Partial<LabUiState>) => void
  apply: (patch: LabPatch) => void
  setTransient: (patch: LabPatch) => void
  commitTransient: () => void
  replaceLab: (lab: LabState, opts?: { keepHistory?: boolean }) => void
  undo: () => void
  redo: () => void
}

export const labHistory = new History<LabState>()

let preTransient: LabState | null = null

export const useLabStore = create<LabStoreState>()((set, get) => ({
  lab: createDefaultLab(),
  historyVersion: 0,
  ui: { view: 'composite', quality: 'hq', sourceNonce: 0, zoom: 'fit', note: '' },

  setUi: (patch) => set((s) => ({ ui: { ...s.ui, ...patch } })),

  apply: (patch) => {
    const before = get().lab
    labHistory.push(before)
    set((s) => ({ lab: mergeDeep(before, patch), historyVersion: s.historyVersion + 1 }))
  },

  setTransient: (patch) => {
    if (!preTransient) preTransient = get().lab
    set((s) => ({
      lab: mergeDeep(s.lab, patch),
      ui: s.ui.quality === 'live' ? s.ui : { ...s.ui, quality: 'live' },
    }))
  },

  commitTransient: () => {
    const start = preTransient
    preTransient = null
    const now = get().lab
    if (start && JSON.stringify(start) !== JSON.stringify(now)) labHistory.push(start)
    set((s) => ({
      ui: { ...s.ui, quality: 'hq' },
      historyVersion: s.historyVersion + 1,
    }))
  },

  replaceLab: (lab, opts) => {
    if (!opts?.keepHistory) labHistory.clear()
    preTransient = null
    set((s) => ({ lab, historyVersion: s.historyVersion + 1 }))
  },

  undo: () => {
    const prev = labHistory.undo(get().lab)
    if (prev) set((s) => ({ lab: prev, historyVersion: s.historyVersion + 1 }))
  },

  redo: () => {
    const next = labHistory.redo(get().lab)
    if (next) set((s) => ({ lab: next, historyVersion: s.historyVersion + 1 }))
  },
}))

export const LAB_AUTOSAVE_KEY = 'lbs-lab-autosave'

if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  ;(window as unknown as { __lbsLabStore?: typeof useLabStore }).__lbsLabStore = useLabStore
}
