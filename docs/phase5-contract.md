# Phase 5 contract: HRIS

`docs/roadmap.md` → "Phase 5" lists the scope. Read `docs/frontend-conventions.md` (including "Finance pages", whose rules apply here) and the "Hooks and helpers", "Copy these pages for shape" and "Rules every page follows" sections of `docs/phase2-contract.md`. For shape, copy `console/finance/PayablePages.tsx` (list, editor and detail with SubTabs) and `console/finance/ReportPages.tsx` (reports, CSV export and print).

## What exists for this phase

- **Types:** `packages/types/src/hr.ts`, with organisation, employees, contracts, checklists, shifts, schedule overrides, holidays, attendance, requests with approval steps, pay components, payroll, KPIs, scorecards, 360 cycles and reviews, openings, candidates, tests, announcements, logbook, recurring tasks and HR settings, plus label maps.
- **State keys:**
  - Organisation and people: `departments, sections, positions, employees, contracts, checklistTemplates, checklists`
  - Time: `shifts, scheduleOverrides, holidays, attendance`
  - Requests and payroll: `hrRequests, payComponents, payrollSettings, payrollRuns`
  - Performance: `kpis, scorecards, reviewCycles, reviews`
  - Recruitment: `psychTests, jobOpenings, candidates`
  - Engagement and settings: `announcements, logbook, recurringTasks, hrSettings`

  All are seeded in `seed-hr.ts`: 20 employees in six departments (one onboarding, one offboarding, one left), three weeks of attendance, 11 requests, paid payroll for August and September, Q3 and Q4 scorecards, an open 360 cycle, four openings with 12 candidates, and engagement data.
- **Store module** `packages/fixtures/src/hr.ts`. Every action, blocker and helper is done and covered by `hr.test.ts`. Pages dispatch and read; they never re-derive a rule.
  - **Actions:** see `HrAction` at the top of the file.
  - **People:** `employeeName`, `currentEmployees`, `employeeOfUser`, `directReports`, `orgTree`, `checklistProgress`, `openChecklist`, `expiringContracts`, `currentContract`, `nextEmployeeCode`, `nextContractCode`.
  - **Time:** `ymd`, `datesBetween`, `monthDates`, `workingDays`, `holidayOn`, `shiftOn`, `lateMinutes`, `attendanceState`, `attendanceSummary`, `distanceM`, `fmtDistance`, `officeOf`, `buildCheckIn(state, employeeId, at, photo, location)`.
  - **Requests:** `leaveBalance`, `requestSteps(state, employeeId, kind)`, `currentStep`, `nextRequestCode`, `loanInstallment`, `loanOutstanding`. A new request needs `steps: requestSteps(...)`. `hrRequests/decide` carries `by: user.id`.
  - **Payroll:** `calcPayslip`, `calcPayroll`, `payrollEmployees`, `payrollTotals`, `pph21Monthly`. Paying a run posts a `payroll_paid` auto-journal in Finance and takes loan installments.
  - **Performance:** `kpiAchievement`, `scorecardScore`, `scoreBand`, `SCORE_BANDS`, `reviewPairs`, `reviewSummary`.
  - **Recruitment and engagement:** `PIPELINE`, `hiredCount`, `nextDueAfter`, `announcementsFor`.
  - **Analytics:** `headcountBy`, `turnover`.
  - Jessy's minute job expires contracts past their end date (`hr/sweep`).
- **Permissions:**
  - `hr.view`: every page.
  - `employee.manage`: employees, organisation, contracts, checklists, HR settings, announcements and recurring tasks.
  - `attendance.manage`: shifts, roster, holidays, corrections.
  - `request.approve`: HR and Finance approval levels. The manager level checks `approverId` against the user.
  - `payroll.manage`: payroll pages; show `NoAccess` without it.
  - `performance.manage`
  - `recruit.manage`

  An HR role (`rol-hr`) and user Lestari Wulandari (`usr-10`) exist. Hide actions a role lacks.
- **Routes** are registered under `/console/people` with `PeopleLayout`, whose section tabs are Overview, Employees, Time, Requests, Payroll, Performance, Recruitment and Engagement. Paths are in `components/links.tsx`.
- **Shared parts:**
  - `console/people/parts.tsx`: `EmployeeSelect`, `Avatar`, `PersonCell`, `EmployeeStatusBadge`, `RequestStatusBadge`, `AttendanceBadge`, `ApprovalTrail`.
  - `components/SubTabs.tsx`: second-level links for a tab that spans pages.
  - Reuse `Money` from `console/finance/parts.tsx` for rupiah.
- **Storage version** is 11.

## Shared-file rules (five agents run at once)

- Do not edit `packages/*`, the router, `nav.ts`, `links.tsx`, `sections.tsx`, the kit, `components/*` or another agent's files. If the store lacks something, report the exact helper you wanted.
- `console/people/parts.tsx` is shared: small exact-string edits only, and only for something two agents need.
- Dates in forms use `toDateInput` and `fromDateInput`; leave, overtime, contract and roster dates are `YYYY-MM-DD` strings (`ymd`).
- Every mutation goes through `useAct()`. Disabled buttons give their `blockerFor` text in `title`, and forms show it after the first submit.
- Lists filter: search plus chips with counts, kept in the URL.
- Check 1280 and 375 px: no sideways scroll, one h1. Run `pnpm -r typecheck` and `pnpm test` before reporting.

