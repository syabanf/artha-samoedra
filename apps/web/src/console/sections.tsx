import {
  BadgeCheck,
  BarChart3,
  Building2,
  CalendarCheck,
  ClipboardList,
  Columns3,
  FileText,
  Gift,
  Inbox,
  Megaphone,
  Settings2,
  Target,
  Users,
  Workflow,
  FormInput,
  Filter,
  Building,
  CalendarDays,
  PartyPopper,
  Receipt,
  HandCoins,
  Globe,
  Sparkles,
  FileStack,
  LayoutDashboard,
  BookOpen,
  NotebookPen,
  Landmark,
  FileInput,
  FileOutput,
  LineChart,
  Clock,
  ClipboardCheck,
  Wallet,
  Trophy,
  UserPlus,
  ShoppingCart,
  PackageCheck,
  Truck,
  Boxes,
  FolderLock,
  Link2,
  UsersRound,
} from 'lucide-react'
import { Outlet } from 'react-router'
import { paths } from '../components/links'
import { SectionNav, type SectionItem } from '../components/SectionNav'

const SALES: SectionItem[] = [
  { to: paths.pipeline, label: 'Pipeline', icon: Columns3 },
  { to: paths.deals, label: 'Deals', icon: ClipboardList },
  { to: paths.quotations, label: 'Quotations', icon: FileText },
  { to: paths.followUps, label: 'Follow-ups', icon: CalendarCheck },
  { to: paths.forecast, label: 'Forecast', icon: Target },
  { to: paths.approvals, label: 'Approvals', icon: BadgeCheck, needs: 'deal.approve' },
  { to: paths.salesSettings, label: 'Pipeline settings', icon: Settings2, needs: 'target.manage' },
]

const CRM: SectionItem[] = [
  { to: paths.contacts, label: 'Contacts', icon: Users },
  { to: paths.accounts, label: 'Accounts', icon: Building2 },
  { to: paths.inbox, label: 'Inbox', icon: Inbox },
  { to: paths.segments, label: 'Segments', icon: Filter, needs: 'campaign.manage' },
  { to: paths.campaigns, label: 'Campaigns', icon: Megaphone, needs: 'campaign.manage' },
  { to: paths.forms, label: 'Lead forms', icon: FormInput, needs: 'campaign.manage' },
  { to: paths.reports, label: 'Reports', icon: BarChart3, needs: 'report.view' },
  { to: paths.automations, label: 'Automations', icon: Workflow, needs: 'automation.manage' },
  { to: paths.referrals, label: 'Referrals', icon: Gift },
]

const OPS: SectionItem[] = [
  { to: paths.projects, label: 'Projects', icon: Building },
  { to: paths.visits, label: 'Site visits', icon: CalendarDays },
  { to: paths.openHouses, label: 'Open houses', icon: PartyPopper },
  { to: paths.payments, label: 'Payments', icon: Receipt },
  { to: paths.commissions, label: 'Commissions', icon: HandCoins },
  { to: paths.portals, label: 'Portals', icon: Globe },
  { to: paths.promotions, label: 'Promotions', icon: Sparkles },
  { to: paths.cmsPages, label: 'Website pages', icon: FileStack },
]

export const OpsLayout = () => (
  <>
    <SectionNav label="Operations pages" items={OPS} />
    <Outlet />
  </>
)

export const SalesLayout = () => (
  <>
    <SectionNav label="Sales pages" items={SALES} />
    <Outlet />
  </>
)

export const CrmLayout = () => (
  <>
    <SectionNav label="CRM pages" items={CRM} />
    <Outlet />
  </>
)

const FINANCE: SectionItem[] = [
  { to: paths.financeOverview, label: 'Overview', icon: LayoutDashboard },
  { to: paths.journals, label: 'Journals', icon: NotebookPen },
  { to: paths.glAccounts, label: 'Chart of accounts', icon: BookOpen },
  { to: paths.cash, label: 'Cash and bank', icon: Landmark },
  { to: paths.bills, label: 'Payables', icon: FileInput, also: [paths.vendors] },
  { to: paths.invoices, label: 'Receivables', icon: FileOutput },
  { to: paths.financeReports, label: 'Reports', icon: LineChart, also: [paths.budgets] },
  { to: paths.periods, label: 'Setup', icon: Settings2, also: [paths.autoJournals, paths.financeSettings] },
]

export const FinanceLayout = () => (
  <>
    <SectionNav label="Finance pages" items={FINANCE} />
    <Outlet />
  </>
)

const PEOPLE: SectionItem[] = [
  { to: paths.peopleOverview, label: 'Overview', icon: LayoutDashboard },
  { to: paths.employees, label: 'Employees', icon: Users, also: [paths.org, paths.contracts, paths.checklists, paths.hrSettings] },
  { to: paths.attendance, label: 'Time', icon: Clock, also: [paths.roster, paths.shifts, paths.holidays] },
  { to: paths.hrRequests, label: 'Requests', icon: ClipboardCheck },
  { to: paths.payroll, label: 'Payroll', icon: Wallet, needs: 'payroll.manage' },
  { to: paths.kpis, label: 'Performance', icon: Trophy, also: [paths.reviews, paths.hrReports] },
  { to: paths.openings, label: 'Recruitment', icon: UserPlus },
  { to: paths.announcements, label: 'Engagement', icon: Megaphone, also: [paths.logbook, paths.recurringTasks] },
]

export const PeopleLayout = () => (
  <>
    <SectionNav label="People pages" items={PEOPLE} />
    <Outlet />
  </>
)

const PURCHASING: SectionItem[] = [
  { to: paths.purchasingOverview, label: 'Overview', icon: LayoutDashboard },
  { to: paths.prs, label: 'Requests', icon: ClipboardList },
  { to: paths.pos, label: 'Orders', icon: ShoppingCart },
  { to: paths.goodsReceipts, label: 'Receiving', icon: PackageCheck, also: [paths.purchaseReturns] },
  { to: paths.suppliers, label: 'Suppliers', icon: Truck, also: [paths.priceList] },
  { to: paths.stock, label: 'Inventory', icon: Boxes, also: [paths.items, paths.stockCounts, paths.purchasingSettings] },
  { to: paths.purchasingReports, label: 'Reports', icon: LineChart },
]

export const PurchasingLayout = () => (
  <>
    <SectionNav label="Purchasing pages" items={PURCHASING} />
    <Outlet />
  </>
)

const ME: SectionItem[] = [
  { to: paths.me, label: 'Today', icon: LayoutDashboard, end: true },
  { to: paths.meAttendance, label: 'Attendance', icon: CalendarCheck },
  { to: paths.meRequests, label: 'Requests', icon: ClipboardList },
  { to: paths.mePayslips, label: 'Payslips', icon: Wallet },
  { to: paths.mePerformance, label: 'Performance', icon: Target },
  { to: paths.meTeam, label: 'Team', icon: UsersRound },
  { to: paths.meNews, label: 'News', icon: Megaphone },
]

export const MeLayout = () => (
  <>
    <SectionNav label="My space pages" items={ME} />
    <Outlet />
  </>
)

const DATAROOM: SectionItem[] = [
  { to: paths.dataroom, label: 'Folders', icon: FolderLock, end: true, also: ['/console/dataroom/folders', '/console/dataroom/files'] },
  { to: paths.shareLinks, label: 'Share links', icon: Link2 },
]

export const DataroomLayout = () => (
  <>
    <SectionNav label="Dataroom pages" items={DATAROOM} />
    <Outlet />
  </>
)
