import type {
  AssetType,
  BlogPost,
  CarouselSlide,
  ContentStatus,
  Listing,
  ReelScene,
  SocialFormat,
  SocialPlatform,
  SocialPost,
} from '@artha/types'
import { ASSET_TYPE_LABEL, DEAL_TYPE_LABEL, SOCIAL_PLATFORM_LABEL } from '@artha/types'
import { nowMs, toMs } from './clock'
import { fmtArea, fmtIdrShort, newId, slugify } from './format'
import { aiCall } from './gateway'
import { userCan } from './iam'
import { listingLine } from './jessy'
import { patchById, upsert } from './rows'
import type { AppState } from './store'

export type ContentAction =
  | { type: 'social/upsert'; post: SocialPost }
  | { type: 'social/submit'; id: string }
  | { type: 'social/approve'; id: string; by: string }
  | { type: 'social/reject'; id: string; by: string; note: string }
  | { type: 'social/schedule'; id: string; scheduledAt: string }
  | { type: 'social/publish'; id: string }
  | { type: 'social/toDraft'; id: string }
  | { type: 'social/remove'; id: string }
  /** Publishes scheduled posts and articles whose time has come; posts whose integration is down fail. */
  | { type: 'social/publishDue' }
  | { type: 'blog/upsert'; post: BlogPost }
  | { type: 'blog/submit'; id: string }
  | { type: 'blog/approve'; id: string; by: string }
  | { type: 'blog/reject'; id: string; by: string; note: string }
  | { type: 'blog/schedule'; id: string; scheduledAt: string }
  | { type: 'blog/publish'; id: string }
  | { type: 'blog/toDraft'; id: string }

// ---------------------------------------------------------------- formats

export const SOCIAL_FORMAT_LABEL: Record<SocialFormat, string> = { post: 'Post', carousel: 'Carousel', reel: 'Reel script' }

/** The formats each platform takes. TikTok is video only; Facebook and X take single posts. */
export const PLATFORM_FORMATS: Record<SocialPlatform, SocialFormat[]> = {
  instagram: ['post', 'carousel', 'reel'],
  tiktok: ['reel'],
  facebook: ['post'],
  x: ['post'],
}

export const formatLabel = (p: Pick<SocialPost, 'platform' | 'format'>) =>
  p.platform === 'tiktok' ? 'TikTok script' : `${SOCIAL_PLATFORM_LABEL[p.platform]} ${SOCIAL_FORMAT_LABEL[p.format].toLowerCase()}`

const priceText = (l: Listing) => `${fmtIdrShort(l.price)}${l.deal === 'sewa' ? '/year' : ''}`

/** Three hook styles: the rewrite button walks through them. */
const HOOKS: Record<AssetType, (l: Listing) => string> = {
  tanah: (l) => `A ${fmtArea(l.landArea)} plot in ${l.district}, ready to build.`,
  rumah: (l) => `A ${l.bedrooms ?? ''}-bedroom house in ${l.district} for ${fmtIdrShort(l.price)}.`,
  ruko: (l) => `A shophouse in ${l.district} for your next business.`,
  gudang: (l) => `${fmtArea(l.buildingArea ?? l.landArea)} of warehouse in ${l.city} with easy truck access.`,
  villa: (l) => `Villa in ${l.district}: ${l.highlights[0] ?? 'the best view'}.`,
  apartemen: (l) => `A ${l.bedrooms ?? ''}BR unit in ${l.district}, bring a suitcase and move in.`,
}

const hookFor = (l: Listing, variant: number) => {
  const type = ASSET_TYPE_LABEL[l.type].toLowerCase()
  const styles = [
    () => HOOKS[l.type](l),
    () => `Looking for a ${type} in ${l.district}? This one is ${priceText(l)}.`,
    () => `${l.highlights[0] ?? `${l.district}, ${l.city}`}, and the price is ${priceText(l)}.`,
  ]
  return styles[variant % styles.length]().replace(/\s+/g, ' ')
}

const sizeLine = (l: Listing) =>
  [l.buildingArea ? `${fmtArea(l.landArea)} land, ${fmtArea(l.buildingArea)} building` : `${fmtArea(l.landArea)} of land`, l.bedrooms ? `${l.bedrooms} bedrooms` : null]
    .filter(Boolean)
    .join(', ')

const ctaFor = (l: Listing) => `Send ${l.code} by DM to book a site visit.`

