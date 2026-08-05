import { commitLabSource, decodeLabSourceFile, discardLabSource } from '@/core/lab/sourceCache'
import { setLabReturnTarget } from '@/core/lab/handoff'
import { useLabStore } from '@/core/lab/labStore'
import type { TreatmentId } from '@/core/lab/types'

// Bring a dropped/picked file into the lab: decode + analyze into the
// module cache, then reflect ONLY metadata into the store and bump the
// nonce so canvases re-render. Output dims follow the source (capped),
// which the user can then override in EXPORT.

const OUTPUT_CAP = 2048

// the last file DROPPED wins, not the last decode to finish — a huge
// image dropped first must not overwrite the small one dropped after
let importGen = 0

// Returns the committed source's contentHash, or null if this import
// failed or was superseded. Callers that bind state to "the image that
// just loaded" (the design→lab handoff) MUST gate on that: a swallowed
// failure would otherwise leave them bound to the previous photo.
export async function importLabSource(
  file: File,
  opts?: { fit?: 'contain' | 'cover' },
): Promise<string | null> {
  const store = useLabStore.getState()
  const gen = ++importGen
  // a fresh source severs the link to any design block a previous
  // handoff established — Send to Design must not overwrite a design
  // image with a composition built from a DIFFERENT photo. The handoff
  // consumer re-sets the target right after this import when the source
  // IS the design block's image.
  setLabReturnTarget(null)
  try {
    const src = await decodeLabSourceFile(file)
    if (gen !== importGen) {
      discardLabSource(src)
      return null
    }
    commitLabSource(src)
    // re-read AFTER the await — the pre-decode snapshot can be stale
    const live = useLabStore.getState()
    const k = Math.min(1, OUTPUT_CAP / Math.max(src.fullW, src.fullH))
    // a FIRST image must be visible on the next frame — if no zone
    // shows the photo, take the photo-framing zones. Replacing an
    // image never touches an authored zone stack.
    const firstImage = !live.lab.source
    const bands = live.lab.territory.bands
    const bandsPatch =
      firstImage && !bands.includes('photo')
        ? {
            territory: { bands: ['blocks', 'beads', 'shingle', 'photo'] as TreatmentId[] },
            look: { id: 'frame', strength: 1 },
          }
        : {}
    live.apply({
      ...bandsPatch,
      source: {
        filename: src.filename,
        width: src.fullW,
        height: src.fullH,
        contentHash: src.hash,
        // a handoff import reproduces the framing the design canvas
        // already showed (blocks cover-fit), so it arrives as 'cover'
        fit: opts?.fit ?? live.lab.source?.fit ?? 'contain',
      },
      output: {
        width: Math.max(64, Math.round((src.fullW * k) / 2) * 2),
        height: Math.max(64, Math.round((src.fullH * k) / 2) * 2),
      },
    })
    live.setUi({ sourceNonce: live.ui.sourceNonce + 1, note: '' })
    return src.hash
  } catch (e) {
    store.setUi({ note: e instanceof Error ? e.message : 'Could not load that file.' })
  }
  return null
}
