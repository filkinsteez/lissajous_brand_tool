// After a completed drag/marquee/resize gesture the browser still fires
// a click; the artboard's stack-cycling selection must swallow exactly
// that one click or every drag would also re-select. Shared because the
// gesture may end in one layer while the click lands on the artboard.
export const clickGuard = { suppress: false }
