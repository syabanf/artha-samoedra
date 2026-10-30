import { currentStep, employeeName, prsAwaiting, prTotal, requestsAwaiting, fmtAgo, fmtDate, fmtIdrShort, netPrice, payrollTotals, statementTotal, type AppAction } from '@artha/fixtures'
import { LEAVE_TYPE_LABEL, SOCIAL_PLATFORM_LABEL, type Permission } from '@artha/types'
import { Badge, Button, Card, Chip, ChipRow, EmptyState, PageHeader } from '@artha/ui'
import { CircleCheck, CircleX, Inbox } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useAuth, useUser } from '../../auth/auth'
import { paths } from '../../components/links'
import { useScoped } from '../../state/store'
import { useAct } from '../dialogs'

type Kind = 'listing' | 'quotation' | 'referral' | 'statement' | 'content' | 'hr' | 'payroll' | 'purchase'

const KIND_LABEL: Record<Kind, string> = {
  listing: 'Listings',
  quotation: 'Quotations',
  referral: 'Referrals',
  statement: 'Commissions',
  content: 'Content',
  hr: 'Leave, overtime and loans',
  payroll: 'Payroll',
  purchase: 'Purchase requests',
}

/** One pending decision. `approve` and `reject` are store actions; a null reject means the item is only approved here. */
interface Item {
  id: string
  kind: Kind
  /** Null when the queue already picked the item for this user, as with a manager's request approvals. */
  needs: Permission | null
  title: string
  detail: string
  at: string
  to: string
  approve: AppAction
  approveLabel: string
  reject: AppAction | null
}

function useQueue(userId: string): Item[] {
  const { state, actorName, partnerName } = useScoped()
  const { can } = useAuth()
  const contactName = (id: string) => state.contacts.find((c) => c.id === id)?.name ?? 'Unknown contact'
  const listings: Item[] = state.listings
    .filter((l) => l.status === 'review')
    .map((l) => ({
      id: l.id,
      kind: 'listing',
      needs: 'listing.approve',
      title: `${l.code} · ${l.title}`,
      detail: `${partnerName(l.partnerId)} · ${fmtIdrShort(l.price)} · submitted through Jessy`,
      at: l.createdAt,
      to: paths.listing(l.id),
      approve: { type: 'listings/approve', id: l.id },
      approveLabel: 'Approve and publish',
      reject: null,
    }))
  const quotations: Item[] = state.quotations
    .filter((q) => q.status === 'pending_approval')
    .map((q) => {
      const deal = state.deals.find((d) => d.id === q.dealId)
      return {
        id: q.id,
        kind: 'quotation',
        needs: 'deal.approve',
        title: `${q.code} · ${deal?.title ?? 'Deal'}`,
        detail: `${q.discountPct}% off, net ${fmtIdrShort(netPrice(q))} · by ${actorName(q.createdBy)}`,
        at: q.createdAt,
        to: paths.quotation(q.id),
        approve: { type: 'quotations/approve', id: q.id },
        approveLabel: 'Approve',
        reject: { type: 'quotations/reject', id: q.id },
      }
    })
  const referrals: Item[] = state.referrals
    .filter((r) => r.status === 'pending')
    .map((r) => ({
      id: r.id,
      kind: 'referral',
      needs: 'referral.manage',
      title: `Referral reward ${fmtIdrShort(r.reward)}`,
      detail: `${r.referrer.type === 'partner' ? partnerName(r.referrer.id) : contactName(r.referrer.id)} referred ${contactName(r.contactId)}`,
      at: r.createdAt,
      to: paths.referrals,
      approve: { type: 'referrals/setStatus', id: r.id, status: 'approved' },
      approveLabel: 'Approve',
      reject: { type: 'referrals/setStatus', id: r.id, status: 'rejected' },
    }))
  const statements: Item[] = state.statements
    .filter((st) => st.status === 'draft')
    .map((st) => ({
      id: st.id,
      kind: 'statement',
      needs: 'commission.manage',
      title: `${st.code} · ${actorName(st.agentId)}`,
      detail: `${st.month} · ${st.lines.length} ${st.lines.length === 1 ? 'deal' : 'deals'} · ${fmtIdrShort(statementTotal(st))}`,
      at: st.createdAt,
      to: paths.commission(st.id),
      approve: { type: 'statements/approve', id: st.id },
      approveLabel: 'Approve',
      reject: null,
    }))
  const content: Item[] = [
    ...state.socialPosts
      .filter((p) => p.status === 'in_review')
      .map((p): Item => ({
        id: p.id,
        kind: 'content',
        needs: 'content.manage',
        title: `${SOCIAL_PLATFORM_LABEL[p.platform]} · ${p.account}`,
        detail: p.hook,
        at: p.createdAt,
        to: paths.social,
        approve: { type: 'social/approve', id: p.id, by: userId },
        approveLabel: 'Approve',
        reject: { type: 'social/reject', id: p.id, by: userId, note: 'Sent back from the approval queue.' },
      })),
    ...state.blogPosts
      .filter((p) => p.status === 'in_review')
      .map((p): Item => ({
        id: p.id,
        kind: 'content',
        needs: 'content.manage',
        title: `Article · ${p.title}`,
        detail: p.metaDescription,
        at: p.createdAt,
        to: paths.blogEdit(p.id),
        approve: { type: 'blog/approve', id: p.id, by: userId },
        approveLabel: 'Approve',
        reject: { type: 'blog/reject', id: p.id, by: userId, note: 'Sent back from the approval queue.' },
      })),
  ]
  const hr: Item[] = requestsAwaiting(state, userId, can('request.approve')).flatMap((r): Item[] => {
    const step = currentStep(r)!
    const detail = r.leave
      ? `${LEAVE_TYPE_LABEL[r.leave.type]}, ${r.leave.days} ${r.leave.days === 1 ? 'day' : 'days'} from ${fmtDate(r.leave.from)}`
      : r.overtime
        ? `Overtime ${r.overtime.hours} h on ${fmtDate(r.overtime.date)}`
        : `Loan ${fmtIdrShort(r.loan?.amount ?? 0)} over ${r.loan?.installments} months`
    return [
      {
        id: r.id,
        kind: 'hr',
        needs: null,
        title: `${r.code} · ${employeeName(state, r.employeeId)}`,
        detail: `${detail} · ${step.label} approval`,
        at: r.createdAt,
        to: paths.hrRequest(r.id),
        approve: { type: 'hrRequests/decide', id: r.id, decision: 'approved', note: '', by: userId },
        approveLabel: 'Approve',
        reject: null,
      },
    ]
  })
  const payroll: Item[] = state.payrollRuns
    .filter((r) => r.status === 'draft')
    .map((r) => ({
      id: r.id,
      kind: 'payroll',
      needs: 'payroll.manage',
      title: `${r.code} · ${r.slips.length} employees`,
      detail: `Net pay ${fmtIdrShort(payrollTotals(r.slips).net)}`,
      at: r.calculatedAt,
      to: paths.payrollRun(r.id),
      approve: { type: 'payroll/approve', id: r.id },
      approveLabel: 'Approve',
      reject: null,
    }))
  const purchase: Item[] = prsAwaiting(state, userId, can('purchase.approve')).map((r) => ({
    id: r.id,
    kind: 'purchase',
    needs: null,
    title: `${r.code} · ${employeeName(state, r.requesterId)}`,
    detail: `${r.lines.length} ${r.lines.length === 1 ? 'item' : 'items'}, about ${fmtIdrShort(prTotal(r))} · ${currentStep(r)!.label} approval`,
    at: r.createdAt,
    to: paths.pr(r.id),
    approve: { type: 'prs/decide', id: r.id, decision: 'approved', note: '', by: userId },
    approveLabel: 'Approve',
    reject: null,
  }))
  return [...listings, ...quotations, ...referrals, ...statements, ...content, ...hr, ...payroll, ...purchase].sort((a, b) => a.at.localeCompare(b.at))
}

