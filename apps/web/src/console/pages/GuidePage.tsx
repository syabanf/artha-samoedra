import type { Permission } from '@artha/types'
import { Card, Chip, ChipRow, cn, EmptyState, FOCUS, IconTile, Input, PageHeader } from '@artha/ui'
import {
  ArrowRight,
  Building2,
  ChevronDown,
  Columns3,
  Command,
  FolderLock,
  Handshake,
  Landmark,
  LayoutDashboard,
  MessagesSquare,
  Megaphone,
  MonitorSmartphone,
  PieChart,
  Search,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  UserRound,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../auth/auth'
import { paths } from '../../components/links'

interface Basic {
  icon: LucideIcon
  title: string
  body: string
  to: string
  cta: string
}

const BASICS: Basic[] = [
  {
    icon: LayoutDashboard,
    title: 'Start on the dashboard',
    body: 'It shows what needs you today: listings to review, new inquiries, exclusive rights falling due. Every number opens the records behind it.',
    to: paths.console,
    cta: 'Open dashboard',
  },
  {
    icon: Command,
    title: 'Find anything with ⌘K',
    body: 'Press ⌘K (Ctrl K on Windows) or the search button in the header. Type a code, a name or a page, then press Enter.',
    to: paths.search,
    cta: 'Open search',
  },
  {
    icon: Sparkles,
    title: 'Ask Jessy for a report',
    body: 'Type "laporan penjualan bulan ini" or "how many items are low on stock". Jessy answers from the data your role can see, and any change waits for your Confirm.',
    to: paths.assistant,
    cta: 'Ask Jessy',
  },
  {
    icon: MonitorSmartphone,
    title: 'Work in desktop view',
    body: 'Desktop view opens console pages as windows side by side, handy for comparing a deal with its invoice. The button sits next to search in the header.',
    to: paths.os,
    cta: 'Open desktop',
  },
]

interface Guide {
  id: string
  icon: LucideIcon
  module: string
  task: string
  steps: string[]
  to: string
  needs?: Permission
}

const GUIDES: Guide[] = [
  {
    id: 'listings',
    icon: Building2,
    module: 'Listings',
    task: 'Review and publish a listing',
    steps: [
      'Open Listings and pick a listing with the "In review" badge.',
      'Check the photos, price and certificate, then press Approve.',
      'The listing goes live on the public site, and Jessy can offer it to buyers.',
    ],
    to: paths.listings,
    needs: 'listing.view',
  },
  {
    id: 'inquiries',
    icon: MessagesSquare,
    module: 'Inquiries',
    task: 'Answer a buyer inquiry',
    steps: [
      'Open Inquiries. New ones from the site and from Jessy sit at the top.',
      'Read the chat, assign an agent, and set the status to Contacted.',
      'Turn a serious buyer into a deal with Create deal.',
    ],
    to: paths.inquiries,
    needs: 'inquiry.view',
  },
  {
    id: 'sales',
    icon: Columns3,
    module: 'Sales',
    task: 'Move a deal from quotation to invoice',
    steps: [
      'Drag the deal across the Pipeline as it moves forward.',
      'Create a quotation from the deal. A discount above the limit goes to Approvals.',
      'Once the buyer agrees, mark the deal won and raise the invoice in Finance.',
    ],
    to: paths.pipeline,
    needs: 'deal.view',
  },
  {
    id: 'partners',
    icon: Handshake,
    module: 'Partners',
    task: 'Onboard a supply partner',
    steps: [
      'Open Partners and check the partner\'s documents.',
      'Partners list and delist their own properties through Jessy on the partner dashboard.',
      'Their new listings arrive in Listings for your review.',
    ],
    to: paths.partners,
    needs: 'partner.view',
  },
  {
    id: 'exclusives',
    icon: ShieldCheck,
    module: 'Exclusive rights',
    task: 'Renew an exclusive right before it lapses',
    steps: [
      'The red badge on Exclusive rights counts the rights falling due.',
      'Open the right, contact the seller, and record the renewal or the end date.',
      'The console reminds you again before each due date.',
    ],
    to: paths.exclusives,
    needs: 'exclusive.view',
  },
  {
    id: 'sharing',
    icon: PieChart,
    module: 'Profit sharing',
    task: 'Settle profit sharing for a sold listing',
    steps: [
      'Each listing carries its sharing scheme: who gets which percentage.',
      'When the deal closes, open Settlements and check the split.',
      'Approve the settlement to post the payouts to Finance.',
    ],
    to: paths.sharing,
    needs: 'share.view',
  },
  {
    id: 'content',
    icon: Megaphone,
    module: 'Content',
    task: 'Publish a social post or blog article',
    steps: [
      'Ask the content agent for a draft in Social media or Blog SEO.',
      'Edit the text, check the SEO score, and schedule it on the Content calendar.',
      'A reviewer approves it before it goes out.',
    ],
    to: paths.social,
    needs: 'content.view',
  },
  {
    id: 'finance',
    icon: Landmark,
    module: 'Finance',
    task: 'Issue an invoice and record the payment',
    steps: [
      'Open Receivables, press New invoice, and fill the sheet like a paper invoice.',
      'Issue it. The journal posts by itself.',
      'When the money arrives, record the payment and match it in Cash and bank.',
    ],
    to: paths.invoices,
    needs: 'finance.view',
  },
  {
    id: 'purchasing',
    icon: ShoppingCart,
    module: 'Purchasing',
    task: 'Buy materials from request to stock',
    steps: [
      'Raise a purchase request with the items and quantities.',
      'After approval, turn it into a purchase order for a supplier.',
      'Record the goods receipt when the delivery arrives, and the stock goes up.',
    ],
    to: paths.prs,
    needs: 'purchase.view',
  },
  {
    id: 'people',
    icon: UsersRound,
    module: 'People',
    task: 'Approve leave and run payroll',
    steps: [
      'Open People, then Requests, to approve or reject leave and overtime.',
      'Check attendance for the month.',
      'Run payroll. Each employee then finds a payslip in My space.',
    ],
    to: paths.hrRequests,
    needs: 'hr.view',
  },
  {
    id: 'dataroom',
    icon: FolderLock,
    module: 'Dataroom',
    task: 'Share documents with an outside party',
    steps: [
      'Upload files into a folder of your department.',
      'Create a share link and set an expiry date and a password if needed.',
      'Revoke the link once the party is done. Every open lands in the link\'s log.',
    ],
    to: paths.dataroom,
    needs: 'dataroom.view',
  },
  {
    id: 'me',
    icon: UserRound,
    module: 'My space',
    task: 'Clock in and ask for leave',
    steps: [
      'Open My space and press Clock in when you start work.',
      'Ask for leave or overtime under My requests.',
      'Your manager\'s answer shows as a notification.',
    ],
    to: paths.me,
  },
]

const FAQ: { q: string; a: string }[] = [
  {
    q: 'Why is a button missing?',
    a: 'Your role cannot take that action, so the console hides it. Ask an admin to change your role in Settings.',
  },
  {
    q: 'Why does a button say it is blocked?',
    a: 'The record is not ready for that step, and the message names what is missing, such as an approval or a required field.',
  },
  {
    q: 'Where do I approve things?',
    a: 'Approvals in the menu collects every request waiting for you: quotations, purchases, leave and settlements.',
  },
  {
    q: 'Who changed this record?',
    a: 'Each record keeps its history, and the Audit log lists every change with the person and the time.',
  },
  {
    q: 'I made a mess of the demo data.',
    a: 'Open your account menu at the top right and choose Reset demo data to return to the starting data.',
  },
]

/** How to use the console: the basics, a short walk through each module the role can open, and answers to common questions. */
export function GuidePage() {
  const { can } = useAuth()
  const [query, setQuery] = useState('')
  const [mine, setMine] = useState(true)
  const allowed = (g: Guide) => !g.needs || can(g.needs)
  const visible = mine ? GUIDES.filter(allowed) : GUIDES
  const q = query.trim().toLowerCase()
  const shown = q ? visible.filter((g) => [g.module, g.task, ...g.steps].join(' ').toLowerCase().includes(q)) : visible

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="How to use"
        description="The basics of the console, then step-by-step tasks for each module. Start with the four basics if you are new."
        className="mb-0"
      />

      <section aria-labelledby="basics" className="space-y-3">
        <h2 id="basics" className="text-base font-semibold">
          The basics
        </h2>
        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
          {BASICS.map((b, i) => (
            <li key={b.title}>
              <Card className="flex h-full flex-col p-5">
                <div className="flex items-center justify-between">
                  <IconTile tone="danger" size="sm">
                    <b.icon />
                  </IconTile>
                  <span className="text-xs font-semibold text-muted tabular-nums">Step {i + 1}</span>
                </div>
                <h3 className="mt-4 font-semibold leading-snug">{b.title}</h3>
                <p className="mt-1.5 text-sm text-muted">{b.body}</p>
                <CardLink to={b.to}>{b.cta}</CardLink>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="tasks" className="space-y-3">
        <h2 id="tasks" className="text-base font-semibold">
          Tasks by module
        </h2>
        <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <Input
            icon={<Search />}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks, e.g. invoice, leave, share link"
            aria-label="Search tasks"
            className="sm:flex-1"
          />
          <ChipRow className="shrink-0">
            <Chip active={mine} count={GUIDES.filter(allowed).length} onClick={() => setMine(true)}>
              For my role
            </Chip>
            <Chip active={!mine} count={GUIDES.length} onClick={() => setMine(false)}>
              All modules
            </Chip>
          </ChipRow>
        </Card>
        {shown.length ? (
          <ul className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
            {shown.map((g) => (
              <li key={g.id}>
                <Card className="flex h-full flex-col p-5">
                  <div className="flex items-center gap-3">
                    <IconTile size="sm">
                      <g.icon />
                    </IconTile>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{g.module}</p>
                      <h3 className="font-semibold leading-snug">{g.task}</h3>
                    </div>
                  </div>
                  <ol className="mt-4 space-y-2.5">
                    {g.steps.map((s, i) => (
                      <li key={s} className="flex items-start gap-3 text-sm text-body">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-semibold tabular-nums">
                          {i + 1}
                        </span>
                        <span className="pt-0.5">{s}</span>
                      </li>
                    ))}
                  </ol>
                  {allowed(g) ? (
                    <CardLink to={g.to} divided>
                      Go to {g.module}
                    </CardLink>
                  ) : (
                    <div className="mt-auto pt-4">
                      <p className="border-t border-border pt-3 text-xs text-muted">Your role cannot open {g.module}.</p>
                    </div>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <Card className="p-5">
            <EmptyState
              icon={<Search />}
              title="No task matches"
              description={`Nothing in the guide mentions "${query.trim()}".`}
              action={
                <Chip variant="default" onClick={() => setQuery('')}>
                  Clear search
                </Chip>
              }
            />
          </Card>
        )}
      </section>

      <section aria-labelledby="faq" className="space-y-3">
        <h2 id="faq" className="text-base font-semibold">
          Common questions
        </h2>
        <Card className="divide-y divide-border">
          {FAQ.map((f) => (
            <details key={f.q} className="group px-5 py-4">
              <summary className={cn('flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl text-sm font-semibold', FOCUS)}>
                {f.q}
                <ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-2 text-sm text-muted">{f.a}</p>
            </details>
          ))}
        </Card>
      </section>
    </div>
  )
}

/** The link at the foot of a guide card, pushed to the bottom so links line up across a row. */
function CardLink({ to, divided, children }: { to: string; divided?: boolean; children: ReactNode }) {
  return (
    <div className="mt-auto pt-4">
      <div className={cn(divided && 'border-t border-border pt-3')}>
        <Link to={to} className={cn('inline-flex items-center gap-1.5 rounded-full text-sm font-semibold text-accent-strong hover:underline', FOCUS)}>
          {children}
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </div>
  )
}
