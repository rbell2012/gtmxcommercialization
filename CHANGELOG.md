# Changelog

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
