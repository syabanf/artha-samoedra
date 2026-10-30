import type { Permission } from '@artha/types'
import {
  Building2,
  Handshake,
  LayoutDashboard,
  Megaphone,
  MessagesSquare,
  Newspaper,
  PieChart,
  Columns3,
  Cpu,
  CalendarRange,
  Inbox,
  Landmark,
  UsersRound,
  ShoppingCart,
  Warehouse,
  Contact,
  ScrollText,
  Settings,
  ShieldCheck,
  FolderLock,
  MonitorSmartphone,
  UserRound,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { paths } from '../../components/links'

export type BadgeKey = 'review' | 'newInquiries' | 'exclusiveDue'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  badge?: BadgeKey
  /** Hidden from roles without it. */
  needs?: Permission
  end?: boolean
}

export const NAV: NavItem[] = [
  { to: paths.console, label: 'Dashboard', icon: LayoutDashboard, end: true, needs: 'dashboard.view' },
  { to: paths.me, label: 'My space', icon: UserRound },
  { to: paths.os, label: 'Desktop', icon: MonitorSmartphone },
  { to: paths.listings, label: 'Listings', icon: Building2, badge: 'review', needs: 'listing.view' },
  { to: paths.inquiries, label: 'Inquiries', icon: MessagesSquare, badge: 'newInquiries', needs: 'inquiry.view' },
  { to: paths.sales, label: 'Sales', icon: Columns3, needs: 'deal.view' },
  { to: paths.crm, label: 'CRM', icon: Contact, needs: 'crm.view' },
  { to: paths.ops, label: 'Operations', icon: Warehouse, needs: 'ops.view' },
  { to: paths.finance, label: 'Finance', icon: Landmark, needs: 'finance.view' },
  { to: paths.people, label: 'People', icon: UsersRound, needs: 'hr.view' },
  { to: paths.purchasing, label: 'Purchasing', icon: ShoppingCart, needs: 'purchase.view' },
  { to: paths.dataroom, label: 'Dataroom', icon: FolderLock, needs: 'dataroom.view' },
  { to: paths.partners, label: 'Partners', icon: Handshake, needs: 'partner.view' },
  { to: paths.exclusives, label: 'Exclusive rights', icon: ShieldCheck, badge: 'exclusiveDue', needs: 'exclusive.view' },
  { to: paths.sharing, label: 'Profit sharing', icon: PieChart, needs: 'share.view' },
  { to: paths.social, label: 'Social media', icon: Megaphone, needs: 'content.view' },
  { to: paths.blogAdmin, label: 'Blog SEO', icon: Newspaper, needs: 'content.view' },
  { to: paths.contentCalendar, label: 'Content calendar', icon: CalendarRange, needs: 'content.view' },
  { to: paths.approvalQueue, label: 'Approvals', icon: Inbox, needs: 'dashboard.view' },
  { to: paths.jessy, label: 'Jessy', icon: Sparkles, needs: 'jessy.view' },
  { to: paths.ai, label: 'AI gateway', icon: Cpu, needs: 'jessy.view' },
  { to: paths.audit, label: 'Audit log', icon: ScrollText, needs: 'audit.view' },
  { to: paths.settings, label: 'Settings', icon: Settings, needs: 'settings.view' },
]

export const PHONE_NAV = [paths.console, paths.listings, paths.inquiries, paths.exclusives]

/** Console pages that title the header but have no rail item. */
const PAGES: NavItem[] = [
  { to: paths.search, label: 'Search', icon: Sparkles },
  { to: paths.assistant, label: 'Ask Jessy', icon: Sparkles },
]

export const navFor = (pathname: string) =>
  [...NAV, ...PAGES].sort((a, b) => b.to.length - a.to.length).find((n) => pathname === n.to || (!n.end && pathname.startsWith(`${n.to}/`)))