/** Cover, location, size, highlights when there are any, then the call to action: 4 or 5 slides. */
export const carouselSlides = (l: Listing, variant = 0): CarouselSlide[] => {
  const slides: CarouselSlide[] = [
    { headline: hookFor(l, variant), line: `${ASSET_TYPE_LABEL[l.type]} ${DEAL_TYPE_LABEL[l.deal].toLowerCase()} · ${priceText(l)}` },
    { headline: `${l.district}, ${l.city}`, line: l.highlights.find((h) => /min|km|near|toll|station|mrt/i.test(h)) ?? l.address },
    { headline: sizeLine(l), line: `${l.certificate} certificate` },
  ]
  if (l.highlights.length) slides.push({ headline: 'Why it stands out', line: l.highlights.join(' · ') })
  slides.push({ headline: `Ask for ${l.code}`, line: 'Send the code by DM or chat with Jessy on arthasamoedra.id.' })
  return slides
}

const AUDIO: Record<AssetType, string> = {
  tanah: 'Uplifting acoustic instrumental',
  rumah: 'Warm lo-fi beat',
  ruko: 'Upbeat trending instrumental',
  gudang: 'Steady corporate beat',
  villa: 'Calm acoustic instrumental',
  apartemen: 'Upbeat city pop instrumental',
}

/** Opening shot, one scene per highlight (up to two), the space, then location: 3 to 5 scenes. */
export const reelScenes = (l: Listing, variant = 0): ReelScene[] => {
  const scenes: ReelScene[] = [
    { shot: l.type === 'tanah' ? 'Drone shot over the plot' : 'Wide shot of the front', onScreen: priceText(l), voiceOver: hookFor(l, variant) },
    ...l.highlights.slice(0, 2).map((h) => ({ shot: `Close-up: ${h.toLowerCase()}`, onScreen: h, voiceOver: `${h}.` })),
    {
      shot: l.type === 'tanah' ? 'Walk the boundary of the plot' : 'Walk through the main space',
      onScreen: sizeLine(l),
      voiceOver: `${sizeLine(l).replace(/^./, (c) => c.toUpperCase())}.`,
    },
    { shot: 'Street view and road access', onScreen: `${l.district}, ${l.city}`, voiceOver: `Find it in ${l.district}, ${l.city}.` },
  ]
  return scenes.slice(0, 5)
}

const tag = (text: string) => `#${slugify(text).replace(/-/g, '')}`

export const draftSocialPost = (
  l: Listing,
  platform: SocialPlatform,
  account: string,
  at: string,
  format: SocialFormat = PLATFORM_FORMATS[platform][0],
  variant = 0,
): SocialPost => {
  const facts = `${ASSET_TYPE_LABEL[l.type]} ${DEAL_TYPE_LABEL[l.deal].toLowerCase()} in ${l.district}, ${l.city}. ${l.highlights.join(' · ')}. Price ${priceText(l)}.`
  const caption =
    format === 'carousel'
      ? `Swipe through ${l.code}: ${l.highlights.slice(0, 2).join(', ').toLowerCase() || l.district}.\n\n${ctaFor(l)}`
      : format === 'reel'
        ? `${facts}\n\nCode ${l.code}. DM us or tap the link in bio to ask.`
        : platform === 'x'
          ? `${facts} Code ${l.code}.`
          : `${facts}\n\nSend ${l.code} by DM or chat on our website to book a site visit.`
  return {
    id: newId('soc'),
    listingId: l.id,
    platform,
    account,
    format,
    hook: hookFor(l, variant),
    caption,
    hashtags: [tag(`${ASSET_TYPE_LABEL[l.type]} ${l.deal === 'sewa' ? 'for rent' : 'for sale'}`), tag(l.city), tag(`${l.city} property`), '#indonesiaproperty'],
    ...(format === 'carousel' ? { slides: carouselSlides(l, variant) } : {}),
    ...(format === 'reel' ? { scenes: reelScenes(l, variant), cta: ctaFor(l), audio: AUDIO[l.type] } : {}),
    status: 'draft',
    scheduledAt: null,
    createdAt: at,
  }
}

/** A fresh take on the same post: keeps its id, account and status. */
export const rewriteSocialPost = (post: SocialPost, l: Listing, variant: number): SocialPost => {
  const next = draftSocialPost(l, post.platform, post.account, post.createdAt, post.format, variant)
  return { ...post, hook: next.hook, caption: next.caption, hashtags: next.hashtags, slides: next.slides, scenes: next.scenes, cta: next.cta, audio: next.audio }
}

