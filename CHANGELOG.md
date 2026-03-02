# Changelog

## 2026-03-02 (Historical goals & accelerators — month-accurate past views)

### Location – Context (`src/contexts/TeamsContext.tsx`), DB Types (`src/lib/database.types.ts`), Pilots/Index (`src/pages/Index.tsx`), Quota (`src/pages/Quota.tsx`), Migration (`supabase/migrations/20250302300000_create_goals_history.sql`)

**Rationale:** Member history tracking was already in place so that viewing a past month showed the correct roster. However, goals and accelerator rules were only stored as current values on the `teams` and `members` tables. When a manager changed a team's monthly goals, enabled metrics, accelerator rules, goals-by-level, goal scope, or member-level goals/levels from one month to the next, viewing a prior month would incorrectly display the current configuration instead of what was actually in effect during that period. This made historical quota and goal-attainment views unreliable.

**Changes:**
- Created `team_goals_history` table in Supabase with `team_id`, `month` (YYYY-MM), `goals_parity`, `team_goals`, `enabled_goals`, `accelerator_config`, `team_goals_by_level`, and `goal_scope_config` (all JSONB), with a unique constraint on `(team_id, month)`. Includes indexes, RLS policies, and backfill of current state for the current month. Applied migration to live Supabase.
- Created `member_goals_history` table with `member_id`, `month`, `goals` (JSONB), and `level`, with a unique constraint on `(member_id, month)`. Includes indexes, RLS policies, and backfill. Applied migration to live Supabase.
- Added `DbTeamGoalsHistory` and `DbMemberGoalsHistory` interfaces to `database.types.ts`.
- Added `TeamGoalsHistoryEntry` and `MemberGoalsHistoryEntry` app-level types to `TeamsContext.tsx`.
- Both history tables are fetched on startup alongside existing data and stored in context state (`teamGoalsHistory`, `memberGoalsHistory`).
- Auto-snapshot on change: when `updateTeam` detects any goal/accelerator field change, it upserts the current month's snapshot to `team_goals_history`. A new `snapshotMemberGoals` helper upserts to `member_goals_history` whenever member goals or level change (via both `updateTeam` inline member edits and `updateMember`).
- Added `getHistoricalTeam()` overlay helper that replaces a team's goal config with the snapshot for a given past month (returns the team unchanged for the current month or when no snapshot exists).
- Added `getHistoricalMember()` overlay helper that replaces a member's goals and level with the snapshot for a given past month.
- Updated the Monthly Goals section in `Index.tsx` to wrap teams and members with `getHistoricalTeam`/`getHistoricalMember` when viewing past months. The `TeamTab` component also receives a historical team so funnel metric visibility respects past enabled-goals config.
- Updated `TeamQuotaCard` in `Quota.tsx` to apply historical overlays, so quota calculations, goal breakdowns, and accelerator triggers all use the goals/accelerators that were in effect during the viewed month.
- Existing quota helper functions (`getEffectiveGoal`, `computeQuota`, `computeQuotaBreakdown`, etc.) required no changes — they operate on the overlaid team/member objects transparently.
---

## 2026-03-02 (Lifetime Stats & Monthly Stats sections with thousands separators)

### Location – Pilots/Index (`src/pages/Index.tsx`), Quota Helpers (`src/lib/quota-helpers.ts`)

**Rationale:** The Test Signals section only showed stats filtered to the currently selected month/phase, with no way to see cumulative performance across the entire test. Managers needed both a month-level view (adjustable via phase selection) and a lifetime view (spanning the full test duration) to compare short-term trends against overall trajectory. Additionally, large numbers lacked thousands separators, making them harder to scan at a glance.

**Changes:**
- Added `getMemberLifetimeMetricTotal` helper to `quota-helpers.ts` that sums a metric across all weeks in `funnelByWeek` without any month filtering.
- Added `getMemberLifetimeWins` and `getMemberLifetimeFunnelTotal` helpers in `Index.tsx` for lifetime funnel aggregation (calls, connects, demos, wins).
- Computed lifetime totals for Ops, Demos, Wins, Feedback, Activity, Calls, and Connects in the `TeamView` component.
- Wrapped the existing month-filtered stat cards in a new **Monthly Stats** section with a blue (`border-primary/30`) border, Calendar icon header, and a dynamic badge showing the selected month (e.g. "Mar 2026").
- Added a new **Lifetime Stats** section with an orange (`border-accent/30`) border, Trophy icon header, "Entire Test" badge, and a subtle accent gradient background. This section includes both conversion rates (Touch Rate / TAM→Call, Call→Connect, Connect→Demo, Demo→Win) and stat cards (Ops, Demos, Wins, Feedback, Activity) aggregated across all weeks regardless of month selection.
- The two sections are visually distinguishable by border color, icon, badge label, and background treatment.
- Added a `fmtNum` utility that applies `toLocaleString()` for thousands separators. Applied it inside `StatCard` so all numeric stat values are automatically formatted.
- Applied `.toLocaleString()` to the large Wins number in the team header card and the tab badge win counts.
---

## 2026-03-02 (Member history tracking — preserve performance across project moves)

### Location – Context (`src/contexts/TeamsContext.tsx`), DB Types (`src/lib/database.types.ts`), Pilots/Index (`src/pages/Index.tsx`), Quota (`src/pages/Quota.tsx`), Migration (`supabase/migrations/20250302100000_create_member_team_history.sql`)

**Rationale:** When a member was reassigned between projects (e.g. Shane Hughes moving from Mad Max to a new project), the old system created a brand new member row with a fresh UUID and set the old one to `is_active = false`. This severed the link to all historical performance data — funnel metrics, wins, and ducks were orphaned on the now-invisible old member ID. There was no way to know how someone performed on their previous project. Additionally, the TAM average and member count on project pages always used the current roster, so viewing a past month after someone left would show incorrect numbers.

**Changes:**
- Created `member_team_history` table in Supabase with `member_id`, `team_id`, `started_at`, and `ended_at` columns, plus indexes and RLS policies. Backfilled one row per active member using their current team and `created_at` date. Applied migration to live Supabase.
- Added `DbMemberTeamHistory` interface to `database.types.ts`.
- Rewrote `assignMember` (both unassigned-to-team and team-to-team paths) in `TeamsContext.tsx` to update `team_id` in place instead of soft-deleting and cloning. Closes the current history record (`ended_at = now()`) and opens a new one on every move.
- Rewrote `unassignMember` to update `team_id` to null in place with the same history record pattern.
- Updated `createMember` to insert an initial history record when a member is first created.
- Updated `removeTeam` to close history records and open unassigned records for all members when a team is archived.
- Updated `removeMember` to close the open history record when a member is soft-deleted.
- Added `MemberTeamHistoryEntry` interface and `getTeamMembersForMonth()` exported helper that resolves the correct roster for any team/month combination by checking which history entries overlap with that month's date range.
- `TeamsProvider` now loads `member_team_history` from Supabase on every data refresh and exposes `memberTeamHistory` and `allMembersById` (a map of all members across all teams) through the context.
- Updated the TAM section, Goals section, and `TeamTab` component in `Index.tsx` to use `getTeamMembersForMonth()` so that viewing a past month shows the historical member count and correct TAM average (e.g. Guest Pro in February shows 2 members when Will Andrews was still there, not 1).
- Updated `TeamQuotaCard` in `Quota.tsx` to use `getTeamMembersForMonth()` for the same historical accuracy on the Quota page.
- Manually updated `member_team_history` rows in Supabase with correct start dates for all current members and recorded Will Andrews' move from Guest Pro to Sterno on March 1.
---

## 2026-03-02 (Help page — "How to Use GTMx Pilots")

### Location – Help page (`src/pages/Help.tsx`), Navigation (`src/App.tsx`)

**Rationale:** There was no in-app documentation explaining how to use the platform. New managers and reps had to learn features by exploration or word-of-mouth. Adding a dedicated Help page — accessible from the navigation bar — gives every user a comprehensive, task-oriented guide covering all sections of the app.

