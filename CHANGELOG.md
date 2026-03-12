# Changelog

## 2026-03-12 (Data Freshness & Load Performance)

### Location — Home, Index (Rep Self Overrides), Quota

**Rationale:** Editing "Rep Self Overrides" values on the Index page wasn't reflected on the Quota page or Home lifetime stats until a full page refresh. The monolithic `loadAll` function also re-fetched all heavy metrics tables on every realtime event, causing unnecessary load times for routine user edits.

**Changes:**
- Split `loadAll` into `loadMetrics` (heavy external pipeline tables) and `loadCore` (lightweight core tables) in `TeamsContext.tsx`, caching metrics in refs so core-table realtime events skip the expensive re-fetch.
- Added optimistic `monthlyMetrics` recomputation in `updateTeam` using cached metric-source corrections, so funnelByWeek edits immediately propagate to Quota without a server round-trip.
- Synced `allMembersById` map inside `updateTeam` to prevent stale historical roster data.
- Added `onError` rollback callback to `dbMutate` in `supabase-helpers.ts`; on write failure, `reloadAll` restores the UI to the true database state.
- Debounced `upsertFunnelField` calls in `Index.tsx` by 300ms to avoid intermediate-value writes during rapid typing.
- Exposed `reloadAll` on the Teams context for error recovery and external use.
- Routed core-table realtime changes (`teams`, `members`, `weekly_funnels`, `win_entries`) through `debouncedLoadCore` instead of `debouncedLoadAll` for faster refresh.
- Created `get_aggregated_metrics()` Postgres RPC function in Supabase (deployed but not yet used by client due to PostgREST row limit).

---

## 2026-03-12 (Roadmap — Availability Row in Timeline Grid)

### Location — Roadmap Page (`src/pages/Roadmap.tsx`)

**Rationale:** The roadmap timeline showed which members were assigned to projects each month, but there was no quick way to see who would be unassigned and available for new work in upcoming months. A simple visual indicator was needed between the month headers and the project rows.

**Changes:**
- Added a new `availableByMonth` useMemo that computes, for each visible month, which active members have no team assignment covering that month (including currently unassigned members and members whose teams end before that month).
- Inserted a new grid row (row 2) between the month headers and the first project row, rendering green-tinted initials circles for each available member in the corresponding month column, with tooltips showing the member's full name.
- Updated `gridTemplateRows` from `auto repeat(N, auto)` to `auto auto repeat(N, auto)` to accommodate the new availability row.
- Shifted all project row indices and the active/inactive divider row index by +1 to account for the inserted row.
- Styled the availability row to use minimal spacing consistent with the gap between project cards (no extra padding or minimum height).

---

## 2026-03-11 (Quota — Fix Accelerators Ignored When No Goals Enabled)

### Location — Quota Helpers (`src/lib/quota-helpers.ts`)

**Rationale:** When a team had no enabled goals but did have accelerator rules configured (e.g. +200% on wins), both `computeQuota` and `computeQuotaBreakdown` returned early with 0% and empty accelerator steps — the accelerator processing code was never reached. This caused the Quota Breakdown tooltip to show "Base avg 0.0% / Final 0.0%" with no accelerator steps, even though the accelerator's condition was met.

**Changes:**
- Removed the early return in `computeQuota` that bailed with `0` when `enabledMetrics` was empty; replaced it with an `else if` branch that sets `quota = 0` and falls through to the accelerator processing loop.
- Removed the early return in `computeQuotaBreakdown` that bailed with an empty breakdown when `enabledMetrics` was empty; replaced it with an `else if` branch that sets `metricRatios = []` and `baseQuota = 0` and falls through to the accelerator processing loop.
- Both functions now correctly evaluate and apply accelerator rules regardless of whether any goals are enabled, so the Quota Breakdown tooltip displays triggered accelerator steps and the correct final quota.

---

## 2026-03-11 (Global — Tooltip Z-Index / Stacking Fix)

### Location — Tooltip Component (`src/components/ui/tooltip.tsx`)

**Rationale:** The Quota Breakdown hover tooltip on the Quota page was rendering behind adjacent table rows because the `TooltipContent` was rendered in-place inside a sticky table cell (`sticky left-0 z-10`), which created a stacking context that trapped the tooltip beneath sibling elements despite its `z-50` class.

**Changes:**
- Wrapped `TooltipPrimitive.Content` in a `TooltipPrimitive.Portal` inside the shared `TooltipContent` component so all tooltips across the app now render at the document root, escaping any parent stacking contexts and correctly layering above all other elements.

---

## 2026-03-11 (Global — Performance Optimization & Code Splitting)

### Location — App Shell (`src/App.tsx`), Vite Config (`vite.config.ts`), HTML Entry (`index.html`), Global CSS (`src/index.css`), TeamsContext (`src/contexts/TeamsContext.tsx`), Data Page (`src/pages/Data.tsx`), Index Page (`src/pages/Index.tsx`), Quota Page (`src/pages/Quota.tsx`), Dependencies (`package.json`)

**Rationale:** The app shipped a single 1.2 MB JS bundle with all pages and vendor libraries loaded upfront, render-blocking Google Fonts in CSS, 5 unused npm packages, duplicate Supabase data fetching between TeamsContext and the Data page, and no component memoization — all of which slowed initial page load and caused unnecessary re-renders.

**Changes:**
- Converted all 8 page imports in App.tsx from static to `React.lazy()` dynamic imports and wrapped routes in `<Suspense>` with a loading fallback, splitting the single bundle into per-page chunks (initial load dropped from 1.2 MB to ~156 KB).
- Added `build.rollupOptions.output.manualChunks` to vite.config.ts to separate recharts (~383 KB), @radix-ui (~266 KB), and @supabase/supabase-js (~174 KB) into dedicated vendor chunks loaded on demand.
- Moved Google Fonts from a render-blocking CSS `@import` in index.css to `<link rel="preconnect">` and `<link rel="stylesheet">` tags in index.html for faster font discovery and non-blocking CSS parsing.
- Removed 5 unused npm dependencies: embla-carousel-react, react-day-picker, react-resizable-panels, cmdk, and vaul. Deleted the unused src/App.css file.
- Wrapped the TeamsContext provider value object in `useMemo` to prevent all context consumers from re-rendering on every provider render.
- Configured the existing (but default) React Query `QueryClient` with `staleTime: 5 min`, `retry: 1`, and `refetchOnWindowFocus: false`.
- Deduplicated data fetching on the Data page — replaced 3 duplicate Supabase queries (members, teams, member_team_history) with derived values from TeamsContext. Added `loadArchivedMembers()` on mount and merged archived members into the members list so historical attribution for archived reps is preserved.
- Wrapped `TeamTab` (Index page) and `MemberQuotaRow` (Quota page) in `React.memo`. Stabilized `toggleSection`, `handleBarClick`, and `addRole` callbacks with `useCallback`.
- Fixed a pre-existing bug where refreshing a pilot page (e.g. `/Mad_Max`) redirected to `/home` because the redirect `useEffect` in Index.tsx fired before TeamsContext finished loading. Added a `teamsLoading` guard so the redirect only runs once teams are available.

---

## 2026-03-11 (Quota — Wider Quota Breakdown Tooltip)

### Location — Quota Page (`src/pages/Quota.tsx`)

**Rationale:** The quota breakdown hover tooltip was too narrow (280px), causing text like accelerator bonus lines to wrap onto multiple lines, making it harder to read at a glance.

**Changes:**
- Increased the `QuotaBreakdownTooltip` `TooltipContent` max-width from `max-w-[280px]` to `max-w-[340px]` so each row fits on a single line.

---

## 2026-03-11 (Settings / Quota / Index — Basic Accelerator Mode)

### Location — Settings Page (`src/pages/Settings.tsx`), Quota Page (`src/pages/Quota.tsx`), Index Page (`src/pages/Index.tsx`), Quota Helpers (`src/lib/quota-helpers.ts`), TeamsContext (`src/contexts/TeamsContext.tsx`), Database Types (`src/lib/database.types.ts`), Data Model (`docs/data-model.mmd`), Supabase Migrations

**Rationale:** The existing accelerator system (now called "Logic" mode) used granular IF/THEN rules with arbitrary conditions and actions, which was powerful but complex for most use cases. A simpler "Basic" mode was needed as the default, where users configure a minimum metric value and minimum bonus percentage, and the system linearly interpolates up to 200% at a configured maximum value.

**Changes:**
- Added `AcceleratorMode` type (`'basic' | 'logic'`), `BasicAcceleratorMetricConfig` interface (enabled, minValue, minPct, maxValue, scope), and `BasicAcceleratorConfig` type to TeamsContext.
- Added `acceleratorMode` and `basicAcceleratorConfig` fields to `Team`, `TeamGoalsHistoryEntry`, `DbTeam`, and `DbTeamGoalsHistory` interfaces.
- Created Supabase migration (`20260311200000_add_basic_accelerator_mode.sql`) adding `accelerator_mode` (text, default `'basic'`) and `basic_accelerator_config` (jsonb, default `'{}'`) columns to both `teams` and `team_goals_history` tables.
- Updated all persistence paths in TeamsContext: `loadTeams`, `addTeam`, `updateTeam`, `upsertTeamGoalsHistory`, `getHistoricalTeam`, and the goals-change detection logic.
- Implemented `computeBasicBonus()` in quota-helpers with linear interpolation: below min value = no bonus; at min value = minPct; between min and max = `minPct + ((current - minValue) / (maxValue - minValue)) * (200 - minPct)`; at or above max value = 200%.
- Updated `computeQuota`, `computeQuotaBreakdown`, `countTriggeredAccelerators`, and `getTriggeredAcceleratorDetails` to branch on `team.acceleratorMode` — Basic mode iterates enabled metrics in `basicAcceleratorConfig`, Logic mode uses existing rule-based flow unchanged.
- Added Basic/Logic toggle buttons at the top of the Accelerator section in Settings. Basic mode shows per-metric rows with enable switch, Min Value, Min %, Max Value inputs, and SELF/TEAM scope toggle. Logic mode shows the original rule editor unchanged.
- Updated `AcceleratorTooltip` and `QuotaBreakdownTooltip` in Quota.tsx to display Basic mode info (range, interpolated bonus) alongside the existing Logic mode formatting.
- Updated Index.tsx accelerator-metric detection in both the relief-only table and `getDefaultMetrics()` to check Basic mode configs.
- One-time data migration: set all `team_goals_history` rows for months before 2026-03 to `accelerator_mode = 'logic'` so historical months use the original rule-based accelerators. March 2026 onward defaults to `'basic'`.
- Updated `docs/data-model.mmd` with the new fields on both `teams` and `team_goals_history` entities.

---

## 2026-03-11 (Index — Adjustable Funnel Overview Chart Date Range)

### Location — Index Page (`src/pages/Index.tsx`)

**Rationale:** The Funnel Overview chart always displayed every week from the team's start date to the present, which made it hard to focus on recent trends for long-running projects. Users needed a way to zoom into a shorter window (e.g. the last 4 or 12 weeks) and have that preference persist across all projects without reconfiguring each time.

**Changes:**
- Added `CHART_RANGE_OPTIONS` constant with five presets: 4 Weeks, 8 Weeks, 12 Weeks, 6 Months, and All.
- Added `readChartRange()` and `saveChartRange()` helpers that persist the selected range in `localStorage` under the key `"funnel-chart-range"`, so the preference carries across all teams/projects for the same user.
- Added `chartRange` state to `WeekOverWeekView`, initialized lazily from localStorage with a default of "All" (preserving existing behavior).
- The full week list from `getTeamWeekKeys()` is now sliced to the last N entries based on the selected range. All downstream data (chart lines, player overlays, conversion-rate calculations) automatically respect the filter since they derive from the `weeks` array.
- Added a styled `<select>` dropdown in the chart header bar, positioned to the left of the metric toggle pills, matching the existing muted/rounded-pill styling.

---

## 2026-03-11 (Index — Relief-Only Table: Per-Metric Accelerator Progress)

### Location — Index Page (`src/pages/Index.tsx`), Quota Helpers (`src/lib/quota-helpers.ts`)

**Rationale:** When relief month is active but no goals are configured, the Monthly Goals section showed a "Quota" column with the quota percentage. Since relief always grants 100% base, this wasn't actionable. Instead, the table should display per-metric accelerator progress so reps can see their current values, which accelerator tiers they've unlocked, and how far they are from the next one.

**Changes:**
- Added `AcceleratorProgress` interface and `getAcceleratorProgress()` helper to `quota-helpers.ts`. For a given metric, it returns the current value, which rules are triggered, the next untriggered rule, how many more the member needs to reach it, and the total rule count.
- Replaced the "Quota" column in the relief-only Monthly Goals table (no goals configured + relief members active) with one column per metric that has enabled accelerator rules (e.g., "Wins").
- Each accelerator metric cell now shows: current value (bold), a progress bar toward the next untriggered threshold (full green if all triggered), "need X" text showing distance to the next tier, and unlock icons for triggered tiers (`LockOpen` + tier number, `Lock` + MAX for the final tier) with tooltips showing rule details.
- If no accelerator rules exist at all, the table renders member names with relief badges only (no metric columns).

