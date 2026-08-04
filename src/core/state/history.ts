import type { ProjectState } from './types'

// Snapshot history. Project state is 2–4KB of JSON, so whole-state
// snapshots are cheaper than diffing and undo/redo swap wholesale.
// Generic over the snapshot type (defaulting to the editor's project)
// so the research lab can run its own instance over its own state.
const CAP = 100

export class History<T = ProjectState> {
  private past: string[] = []
  private future: string[] = []

  push(before: T): void {
    this.past.push(JSON.stringify(before))
    if (this.past.length > CAP) this.past.shift()
    this.future = []
  }

  undo(current: T): T | null {
    const snap = this.past.pop()
    if (!snap) return null
    this.future.push(JSON.stringify(current))
    return JSON.parse(snap) as T
  }

  redo(current: T): T | null {
    const snap = this.future.pop()
    if (!snap) return null
    this.past.push(JSON.stringify(current))
    return JSON.parse(snap) as T
  }

  get depth(): { past: number; future: number } {
    return { past: this.past.length, future: this.future.length }
  }

  clear(): void {
    this.past = []
    this.future = []
  }
}
