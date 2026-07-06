export type TickFn = (dt: number, t: number) => void

// Drives all per-frame work outside React. rAF when the tab is visible;
// a watchdog interval keeps the loop alive when the page reports
// visibilityState "hidden" (embedded preview panels do this permanently,
// so without the fallback nothing ever renders there).
class RenderController {
  frameCount = 0
  private subs = new Set<TickFn>()
  private lastTick = 0
  private rafId = 0
  private watchdogId: ReturnType<typeof setInterval> | null = null
  private running = false

  start(): void {
    if (this.running || typeof window === 'undefined') return
    this.running = true
    this.lastTick = performance.now()
    const loop = (t: number) => {
      if (!this.running) return
      this.tick(t)
      this.rafId = requestAnimationFrame(loop)
    }
    this.rafId = requestAnimationFrame(loop)
    this.watchdogId = setInterval(() => {
      const now = performance.now()
      if (now - this.lastTick > 100) this.tick(now)
    }, 33)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.rafId)
    if (this.watchdogId) clearInterval(this.watchdogId)
    this.watchdogId = null
  }

  subscribe(fn: TickFn): () => void {
    this.subs.add(fn)
    return () => this.subs.delete(fn)
  }

  private tick(t: number): void {
    const dt = Math.min(0.1, (t - this.lastTick) / 1000)
    this.lastTick = t
    this.frameCount++
    for (const fn of this.subs) fn(dt, t)
  }
}

export const renderController = new RenderController()
