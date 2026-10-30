import { Card, cn, FOCUS } from '@artha/ui'
import { ArrowRight } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../../auth/auth'
import { useAppState } from '../../state/store'
import { paths } from '../../components/links'
import { Logo } from '../../site/SiteLayout'

export function LoginPage() {
  const { signIn } = useAuth()
  const { state } = useAppState()
  const active = state.users.filter((u) => u.status === 'active')
  const navigate = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from ?? paths.console
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface p-4">
      <Card className="w-full max-w-md p-6 sm:p-8">
        <Link to={paths.home} className={cn('inline-block rounded-xl', FOCUS)}>
          <Logo />
        </Link>
        <h1 className="mt-6 text-3xl font-bold tracking-tight">
          Console sign-in<span className="text-accent">.</span>
        </h1>
        <p className="mt-1 text-sm text-muted">Demo mode: pick a user to see what each role can access.</p>
        <div className="mt-6 space-y-2">
          {active.map((u) => {
            const role = state.roles.find((r) => r.id === u.roleId)
            return (
            <button
              key={u.id}
              type="button"
              onClick={() => {
                signIn(u.id)
                navigate(from, { replace: true })
              }}
              className={cn('flex w-full items-center gap-3 rounded-2xl bg-surface-2 p-3 text-left transition-colors hover:bg-surface', FOCUS)}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-on-ink">
                {u.name.split(' ').map((w) => w[0]).join('')}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">
                  {u.name} · {role?.name}
                </span>
                <span className="block truncate text-xs text-muted">{role?.description}</span>
              </span>
              <ArrowRight className="size-4 text-muted" />
            </button>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