---

## 2026-03-11 (Settings / Index / Quota — Relief Month Goals Feature)

### Location — Settings Page (`src/pages/Settings.tsx`), Index Page (`src/pages/Index.tsx`), Quota Page (`src/pages/Quota.tsx`), Quota Helpers (`src/lib/quota-helpers.ts`), TeamsContext (`src/contexts/TeamsContext.tsx`), Database Types (`src/lib/database.types.ts`), Supabase Migrations

**Rationale:** Teams needed a way to mark certain months as "relief" for individual reps, setting their quota base to 100% without requiring manual goal adjustments. This supports scenarios like onboarding months, PTO, or organizational transitions where a rep shouldn't be penalized. Accelerators should still stack on top of the relief base so reps who exceed thresholds are recognized. When parity is enabled, all reps should automatically receive relief.

**Changes:**
- Added `relief_month_members` (jsonb array of member IDs) column to both `teams` and `team_goals_history` tables via migration (`20260311100000_add_relief_month_members.sql`), applied to Supabase.
- Added `relief_month_members: string[]` to `DbTeam` and `DbTeamGoalsHistory` TypeScript interfaces.
- Added `reliefMonthMembers: string[]` to `Team` and `TeamGoalsHistoryEntry` app types; wired through all DB-to-app mappings (`assembleTeams`, history mapping, unarchive), `updateTeam` (change detection, DB persist, history snapshot), `upsertTeamGoalsHistory`, and `getHistoricalTeam` overlay.
- Added `isMemberOnRelief(team, member)` helper in `quota-helpers.ts`.
- Updated `computeQuota` and `computeQuotaBreakdown` so relief sets the **base** quota to 100%, then accelerator rules still iterate and apply on top (capped at 200%). Previously accelerators were bypassed entirely for relief members.
- Added "Relief Month" section in Settings Edit Team modal (inside the Monthly Goals card, before Accelerator): a toggle switch that, when enabled, shows checkboxes for each team member. When parity is on, all members are auto-selected and checkboxes are disabled. Toggling parity on while relief is active auto-expands to all members. State loads from history entries for past-month editing.
- Index page Monthly Goals table: members on relief show a green "Relief" badge next to their name, progress bars fill green at 100%, and percentage displays 100%. When no goals are configured but relief is active, the "Configure goals in Settings" placeholder is bypassed in favor of a simplified table showing member name, relief badge, quota %, progress bar, and accelerator tier indicators (lock icons with tooltips).
- Quota page: members on relief show a green "Relief" badge, quota text renders in green, progress bars fill green. The breakdown tooltip shows "Relief month → 100.0%" as the base line followed by any triggered accelerator steps and the final total. Accelerator tier indicators display normally for relief members.

---

## 2026-03-11 (Project Pages / Data Page — Win Stage Qualification and Date Tracking)

### Location — TeamsContext (`src/contexts/TeamsContext.tsx`), Data Page (`src/pages/Data.tsx`), Metrics Helpers (`src/lib/metrics-helpers.ts`), Database Types (`src/lib/database.types.ts`), Supabase Migrations

**Rationale:** Wins were being counted regardless of opportunity stage, but they should only qualify based on stage thresholds that depend on opportunity type: "Existing Business (Upsell)" requires stage 14+, "New Business" requires stage 16+, and rows with both stage and type null count as legacy wins. Additionally, wins were bucketed by `win_date` which reflects the original close date, not when the opportunity actually reached a qualifying stage — causing wins to appear in the wrong month. The Data page raw event data also showed all wins unfiltered, creating a mismatch with funnel counts.

**Changes:**
- Added `win_stage_date` column to `metrics_ops` table via migration (`20260310100000_add_win_stage_date.sql`) to record when an opportunity first reaches a win-qualifying stage.
- Created a Postgres trigger `set_win_stage_date()` that auto-stamps `win_stage_date = CURRENT_DATE` on qualifying inserts/updates, with type-aware thresholds (14+ for upsell, 16+ for new business, immediate for null/null).
- Backfilled existing qualifying rows with `win_stage_date = op_date`.
- Hardened the trigger via a second migration (`20260311000000_protect_win_stage_date.sql`) to preserve `OLD.win_stage_date` on UPDATE, protecting against pipeline upserts that don't carry the column forward.
- Created shared helper `isWinStage(stage, opportunityType)` in `src/lib/metrics-helpers.ts` with the full qualification logic, plus a permissive `isSuperhexWinStage(opStage)` variant for superhex rows that lack opportunity type.
- Updated `TeamsContext.tsx` to fetch `opportunity_stage` and `opportunity_type` from `metrics_wins`, filter to only qualified wins before aggregation, and bucket wins by `win_stage_date` (looked up from `metrics_ops` by ID) instead of `win_date` so wins count for the month they first qualified.
- Updated `Data.tsx` deal averages to filter superhex wins through `isSuperhexWinStage`, and filtered the raw event data wins bucket through `isWinStage` so summary counts, detailed rows, and CSV exports all reflect only qualifying wins.
- Added `win_stage_date` to `DbMetricsOps` TypeScript interface.

---

## 2026-03-10 (Index — Dynamic Default Metrics for Funnel Overview Chart)

### Location — Project Page (`src/pages/Index.tsx`)

**Rationale:** The Funnel Overview chart's default selected metrics were hardcoded to Call, Connect, Demo, and Win regardless of the team's configuration. This meant teams that only tracked certain goals still saw irrelevant metrics pre-selected, and teams with accelerators on specific metrics had to manually toggle them on every visit. The defaults should reflect each team's actual goal and accelerator setup.

**Changes:**
- Added a `GOAL_METRIC_TO_CHART_LABEL` mapping that translates GoalMetric keys (`calls`, `ops`, etc.) to chart display labels (`"Call"`, `"Ops"`, etc.).
- Added a `getDefaultMetrics(team)` helper that builds the default selected metric set by: always including "Win", adding any metric where `team.enabledGoals` is `true`, and adding any metric where `team.acceleratorConfig` has at least one enabled rule.
- Replaced the hardcoded `useState` initializer (`new Set(["Call", "Connect", "Demo", "Win"])`) with a lazy initializer that calls `getDefaultMetrics(team)`.
- Added a `useEffect` keyed on `team.id` so that switching between teams resets the chart to the new team's defaults.
- Users can still manually toggle metrics on/off after the defaults are applied. "TAM" and "Connect" (which have no corresponding goal metric) are only shown if manually toggled on.

---

## 2026-03-10 (Settings / Quota / Index — TOTAL Column for Team-Scoped Goals)

### Location — Settings Page (`src/pages/Settings.tsx`), Quota Page (`src/pages/Quota.tsx`), Index Page (`src/pages/Index.tsx`), Quota Helpers (`src/lib/quota-helpers.ts`)

**Rationale:** Team-scoped goals were confusing because per-level values (e.g., Rep = 35, Senior = 35) were each independently compared against the whole team's combined output — meaning a team total of just 35 already put everyone at 100%. There was no way to express "the whole team needs X collectively." A TOTAL column makes this intent explicit and changes evaluation so all members share a single collective target.

**Changes:**
- Added a "TOTAL" column to the right of LEAD in the Monthly Goals grid in Settings. It appears with a left border separator and is only editable when a metric is set to TEAM scope.
- When a metric is TEAM-scoped, the per-level columns (ADR through Lead) now show dashes and are disabled — only the TOTAL input is active.
- The TOTAL input reads/writes to `editTeamGoals[metric]`, which already persists via existing DB columns (`team_goal_calls`, `team_goal_feedback`, etc.) — no migration needed.
- Simplified `getEffectiveGoal` in `quota-helpers.ts` for team-scoped metrics: it now always returns `teamGoals[metric]` (the TOTAL value), ignoring per-level goals entirely. All members see the same quota % (`team_sum / TOTAL`).
- Updated the metric column header labels on the Quota page and Index page from lowercase "(team)" to uppercase "TEAM" badge styling, matching the member row badge appearance.

---

## 2026-03-10 (Quota — Sticky Member Column on Horizontal Scroll)

### Location — Quota Page (`src/pages/Quota.tsx`)

**Rationale:** When the Quota page table has many metric columns, the table scrolls horizontally. This caused the Member name column to scroll off-screen, making it impossible to tell which row of data belonged to which team member.

**Changes:**
- Added `sticky left-0 z-10 bg-card` to the Member column header (`<th>`) so it stays pinned to the left edge during horizontal scrolling.
- Added `sticky left-0 z-10 bg-card` to each Member row cell (`<td>`) in `MemberQuotaRow` so member names, quota percentages, and accelerator badges remain visible while scrolling through metrics.
- The `bg-card` background ensures the sticky column has a solid fill and metric columns do not bleed through underneath.

---

## 2026-03-10 (Quota — Always Show Wins Column)

### Location — Quota Page (`src/pages/Quota.tsx`)

**Rationale:** The Wins column on the Quota page was only visible when the wins goal was explicitly enabled in Settings. On the project pages, wins always displays — showing just the raw count when no goal is set. This change makes the Quota page consistent with that behavior so users can always see win totals at a glance.

**Changes:**
- Updated `visibleMetrics` in `TeamQuotaCard` to always include the `wins` metric, regardless of whether a wins goal is enabled, matching the project page pattern.
- Added a `hasGoal` check in `MemberQuotaRow` so that when wins has no goal configured, the cell displays just the raw win count instead of the full progress bar / "need X" / "X/day" layout.
- Wins column is positioned after other enabled metrics and before feedback, consistent with the project page column ordering.

---

## 2026-03-10 (Settings — Fix Team Date Picker Year Bug)

### Location — Settings Page (`src/pages/Settings.tsx`)

**Rationale:** When manually typing a start date in the Create Team or Edit Team dialogs, the browser fires onChange events for each keystroke as the year is entered. Intermediate year values like "0002" were being passed to the 9-month end date calculation, producing nonsensical end dates (e.g., "10/26/0002"). Because the old logic only auto-set the end date when it was empty, the bad value persisted even after the user finished typing the correct year.

**Changes:**
- Updated the Create Team start date onChange handler to validate the year is >= 2000 before computing the 9-month end date window, preventing intermediate typing values from producing bad dates.
- Changed the logic to always recalculate the end date when a valid start date is entered, so finishing typing the correct year properly updates the end date.
- Added clearing of the end date when the start date is removed.
- Applied the same fix to the Edit Team dialog's start date handler for consistency.

---

## 2026-03-10 (Help Page / Changelog — Rename "Guest Pro" to "Toast Growth Platform")

### Location — Help Page (`src/pages/Help.tsx`), Changelog (`CHANGELOG.md`)

**Rationale:** The pilot formerly known as "Guest Pro" has been rebranded to "Toast Growth Platform." All references throughout the codebase needed to be updated to reflect the new name.

**Changes:**
- Renamed 2 occurrences of "Guest Pro" to "Toast Growth Platform" in `src/pages/Help.tsx` (TAM calculation description and blank-rep-name default notes).
- Renamed 10 occurrences of "Guest Pro" to "Toast Growth Platform" across `CHANGELOG.md` in various historical entries.
- Updated 1 slug example in `CHANGELOG.md` from `"Guest_Pro"` to `"Toast_Growth_Platform"` to match the new pilot name.

---

## 2026-03-10 (Help Page — Account Name Tooltips Documentation)

### Location — Help Page (`src/pages/Help.tsx`)

**Rationale:** The Help page had not been updated to document the new account name hover tooltips and click-to-copy feature added to the Quota page and project page Monthly Goals sections. Users consulting the Help page would not know they can hover over ops, demos, or wins cells to see contributing account names, or click to copy them.

**Changes:**
- Added an **Account name tooltips** bullet to the **Monthly Goals** subsection (section 3b) explaining the hover-to-view and click-to-copy behavior for ops, demos, and wins cells on project pages.
- Added an **Account name tooltips** bullet to the **Quota Page** section (section 4) documenting the same feature on the Quota page, including the alphabetized name display and "Copied!" confirmation.

---

## 2026-03-09 (Nav Header — Add Icons to Quota and Data & Findings Links)

### Location — Navigation Header (`src/App.tsx`)

**Rationale:** The Roadmap and Home links in the top navigation bar included small icons next to their text, but the Quota and Data & Findings links were plain text only. Adding icons brings visual consistency across all nav links.

**Changes:**
- Imported `FileChartColumn` and `Target` icons from lucide-react into `App.tsx`.
- Added a `FileChartColumn` icon (`h-3.5 w-3.5`) to the Data & Findings nav link, matching the icon used on the Data page header.
- Added a `Target` icon (`h-3.5 w-3.5`) to the Quota nav link, matching the icon used on the Quota page header.
- Updated both links to use `flex items-center gap-1` layout, consistent with the Roadmap and Home links.

---

