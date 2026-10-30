# Phase 7 contract: self-service, careers and dataroom

`docs/roadmap.md` → "Phase 7" lists the scope. Read these first:
- `docs/frontend-conventions.md`, including "Finance pages".
- The "Hooks and helpers", "Copy these pages for shape" and "Rules every page follows" sections of `docs/phase2-contract.md`.

Copy these files for shape:
- `console/people/RequestPages.tsx`: a request form with balances and `ApprovalTrail`.
- `console/people/PayrollPages.tsx`: the payslip and its print.
- `console/purchasing/StockPages.tsx`: a list with filters and dialogs.
- `site/PublicFormPage.tsx` and `site/PartnerPage.tsx`: public pages that dispatch as `'public'`.

## What exists for this phase

### Employee self-service

The HR store has everything. The user's employee is `employeeOfUser(state, user.id)`. Show an empty state when it is missing; Ayu, the admin, has an employee record.

| Need | Actions and helpers |
| --- | --- |
| Attendance | `attendance/checkIn`, `attendance/checkOut`, `attendanceState`, `attendanceSummary` |
| Requests | `hrRequests/create`, `hrRequests/cancel`, `leaveBalance`, `requestSteps` |
| Payslips | `calcPayslip`, plus `payrollRuns` and their `payslips` |
| Performance | `scorecards`, `scorecardScore`, `reviewPairs`, `reviews/submit` |
| News | `announcements`, `announcements/read` |
| Team | `directReports`, schedules and shifts |

### Careers

These additions are in `packages/fixtures/src/hr.ts`.

**Candidate fields:** `token?` and `assignedTestIds?`.

**Interviews and offers:** an interview has `response?`, and an offer has `answeredAt` and `answerNote`.

**Test questions:** each `PsychTest` has `questions`, and the answer key is index-based.

**Actions:**
- `candidates/apply`: public. It needs an open opening, a phone number and a CV file name.
- `candidates/portal`: HR gives the candidate a token and the tests to take.
- `candidates/takeTest`: the store scores the answers.
- `candidates/respondInterview`: `confirmed`, or `reschedule` with a note.
- `candidates/respondOffer`: accept or decline.

**Helpers:** `candidateByToken`, `scoreTest`, `testsDue`.

**Demo portals:**

| Candidate | Path | What it shows |
| --- | --- | --- |
| Bram | `/careers/c/cnd-bram-7q4x` | a numerical test due |
| Clara | `/careers/c/cnd-clara-2m8k` | an upcoming onsite interview and a DISC test due |
| Gita | `/careers/c/cnd-gita-5w1n` | an upcoming video interview |
| Siska | `/careers/c/cnd-siska-4h6t` | an offer to answer |
| Hendro | `/careers/c/cnd-hendro-9d3p` | an accepted offer |

### Dataroom

`packages/fixtures/src/dataroom.ts` holds the actions:
- `folders/*`
- `dataFiles/*`: upload makes a new version when the name repeats; the limit is 1 MB.
- `shareLinks/*`: create, revoke, extend, plus the public `open` and `track`.

**Helpers:**
- Folders: `childFolders`, `folderPath`, `folderTreeIds`, `folderDepartments`, `canSeeFolder(s, userId, folderId, manage)`, `filesIn`, `fileVersions`, `folderStats`.
- Records: `foldersForListing`, `foldersForDeal`.
- Shares: `shareStatus`, `shareByToken`, `shareEvents`, `shareFiles`, `shareCodeMatches`, `failedTries`, `shareSummary`.
- New links: `newShareCode`, `newShareToken`.
- Formatting: `fmtFileSize`.

**Demo data:**
- Folders: property documents per listing and deal, templates, HR (HR and management only) and finance.
- Four share links:

| Link | Status | Path | Code |
| --- | --- | --- | --- |
| Notary | active | `/share/k3v9notaris` | `482913` |
| Buyer Siti | active, view only | `/share/p7m2sentul` | `615204` |
| BTN | expired | | |
| Rizky | revoked | | |

The codes also show on each link's console page.

