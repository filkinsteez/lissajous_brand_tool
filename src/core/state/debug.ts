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
  exportPNG: (scale?: 1 | 2 | 4) => Promise<{ bytes: number; width: number; height: number; darkPctByBand: number[] }>
  shareHash: () => Promise<string>
  loadHash: (hash: string) => Promise<boolean>
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
    // export/share verification helpers (dynamic imports avoid cycles)
    exportPNG: async (scale: 1 | 2 | 4 = 1) => {
      const { exportPNG } = await import('@/core/export/png')
      const blob = await exportPNG(useStore.getState().project, scale)
      const bmp = await createImageBitmap(blob)
      // ink coverage per horizontal band — lets verification confirm each
      // layer actually rendered without shipping megabytes of pixels
      const c = document.createElement('canvas')
      c.width = 200
      c.height = 260
      const cx = c.getContext('2d')!
      cx.drawImage(bmp, 0, 0, 200, 260)
      const data = cx.getImageData(0, 0, 200, 260).data
      const bands: number[] = []
      for (let band = 0; band < 10; band++) {
        let dark = 0
        let n = 0
        for (let y = band * 26; y < (band + 1) * 26; y++) {
          for (let x = 0; x < 200; x++) {
            if (data[(y * 200 + x) * 4] < 128) dark++
            n++
          }
        }
        bands.push(Math.round((dark / n) * 1000) / 10)
      }
      // optional: show the actual export on screen for visual verification
      if (typeof window !== 'undefined' && (window as unknown as { __lbsShowExport?: boolean }).__lbsShowExport) {
        const view = document.createElement('canvas')
        const s = Math.min((innerWidth * 0.9) / bmp.width, (innerHeight * 0.9) / bmp.height)
        view.width = Math.round(bmp.width * s)
        view.height = Math.round(bmp.height * s)
        view.style.cssText = 'position:fixed;inset:0;margin:auto;z-index:9999;box-shadow:0 0 0 100vmax rgba(0,0,0,.8)'
        view.dataset.testid = 'export-preview'
        view.getContext('2d')!.drawImage(bmp, 0, 0, view.width, view.height)
        document.body.appendChild(view)
        setTimeout(() => view.remove(), 8000)
      }
      return { bytes: blob.size, width: bmp.width, height: bmp.height, darkPctByBand: bands }
    },
    shareHash: async () => {
      const { encodeShareHash } = await import('./compress')
      return encodeShareHash(useStore.getState().project)
    },
    loadHash: async (hash: string) => {
      const { decodeShareHash } = await import('./compress')
      const loaded = decodeShareHash(hash)
      if (loaded) useStore.getState().replaceProject(loaded)
      return !!loaded
    },
    debug,
  }
}
