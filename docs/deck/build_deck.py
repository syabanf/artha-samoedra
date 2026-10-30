"""Roadmap update deck for the Artha Samoedra ERP, built with the wit-deck-2 skill.

Run: <venv>/bin/python docs/deck/build_deck.py <skill scripts dir>
Source: docs/roadmap.md. Screenshots in docs/deck/shots/ come from the running app.
"""
import sys
from pathlib import Path

sys.path.insert(0, sys.argv[1])
from witdeck import *  # noqa: E402,F403

HERE = Path(__file__).parent
SHOT = lambda name: str(HERE / 'shots' / f'{name}.png')

d = Deck('Artha Samoedra ERP', 2026)

d.cover(['Artha Samoedra', 'Roadmap Update'], 'Roadmap', 'October 2026')

agenda, _ = d.agenda(
    ['WHAT THIS', 'UPDATE COVERS'],
    [
        ('STATUS.', 'Eight phases done and the numbers behind them', 'SLIDE 3'),
        ('PHASES.', 'What each build round delivered', 'SLIDES 4–5'),
        ('PRODUCT.', 'Screens from the site, console and phone', 'SLIDES 6–12'),
        ('JESSY.', 'How the console assistant acts', 'SLIDE 13'),
        ('RISKS.', 'Open items carried forward', 'SLIDE 14'),
        ('NEXT.', 'Now, next and later', 'SLIDE 15'),
    ],
    intro_head='Mizu and Habitat parity.',
    intro='Every general ERP feature from both, rebuilt for a property business.',
)
# The template box wraps '#MakeITHappen' in LibreOffice; widen it leftward, keeping its right edge.
set_box(find(agenda, 'agenda_hashtag'), x=15.9, w=2.975)

d.stats(
    'STATUS. October 2026',
    'Every roadmap phase is built and tested',
    [
        ('8 of 8', 'Roadmap phases done', True),
        ('8', 'Client modules covered'),
        ('189', 'Routes across the site and console'),
        ('117', 'Automated store tests passing'),
        ('59', 'Permissions in 16 modules'),
        ('110', 'Data collections in the store'),
    ],
    note='Frontend on a mock store: no backend API is connected yet.',
)

d.columns(
    'PHASES. Build rounds',
    'Four stages took the console from listings to a full ERP',
    [
        dict(status='done', head='Foundation', sub='Round 1, Phases 1 and 2', items=['Public site and Jessy chat', 'Settings, roles and audit log', 'CRM and sales funnel']),
        dict(status='done', head='Operations', sub='Phases 3 and 3B', items=['Projects, visits, open houses', 'Booking fees and commissions', 'All 8 client modules']),
        dict(status='done', head='Back office', sub='Phases 4 to 6', items=['Finance and accounting', 'HRIS and payroll', 'Purchasing and inventory']),
        dict(status='done', head='Workspace', sub='Phases 7 and 8', items=['Self-service and careers', 'Dataroom and share links', 'Search, Jessy, desktop']),
    ],
)

d.table(
    'PHASES. Status by phase',
    'Each phase shipped with its open items written down',
    ['Phase', 'Delivered', 'Status', 'Open items'],
    [
        ['Round 1', 'Public site, Jessy chat, exclusive rights, profit sharing', 'Done', '0'],
        ['1', 'Users, roles, audit log, integrations, notification rules', 'Done', '0'],
        ['2', 'Pipeline, quotations, contacts, inbox, campaigns, automations', 'Done', '0'],
        ['3', 'Units, site visits, open houses, payments, commissions, CMS', 'Done', '0'],
        ['3B', 'Approval queue, AI gateway, outbox, client module checklist', 'Done', '2'],
        ['4', 'Ledger, auto-journals, cash, payables, receivables, reports', 'Done', '4'],
        ['5', 'Employees, attendance, requests, payroll, performance, hiring', 'Done', '5'],
        ['6', 'Requests, orders, receiving, suppliers, stock, valuation', 'Done', '4'],
        ['7', 'My space, careers portal, dataroom, share links', 'Done', '5'],
        ['8', 'Global search, Jessy console assistant, OS desktop', 'Done', '4'],
    ],
    widths=[1.4, 9, 1.6, 2],
    align=['l', 'l', 'ctr', 'ctr'],
)