## 2026-03-09 (Quota / Project Pages — Account Name Hover Tooltips with Click-to-Copy)

### Location — Quota Page (`src/pages/Quota.tsx`), Project Pages (`src/pages/Index.tsx`), Quota Helpers (`src/lib/quota-helpers.ts`), Teams Context (`src/contexts/TeamsContext.tsx`)

**Rationale:** The Quota page and project page Monthly Goals sections showed numeric totals for ops, demos, and wins but gave no visibility into which accounts or opportunities contributed. Users needed a quick way to see and copy the account names.

**Changes:**
- Added `account_name` to `metrics_demos` and `metrics_wins` Supabase fetch calls, and `opportunity_name` to `metrics_ops` in `TeamsContext.tsx`.
- Added `aggregateNamesBy` function to collect unique account/opportunity names per rep per month alongside existing count-based aggregation.
- Added `metricAccountNames` field to the `TeamMember` interface, populated with alphabetically sorted names during monthly metrics assembly.
- Added `getScopedAccountNames` helper in `quota-helpers.ts` that returns names for individual scope or merges/deduplicates across all active team members for team scope.
- Wrapped ops, demos, and wins metric cells on both the Quota page and project page Monthly Goals sections (active and former members) in tooltips displaying alphabetized account names in a responsive multi-column layout.
- Clicking a metric cell copies comma-separated account names to the clipboard, shows a "Copied!" confirmation for 1 second, then transitions back to showing the account names.
- Tooltip stays open as long as the cursor remains over the cell, using `onOpenChange` rather than a timer to release the force-open state.

---

## 2026-03-09 (Data & Findings / Roadmap — Consistent Page Header Styling)

### Location — Data & Findings Page (`src/pages/Data.tsx`), Roadmap Page (`src/pages/Roadmap.tsx`)

**Rationale:** The Data & Findings and Roadmap page headers were visually inconsistent with the Quota page. The Data & Findings heading was smaller, lacked an icon, and used a different layout. The Roadmap heading used a gradient color instead of the standard white foreground color. Both were updated to match the Quota page's established style.

**Changes:**
- Added `FileChartColumn` icon from lucide-react to the Data & Findings page header, matching the icon sizing and color (`h-8 w-8 text-primary`) used on Quota and Roadmap.
- Updated the Data & Findings `<h1>` from `text-3xl` to `text-4xl md:text-5xl` to match the other pages.
- Changed the Data & Findings heading wrapper to use `flex items-center gap-3 mb-8` for proper icon-text alignment.
- Removed the `text-gradient-primary` span from the Roadmap heading so the text renders in `text-foreground` (white), consistent with the Quota page.

---

## 2026-03-09 (Quota — Account Name Hover Tooltips on Ops/Demos/Wins)

### Location — Quota Page (`src/pages/Quota.tsx`), Quota Helpers (`src/lib/quota-helpers.ts`), Teams Context (`src/contexts/TeamsContext.tsx`), Index Page (`src/pages/Index.tsx`)

**Rationale:** The Quota page showed numeric totals for ops, demos, and wins but provided no way to see which accounts or opportunities contributed to those numbers. Users needed a quick way to view and copy the account names.

**Changes:**
- Added `account_name` to the `metrics_demos` and `metrics_wins` Supabase fetch calls, and `opportunity_name` to `metrics_ops` in `TeamsContext.tsx`.
- Added `aggregateNamesBy` function in `TeamsContext.tsx` that collects unique account/opportunity names per rep per month (parallel to the existing count-based aggregation).
- Added `metricAccountNames` field to the `TeamMember` interface, populated during the monthly metrics assembly loop with alphabetically sorted names.
- Added `getScopedAccountNames` helper in `quota-helpers.ts` that returns account names for individual scope or merges/deduplicates across all active team members for team scope.
- Wrapped ops, demos, and wins metric cells on the Quota page in a `Tooltip` that displays alphabetized account names in a responsive multi-column layout (1/2/3 columns based on count).
- Clicking a metric cell copies the comma-separated account names to the clipboard and shows a "Copied!" confirmation tooltip for 1 second.
- Updated all `TeamMember` construction sites (`dbMemberToApp`, `createMember`, and `Index.tsx` inline) to initialize the new field.

---

## 2026-03-09 (Settings / All Pages — Drag-and-Drop Member Reordering)

### Location — Settings Page (`src/pages/Settings.tsx`), All Project Pages (`src/pages/Index.tsx`, `src/pages/Quota.tsx`, `src/pages/Roadmap.tsx`)

**Rationale:** Members had no custom ordering — they appeared in insertion order or alphabetically. Users needed the ability to drag-and-drop members into a preferred order (mirroring the existing project/team reorder feature) and have that order persist across all pages.

**Changes:**
- Added `sort_order` integer column to the `members` table in Supabase with a migration that backfills existing rows by `created_at` order.
- Added `sort_order` to `DbMember` type and `sortOrder` to the `TeamMember` interface.
- Updated `dbMemberToApp` and `assembleTeams` to map and sort members by `sort_order`.
- Added `reorderMembers` function to `TeamsContext` that updates local state (teams, unassigned, allMembersById) and persists new `sort_order` values to Supabase.
- Added native HTML5 drag-and-drop to the Settings members table with `GripVertical` grip handles, matching the existing team drag pattern.
- The Settings members table now sorts by `sortOrder` by default; clicking the Name header still toggles alphabetical sort, and dragging resets back to custom order.
- Updated `createMember` (in both TeamsContext and Index.tsx) to assign the next available `sort_order`.
- Updated `getTeamMembersForMonth` to sort historical roster results by `sortOrder`.

---

## 2026-03-09 (Roadmap — Show All Finishing Projects in Team Availability)

### Location — Roadmap Page (`src/pages/Roadmap.tsx`)

**Rationale:** The Team Availability section grouped members by the month they become available and displayed which project they were finishing. However, it only stored a single project name per month, so when multiple projects ended in the same month only the first one was shown (e.g., "Finishing Toast Growth Platform" instead of "Finishing Toast Growth Platform & Other Project").

**Changes:**
- Changed the monthly grouping data structure from a single `teamName: string` to `teamNames: Set<string>` so every distinct project finishing in that month is collected.
- Updated the display to render all finishing project names, joined with commas and "&" for the last item (e.g., "Finishing **Toast Growth Platform** & **Project X**").

---

## 2026-03-09 (Data — Active Projects Only in Deal Averages)

### Location — Data & Findings Page (`src/pages/Data.tsx`)

**Rationale:** The Deal Averages project dropdown was listing all non-archived projects, including inactive ones. Users should only see active projects in the filter to avoid selecting projects that are no longer running.

**Changes:**
- Added `is_active` to the `TeamBasic` interface and the Supabase teams query so the active status is available on loaded teams.
- Filtered the Deal Averages project dropdown (`teams.filter((t) => t.is_active)`) to only display projects where `is_active` is true.
- "All Projects" option still aggregates across all data regardless of active status.

---

## 2026-03-09 (Header Nav — Reordered Navigation Groups)

### Location — App Shell (`src/App.tsx`)

**Rationale:** The navigation header had project names immediately after Home, pushing the global pages (Data & Findings, Quota, Roadmap) further right. Swapping the two groups places the most universally used pages closer to Home for quicker access, with project-specific links grouped together after a divider.

**Changes:**
- Moved the Data & Findings, Quota, and Roadmap links to appear directly after the first divider following Home.
- Moved the dynamic project name links (visibleTeams) to appear after a second divider, following Roadmap.
- No functional changes — only the display order within the `<nav>` was adjusted.

---

## 2026-03-09 (Help Page — Updated for Archive/Unarchive & Ended Tests)

### Location — Help Page (`src/pages/Help.tsx`)

**Rationale:** The Help page had not been updated to reflect recent changes: the new Ended Tests and Archived Teams sections on Settings, and the member archive/unarchive flow replacing delete. Users consulting the Help page would not know about these features.

**Changes:**
- Added a new **Ended Tests** subsection to **Settings** (section 2) documenting the collapsible section for teams whose end date has passed, showing name, owner, date range, active toggle, and archive button.
- Added a new **Unarchiving a Team** subsection to **Settings** (section 2) documenting the collapsible "Archived Teams" section with lazy-loading, archive date display, and the Restore button (noting restored teams return with no members).
- Replaced the "Remove a member" bullet in **Managing Members** (section 2) with **"Archive a member"**, explaining the reversible archive flow via the archive icon and confirmation dialog, and that all history is preserved.
- Added a new **Archived Members** subsection to **Settings** (section 2) documenting the collapsible section with name, level, archive date, and Restore button that reloads data and adds the member to the unassigned pool.

---

## 2026-03-09 (Settings — Unarchive Projects & Ended Tests Sections)

### Location — Settings Page (`src/pages/Settings.tsx`), TeamsContext (`src/contexts/TeamsContext.tsx`)

**Rationale:** Archived teams had no way to be restored — once archived, they were permanently hidden. Additionally, teams whose test period had ended (past end date, inactive, not archived) had no dedicated view, mixing them in with active teams or losing visibility entirely. These changes introduce an unarchive flow and a dedicated "Ended Tests" section for better project lifecycle management.

**Changes:**
- Added `ArchivedTeam` exported interface to `TeamsContext` with `id`, `name`, `owner`, and `archivedAt` fields.
- Added `archivedTeams` state, `loadArchivedTeams()` (queries teams where `archived_at` is not null, ordered most-recent first), and `unarchiveTeam()` (clears `archived_at` in Supabase, reconstructs the full `Team` object with empty members, adds to active state, removes from archived list) to `TeamsProvider`.
- Exposed `archivedTeams`, `loadArchivedTeams`, and `unarchiveTeam` via the context interface and provider value.
- Added a collapsible "Archived Teams" section on the Settings page below the active teams grid. Lazy-loads archived teams on expand. Each card shows name, owner, archive date, and a "Restore" button with a confirmation dialog explaining the team returns with no members.
- Added a collapsible "Ended Tests" section above the Archived Teams section for teams whose end date is in the past, are inactive, and are not archived. Each card shows name, owner, date range, an active toggle, and an archive button.
- No Supabase migration needed — `archived_at` is an existing nullable column; unarchiving simply sets it back to `null`.

---

## 2026-03-09 (Members — Archive/Unarchive Instead of Delete)

### Location — Settings Page (`src/pages/Settings.tsx`), TeamsContext (`src/contexts/TeamsContext.tsx`), Database Types (`src/lib/database.types.ts`), Supabase Migration

**Rationale:** Members should never be fully deleted — historical data (funnels, wins, team history) must be preserved. Introducing an archive/unarchive mechanism allows members to be hidden from active views while retaining all their data and enabling restoration at any time.

**Changes:**
- Applied a Supabase migration adding an `archived_at timestamptz` column to the `members` table.
- Updated `DbMember` type to include the new `archived_at` field.
- Added `ArchivedMember` interface and `archivedMembers` state to `TeamsContext`.
- Added `archiveMember()` — sets `archived_at`, unassigns from team, removes from active lists, and closes team history. `removeMember` is now an alias for `archiveMember`.
- Added `unarchiveMember()` — clears `archived_at`, reloads member data (funnels, wins), adds them to the unassigned pool, and opens a new team history entry.
- Added `loadArchivedMembers()` for on-demand fetching of archived members.
- The main members query now filters with `archived_at IS NULL` so archived members never appear in active views.
- Replaced the trash/delete button on the Settings members table with an archive icon and confirmation dialog explaining the action is reversible.
- Added a collapsible "Archived Members" section on Settings (matching the existing "Archived Teams" pattern) with a table showing name, level, archive date, and a "Restore" button with confirmation dialog.

---

## 2026-03-09 (Roadmap — Active/Inactive Divider & Alternating Row Colors)

### Location — Roadmap Page (`src/pages/Roadmap.tsx`)

**Rationale:** The Roadmap grid listed active and inactive projects with no visual separation, making it hard to distinguish at a glance which projects are live. Additionally, the 5-color palette used for row styling caused visually similar colors (e.g., chart-3/chart-5 both green-ish, accent/chart-4 both orange-ish) to appear on adjacent rows, breaking the intended alternating pattern.

**Changes:**
- Added a solid horizontal divider line between the last active project row and the first inactive project row in the month grid.
- Computed the active/inactive split point (`firstInactiveIdx`) and conditionally rendered a full-width `border-t` element spanning all grid columns at the appropriate row.
- Adjusted grid row assignments so inactive project cells are offset by one row to accommodate the divider.
- Changed row color assignment from the team's index in the full `allTeams` array to the team's visual row position (`rowIdx`) in the grid, ensuring colors follow the visible order.
- Reduced `PROJECT_COLORS` from 5 entries to 2 (primary blue and accent orange) so rows cleanly alternate between two distinct, visually distinguishable colors.

---

## 2026-03-09 (Routing — Rename /Pilots to Project-Name Slugs)

### Location — App-wide (`src/App.tsx`, `src/pages/Index.tsx`, `src/pages/Home.tsx`, `src/pages/Roadmap.tsx`, `src/pages/Help.tsx`)

