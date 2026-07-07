import { create } from 'zustand'
import type { ProjectState } from './types'
import { createDefaultProject } from './defaults'
import { History } from './history'

export type EditorMode = 'compose' | 'setup' | 'motion'
export type PanelId = 'compose' | 'motion'
export type Quality = 'live' | 'hq'

export type UiState = {
  mode: EditorMode
  activePanel: PanelId
  quality: Quality
  mounted: boolean
  showGuides: boolean // optional construction guides while composing
  selectedBlockId: string
  dragging: boolean // a type block is being dragged — guides show while true
  systemAdjusting: boolean // a SYSTEM control is being worked — curve reveals itself
  motionPlaying: boolean
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K]
}

export type ProjectPatch = DeepPartial<ProjectState>

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// Arrays (typeBlocks, selectedNodeIds) are replaced wholesale; objects merge.
// A key explicitly present with value undefined CLEARS the field (how
// patches drop presetId when a manual tweak breaks the preset match);
// absent keys fill from base, so partial recipes keep loading. JSON
// parsing can never produce undefined, so deserialization is unaffected.
export function mergeDeep<T>(base: T, patch: DeepPartial<T>): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch as T
  const out: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete out[key]
      continue
    }
    const prev = (base as Record<string, unknown>)[key]
    out[key] = isPlainObject(prev) && isPlainObject(value) ? mergeDeep(prev, value) : value
  }
  return out as T
}

export type StoreState = {
  project: ProjectState
  ui: UiState
  setUi: (patch: Partial<UiState>) => void
  // Discrete change: one history entry per call (toggles, text edits, preset picks).
  apply: (patch: ProjectPatch) => void
  // Continuous change during a drag: no history. Call commitTransient on release.
  setTransient: (patch: ProjectPatch) => void
  commitTransient: () => void
  replaceProject: (project: ProjectState, opts?: { keepHistory?: boolean }) => void
  undo: () => void
  redo: () => void
}

export const history = new History()

// Project state captured when a transient drag begins; committed as one entry.
let preTransient: ProjectState | null = null

export const useStore = create<StoreState>()((set, get) => ({
  project: createDefaultProject(),
  ui: {
    mode: 'compose',
    activePanel: 'compose',
    quality: 'live',
    mounted: false,
    showGuides: false,
    selectedBlockId: 'headline',
    dragging: false,
    systemAdjusting: false,
    motionPlaying: true,
  },

  setUi: (patch) => set((s) => ({ ui: { ...s.ui, ...patch } })),

  apply: (patch) => {
    const before = get().project
    history.push(before)
    set({ project: mergeDeep(before, patch) })
  },

  setTransient: (patch) => {
    const s = get()
    if (!preTransient) preTransient = s.project
    set({ project: mergeDeep(s.project, patch), ui: { ...s.ui, quality: 'live' } })
  },

  commitTransient: () => {
    const s = get()
    if (preTransient && JSON.stringify(preTransient) !== JSON.stringify(s.project)) {
      history.push(preTransient)
    }
    preTransient = null
    set({ ui: { ...s.ui, quality: 'hq' } })
  },

  replaceProject: (project, opts) => {
    if (!opts?.keepHistory) history.clear()
    preTransient = null
    set({ project })
  },

  undo: () => {
    const prev = history.undo(get().project)
    if (prev) set({ project: prev })
  },

  redo: () => {
    const next = history.redo(get().project)
    if (next) set({ project: next })
  },
}))
