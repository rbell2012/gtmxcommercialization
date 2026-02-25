# Changelog

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
