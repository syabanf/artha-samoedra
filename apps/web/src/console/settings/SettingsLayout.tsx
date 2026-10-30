import { Card, IconTile, Kicker } from '@artha/ui'
import { Bell, Send, Building, KeyRound, MessageSquareText, Palette, Plug, ShieldCheck, Users } from 'lucide-react'
import { Link, Outlet, useLocation } from 'react-router'
import { useAuth } from '../../auth/auth'
import { paths } from '../../components/links'
import { SectionNav, type SectionItem } from '../../components/SectionNav'
import { useAppState } from '../../state/store'

const SECTIONS: (SectionItem & { hint: string })[] = [
  { to: paths.users, label: 'Users', icon: Users, hint: 'Invite people, set their role and branch' },
  { to: paths.roles, label: 'Roles', icon: ShieldCheck, hint: 'Which menus and actions each role gets' },
  { to: paths.business, label: 'Business', icon: Building, hint: 'Company details and branch offices' },
  { to: paths.appearance, label: 'Appearance', icon: Palette, hint: 'Accent colour and logo mark' },
  { to: paths.integrations, label: 'Integrations', icon: Plug, hint: 'WhatsApp, Instagram, payments, portals' },
  { to: paths.messaging, label: 'Messaging', icon: MessageSquareText, hint: 'WhatsApp templates and message log' },
  { to: paths.notifications, label: 'Notifications', icon: Bell, hint: 'Who hears about which event, and where' },
  { to: paths.outbox, label: 'Outbox', icon: Send, hint: 'Every notification sent, by channel and status' },
  { to: paths.api, label: 'API', icon: KeyRound, hint: 'Access tokens and endpoint reference' },
]

export function SettingsLayout() {
  const { pathname } = useLocation()
  return (
    <div>
      {pathname !== paths.settings && <SectionNav label="Settings sections" items={SECTIONS} />}
      <Outlet />
    </div>
  )
}

export function SettingsOverviewPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const counts: Record<string, string> = {
    [paths.users]: `${state.users.filter((u) => u.status === 'active').length} active, ${state.users.filter((u) => u.status === 'invited').length} invited`,
    [paths.roles]: `${state.roles.length} roles`,
    [paths.business]: `${state.branches.length} branches`,
    [paths.appearance]: state.appearance.accent,
    [paths.integrations]: `${state.integrations.filter((i) => i.status === 'connected').length} of ${state.integrations.length} connected`,
    [paths.messaging]: `${state.templates.length} templates`,
    [paths.notifications]: `${state.notificationRules.filter((r) => r.enabled).length} rules on`,
    [paths.api]: `${state.apiTokens.filter((t) => !t.revokedAt).length} active tokens`,
  }
  const failing = state.integrations.filter((i) => i.status === 'error')
  return (
    <div className="space-y-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          People, permissions, company details and the services the console talks to.
          {can('audit.view') && (
            <>
              {' '}Every change here lands in the{' '}
              <Link to={paths.audit} className="font-semibold text-accent-strong hover:underline">
                audit log
              </Link>
              .
            </>
          )}
        </p>
      </div>
      {failing.length > 0 && (
        <Card className="p-4 text-sm">
          <span className="font-semibold">Needs attention:</span> {failing.map((i) => `${i.name} (${i.lastError})`).join(' ')}{' '}
          <Link to={paths.integrations} className="font-semibold text-accent-strong hover:underline">
            Open integrations
          </Link>
        </Card>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {SECTIONS.map((s) => (
          <Card key={s.to} className="relative p-5 transition-colors hover:bg-surface-2">
            <IconTile>
              <s.icon />
            </IconTile>
            <h2 className="mt-4 font-semibold">
              <Link to={s.to} className="after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-accent/40">
                {s.label}
              </Link>
            </h2>
            <p className="mt-1 text-sm text-muted">{s.hint}</p>
            <Kicker className="mt-3">{counts[s.to]}</Kicker>
          </Card>
        ))}
      </div>
    </div>
  )
}