**Rationale:** The `/Pilots` and `/Pilots/:pilotId` URL scheme did not match the pattern used elsewhere in the app where each page is identified by its own name. Renaming the route to `/:pilotId` makes each project accessible directly by its slug (e.g., `/Mad_Max` instead of `/Pilots/Mad_Max`), giving cleaner URLs and removing the special-case logic that treated the first team differently from the rest.

**Changes:**
- Replaced the `/Pilots` and `/Pilots/:pilotId` routes in `App.tsx` with a single `/:pilotId` dynamic route. React Router v6 static routes (`/home`, `/data`, etc.) take precedence automatically.
- Updated the `Nav` component in `App.tsx` so every team link points to `/${slug}` instead of special-casing the first team as `/Pilots`.
- Updated `Index.tsx` tab switching, add-member navigation, and invalid-pilot redirect to use `/${slug}` paths.
- Simplified `Home.tsx` project card links and `Roadmap.tsx` tile links to `/${slug}`, removing the first-team ternary.
- Added `useTeams` and `pilotNameToSlug` to `Help.tsx` so the five documentation links formerly pointing to `/Pilots` now resolve dynamically to the first active team's slug.

---

## 2026-03-09 (Nav Bar — Add Separator Before Data & Findings)

### Location — Navigation Bar (`src/App.tsx`)

**Rationale:** The header nav had a vertical separator between Home and the pilot tabs, but no visual break between the last pilot tab and Data & Findings. Adding a matching separator improves visual grouping by clearly distinguishing the pilot links from the utility links.

**Changes:**
- Added a `<span className="h-4 w-px bg-border shrink-0" />` separator immediately before the Data & Findings link in the `Nav` component, matching the existing separator style used after Home.

---

## 2026-03-09 (Help Page — Updated for Compact Tiles, Roadmap Explore Tile & Phase Priorities)

### Location — Help Page (`src/pages/Help.tsx`)

**Rationale:** The Help page had not been updated to reflect four recent changes: the new Roadmap Explore tile on the Home page, compact project card layout on the Home page, compact roadmap tiles with inline members (and removal of the "Inactive" badge), and the new per-month priorities text field in Test Phases. Users consulting the Help page would not know about these features.

**Changes:**
- Updated **Home Page — Explore** (section 1) to include the Roadmap tile alongside Data & Findings and Quota in the Explore description.
- Updated **Home Page — Active Projects** (section 1) to describe the compact card layout: inline member count next to the project name, "Owner: X · Lead: Y" on the same line, and date range/progress bar in the card header.
- Updated **Roadmap — Calendar Grid** (section 5) to describe compact project tiles where the project name, member avatars, and "Starts"/"Ends" badges all appear on a single line with graceful wrapping. Removed mention of the "Inactive" badge (inactive projects are now distinguished solely by 60% opacity).
- Added a new bullet to **Test Phases** (section 3a) documenting the per-month priorities text field below each headline, noting that priorities are only visible on the Pilots page and not on the Roadmap.

---

## 2026-03-09 (Home Page — Add Roadmap Explore Tile)

### Location — Home Page (`src/pages/Home.tsx`)

**Rationale:** The Explore section on the Home page had tiles for Project Pages, Data & Findings, and Quota, but no tile for the Roadmap page. Adding one gives users a consistent entry point to the Roadmap alongside the other sections.

**Changes:**
- Added a new `PageOverviewCard` for Roadmap in the Explore grid, using the `MapIcon` from lucide-react.
- Includes three bullet points: Phase labels, Team member availability windows, and Unassigned rep visibility.
- Clicking the tile navigates to `/roadmap`.

---

## 2026-03-09 (Roadmap — Compact Tiles with Inline Members)

### Location — Roadmap Page (`src/pages/Roadmap.tsx`)

**Rationale:** The roadmap tiles used three separate rows (project name, phase label, member avatars), consuming more vertical space than necessary. Compacting tiles lets more projects and months fit on screen without scrolling.

**Changes:**
- Moved member avatars and status badges (Starts/Ends) onto the same line as the project name, right-aligned via `ml-auto`.
- The outer flex row uses `flex-wrap` so that when the project name is long, the badges and avatars gracefully wrap to a second line instead of truncating the name.
- Reduced card padding from `p-3 space-y-2` to `p-2.5 space-y-1` for a tighter overall tile.
- Removed the "Inactive" badge since the existing opacity/transparency effect on inactive tiles already communicates that status.

---

## 2026-03-09 (Home Page — Compact Project Card Tiles)

### Location — Home Page (`src/pages/Home.tsx`)

**Rationale:** The project cards on the Home page used three separate rows for the project name, member/owner/lead info, and date/progress, taking up more vertical space than necessary. Consolidating these elements onto fewer lines makes the tiles more compact so more projects are visible without scrolling.

**Changes:**
- Moved the member count (icon + number) up onto the same line as the project name, eliminating the separate "X members" info row.
- Collapsed "Owner" and "Lead Rep" labels into a compact inline format (`Owner: X · Lead: Y`) on the same line as the project name and member count, instead of separate `<span>` elements on the right side of the header.
- Bolded the "Owner" and "Lead" labels (`font-semibold text-foreground`) so they visually stand out from their values.
- Moved the date range and progress bar into a sub-row within the card header (conditionally rendered) instead of being a separate `CardContent` section.
- Reduced `CardContent` vertical spacing from `space-y-4` to `space-y-3` and removed top padding (`pt-0`) since the date/progress info moved into the header.
- Net result: each project tile is roughly one row shorter, improving density on the Home page.

---

## 2026-03-09 (Test Phases — Add Priorities Field)

### Location — Pilots Page (`src/pages/Index.tsx`), Shared Types & Helpers (`src/lib/database.types.ts`, `src/lib/test-phases.ts`), Supabase (`supabase/migrations/20250226000000_create_team_phase_priorities.sql`)

**Rationale:** Each test phase month had a single editable "headline" text box, but there was no way to capture per-month priorities alongside the headline. A second text field was needed so managers can record priorities for each phase month. Only the headline should appear on the Roadmap page; priorities are only visible on the Pilots page.

**Changes:**
- Created a new `team_phase_priorities` Supabase table (migration + applied to live DB) mirroring the existing `team_phase_labels` schema: `id`, `team_id`, `month_index`, `priority`, `created_at`, `updated_at`, with a unique constraint on `(team_id, month_index)`, open RLS policies, and an `updated_at` trigger.
- Added `DbTeamPhasePriority` interface to `src/lib/database.types.ts`.
- Extended the `ComputedPhase` interface in `src/lib/test-phases.ts` with a `priority: string` field and added an optional `priorities` parameter (defaulting to `{}`) to `generateTestPhases()` so existing callers are unaffected.
- On the Pilots page (`src/pages/Index.tsx`): added `phasePriorities` state, a `useEffect` to fetch from `team_phase_priorities` when the active team changes, an `updatePhasePriority()` callback that upserts to Supabase, and a second `<textarea>` below the headline textarea with identical styling bound to `phase.priority`.
- The Roadmap page (`src/pages/Roadmap.tsx`) continues to display only the headline label — no changes were made there.

---

## 2026-03-09 (Help Page — Updated for Roadmap, Re-centering & Zero-Goal Features)

### Location — Help Page (`src/pages/Help.tsx`)

**Rationale:** The Help page had not been updated to reflect several features added on 2026-03-09: the new Roadmap page (6-month calendar view with capacity summary and team availability), dynamic re-centering of test phase buckets when selecting a different month, and the zero-goal display fix in Monthly Goals. Users consulting the Help page would not know about these features or behaviors.

**Changes:**
- Updated **Navigating the App** (section 1) to include the Roadmap link in the nav bar listing, between Quota and Settings.
- Added a new **Section 5: Roadmap Page** documenting the 6-month sliding calendar grid with left/right navigation and "Today" reset, project cards with phase labels, "Starts"/"Ends" badges, and member avatar initials, fixed-row alignment so projects stay at the same vertical position across months, inactive project styling (60% opacity with "Inactive" badge), capacity summary bar (active/available/total headcount), and team availability grouping by month of project end.
- Renumbered subsequent sections: Data & Findings (6), Real-Time Data (7), Tips & Shortcuts (8), Metric Definitions (9).
- Updated **Test Phases** (section 3a) with a new bullet documenting dynamic re-centering: clicking a different month re-centers the visible window around the selected month (plus up to 2 prior months) and collapses everything else back into "Prev" / "Next" buckets.
- Updated **Monthly Goals** (section 3b) with a new bullet documenting zero-goal display: when a metric's goal is zero (not configured for the member's role), the cell shows only the raw count instead of "actual / 0" with an empty progress bar.
- Added a **"Plan ahead with Roadmap"** tip to Tips & Shortcuts (section 8) encouraging use of the calendar view for project overlap and availability planning.

---

## 2026-03-09 (Roadmap Page — Align Projects into Consistent Rows)

### Location — Roadmap Page (`src/pages/Roadmap.tsx`)

**Rationale:** On the Roadmap page, each month column independently listed only the projects active in that month, so when a project ended (e.g. Mad Max in April), all projects below it shifted up in subsequent months. This caused the same project (e.g. "Ricky's Test") to appear at different vertical positions across columns, making it hard to visually track a project over time.

**Changes:**
- Replaced the per-column flex layout with a single CSS grid spanning all months, using explicit `gridColumn` / `gridRow` placement so every project occupies a fixed row across the entire visible window.
- Added a `orderedTeamIds` memo that computes a stable, global ordering of all projects visible in the current window (preserving the original team ordering).
- Added a `projectLookup` memo (monthKey → teamId → project data) for O(1) cell lookups during rendering.
- Empty grid cells (where a project is not active in a given month) render as empty divs that hold the row's space, while CSS grid ensures all cells in the same row share the same height.

---

## 2026-03-09 (Roadmap Page — Multi-Month Calendar View)

### Location — Roadmap Page (`src/pages/Roadmap.tsx`), App Shell (`src/App.tsx`)

**Rationale:** There was no way to visualize projects over time, understand what's coming, see who's working on what, or gauge capacity for upcoming work. A dedicated Roadmap page provides a forward-looking calendar view of all non-archived projects with team member assignments and availability forecasting.

**Changes:**
- Created new `src/pages/Roadmap.tsx` page with a 6-month sliding calendar grid (current month + 5 forward), navigable with left/right arrows and a "Today" reset button.
- Each month column displays project cards for every non-archived project active during that month, with a colored left border for visual grouping per project.
- Project cards show the project name (clickable, links to the Pilots page), the phase label for that month (from `team_phase_labels`), "Starts"/"Ends" badges on the first and last months, and member avatar initials with tooltips.
- Inactive (but non-archived) projects appear at 60% opacity with an "Inactive" badge to distinguish them from active projects.
- Capacity summary bar at the top shows active members, available members, and total headcount.
- Team Availability section at the bottom lists members who are currently available and groups upcoming availability by the month their current project ends.
- Added `/roadmap` route and "Roadmap" nav link (with Map icon) in `App.tsx` after the Quota link.

---

## 2026-03-09 (Test Phases — Dynamic Re-centering on Month Selection)

### Location — Pilots Page (`src/pages/Index.tsx`), Quota Page (`src/pages/Quota.tsx`), Settings Page (`src/pages/Settings.tsx`), Utility (`src/lib/test-phases.ts`)

**Rationale:** When expanding the "Prev" or "Next" phase buckets and selecting a different month, the visible window stayed anchored on the current calendar month, which forced users to scroll through a long flat list of all expanded months. The phases bar should dynamically re-center around whichever month the user selects, showing the selected month plus up to 2 prior months and collapsing everything else back into "Prev" / "Next" buckets.

**Changes:**
- Updated `splitPhases()` in `test-phases.ts` to accept an optional `anchorDate` parameter; when provided, the visible window (anchor + 2 prior months) centers on the anchor instead of today's date.
- Updated Index.tsx, Quota.tsx, and Settings.tsx to pass the currently selected month to `splitPhases`, so the split dynamically re-centers on selection.
- All month click handlers (progress bars, labels, "Back to Current") now collapse the expanded prev/next states, causing the view to re-split cleanly around the new selection.
- If the selected month is among the first 1–2 months of the test and there are no earlier months to group, the "Prev" bucket naturally does not appear.

---

## 2026-03-09 (Monthly Goals — Hide Goal Display When Goal Is Zero)

### Location — Pilots Page (`src/pages/Index.tsx`)

**Rationale:** When a team member's role has no goals configured for the current month (goal value = 0), the Monthly Goals table was displaying "actual / 0" with an empty progress bar and "0%" — which is confusing and cluttered. The display should instead show only the raw count (e.g. "1" or "3"), consistent with how the Wins column already behaves when no wins goal is enabled.