**Changes:**
- Created `src/pages/Help.tsx` with a full "How to Use GTMx Pilots" guide organized into 7 sections: Getting Started, Settings (Managing Teams & Members), Pilots Page (Manager Inputs, Test Signals, Player's Section, Weekly Data), Quota Page, Data & Findings Page, Real-Time Data, and Tips & Shortcuts.
- Content derived from the complete CHANGELOG history (2026-02-24 through 2026-03-02), rewritten in plain language for end users rather than developers.
- Page uses semantic design tokens (`text-foreground`, `bg-muted`, `border-border`, etc.) for full light/dark mode support.
- Includes internal `<Link>` navigation to `/settings`, `/Pilots`, `/quota`, and `/data` so users can jump directly to referenced pages.
- Each section has an `id` anchor and `scroll-mt-16` for deep-linking support.
- Added `/help` route in `src/App.tsx` mapping to the new `Help` component.
- Added a **Help** link with `HelpCircle` icon to the navigation bar, positioned to the left of the dark/light theme toggle and to the left of Settings.
---

## 2026-03-02 (Goal scope — Self vs Team goals & accelerators)

### Location – Settings (`src/pages/Settings.tsx`), Quota (`src/pages/Quota.tsx`), Pilots/Index (`src/pages/Index.tsx`), Helpers (`src/lib/quota-helpers.ts`), Context (`src/contexts/TeamsContext.tsx`), DB Types (`src/lib/database.types.ts`), Migration (`supabase/migrations/20250302000000_add_goal_scope_config.sql`)

**Rationale:** Goals and accelerators previously had no way to distinguish between an individual rep target and a shared team target. Users needed the ability to configure each metric as either a "Self" goal (measured per rep) or a "Team" goal (summing all active members), and the same flexibility for each accelerator rule's evaluation.

**Changes:**
- Added `GoalScope` type (`'individual' | 'team'`), `GoalScopeConfig`, and `DEFAULT_GOAL_SCOPE_CONFIG` to `TeamsContext.tsx`. Added `goalScopeConfig` to the `Team` interface.
- Added optional `scope?: GoalScope` field to `AcceleratorRule` interface so each accelerator rule can independently evaluate against individual or team totals.
- Updated `database.types.ts` with `goal_scope_config` on `DbTeam`. Created and applied Supabase migration adding the `goal_scope_config` jsonb column to the `teams` table with all-individual defaults.
- Updated `assembleTeams`, `updateTeam`, and `addTeam` in `TeamsContext.tsx` to read, persist, and initialize the new field.
- Added `getTeamMetricTotal()`, `getScopedMetricTotal()`, and `getAccelMetricTotal()` helpers in `quota-helpers.ts`.
- Updated `getEffectiveGoal()` so team-scoped metrics return the raw team/level goal without parity splitting.
- Updated `computeQuota`, `computeQuotaBreakdown`, `countTriggeredAccelerators`, and `getTriggeredAcceleratorDetails` to use per-rule scope for accelerators and per-metric scope for goals.
- Added a clickable **SELF / TEAM** toggle button per metric in the Monthly Goals section of the Edit Team dialog in Settings.
- Added a **SELF / TEAM** toggle button per accelerator rule in the Accelerator section of the Edit Team dialog.
- Quota page and Pilots/Index page column headers now show a "(team)" label for team-scoped metrics, and metric cells display a "Team" badge when showing summed values.
- Restored hover tooltips on accelerator lock icons on the Quota page with full detail (metric, current value, condition, effect) plus a **SELF / TEAM** badge showing the rule's scope.
- Added compact scope badges (**TM** / **SF**) to accelerator steps in the Quota Breakdown tooltip on the quota percentage.
---

## 2026-03-02 (Edit Team modal width and sticky Save button)

### Location – Settings (`src/pages/Settings.tsx`)

**Rationale:** The Edit Team modal was narrower than the rest of the Settings page content, making the dense goals and accelerator sections feel cramped. Additionally, when scrolling through a team with many settings, the "Save Changes" button disappeared off-screen, forcing users to scroll all the way down to save.

**Changes:**
- Widened the Edit Team `DialogContent` from the default `max-w-lg` (512px) to `max-w-5xl w-full` (1024px), matching the width of the Teams/Members section headers on the Settings page.
- Restructured the modal layout to use `flex flex-col overflow-hidden` so the scrollable content and footer are separate regions.
- Moved the scrollable `overflow-y-auto` from the `DialogContent` to the inner form content div with `flex-1 min-h-0` so only the form scrolls.
- Pulled the "Save Changes" button into a `shrink-0` footer with a `border-t` separator, keeping it anchored and always visible at the bottom of the modal regardless of scroll position.
---

## 2026-03-02 (Fix accelerators not applied to quota & remove icon hover tooltips)

### Location – Quota (`src/pages/Quota.tsx`), Helpers (`src/lib/quota-helpers.ts`)

**Rationale:** Accelerators were being detected and displayed as lock icons on the Quota page, but their effects were not applied to the final quota percentage. The root cause was that `computeQuota` and `computeQuotaBreakdown` only iterated enabled metrics when checking accelerator rules, while the icon logic (`countTriggeredAccelerators`) checked all metrics — so accelerators on non-enabled metrics were shown but never calculated. Additionally, hover tooltips on individual accelerator icons were removed in favor of the single consolidated breakdown tooltip on the quota percentage.

**Changes:**
- Changed accelerator evaluation loops in `computeQuota` and `computeQuotaBreakdown` to iterate over all `GOAL_METRICS` instead of only `enabledMetrics`, matching `countTriggeredAccelerators` behavior.
- Added a 200% cap (`Math.min(quota, 200)`) in both `computeQuota` and `computeQuotaBreakdown` return values so the cap is enforced at the logic level, not just display.
- Removed individual `Tooltip`/`TooltipTrigger`/`TooltipContent` wrappers from the accelerator lock icons, leaving them as plain display elements.
- Removed the now-unused `AcceleratorTooltip` component, `formatCondition` helper, `getTriggeredAcceleratorDetails` import, and `TriggeredAccelerator` type from `Quota.tsx`.
---

## 2026-03-02 (Hover tooltips on Quota page accelerator icons and quota percentage)

### Location – Quota (`src/pages/Quota.tsx`), Helpers (`src/lib/quota-helpers.ts`)

**Rationale:** The accelerator unlock icons and quota percentage on the Quota page showed outcomes but gave no visibility into how those values were determined. Adding hover tooltips lets managers quickly see the exact numbers and logic behind each accelerator unlock and the full quota calculation without leaving the page.

**Changes:**
- Added `getTriggeredAcceleratorDetails()` function in `quota-helpers.ts` that returns an array of `TriggeredAccelerator` objects (metric, current value, and the full rule) instead of just a count.
- Added `computeQuotaBreakdown()` function in `quota-helpers.ts` that returns a `QuotaBreakdown` object containing per-metric ratios (current / goal = %), base average quota, each accelerator step with before/after values, and the final quota.
- Wrapped each accelerator unlock icon (`LockOpen`/`Lock`) in a Radix tooltip showing which metric triggered it, the member's current value vs. the rule condition, and the effect on quota.
- Wrapped the quota percentage text in a Radix tooltip showing the full breakdown: each enabled metric's current/goal/%, the base average, any accelerator adjustments with arrows, and the final quota value.
- Added `cursor-help` cursor style to both hoverable elements for discoverability.
---

## 2026-03-02 (Month look-back capability on Pilots and Quota pages)

### Location – Pilots / Projects (`src/pages/Index.tsx`), Quota (`src/pages/Quota.tsx`), Helpers (`src/lib/quota-helpers.ts`, `src/lib/test-phases.ts`)

**Rationale:** There was no way to view historical monthly data. For example, on March 1 a user could not look back at February's quota, goals, or stats. Adding a month selector to the existing test phases bar lets users click any past month to see that month's data across the entire page, while keeping the current month as the default with no visual or behavioral changes.

**Changes:**
- Created shared `src/lib/test-phases.ts` extracting `ComputedPhase` type and `generateTestPhases()` from `Index.tsx` so both pages reuse the same logic; added `year`/`month` fields, plus `isCurrentMonth()` and `phaseToDate()` helpers.
- Updated `getMemberMetricTotal`, `getBusinessDaysRemaining`, `computeQuota`, and `countTriggeredAccelerators` in `quota-helpers.ts` to accept an optional `referenceDate` parameter; when omitted behavior is unchanged (current month). Past months return 0 business days remaining.
- **Pilots page:** Added `selectedMonth` state. Made each test phases bar segment and month label clickable — selecting a month highlights it with a ring/background and shows a "Viewing: [Month Year]" banner with a "Back to Current" link. Threaded `referenceDate` through tab header win counts, Monthly Goals table (active + former members), and all TeamTab stats (totals, stat cards, chart data). Updated local `getMemberTotalWins` to accept `referenceDate`. Current month view remains identical.
- **Quota page:** Added a single unified test phases bar at the top of the page that merges all active teams' month ranges into one timeline. One `selectedMonth` state controls all team cards below. Threaded `referenceDate` through `TeamQuotaCard` (business days remaining) and `MemberQuotaRow` (metric totals, quota computation, accelerator calculations).
---

## 2026-03-02 (Add stats to fallback TAM manual input)

### Location – Pilots / Projects (`src/pages/Index.tsx`)

**Rationale:** When no metrics_touched_accounts data is available, the fallback TAM section only showed an editable Total TAM input. This made it visually inconsistent with the metrics-driven version, which displays Touched Accounts, Avg TAM, and Touch Rate alongside Total TAM. Adding these stats to the fallback view gives managers the same at-a-glance context regardless of data source.

**Changes:**
- Added computed `fbTouched` (sum of member `touchedAccounts`), `fbAvg` (totalTam / active members), and `fbRate` (touch rate percentage) variables in the fallback TAM branch.
- Expanded the fallback TAM card layout to display Touched Accounts, Avg TAM, and Touch Rate as read-only stats next to the editable Total TAM input, matching the visual style of the metrics-driven version.
- Total TAM remains editable with the existing Submit/Edit workflow unchanged.
---

## 2026-03-02 (Reorder Funnel Overview metric tiles)

### Location – Pilots / Projects (`src/pages/Index.tsx`)

**Rationale:** The metric toggle tiles in the Funnel Overview chart header needed a specific display order to better reflect the logical flow from TAM through Activity, outreach metrics, pipeline stages, and feedback.

**Changes:**
- Reordered the `metricKeys` array in the `WeekOverWeekView` component from TAM → Call → Connect → Ops → Demo → Win → Feedback → Activity to the new order: TAM → Activity → Call → Connect → Ops → Demo → Win → Feedback.
- This change affects both the toggle button display order in the chart header and the chart line rendering order.
---

## 2026-03-01 (Collapsible section headers on Pilots page)

### Location – Pilots / Projects (`src/pages/Index.tsx`)

**Rationale:** The Pilots page has grown to include multiple large sections (Manager Inputs, Test Signals, Player's Section, Weekly Data). Making the section headers collapsible allows users to hide sections they aren't actively using, reducing scrolling and improving focus.

**Changes:**
- Added `ChevronDown` and `ChevronRight` lucide-react icons to the imports.
- Added `collapsedSections` state (a `Record<string, boolean>`) and a `toggleSection` helper in the `Index` component to manage the "Manager Inputs" section collapse.
- Added a separate `collapsedSections` state and `toggleSection` helper inside the `TeamTab` component to manage "Test Signals", "Player's Section", and "Weekly Data" section collapse independently per tab.
- Made the "Manager Inputs" header bar clickable — toggling hides/shows Test Phases, Mission & Purpose, Total TAM, and Monthly Goals.
- Made the "Test Signals" header bar clickable — toggling hides/shows the team summary card, stat cards, empty state, and Week Over Week chart.
- Made the "Player's Section" header bar clickable — toggling hides/shows the funnel inputs and Win Stories.
- Made the "Weekly Data" header bar clickable — toggling hides/shows the full weekly data grid.
- Each header displays a chevron-right icon when collapsed and chevron-down when expanded.
- All sections start expanded by default.
- Action buttons (e.g. "New Team", "New Member") use `e.stopPropagation()` where applicable to prevent toggling the section when clicking them.
---

## 2026-03-01 (Add wins & activity as GoalMetrics, surface superhex ops/demos/wins/feedback/activity across all pages)

### Location – Projects / Pilots (`src/pages/Index.tsx`), Quota (`src/pages/Quota.tsx`), Settings (`src/pages/Settings.tsx`), State Management (`src/contexts/TeamsContext.tsx`), Types (`src/lib/database.types.ts`), Supabase

**Rationale:** The superhex table now contains ops, demos, wins, feedback, and total_activity_count values. These needed to be surfaced across all project and quota pages. Additionally, `wins` and `activity` were not part of the GoalMetric system, meaning they couldn't have goals set, appear on the Quota page, or use accelerators.

**Changes:**
- Added `wins` and `activity` to `GOAL_METRICS` in `TeamsContext.tsx`, making them full goal metrics with toggles, level-based goals, and accelerator support across Settings, Quota, and project pages.
- Added `activity` field to `FunnelData` interface and mapped superhex `total_activity_count` into it via the merge logic.
- Added `GOAL_METRIC_LABELS` entries: `wins: 'Wins'`, `activity: 'Activity'`.
- Updated `DEFAULT_GOALS`, `DEFAULT_ENABLED_GOALS`, and `DEFAULT_TEAM_GOALS_BY_LEVEL` to include `wins` and `activity`.
- Updated `dbMemberToApp` to read `goal_wins` and `goal_activity` from member rows and `activity` from funnel rows.
- Updated `memberGoalsToDbInsert` to persist `goal_wins` and `goal_activity`.
- Updated `assembleTeams` to read `team_goal_wins`, `team_goal_activity`, `goal_enabled_wins`, `goal_enabled_activity` from team rows.
- Updated `updateTeam` DB write to persist the new team goal and enabled-goal fields.
- Superhex merge now maps `total_activity_count` → `activity` in both existing-row override and synthetic-funnel creation.
- Added `activity` input field to "Your Funnels" section and included it in all funnel upsert operations.
- Added `Activity` row to the Weekly Data Grid (per-member and team aggregate), controlled by its goal toggle.
- Added `wins` to the `alwaysShow` set so the Wins row always appears in the Weekly Data Grid regardless of goal toggle state.
- Added `Activity` to the Week Over Week chart with color `hsl(60, 60%, 45%)`.
- Expanded Test Signals stat cards from 4 to 5: Ops, Demos, Wins, Feedback, Activity (with `Activity` icon from lucide-react).
- Replaced "⏰ Totals due by team meeting" text with "Any value entered in here will completely overwrite the value given by the report."
- Added `goal_wins` and `goal_activity` columns to `members` table, `team_goal_wins`, `team_goal_activity`, `goal_enabled_wins`, `goal_enabled_activity` columns to `teams` table, and `activity` column to `weekly_funnels` table in Supabase (migration applied + local migration file created).
- Updated `DbTeam`, `DbMember`, and `DbWeeklyFunnel` interfaces in `database.types.ts` to match new schema.
- Settings page auto-adapts: wins and activity goal toggles, level-based goal inputs, and accelerator rules now appear automatically since Settings iterates over `GOAL_METRICS`.
- Quota page auto-adapts: wins and activity metrics appear with progress bars, needed/day calculations, and quota percentages when their goal toggles are enabled.
---

## 2026-03-01 (Update Ops and Demos stat card icons and colors)

### Location – Dashboard (`src/pages/Index.tsx`)

**Rationale:** The Ops and Demos stat cards on the dashboard used generic icons (Target and TrendingUp) that didn't clearly communicate what each metric represents. Updated to more descriptive icons and swapped colors to better visually distinguish the cards.

**Changes:**
- Changed the Ops stat card icon from `Target` to `Handshake` and updated its color from orange (`text-primary`) to blue (`text-accent`).
- Changed the Demos stat card icon from `TrendingUp` to `Video` and updated its color from blue (`text-accent`) to orange (`text-primary`).
- Updated lucide-react imports accordingly (added `Handshake`, `Video`; removed unused `Target`).
---

## 2026-03-01 (Replace TAM→Call with Touch Rate from metrics_touched_accounts)

### Location – Projects / Pilots (`src/pages/Index.tsx`), State Management (`src/contexts/TeamsContext.tsx`)

**Rationale:** New Supabase tables (`metrics_touched_accounts`) now hold externally sourced TAM and touched-account data per rep. The old TAM→Call metric (which relied on manually submitted Total TAM divided across members and stored in `weekly_funnels`) needed to be replaced with the new Touch Rate metric (`touched_accounts / tam`) sourced from this table, while preserving the manual TAM input as a fallback for projects that don't yet have metrics data.

**Changes:**
- Added `touchedAccounts` and `touchedTam` fields to the `TeamMember` interface. These are populated by matching `metrics_touched_accounts.rep_name` to member names (case-insensitive) during data load.
- `TeamsContext.loadAll()` now fetches `metrics_touched_accounts` from Supabase and assigns aggregated values to each team member after team assembly.
- **Total TAM card**: When metrics data exists, displays a read-only row with Total TAM, Touched Accounts, Avg TAM (per rep), and Touch Rate. Falls back to the original manual input + Submit flow when no metrics data is present.
- **Header conversion rate card**: Shows "Touch Rate" (touched_accounts / tam) when metrics data exists; falls back to "TAM→Call" (calls / totalTam) otherwise.
- **Weekly Data grid TAM row**: Uses `m.touchedTam` per member when metrics data exists; falls back to `getCarriedTam()` (carried-forward per-week TAM from `weekly_funnels`).
- **Weekly Data grid conversion rates**: First row becomes "Touch Rate" (Total column only, per-week shows "—") when metrics data exists; falls back to "TAM→Call %" with per-week calculations.
- **Team Monthly Aggregate**: Same fallback pattern for TAM values and the first conversion rate row.
- **Funnel Overview chart**: TAM data line uses `m.touchedTam` when available, otherwise `getCarriedTam()`.
- **Funnel Overview per-player stats**: Shows "Touch Rate" or "TAM→Call" with matching calculation depending on data availability.
- All fallback logic keyed on `hasMetricsTam = members.some(m => m.touchedTam > 0)` — consistent across all sections.
---

## 2026-03-01 (Add total_ops & total_feedback to Superhex, Merge into Funnels)

### Location – Database (`supabase/migrations/`), Types (`src/lib/database.types.ts`), State Management (`src/contexts/TeamsContext.tsx`), Supabase

**Rationale:** The superhex table was missing `total_ops` and `total_feedback` columns, which meant opportunity and feedback data from external sources could not flow through the superhex-to-funnel merge pipeline. Adding these columns allows superhex rows to fully populate all funnel metrics automatically.

**Changes:**
- Added `total_ops integer NOT NULL DEFAULT 0` column to the `superhex` table in Supabase (logically before `total_demos`).
- Added `total_feedback integer NOT NULL DEFAULT 0` column to the `superhex` table in Supabase (logically after `total_wins`).
- Created two new migration files: `20250301000000_add_total_ops_to_superhex.sql` and `20250301010000_add_total_feedback_to_superhex.sql`.
- Updated the base migration `20250225240000_create_superhex.sql` to include both new columns for fresh installs.
- Added `total_ops` and `total_feedback` to the `DbSuperhex` TypeScript interface in `database.types.ts`.
- Updated the superhex merge logic in `TeamsContext.tsx` to map `row.total_ops` → `f.ops` and `row.total_feedback` → `f.feedback` for both existing manual rows (baseline merge) and synthetic funnel rows.
---

## 2026-03-01 (Add External Metrics Tables to Supabase)

### Location – Database (`supabase/migrations/`), Types (`src/lib/database.types.ts`), Supabase

**Rationale:** New Supabase tables were needed to store externally sourced metrics data (TAM, touched accounts, demos, opportunities, wins, and feedback) for reporting and analytics across the GTMx platform.

**Changes:**
- Created 6 new Supabase tables: `metrics_tam`, `metrics_touched_accounts`, `metrics_demos`, `metrics_ops`, `metrics_wins`, and `metrics_feedback`.
- Each table follows existing schema patterns: UUID primary key, `created_at`/`updated_at` timestamps with auto-update triggers, and RLS enabled with open CRUD policies.
- `metrics_tam`: stores TAM per rep by source.
- `metrics_touched_accounts`: stores touched account counts, TAM, and touch rate per rep by source.
- `metrics_demos`: stores demo counts per rep per activity week.
- `metrics_ops`: stores opportunity records with close week, name, rep, team, and win status (boolean).
- `metrics_wins`: stores win records per rep with activity week, date added, name, team, and source.
- `metrics_feedback`: stores feedback completion counts and chorus comments per rep per activity week.
- Added corresponding TypeScript interfaces (`DbMetricsTam`, `DbMetricsTouchedAccounts`, `DbMetricsDemos`, `DbMetricsOps`, `DbMetricsWins`, `DbMetricsFeedback`) to `database.types.ts`.
- Created local migration file `20250301000000_create_metrics_tables.sql` and applied migration directly to Supabase.
---

## 2026-02-26 (Remove Accounts, Contacts Added, and Wins Goal from Goal Metrics)

### Location – Pilot pages (`src/pages/Index.tsx`), Settings (`src/pages/Settings.tsx`), State Management (`src/contexts/TeamsContext.tsx`), Types (`src/lib/database.types.ts`), Supabase

**Rationale:** The "Accounts" and "Contacts Added" funnel fields were no longer needed as tracked metrics. Additionally, the per-member "Wins Goal" was removed from the configurable goal metrics system, simplifying member creation and the team progress display. Ducks are now earned every 3 wins rather than at percentage milestones of a goal.

**Changes:**
- Removed `accounts` and `contacts_added` from `GOAL_METRICS`, `GOAL_METRIC_LABELS`, `DEFAULT_GOALS`, `DEFAULT_TEAM_GOALS_BY_LEVEL`, `DEFAULT_ENABLED_GOALS`, `FunnelData` interface, and all DB mapping/payload functions in `TeamsContext.tsx`.
- Removed `accounts` and `contacts_added` fields from `DbTeam`, `DbMember`, and `DbWeeklyFunnel` type interfaces in `database.types.ts`.
- Removed "Accounts" and "Contacts Added" input fields from the Player's Section form in `Index.tsx`.
- Removed "Accounts" and "Contacts Added" rows from the Weekly Data table and Team Monthly Aggregate table.
- Removed "Accounts" from the Funnel Overview chart metric colors and keys.
- Removed `accounts` and `contacts_added` from all Supabase upsert payloads (TAM submit, weekly funnel submit).
- Created and applied Supabase migration to drop `accounts`, `contacts_added`, `goal_accounts`, `goal_contacts_added`, `team_goal_accounts`, `team_goal_contacts_added`, `goal_enabled_accounts`, and `goal_enabled_contacts_added` columns.
- Removed `wins` from `GOAL_METRICS` so it is no longer a configurable/toggleable goal metric (wins are still tracked as a funnel field).
- Removed wins goal input from the "Add Member" dialog on both the Pilots page and Settings page.
- Removed the "Wins Goal" column and inline editing from the Settings members table.
- Removed the team progress bar, goal percentage display, and "Team goal reached" celebration from the team section header.
- Changed duck earning logic from percentage-of-goal milestones to every 3 wins.
- Updated the wins detail dialog title to show count only (no goal denominator).
---

## 2026-02-26 (Team Section Header Text Color)

### Location – Pilot pages (`src/pages/Index.tsx`)

**Rationale:** The Team aggregate section in the Weekly Data table uses a dark `bg-secondary` background, but the header text ("Team", month labels like "JAN 2026", and "Total") was styled with `text-primary` / `text-muted-foreground`, making it hard to read against the dark background. Switching to white text improves contrast and readability.

**Changes:**
- Changed the "Team" label from `text-primary` to `text-white`.
- Changed the month header cells (e.g. "JAN 2026", "FEB 2026") from `text-muted-foreground` to `text-white`.
- Changed the "Total" header cell from `text-muted-foreground` to `text-white`.
---

## 2026-02-26 (Netlify SPA Redirect Fix)

### Location – Deployment (`public/_redirects`)

**Rationale:** The app deployed on Netlify returned a 404 when refreshing or directly navigating to any route other than the root. Because the app is a single-page application using client-side routing (React Router), Netlify's server needs to be told to serve `index.html` for all paths so the client-side router can handle them.

**Changes:**
- **`public/_redirects`**: Created a Netlify redirects file with the rule `/* /index.html 200`, which instructs Netlify to serve the SPA's `index.html` for every URL path with a 200 status, allowing React Router to resolve routes client-side.
---

## 2026-02-26 (Team Monthly Aggregate in Weekly Data Table)

### Location – Pilot pages (`src/pages/Index.tsx`)

**Rationale:** The Weekly Data table showed individual member metrics by week but provided no way to see aggregated team-level performance at a glance. Stakeholders needed a rolled-up team view broken down by month rather than by week to assess overall trends without manually summing member rows.

**Changes:**
- **`getTeamMonthKeys` helper** (`Index.tsx`): Added a utility function that groups a team's weekly date keys by calendar month, returning each month's label (e.g. "Jan 2026"), its constituent week keys, and a `colSpan` value matching the number of weeks in that month — used to align monthly cells across the existing weekly column grid.
- **Line separator**: Added a thick `border-t-4` divider row spanning the full table width below the last member's rows, providing a clear visual break between individual and team-level data.
- **Team monthly aggregate rows**: Below the separator, a new "Team" section displays month-labelled columns (via `colSpan`) with aggregated metrics across all members. Includes the same funnel metrics (TAM, Accounts, Contacts Added, Call, Connect, Ops, Demo, Win, Feedback) and conversion rates (TAM→Call %, Call→Con %, Con→Demo %, Demo→Win %) as the per-member rows, filtered by the team's enabled goals.
- **TAM handling**: Monthly team TAM uses each member's latest carried TAM value for the last week of that month, summed across all members. The Total column uses the latest carried TAM across the entire date range.
- **Opaque sticky columns**: Fixed the Team section's sticky Player, Metric, and Total columns to use fully opaque `bg-secondary` backgrounds (instead of semi-transparent `bg-secondary/60` / `bg-secondary/40`) so horizontally-scrolled content does not bleed through.
---

## 2026-02-26 (Backfill Historic TAM Values)

### Location – Database (`public.weekly_funnels` table in Supabase)

**Rationale:** Historic TAM values were missing for several project teams, leaving weekly funnel data blank from the week of 9/29/2025 onward (and from 6/30/2025 for Guest Pro). These needed to be manually populated so historical reporting and funnel metrics reflect accurate TAM figures.

**Changes:**
- **Project Sterno** (3 members: Morgan Weeks, Ross Armstrong, Will Andrews): Inserted 61 new `weekly_funnels` rows with TAM = 433 per member (1300 / 3) for weeks 2025-09-29 through 2026-02-23. Five pre-existing rows already had TAM = 433 and were left unchanged.
- **Project Mad Max** (3 members: Carly King, Shane Hughes, Zoe Lang): Inserted 60 new `weekly_funnels` rows with TAM = 600 per member (1800 / 3) for weeks 2025-09-29 through 2026-02-23. Six pre-existing rows already had TAM = 600 and were left unchanged.
- **Project Guest Pro** (1 member: Lo Picton): Inserted 20 new `weekly_funnels` rows with TAM = 2400 (2400 / 1) for weeks 2025-09-29 through 2026-02-23. Two pre-existing rows were updated from TAM = 4000 to TAM = 2400 for consistency. Additionally, inserted 13 new rows with TAM = 2400 for the earlier range of weeks 2025-06-30 through 2025-09-22.
---

## 2026-02-25 (Superhex Realtime Sync)

### Location – Context (`src/contexts/TeamsContext.tsx`), Database (`supabase/migrations/20250225250000_enable_superhex_realtime.sql`)

**Rationale:** New rows added to the `superhex` table in Supabase were not reflected in the web app until the user manually refreshed the page. The data was only fetched once on component mount with no subscription to live changes. Enabling Supabase Realtime ensures reps' activity metrics appear automatically as soon as they are inserted or updated — no refresh required.

**Changes:**
- **Supabase migration** (`20250225250000_enable_superhex_realtime.sql`): Added `public.superhex` to the `supabase_realtime` publication via `ALTER PUBLICATION supabase_realtime ADD TABLE public.superhex`. Migration applied to Supabase via MCP.
- **TeamsContext** (`TeamsContext.tsx`): Extracted the inline `load()` function into a stable `loadAll` callback (wrapped in `useCallback`) so it can be invoked both on initial mount and from the realtime handler. Added a Supabase Realtime channel (`superhex-realtime`) that subscribes to all `postgres_changes` events (`INSERT`, `UPDATE`, `DELETE`) on the `superhex` table. On any change, `loadAll()` is called to re-fetch and re-merge all data. The channel is cleaned up on unmount via `supabase.removeChannel(channel)`.
---

## 2026-02-25 (Load Superhex Metrics & Uncap Monthly Goal Percentages)

### Location – Pilot pages (`src/pages/Index.tsx`), Context (`src/contexts/TeamsContext.tsx`)

**Rationale:** Weekly rep metrics (calls, connects, demos, wins) were being entered manually, but the data already exists in the `superhex` Supabase table populated from an external source. Loading this data as the baseline — with manual entries still taking precedence — eliminates duplicate data entry. Additionally, Monthly Goals percentages were capped at 100%, hiding the fact that reps had exceeded their targets (e.g., 732/600 calls showing 100% instead of 122%).

**Changes:**
- **TeamsContext** (`TeamsContext.tsx`): Added `DbSuperhex` import. Extended the initial `load()` fetch to also query the `superhex` table. Added merge logic that builds a case-insensitive name lookup from `members`, matches each `superhex.rep_name` to a `member_id`, and either creates a synthetic `DbWeeklyFunnel` row (when no manual entry exists) or overlays superhex values as baseline (when a manual row exists, non-zero manual values take precedence). Unmatched rep names are logged to the console as warnings. Column mapping: `calls_count` → `calls`, `connects_count` → `connects`, `total_demos` → `demos`, `total_wins` → `wins`. `total_activity_count` is not yet mapped.
- **Monthly Goals percentages** (`Index.tsx`): Removed the `Math.min(..., 100)` cap on displayed percentages in three places: active members, former members, and the team-level progress section. The progress bar width remains capped at 100% via a separate `barPct` variable. Percentage text now turns green (`text-green-400`) with bold weight when >= 100%. Team-level progress text also turns green when >= 100%.
---

## 2026-02-25 (Monthly-Scoped Goal & Quota Calculations)

### Location – Quota page (`src/pages/Quota.tsx`), Pilot pages (`src/pages/Index.tsx`), Helpers (`src/lib/quota-helpers.ts`)

**Rationale:** Monthly goals and quota calculations were summing metric values across all time instead of only the current calendar month. For example, calls logged in January were inflating the February numerator. Goals should reflect only activity from the 1st through the end of the current month.

**Changes:**
- **`getMemberMetricTotal`** (`quota-helpers.ts`): Changed from summing all `funnelByWeek` entries to filtering by the current month prefix (e.g., `"2026-02-"`). Only weeks whose Monday (`week_key`) falls within the current calendar month are included. This affects the Quota page display (`current / goal`), the `computeQuota` percentage calculation, accelerator rule evaluation, and the `countTriggeredAccelerators` helper.
- **`getMemberTotalWins`** (`Index.tsx`): Applied the same current-month filter so that the team tab header win badges and the Test Signals total wins reflect only the current month's data.
- Both functions use `Object.entries` instead of `Object.values` to access the `week_key` for date filtering. No database or schema changes required — this is purely a client-side aggregation fix.
---

## 2026-02-25 (Monthly Goals, Levels, Accelerator & Quota Enhancements)

### Location – Settings (`src/pages/Settings.tsx`), Pilot pages (`src/pages/Index.tsx`), Quota page (`src/pages/Quota.tsx`), Context (`src/contexts/TeamsContext.tsx`), Helpers (`src/lib/quota-helpers.ts`), Types (`src/lib/database.types.ts`), Database (`teams` and `members` tables)

**Rationale:** Goal configuration needed to move from the individual project pages into the centralized Settings > Team > Edit Modal so that admins can enable/disable metrics, set per-level monthly goals, and define stackable accelerator rules that modify the Quota calculation — all from one place. Members also needed a "Level" field (ADR, BDR, Rep, Senior, Principal, Lead) so that different roles can have different goal targets.

**Changes:**
- **Supabase migrations**: Added 7 `goal_enabled_*` boolean columns and `accelerator_config` JSONB column to `teams` table (`20250225290000`). Added `level` text column to `members` and `team_goals_by_level` JSONB column to `teams` (`20250225300000`). All migrations applied to Supabase via MCP.
- **Database types** (`database.types.ts`): Added `goal_enabled_*` booleans, `accelerator_config`, and `team_goals_by_level` to `DbTeam`. Added `level` to `DbMember`.
- **TeamsContext** (`TeamsContext.tsx`): Added `AcceleratorRule`, `AcceleratorConfig` (array-based for stackable rules), `MemberLevel`, `MEMBER_LEVELS`, `MEMBER_LEVEL_LABELS`, `EnabledGoals`, `TeamGoalsByLevel` types and constants. Extended `Team` with `enabledGoals`, `acceleratorConfig`, `teamGoalsByLevel`. Extended `TeamMember` with `level`. Updated `assembleTeams`, `updateTeam`, `addTeam`, `createMember`, `assignMember`, `unassignMember`, and `updateMember` to handle all new fields.
- **Settings > Team Edit Modal** (`Settings.tsx`): Added "Monthly Goals" section below dates with metric toggle switches, parity toggle, and a horizontally-scrollable table with sticky metric names and per-level (ADR/BDR/Rep/Senior/Principal/Lead) goal input columns. Added "Accelerator" section with stackable IF/THEN rules per metric (any metric, not just enabled ones), each with condition operator (>, <, between), action operator (+, -, *), value, unit (% or #), and "to Quota" target. Rules can be added/removed individually per metric.
- **Settings > Members Table** (`Settings.tsx`): Added "Level" column with dropdown selector (ADR, BDR, Rep, Senior, Principal, Lead) between Name and Wins Goal.
- **Project Page** (`Index.tsx`): Removed parity toggle and editable goal inputs from Monthly Goals section (now managed in Settings). Monthly Goals and Weekly Data now filter columns/rows by `team.enabledGoals`. Goals display as read-only values. Removed unused `Switch` import.
- **Quota Page** (`Quota.tsx`): Filters metric columns by enabled goals. Displays computed Quota % (left-aligned below member name, capped at 200%, colored `#006400` green when >100%). Shows accelerator tier lock icons: unlock with "1" for 1 triggered rule, unlock with "2" for 2, and a locked icon with "MAX" for 3+.
- **Quota Helpers** (`quota-helpers.ts`): Updated `getEffectiveGoal` to use level-based goals from `teamGoalsByLevel` (with parity dividing by same-level member count), falling back to old behavior for members without a level. Added `computeQuota` function (average completion % across enabled metrics, with all matching accelerator rules stacked in order). Added `countTriggeredAccelerators` helper for the lock icon display.
---

## 2026-02-25 (Add "Contacts Added" to Monthly Goals System)

### Location – All Pilot pages (`src/pages/Index.tsx`), Context (`src/contexts/TeamsContext.tsx`), Types (`src/lib/database.types.ts`), Database (`members` and `teams` tables)

**Rationale:** After adding "Contacts Added" as a weekly funnel metric, it also needed to be tracked as a monthly goal — with individual member targets and team-level parity support — consistent with the other six goal metrics (Accounts, Calls, Ops, Demos, Wins, Feedback).

**Changes:**
- **Supabase migration**: Added `goal_contacts_added` (integer, default 0) to the `members` table and `team_goal_contacts_added` (integer, default 0) to the `teams` table. Local migration file: `20250225280000_add_goal_contacts_added_to_members_and_teams.sql`.
- **Database types** (`database.types.ts`): Added `goal_contacts_added` to `DbMember` and `team_goal_contacts_added` to `DbTeam`.
- **TeamsContext** (`TeamsContext.tsx`): Added `contacts_added` to `GOAL_METRICS` array (between Accounts and Calls). Added `'Contacts Added'` label to `GOAL_METRIC_LABELS`. Added `contacts_added: 0` to `DEFAULT_GOALS`. Updated `dbMemberToApp`, `assembleTeams`, `memberGoalsToDbInsert`, and team goal persistence in `updateTeam` to include the new field.
- **Monthly Goals UI**: No explicit UI changes needed — the Goals section dynamically iterates `GOAL_METRICS`, so the "Contacts Added" column automatically appears in the goals table, parity team-level inputs, and per-member goal inputs on all pilot pages.
---

## 2026-02-25 (Rename "Goals" Section to "Monthly Goals")

### Location – Pilot pages (`src/pages/Index.tsx`)

**Rationale:** The Goals section heading needed to be more descriptive, clarifying that the targets shown are monthly goals rather than generic or cumulative goals.

**Changes:**
- Renamed the `<h3>` section header from "Goals" to "Monthly Goals" on all pilot project pages in `src/pages/Index.tsx`.
---

## 2026-02-25 (Add "Contacts Added" Field to Weekly Funnels)

### Location – All Pilot pages (`src/pages/Index.tsx`), Context (`src/contexts/TeamsContext.tsx`), Types (`src/lib/database.types.ts`), Database (`weekly_funnels` table)

**Rationale:** The team needed to track the number of contacts added each week as a distinct metric, separate from accounts and calls. This new integer field sits between Accounts and Cx Called in the Player's Section funnel form, and between Accounts and Call in the Weekly Data grid.

**Changes:**
- **Supabase migration**: Added `contacts_added` (integer, default 0) column to the `weekly_funnels` table via `apply_migration`. Local migration file: `20250225270000_add_contacts_added_to_weekly_funnels.sql`.
- **Database types** (`database.types.ts`): Added `contacts_added: number` to `DbWeeklyFunnel`.
- **TeamsContext** (`TeamsContext.tsx`): Added `contacts_added: number` to `FunnelData` interface. Updated `dbMemberToApp` to map the new DB column.
- **Player's Section** (`Index.tsx`): Added "Contacts Added" numeric input field before "Cx Called" in the funnel form grid. Updated `emptyFunnel` and the Supabase upsert payload to include `contacts_added`.
- **Weekly Data grid** (`Index.tsx`): Added "Contacts Added" metric row between Accounts and Call, displaying per-week values with totals.
---

## 2026-02-25 (Apply Goals System Migration to Live Supabase)

### Location – Database (`members`, `teams`, `weekly_funnels` tables in live Supabase project)

**Rationale:** The goals system migration (`20250225260000_add_goals_system.sql`) had been committed to the repo but was never executed against the live Supabase project. The `members` and `teams` tables were missing the goal columns, so the Goals UI could not read or persist any goal data.

**Changes:**
- Applied `20250225260000_add_goals_system.sql` to the live Supabase project via the Supabase MCP `apply_migration` tool.
- **`members` table**: Added 6 per-metric goal columns — `goal_accounts`, `goal_calls`, `goal_ops`, `goal_demos`, `goal_wins` (default 30), `goal_feedback` (all integer, default 0). Migrated any existing non-default `goal` values into `goal_wins`.
- **`teams` table**: Added `goals_parity` (boolean, default false) and 6 team-level goal columns — `team_goal_accounts`, `team_goal_calls`, `team_goal_ops`, `team_goal_demos`, `team_goal_wins`, `team_goal_feedback` (all integer, default 0).
- **`weekly_funnels` table**: Added `ops` column (integer, default 0). Included a conditional conversion of `feedback` from text to integer (no-op since it was already integer).
- Verified all new columns are present in the live database via `list_tables`.
---

## 2026-02-25 (Goals Section — Replace Win Goals with Full Metric Goals + Parity Toggle)

### Location – All Pilot pages (`src/pages/Index.tsx`), Settings (`src/pages/Settings.tsx`), Context (`src/contexts/TeamsContext.tsx`), Types (`src/lib/database.types.ts`), Database (`members`, `teams`, `weekly_funnels` tables)

**Rationale:** The "Win Goals – Mad Max" section only tracked a single metric (wins) per member. The team needed visibility into all six key metrics — **Accounts, Calls, Ops, Demos, Wins, Feedback** — with goal targets and progress tracking for each. A "Parity" toggle was also needed so managers can choose between dividing team-level goals equally among members or setting goals manually per person.

**Changes:**
- **Renamed "Win Goals – {team}" to "Goals"**: The section header is now simply "Goals" and no longer includes the team name, keeping it clean and metric-agnostic.
- **Parity toggle**: Added a `Switch` toggle labeled "Parity" in the Goals section header. When ON, a team-level goals row appears where the manager sets total targets for all 6 metrics; each member's goal is auto-computed as `team_goal / active_member_count`. When OFF, each member has individually editable goal inputs per metric.
- **6-metric goals table**: The Goals section now renders a table with columns for each metric. Each cell shows the numerator (actual, summed from weekly funnels) and denominator (goal target) with a mini progress bar and percentage. Active members have editable goals (when parity is off); former members are shown read-only at reduced opacity.
- **Database migration** (`20250225260000_add_goals_system.sql`): Added `ops` integer column to `weekly_funnels`. Converted `feedback` from text to integer. Added 6 `goal_*` columns to `members`. Added `goals_parity` boolean and 6 `team_goal_*` columns to `teams`. Migrated existing `goal` values into `goal_wins`.
- **Database types** (`database.types.ts`): `DbTeam` gained `goals_parity` and `team_goal_*` fields. `DbMember` gained `goal_*` fields. `DbWeeklyFunnel` gained `accounts`, `ops`, `feedback`.
- **TeamsContext**: Exported `GOAL_METRICS`, `GoalMetric`, `GOAL_METRIC_LABELS`, `MemberGoals`, `DEFAULT_GOALS`. Replaced `TeamMember.goal: number` with `TeamMember.goals: MemberGoals`. Added `Team.goalsParity` and `Team.teamGoals`. Updated `createMember` to accept `Partial<MemberGoals>`, `updateMember` to accept `goals?: Partial<MemberGoals>`. All DB persistence (insert/update/upsert) handles the expanded goal and funnel fields.
- **Player's Section** (`Index.tsx`): Added Accounts, Ops, and Feedback inputs to the weekly funnel form alongside existing Calls, Connects, Demos, Wins. All upsert calls include the new columns.
- **Weekly Data Grid** (`Index.tsx`): Added Accounts, Ops, and Feedback metric rows per member.
- **Week Over Week Chart** (`Index.tsx`): Added Accounts, Ops, and Feedback as selectable chart lines with dedicated colors.
- **Settings** (`Settings.tsx`): Member creation uses new `createMember(name, { wins: goal })` API. Inline goal editing dispatches `{ goals: { wins: num } }`. "Goal" column header renamed to "Wins Goal" for clarity. All `m.goal` references updated to `m.goals.wins`.
- **Duck milestone system**: Updated to use `member.goals.wins` instead of the old `member.goal`.
- **Consistency**: Since the Goals section is rendered inside the team tab loop, all pilot pages automatically receive the identical Goals UI with their own team-specific data and parity state.
---

## 2026-02-25 (Add Accounts & Feedback Fields to Weekly Funnels + Goals System)

### Location – All Pilot pages (`src/pages/Index.tsx`), Context (`src/contexts/TeamsContext.tsx`), Types (`src/lib/database.types.ts`), Database (`weekly_funnels`, `members`, `teams` tables)

**Rationale:** The weekly funnel input form and data grid were missing two key data points: **Accounts** (the number of accounts a rep is working) and **Feedback** (a numeric feedback score). Both needed to be captured per member per week and displayed throughout the UI — in the "Your Funnels" input form, the "Weekly Data" read-only grid, and the "Funnel Overview" chart.

**Changes:**
- **Supabase migrations**: Added `accounts` (integer, default 0) and `feedback` (integer, default 0) columns to the `weekly_funnels` table. Added per-member goal columns (`goal_accounts`, `goal_calls`, `goal_ops`, `goal_demos`, `goal_wins`, `goal_feedback`) to the `members` table. Added team-level goal columns and `goals_parity` flag to the `teams` table.
- **Database types** (`database.types.ts`): Updated `DbWeeklyFunnel` with `accounts`, `ops`, and `feedback` fields. Updated `DbMember` with per-metric goal columns. Updated `DbTeam` with team goal columns and `goals_parity`.
- **TeamsContext**: Introduced a `GOAL_METRICS` system with `MemberGoals` type and `DEFAULT_GOALS`. Replaced the single `goal` field on `TeamMember` with a `goals` record keyed by metric. Added `goalsParity` and `teamGoals` to `Team`. Updated `dbMemberToApp`, `assembleTeams`, and all mutation functions (`createMember`, `updateMember`, `assignMember`, `unassignMember`, `updateTeam`) to handle the new goals structure and persist all fields to Supabase.
- **Your Funnels section** (`Index.tsx`): Added **Accounts** numeric input before "Cx Called" and **Feedback** numeric input as the last field. Grid expanded from 4 to 6 columns (`sm:grid-cols-3 lg:grid-cols-6`).
- **Weekly Data grid** (`Index.tsx`): Added **Accounts** metric row between TAM and Call, and **Feedback** metric row after Win. Both display per-week values with totals, consistent with all other numeric metrics.
- **Funnel Overview chart** (`Index.tsx`): Added Accounts and Feedback as chartable metrics with dedicated colors. Both are included in the default selected metrics.
- **All Supabase upsert calls**: Updated to include `accounts` and `feedback` fields so data is preserved during TAM submission and weekly funnel upserts.
---

## 2026-02-25 (Superhex `activity_week` Column Changed to Date Type)

### Location – Database (Supabase `superhex` table), `supabase/migrations/20250225240000_create_superhex.sql`

**Rationale:** The `activity_week` column was storing full ISO timestamps (e.g. `2026-02-23T07:00:00.000Z`) instead of clean `yyyy-mm-dd` dates. Changing the column from `text` to `date` ensures Postgres always stores and returns the `yyyy-mm-dd` format regardless of input.

**Changes:**
- **Altered column type**: Changed `activity_week` from `text` to `date` in the live Supabase database. Existing timestamp values were cast to date automatically.
- **Updated local migration**: `supabase/migrations/20250225240000_create_superhex.sql` updated to reflect `date` type for `activity_week`.
---

## 2026-02-25 (Superhex Table Added to Supabase)

### Location – Database (Supabase `superhex` table), `src/lib/database.types.ts`

**Rationale:** A new `superhex` table was needed to store weekly rep activity metrics (calls, connects, demos, wins, and total activity count) for reporting and analytics. This is a backend-only schema addition with no front-end page impact.

**Changes:**
- **New Supabase table `superhex`**: Created with columns `rep_name` (text), `activity_week` (date), `total_activity_count` (integer), `calls_count` (integer), `connects_count` (integer), `total_demos` (integer), `total_wins` (integer), plus `id`, `created_at`, and `updated_at` metadata fields.
- **Indexes**: Added indexes on `rep_name` and `activity_week` for efficient querying.
- **Row-level security**: Enabled with open select/insert/update/delete policies, matching the project's existing RLS pattern.
- **Auto-updating trigger**: `trg_superhex_updated_at` fires on update using the shared `set_updated_at()` function.
- **Migration file**: `supabase/migrations/20250225240000_create_superhex.sql` added for local tracking.
- **TypeScript type**: `DbSuperhex` interface added to `src/lib/database.types.ts` with all table columns typed.
- **Applied to Supabase**: Migration pushed to the live Supabase project via the Supabase MCP plugin.
---

## 2026-02-25 (Total TAM Flows into Weekly Data with Carry-Forward)

### Location – All Pilot pages (`src/pages/Index.tsx`), Database (`weekly_funnels` table via Supabase)

**Rationale:** When a manager entered and submitted a Total TAM value, it was only saved to the `teams` table and used for the team-level TAM→Call conversion rate. The per-member TAM value never reached the `weekly_funnels` table, so the Weekly Data grid always showed "—" for TAM, and per-member TAM→Call conversion rates could not be calculated. The fix makes Total TAM a manager-submitted value that divides across members, persists week-over-week, and logs changes by only writing to the week when the value is updated.

**Changes:**
- **TAM Submit handler**: When the manager clicks "Submit" on Total TAM, the system now calculates `tamPerMember = Math.round(totalTam / activeMembers)` and upserts a `weekly_funnels` row for every active member on the team for the current week, setting their `tam` field to the per-member value.
- **Added `getCarriedTam()` helper**: Scans backward through ordered week keys to find the most recent non-zero TAM for a member. This enables TAM to persist (carry forward) every week until a new value is submitted, without needing to write duplicate rows for every future week.
- **Weekly Data grid — TAM row**: TAM cells now display the carried-forward value instead of only the raw funnel value. If TAM was set in week 3, weeks 4, 5, 6, etc. all show that value until a new TAM is written.
- **Weekly Data grid — TAM total column**: Shows the current/latest carried-forward TAM per member (not a sum across weeks, since TAM isn't cumulative).
- **Weekly Data grid — TAM→Call % conversion row**: The denominator now uses the carried-forward TAM instead of the raw (often zero) funnel TAM, so conversion percentages display correctly for all weeks.
- **Funnel Overview chart**: Team-total and individual-player TAM lines use carried-forward values, ensuring the chart reflects the actual TAM throughout the pilot period.
- **Player conversion rates** (below the Funnel Overview chart): TAM→Call averages for selected players now use carried-forward TAM, matching the chart above.
- **Edit & re-submit flow**: When a manager clicks "Edit", changes the Total TAM, and re-submits, the new per-member TAM is written to the current week — creating a new log entry. Prior weeks retain their old TAM values; the new value carries forward from this week onward.
- **Manual data seed**: Inserted TAM = 533 per member (1600 / 3) for the Mad Max team for the week of 2025-09-29 directly in Supabase to backfill historical data.
- All pilot/project pages remain identical in appearance and operation — changes are in shared helper functions and the `TeamTab` component.
---

## 2026-02-25 (Test Phases Blank Description Shows Em Dash)

### Location – All Pilot pages (`src/pages/Index.tsx`)

**Rationale:** When a test phase had no description, the input showed the placeholder "Add description...", which looked like instructional text. Showing an em dash (—) for blank descriptions keeps the UI minimal and consistent with other empty-state treatments.

**Changes:**
- In the Test Phases section, changed the phase description input placeholder from "Add description..." to "—" so blank descriptions display an em dash instead.
---

## 2026-02-25 (Surface Weekly Roles in SELECT PLAYERS & Chart Tooltip)

### Location – All Pilot pages (`src/pages/Index.tsx`)

**Rationale:** Member roles selected for the week (e.g. TOFU, Closing) were not surfacing in two key areas: the SELECT PLAYERS buttons below the Funnel Overview chart showed a dash ("—") even when a role was set, and hovering over any week on the chart gave no indication of what role each member was playing that week.

**Changes:**
- Verified the SELECT PLAYERS section already reads each member's role from `funnelByWeek[currentWeek].role` — the dash only appears when no role has been selected yet in the "Your Funnels" section. Once a role is chosen, it propagates immediately to the player button label.
- Added `_roles` metadata (member name → role mapping) to each chart data point so role information is available per-week, not just for the current week.
- Created a custom `FunnelTooltip` component replacing the default Recharts tooltip. The tooltip now shows: (1) the week label, (2) each visible metric with a color-matched dot and value, and (3) a "Roles this week" section listing every member who had a role set for the hovered week.
- Replaced the inline `contentStyle` tooltip with `<Tooltip content={<FunnelTooltip />} />`.
- All pilot/project pages remain identical in appearance and operation (changes are in the shared `WeekOverWeekView` component).
---

## 2026-02-25 (Fix Funnel Overview Player Conversion Rate Averages & Add Role Tooltips)

### Location – All Pilot pages (`src/pages/Index.tsx`)

**Rationale:** The per-player conversion rates (TAM→Call, Call→Connect, Connect→Demo, Demo→Win) displayed below the "Select Players" section of the Funnel Overview chart were only reading from the current week. If the current week had no data, all rates showed 0% — even when the chart above clearly displayed metrics for other weeks. The rates now average across all weeks with data. Additionally, the chart tooltip was replaced with a custom tooltip that shows member roles per week.

**Changes:**
- Replaced the single-week conversion rate lookup (`getMemberFunnel(m, currentWeek)`) with an averaging calculation across all team weeks.
- Only weeks where at least one metric (tam, calls, connects, demos, or wins) is greater than 0 are included in the average — weeks with all-zero/null values are excluded from the denominator.
- For each valid week, per-metric conversion rates are computed individually, then averaged across valid weeks. If only one week has data, the averages equal that week's rates exactly.
- Added `_roles` metadata to chart data rows, collecting each member's role for each week.
- Created a custom `FunnelTooltip` component that displays metric values and a "Roles this week" section in the chart hover tooltip.
- All pilot/project pages remain identical in appearance and operation.
---

## 2026-02-25 (Fix Team Total Wins Summation Bug)

### Location – All Pilot pages (`src/pages/Index.tsx`)

**Rationale:** The Test Signals section displayed only the last member's wins instead of the sum across all members. For example, a team with members having 3, 4, and 3 wins showed "3/100 Wins" instead of the correct "10/100 Wins". The same bug also affected the win count badge on the team tab headers.

**Changes:**
- Fixed the `.reduce()` accumulator bug on the `teamTotal` calculation in the `TeamTab` component (line 845). The callback `(s, m) => getMemberTotalWins(m)` discarded the accumulator `s`; corrected to `(s, m) => s + getMemberTotalWins(m)`.
- Fixed the identical `.reduce()` accumulator bug in the team tab header badge calculation (line 433) so it also properly sums wins across all members.
- Both the Test Signals team progress bar and the tab header badges now display the correct total.
- All pilot/project pages remain identical in appearance and operation.
---

## 2026-02-25 (Weekly Data: Monday-Aligned, Team-Date-Driven Columns with Sticky Freeze Panes)

### Location – All Pilot pages (`src/pages/Index.tsx`)

**Rationale:** Weekly Data columns started on Sundays instead of Mondays, were limited to a hardcoded 8-week window regardless of the team's actual engagement period, and the Player/Metric/Total columns scrolled off-screen when navigating through many weeks — making it difficult to track which player and metric a value belonged to.

**Changes:**
- Changed the `getWeekKeys` function's day-of-week offset from Sunday (`d.getDay()`) to Monday (`(d.getDay() + 6) % 7`) so all week columns align to Monday boundaries.
- Added `getTeamWeekKeys(startDate, endDate)` function that generates every Monday-starting week from the team's Settings start date through the current week (capped by the team's end date if it has passed). Falls back to 8 weeks when no dates are set. Future weeks are never shown.
- Replaced all hardcoded `getWeekKeys(8)` calls in the Weekly Data table and WeekOverWeekView chart with `getTeamWeekKeys(team.startDate, team.endDate)`.
- Added `useRef` + `useEffect` auto-scroll-right on the Weekly Data scroll container so the most recent weeks are visible on load; older weeks are revealed by scrolling left.
- Made the **Player** column sticky at `left-0` (z-30) with `whitespace-nowrap` so it stays frozen at the left edge during horizontal scroll.
- Made the **Metric** column sticky (z-20) with its `left` offset dynamically measured from the Player column via `useLayoutEffect` + `useRef`, keeping it pinned immediately to the right of Player.
- Made the **Total** column sticky at `right-0` (z-10), always visible at the right edge.
- All sticky cells use opaque `bg-card` backgrounds so scrolling week data passes cleanly underneath.
- Moved horizontal padding from the scroll container (`p-5` → `py-5`) into the edge cells (`pl-5` on Player, `pr-5` on Total) so the Player column extends flush to the card border with no visible gap.
- Added `border-separate border-spacing-0` to the table to eliminate default cell spacing gaps between sticky columns.
- All pilot/project pages remain identical in appearance and operation.
---

## 2026-02-25 (Per-Project Total TAM)

### Location – All Pilot pages (`src/pages/Index.tsx`), Context (`src/contexts/TeamsContext.tsx`), Hook (`src/hooks/useManagerInputs.ts`), Types (`src/lib/database.types.ts`), Database (`supabase/migrations/20250225230000_add_total_tam_to_teams.sql`)

**Rationale:** Total TAM was stored in a single-row global `tam_config` table, so every project/team shared the same value. When a manager set or submitted TAM on one pilot, it applied to all pilots. Each project operates in a different market and needs its own independent TAM figure.

**Changes:**
- Added `total_tam` (integer, default 0) and `tam_submitted` (boolean, default false) columns to the `teams` table via a new Supabase migration; migrated the existing global TAM value into all active teams so no data was lost.
- Updated `DbTeam` in `database.types.ts` to include the new `total_tam` and `tam_submitted` fields.
- Added `totalTam` and `tamSubmitted` to the `Team` interface in `TeamsContext.tsx`, mapped them in `assembleTeams`, and included them in the `updateTeam` diff-and-persist logic so changes auto-save to Supabase.
- Updated `addTeam` to initialize new teams with `totalTam: 0` and `tamSubmitted: false`.
- Removed all global TAM state (`totalTam`, `tamSubmitted`, `tamRowId`), the `tam_config` query, and the `updateTotalTam`/`updateTamSubmitted` callbacks from `useManagerInputs.ts`.
- Updated the Total TAM input in `Index.tsx` to read from `activeTeam.totalTam` and write via `updateTeam()`, so each project tab has its own independent TAM value and submit state.
- Updated `TeamTab` to use `team.totalTam` for the TAM→Call % conversion rate instead of a passed-in global prop.
- All pilot/project pages remain identical in appearance and operation — each now simply maintains its own TAM value.
---

## 2026-02-25 (Inline-Editable Member Name & Goal in Settings)

### Location – Settings page (`src/pages/Settings.tsx`), Context (`src/contexts/TeamsContext.tsx`)

**Rationale:** Editing a member's name or win goal required deleting and recreating the member, which destroyed all associated funnel data and win entries. Managers need a quick, friction-free way to correct typos in names or adjust goals without leaving the members table or losing any historical data.

**Changes:**
- Added `updateMember(memberId, { name?, goal? })` function to `TeamsContext` that updates the member in both `teams` and `unassignedMembers` local state, then persists the changed fields to Supabase via `members.update()`.
- Exposed `updateMember` on the `TeamsContextType` interface and the provider value.
- Made the **Name** column in the Settings members table inline-editable: clicking the name replaces it with a focused text input; pressing Enter or blurring saves the change; pressing Escape cancels.
- Made the **Goal** column inline-editable with the same interaction pattern, using a number input.
- A small pencil icon (`Edit2`) appears on hover for both columns to signal editability.
- The active input is auto-focused and text is pre-selected for quick replacement.
- Toast notifications confirm each successful update with the new value.
- Invalid edits (empty name, non-positive goal) are silently discarded without persisting.
- All pilot/project pages are unaffected — they consume the updated member data from context automatically.
---

## 2026-02-25 (Member Data Persistence — Soft Delete & Archive on Move)

### Location – All Pilot pages (`src/pages/Index.tsx`), Settings page (`src/pages/Settings.tsx`), Context (`src/contexts/TeamsContext.tsx`), Types (`src/lib/database.types.ts`), Database (`supabase/migrations/20250225220000_add_is_active_to_members.sql`, `supabase/migrations/20250224000000_create_all_tables.sql`)

**Rationale:** When a member was deleted, their row was hard-deleted from the database, which cascade-deleted all associated weekly funnel data and win entries — permanently destroying their contributions on that team. When a member was moved to another team, their data followed them via the `team_id` update, causing the old team to lose all historical records. Managers need a member's data to persist on the team where it was generated, regardless of whether the member is later deleted or reassigned.

**Changes:**
- Added `is_active` (boolean, default `true`) column to the `members` table via new migration `20250225220000_add_is_active_to_members.sql`; also updated the base migration for fresh environments.
- Applied the migration to the live Supabase project.
- Changed `weekly_funnels` and `win_entries` foreign keys from `ON DELETE CASCADE` to `ON DELETE RESTRICT` to prevent accidental hard-deletes from destroying data.
- Added `is_active: boolean` to the `DbMember` TypeScript interface and `isActive: boolean` to the `TeamMember` app interface.
- **Delete member** (`removeMember`): Changed from `DELETE` to `UPDATE is_active = false`. The member row stays on its team with all funnel/win data intact.
- **Move to another team** (`assignMember` team-to-team): Archives the member on the source team (`is_active = false`), then creates a fresh new member record on the target team. Old team keeps all historical data; new team starts clean.
- **Unassign from team** (`unassignMember`): Archives the member on the old team (`is_active = false`), then creates a fresh unassigned member record. Old team keeps all historical data.
- **Delete team** (`removeTeam`): Only active members are moved to the unassigned pool; archived members are detached but preserved.
- **Initial load**: Unassigned pool only includes active members; archived unassigned members are excluded from the Settings member list.
- **Win Goals section** (all pilot pages): Active members shown with full edit controls; archived members appear in a "Former Members" subsection below, grayed out at 50% opacity with read-only progress bars.
- **Player's Section funnels** (all pilot pages): Only active members are shown — archived members cannot submit new weekly data.
- **Weekly Data grid** (all pilot pages): All members displayed; archived members labeled as "Former" in italicized muted text beneath their name.
- **Funnel Overview chart** (all pilot pages): Team totals include all members' data (active + archived). Player selector marks former members with "(Former)" suffix and reduced opacity.
- **Win Stories** (all pilot pages): Stories from archived members continue to display.
- **Team header** (all pilot pages): Members count reflects only active members.
- **Settings page**: Only active members appear in the member management table. Team cards show active member count.
---

## 2026-02-25 (Team Delete Confirmation & Soft Delete)

### Location – Settings page (`src/pages/Settings.tsx`), Context (`src/contexts/TeamsContext.tsx`), Types (`src/lib/database.types.ts`), Database (`supabase/migrations/20250225220000_add_archived_at_to_teams.sql`)

**Rationale:** The team delete button on the Settings page removed teams from the database immediately with no confirmation, risking accidental data loss. Teams should never be hard-deleted — archiving preserves historical data integrity while still removing them from the active UI.

**Changes:**
- Added a confirmation `AlertDialog` modal to the team delete button: displays "Are you sure?" with the team name, and Yes/No action buttons. The "Yes" button uses destructive (red) styling for clarity.
- Created Supabase migration (`20250225220000_add_archived_at_to_teams.sql`) adding an `archived_at` timestamptz column (nullable, default null) to the `teams` table.
- Added `archived_at: string | null` to the `DbTeam` TypeScript interface.
- Changed `removeTeam` in `TeamsContext` from `supabase.from("teams").delete()` to `supabase.from("teams").update({ archived_at: <timestamp> })`, performing a soft delete instead of a hard delete.
- Updated the initial teams query to filter with `.is("archived_at", null)` so archived teams are excluded from the UI on load.
- Members of an archived team are still moved to unassigned, matching prior behavior.
- Toast message updated from "Team removed" to "Team archived" to reflect the new behavior.
- All pilot/project pages are unaffected — they already consume the filtered teams list from context.
---

## 2026-02-25 (Sticky Navigation Header)

### Location – All pages (`src/App.tsx`)

**Rationale:** The top navigation header scrolled off-screen on longer pages, forcing users to scroll back to the top to switch between pilots, access Data & Findings, or open Settings. Making the header sticky keeps navigation always accessible regardless of scroll position.

**Changes:**
- Added `sticky top-0 z-50` Tailwind classes to the `<nav>` element in the `Nav` component, pinning it to the top of the viewport on scroll.
- `z-50` ensures the header renders above all page content and overlapping elements.
- Change applies to all pages since the Nav component is shared across the entire app.
---

## 2026-02-25 (Date-Driven Test Phases Progress Bar)

### Location – Pilots pages (`src/pages/Index.tsx`), Types (`src/lib/database.types.ts`), Database (`supabase/migrations/20250225200000_create_team_phase_labels.sql`)

**Rationale:** The Test Phases progress bar on each pilot page used manually created global phases with a hand-dragged slider — completely disconnected from the team's actual start/end dates configured in Settings. Replacing this with auto-generated, date-driven phases gives managers an accurate, real-time view of where each pilot stands in its timeline without any manual upkeep.

**Changes:**
- Created a new Supabase table `team_phase_labels` with columns `team_id` (FK), `month_index`, and `label`, with a unique constraint on `(team_id, month_index)` — stores per-team editable descriptions for each auto-generated month.
- Added `DbTeamPhaseLabel` interface to `database.types.ts`.
- Applied the migration to the live Supabase project.
- Added `generateTestPhases()` helper that takes a team's `startDate`/`endDate` and produces one phase per calendar month in the range, each labeled as `(#) MonthName` (e.g. "(1) August", "(2) September").
- Added `computeOverallProgress()` helper that returns the percentage of total elapsed time based on today's date.
- Per-month progress is auto-calculated: past months show 100%, the current month shows proportional fill based on day-of-month, future months show 0%.
- Removed the manual `Slider` control; replaced with a "X% Complete" text indicator.
- Repurposed "Extend the Test" button — now adds one month to the team's end date instead of opening a dialog to manually create a phase.
- Added empty state when a team has no dates: displays a link to Settings prompting date configuration.
- Phase labels remain editable per-team per-month; changes are upserted to `team_phase_labels` in real time.
- Phases update automatically when switching between team tabs, each reflecting that team's own date range.
- All pilot/project pages share the same component and behavior — each displays unique data from its team's dates.
---

## 2026-02-25 (Fix Team Active Toggle Persistence)

### Location – Database (`supabase/migrations/`), Base migration (`supabase/migrations/20250224000000_create_all_tables.sql`)

**Rationale:** Toggling a team's active/inactive switch on the Settings page did not persist across page reloads. The `is_active` column was defined in the TypeScript types and referenced in the UI and context code, but was never actually created in the Supabase `teams` table. On reload, Supabase returned rows without `is_active`, which resolved to `undefined` (falsy), making every team appear inactive.

**Changes:**
- Applied a Supabase migration (`20250225210000_add_is_active_to_teams.sql`) adding `is_active boolean NOT NULL DEFAULT true` to the `public.teams` table. Existing teams defaulted to active.
- Updated the base migration (`20250224000000_create_all_tables.sql`) to include the `is_active` column in the `CREATE TABLE` statement for fresh environments.
- No UI or context code changes were required — the frontend was already correctly reading and writing `is_active`; only the database column was missing.
---

## 2026-02-25 (Team Start & End Dates)

### Location – Settings page (`src/pages/Settings.tsx`), Pilots pages (`src/pages/Index.tsx`), Context (`src/contexts/TeamsContext.tsx`), Types (`src/lib/database.types.ts`), Database (`supabase/migrations/`)

**Rationale:** Teams had no concept of a time window for their pilot engagement. Adding start and end dates allows managers to define and communicate the active period for each team, with a sensible default of +9 months from the chosen start date to reduce setup friction.

**Changes:**
- Added `start_date` (date, nullable) and `end_date` (date, nullable) columns to the `teams` table via new migration `20250225000000_add_team_dates.sql`; also updated the base migration for fresh environments.
- Applied the migration to the live Supabase project.
- Updated `DbTeam` in `database.types.ts` with `start_date` and `end_date` fields.
- Updated the `Team` interface in `TeamsContext.tsx` with `startDate` and `endDate` properties.
- Updated `assembleTeams` to map the new DB columns to app-level fields.
- Updated `addTeam` to accept optional `startDate`/`endDate` params and persist them on insert.
- Updated `updateTeam` to detect date changes and persist them to Supabase.
- Added `formatDateRange` helper that renders dates as "Jan '25 – Sep '25" format.
- Settings page team cards now display the date range below the members count with a calendar icon.
- Create Team dialog now includes Start Date and End Date inputs; picking a start date auto-fills end date to +9 months, but the end date remains editable.
- Edit Team dialog includes the same date inputs, pre-populated with existing values.
- Pilots page Team Total Bar now shows the date range below "Led by {owner}" with a calendar icon.
- Removed the Active/Inactive badge from team cards on the Settings page.
---

## 2026-02-25 (Supabase Schema Migration — localStorage to Database)

### Location – All pages (`src/contexts/TeamsContext.tsx`, `src/pages/Index.tsx`, `src/hooks/useManagerInputs.ts`, `src/lib/database.types.ts`, `supabase/migrations/20250224000000_create_all_tables.sql`)

**Rationale:** All app state was stored in browser localStorage, meaning data was device-locked, unshareable between users, and lost on cache clear. Migrating to Supabase tables makes the data persistent, multi-user accessible, and queryable — a prerequisite for any team collaboration or analytics features.

**Changes:**
- Created SQL migration (`supabase/migrations/20250224000000_create_all_tables.sql`) defining 10 new tables organized by UI section:
  - **Settings:** `teams`, `members` (with `team_id` null representing unassigned)
  - **Manager Inputs:** `test_phases`, `mission` (single-row), `tam_config` (single-row), `custom_roles`
  - **Player's Section:** `weekly_funnels` (per-member per-week, unique on `member_id + week_key`), `win_entries`
  - **Activation/Adoption (future):** `activation_adoption_entries`
  - **GTMx Impact (future):** `gtmx_impact_entries`
- Added RLS policies (open read/write for now), indexes on foreign keys, `updated_at` triggers, and table comments.
- Created `src/lib/database.types.ts` with TypeScript interfaces for all DB tables.
- Rewrote `src/contexts/TeamsContext.tsx` to load teams, members, weekly funnels, and win entries from Supabase on mount, then write-through on every mutation (add/remove/update team, create/assign/unassign/remove member). Removed all localStorage reads and writes.
- Created `src/hooks/useManagerInputs.ts` hook that loads and persists test phases, mission, TAM config, and custom roles to/from Supabase — replacing 6 localStorage keys and their sync effects.
- Updated `src/pages/Index.tsx` to use the new `useManagerInputs` hook, added Supabase upserts for `weekly_funnels` on every funnel field change/role change/submit/edit, and Supabase inserts for `win_entries` on win creation and `members` on inline member creation.
- Switched all generated IDs from `Date.now().toString()` to `crypto.randomUUID()` for UUID compatibility with the Supabase schema.
---

## 2026-02-25 (Player Section Deadline Clarification)

### Location – All Pilot pages (`src/pages/Index.tsx`)

**Rationale:** The update reminder text in the Player's Section said "Tuesday noon" without specifying a timezone, which could cause confusion for distributed teams. Adding "EST" removes ambiguity and ensures all users know the exact deadline.

**Changes:**
- Updated the italic reminder text in the Player's Section from "Update weekly by Tuesday noon" to "Update weekly by Tuesday 12pm EST".
- Change applies to all pilot/project pages via the shared component.
---

## 2026-02-25 (Conversion Rate Color Fix)

### Location – All Pilot pages (`src/pages/Index.tsx`)

**Rationale:** The Call→Connect and Demo→Win percentage numbers in the team header conversion-rate boxes were styled with `text-accent`, which was invisible or nearly invisible against the dark blue header background. Changing them to match the header text color ensures all four conversion metrics are legible at a glance.

**Changes:**
- Changed the percentage `<p>` element for Call→Connect from `text-accent` to `text-secondary-foreground` so it matches the team name ("Guest Pro") color.
- Changed the percentage `<p>` element for Demo→Win from `text-accent` to `text-secondary-foreground` for the same reason.
- TAM→Call and Connect→Demo percentages remain `text-primary` (orange) as before — no change needed.
- Change applies to all pilot/project pages via the shared `TeamTab` component.
---

## 2026-02-25 (Members Badge in Header)

### Location – All Pilot pages (`src/pages/Index.tsx`)

**Rationale:** The Members count was displayed in a separate white stat card below the blue team header, visually disconnected from the core team identity block. Moving it into the blue header alongside the wins count consolidates key team metadata into a single glanceable area and reduces vertical space consumed by standalone stat cards.

**Changes:**
- Added the `Users` icon, "Members" label, and member count into the blue gradient team header, positioned to the left of the wins counter.
- Styled the new members badge with `font-display`, `text-secondary-foreground`, and matching uppercase tracking to stay consistent with the existing header typography.
- Removed the `StatCard` for "Members" from the stats grid below the header; the grid now only contains "Total Wins".
- Change applies to all pilot/project pages via the shared `TeamTab` component.
---

## 2026-02-25 (Total Wins Trend Icon)

### Location – Pilots pages (`src/pages/Index.tsx`)

**Rationale:** The Total Wins stat card always showed a static upward-trending icon regardless of actual performance. Changing the icon to reflect week-over-week direction gives managers an at-a-glance indicator of whether their team's wins are trending up or down compared to the prior week.

**Changes:**
- Added `TrendingDown` to the `lucide-react` import alongside the existing `TrendingUp`.
- Computed current-week and previous-week team wins in `TeamTestSignals` by summing each member's `funnelByWeek` wins for the two most recent week keys.
- Replaced the static `TrendingUp` icon on the Total Wins `StatCard` with a conditional render: `TrendingUp` (accent color) when current week wins are greater than or equal to last week, `TrendingDown` (destructive/red color) when they are lower.
- Change applies to all pilot/project pages since they share the same `TeamTestSignals` component.
---

## 2026-02-25 (Dark Mode)

### Location – All pages (`src/index.css`, `src/App.tsx`, `src/pages/Index.tsx`, `src/pages/Data.tsx`, `src/pages/Settings.tsx`, `src/components/HexEmbed.tsx`, `src/components/FindingsWrite.tsx`)

**Rationale:** The app was light-only with no dark mode support despite having `darkMode: ["class"]` configured in Tailwind and `next-themes` installed. Users on dark system preferences or in low-light environments had no way to reduce eye strain. Implementing a high-quality dark mode with WCAG AA-compliant contrast, proper surface elevation, and desaturated brand colors brings the app to production-grade theming standards.

**Changes:**
- Added complete `.dark` CSS variable scope in `src/index.css` with deep charcoal background (`#121212` / `0 0% 7%`), elevated card surfaces (`#1E1E1E` / `0 0% 12%`), and subtle muted surfaces (`220 10% 16%`).
- Set primary text to 87% white opacity (`0 0% 87%`, ~13:1 contrast ratio) and secondary text to 60% white opacity (`0 0% 60%`, ~6.5:1 ratio) for WCAG AA compliance.
- Desaturated brand colors in dark mode: primary orange from `24 100% 62%` to `24 80% 55%`, secondary blue from `215 65% 38%` to `215 45% 42%`, to prevent color bleeding on dark backgrounds.
- Added dark-mode variants for gradients (`--win-gradient`, `--goal-gradient`), card glow (`--card-glow`), and all sidebar tokens.
- Added chart infrastructure CSS variables (`--chart-grid`, `--chart-axis-text`, `--chart-tooltip-bg`, etc.) with dark-mode overrides so Recharts components adapt to the theme.
- Created `src/hooks/useChartColors.ts` — reactive hook that reads computed chart CSS variables and re-derives values on theme change.
- Created `src/components/ThemeToggle.tsx` — hydration-safe sun/moon toggle button using `next-themes`.
- Wrapped the app with `<ThemeProvider>` from `next-themes` (`attribute="class"`, `defaultTheme="system"`, `enableSystem`) in `src/App.tsx` and placed the toggle in the Nav bar.
- Replaced hardcoded `slate-*`, `amber-*`, `sky-*`, `red-*` Tailwind classes in `HexEmbed.tsx` and `FindingsWrite.tsx` with semantic design tokens (`bg-muted`, `text-foreground`, `border-border`, `bg-primary`, `text-destructive`).
- Added `.dark-dim` utility class that applies `brightness(0.85) saturate(0.9)` to embedded iframes in dark mode.
- Updated progress bar utilities (`.progress-bar-orange`, `.progress-bar-blue`) to reference `--chart-1`/`--chart-2` CSS variables instead of hardcoded HSL values.
- Desaturated Recharts metric colors and player colors by ~15-20% saturation for improved legibility on both light and dark backgrounds.
- Removed unused `BAR_COLORS` constant from `Index.tsx`.
---

## 2026-02-25 (Draggable Team Order & Active/Inactive Toggle)

### Location – Settings page, Navigation header, Pilots pages (`src/pages/Settings.tsx`, `src/App.tsx`, `src/pages/Index.tsx`, `src/contexts/TeamsContext.tsx`, `src/lib/database.types.ts`, `supabase/migrations/20250225100000_add_team_is_active.sql`)

**Rationale:** Managers had no way to control the display order of teams in the navigation header or to temporarily hide a team without deleting it. Adding drag-and-drop reordering to the Settings page gives managers direct control over the navigation sequence, and an active/inactive toggle lets them hide teams from the UI without losing any data.

**Changes:**
- Created Supabase migration (`20250225100000_add_team_is_active.sql`) adding `is_active boolean not null default true` to the `teams` table.
- Added `is_active: boolean` to the `DbTeam` TypeScript interface.
- Extended the `Team` app interface with `sortOrder` and `isActive` fields; `assembleTeams` now maps both from DB rows.
- Added `reorderTeams(orderedIds)` context function that reorders the local state array and persists each team's new `sort_order` to Supabase.
- Added `toggleTeamActive(teamId, isActive)` context function that flips local state and persists `is_active` to Supabase.
- `addTeam` now auto-calculates `sortOrder` as `max + 1` so new teams append to the end.
- `updateTeam` now detects and persists `isActive` changes alongside name/owner/leadRep/dates.
- Settings page team cards are now draggable via HTML5 drag-and-drop — a grip handle icon (`GripVertical`) appears at the left of each card title.
- Added a `Switch` toggle to the left of the edit pencil on each team card for toggling active/inactive; inactive cards display at reduced opacity with an "Inactive" badge.
- Navigation header (`App.tsx`) now filters to `teams.filter(t => t.isActive)`, hiding inactive teams from the nav bar.
- Pilots page (`Index.tsx`) also filters to active teams only for tab display, ensuring inactive projects don't appear anywhere in the main UI.
- All project/pilot pages remain identical in structure and behavior — the filter applies uniformly.
---

## 2026-02-25

### Location -- Pilots page (`src/App.tsx`, `src/pages/Index.tsx`)

**Rationale:** The app treated Pilots as a single-page tab switcher at `/` with no deep-linking. Selecting a pilot or scrolling to a section had no URL representation, so links couldn't be shared or bookmarked. Moving to URL-driven routing (`/Pilots/:pilotId`) and adding anchor IDs to section headers enables deep-linking to any pilot + section combination.

**Changes:**
- Added `pilotNameToSlug` utility that derives a URL segment from the (editable) pilot name (e.g. "Mad Max" -> "Mad_Max", "Guest Pro" -> "Guest_Pro").
- `/` now redirects to `/Pilots`. Both `/Pilots` and `/Pilots/:pilotId` render the same Index component; `/Pilots` defaults to the first pilot (Mad Max).
- Replaced `activeTab` local state with a value derived from the URL via `useParams`. Selecting a tab now calls `useNavigate` to update the address bar.
- Nav "Pilots" link updated to `/Pilots` and highlights on any `/Pilots/*` path.
- Added `id` and `scroll-mt-16` to section header wrappers: `#manager-inputs`, `#test-signals`, `#players-section`, `#weekly-data`.
- Added placeholder anchor elements for future sections: `#activation-adoption`, `#gtmx-impact`.
- Added `useEffect` that scrolls to `location.hash` on mount and when the pilot or hash changes.
- Invalid `pilotId` values redirect to `/Pilots`.
---

## 2026-02-24

### Location – Index page (Manager Inputs & Test Signals sections)

**Rationale:** Win Goals is a manager-level input (setting member targets), not a test signal (observed data). Moving it into the Manager Inputs section groups all configuration controls together and keeps the Test Signals section focused on metrics and outcomes.

**Changes:**
- Moved the Win Goals card (member list, editable goal inputs, progress bars, "+ Add Member" button) out of the Test Signals section inside each team tab and into the Manager Inputs section, positioned directly below Total TAM.
- Win Goals now displays only the active team's members — switching tabs updates the card to match the selected team.
- Consolidated the Add Member dialog into a single shared instance in the parent component instead of duplicating it inside every team tab.
- Replaced the per-team Dialog-based "Add First Member" empty state in Test Signals with a simple button that opens the parent dialog for the correct team.
- Removed `addMemberOpen`, `setAddMemberOpen`, `newName`, `setNewName`, `newGoal`, `setNewGoal`, and `addMember` props from the `TeamTab` component; replaced with a single `onAddMemberClick` callback.
---
