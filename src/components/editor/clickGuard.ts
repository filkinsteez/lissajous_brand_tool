// After a completed drag/marquee/resize gesture the browser still fires
// a click; the artboard's stack-cycling selection must swallow exactly
// that one click or every drag would also re-select. Shared because the
// gesture may end in one layer while the click lands on the artboard.
// Function API rather than a mutable export: assigning to an imported
// object's field from inside a component trips React Compiler's
// immutability rule — calling a module function does not.
let suppress = false

// arm the guard: the NEXT artboard click gets swallowed
export function suppressNextClick(): void {
  suppress = true
}

// read-and-clear: true exactly once after a gesture armed it
export function consumeClickSuppression(): boolean {
  const wasSuppressed = suppress
  suppress = false
  return wasSuppressed
}
