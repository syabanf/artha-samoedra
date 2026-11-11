import { consoleStart, consoleTurn, type AppState, type ConsoleReply, type RecordLink, type RecordLinkKind } from '@artha/fixtures'
import { cn, FOCUS, Sheet } from '@artha/ui'
import { ArrowUpRight, Sparkles } from 'lucide-react'
import { useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Link } from 'react-router'
import { useAuth, useUser } from '../../auth/auth'
import { JessyChat, useJessyChat } from '../../components/JessyChat'
import { paths } from '../../components/links'
import { useAppState } from '../../state/store'

const REPORT_PATH: Record<string, string> = {
  dashboard: paths.console,
  sales: paths.reports,
  finance: paths.financeReports,
  purchasing: paths.purchasingReports,
  people: paths.hrReports,
  listings: paths.listings,
  leads: paths.inquiries,
}

const LINK_PATH: Record<RecordLinkKind, (id: string) => string> = {
  report: (id) => REPORT_PATH[id] ?? paths.console,
  attendance: () => paths.attendance,
  item: (id) => paths.item(id),
  stock: () => paths.stock,
  deal: (id) => paths.deal(id),
  pipeline: () => paths.pipeline,
  candidate: (id) => paths.candidate(id),
  hrRequest: (id) => paths.hrRequest(id),
  pr: (id) => paths.pr(id),
  quotation: (id) => paths.quotation(id),
  invoice: (id) => paths.invoice(id),
  listing: (id) => paths.listing(id),
  exclusives: () => paths.exclusives,
  announcements: () => paths.announcements,
  followUps: () => paths.followUps,
  approvals: () => paths.approvalQueue,
  meRequests: () => paths.meRequests,
  me: () => paths.me,
}

/** The console Jessy chat for the signed-in member: reads run on their permissions, confirmed changes run as them. */
export function useConsoleJessy() {
  const user = useUser()
  const { role } = useAuth()
  return useJessyChat('jessy_console', (s: AppState) => consoleStart(s, { userId: user.id, permissions: role?.permissions ?? [] }), consoleTurn, user.id)
}

function RecordLinks({ links, onFollow }: { links: RecordLink[]; onFollow?: Follow }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {links.map((l) => {
        const to = LINK_PATH[l.kind](l.id ?? '')
        return (
        <Link
          key={`${l.kind}-${l.id ?? ''}-${l.label}`}
          to={to}
          onClick={(e) => onFollow?.(to, e)}
          className={cn('inline-flex h-8 max-w-full items-center gap-1 rounded-full border border-border bg-card px-3 text-xs font-semibold text-body transition-colors hover:bg-surface [&_svg]:size-3.5', FOCUS)}
        >
          <span className="truncate">{l.label}</span>
          <ArrowUpRight className="shrink-0" />
        </Link>
        )
      })}
    </div>
  )
}

/** Runs when a record link is opened; the desktop calls preventDefault and opens the path in a window. */
type Follow = (to: string, e: ReactMouseEvent) => void

/** The chat body shared by the header sheet and the full page. */
export function ConsoleJessyChat({ chat, onFollow, className }: { chat: ReturnType<typeof useConsoleJessy>; onFollow?: Follow; className?: string }) {
  return (
    <JessyChat
      className={className}
      messages={chat.messages}
      typing={chat.typing}
      onSend={chat.send}
      placeholder="Ask for a report, e.g. laporan penjualan bulan ini"
      renderListingLink={() => null}
      renderAfter={(m) => {
        const links = (m as ConsoleReply).links
        return links?.length ? <RecordLinks links={links} onFollow={onFollow} /> : null
      }}
    />
  )
}

/** Header button with the Jessy mark. It opens the chat in a right sheet, a bottom sheet on phones. */
export function AssistantLauncher() {
  const user = useUser()
  // Keyed by user so switching or impersonating starts a fresh conversation with the new permissions.
  return <Launcher key={user.id} />
}

function Launcher() {
  const { state } = useAppState()
  const [open, setOpen] = useState(false)
  // The conversation lives here, so closing the sheet keeps it.
  const chat = useConsoleJessy()
  const name = state.settings.agentName
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Ask ${name}`}
        className={cn(
          'flex size-11 items-center justify-center rounded-full bg-accent-strong text-white shadow-card transition-colors hover:bg-accent-dark [&_svg]:size-[18px]',
          FOCUS,
        )}
      >
        <Sparkles />
      </button>
      <Sheet open={open} onOpenChange={setOpen} title={`Ask ${name}`} description="Answers from live data. Changes wait for your Confirm.">
        <ConsoleJessyChat chat={chat} onFollow={() => setOpen(false)} className="-mx-6 -mb-6 h-[65dvh] md:h-full" />
      </Sheet>
    </>
  )
}
