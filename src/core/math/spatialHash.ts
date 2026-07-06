// Uniform-grid spatial hash. Used by the intersection solver (segment
// buckets) and later by glyph-field min-spacing checks.
export class SpatialHash<T> {
  private buckets = new Map<string, T[]>()

  constructor(private cell: number) {}

  private key(cx: number, cy: number): string {
    return cx + ',' + cy
  }

  insertPoint(x: number, y: number, item: T): void {
    const k = this.key(Math.floor(x / this.cell), Math.floor(y / this.cell))
    const b = this.buckets.get(k)
    if (b) b.push(item)
    else this.buckets.set(k, [item])
  }

  // Insert into every cell covered by the AABB.
  insertRect(minX: number, minY: number, maxX: number, maxY: number, item: T): void {
    const x0 = Math.floor(minX / this.cell)
    const x1 = Math.floor(maxX / this.cell)
    const y0 = Math.floor(minY / this.cell)
    const y1 = Math.floor(maxY / this.cell)
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const k = this.key(cx, cy)
        const b = this.buckets.get(k)
        if (b) b.push(item)
        else this.buckets.set(k, [item])
      }
    }
  }

  queryPoint(x: number, y: number, radius: number): T[] {
    const out: T[] = []
    const x0 = Math.floor((x - radius) / this.cell)
    const x1 = Math.floor((x + radius) / this.cell)
    const y0 = Math.floor((y - radius) / this.cell)
    const y1 = Math.floor((y + radius) / this.cell)
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const b = this.buckets.get(this.key(cx, cy))
        if (b) out.push(...b)
      }
    }
    return out
  }

  forEachBucket(fn: (items: T[]) => void): void {
    for (const b of this.buckets.values()) if (b.length > 1) fn(b)
  }
}
