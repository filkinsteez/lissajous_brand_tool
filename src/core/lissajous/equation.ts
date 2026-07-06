export const TAU = Math.PI * 2

// Base curve in unit space [-1,1]²:  x = sin(a·t + phase), y = sin(b·t)
export type CurveParams = { a: number; b: number; phase: number }

export function unitPos(p: CurveParams, t: number): [number, number] {
  return [Math.sin(p.a * t + p.phase), Math.sin(p.b * t)]
}

export function unitVel(p: CurveParams, t: number): [number, number] {
  return [p.a * Math.cos(p.a * t + p.phase), p.b * Math.cos(p.b * t)]
}

export function unitAcc(p: CurveParams, t: number): [number, number] {
  return [-p.a * p.a * Math.sin(p.a * t + p.phase), -p.b * p.b * Math.sin(p.b * t)]
}