export function ApprovalQueuePage() {
  const { can } = useAuth()
  const user = useUser()
  const act = useAct()
  const all = useQueue(user.id).filter((i) => !i.needs || can(i.needs))
  const [kind, setKind] = useState<Kind | null>(null)
  const rows = all.filter((i) => !kind || i.kind === kind)
  const count = (k: Kind) => all.filter((i) => i.kind === k).length

  return (
    <div className="space-y-4">
      <PageHeader
        title="Approvals"
        description="Every decision waiting on you, oldest first: partner listings, discounted quotations, referral rewards, commission statements, content, staff requests, payroll and purchase requests. You see only the kinds your role can approve."
        className="mb-2"
      />
      <ChipRow>
        <Chip active={!kind} count={all.length} onClick={() => setKind(null)}>
          All
        </Chip>
        {(Object.keys(KIND_LABEL) as Kind[])
          .filter((k) => count(k) > 0 || kind === k)
          .map((k) => (
            <Chip key={k} active={kind === k} count={count(k)} onClick={() => setKind(kind === k ? null : k)}>
              {KIND_LABEL[k]}
            </Chip>
          ))}
      </ChipRow>
      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Inbox />}
            title={all.length ? 'Nothing waiting of this kind' : 'Nothing waiting for approval'}
            description="Partner listings, quotations above the discount limit, referral rewards and draft commission statements appear here."
            action={kind ? <Button variant="outline" size="sm" onClick={() => setKind(null)}>Show all</Button> : undefined}
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {rows.map((i) => (
            <QueueRow key={`${i.kind}-${i.id}`} item={i} onDecide={(action, label) => act(action, label, i.title)}>
              <Badge variant="muted">{KIND_LABEL[i.kind]}</Badge>
            </QueueRow>
          ))}
        </ul>
      )}
    </div>
  )
}

function QueueRow({ item: i, onDecide, children }: { item: Item; onDecide: (a: AppAction, label: string) => void; children: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-card bg-card p-4 shadow-card">
      <div className="min-w-[14rem] flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {children}
          <span className="text-xs text-muted">waiting {fmtAgo(i.at)}</span>
        </div>
        <Link to={i.to} className="mt-1 block truncate font-semibold hover:text-accent">
          {i.title}
        </Link>
        <p className="truncate text-sm text-muted">{i.detail}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {i.reject && (
          <Button variant="outline" size="sm" onClick={() => onDecide(i.reject!, 'Rejected')}>
            <CircleX />
            Reject
          </Button>
        )}
        <Button size="sm" onClick={() => onDecide(i.approve, 'Approved')}>
          <CircleCheck />
          {i.approveLabel}
        </Button>
      </div>
    </li>
  )
}
