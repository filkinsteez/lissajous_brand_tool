'use client'

import { useSyncExternalStore } from 'react'

// A cross-route link that carries ?pristine when the current session is
// a scratch one. The flag only exists on the client, so this reads it
// through useSyncExternalStore: React takes the SERVER snapshot (false)
// while hydrating and the client snapshot afterwards, which is the
// hydration-safe way to render a client-only value. Reading location
// during render instead makes the server say /lab and the client say
// /lab?pristine, and React discards the client attribute.

// the flag is fixed for the life of a page load — nothing to subscribe to
const noop = () => () => {}
const clientSnapshot = () => window.location.search.includes('pristine')
const serverSnapshot = () => false

export function usePristineHref(path: string): string {
  const pristine = useSyncExternalStore(noop, clientSnapshot, serverSnapshot)
  return pristine ? `${path}?pristine` : path
}