## Agent A: Employees and organisation

Own `console/people/EmployeePages.tsx` (`EmployeesPage`, `EmployeeEditorPage`, `EmployeeDetailPage`) and `OrgPages.tsx` (`OrgPage`, `ContractsPage`, `ChecklistsPage`, `HrSettingsPage`). Use `SubTabs` across Employees, Organisation, Contracts, Checklists and HR settings.

- **Employees list:**
  - Stat tiles: active, onboarding, offboarding, contracts ending within `hrSettings.contractAlertDays`.
  - Chips: status, department, employment type. Branch select, search.
  - Columns: person, code, department, type, branch, joined, status.
  - CSV export.
- **Editor:** new and edit.
  - Sections: identity (name, email, phone, gender, birth date, NIK), job (department, then section and position filtered to it, manager, branch, type, shift, joined), payroll (base salary, PTKP, NPWP, BPJS numbers, bank account, allowances per `payComponents`), annual leave quota, linked console user.
  - A new employee gets an optional first contract and dispatches `employees/create`.
- **Detail:**
  - Ink hero: name, position, status, tenure.
  - Tabs: Profile (KeyValue cards), Contract history (renew dialog through `contracts/renew`), Checklists (toggle items), Time (this month's `attendanceSummary` and leave balance, linking to attendance), Requests, Payslips (links to `paths.payslip`), Reports to and direct reports.
  - Actions: Edit, Activate (onboarding), Start offboarding (last day and reason), Release (offboarding).
- **Organisation:**
  - Departments with head, parent and headcount, plus sections and positions, each with add, edit and remove.
  - An org chart from `orgTree` as a nested card tree: an indented list on phones, a horizontal tree from `lg`.
- **Contracts:** every contract with filters (status, type, ending within N days). The "ending soon" banner lists `expiringContracts`, each with Renew.
- **Checklists:**
  - Open onboarding and offboarding checklists with progress bars.
  - Editable templates for both kinds: add, remove and reorder items, each with an owner role.
- **HR settings:** late grace, check-in radius with office coordinates per branch, contract alert days.

## Agent B: Time and requests

Own `console/people/AttendancePages.tsx` (`AttendancePage`, `AttendanceEmployeePage`), `RosterPages.tsx` (`RosterPage`, `ShiftsPage`, `HolidaysPage`) and `RequestPages.tsx` (`HrRequestsPage`, `HrRequestEditorPage`, `HrRequestDetailPage`). Use `SubTabs` across Attendance, Roster, Shifts and Holidays.

- **Attendance (today board):**
  - A date picker in the URL, default today.
  - Stat tiles by state: present, late, absent, on leave, upcoming.
  - Per-employee rows: check-in and check-out times, minutes late, distance from the office, selfie thumbnail, state badge.
  - **Check-in dialog:**
    - Pick the employee, or default to the signed-in user's employee via `employeeOfUser`.
    - Take a selfie with `getUserMedia` into a canvas. Downscale to 480 px, JPEG 0.7. Fall back to a file input.
    - Request `navigator.geolocation` and show the distance with `fmtDistance`.
    - Dispatch `attendance/checkIn` with `buildCheckIn`.
  - A Check out button per row.
  - With `attendance.manage`, a correction dialog (`attendance/correct`, note required).
- **Employee attendance:** a month calendar coloured by `attendanceState`, with the summary counts and rate. Click a day to see its record.
- **Roster:** a week grid (employees by days, with prev and next week). Each cell shows the shift code, Off or the holiday. With `attendance.manage`, a cell menu sets a shift, a day off or the default (`schedule/set`). Filter by department.
- **Shifts and holidays:** CRUD for each, with blockers. Holidays have a year filter.
- **Requests:**
  - **List:**
    - Tabs for All and "Waiting for me". "Waiting for me" holds requests whose current step names this user, or HR and Finance steps when the user has `request.approve`.
    - Chips: kind, status. Employee select.
    - Columns: code, person, kind, detail (dates and days, hours, or amount), current step, status.
    - Leave balances table for the year.
  - **Editor:**
    - Pick the employee and the kind.
    - Leave: type, dates, and working days computed with `workingDays`. Show the balance.
    - Overtime: date and hours. Loan: amount and installments, showing the installment amount.
    - Reason. Steps come from `requestSteps`.
  - **Detail:**
    - Hero, detail card, `ApprovalTrail`.
    - Approve and Reject (reject note required) when the current step is the user's.
    - Cancel.
    - A loan shows its installments paid and outstanding.

## Agent C: Payroll

Own `console/people/PayrollPages.tsx` (`PayrollPage`, `PayrollRunPage`, `PayslipPage`, `PaySettingsPage`). Show `NoAccess` without `payroll.manage`. Use `SubTabs` across Runs and Salary settings.

- **Runs:**
  - Runs with month, headcount, gross, net, employer cost, status.
  - "Calculate payroll" for a month picker (default this month); it dispatches `payroll/calculate` and opens the run.
  - A trend of net pay per month.
- **Run detail:**
  - Hero: status, totals from `payrollTotals`, and a link to the finance journal through `journalFor(state, 'payroll', id)`.
  - Actions: Recalculate (draft), Approve, Pay. Each states its blocker.
  - Slips table: person, base, earnings, overtime hours, deductions, BPJS, PPh 21, net. Search and a department filter.
  - Export CSV, plus a bank transfer CSV (name, bank account, net).
- **Payslip:** a printable payslip through `components/Letter.tsx`. It shows the company letterhead, employee identity (code, position, NPWP and PTKP), earnings and deductions columns, BPJS employee and company lines, PPh 21, net pay in words is optional, and the period. Check print preview.
- **Salary settings:**
  - Pay components CRUD.
  - BPJS and overtime settings form (`payrollSettings/update`).
  - A salary table of every current employee: base, allowances, and an estimated monthly net from `calcPayslip` for this month. Rows link to the employee editor.

## Agent D: Overview, performance, reports

Own `console/people/OverviewPage.tsx` (`PeopleOverviewPage`), `PerformancePages.tsx` (`KpisPage`, `ScorecardPage`, `ReviewsPage`, `ReviewCyclePage`, `ReviewFormPage`) and `ReportsPage.tsx` (`HrReportsPage`). Use `SubTabs` across KPIs, 360 reviews and Reports.

- **Overview:**
  - Ink hero with headcount and joiners and leavers this year.
  - An accent card for requests waiting for the user.
  - Stat cards: today's attendance rate, contracts ending soon, open onboarding checklists, open positions.
  - Headcount by department (BarList).
  - Lists: today's absences and late arrivals, upcoming leave (next 14 days), birthdays this month, latest announcements.
  - Every card links to its page.
- **KPIs:**
  - Definitions grouped by position, with the weight total per position (warn when under 100), plus add and edit through `kpis/upsert`.
  - The scorecards table: period chips, person, score with `scoreBand`, status.
  - "New scorecard" for an employee and period builds entries from the position's KPIs.
- **Scorecard:** entries with target, an actual input, and achievement %. Weighted score and band. Save, Submit, Finalize.
- **Reviews:**
  - **Cycles list** with progress (submitted of total). Create and edit a draft cycle with its questions, Open, Close.
  - **Cycle detail:**
    - Per-person summary from `reviewSummary`: overall, and scores by relation as small bars.
    - "My reviews to write", using `employeeOfUser` for the reviewer.
  - **Review form:** each question 1 to 5 with a comment. Submit.
- **Reports:** a range picker in the URL, with CSV export and print for each:
  - Headcount by department, branch, type and gender
  - Turnover for the year
  - Monthly attendance rate per department
  - Leave taken by type
  - Overtime hours by month
  - Payroll cost by month (from `payrollRuns`)
  - KPI score distribution

## Agent E: Recruitment and engagement

Own `console/people/RecruitmentPages.tsx` (`OpeningsPage`, `OpeningDetailPage`, `CandidatePage`, `TalentPoolPage`) and `EngagementPages.tsx` (`AnnouncementsPage`, `LogbookPage`, `RecurringTasksPage`). Use `SubTabs` across Openings and Talent pool, and across Announcements, Logbook and Department tasks.

- **Openings:**
  - Cards or a table: title, department, branch, headcount and hired, candidates per stage, status.
  - Create and edit (`openings/upsert`). Open and close.
- **Opening detail:** a pipeline kanban over `PIPELINE` plus a rejected column.
  - Desktop: drag between columns with native HTML5 drag and drop, plus a "Move to" menu as the accessible path.
  - Phones: one column at a time with stage chips.
  - Cards show rating stars, tags, best test score and next interview.
  - "Add candidate".
- **Candidate:**
  - Hero with stage, the opening, and Move to.
  - Profile with CV name, source, tags and notes.
  - Tests: record a result per `psychTests`, showing pass or fail against `passMark`.
  - Interviews: schedule video or onsite with interviewers and a link, then add feedback and a score.
  - Offer: draft, send, mark accepted or declined.
  - Hire: build the employee from the offer and opening (`nextEmployeeCode`, position and department from the opening, salary and start from the offer, the default office shift), with a contract. Dispatch `candidates/hire`, then link to the new employee.
  - Reject, with a reason.
- **Talent pool:** candidates without an opening, plus rejected ones worth keeping. Search and tag chips. "Attach to opening".
- **Announcements:** a list with pinned items first and the audience (everyone or a department). Create and edit. A read count of read users against the audience. Opening one marks it read for the user (`announcements/read`).
- **Logbook:** entries by date with person and hours. Add an entry (default the signed-in user's employee). Filter by employee and week. Weekly hours per person.
- **Department tasks:** recurring tasks per department with next due (overdue in danger), assignee and last done. A Complete button and CRUD.