/** Everything the model wrote, as one text, for token counts in the gateway log. */
export const socialText = (p: SocialPost) =>
  [
    p.hook,
    p.caption,
    ...(p.slides ?? []).map((s) => `${s.headline}: ${s.line}`),
    ...(p.scenes ?? []).map((s) => `${s.shot} | ${s.onScreen} | ${s.voiceOver}`),
    p.cta,
    p.audio,
    p.hashtags.join(' '),
  ]
    .filter(Boolean)
    .join('\n')

/** The gateway record for one content agent turn. Dispatch it as `ai/logCall` before showing the draft. */
export const contentCall = (s: AppState, purpose: string, input: string, output: string, at: string, tool: 'draft_social_post' | 'draft_blog_post') =>
  aiCall(s, 'content', purpose, input, output, at, { toolCalls: [tool] })

// ---------------------------------------------------------------- blog drafting

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export const draftBlogPost = (topic: string, keyword: string, listings: Listing[], at: string): BlogPost => {
  const kw = keyword.trim().toLowerCase() || topic.toLowerCase()
  const prices = listings.map((l) => l.price)
  const range = prices.length
    ? `Artha Samoedra currently lists ${listings.length} related ${listings.length === 1 ? 'property' : 'properties'}, priced from ${fmtIdrShort(Math.min(...prices))} to ${fmtIdrShort(Math.max(...prices))}.`
    : ''
  const title = cap(topic.trim())
  return {
    id: newId('blg'),
    slug: slugify(topic),
    title,
    metaTitle: `${title} | Artha Samoedra`.slice(0, 60),
    metaDescription: `A guide to ${kw}: price ranges, the documents to check, and verified properties from Artha Samoedra in Indonesia.`.slice(0, 158),
    keywords: [kw, ...listings.slice(0, 2).map((l) => `${ASSET_TYPE_LABEL[l.type].toLowerCase()} ${l.city.toLowerCase()}`)],
    geoSummary: `For ${kw}, start with three checks: verify the certificate at the BPN land office, compare the price per m² with nearby properties, and confirm road access and zoning. ${range}`.trim(),
    excerpt: `What you need to know about ${kw}, written by the Artha Samoedra team from current listing data.`,
    body: [
      `## Summary\nThis article covers ${kw} for buyers and investors. ${range}`,
      `## Related properties\n${listings.map((l) => `- ${listingLine(l)}, ${l.district}`).join('\n') || '- No related properties yet.'}`,
      '## Checklist before you buy\n1. Check the certificate and the latest land tax bill.\n2. Visit the site at rush hour.\n3. Compare the price per m² with 3 nearby properties.\n4. Ask a notary (PPAT) to check for blocks on the title.',
    ].join('\n\n'),
    faq: [
      { q: `What is the price range for ${kw}?`, a: range || 'Prices depend on location, size and legal status.' },
      { q: 'Which documents should I check?', a: 'The certificate, five years of land tax bills, the building permit (IMB or PBG), and the owner ID card.' },
      { q: 'How do I book a site visit?', a: 'Chat with Jessy on the Artha Samoedra website and the sales team contacts you the same day.' },
    ],
    listingIds: listings.map((l) => l.id),
    status: 'draft',
    publishedAt: null,
    createdAt: at,
  }
}

export const blogText = (p: BlogPost) => [p.title, p.metaTitle, p.metaDescription, p.geoSummary, p.excerpt, p.body, ...p.faq.map((f) => `${f.q} ${f.a}`)].join('\n')

export interface SeoCheck {
  label: string
  ok: boolean
  hint: string
}

