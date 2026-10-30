import { Button } from '@artha/ui'
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router'

/** Goes back when the user arrived from inside the app, otherwise to the list. */
export function BackButton({ fallback }: { fallback: string }) {
  const navigate = useNavigate()
  const inApp = ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0
  return (
    <Button variant="ghost" size="sm" className="-ml-1 print:hidden" onClick={() => (inApp ? navigate(-1) : navigate(fallback))}>
      <ArrowLeft />
      Back
    </Button>
  )
}
