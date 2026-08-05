// Image handoffs between the design editor and the lab, both ways:
// "Edit in Lab" on a selected image block stashes it design→lab, and
// "Send to Design" stashes the lab's rendered output lab→design; the
// receiving shell picks it up on mount. Memory first (a client-side
// route change keeps the JS context alive), sessionStorage as backup so
// a hard refresh mid-navigation still lands the image — best-effort,
// because data URLs can exceed the storage quota.

// imageId threads OBJECT IDENTITY through the round trip: design→lab it
// names the design block being edited; lab→design it names the block to
// REPLACE in place (absent = a lab-first composition, lands as a new
// block). rect is the block's artboard-px size, sent design→lab so the
// lab COMPOSES AT THE SHAPE IT WILL OCCUPY — blocks cover-fit, so a lab
// render authored at the photo's aspect gets center-cropped back into a
// grid-shaped block and every edge effect disappears.
export type LabHandoff = {
  src: string
  name: string
  imageId?: string
  rect?: { w: number; h: number }
}

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
// repeated sends keep updating the same block.
//
// It is BOUND TO THE SOURCE the block handed over (contentHash), and a
// send only honours it while the lab is still working on that source.
// Without that binding, a target left in sessionStorage by an earlier
// Edit in Lab could let a later, unrelated composition overwrite a
// design block. Binding by identity rather than by mount timing also
// survives React's development double-mount, which a "clear whenever no
// handoff arrives" rule would not.
const RETURN_KEY = 'lbs-lab-return-image'

export type LabReturnTarget = { imageId: string; sourceHash?: string }

let returnMem: LabReturnTarget | null = null

export function setLabReturnTarget(target: LabReturnTarget | null): void {
  returnMem = target
  try {
    if (target) sessionStorage.setItem(RETURN_KEY, JSON.stringify(target))
    else sessionStorage.removeItem(RETURN_KEY)
  } catch {
    // storage unavailable — the in-memory copy carries it
  }
}

// Navigation between the two routes keeps ?pristine — a scratch session
// must not dump you into the real one halfway through a round trip.
function keepPristine(path: string): string {
  try {
    return location.search.includes('pristine') ? `${path}?pristine` : path
  } catch {
    return path
  }
}

export const labHref = (): string => keepPristine('/lab')
export const designHref = (): string => keepPristine('/')

// The block a send should replace, or null when this composition is no
// longer the one that block handed over.
export function resolveReturnImageId(currentSourceHash: string | undefined): string | null {
  const target = getLabReturnTarget()
  if (!target) return null
  if (target.sourceHash && target.sourceHash !== currentSourceHash) return null
  return target.imageId
}

export function getLabReturnTarget(): LabReturnTarget | null {
  if (returnMem) return returnMem
  try {
    const raw = sessionStorage.getItem(RETURN_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as LabReturnTarget
    return parsed && typeof parsed.imageId === 'string' ? parsed : null
  } catch {
    return null
  }
}
