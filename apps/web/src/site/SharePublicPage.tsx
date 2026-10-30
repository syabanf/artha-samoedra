import { blockerFor, failedTries, fmtDate, fmtFileSize, SHARE_MAX_TRIES, shareByToken, shareCodeMatches, shareFiles, type AppState } from '@artha/fixtures'
import type { DataFile, ShareLink } from '@artha/types'
import { Button, Card, Dialog, EmptyState, FormField, Input, Kicker } from '@artha/ui'
import { Download, Eye, FolderOpen, Link2Off, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { FileGlyph, FilePreview } from '../console/dataroom/parts'
import { paths } from '../components/links'
import { useDocumentMeta } from '../lib/meta'
import { useAppState } from '../state/store'
import { SiteContainer } from './SiteLayout'

const openKey = (token: string) => `artha-share-open:${token}`
const wasOpened = (token: string) => {
  try {
    return sessionStorage.getItem(openKey(token)) === '1'
  } catch {
    return false
  }
}
const rememberOpened = (token: string) => {
  try {
    sessionStorage.setItem(openKey(token), '1')
  } catch {
    // Private mode: the recipient enters the code again next time.
  }
}

/** Seeded files have no content, so the download is a short text file that names the original. */
const saveFile = (file: DataFile) => {
  const a = document.createElement('a')
  let blobUrl: string | null = null
  if (file.dataUrl) {
    a.href = file.dataUrl
    a.download = file.name
  } else {
    blobUrl = URL.createObjectURL(new Blob([`${file.name}\n\nDemo placeholder. In production this download is the original file.\n`], { type: 'text/plain' }))
    a.href = blobUrl
    a.download = `${file.name}.txt`
  }
  a.click()
  if (blobUrl) setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
}

/** A slim band in place of the site navigation: who is sharing and that the page is private. */
const SecureBand = () => (
  <div className="flex items-center gap-2 text-xs font-medium text-muted">
    <ShieldCheck className="size-4 text-success" />
    Private share from Artha Samoedra
  </div>
)

/** The accent period is skipped when the name already ends in one ("S.H."). */
const ShareTitle = ({ name }: { name: string }) => (
  <h1 className="mt-2 font-display text-4xl font-medium leading-tight tracking-tight">
    Documents for {name}
    {!name.endsWith('.') && <span className="text-accent">.</span>}
  </h1>
)

export function SharePublicPage() {
  const { token = '' } = useParams()
  const { state } = useAppState()
  const link = shareByToken(state, token)
  const [opened, setOpened] = useState(() => wasOpened(token))
  useDocumentMeta('Shared documents · Artha Samoedra')

  if (!link) {
    return (
      <SiteContainer className="pt-10">
        <h1 className="sr-only">Share link not found</h1>
        <Card className="mx-auto max-w-lg">
          <EmptyState icon={<Link2Off />} title="Share link not found" description="Check the link in your email, or ask the sender to send it again." />
        </Card>
      </SiteContainer>
    )
  }

  // Revoked, expired and locked links show the store's reason, even after a successful open.
  const closed = blockerFor(state, { type: 'shareLinks/open', id: link.id, email: '', code: '' })

  return (
    <SiteContainer className="pt-8">
      <div className="mx-auto max-w-3xl">
        <SecureBand />
        {closed ? <ClosedState reason={closed} /> : opened ? <OpenShare link={link} /> : <Gate link={link} onOpen={() => setOpened(true)} />}
      </div>
    </SiteContainer>
  )
}

function ClosedState({ reason }: { reason: string }) {
  return (
    <Card className="mt-4 p-6 sm:p-8">
      <span className="flex size-12 items-center justify-center rounded-full bg-surface-2 text-muted [&_svg]:size-6">
        <LockKeyhole />
      </span>
      <h1 className="mt-4 font-display text-3xl font-medium leading-tight tracking-tight">This link is closed</h1>
      <p className="mt-2 max-w-md text-sm text-muted">{reason}</p>
      <Button variant="outline" size="sm" className="mt-6" asChild>
        <Link to={paths.home}>Visit the Artha Samoedra website</Link>
      </Button>
    </Card>
  )
}

function Gate({ link, onOpen }: { link: ShareLink; onOpen: () => void }) {
  const { state, dispatch } = useAppState()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [tried, setTried] = useState(false)
  const [wrong, setWrong] = useState(false)
  const errors = {
    email: /^\S+@\S+\.\S+$/.test(email.trim()) ? null : 'Enter the email the link was sent to.',
    code: /^\d{6}$/.test(code.trim()) ? null : 'Enter the 6-digit code from the email.',
  }
  const show = (m: string | null) => (tried ? (m ?? undefined) : undefined)
  const triesLeft = SHARE_MAX_TRIES - failedTries(state, link.id)

  return (
    <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0 pt-2">
        <Kicker>Shared documents</Kicker>
        <ShareTitle name={link.recipientName} />
        <p className="mt-3 max-w-sm text-sm text-muted">Enter your email and the 6-digit code from the email we sent you. The code keeps these files private to you.</p>
      </div>
      <Card className="p-6">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            setTried(true)
            if (errors.email || errors.code) return
            // The refusal covers revoked, expired and locked links; the page re-renders into the closed state.
            if (dispatch({ type: 'shareLinks/open', id: link.id, email, code }, 'public')) return
            if (!shareCodeMatches(link, email, code)) return setWrong(true)
            rememberOpened(link.token)
            onOpen()
          }}
        >
          <h2 className="text-base font-semibold">Open the files</h2>
          <div className="mt-4 space-y-4">
            <FormField label="Email" required error={show(errors.email)}>
              <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </FormField>
            <FormField label="Access code" required error={show(errors.code)}>
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="6 digits"
                className={code ? 'tracking-[0.3em] tabular-nums' : undefined}
              />
            </FormField>
          </div>
          {wrong && (
            <p role="alert" className="mt-4 rounded-xl bg-accent-soft px-3 py-2 text-xs font-medium text-accent-strong">
              The email or code does not match. {triesLeft} {triesLeft === 1 ? 'try' : 'tries'} left before the link locks.
            </p>
          )}
          <Button type="submit" className="mt-6 w-full">
            Open files
          </Button>
        </form>
      </Card>
    </div>
  )
}

