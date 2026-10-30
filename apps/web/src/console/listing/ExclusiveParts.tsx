import {
  addDays,
  CONTRACT_MAX_BYTES,
  currentExclusive,
  daysLeft,
  exclusiveBlocker,
  exclusiveState,
  exclusiveStatus,
  fmtDate,
  fmtNumber,
  fromDateInput,
  milestoneTimeline,
  newId,
  nowIso,
  toDateInput,
} from '@artha/fixtures'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, cn, Dialog, DialogFooter, EmptyState, FormField, Input, KeyValue, ProgressBar, Textarea, type BadgeVariant } from '@artha/ui'
import type { ExclusiveDocument, ExclusiveRight, Listing } from '@artha/types'
import { FileText, Paperclip, ShieldCheck, X } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../../auth/auth'
import { ExclusiveBadge } from '../../components/badges'
import { useNow, useScoped } from '../../state/store'
import { useAct, type DialogProps } from '../dialogs'

const fmtFileSize = (bytes: number) => (bytes >= 1_048_576 ? `${fmtNumber(bytes / 1_048_576, 1)} MB` : `${fmtNumber(Math.max(1, Math.round(bytes / 1024)))} KB`)

type StepState = 'sent' | 'skipped' | 'upcoming' | 'missed'
const STEP_VARIANT: Record<StepState, BadgeVariant> = { sent: 'success', skipped: 'muted', upcoming: 'outline', missed: 'muted' }
const STEP_LABEL: Record<StepState, string> = { sent: 'Sent', skipped: 'Skipped', upcoming: 'Upcoming', missed: 'Not sent' }

/** The 30, 7 and 1 day reminders and the end date, with what went out. */
function MilestoneTimeline({ exclusive: e, now }: { exclusive: ExclusiveRight; now: number }) {
  const status = exclusiveStatus(e)
  const steps = milestoneTimeline(e).map((m) => {
    const state: StepState = m.sent ? (m.sent.skipped ? 'skipped' : 'sent') : status === 'active' ? 'upcoming' : 'missed'
    return { key: String(m.days), label: m.days === 1 ? '1 day before' : `${m.days} days before`, date: m.sent && !m.sent.skipped ? m.sent.at : m.due, state }
  })
  const endLabel = status === 'ended' ? 'Ended' : status === 'expired' || Date.parse(e.endsAt) <= now ? 'Expired' : 'Ends'
  return (
    <ol className="space-y-0">
      {steps.map((s) => (
        <li key={s.key} className="relative flex items-center gap-3 pb-3 pl-5 before:absolute before:left-[5px] before:top-3 before:h-full before:w-px before:bg-border">
          <span className={cn('absolute left-0 top-1.5 size-[11px] rounded-full border-2 border-card', s.state === 'sent' ? 'bg-success' : s.state === 'upcoming' ? 'bg-border' : 'bg-silver')} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{s.label}</span>
            <span className="block text-xs text-muted tabular-nums">{fmtDate(s.date)}</span>
          </span>
          <Badge variant={STEP_VARIANT[s.state]}>{STEP_LABEL[s.state]}</Badge>
        </li>
      ))}
      <li className="relative flex items-center gap-3 pl-5">
        <span className={cn('absolute left-0 top-1.5 size-[11px] rounded-full border-2 border-card', endLabel === 'Expired' ? 'bg-accent' : 'bg-ink')} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{endLabel}</span>
          <span className="block text-xs text-muted tabular-nums">{fmtDate(e.endedAt ?? e.endsAt)}</span>
        </span>
      </li>
    </ol>
  )
}

const DocumentLink = ({ doc }: { doc: ExclusiveDocument }) => (
  <a href={doc.dataUrl} download={doc.name} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1.5 font-medium text-accent-strong hover:underline">
    <FileText className="size-3.5 shrink-0" />
    <span className="truncate">{doc.name}</span>
    <span className="shrink-0 text-xs font-normal text-muted">{fmtFileSize(doc.size)}</span>
  </a>
)