**Permissions:**
- `dataroom.view`: folders your department can see.
- `dataroom.manage`: every folder, plus folders, uploads and access.
- `dataroom.share`: links and the log.

My space needs no permission.

## Routes and parts (done)

**Paths** in `components/links.tsx`:
- My space: `me*`.
- Dataroom: `dataroom`, `dataFolder`, `dataFile`, `shareLinks`, `shareLink`.
- Public: `careers`, `career(code)`, `candidatePortal(token)`, `candidateTest(token, testId)`, `sharePublic(token)`.

**Section layouts:** `MeLayout` and `DataroomLayout`. The console nav has "My space" and "Dataroom". The site footer has Careers.

**Router:** the exports each agent must provide are named below.

**Shared parts** in `console/dataroom/parts.tsx`: `FileGlyph`, `fileIcon`, `FileSize`, `ShareStatusBadge`, `FolderSelect`, and `FilePreview`, which shows a stand-in page for seeded files without content.

**Storage version** is 14.

## Shared-file rules (four agents run at once)

**Shared files:**
- Do not edit `packages/*`, the router, `nav.ts`, `links.tsx`, `sections.tsx`, the kit, `components/*`, `lib/*` or another agent's files.
- Report the exact helper you wanted.
- Every `parts.tsx` is shared: make only small exact-string edits.

**Mutations and forms:**
- Every console mutation goes through `useAct()`.
- Public pages call `dispatch(action, 'public')` and check the returned refusal.
- A disabled button gives its `blockerFor` text in `title`.
- Forms show errors after the first submit.

**Lists:** search plus chips with counts, kept in the URL with `useSetParam`.

**Checks:**
- At 1280 and 375 px: no sideways scroll and one h1.
- Run `pnpm -r typecheck` and `pnpm test` before reporting.
- The in-app browser pane has reduced motion on and few free tabs. Check with headless Playwright from `/Users/syabanf/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core`, in your own context, so you never touch the shared demo storage.
- Name your scratch scripts with your agent letter.

## Agent A: My space

Own `console/me/*`:

| File | Exports |
| --- | --- |
| `TodayPage.tsx` | `MyTodayPage` |
| `AttendancePage.tsx` | `MyAttendancePage` |
| `RequestPages.tsx` | `MyRequestsPage`, `MyRequestNewPage` |
| `PayslipPages.tsx` | `MyPayslipsPage`, `MyPayslipPage` |
| `PerformancePage.tsx` | `MyPerformancePage` |
| `TeamPage.tsx` | `MyTeamPage` |
| `NewsPage.tsx` | `MyNewsPage` |

These pages are phone-first, since staff open them on their phones. Use big tap targets, one column at 375 px, and the WIT mobile patterns inside the console shell.

- **Today:**
  - A greeting with an accent period.
  - Today's shift.
  - A big Check in / Check out button: a selfie through `<input capture>` is optional, and a mock location is fine.
  - Leave balance tiles, my pending requests, unread announcements, and reviews I owe in an open cycle.
- **Attendance:** a month calendar of my days with `attendanceState` colours, a summary, and the day's times.
- **Requests:**
  - My leave, overtime and loan requests with status and `ApprovalTrail`, plus Cancel while pending.
  - New request (`?kind=`) with balance checks, dispatching `hrRequests/create` for my employee.
- **Payslips:** my payslips from paid runs, and the detail with print (copy the payroll payslip look).
- **Performance:** my scorecards with KPI rows and score, plus reviews I must write, each with a form dispatching `reviews/submit`.
- **Team:** my department's people and this week's shifts. A manager also sees their direct reports' pending requests and today's attendance.
- **News:** announcements for everyone and my department. Opening one marks it read.

## Agent B: Careers

Own:
- `site/CareerPages.tsx`: `CareersPage`, `CareerOpeningPage`.
- `site/CandidatePortalPages.tsx`: `CandidatePortalPage`, `CandidateTestPage`.

