import { Badge, type BadgeVariant } from '@artha/ui'
import {
  type DealStage,
  type StageKind,
  CONTENT_STATUS_LABEL,
  EXCLUSIVE_STATE_LABEL,
  INQUIRY_STATUS_LABEL,
  LISTING_STATUS_LABEL,
  type ContentStatus,
  type ExclusiveState,
  type InquiryStatus,
  type ListingStatus,
} from '@artha/types'

const LISTING: Record<ListingStatus, BadgeVariant> = {
  review: 'warning',
  active: 'success',
  reserved: 'info',
  sold: 'ink',
  delisted: 'muted',
}
export const ListingStatusBadge = ({ status }: { status: ListingStatus }) => (
  <Badge variant={LISTING[status]} dot={status === 'review'}>
    {LISTING_STATUS_LABEL[status]}
  </Badge>
)

const INQUIRY: Record<InquiryStatus, BadgeVariant> = {
  new: 'accent',
  contacted: 'default',
  survey: 'info',
  negotiation: 'warning',
  won: 'success',
  lost: 'muted',
}
export const InquiryStatusBadge = ({ status }: { status: InquiryStatus }) => (
  <Badge variant={INQUIRY[status]} dot={status === 'new'}>
    {INQUIRY_STATUS_LABEL[status]}
  </Badge>
)

const EXCLUSIVE_VARIANT: Record<ExclusiveState, BadgeVariant> = {
  active: 'success',
  due: 'warning',
  expired: 'accent',
  ended: 'muted',
}
export const ExclusiveBadge = ({ state, days }: { state: ExclusiveState; days?: number }) => (
  <Badge variant={EXCLUSIVE_VARIANT[state]} dot={state === 'due' || state === 'expired'}>
    {EXCLUSIVE_STATE_LABEL[state]}
    {days !== undefined && state !== 'ended' && <span className="tabular-nums">· {days < 0 ? `${-days} d overdue` : `${days} d`}</span>}
  </Badge>
)

const CONTENT: Record<ContentStatus, BadgeVariant> = { draft: 'outline', in_review: 'warning', approved: 'default', scheduled: 'info', published: 'success', failed: 'danger' }
export const ContentStatusBadge = ({ status }: { status: ContentStatus }) => (
  <Badge variant={CONTENT[status]}>{CONTENT_STATUS_LABEL[status]}</Badge>
)

const STAGE_VARIANT: Record<StageKind, BadgeVariant> = { open: 'info', won: 'success', lost: 'muted' }
export const StageBadge = ({ stage }: { stage: DealStage | undefined }) =>
  stage ? <Badge variant={STAGE_VARIANT[stage.kind]}>{stage.name}</Badge> : <Badge variant="muted">No stage</Badge>
