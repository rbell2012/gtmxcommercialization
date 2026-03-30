import type { Team } from "@/contexts/TeamsContext";
import { generateTestPhases } from "@/lib/test-phases";

export type AttachRateDenomMode = "flagged_wins" | "all_wins";

/** Per test-phase month: how wins (and related pilot KPIs) filter ops rows. */
export interface PhaseCalcConfig {
  opportunityFlags: string[];
  lineItemTargets: string[];
  prospectingNotes: string[];
  /** Denominator for pilot attach rate: wins matching flags only vs all wins */
  attachRateDenom: AttachRateDenomMode;
}

export function normalizeAttachRateDenom(raw: string | null | undefined): AttachRateDenomMode {
  return raw === "all_wins" ? "all_wins" : "flagged_wins";
}

export function parsePhaseCalcJsonArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * When no row exists in `team_phase_configs` for this month_index, use team.overallGoal flags/targets.
 * When a row exists, use its arrays (even if empty — explicit user choice).
 */
export function resolvePhaseCalcConfig(
  team: Team,
  monthIndex: number | null | undefined,
  phaseCalcByTeam: Record<string, Record<number, PhaseCalcConfig>>,
): PhaseCalcConfig {
  const globalFlags = team.overallGoal?.opportunityFlags ?? [];
  const globalTargets = team.overallGoal?.lineItemTargets ?? [];
  if (monthIndex == null || Number.isNaN(monthIndex)) {
    return {
      opportunityFlags: globalFlags,
      lineItemTargets: globalTargets,
      prospectingNotes: [],
      attachRateDenom: "flagged_wins",
    };
  }
  const row = phaseCalcByTeam[team.id]?.[monthIndex];
  if (!row) {
    return {
      opportunityFlags: globalFlags,
      lineItemTargets: globalTargets,
      prospectingNotes: [],
      attachRateDenom: "flagged_wins",
    };
  }
  return {
    opportunityFlags: [...row.opportunityFlags],
    lineItemTargets: [...row.lineItemTargets],
    prospectingNotes: [...row.prospectingNotes],
    attachRateDenom: row.attachRateDenom,
  };
}

/** Calendar month key `YYYY-MM` → test phase `monthIndex`, or null if outside project window. */
export function monthIndexForCalendarMonthKey(
  team: Team,
  phaseLabels: Record<number, string>,
  monthKey: string,
): number | null {
  const phases = generateTestPhases(team.startDate, team.endDate, phaseLabels);
  const y = Number(monthKey.slice(0, 4));
  const m = Number(monthKey.slice(5, 7));
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
  const p = phases.find((ph) => ph.year === y && ph.month === m - 1);
  return p ? p.monthIndex : null;
}

/**
 * True when attributed-rep / ops-based lifetime wins path can apply for any phase of the test.
 */
export function teamQualifiesForAttributedOpsWinsPath(
  team: Team,
  monthIndices: number[],
  phaseCalcByTeam: Record<string, Record<number, PhaseCalcConfig>>,
): boolean {
  if (monthIndices.length === 0) {
    const c = resolvePhaseCalcConfig(team, undefined, phaseCalcByTeam);
    return c.opportunityFlags.length > 0 && c.lineItemTargets.length > 0;
  }
  for (const mi of monthIndices) {
    const c = resolvePhaseCalcConfig(team, mi, phaseCalcByTeam);
    if (c.opportunityFlags.length > 0 && c.lineItemTargets.length > 0) return true;
  }
  return false;
}