/** SEO and GEO checklist for the blog editor. */
export const seoChecks = (p: BlogPost): SeoCheck[] => {
  const kw = p.keywords[0]?.toLowerCase() ?? ''
  const geoWords = p.geoSummary.split(/\s+/).filter(Boolean).length
  return [
    { label: 'Meta title of 30 to 60 characters', ok: p.metaTitle.length >= 30 && p.metaTitle.length <= 60, hint: `${p.metaTitle.length} characters` },
    { label: 'Meta description of 120 to 160 characters', ok: p.metaDescription.length >= 120 && p.metaDescription.length <= 160, hint: `${p.metaDescription.length} characters` },
    { label: 'Main keyword appears in the title', ok: !!kw && p.title.toLowerCase().includes(kw), hint: kw || 'Add a keyword' },
    { label: 'GEO summary of 30 to 80 words that answers directly', ok: geoWords >= 30 && geoWords <= 80, hint: `${geoWords} words` },
    { label: 'At least 2 FAQs for the FAQPage schema', ok: p.faq.length >= 2, hint: `${p.faq.length} FAQ` },
    { label: 'Links at least 1 listing', ok: p.listingIds.length > 0, hint: `${p.listingIds.length} listings` },
    { label: 'Uses H2 subheadings', ok: /^## /m.test(p.body), hint: 'Start sections with ## ' },
  ]
}

// ---------------------------------------------------------------- publishing

/** Instagram and Facebook share the Meta integration; X has no publishing integration yet. */
export const PUBLISH_INTEGRATION: Record<SocialPlatform, string | null> = { instagram: 'int-ig', facebook: 'int-ig', tiktok: 'int-tt', x: null }

/** Why the platform cannot take the post right now, or null when its integration is connected. */
export const publishBlocker = (s: AppState, platform: SocialPlatform): string | null => {
  const label = SOCIAL_PLATFORM_LABEL[platform]
  const id = PUBLISH_INTEGRATION[platform]
  if (!id) return `${label} has no publishing integration yet. Copy the caption and post it by hand.`
  const int = s.integrations.find((i) => i.id === id)
  if (!int) return `Add the ${label} integration in Settings before publishing.`
  if (int.status === 'connected') return null
  const via = int.name === label ? int.name : `${label} publishes through ${int.name}, which`
  return `${via} is not connected.${int.lastError ? ` ${int.lastError}` : ' Connect it in Settings, Integrations.'}`
}

const hash = (text: string) => Math.abs([...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7))

/** The id and link the platform returns. The mock derives them from the post so they stay stable. */
export const platformRef = (p: SocialPost, at: string) => {
  const n = String(hash(p.id + at)).padStart(10, '0')
  const handle = p.account.replace(/^@/, '')
  switch (p.platform) {
    case 'tiktok':
      return { platformPostId: `74${n}`, permalink: `https://www.tiktok.com/@${handle}/video/74${n}` }
    case 'facebook':
      return { platformPostId: `fb_${n}`, permalink: `https://www.facebook.com/${handle}/posts/${n}` }
    default:
      return { platformPostId: `ig_${n}`, permalink: `https://www.instagram.com/p/${Number(n).toString(36)}/` }
  }
}

// ---------------------------------------------------------------- calendar

export type CalendarChannel = SocialPlatform | 'blog'

export interface CalendarItem {
  id: string
  kind: 'social' | 'blog'
  channel: CalendarChannel
  title: string
  detail: string
  at: string
  status: ContentStatus
  /** Scheduled and failed items can move to another day. */
  movable: boolean
}

/** Scheduled, failed and published social posts and articles, each on its publish day. */
export const calendarItems = (s: AppState): CalendarItem[] => {
  const code = (id: string | null) => s.listings.find((l) => l.id === id)?.code
  const social = s.socialPosts.flatMap((p): CalendarItem[] => {
    const at = p.status === 'published' ? (p.publishedAt ?? p.scheduledAt) : p.status === 'scheduled' || p.status === 'failed' ? p.scheduledAt : null
    if (!at) return []
    const listing = code(p.listingId)
    return [{ id: p.id, kind: 'social', channel: p.platform, title: p.hook, detail: `${formatLabel(p)} · ${p.account}${listing ? ` · ${listing}` : ''}`, at, status: p.status, movable: p.status !== 'published' }]
  })
  const blog = s.blogPosts.flatMap((p): CalendarItem[] => {
    const at = p.status === 'published' ? p.publishedAt : p.status === 'scheduled' ? (p.scheduledAt ?? null) : null
    return at ? [{ id: p.id, kind: 'blog', channel: 'blog', title: p.title, detail: `Blog article · /blog/${p.slug}`, at, status: p.status, movable: p.status === 'scheduled' }] : []
  })
  return [...social, ...blog].sort((a, b) => a.at.localeCompare(b.at))
}

/** Keeps the time of day and moves the date to `day` (yyyy-mm-dd, local time). */
export const onDay = (iso: string, day: string) => {
  const d = new Date(iso)
  const [y, m, dd] = day.split('-').map(Number)
  d.setFullYear(y, m - 1, dd)
  return d.toISOString()
}

const isDue = (at: string | null | undefined, ms: number) => !!at && toMs(at) <= ms

/** True when the minute job has something to publish. */
export const contentDue = (s: AppState, ms: number) =>
  s.socialPosts.some((p) => p.status === 'scheduled' && isDue(p.scheduledAt, ms)) || s.blogPosts.some((p) => p.status === 'scheduled' && isDue(p.scheduledAt, ms))

// ---------------------------------------------------------------- blockers

/** Approved, scheduled and published social posts are locked; move them back to draft to edit. */
const SOCIAL_LOCKED: ContentStatus[] = ['approved', 'scheduled', 'published']
/** Published articles stay editable so typos can be fixed in place. */
const BLOG_LOCKED: ContentStatus[] = ['approved', 'scheduled']
const PUBLISHABLE: ContentStatus[] = ['approved', 'scheduled', 'failed']

const reviewBlocker = (s: AppState, status: ContentStatus | undefined, by: string, verb: string) => {
  if (!status) return 'Content not found.'
  if (!userCan(s, by, 'content.manage')) return `Only someone with the content manage permission can ${verb} content.`
  return status === 'in_review' ? null : `Only content in review can be ${verb === 'approve' ? 'approved' : 'sent back'}.`
}

const scheduleBlocker = (status: ContentStatus | undefined, iso: string) => {
  if (!status) return 'Content not found.'
  if (!PUBLISHABLE.includes(status)) return status === 'published' ? 'Published content cannot move.' : 'Approve the content before scheduling it.'
  if (Number.isNaN(toMs(iso))) return 'Choose a publish date and time.'
  return toMs(iso) <= nowMs() ? 'Choose a time in the future.' : null
}

/** A published article can come off the website; a published social post already lives on the platform. */
const toDraftBlocker = (status: ContentStatus | undefined, canUnpublish: boolean) =>
  !status ? 'Content not found.' : status === 'published' && !canUnpublish ? 'Published posts stay on the platform. Delete them there.' : status === 'draft' ? 'It is already a draft.' : null

const formatBlocker = (p: SocialPost) => {
  if (!PLATFORM_FORMATS[p.platform].includes(p.format)) return `${SOCIAL_PLATFORM_LABEL[p.platform]} does not take a ${SOCIAL_FORMAT_LABEL[p.format].toLowerCase()}.`
  if (p.format === 'carousel' && ((p.slides?.length ?? 0) < 3 || (p.slides?.length ?? 0) > 6)) return 'A carousel needs 3 to 6 slides.'
  if (p.format === 'reel' && ((p.scenes?.length ?? 0) < 3 || (p.scenes?.length ?? 0) > 5)) return 'A reel script needs 3 to 5 scenes.'
  return p.hook.trim() ? null : 'Write a hook.'
}

export const contentBlocker = (s: AppState, a: ContentAction): string | null => {
  const social = 'id' in a && a.type.startsWith('social/') ? s.socialPosts.find((p) => p.id === a.id) : undefined
  const blog = 'id' in a && a.type.startsWith('blog/') ? s.blogPosts.find((p) => p.id === a.id) : undefined
  switch (a.type) {
    case 'social/upsert': {
      const saved = s.socialPosts.find((p) => p.id === a.post.id)
      if (!saved && a.post.status !== 'draft') return 'New content starts as a draft.'
      if (saved && SOCIAL_LOCKED.includes(saved.status)) return 'Approved content is locked. Move it back to draft to edit it.'
      return formatBlocker(a.post)
    }
    case 'social/submit':
    case 'blog/submit': {
      const status = (social ?? blog)?.status
      if (!status) return 'Content not found.'
      return status === 'draft' ? null : 'Only drafts can go to review.'
    }
    case 'social/approve':
    case 'blog/approve':
      return reviewBlocker(s, (social ?? blog)?.status, a.by, 'approve')
    case 'social/reject':
    case 'blog/reject':
      return reviewBlocker(s, (social ?? blog)?.status, a.by, 'send back') ?? (a.note.trim() ? null : 'Write what needs to change.')
    case 'social/schedule':
    case 'blog/schedule':
      return scheduleBlocker((social ?? blog)?.status, a.scheduledAt)
    case 'social/publish':
      if (!social) return 'Content not found.'
      if (!PUBLISHABLE.includes(social.status)) return social.status === 'published' ? 'This post is already published.' : 'Approve the content before publishing it.'
      return publishBlocker(s, social.platform)
    case 'blog/publish':
      if (!blog) return 'Article not found.'
      if (blog.status === 'published') return 'This article is already published.'
      return PUBLISHABLE.includes(blog.status) ? null : 'Approve the article before publishing it.'
    case 'social/toDraft':
      return toDraftBlocker(social?.status, false)
    case 'blog/toDraft':
      return toDraftBlocker(blog?.status, true)
    case 'social/remove':
      if (!social) return 'Content not found.'
      return social.status === 'published' ? 'Published content stays in the log.' : null
    case 'social/publishDue':
      return contentDue(s, nowMs()) ? null : 'Nothing is due to publish.'
    case 'blog/upsert': {
      const saved = s.blogPosts.find((p) => p.id === a.post.id)
      if (!saved && a.post.status !== 'draft') return 'New content starts as a draft.'
      return saved && BLOG_LOCKED.includes(saved.status) ? 'Approved articles are locked. Move the article back to draft to edit it.' : null
    }
  }
}

// ---------------------------------------------------------------- reducer

const publishPost = (s: AppState, p: SocialPost, at: string): SocialPost => {
  const reason = publishBlocker(s, p.platform)
  return reason ? { ...p, status: 'failed', reviewNote: reason } : { ...p, status: 'published', publishedAt: at, reviewNote: null, ...platformRef(p, at) }
}

const toDraft = <T extends SocialPost | BlogPost>(p: T): T => ({ ...p, status: 'draft', scheduledAt: null, approvedBy: null })

export function contentApply(s: AppState, a: ContentAction, at: string): AppState {
  const social = (id: string, fn: (p: SocialPost) => SocialPost) => ({ ...s, socialPosts: patchById(s.socialPosts, id, fn) })
  const blog = (id: string, fn: (p: BlogPost) => BlogPost) => ({ ...s, blogPosts: patchById(s.blogPosts, id, fn) })
  switch (a.type) {
    case 'social/upsert': {
      // The flow fields only change through the flow actions.
      const saved = s.socialPosts.find((p) => p.id === a.post.id)
      const post = saved ? { ...a.post, status: saved.status, scheduledAt: saved.scheduledAt, approvedBy: saved.approvedBy, reviewNote: saved.reviewNote } : a.post
      return { ...s, socialPosts: upsert(s.socialPosts, post, true) }
    }
    case 'social/submit':
      return social(a.id, (p) => ({ ...p, status: 'in_review', reviewNote: null }))
    case 'social/approve':
      return social(a.id, (p) => ({ ...p, status: 'approved', approvedBy: a.by, reviewNote: null }))
    case 'social/reject':
      return social(a.id, (p) => ({ ...p, status: 'draft', reviewNote: a.note.trim() }))
    case 'social/schedule':
      return social(a.id, (p) => ({ ...p, status: 'scheduled', scheduledAt: a.scheduledAt, reviewNote: null }))
    case 'social/publish':
      return social(a.id, (p) => publishPost(s, p, at))
    case 'social/toDraft':
      return social(a.id, toDraft)
    case 'social/remove':
      return { ...s, socialPosts: s.socialPosts.filter((p) => p.id !== a.id) }
    case 'social/publishDue': {
      const ms = toMs(at)
      return {
        ...s,
        socialPosts: s.socialPosts.map((p) => (p.status === 'scheduled' && isDue(p.scheduledAt, ms) ? publishPost(s, p, p.scheduledAt ?? at) : p)),
        blogPosts: s.blogPosts.map((p) => (p.status === 'scheduled' && isDue(p.scheduledAt, ms) ? { ...p, status: 'published', publishedAt: p.scheduledAt ?? at } : p)),
      }
    }
    case 'blog/upsert': {
      const saved = s.blogPosts.find((p) => p.id === a.post.id)
      const post = saved
        ? { ...a.post, status: saved.status, publishedAt: saved.publishedAt, scheduledAt: saved.scheduledAt, approvedBy: saved.approvedBy, reviewNote: saved.reviewNote }
        : a.post
      return { ...s, blogPosts: upsert(s.blogPosts, post, true) }
    }
    case 'blog/submit':
      return blog(a.id, (p) => ({ ...p, status: 'in_review', reviewNote: null }))
    case 'blog/approve':
      return blog(a.id, (p) => ({ ...p, status: 'approved', approvedBy: a.by, reviewNote: null }))
    case 'blog/reject':
      return blog(a.id, (p) => ({ ...p, status: 'draft', reviewNote: a.note.trim() }))
    case 'blog/schedule':
      return blog(a.id, (p) => ({ ...p, status: 'scheduled', scheduledAt: a.scheduledAt }))
    case 'blog/publish':
      return blog(a.id, (p) => ({ ...p, status: 'published', publishedAt: p.publishedAt ?? at, scheduledAt: null }))
    case 'blog/toDraft':
      return blog(a.id, toDraft)
  }
}
