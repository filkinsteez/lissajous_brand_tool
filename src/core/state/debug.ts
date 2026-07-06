import { history, useStore, type ProjectPatch } from './store'
import type { ProjectState } from './types'
import { renderController } from '@/render/renderController'

// Scripting/verification surface. Later phases append to `debug`
// (intersections, grid, bakeMs, glyphCount, …) via lbsDebug().
type LbsDebug = Record<string, unknown> & { readonly frameCount: number }

export type LbsHook = {
  getState: () => { project: ProjectState; ui: unknown }
  set: (patch: ProjectPatch) => void
  setUi: (patch: Record<string, unknown>) => void
  undo: () => void
  redo: () => void
  historyDepth: () => { past: number; future: number }
  debug: LbsDebug
}

declare global {
  interface Window {
    __lbs?: LbsHook
  }
}

const debugBag: Record<string, unknown> = {}

export function lbsDebug(key: string, value: unknown): void {
  debugBag[key] = value
}

export function installDebugHook(): void {
  if (typeof window === 'undefined') return
  const debug = new Proxy(debugBag, {
    get(target, prop: string) {
      if (prop === 'frameCount') return renderController.frameCount
      return target[prop]
    },
  }) as LbsDebug

  window.__lbs = {
    getState: () => ({ project: useStore.getState().project, ui: useStore.getState().ui }),
    set: (patch) => useStore.getState().apply(patch),
    setUi: (patch) => useStore.getState().setUi(patch),
    undo: () => useStore.getState().undo(),
    redo: () => useStore.getState().redo(),
    historyDepth: () => history.depth,
    debug,
  }
}
