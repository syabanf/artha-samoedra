import { Button, Input } from '@artha/ui'
import { Search, X } from 'lucide-react'

/** Pill search for list filters; clearing hands back null so the URL param drops. */
export function SearchBox({ value, onChange, label, placeholder }: { value: string; onChange: (v: string | null) => void; label: string; placeholder: string }) {
  return (
    <Input
      variant="pill"
      icon={<Search />}
      aria-label={label}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="min-w-0 flex-1 sm:w-72 sm:flex-none"
      right={value ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => onChange(null)}><X /></Button> : undefined}
    />
  )
}
