// Editor → Lab handoff: "Edit in Lab" on a selected image block stashes
// the image here, and the lab picks it up on mount. Memory first (a
// client-side route change keeps the JS context alive), sessionStorage
// as backup so a hard refresh mid-navigation still lands the image —
// best-effort, because data URLs can exceed the storage quota.

export type LabHandoff = { src: string; name: string }

const KEY = 'lbs-lab-handoff'
let pending: LabHandoff | null = null

export function setLabHandoff(h: LabHandoff): void {
  pending = h
  try {
    sessionStorage.setItem(KEY, JSON.stringify(h))
  } catch {
    // image too large for sessionStorage — the in-memory copy carries it
  }
}

// read-and-clear: a handoff is consumed exactly once
export function takeLabHandoff(): LabHandoff | null {
  const mem = pending
  pending = null
  try {
    if (mem) {
      sessionStorage.removeItem(KEY)
      return mem
    }
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    sessionStorage.removeItem(KEY)
    const parsed = JSON.parse(raw) as LabHandoff
    return parsed && typeof parsed.src === 'string' && parsed.src ? parsed : null
  } catch {
    return mem
  }
}