Add one small edit to `console/people/RecruitmentPages.tsx`. On the candidate detail, add a "Candidate portal" card:
- Copy link. If the candidate has no token, dispatch `candidates/portal` with `newShareToken()`.
- Pick tests to assign.
- Show the candidate's interview and offer responses.

The public pages use the site look: `SiteContainer`, display type, and light cards.

- **Careers:**
  - Open openings with department, type, branch and headcount, plus department chips.
  - A short "why join" block with a photo from `/landing`.
- **Opening:**
  - The description and an apply form: name, email, phone, CV file (store only the name and keep it 1 MB or smaller) and a note.
  - The form dispatches `candidates/apply` with `newId('cnd')` and `newShareToken()`.
  - Then a success state links to the candidate portal.
- **Candidate portal (`/careers/c/:token`):**
  - The candidate's name and opening.
  - A stage timeline: applied, screening, test, interview, offer.
  - Tests due, with a "Start test" link.
  - Interviews, with Confirm or Ask to reschedule (note required).
  - The offer card with salary, start date and type, with Accept or Decline (note optional).
  - A rejected candidate sees a kind closing note.
  - An unknown token shows a not-found state.
- **Test page:**
  - A timer showing the test's minutes (display only) and one question per step with a progress bar.
  - Submit dispatches `candidates/takeTest`. The result shows the score and pass mark.

## Agent C: Dataroom console

Own `console/dataroom/FolderPages.tsx` (`DataroomPage` for `/` and `/folders/:id`, and `DataFilePage`).

- **DataroomPage:**
  - A folder tree on the left from `lg` up, and a sheet or select on phones. It shows only folders `canSeeFolder` allows.
  - Breadcrumbs, then subfolders as cards with file count, size and last update.
  - A file table with name, version, size, uploaded by and date, plus search.
  - Actions with `dataroom.manage`:
    - New folder: name, description, departments as a multi-pick, and an optional listing or deal.
    - Edit, and remove (with the blocker).
    - Upload, with a file input of 1 MB or less read as a data URL. The same name makes a new version.
    - Move.
  - "Share" (`dataroom.share`) on a folder or selected files opens a dialog:
    - Fields: recipient name, email, purpose, message, expiry (default 14 days, at most 90) and allow download.
    - The code comes from `newShareCode()` and the token from `newShareToken()`.
    - It dispatches `shareLinks/create`, then shows the link and code to copy.
  - The root view shows folders tied to listings and deals with links to those records.
- **DataFilePage:**
  - `FilePreview`, details and the version history (each version can be viewed).
  - Download for uploaded files.
  - The share links that include this file.

## Agent D: Share links and the public share page

Own `console/dataroom/SharePages.tsx` (`ShareLinksPage`, `ShareLinkPage`) and `site/SharePublicPage.tsx` (`SharePublicPage`).

Add small edits to:
- `console/pages/ListingDetailPage.tsx`
- `console/sales/DealPages.tsx` (deal detail)

On each, add a "Documents" card listing `foldersForListing` or `foldersForDeal` with file counts and a link to the folder. It is visible with `dataroom.view`.

- **Share links:**
  - Stat tiles: active, opened this week, expiring in 7 days, revoked.
  - Status and purpose chips, plus search.
  - Columns: recipient, email, what (folder or files), purpose, status, expires, opens and downloads, and last seen.
- **Share link detail:**
  - The link URL and code with copy buttons. A note says the code goes to the recipient by email in production.
  - The files in the share.
  - The event log.
  - Actions: Revoke, and Extend (date picker, at most 90 days).
- **Public share page (`/share/:token`):** use the site look with a minimal header.
  1. Gate: email and code, dispatching `shareLinks/open`. Check `shareCodeMatches` for the result, and keep the opened state in `sessionStorage` per token.
  2. Revoked, expired and locked states use the blocker texts.
  3. Once open, show the sender, message and expiry, then the file list grouped by folder.
  4. View dispatches `shareLinks/track viewed` and shows `FilePreview` in a dialog.
  5. Download is shown only when the link allows it, and dispatches `downloaded`. Seeded files have no content, so download them as a small text placeholder named after the file.