/** Exclusive-rights card on the listing detail page. */
export function ExclusiveCard({ listing: l }: { listing: Listing }) {
  const { state } = useScoped()
  const { can } = useAuth()
  const act = useAct()
  const now = useNow()
  const [open, setOpen] = useState(false)
  const exclusive = currentExclusive(state, l.id)
  const exState = exclusive ? exclusiveState(exclusive, now) : null
  const left = exclusive ? daysLeft(exclusive, now) : 0
  return (
    <>
      <Card>
        <CardHeader
          action={
            can('exclusive.manage') &&
            l.status !== 'sold' &&
            l.status !== 'delisted' && (
              <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                {exclusive && !exclusive.endedAt ? 'Edit' : 'Grant exclusive rights'}
              </Button>
            )
          }
        >
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-muted" />
            Exclusive rights
          </CardTitle>
        </CardHeader>
        <CardContent>
          {exclusive && exState ? (
            <div className="space-y-4">
              <ExclusiveBadge state={exState} days={left} />
              <div>
                <ProgressBar
                  tone={exState === 'expired' ? 'accent' : exState === 'due' ? 'warning' : exState === 'ended' ? 'default' : 'success'}
                  value={((now - Date.parse(exclusive.startsAt)) / (Date.parse(exclusive.endsAt) - Date.parse(exclusive.startsAt))) * 100}
                />
                <div className="mt-1.5 flex justify-between text-[11px] text-muted tabular-nums">
                  <span>{fmtDate(exclusive.startsAt)}</span>
                  <span>{fmtDate(exclusive.endsAt)}</span>
                </div>
              </div>
              <KeyValue
                bare
                size="sm"
                items={[
                  { label: 'Contract', value: exclusive.contractNo ? <span className="font-mono text-xs">{exclusive.contractNo}</span> : <span className="text-muted">Not recorded</span> },
                  { label: 'Signed', value: exclusive.signedAt ? fmtDate(exclusive.signedAt) : <span className="text-muted">Not recorded</span> },
                  { label: 'Document', value: exclusive.document ? <DocumentLink doc={exclusive.document} /> : <span className="text-muted">No file attached</span> },
                ]}
              />
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Reminders</div>
                <MilestoneTimeline exclusive={exclusive} now={now} />
              </div>
              {exclusive.note && <p className="text-sm text-muted">{exclusive.note}</p>}
              {can('exclusive.manage') && !exclusive.endedAt && (
                <div className="flex flex-wrap gap-2">
                  {[30, 60, 90].map((d) => (
                    <Button key={d} variant="soft" size="sm" onClick={() => act({ type: 'exclusives/extend', id: exclusive.id, days: d }, `Extended by ${d} days`, l.code)}>
                      +{d} days
                    </Button>
                  ))}
                  <Button variant="ghost" size="sm" onClick={() => act({ type: 'exclusives/end', id: exclusive.id }, 'Exclusive rights ended', l.code)}>
                    End
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <EmptyState compact icon={<ShieldCheck />} title="No exclusive rights" description="Other agents market this asset too." />
          )}
        </CardContent>
      </Card>
      <ExclusiveDialog open={open} onOpenChange={setOpen} editing={exclusive && !exclusive.endedAt ? exclusive : null} listing={l} />
    </>
  )
}

// ---------------------------------------------------------------- exclusive right

export function ExclusiveDialog({
  open,
  onOpenChange,
  editing,
  listing,
}: DialogProps<ExclusiveRight> & { listing: Listing }) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Exclusive rights ${listing.code}` : `Grant exclusive rights ${listing.code}`}
      description="During the exclusive period only Artha Samoedra markets this asset. Jessy reminds the team 30, 7 and 1 day before it ends."
    >
      {open && <ExclusiveForm editing={editing} listing={listing} onDone={() => onOpenChange(false)} />}
    </Dialog>
  )
}

const readDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

function ExclusiveForm({ editing, listing, onDone }: { editing: ExclusiveRight | null; listing: Listing; onDone: () => void }) {
  const act = useAct()
  const start = editing?.startsAt ?? nowIso()
  const [f, setF] = useState({
    startsAt: toDateInput(start),
    endsAt: toDateInput(editing?.endsAt ?? addDays(start, 90)),
    contractNo: editing?.contractNo ?? '',
    signedAt: editing?.signedAt ? toDateInput(editing.signedAt) : '',
    note: editing?.note ?? '',
  })
  const [doc, setDoc] = useState<ExclusiveDocument | null>(editing?.document ?? null)
  const [tried, setTried] = useState(false)
  const draft = { startsAt: fromDateInput(f.startsAt), endsAt: fromDateInput(f.endsAt), document: doc }
  const blocker = exclusiveBlocker(draft)

  const attach = async (file: File | undefined) => {
    if (!file) return
    // Too large files are not read; the size alone lets the blocker explain the limit.
    const dataUrl = file.size > CONTRACT_MAX_BYTES ? '' : await readDataUrl(file)
    setDoc({ name: file.name, type: file.type, size: file.size, dataUrl })
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (blocker) return
        const exclusive: ExclusiveRight = {
          id: editing?.id ?? newId('exc'),
          listingId: listing.id,
          remindDaysBefore: editing?.remindDaysBefore ?? 30,
          endedAt: null,
          lastRemindedAt: editing?.lastRemindedAt ?? null,
          note: f.note.trim(),
          contractNo: f.contractNo.trim(),
          signedAt: f.signedAt ? fromDateInput(f.signedAt) : null,
          ...draft,
        }
        if (act({ type: 'exclusives/upsert', exclusive }, 'Exclusive rights saved', `${listing.code} until ${fmtDate(exclusive.endsAt)}`)) onDone()
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Starts" required>
          <Input type="date" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} />
        </FormField>
        <FormField label="Ends" required>
          <Input type="date" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} />
        </FormField>
        <FormField label="Contract number" hint="Optional">
          <Input value={f.contractNo} placeholder="EXC/010/AS/2026" onChange={(e) => setF({ ...f, contractNo: e.target.value })} />
        </FormField>
        <FormField label="Signed on" hint="Optional">
          <Input type="date" value={f.signedAt} onChange={(e) => setF({ ...f, signedAt: e.target.value })} />
        </FormField>
        <FormField label="Contract document" hint="PDF or image, up to 1 MB" className="sm:col-span-2">
          {doc ? (
            <div className="flex min-w-0 items-center gap-2 rounded-2xl bg-surface-2 px-3 py-2 text-sm">
              <FileText className="size-4 shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate">{doc.name}</span>
              <span className="shrink-0 text-xs text-muted">{fmtFileSize(doc.size)}</span>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove the document" onClick={() => setDoc(null)}>
                <X />
              </Button>
            </div>
          ) : (
            <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-dashed border-border px-3 py-3 text-sm text-muted transition-colors hover:bg-surface-2 focus-within:ring-2 focus-within:ring-accent">
              <Paperclip className="size-4 shrink-0" />
              Attach the signed contract
              <input type="file" accept="application/pdf,image/*" className="sr-only" onChange={(e) => void attach(e.target.files?.[0])} />
            </label>
          )}
        </FormField>
        <FormField label="Note" hint="Optional" className="sm:col-span-2">
          <Textarea className="min-h-20" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </FormField>
      </div>
      {tried && blocker && <p className="mt-3 rounded-xl bg-accent-soft px-3 py-2 text-xs font-medium text-accent-strong">{blocker}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Save exclusive rights</Button>
      </DialogFooter>
    </form>
  )
}
