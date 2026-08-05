// Image import: downscale to a sane poster resolution and re-encode as a
// JPEG data URL, so autosave and undo history stay small. Share links
// strip images entirely (see compress.ts).
export async function importImageFile(file: File, maxDim = 1600): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('image decode failed'))
      el.src = url
    })
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * scale))
    const h = Math.max(1, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2d context unavailable')
    ctx.drawImage(img, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', 0.85)
  } finally {
    URL.revokeObjectURL(url)
  }
}

// Same discipline for an image that arrives as a data URL rather than a
// File — the lab's Send to Design hands over a multi-megabyte PNG, and
// project state is snapshotted into undo history and localStorage on
// every edit. Returns { src, aspect } because the caller needs the true
// aspect and the re-encode is where we already have the dimensions.
// Falls back to the original src if anything fails: a heavy image beats
// a lost one.
export async function importImageDataUrl(
  dataUrl: string,
  maxDim = 1600,
): Promise<{ src: string; aspect: number }> {
  try {
    const img = await loadImage(dataUrl)
    const nw = Math.max(1, img.naturalWidth)
    const nh = Math.max(1, img.naturalHeight)
    const aspect = nw / nh
    const scale = Math.min(1, maxDim / Math.max(nw, nh))
    const w = Math.max(1, Math.round(nw * scale))
    const h = Math.max(1, Math.round(nh * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return { src: dataUrl, aspect }
    ctx.drawImage(img, 0, 0, w, h)
    // PNG, not JPEG: lab compositions can carry real transparency, and
    // JPEG would both lose it and mush the hard treatment edges
    return { src: canvas.toDataURL('image/png'), aspect }
  } catch {
    return { src: dataUrl, aspect: 0 }
  }
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('image decode failed'))
    el.src = src
  })
}
