// Image handoffs between the design editor and the lab, both ways:
// "Edit in Lab" on a selected image block stashes it design→lab, and
// "Send to Design" stashes the lab's rendered output lab→design; the
// receiving shell picks it up on mount. Memory first (a client-side
// route change keeps the JS context alive), sessionStorage as backup so
// a hard refresh mid-navigation still lands the image — best-effort,
// because data URLs can exceed the storage quota.

// imageId threads OBJECT IDENTITY through the round trip: design→lab it
// names the design block being edited; lab→design it names the block to
// REPLACE in place (absent = a lab-first composition, lands as a new block)
export type LabHandoff = { src: string; name: string; imageId?: string }

function makeChannel(key: string) {
  let pending: LabHandoff | null = null
  return {
    set(h: LabHandoff): void {
      pending = h
      try {
        sessionStorage.setItem(key, JSON.stringify(h))
      } catch {
        // image too large for sessionStorage — the in-memory copy carries it
      }
    },
    // read-and-clear: a handoff is consumed exactly once
    take(): LabHandoff | null {
      const mem = pending
      pending = null
      try {
        if (mem) {
          sessionStorage.removeItem(key)
          return mem
        }
        const raw = sessionStorage.getItem(key)
        if (!raw) return null
        sessionStorage.removeItem(key)
        const parsed = JSON.parse(raw) as LabHandoff
        return parsed && typeof parsed.src === 'string' && parsed.src ? parsed : null
      } catch {
        return mem
      }
    },
  }
}

const toLab = makeChannel('lbs-lab-handoff')
const toDesign = makeChannel('lbs-design-handoff')

export const setLabHandoff = (h: LabHandoff): void => toLab.set(h)
export const takeLabHandoff = (): LabHandoff | null => toLab.take()
export const setDesignHandoff = (h: LabHandoff): void => toDesign.set(h)
export const takeDesignHandoff = (): LabHandoff | null => toDesign.take()

// The design block the CURRENT lab session is editing. Set when EDIT IN
// LAB opens the lab; read (not consumed) by every Send to Design so
// repeated sends keep updating the same block; cleared when a different
// source is loaded into the lab (that session no longer edits the block).
const RETURN_KEY = 'lbs-lab-return-image'
let returnMem: string | null = null

export function setLabReturnTarget(id: string | null): void {
  returnMem = id
  try {
    if (id) sessionStorage.setItem(RETURN_KEY, id)
    else sessionStorage.removeItem(RETURN_KEY)
  } catch {
    // storage unavailable — the in-memory copy carries it
  }
}

export function getLabReturnTarget(): string | null {
  if (returnMem) return returnMem
  try {
    return sessionStorage.getItem(RETURN_KEY)
  } catch {
    return null
  }
}