d.showcase(
    'SITE. Public website',
    'Buyers find verified property and book a visit',
    [
        'Verified listings with area guides and an SEO blog',
        'Jessy qualifies buyers and hands them to a named agent',
        'Partners list and withdraw properties by chat',
        'Careers and private share links run on the same site',
    ],
    SHOT('landing'),
    tags=['Jessy chat', 'SEO and GEO'],
)

d.showcase(
    'CONSOLE. Dashboard',
    'Every team works from one console',
    [
        'Listings, exclusive rights and profit sharing',
        'Sales pipeline, CRM and property operations',
        'Roles decide which modules each person sees',
        'The audit log records every change by field',
    ],
    SHOT('dashboard'),
    tags=['16 modules', '59 permissions'],
)

d.showcase(
    'FINANCE. Overview',
    'Payments post to the ledger on their own',
    [
        'Booking fees, deposits and commissions post auto-journals',
        'Fiscal periods close in order, with a year-end close',
        'Payables and receivables with aging and faktur numbering',
        'Balance sheet, income statement, cash flow and budgets',
    ],
    SHOT('finance'),
    tags=['28 pages'],
)

d.showcase(
    'PURCHASING. Overview',
    'Stock and spend reconcile with the ledger',
    [
        'Requests climb Manager, Finance and Director levels by amount',
        'Orders, receiving with QC, returns and vendor credits',
        'Stock moves, transfers and counts at moving average cost',
        'The inventory account matches stock value in every test',
    ],
    SHOT('purchasing'),
    tags=['No BOM', '4 store rooms'],
)

d.showcase(
    'DATAROOM. Property documents',
    'Notaries open documents through a coded link',
    [
        'Folders per listing and deal, with department access',
        'Uploads keep every version of a file',
        'Share links need the email and a 6-digit code',
        'The log shows each open, view and download',
    ],
    SHOT('dataroom'),
    tags=['90-day links', 'View only option'],
)

d.phones(
    'MOBILE. Staff and candidates',
    'Staff and candidates work from their phones',
    [
        'My space: check in, leave, payslips and reviews',
        'Jessy answers from live data in English or Indonesian',
        'Candidates take tests and answer offers on a portal',
    ],
    [SHOT('phone-me'), SHOT('phone-jessy'), SHOT('phone-portal')],
    tags=['Phase 7', 'Phase 8'],
)

d.showcase(
    'WORKSPACE. Desktop',
    'The console also runs as a desktop of windows',
    [
        'Modules open in windows that drag, resize and snap',
        'Notes, calculator, calendar and Jessy built in',
        'The layout is saved for each user',
        'Global search across 20 kinds of records',
    ],
    SHOT('desktop'),
    tags=['Ctrl K search'],
)

d.flow(
    'JESSY. Console assistant',
    'Jessy proposes a change and the member confirms it',
    [
        dict(
            label='Every question',
            before=[['Member asks', '(header or desktop)'], 'Jessy checks the role'],
            question=['Change', 'requested?'],
            after=['Proposal card', 'Runs as the member'],
            no='Answers from live data',
            note='Audit log names the member -> AI log names Jessy',
            note_at='after',
        ),
    ],
)

d.cards(
    'RISKS. Open items',
    'Open items stay small and are written down per phase',
    [
        ('Finance and data', ['Faktur pajak is numbered but not sent to e-Faktur', 'PPh 21 uses annual brackets, not the TER monthly tables', 'Seeded documents are placeholders without content'], False),
        ('Platform', ['Every module runs on a mock store in the browser', 'Jessy matches words by rules until a model is connected'], True),
    ],
)

d.columns(
    'NEXT. Proposed order',
    'The backend comes next, after a client walkthrough',
    [
        dict(status='partial', status_label='NOW', head='Review', sub='This month', items=[('Add the client logo files', 'pending'), ('Walk the client through modules', 'pending'), ('Collect change requests', 'pending')]),
        dict(status='todo', status_label='NEXT', head='Backend', sub='After the review', items=['API and database for the store', 'File storage for uploads', 'A real model behind Jessy']),
        dict(status='todo', status_label='LATER', head='Compliance', sub='Once data is live', items=['e-Faktur submission', 'PPh 21 TER tables', 'BPJS split per programme']),
    ],
)

d.closing(
    'Eight phases are built; the client review and the backend come next.',
    'Next round',
    ['Client walkthrough', 'Backend API', 'Logo files'],
    [('Repository', 'github.com/syabanf/artha-samoedra')],
)

d.save(str(HERE / 'Artha_Samoedra_Roadmap_Update.pptx'))
print('saved')