**Changes:**
- Updated the `hasGoal` condition in the active-members goals table to also require `goal > 0`, so members with a zero goal for a metric see only their raw count instead of "actual / 0" with a progress bar and percentage.
- Applied the same fix to the former-members goals table for consistency.
- Moved the `goal` variable declaration before the `hasGoal` check (since `hasGoal` now depends on the goal value).
- Simplified the `pct` calculation since `hasGoal` now guarantees `goal > 0`.

---

## 2026-03-09 (Help Page — Updated for Recent 03-08 & 03-09 Features)

### Location — Help Page (`src/pages/Help.tsx`)

**Rationale:** The Help page had not been updated to reflect several features added on 2026-03-08 and 2026-03-09: collapsible previous/next phase buckets, wins display replacing progress percentages in test phases, multi-line phase label wrapping, the "last edit" timestamp replacing the submitted badge in Mission & Purpose, and the always-visible wins column in Monthly Goals. These features were documented in the changelog but users consulting the Help page would not know about them.

**Changes:**
- Updated **Test Phases** (section 3a) with three new bullets: wins labels below each phase month showing "X / Y wins" or "X wins," multi-line label support with auto-expanding height, and collapsible "Prev (N)" / "Next (N)" buckets for long test timelines.
- Updated **Mission & Purpose** (section 3a) to document the Submit button workflow and the "last edit: mm/dd/yy" timestamp that replaced the old "Submitted" badge.
- Updated **Monthly Goals** (section 3b) to document that the Wins column always appears as the rightmost column, showing raw count when no goal is configured.
- Added a **"Check wins per phase"** tip to Tips & Shortcuts (section 7) pointing out the at-a-glance wins labels in the test phases bar.

---

## 2026-03-09 (Mission & Purpose — Replace Submitted Badge with Last Edit Timestamp)

### Location — Pilots Page (`src/pages/Index.tsx`), Context (`src/contexts/TeamsContext.tsx`), Types (`src/lib/database.types.ts`), Database (Supabase migration `add_mission_last_edit_to_teams`)

**Rationale:** The "✅ Submitted" badge and checkmark in the Mission & Purpose section added visual noise without providing useful information. Replacing it with a small "last edit: mm/dd/yy" timestamp gives managers a quick reference for when the mission details were last saved, which is more actionable than a binary submitted state.

**Changes:**
- Removed the green "✅ Submitted" badge from the Mission & Purpose card header.
- Added a muted "last edit: mm/dd/yy" timestamp that appears in the same location after the first submit.
- Added `missionLastEdit: string | null` to the `Team` interface in `TeamsContext.tsx` with full round-trip support: DB load mapping, change detection, Supabase persist payload, and default `null` for new teams.
- Added `mission_last_edit: string | null` to the `DbTeam` interface in `database.types.ts`.
- The Submit button now records `new Date().toISOString()` into `missionLastEdit` each time it is clicked, so the timestamp reflects the most recent save.
- Applied a Supabase migration (`20260309000000_add_mission_last_edit_to_teams.sql`) adding a `mission_last_edit timestamptz` column to the `teams` table, and pushed it directly to the live database.

---

## 2026-03-09 (Help Page — Core Metric Definitions & Technical Details)

### Location — Help Page (`src/pages/Help.tsx`)

**Rationale:** Users and stakeholders needed a single reference explaining how each core metric (TAM, Activity, Call, Connect, Demo, Ops, Win, Feedback) is defined, aggregated, and — critically — how the underlying data is calculated in the external database before it reaches Supabase. Adding this documentation directly in the Help page makes it accessible to anyone using the app without requiring separate technical docs.

**Changes:**
- Added a new **Section 8: Metric Definitions** at the bottom of the Help page.
- Each metric (TAM, Activity, Call, Connect, Demo, Ops, Win, Feedback) includes a plain-English definition covering what the metric measures, how it's attributed (by date), and how it's aggregated (weekly, monthly, lifetime).
- Added an indented **Technical Details** bullet beneath each metric documenting the external database calculation: source view/table name, SQL logic (UNION branches, ILIKE filters, CTE references), join tables, hardcoded overrides, deduplication rules, and special counting rules (e.g. Multiple Offers = 2 wins for Mad Max).
- Added a **General Notes** subsection covering the dual-source model (external vs. manual overrides), Monday-aligned weekly bucketing, calendar-month attribution, lifetime summation, and conversion rate formulas.

---

## 2026-03-09 (Test Phase Labels — Multi-line Text Wrapping)

### Location — Pilots Page (`src/pages/Index.tsx`)

**Rationale:** Phase label text was truncated when it exceeded the width of a single line, making it impossible to read longer descriptions such as paragraphs or detailed phase notes. Labels needed to wrap to additional rows so the full content is always visible.

**Changes:**
- Replaced the single-line `<Input>` element for phase labels with an auto-resizing `<textarea>` that starts at one row and expands as content grows.
- Added auto-height logic in both `onChange` (recalculates on each keystroke) and `ref` (sizes correctly on initial render) to eliminate scrollbars and keep the textarea exactly as tall as its content.
- Increased font size from `text-[10px]` to `text-xs` (12px) so label text matches the visual weight of surrounding elements.
- Applied `resize-none` and `overflow-hidden` to prevent manual drag-resizing and hide scrollbar flash during height recalculation.

---

## 2026-03-08 (Mission & Purpose — Structured Fields Expansion)

### Location — Pilots Page (`src/pages/Index.tsx`), Context (`src/contexts/TeamsContext.tsx`), Types (`src/lib/database.types.ts`), Help Page (`src/pages/Help.tsx`), Database (Supabase migration `add_mission_fields_to_teams`)

**Rationale:** The Mission & Purpose of Test section was a single free-text field, which did not capture the structured details managers need to record for each pilot: who sponsors the test, what revenue lever is targeted, what the business goal is, and what specifically is being tested. Adding dedicated fields for each of these brings the section in line with how test documentation is actually consumed and reviewed.

**Changes:**
- Applied a Supabase migration adding five new text columns to the `teams` table: `executive_sponsor`, `executive_proxy`, `revenue_lever`, `business_goal`, and `what_we_are_testing`.
- Updated `DbTeam` in `database.types.ts` to include the five new fields.
- Added camelCase equivalents (`executiveSponsor`, `executiveProxy`, `revenueLever`, `businessGoal`, `whatWeAreTesting`) to the `Team` interface in `TeamsContext.tsx`, mapped them in `assembleTeams`, included them in `updateTeam` change detection and Supabase persist payload, and initialized them as empty strings in `addTeam`.
- Expanded the Mission & Purpose card in `Index.tsx` from a single textarea into a structured 2-column grid: Revenue Lever and Business Goal on the top row, What We Are Testing spanning full width, Executive Sponsor and Executive Proxy side-by-side, and the original Mission Statement textarea at the bottom.
- In edit mode, all fields render as inputs/textareas. In submitted mode, values display as read-only text with small uppercase labels, toggled via the Submit/Edit button now positioned in the card header.
- Updated the Help page Mission & Purpose documentation to describe all six fields and the submit/edit workflow.
- All pilot/project pages remain identical in appearance and operation — each maintains its own independent field values.

---

## 2026-03-08 (Test Phases — Replace Progress % with Wins Display)

### Location — Pilots Page (`src/pages/Index.tsx`), Quota Page (`src/pages/Quota.tsx`), Settings Page (`src/pages/Settings.tsx`), Quota Helpers (`src/lib/quota-helpers.ts`)

**Rationale:** The progress percentage shown under each test phase month represented calendar time elapsed, which was not actionable. Replacing it with the actual wins count (and goal when configured) gives managers an immediate view of outcome performance per phase month.

**Changes:**
- Added `getPhaseWinsLabel()` helper to `src/lib/quota-helpers.ts` that computes total wins for a given month across one or more teams, and returns a formatted label.
- When a wins goal is enabled for the team, the label displays as "X / Y wins" (actual vs. goal).
- When no wins goal is configured, the label displays as "X wins" (total only).
- Replaced `{phase.progress}%` text in the test phases section on the Pilots page with the wins label, scoped to the active team.
- Applied the same replacement on the Quota page, summing wins across all active teams since that page is cross-team.
- Applied the same replacement on the Settings page, scoped to the team currently being edited.

---

## 2026-03-08 (Monthly Goals — Wins Column Always Visible as Rightmost)

### Location — Pilots Page (`src/pages/Index.tsx`)

**Rationale:** Wins are the most important outcome metric and should always be visible in the Monthly Goals table regardless of whether a formal goal target is configured. Previously, wins only appeared if toggled on in Settings, and its column position was determined by the static `GOAL_METRICS` array order rather than being pinned to the right edge for quick scanning.

**Changes:**
- Wins column now always appears in the Monthly Goals table, even when not configured as an enabled goal in Settings.
- Reordered visible metrics so wins is always the rightmost column; if feedback is also an enabled goal, feedback appears to the right of wins (becoming the rightmost).
- When wins has no goal configured, the cell displays only the raw count (e.g. "4") without the "/ target" denominator, progress bar, or percentage calculation.
- When wins does have a goal configured, it renders identically to all other goal metrics (actual / goal, progress bar, percentage).
- Applied the same no-goal display logic to the Former Members section at the bottom of the goals table.
- Preserved the "Configure goals in Settings" empty state: it still appears when no goals (including wins and feedback) are enabled.

---

## 2026-03-08 (Test Phases — Collapsible Previous/Next Buckets)

### Location — Pilots Page (`src/pages/Index.tsx`), Quota Page (`src/pages/Quota.tsx`), Settings Page (`src/pages/Settings.tsx`), Test Phases Utility (`src/lib/test-phases.ts`)

**Rationale:** When a test spans many months, the test phases progress bar and month labels became too narrow to read or interact with. Users needed the display condensed to only the most relevant months, with older and future months accessible on demand.

**Changes:**
- Added `splitPhases()` utility to `src/lib/test-phases.ts` that partitions phases into three groups: previous (more than 2 months before current), visible (current month + 2 prior), and next (after current month).
- When collapsed, older months are grouped into a "Prev (N)" bucket on the left and future months into a "Next (N)" bucket on the right, each showing only as wide as their label text.
- Both buckets display a grey bar in the progress row; clicking either bucket expands it to show all individual months inline, with a "Collapse" link to re-collapse.
- Merged the progress bar and month label grid into a single CSS grid so bar segments and labels share identical column widths, ensuring perfect vertical alignment.
- Applied the same collapsible bucket pattern consistently across all three pages (Pilots, Quota, Settings edit team modal) per the project rule that all project pages remain identical in appearance and operation.

---

## 2026-03-06 (Help Page — Updated for Recent Features, Removed Em Dashes)

### Location – Help Page (`src/pages/Help.tsx`)

**Rationale:** The Help page had not been updated since 2026-03-05 and was missing documentation for several features added between 2026-03-05 and 2026-03-06: the new Home landing page, the month selector for editing goals and accelerators in the Edit Team modal, historical member roster editing in the Edit Team modal, and ops creation-date attribution with calendar-month accuracy. Additionally, all em dashes used as punctuation throughout the page were replaced with more conventional punctuation (colons, periods, semicolons, commas) for consistency.

**Changes:**
- Updated **Navigating the App** (section 1) to mention the new Home link (house icon) as the first item in the nav bar.
- Added a **Home Page** subsection (section 1) documenting Active Projects cards (team name, owner, lead rep, member count, date range, progress bar, lifetime stats) and the Explore section with page-overview tiles.
- Added **Test Phases Month Selector** to the Editing a Team subsection (section 2): visual month-selector bar for loading/editing goals and accelerators for any month in the test period, with "Viewing" banner, save routing, and month reset behavior.
- Added **Team Members** to the Editing a Team subsection (section 2): roster display per selected month with member count badge, add/remove controls, and historical roster editing for retroactive corrections.
- Added two new bullets to **Real-Time Data** (section 6): ops are now counted by creation date (not close date), and monthly totals use calendar-month attribution for accurate month-boundary counting.
- Added two new tips to **Tips & Shortcuts** (section 7): "Start from Home" for a bird's-eye project overview, and "Edit past months" for retroactive goal/roster adjustments in the Edit Team modal.
- Replaced all 30 em dashes with more common punctuation throughout the page: colons after labels, periods between independent sentences, semicolons between related clauses, and commas with conjunctions for continuations.

---

## 2026-03-06 (Settings — Historical Member Roster Editing in Edit Team Modal)

### Location – Settings Page (`src/pages/Settings.tsx`), Context (`src/contexts/TeamsContext.tsx`)

**Rationale:** Members could only be managed from the flat Members table at the bottom of Settings, with no awareness of historical months. Goals and accelerators already supported per-month editing via the Test Phases selector in the Edit Team modal, but there was no equivalent way to view or modify which members were on a team for a past month. Users needed the ability to retroactively adjust team rosters (e.g. correct a late join, backfill a transfer) using the same month-selector workflow.

