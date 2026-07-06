import type { ProjectState } from './types'

// Snapshot history. Project state is 2–4KB of JSON, so whole-state
// snapshots are cheaper than diffing and undo/redo swap wholesale.
const CAP = 100

export class History {
  private past: string[] = []
  private future: string[] = []

  push(before: ProjectState): void {
    this.past.push(JSON.stringify(before))
    if (this.past.length > CAP) this.past.shift()
    this.future = []
  }

  undo(current: ProjectState): ProjectState | null {
    const snap = this.past.pop()
    if (!snap) return null
    this.future.push(JSON.stringify(current))
    return JSON.parse(snap) as ProjectState
  }

  redo(current: ProjectState): ProjectState | null {
    const snap = this.future.pop()
    if (!snap) return null
    this.past.push(JSON.stringify(current))
    return JSON.parse(snap) as ProjectState
  }

  get depth(): { past: number; future: number } {
    return { past: this.past.length, future: this.future.length }
  }

  clear(): void {
    this.past = []
    this.future = []
  }
}