const groupByFolder = (s: AppState, files: DataFile[]) => {
  const groups = new Map<string, DataFile[]>()
  for (const f of files) groups.set(f.folderId, [...(groups.get(f.folderId) ?? []), f])
  return [...groups].map(([id, list]) => ({ id, name: s.dataFolders.find((x) => x.id === id)?.name ?? 'Files', files: list.sort((a, b) => a.name.localeCompare(b.name)) }))
}

function OpenShare({ link }: { link: ShareLink }) {
  const { state, dispatch } = useAppState()
  const [viewing, setViewing] = useState<DataFile | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  const sender = state.users.find((u) => u.id === link.createdBy)?.name ?? 'Artha Samoedra'
  const groups = groupByFolder(state, shareFiles(state, link))

  const track = (file: DataFile, kind: 'viewed' | 'downloaded') => {
    const refused = dispatch({ type: 'shareLinks/track', id: link.id, kind, fileId: file.id }, 'public')
    setRefusal(refused)
    return !refused
  }

  return (
    <div className="mt-4 space-y-4">
      <div>
        <Kicker>Shared documents</Kicker>
        <ShareTitle name={link.recipientName} />
      </div>
      <Card variant="ink" className="p-5">
        <div className="text-xs text-on-ink-muted">From {sender}, Artha Samoedra</div>
        {link.message && <p className="mt-2 text-sm">{link.message}</p>}
        <p className="mt-3 text-xs text-on-ink-muted">
          Open until {fmtDate(link.expiresAt)} · {link.allowDownload ? 'View and download' : 'View only'}
        </p>
      </Card>
      {refusal && (
        <p role="alert" className="rounded-xl bg-accent-soft px-3 py-2 text-xs font-medium text-accent-strong">
          {refusal}
        </p>
      )}
      {groups.length === 0 && (
        <Card>
          <EmptyState compact title="No files yet" description="The sender has not added files to this share. Ask them to upload and send the link again." />
        </Card>
      )}
      {groups.map((g) => (
        <Card key={g.id} className="p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <FolderOpen className="size-4 text-muted" />
            <span className="min-w-0 truncate">{g.name}</span>
          </h2>
          <ul className="mt-3 space-y-2">
            {g.files.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface-2 p-3">
                <FileGlyph file={f} className="bg-card" />
                <span className="min-w-0 flex-1 basis-48">
                  <span className="block truncate text-sm font-semibold">{f.name}</span>
                  <span className="block text-xs text-muted">
                    {fmtFileSize(f.size)} · added {fmtDate(f.uploadedAt)}
                  </span>
                </span>
                <span className="flex gap-2 max-sm:w-full max-sm:pl-[52px]">
                  <Button variant="outline" size="sm" onClick={() => track(f, 'viewed') && setViewing(f)}>
                    <Eye />
                    View
                  </Button>
                  {link.allowDownload && (
                    <Button variant="outline" size="sm" aria-label={`Download ${f.name}`} onClick={() => track(f, 'downloaded') && saveFile(f)}>
                      <Download />
                      Download
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ))}
      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)} size="lg" title={viewing?.name ?? ''} description={link.allowDownload ? undefined : 'The sender allowed viewing only.'}>
        {viewing && <FilePreview file={viewing} />}
      </Dialog>
    </div>
  )
}