**Changes:**
- Added a "Team Members" section to the Edit Team modal (between Test Phases and Monthly Goals) showing the roster for the selected month with a member count badge.
- Each member row displays the member's name, level badge, and a remove button.
- Added an "Add Member" dropdown populated from all active members not currently on the roster, including unassigned members and members from other teams.
- Added `editTeamMembers` and `editTeamMembersInitial` state to track the working roster and detect diffs on save.
- Wired `startEditTeam` to initialize the roster from the team's current active members.
- Wired `handlePhaseClick` to repopulate the roster from `getTeamMembersForMonth()` when switching to a historical month, or from the current roster when switching back to the current month.
- Updated `saveEditTeam`: for the current month, diffs the roster and calls `assignMember()`/`unassignMember()` for changes; for historical months, calls the new `updateHistoricalRoster()`.
- Added `updateHistoricalRoster(teamId, referenceDate, memberIds)` to `TeamsContext` — compares desired roster against current `member_team_history` entries for the month, inserts new entries for added members, and splits/trims/deletes entries for removed members, all persisted to Supabase.
- Imported `getTeamMembersForMonth`, `memberTeamHistory`, `allMembersById`, and `updateHistoricalRoster` into Settings.

---

## 2026-03-06 (Settings — Month Selector for Goals & Accelerators)

### Location – Settings Page (`src/pages/Settings.tsx`), Context (`src/contexts/TeamsContext.tsx`)

**Rationale:** The Edit Team dialog in Settings only allowed editing goals and accelerators for the current month. There was no way to view or modify goals for past or future months within a team's test period. Users needed a visual month selector — matching the test phases bar on project pages — to set distinct monthly goals and accelerator rules per team.

**Changes:**
- Added a test phases selector bar inside the Edit Team dialog (between date fields and Monthly Goals), generated from the team's start/end dates via `generateTestPhases()`.
- Each month segment is clickable; selecting a non-current month loads that month's historical goals from `team_goals_history` into the edit form (falls back to the team's current goals if no history exists).
- Shows a "Viewing: [Month Year]" banner with a "Back to Current" link when a past/future month is selected.
- Added `upsertTeamGoalsHistory` function to `TeamsContext` for writing goals to a specific month in `team_goals_history` without modifying the live team object.
- Exported `toMonthKey` from `TeamsContext` for date-to-month-key conversion.
- Modified `saveEditTeam` to route saves: current month updates the live team + auto-snapshots (existing flow); non-current months save only to `team_goals_history` via the new upsert function.
- Month selection resets when the dialog opens or closes.

---

## 2026-03-05 (Ops Counting — Use op_created_date & Calendar-Month Attribution)

### Location – Project Pages (`src/pages/Index.tsx`), Data Page (`src/pages/Data.tsx`), Context (`src/contexts/TeamsContext.tsx`), Quota Helpers (`src/lib/quota-helpers.ts`), Types (`src/lib/database.types.ts`), Migration

**Rationale:** Ops were being counted by `op_date` (close date) rather than when the opportunity was created. Additionally, monthly totals were derived from Monday-based week keys, which could misattribute events near month boundaries (e.g., an op created on a Sunday at the start of a month would be bucketed into the previous month). Monthly goals now use actual calendar-month attribution so any event with a date falling in a given month counts toward that month's total.

**Changes:**
- Renamed the `created_date` column to `op_created_date` across the codebase (migration, `DbMetricsOps` type, TeamsContext fetch, Data page config).
- Switched ops weekly bucketing and Data page filtering from `op_date` to `op_created_date` so ops report under the week/month they were created, not closed.
- Added `monthlyMetrics: Record<string, FunnelData>` to the `TeamMember` interface for calendar-month metric totals.
- Added `aggregateByMonth` helper in `TeamsContext.tsx` that buckets raw metric events by their actual `YYYY-MM` calendar month (parallel to the existing `aggregateByWeek`).
- After assembling teams, computes `monthlyMetrics` per member: starts from week-derived monthly totals (preserving manual weekly overrides), then applies a correction that re-attributes metrics-derived events to their actual calendar month.
- Updated `getMemberMetricTotal` and `getMemberLifetimeMetricTotal` in `quota-helpers.ts` to use `monthlyMetrics` when available, with fallback to the old week-derived approach.
- Added missing `monthlyMetrics`, `level`, `touchedAccountsByTeam`, and `touchedTam` fields to inline `TeamMember` creation in `Index.tsx`.

---

## 2026-03-05 (Database — Add created_date to metrics_ops)

### Location – Database (`metrics_ops` table), Types (`src/lib/database.types.ts`), Context (`src/contexts/TeamsContext.tsx`)

**Rationale:** The `metrics_ops` table needed a `created_date` column to track when each opportunity record was originally created, distinct from the system-managed `created_at` timestamp.

**Changes:**
- Added `created_date` (type `date`, nullable) column to the `metrics_ops` table in Supabase via migration.
- Created local migration file `supabase/migrations/20260306000000_add_created_date_to_metrics_ops.sql`.
- Updated the `DbMetricsOps` TypeScript interface in `src/lib/database.types.ts` to include `created_date: string | null`.
- Updated `TeamsContext.tsx` to include `created_date` in the selected columns when fetching `metrics_ops` rows.

---

## 2026-03-05 (Home Page — Active Project Tiles, Lifetime Stats, Page Overviews)

### Location – Home Page (`src/pages/Home.tsx`), App Router & Nav (`src/App.tsx`)

**Rationale:** The app had no central landing page — the root `/` redirected straight to the first project. Users needed a high-level overview showing all active projects at a glance with their key details (owner, lead rep, members, date range, lifetime stats) and quick navigation to any section of the app.

**Changes:**
- Created a new **Home page** (`src/pages/Home.tsx`) as the app's landing page with a "Home" header.
- Added **Active Projects** section with one clickable card per active team displaying: team name, owner, lead rep, member count, date range, a time-elapsed progress bar with business days remaining, and lifetime stat tiles (Ops, Demos, Wins, Feedback, Activity) — all view-only, matching the data shown on each project's dashboard.
- Added **Explore** section with overview cards describing what to expect on each page: a non-clickable "Project Pages" tile summarizing all project dashboards, plus clickable tiles for "Data & Findings" and "Quota" with bullet-point descriptions.
- Updated **App.tsx** routing: added `/home` route, changed the default `/` redirect from `/Pilots` to `/home`.
- Added a **Home link** with icon as the first item in the top nav bar, separated from project links by a vertical divider.

---

## 2026-03-05 (Fix Page Crashes — Data Page Null Guard, Quota Defensive Safety, Error Boundary)

### Location – Data & Findings Page (`src/pages/Data.tsx`), Quota Page (`src/pages/Quota.tsx`), Quota Helpers (`src/lib/quota-helpers.ts`), Vite Config (`vite.config.ts`)

**Rationale:** The Data & Findings page was crashing to a blank screen immediately on load because some rows in the `superhex` table have `null` for `rep_name`, and `mapRowToTeam()` called `.toLowerCase()` on it without a null check. The Quota page was also vulnerable to blank-screen crashes if any team/member data fields were undefined. Both pages had no React error boundary, and the Vite HMR error overlay was disabled, so users saw only a blank white page with no error message.

**Changes:**
- Fixed the **Data page crash** by adding null guards to `mapRowToTeam()` and `mapWinToTeam()` — both now return `null` early if `row.rep_name` is missing, safely skipping rows with null rep names instead of throwing.
- Added a **React error boundary** (`QuotaErrorBoundary`) wrapping the Quota page so that any future render errors display the actual error message and stack trace with a "Try again" button, instead of a blank page.
- Added **defensive null safety** across all quota helper functions (`computeQuota`, `computeQuotaBreakdown`, `countTriggeredAccelerators`, `getTriggeredAcceleratorDetails`, `getEffectiveGoal`, `getTeamMetricTotal`): optional chaining on `enabledGoals`, `teamGoals`, `members`, and `goals`; nullish coalescing on `acceleratorConfig`; `Array.isArray()` checks on accelerator rule arrays; null-safe rule access.
- Re-enabled the **Vite HMR error overlay** (`overlay: true` in `vite.config.ts`) so that HMR compilation errors are shown to the developer instead of silently breaking the page.

---

## 2026-03-05 (Help Page — Updated for Recent Features, Removed Deep Linking, Added Page Links)

### Location – Help Page (`src/pages/Help.tsx`)

**Rationale:** The Help page had not been updated since 2026-03-02 and was missing documentation for several features added between 2026-03-03 and 2026-03-05 (monthly summary columns, always-visible Activity row, per-project Mission & Purpose, Deal Averages, RevX Impact, Test Data Selections, past-week locking, wins icon change, month-scoped conversion rates). It also contained an outdated Data & Findings section still referencing the removed Hex embed and Findings write box. Additionally, the Deep Linking subsection was no longer needed, and page names mentioned in prose were plain text instead of navigable links.

