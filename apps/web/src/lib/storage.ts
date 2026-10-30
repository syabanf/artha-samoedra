import { useState } from 'react'

export const NS = 'artha.web'

export function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

/** Per-viewer preference that survives reloads; storage can be missing, so every access is guarded. */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => readJson<T>(`${NS}.${key}`) ?? initial)
  const set = (next: T) => {
    setValue(next)
    writeJson(`${NS}.${key}`, next)
  }
  return [value, set] as const
}
