import { useSyncExternalStore } from 'react'

export const useMediaQuery = (query: string) =>
  useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', cb)
      return () => mql.removeEventListener('change', cb)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )

export const useIsPhone = () => useMediaQuery('(max-width: 767.98px)')
