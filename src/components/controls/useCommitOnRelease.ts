'use client'

import { useCallback, useEffect, useRef } from 'react'

// DialKit's controls emit a continuous onChange; this app's history wants
// transient-while-dragging plus ONE commit on release. The kit captures
// the pointer, so the release is caught on the window.
//
// Refs are only ever touched inside effects and event handlers — never
// during render — so this stays clean under React 19's rules.
export function useCommitOnRelease(onCommit?: () => void) {
  const latest = useRef<(() => void) | undefined>(undefined)
  const dirty = useRef(false)

  useEffect(() => {
    latest.current = onCommit
  }, [onCommit])

  useEffect(() => {
    const done = () => {
      if (!dirty.current) return
      dirty.current = false
      latest.current?.()
    }
    window.addEventListener('pointerup', done)
    window.addEventListener('keyup', done)
    return () => {
      window.removeEventListener('pointerup', done)
      window.removeEventListener('keyup', done)
    }
  }, [])

  // mark a change as pending — the next release commits it
  const touch = useCallback(() => {
    dirty.current = true
  }, [])

  // commit immediately (discrete edits: a typed value, a reset)
  const commitNow = useCallback(() => {
    dirty.current = false
    latest.current?.()
  }, [])

  return { touch, commitNow }
}