**Changes:**
- Updated **Mission & Purpose** (section 3a) to reflect per-project independence — each pilot now has its own mission statement.
- Updated **Monthly Stats** (section 3b) to note the wins card always shows an upward green arrow, and added a bullet documenting monthly conversion rates scoped to the selected month.
- Updated **Weekly Data** (section 3c) to document interleaved monthly summary columns (JAN, FEB, MAR headers after each month's last week), the always-visible Activity row below TAM, a note that Totals exclude monthly columns, and uniform column widths in the Team Monthly Aggregate.
- Updated **Rep Self-Overrides** (section 3d) locking description to clarify that past unsubmitted weeks are also locked by default, not just submitted weeks.
- Rewrote **Data & Findings** (section 5) entirely — replaced the outdated Hex Dashboard and Findings description with three new subsections: Deal Averages (6 stat cards with project filter), RevX Impact (per-project value-per-win with total impact summary), and Test Data Selections (filterable metrics explorer with time/data/detail/team-only filters and CSV export).
- Removed the **Deep Linking** subsection from Getting Started and the corresponding "Share deep links" tip from Tips & Shortcuts.
- Added `<Link>` navigation to 9 locations where page names (Pilots, Quota, Settings, Data & Findings, Help) were referenced as plain text — in Navigating the App, Settings intro, Creating a Team, Activating/Deactivating, Test Phases, Monthly Goals, and Tips.

---

## 2026-03-05 (Fix Metrics Data Truncation — Paginated Fetch for All Metrics Tables)

### Location – Teams Context (`src/contexts/TeamsContext.tsx`)

**Rationale:** Activity counts (and potentially calls) stopped populating in the Weekly Data table beyond the week of 2/23, with all earlier weeks showing dashes. The root cause was Supabase's PostgREST API enforcing a server-side `max_rows` limit (default 1000) that silently capped query results, regardless of the `.limit(50000)` specified in client code. With 38,105 rows in `metrics_activity` and 20,640 in `metrics_calls`, only ~1000 rows were actually returned per table, so the weekly aggregation only covered a small recent window of data.

**Changes:**
- Added a `fetchAllRows(table, columns, pageSize)` helper that uses `.range()` pagination to fetch rows in batches of 1000, accumulating all results until the table is fully read.
- Replaced all `.limit(50000)` calls for the 9 metrics/reference tables (`metrics_activity`, `metrics_calls`, `metrics_connects`, `metrics_demos`, `metrics_ops`, `metrics_wins`, `metrics_feedback`, `superhex`, `metrics_tam`) with `fetchAllRows`, ensuring every row is included regardless of the PostgREST `max_rows` setting.
- Updated downstream variable names from `actRes.data`/`callRes.data`/etc. to the direct array results returned by the paginated helper.

---

## 2026-03-05 (Activity Row Always Visible in Weekly Data Table)

### Location – All Pilot Pages (`src/pages/Index.tsx`)

**Rationale:** The Activity metric was hidden in the Weekly Data table unless the activity goal was explicitly enabled in team settings. Managers needed activity counts to always be visible alongside TAM, Connects, and Wins for a complete picture of rep effort each week, and wanted it positioned directly below TAM to reflect its role as a top-of-funnel volume metric.

**Changes:**
- Added `"activity"` to the `alwaysShow` set in both the per-member and team-aggregate weekly data table sections, so the Activity row renders regardless of whether the activity goal toggle is enabled.
- Moved the Activity row from the bottom of the metric rows list to the second position (directly below TAM) in both the per-member and team-aggregate `allMetricRows` arrays.

---

## 2026-03-05 (Test Data Selections — Filterable Metrics Explorer)

### Location – Data & Findings Page (`src/pages/Data.tsx`)

**Rationale:** There was no way to explore the raw metrics event data (activity, calls, connects, demos, wins, ops, feedback) on the Data & Findings page. Managers needed the ability to slice data by time period, pick which metric types to view, toggle between rep-level summaries and account-level detail, filter to team members only, and export the results.

**Changes:**
- Added a new collapsible "Test Data Selections" section to `Data.tsx` with four filter controls: Time (month/week), Data (multi-select of 7 metric types), Detail (summary/detailed), and a Team Only toggle.
- Time filter derives available months and weeks from team start/end dates. Month mode shows one month per option; week mode shows Monday–Sunday ranges. Auto-selects the current month or week on load.
- Data multi-select uses a Popover with Checkboxes for the 7 metric types (Activity, Calls, Connects, Demos, Wins, Ops, Feedback). Each selected type queries its corresponding `metrics_*` Supabase table filtered by the chosen date range.
- Summary view groups data by `rep_name`, showing one row per rep with count columns for each selected data type. Detailed view shows individual event rows with Account Name, Date, Type badge, Rep, and concatenated detail fields, sorted by date descending.
- Team Only toggle filters results to only include rows where `rep_name` matches a known member from the `members` table.
- Added a CSV download icon (right-aligned in the section header) that exports the current table output — summary exports Rep Name + metric counts, detailed exports Account Name, Date, Type, Rep, Details.
- Added imports for `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`, `Popover`, `PopoverTrigger`, `PopoverContent`, `Checkbox`, `Button`, `Switch`, and `Download` icon.
- Added helper types (`DataTypeKey`, `TimeOption`, `NormalizedRow`), configuration constant (`DATA_TYPE_CONFIG`), row normalizer (`normalizeRow`), and CSV exporter (`downloadCsv`) outside the component.

---

## 2026-03-05 (Metrics Schema Migration — Account-Level & Event-Level Data)

### Location – All Pilot Pages (`src/pages/Index.tsx`), Data Page (`src/pages/Data.tsx`), Context (`src/contexts/TeamsContext.tsx`), Types (`src/lib/database.types.ts`), Help (`src/pages/Help.tsx`), Database (Supabase migration `restructure_metrics_tables`)

**Rationale:** The external metrics data pipeline was restructured from weekly-aggregate tables to account-level and individual-event tables. The old `superhex` table held one row per (rep, week) with pre-aggregated counts; it is now one row per (rep, account) with date milestones. New granular event tables (`metrics_activity`, `metrics_calls`, `metrics_connects`, `metrics_chorus`) were added, and existing tables (`metrics_demos`, `metrics_ops`, `metrics_wins`, `metrics_feedback`) had their schemas changed to individual event records. Two tables (`metrics_touched_accounts`, `metrics_main_detailed`) were removed — their data is now derived from `superhex` and `metrics_tam`.

**Changes:**
- Applied a Supabase migration that drops and recreates `superhex`, `metrics_demos`, `metrics_ops`, `metrics_wins`, `metrics_feedback` with new schemas; creates 4 new tables (`metrics_activity`, `metrics_calls`, `metrics_connects`, `metrics_chorus`); drops `metrics_touched_accounts` and `metrics_main_detailed`; adds RLS policies, indexes, `updated_at` triggers, and realtime publication on all event tables.
- Updated `DbSuperhex` in `database.types.ts` to the new 22-field account-level schema. Updated `DbMetricsDemos`, `DbMetricsOps`, `DbMetricsWins`, `DbMetricsFeedback` to match new event-level schemas. Removed `DbMetricsTouchedAccounts` and `DbMetricsMainDetailed`. Added `DbMetricsActivity`, `DbMetricsCalls`, `DbMetricsConnects`, `DbMetricsChorus`.
- Rewrote `loadAll` in `TeamsContext.tsx` to fetch from 7 event tables (with minimal columns for aggregation), aggregate counts by (rep_name, Monday week key) using a `dateToWeekKey` helper, and merge into `weekly_funnels` with the same "non-zero manual values override" behavior.
- Replaced touched accounts derivation: now counts distinct `salesforce_accountid` per rep from `superhex` for `touchedAccounts`, and sums `tam` per rep from `metrics_tam` for `touchedTam`.
- Expanded realtime subscriptions from 5 tables to 12 (added `metrics_activity`, `metrics_calls`, `metrics_connects`, `metrics_demos`, `metrics_ops`, `metrics_wins`, `metrics_feedback` alongside existing `superhex`, `teams`, `members`, `weekly_funnels`, `win_entries`).
- Added `.limit(50000)` to all event-table and superhex queries to prevent Supabase's default 1,000-row cap from silently truncating large datasets (e.g. `metrics_activity` has 13,662 rows).
- Updated `Data.tsx` to query `superhex` instead of `metrics_main_detailed`, replaced all `DbMetricsMainDetailed` references with `DbSuperhex`, and fixed the `latest_activity_date` → `last_activity_date` field mapping.
- Updated help text in `Help.tsx` to describe the new event-based data model.
- No changes required in `Index.tsx` (beyond a comment update), `Quota.tsx`, `Settings.tsx`, or `quota-helpers.ts` — the `WeeklyFunnel` and `TeamMember` interfaces remain stable.

---

## 2026-03-05 (Per-Project Mission & Purpose)

### Location – All Pilot Pages (`src/pages/Index.tsx`), Context (`src/contexts/TeamsContext.tsx`), Hook (`src/hooks/useManagerInputs.ts`), Types (`src/lib/database.types.ts`), Database (Supabase migration `add_mission_to_teams`)

**Rationale:** Mission & Purpose of Test was stored in a single-row global `mission` table, so every project/team shared the same value. When a manager entered or submitted a mission on one pilot, it appeared on all pilots. Each project has a different purpose and needs its own independent mission statement.

**Changes:**
- Applied a Supabase migration adding `mission_purpose` (text) and `mission_submitted` (boolean) columns to the `teams` table. Migrated the existing Toast Growth Platform mission content to that team's row.
- Updated `DbTeam` in `database.types.ts` to include the new `mission_purpose` and `mission_submitted` fields.
- Added `missionPurpose` and `missionSubmitted` to the `Team` interface in `TeamsContext.tsx`, mapped them in `assembleTeams`, and included them in the `updateTeam` diff-and-persist logic so changes auto-save to Supabase.
- Updated `addTeam` to initialize new teams with `missionPurpose: ""` and `missionSubmitted: false`.
- Removed all global mission state (`missionPurpose`, `missionSubmitted`, `missionRowId`), the `mission` table query, and the `updateMission`/`updateMissionSubmitted` callbacks from `useManagerInputs.ts`.
- Updated the Mission & Purpose input in `Index.tsx` to read from `activeTeam.missionPurpose` and write via `updateTeam()`, so each project tab has its own independent mission value and submit state.
- All pilot/project pages remain identical in appearance and operation — each now simply maintains its own mission.

---

## 2026-03-04 (Weekly Data Team Section Alignment)

### Location – Project Pages (`src/pages/Index.tsx`)

**Rationale:** The Team aggregate section at the bottom of the Weekly Data table had its Total column misaligned from the player rows above, and month columns had uneven widths (wider months with more weeks, narrower months with fewer), making the layout visually inconsistent.

**Changes:**
- Fixed `getTeamMonthKeys` to include the interleaved month summary column in each month's `colSpan` (`weekKeys.length + 1`), ensuring the Team section's total column count matches the player rows and the Total column stays right-anchored.
- Replaced variable per-month `colSpan` with a uniform `equalMonthSpan` computed as `Math.floor(totalDataCols / numberOfMonths)`, giving every month column the same width.
- Added a left-side spacer `<td>` (when remainder columns exist) to absorb extra columns, pushing month data rightward so spacing between months is normalized and consistent.

---

## 2026-03-03 (Weekly Data Monthly Summary Columns)

### Location – Project Pages (`src/pages/Index.tsx`)

**Rationale:** The Weekly Data table showed individual week columns but lacked any monthly aggregation, making it difficult to quickly assess performance over a full month without mentally summing across many columns.

**Changes:**
- Added a `buildInterleavedColumns` helper function and `TableCol` type that takes the existing `teamWeeks` array and produces an interleaved column list where a month summary column is inserted after the last week of each calendar month.
- Updated the **header row** to render month summary columns with abbreviated uppercase labels (JAN, FEB, MAR, etc.) styled with `bg-muted/60` and `font-bold` for visual distinction from weekly columns.
- Updated **per-member metric rows** to render month summary cells: TAM shows the carried TAM from the last week of that month; all other metrics sum the weekly values across weeks in that month. Cells styled with `bg-muted/30` and `font-semibold`.
- Updated **per-member conversion rate rows** to render month summary cells by summing numerator and denominator across the month's weeks before computing the percentage.
- The **Total column remains unchanged** — it still reduces over only the original `teamWeeks` array, so month summary columns do not affect totals.
- Updated the Team Monthly Aggregate separator `colSpan` to account for the additional month columns.

---

## 2026-03-03 (Settings Monthly Goals Header Alignment)

### Location – Settings Page (`src/pages/Settings.tsx`)

**Rationale:** The "SCOPE" column header in the Monthly Goals table was not visually aligned above the "SELF" / "TEAM" scope buttons in the data rows, making the table harder to read at a glance.

**Changes:**
- Replaced the header row's `px-1 gap-4` layout with `gap-1.5` to mirror the exact spacing used in each data row.
- Added a `w-11 shrink-0` empty spacer in the header to account for the Switch toggle's layout width, pushing the labels into alignment.
- Set the "Metric" header label to `w-14` to match the metric name span width in data rows.
- "Scope" header label now sits directly above the SELF/TEAM scope button in every row.

---

## 2026-03-03 (Quota Page Column Alignment)

### Location – Quota Page (`src/pages/Quota.tsx`)

**Rationale:** Columns across different project cards on the Quota page were not horizontally aligned with each other. Teams with more columns had narrower columns, and teams with fewer columns had wider ones, making it impossible to visually compare metrics across projects at a glance.

**Changes:**
- Changed the team quota table from `w-full` (stretch to fill card) to `table-fixed` with an explicit computed width (`160px + n × 140px`) so the table is exactly as wide as its columns require and never stretches.
- Set the **Member column** to a fixed `w-[160px]` on both `<th>` and `<td>` elements, ensuring the first metric column always starts at the same horizontal position across all project cards.
- Set each **metric column** to a fixed `w-[140px]` on both `<th>` and `<td>` elements, ensuring uniform column spacing regardless of how many metrics a team has enabled.
- The `overflow-x-auto` wrapper was retained so that teams with more than 5 columns scroll horizontally rather than compressing columns.

---

## 2026-03-03 (Wins Icon Always Up)

### Location – Project Pages (`src/pages/Index.tsx`)

**Rationale:** The wins metric is a positive indicator and should always be represented with an upward-trending arrow, regardless of week-over-week comparison, to reinforce momentum and avoid confusion.

**Changes:**
- Updated the **Wins StatCard icon** in the member stats view to always render `TrendingUp` (green accent) instead of conditionally switching between `TrendingUp` and `TrendingDown` based on `lifetimeWinsUp`.
- Updated the **Wins StatCard icon** in the team stats view to always render `TrendingUp` instead of conditionally switching based on `winsUp`.
- Removed the now-unused `lifetimeWinsUp` and `winsUp` variables.
- Removed the unused `TrendingDown` import from `lucide-react`.

---

## 2026-03-03 (RevX Impact section on Data & Findings)

### Location – Data & Findings (`src/pages/Data.tsx`), Database (`src/lib/database.types.ts`, `supabase/migrations/20250303300000_create_revx_impact_values.sql`)

**Rationale:** Stakeholders needed a quick way to quantify the total revenue impact generated by GTMx across all projects. By entering an average deal value per win for each project, the tool can compute and display a total $ impact, making wins tangible in financial terms.

**Changes:**
- Added a new collapsible **💰 RevX Impact** section to `Data.tsx`, following the same header/toggle UX pattern as the existing Deal Cycle section.
- Section displays a card per project (team) where `wins > 0`, derived by mapping `metrics_main_detailed` rows (those with a `win_date`) to their team via `member_team_history`.
- Each card shows the project name, a wins badge, and an inline editable "$ / win" input — interaction mirrors the lead rep field on the Pilots page (click to edit, Enter or blur to confirm, no visible border).
- Once a value is entered, a **Total Impact** chip appears on the card showing `wins × value_per_win`.
- A **Total RevX Impact** summary bar appears at the bottom of the section, summing all projects, once at least one project has a value entered.
- A subtle "saving…" pulse indicator appears on the card while the Supabase upsert is in flight.
- Values are saved optimistically to `localStorage` on every keystroke and durably upserted to Supabase on blur/Enter.
- Created new Supabase table **`revx_impact_values`** (`id`, `team_id` unique FK → `teams`, `value_per_win numeric(15,2)`, timestamps) with full RLS policies; migration applied live.
- Added **`DbRevxImpactValue`** interface to `src/lib/database.types.ts`.
- On page load, `revx_impact_values` is fetched from Supabase and merged over any stale localStorage data, keeping values in sync across sessions/devices.
---

## 2026-03-03 (Rename section label on Data & Findings page)

### Location – Data & Findings (`src/pages/Data.tsx`)
**Rationale:** The section header "Deal Cycle" was too narrow in scope and didn't accurately reflect the range of average-based metrics displayed within it.
**Changes:**
- Renamed the "Deal Cycle" section heading to "Deal Averages" in `src/pages/Data.tsx`
---

## 2026-03-03 (Rebuild Data & Findings page with Deal Cycle analytics)

### Location – Data & Findings (`src/pages/Data.tsx`), Database (`src/lib/database.types.ts`, `supabase/migrations/`)

**Rationale:** The Data & Findings page previously only embedded a Hex iframe and a manual findings text box. It needed to be rebuilt with actionable deal-cycle analytics derived from `metrics_main_detailed`, using the same collapsible-section UX pattern as the Pilots pages, with per-project filtering via `member_team_history`.

**Changes:**
- Removed the Hex embed card, findings write card, and recent findings card from `Data.tsx`.
- Added a collapsible "Deal Cycle" section using the same `ChevronDown`/`ChevronRight` toggle pattern as the Pilots page, with collapse state persisted to `localStorage`.
- Added 6 stat callout cards in a responsive grid: **Deal Cycle Avg** (first call → win), **Avg Call→Connect**, **Avg Connect→Demo**, **Avg Demo→Win**, **Avg Activities/Demo**, and **Avg Activities/Win**, each showing the computed average and sample size.
- Implemented project mapping logic: each `metrics_main_detailed` row is linked to a team by matching `rep_name` → `members.name` → `member_team_history` date window using the row's first activity date.
- Added a project filter dropdown (All Projects or individual teams) to scope the deal-cycle stats.
- Added `first_activity_date` (date, nullable) column to `metrics_main_detailed` in Supabase via migration; updated `DbMetricsMainDetailed` TypeScript type; `getFirstActivityDate()` prefers this column with fallback chain.
- Added `salesforce_accountid` (text, defaults to `''`) column to `metrics_wins` in Supabase via migration; updated `DbMetricsWins` TypeScript type.
---

## 2026-03-03 (Add metrics_main_detailed table to Supabase)

### Location – Database / Supabase (`supabase/migrations/`, `src/lib/database.types.ts`)

**Rationale:** A new `metrics_main_detailed` table was needed to store granular per-rep, per-customer activity data including call/connect/demo dates, total activities, Chorus links, and win dates, enabling detailed pipeline tracking beyond the existing aggregated metrics tables.

**Changes:**
- Created the `metrics_main_detailed` table in Supabase via migration with columns: `id`, `rep_name`, `customer_name`, `total_activities`, `first_call_date`, `first_connect_date`, `first_demo_date`, `latest_activity_date`, `chorus_link`, `win_date`, plus `created_at`/`updated_at` timestamps.
- Enabled row-level security with open select/insert/update/delete policies matching the existing table pattern.
- Attached the `set_updated_at()` trigger so `updated_at` auto-refreshes on row updates.
- Added local migration file `supabase/migrations/20250303000000_create_metrics_main_detailed.sql`.
- Added `DbMetricsMainDetailed` TypeScript interface to `src/lib/database.types.ts`.
---

## 2026-03-02 (Lock all past-week rep overrides behind name-entry dialog)

### Location – Pilots/Index (`src/pages/Index.tsx`)

**Rationale:** The "Edit Submission" name-entry dialog only appeared when re-opening an already-submitted week. Past weeks that had never been submitted were still fully editable without any audit trail, creating an accountability gap — anyone could silently alter historical data.

**Changes:**
- Added `isPastWeek` derived flag (`repOverrideWeek < currentWeek`) and an `unlockedPastEdits` state set to track which member+week combos have been explicitly unlocked via the name dialog.
- Computed a per-member `isLocked` flag: `f.submitted || (isPastWeek && !unlocked)`. All input fields, the role selector, card styling, and the Submit/Edit button now use `isLocked` instead of `f.submitted`.
- Past weeks that were never submitted now appear locked with the "Edit Submission" button, identical to submitted weeks. Clicking it opens the same name-entry confirmation dialog and logs the edit to the `funnel_edit_log` table.
- `confirmEditSubmission` now conditionally skips the `submitted: false` database write when the week was not previously submitted (no-op on the submitted flag), while still logging the audit entry and adding the member+week to the unlocked set.
---

## 2026-03-02 (Scope team header conversion rates to selected month)

### Location – Pilots/Index (`src/pages/Index.tsx`)

**Rationale:** The team header conversion rates (Call→Connect, Connect→Demo, Demo→Win) were summing calls, connects, and demos over a rolling 8-week window (`getWeekKeys(8)`) instead of the month selected in the test-phase dropdown. This meant the rates mixed data from two different months and didn't match the month-scoped wins, ops, demos, feedback, and activity stats shown directly below. For example, in March with only 2 wins and no calls/connects/demos, the rates still showed values carried over from February.

**Changes:**
- Replaced the `getWeekKeys(8)` rolling-window approach in the Monthly Conversion Rates block of `TeamTab` with a month-prefix filter that only includes weeks whose Monday falls in the selected month (`referenceDate`).
- Calls, connects, and demos totals now use the same `YYYY-MM-` prefix filtering that `getMemberTotalWins` and `getMemberMetricTotal` already use, ensuring all four conversion rate boxes reflect the same month.
---

## 2026-03-02 (Help page updated with latest features)

### Location – Help page (`src/pages/Help.tsx`)

**Rationale:** The Help page ("How to Use GTMx Pilots") was written when it was first created and did not reflect the many features added in the same session: renamed sections, reordered layout, persistent collapse, Lifetime Stats, Monthly Stats, historical goal/roster accuracy, rep override week selector, edit submission audit log, and thousands separators. Users reading the guide would see outdated section names, missing features, and stale descriptions.

**Changes:**
- Updated all section name references throughout the page: "Manager Inputs" → "Summary", "Test Signals" → "Monthly Data", "Player's Section" → "Rep Self-Overrides".
- Updated the Pilots Page intro to list the four sections in their new order (Summary, Monthly Data, Weekly Data, Rep Self-Overrides) and added notes on persistent collapse state and thousands separators.
- Added "Lifetime Stats" subsection under Summary describing the orange-bordered cumulative performance card.
- Expanded the "Month Look-Back" subsection with roster accuracy (member history tracking) and goal/accelerator accuracy (historical snapshots) descriptions.
- Updated the manual TAM fallback description to mention the computed Touched Accounts, Avg TAM, and Touch Rate stats now shown alongside the editable input.
- Restructured section 3b (now "Monthly Data") into three subsections: Monthly Stats (blue-bordered card with month badge), Monthly Goals (moved here from Summary, with historical config note), and Funnel Overview & Player Selection.
- Reordered Weekly Data to 3c and Rep Self-Overrides to 3d to match the current page layout.
- Added "Week Selector" documentation in Rep Self-Overrides explaining the dropdown for choosing any week within the team's date range.
- Added "Submit & Edit Submission" documentation describing the confirmation dialog, name entry, and audit trail logging.
- Updated the "Your Funnels" description to clarify that entered values overwrite report values.
- Added "Historical accuracy" bullet to the Quota section noting that past months use the correct goals, accelerators, and roster.
- Updated the Real-Time Data section to reference "Rep Self-Overrides" instead of "Player's Section".
- Updated the Settings member-move description to reflect the new in-place move with history tracking.
- Added new tips: week selector usage, look-back with correct historical data, persistent collapse preference.
- Updated existing tips: former members note now mentions cross-project moves, collapse tip now mentions auto-save and cross-pilot sharing.
- Added Help link mention in the "Navigating the App" subsection and updated deep link anchor descriptions with new section names.
---

## 2026-03-02 (Rep override week selector & edit submission audit log)

### Location – Pilots/Index (`src/pages/Index.tsx`), Supabase (`funnel_edit_log` table), Database Types (`src/lib/database.types.ts`)

**Rationale:** Reps could only enter override data for the current week, with no way to go back and update a prior week's numbers. Additionally, when a submitted week was re-opened for editing there was no record of who made the change, creating an accountability gap.

**Changes:**
- Added a week selector dropdown in the Rep Self-Overrides "Your Funnels" section header. Reps can now choose any week within the team's date range; the current week is labeled "(current)" and selected by default.
- All funnel reads, writes, role updates, submit, and edit-submission actions within Rep Self-Overrides now operate on the selected week (`repOverrideWeek` state) rather than the hardcoded current week.
- Replaced the inline "Edit Submission" button logic with a confirmation dialog that prompts the editor to enter their name before unlocking a submitted week.
- Created a new `funnel_edit_log` Supabase table (`member_id`, `week_key`, `edited_by`, `edited_at`) to persist an audit trail of who re-opened each submitted funnel week. Migration applied to Supabase and saved locally at `supabase/migrations/20250302210000_create_funnel_edit_log.sql`.
- Added the `DbFunnelEditLog` TypeScript interface to `src/lib/database.types.ts`.
---

## 2026-03-02 (Dashboard section reordering & header renames)

### Location – Pilots/Index (`src/pages/Index.tsx`)

**Rationale:** The dashboard section ordering and naming did not reflect the intended information hierarchy. Monthly Goals needed to appear directly after Monthly Stats for a natural top-down reading flow, the Weekly Data grid needed to precede the rep input section, and several section headers used internal/working titles that were confusing for end users.

**Changes:**
- Moved the Monthly Goals table from the top-level "Summary" (formerly Manager Inputs) section into the `TeamTab` component, positioned immediately after Monthly Stats inside the Monthly Data collapsible. Added `memberGoalsHistory` as a new prop to `TeamTab` to support historical goal overlays in the new location.
- Swapped the order of Weekly Data and Player's Section so that Weekly Data now renders first.
- Renamed the "Manager Inputs" section header to "Summary".
- Renamed the "Test Signals" section header to "Monthly Data".
- Renamed the "Player's Section" header to "Rep Self-Overrides".
- Replaced the 🎮 emoji on Rep Self-Overrides with a Lucide `Scale` icon, rendered inline with the heading text.
---

## 2026-03-02 (Persistent section collapse & Lifetime Stats relocation)

### Location – Pilots/Index (`src/pages/Index.tsx`)

**Rationale:** When users collapsed sections (Test Signals, Player's Section, etc.) their preferences were lost on page refresh or when switching between pilots. Additionally, collapsing a section on one pilot did not carry over to other pilots, forcing repetitive clicks. The Lifetime Stats card was also nested inside the Test Signals section where it was less visible; managers wanted it positioned higher on the page alongside other top-level inputs.

**Changes:**
- Section collapse/expand state now persists to `localStorage` under a shared `collapsed-sections` key so preferences survive page refreshes and browser restarts.
- Lifted `collapsedSections` state and `toggleSection` handler from the per-team `TeamTab` component up to the parent `Index` component and passed them as props. Collapsing a section on one pilot now collapses it across all pilots automatically.
- Moved the Lifetime Stats card out of the Test Signals section (inside `TeamTab`) and into the Manager Inputs section of the `Index` component, positioned directly above the Total TAM row and below Mission & Purpose of Test.
- Lifetime stats are now computed from `activeTeam.members` in the parent component, so they update correctly when switching between pilots.
- Removed the now-unused lifetime computation variables from `TeamTab`.
---

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
- Updated the TAM section, Goals section, and `TeamTab` component in `Index.tsx` to use `getTeamMembersForMonth()` so that viewing a past month shows the historical member count and correct TAM average (e.g. Toast Growth Platform in February shows 2 members when Will Andrews was still there, not 1).
- Updated `TeamQuotaCard` in `Quota.tsx` to use `getTeamMembersForMonth()` for the same historical accuracy on the Quota page.
- Manually updated `member_team_history` rows in Supabase with correct start dates for all current members and recorded Will Andrews' move from Toast Growth Platform to Sterno on March 1.
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

**Rationale:** Historic TAM values were missing for several project teams, leaving weekly funnel data blank from the week of 9/29/2025 onward (and from 6/30/2025 for Toast Growth Platform). These needed to be manually populated so historical reporting and funnel metrics reflect accurate TAM figures.

**Changes:**
- **Project Sterno** (3 members: Morgan Weeks, Ross Armstrong, Will Andrews): Inserted 61 new `weekly_funnels` rows with TAM = 433 per member (1300 / 3) for weeks 2025-09-29 through 2026-02-23. Five pre-existing rows already had TAM = 433 and were left unchanged.
- **Project Mad Max** (3 members: Carly King, Shane Hughes, Zoe Lang): Inserted 60 new `weekly_funnels` rows with TAM = 600 per member (1800 / 3) for weeks 2025-09-29 through 2026-02-23. Six pre-existing rows already had TAM = 600 and were left unchanged.
- **Project Toast Growth Platform** (1 member: Lo Picton): Inserted 20 new `weekly_funnels` rows with TAM = 2400 (2400 / 1) for weeks 2025-09-29 through 2026-02-23. Two pre-existing rows were updated from TAM = 4000 to TAM = 2400 for consistency. Additionally, inserted 13 new rows with TAM = 2400 for the earlier range of weeks 2025-06-30 through 2025-09-22.
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
- Changed the percentage `<p>` element for Call→Connect from `text-accent` to `text-secondary-foreground` so it matches the team name ("Toast Growth Platform") color.
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
- Added `pilotNameToSlug` utility that derives a URL segment from the (editable) pilot name (e.g. "Mad Max" -> "Mad_Max", "Toast Growth Platform" -> "Toast_Growth_Platform").
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
