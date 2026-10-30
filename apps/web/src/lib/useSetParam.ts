import { useSearchParams } from 'react-router'

/** URL search params as filter state: `set` writes or drops one key, `clear` drops all but the keys named in `keep`. */
export const useSetParam = () => {
  const [params, setParams] = useSearchParams()
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const clear = (keep: string[] = []) => setParams(Object.fromEntries(keep.flatMap((k) => (params.get(k) ? [[k, params.get(k)!]] : []))), { replace: true })
  return { params, set, clear }
}
