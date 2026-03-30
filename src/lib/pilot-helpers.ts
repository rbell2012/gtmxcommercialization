import { dateToWeekKey, isWinStage } from "@/lib/metrics-helpers";
import { lineItemsMatchTargetNames, parseLineItemTotal } from "@/lib/lineItemParser";
import type { MetricsByWeekBundle, ProjectTeamAssignment, SalesTeam, Team } from "@/contexts/TeamsContext";
import type { AttachRateDenomMode, PhaseCalcConfig } from "@/lib/phase-calc-config";
import { resolvePhaseCalcConfig } from "@/lib/phase-calc-config";
import type { MetricExclusionRow } from "@/lib/metric-exclusions";
import { rowExcludedForTeamMetric, teamWideMetricRulesOnly } from "@/lib/metric-exclusions";

export const PILOT_REGION_PHASE_LABELS = [
  "Sales Org Pilot / Commercial Lead",
  "Recommendations",
  "GA / Commercial Lead",
] as const;

export function isPilotRegionPhaseLabel(label: string | null | undefined): boolean {
  if (!label) return false;
  return (PILOT_REGION_PHASE_LABELS as readonly string[]).includes(label);
}

/** Use the segment after the final " - " (e.g. leader name) when full sales team titles are too long. */
export function pilotSalesTeamShortLabel(displayName: string): string {
  const s = displayName.trim();
  const sep = " - ";
  const i = s.lastIndexOf(sep);
  if (i === -1) return s;
  return s.slice(i + sep.length).trim() || s;
}

export function toMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export { dateToWeekKey } from "@/lib/metrics-helpers";

function repKey(name: string | null | undefined): string {
  return (name ?? "").toLowerCase().trim();
}

/** When `flags` is non-empty, keep only rows whose opportunity_name contains ANY flag (case-insensitive). */
export function filterByOpportunityFlag(
  rows: Record<string, unknown>[],
  flags: string[],
): Record<string, unknown>[] {
  if (!flags || flags.length === 0) return rows;
  const lowers = flags.map((f) => f.toLowerCase());
  return rows.filter((r) => {
    const n = String(r.opportunity_name ?? "").toLowerCase();
    return lowers.some((fl) => n.includes(fl));
  });
}

/** When `notes` is non-empty, keep only rows whose account_prospecting_notes contains ANY value (case-insensitive). */
export function filterByProspectingNotes(
  rows: Record<string, unknown>[],
  notes: string[],
): Record<string, unknown>[] {
  if (!notes || notes.length === 0) return rows;
  const lowers = notes.map((n) => n.toLowerCase());
  return rows.filter((r) => {
    const n = String(r.account_prospecting_notes ?? "").toLowerCase();
    return lowers.some((needle) => n.includes(needle));
  });
}

export function buildProspectingNotesAccountSets(
  shRows: Record<string, unknown>[],
  notes: string[],
): { accountIds: Set<string>; accountNames: Set<string> } {
  if (!notes || notes.length === 0) return { accountIds: new Set(), accountNames: new Set() };
  const lowers = notes.map((n) => n.toLowerCase());
  const accountIds = new Set<string>();
  const accountNames = new Set<string>();
  for (const row of shRows) {
    const pn = String(row.prospecting_notes ?? "").toLowerCase();
    if (!lowers.some((needle) => pn.includes(needle))) continue;
    const accountId = row.salesforce_accountid;
    if (typeof accountId === "string" && accountId.trim()) accountIds.add(accountId.trim());
    const accountName = row.account_name;
    if (typeof accountName === "string" && accountName.trim()) accountNames.add(accountName.trim().toLowerCase());
  }
  return { accountIds, accountNames };
}

/**
 * Inverse of filterByOpportunityFlag. When `flags` is non-empty, keep only rows whose
 * opportunity_name does NOT contain any flag (case-insensitive). When `flags` is empty,
 * returns all rows — consistent with filterByOpportunityFlag's empty-flags behavior.
 */
export function filterByOpportunityFlagInverse(
  rows: Record<string, unknown>[],
  flags: string[],
): Record<string, unknown>[] {
  if (!flags || flags.length === 0) return rows;
  const lowers = flags.map((f) => f.toLowerCase());
  return rows.filter((r) => {
    const n = String(r.opportunity_name ?? "").toLowerCase();
    return !lowers.some((fl) => n.includes(fl));
  });
}

/**
 * Count qualified wins in opsRows (pre-filtered by opportunityFlags) that have at least
 * one matching target line item. No rep filter — total is attributed to the configured
 * attributed rep in the UI.
 */
export function countOpsWinsAllTime(
  opsRows: Record<string, unknown>[],
  targets: string[],
): number {
  let n = 0;
  for (const row of opsRows) {
    if (!isWinStage(row.opportunity_stage as string | null, row.opportunity_type as string | null)) continue;
    if (targets.length > 0 && !lineItemsMatchTargetNames(row.line_items as string | null, targets)) continue;
    n++;
  }
  return n;
}

/** One calendar month of the test (matches `ComputedPhase` from test-phases). */
export type LifetimeStatsPhaseSlice = {
  monthIndex: number;
  label: string;
  year: number;
  month: number;
};

/**
 * Split lifetime wins for attributed-rep / flag path: pilot-labeled months with assignments
 * count only pilot-roster reps; all other qualifying closes (other months, empty pilot roster,
 * non-pilot rep in a pilot month, missing/unknown month) go to otherPhaseWins.
 */
export function countOpsWinsSplitForLifetimeStats(
  opsRows: Record<string, unknown>[],
  team: Team,
  phases: LifetimeStatsPhaseSlice[],
  assignments: ProjectTeamAssignment[],
  salesTeams: SalesTeam[],
  teamId: string,
  phaseCalcByTeam: Record<string, Record<number, PhaseCalcConfig>>,
): { pilotPhaseWins: number; otherPhaseWins: number; total: number } {
  const monthMeta = new Map<string, { isPilotLabeledMonth: boolean; pilotReps: Set<string> }>();
  for (const ph of phases) {
    const mk = `${ph.year}-${String(ph.month + 1).padStart(2, "0")}`;
    const pilotReps = resolvePilotAssignments(assignments, salesTeams, teamId, ph.monthIndex).pilotRepNames;
    monthMeta.set(mk, {
      isPilotLabeledMonth: isPilotRegionPhaseLabel(ph.label),
      pilotReps,
    });
  }

  let pilotPhaseWins = 0;
  let otherPhaseWins = 0;

  for (const row of opsRows) {
    if (!isWinStage(row.opportunity_stage as string | null, row.opportunity_type as string | null)) continue;

    const ed = effectiveWinDate(row);
    const mk = monthKeyFromDateStr(ed);

    const phSlice = mk ? phases.find((p) => `${p.year}-${String(p.month + 1).padStart(2, "0")}` === mk) : undefined;
    const cfg = phSlice
      ? resolvePhaseCalcConfig(team, phSlice.monthIndex, phaseCalcByTeam)
      : resolvePhaseCalcConfig(team, undefined, phaseCalcByTeam);

    if (cfg.opportunityFlags.length > 0) {
      const n = String(row.opportunity_name ?? "").toLowerCase();
      const lowers = cfg.opportunityFlags.map((f) => f.toLowerCase());
      if (!lowers.some((fl) => n.includes(fl))) continue;
    }
    if (cfg.prospectingNotes.length > 0) {
      const n = String(row.account_prospecting_notes ?? "").toLowerCase();
      const lowers = cfg.prospectingNotes.map((f) => f.toLowerCase());
      if (!lowers.some((fl) => n.includes(fl))) continue;
    }
    if (cfg.lineItemTargets.length > 0 && !lineItemsMatchTargetNames(row.line_items as string | null, cfg.lineItemTargets)) {
      continue;
    }

    if (!mk) {
      otherPhaseWins++;
      continue;
    }

    const meta = monthMeta.get(mk);
    if (!meta) {
      otherPhaseWins++;
      continue;
    }
    if (meta.isPilotLabeledMonth && meta.pilotReps.size > 0) {
      if (meta.pilotReps.has(repKey(row.rep_name as string))) pilotPhaseWins++;
      else otherPhaseWins++;
    } else {
      otherPhaseWins++;
    }
  }

  return {
    pilotPhaseWins,
    otherPhaseWins,
    total: pilotPhaseWins + otherPhaseWins,
  };
}

export type LifetimeMetricSplit = {
  pilotLabeledMonths: number;
  otherMonths: number;
  total: number;
};

/**
 * Lifetime ops from raw metrics: per-month phase config (flags, prospecting notes, line items)
 * then pilot-labeled months with assignments count member + pilot-rep rows; other months members only.
 */
export function countLifetimeOpsAdjustedSplit(
  opsRows: Record<string, unknown>[],
  team: Team,
  phases: LifetimeStatsPhaseSlice[],
  assignments: ProjectTeamAssignment[],
  salesTeams: SalesTeam[],
  teamId: string,
  phaseCalcByTeam: Record<string, Record<number, PhaseCalcConfig>>,
  memberRepKeys: Set<string>,
): LifetimeMetricSplit {
  const monthMeta = new Map<string, { isPilotLabeledMonth: boolean; pilotReps: Set<string> }>();
  for (const ph of phases) {
    const mk = `${ph.year}-${String(ph.month + 1).padStart(2, "0")}`;
    const pilotReps = resolvePilotAssignments(assignments, salesTeams, teamId, ph.monthIndex).pilotRepNames;
    monthMeta.set(mk, {
      isPilotLabeledMonth: isPilotRegionPhaseLabel(ph.label),
      pilotReps,
    });
  }

  let pilotLabeledMonths = 0;
  let otherMonths = 0;

  for (const row of opsRows) {
    const mk = monthKeyFromDateStr(row.op_created_date as string | null);
    const phSlice = mk ? phases.find((p) => `${p.year}-${String(p.month + 1).padStart(2, "0")}` === mk) : undefined;
    const cfg = phSlice
      ? resolvePhaseCalcConfig(team, phSlice.monthIndex, phaseCalcByTeam)
      : resolvePhaseCalcConfig(team, undefined, phaseCalcByTeam);

    if (cfg.opportunityFlags.length > 0) {
      const n = String(row.opportunity_name ?? "").toLowerCase();
      const lowers = cfg.opportunityFlags.map((f) => f.toLowerCase());
      if (!lowers.some((fl) => n.includes(fl))) continue;
    }
    if (cfg.prospectingNotes.length > 0) {
      const n = String(row.account_prospecting_notes ?? "").toLowerCase();
      const lowers = cfg.prospectingNotes.map((f) => f.toLowerCase());
      if (!lowers.some((fl) => n.includes(fl))) continue;
    }
    if (cfg.lineItemTargets.length > 0 && !lineItemsMatchTargetNames(row.line_items as string | null, cfg.lineItemTargets)) {
      continue;
    }

    const rk = repKey(row.rep_name as string);
    if (!mk) {
      if (memberRepKeys.has(rk)) otherMonths++;
      continue;
    }

    const meta = monthMeta.get(mk);
    if (!meta) {
      if (memberRepKeys.has(rk)) otherMonths++;
      continue;
    }
    if (meta.isPilotLabeledMonth && meta.pilotReps.size > 0) {
      if (memberRepKeys.has(rk) || meta.pilotReps.has(rk)) pilotLabeledMonths++;
    } else {
      if (memberRepKeys.has(rk)) otherMonths++;
    }
  }

  return {
    pilotLabeledMonths,
    otherMonths,
    total: pilotLabeledMonths + otherMonths,
  };
}

/**
 * Lifetime demos: pilot-labeled months with assignments = member + pilot reps; other months members only.
 * Demos are not filtered by opportunity name (no op name on demo rows).
 */
export function countLifetimeDemosAdjustedSplit(
  demoRows: Record<string, unknown>[],
  phases: LifetimeStatsPhaseSlice[],
  assignments: ProjectTeamAssignment[],
  salesTeams: SalesTeam[],
  teamId: string,
  memberRepKeys: Set<string>,
): LifetimeMetricSplit {
  const monthMeta = new Map<string, { isPilotLabeledMonth: boolean; pilotReps: Set<string> }>();
  for (const ph of phases) {
    const mk = `${ph.year}-${String(ph.month + 1).padStart(2, "0")}`;
    const pilotReps = resolvePilotAssignments(assignments, salesTeams, teamId, ph.monthIndex).pilotRepNames;
    monthMeta.set(mk, {
      isPilotLabeledMonth: isPilotRegionPhaseLabel(ph.label),
      pilotReps,
    });
  }

  let pilotLabeledMonths = 0;
  let otherMonths = 0;

  for (const row of demoRows) {
    const mk = monthKeyFromDateStr(row.demo_date as string | null);
    const rk = repKey(row.rep_name as string);
    if (!mk) {
      if (memberRepKeys.has(rk)) otherMonths++;
      continue;
    }
    const meta = monthMeta.get(mk);
    if (!meta) {
      if (memberRepKeys.has(rk)) otherMonths++;
      continue;
    }
    if (meta.isPilotLabeledMonth && meta.pilotReps.size > 0) {
      if (memberRepKeys.has(rk) || meta.pilotReps.has(rk)) pilotLabeledMonths++;
    } else {
      if (memberRepKeys.has(rk)) otherMonths++;
    }
  }

  return {
    pilotLabeledMonths,
    otherMonths,
    total: pilotLabeledMonths + otherMonths,
  };
}

/** Ops rows that contribute to attributed lifetime wins (same filters as countOpsWinsSplitForLifetimeStats). */
export function filterOpsRowsForLifetimeAttributedPath(
  opsRows: Record<string, unknown>[],
  team: Team,
  phases: LifetimeStatsPhaseSlice[],
  assignments: ProjectTeamAssignment[],
  salesTeams: SalesTeam[],
  teamId: string,
  phaseCalcByTeam: Record<string, Record<number, PhaseCalcConfig>>,
): Record<string, unknown>[] {
  const monthMeta = new Map<string, { isPilotLabeledMonth: boolean; pilotReps: Set<string> }>();
  for (const ph of phases) {
    const mk = `${ph.year}-${String(ph.month + 1).padStart(2, "0")}`;
    const pilotReps = resolvePilotAssignments(assignments, salesTeams, teamId, ph.monthIndex).pilotRepNames;
    monthMeta.set(mk, {
      isPilotLabeledMonth: isPilotRegionPhaseLabel(ph.label),
      pilotReps,
    });
  }

  const out: Record<string, unknown>[] = [];
  for (const row of opsRows) {
    if (!isWinStage(row.opportunity_stage as string | null, row.opportunity_type as string | null)) continue;

    const ed = effectiveWinDate(row);
    const mk = monthKeyFromDateStr(ed);

    const phSlice = mk ? phases.find((p) => `${p.year}-${String(p.month + 1).padStart(2, "0")}` === mk) : undefined;
    const cfg = phSlice
      ? resolvePhaseCalcConfig(team, phSlice.monthIndex, phaseCalcByTeam)
      : resolvePhaseCalcConfig(team, undefined, phaseCalcByTeam);

    if (cfg.opportunityFlags.length > 0) {
      const n = String(row.opportunity_name ?? "").toLowerCase();
      const lowers = cfg.opportunityFlags.map((f) => f.toLowerCase());
      if (!lowers.some((fl) => n.includes(fl))) continue;
    }
    if (cfg.prospectingNotes.length > 0) {
      const n = String(row.account_prospecting_notes ?? "").toLowerCase();
      const lowers = cfg.prospectingNotes.map((f) => f.toLowerCase());
      if (!lowers.some((fl) => n.includes(fl))) continue;
    }
    if (cfg.lineItemTargets.length > 0 && !lineItemsMatchTargetNames(row.line_items as string | null, cfg.lineItemTargets)) {
      continue;
    }

    if (!mk) {
      out.push(row);
      continue;
    }

    const meta = monthMeta.get(mk);
    if (!meta) {
      out.push(row);
      continue;
    }
    out.push(row);
  }

  return out;
}

/**
 * Sum qualified wins in `winsDetailRows` for reps in `repKeys` in ISO week `weekKey`.
 * Rows must include `_effective_date` (from metrics_wins + win_stage_date merge) and `opportunity_name`.
 */
export function sumWinsInWeekForReps(
  winsDetailRows: Record<string, unknown>[],
  repKeys: Set<string>,
  weekKey: string,
  opportunityFlags: string[],
  prospectingNotes: string[],
  metricExclusions?: MetricExclusionRow[],
): number {
  const lowers = (opportunityFlags ?? []).map((f) => f.toLowerCase());
  const notes = (prospectingNotes ?? []).map((n) => n.toLowerCase());
  const excl = teamWideMetricRulesOnly(metricExclusions ?? []);
  let n = 0;
  for (const row of winsDetailRows) {
    const rk = repKey(row.rep_name as string);
    if (!repKeys.has(rk)) continue;
    if (excl.length > 0 && rowExcludedForTeamMetric(row, excl, "wins")) continue;
    if (lowers.length > 0) {
      const name = String(row.opportunity_name ?? "").toLowerCase();
      if (!lowers.some((fl) => name.includes(fl))) continue;
    }
    if (notes.length > 0) {
      const val = String(row.account_prospecting_notes ?? "").toLowerCase();
      if (!notes.some((needle) => val.includes(needle))) continue;
    }
    const ed = row._effective_date as string | null | undefined;
    if (!ed || dateToWeekKey(ed) !== weekKey) continue;
    n++;
  }
  return n;
}

function effectiveWinDate(row: Record<string, unknown>): string | null {
  const wsd = row.win_stage_date as string | null | undefined;
  const od = row.op_date as string | null | undefined;
  return wsd || od || null;
}

function monthKeyFromDateStr(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  return dateStr.slice(0, 7);
}

export function isGrowthOpportunityType(opportunityType: string | null | undefined): boolean {
  const t = opportunityType ?? "";
  return !t || t === "Existing Business (Upsell)";
}

export function resolvePilotAssignments(
  assignments: ProjectTeamAssignment[],
  salesTeams: SalesTeam[],
  teamId: string,
  monthIndex: number,
): {
  pilotRepNames: Set<string>;
  pilotSalesTeams: SalesTeam[];
  repToTeamId: Map<string, string>;
  regionCount: number;
  repCount: number;
} {
  const monthAssignments = assignments.filter((a) => a.teamId === teamId && a.monthIndex === monthIndex);
  const pilotSalesTeams = monthAssignments
    .map((a) => salesTeams.find((st) => st.id === a.salesTeamId))
    .filter((st): st is SalesTeam => st != null);

  const repToTeamId = new Map<string, string>();
  const pilotRepNames = new Set<string>();

  for (const a of monthAssignments) {
    const st = salesTeams.find((s) => s.id === a.salesTeamId);
    if (!st) continue;
    const excluded = new Set(
      (a.excludedMembers ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    );
    const names = st.teamMembers.split(",").map((s) => s.trim()).filter(Boolean);
    for (const name of names) {
      if (excluded.has(name)) continue;
      const k = repKey(name);
      if (!k) continue;
      pilotRepNames.add(k);
      repToTeamId.set(k, st.id);
    }
  }

  return {
    pilotRepNames,
    pilotSalesTeams,
    repToTeamId,
    regionCount: pilotSalesTeams.length,
    repCount: pilotRepNames.size,
  };
}

/** Reps belonging to one sales team (respecting exclusions on the assignment). */
export function repsForSalesTeam(
  salesTeam: SalesTeam,
  assignment: ProjectTeamAssignment | undefined,
): Set<string> {
  const excluded = new Set(
    (assignment?.excludedMembers ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  );
  const set = new Set<string>();
  for (const name of salesTeam.teamMembers.split(",").map((s) => s.trim()).filter(Boolean)) {
    if (excluded.has(name)) continue;
    const k = repKey(name);
    if (k) set.add(k);
  }
  return set;
}

function filterPilotOpsRows(
  opsRows: Record<string, unknown>[],
  pilotRepNames: Set<string>,
): Record<string, unknown>[] {
  return opsRows.filter((row) => pilotRepNames.has(repKey(row.rep_name as string)));
}

export function countPilotOpsInMonth(
  opsRows: Record<string, unknown>[],
  pilotRepNames: Set<string>,
  monthKey: string,
): number {
  let n = 0;
  for (const row of opsRows) {
    if (!pilotRepNames.has(repKey(row.rep_name as string))) continue;
    const mk = monthKeyFromDateStr(row.op_created_date as string | null);
    if (mk === monthKey) n++;
  }
  return n;
}

export function countPilotDemosInMonth(
  demoRows: Record<string, unknown>[],
  pilotRepNames: Set<string>,
  monthKey: string,
): number {
  let n = 0;
  for (const row of demoRows) {
    if (!pilotRepNames.has(repKey(row.rep_name as string))) continue;
    const mk = monthKeyFromDateStr(row.demo_date as string | null);
    if (mk === monthKey) n++;
  }
  return n;
}

/** Wins (qualified stage) in month; optional filter to rows with target line items only. */
export function getPilotWinRowsInMonth(
  opsRows: Record<string, unknown>[],
  pilotRepNames: Set<string>,
  targets: string[],
  monthKey: string,
  options?: { withTargetOnly?: boolean },
): Record<string, unknown>[] {
  const withTargetOnly = options?.withTargetOnly ?? false;
  const rows: Record<string, unknown>[] = [];
  for (const row of filterPilotOpsRows(opsRows, pilotRepNames)) {
    const stage = row.opportunity_stage as string | null | undefined;
    const opType = row.opportunity_type as string | null | undefined;
    if (!isWinStage(stage, opType)) continue;
    const ed = effectiveWinDate(row);
    const mk = monthKeyFromDateStr(ed);
    if (mk !== monthKey) continue;
    const hasT = parseLineItemTotal(row.line_items as string | null, targets) > 0;
    if (withTargetOnly && !hasT) continue;
    rows.push(row);
  }
  return rows;
}

export function pilotRepBreakdownWinsWithTarget(
  opsRows: Record<string, unknown>[],
  pilotRepNames: Set<string>,
  targets: string[],
  monthKey: string,
): Array<{ repKey: string; displayName: string; wins: number }> {
  const wins = getPilotWinRowsInMonth(opsRows, pilotRepNames, targets, monthKey, { withTargetOnly: true });
  const byRep = new Map<string, { displayName: string; wins: number }>();
  for (const rk of pilotRepNames) {
    byRep.set(rk, { displayName: rk, wins: 0 });
  }
  for (const row of wins) {
    const raw = (row.rep_name as string) ?? "";
    const rk = repKey(raw);
    if (!byRep.has(rk)) continue;
    const cur = byRep.get(rk)!;
    cur.displayName = raw.trim() || rk;
    cur.wins += 1;
  }
  return Array.from(byRep.entries())
    .map(([repKey, v]) => ({ repKey, displayName: v.displayName, wins: v.wins }))
    .sort((a, b) => b.wins - a.wins || a.displayName.localeCompare(b.displayName));
}

export function getPilotWinsWithTargetBreakdown(
  opsRows: Record<string, unknown>[],
  pilotRepNames: Set<string>,
  targets: string[],
  monthKey: string,
): { total: number; growth: number; nb: number } {
  const rows = getPilotWinRowsInMonth(opsRows, pilotRepNames, targets, monthKey, { withTargetOnly: true });
  let growth = 0;
  let nb = 0;
  for (const row of rows) {
    if (isGrowthOpportunityType(row.opportunity_type as string | null)) growth++;
    else nb++;
  }
  return { total: rows.length, growth, nb };
}

/**
 * Wins for Test Phases footer for one calendar month when the team uses opportunity flags.
 * Uses the same qualification as `countOpsWinsSplitForLifetimeStats` (flagged ops, win stage,
 * `lineItemsMatchTargetNames`, effective close month) for **any rep** — so summing across
 * test months matches lifetime total except for undated closes or closes outside the test window
 * (those still count in lifetime “other” but have no phase month).
 *
 * Monthly Data – Pilot Regions keeps a separate, narrower KPI (pilot roster + product line-item
 * attach via `getPilotWinsWithTargetBreakdown`); that number can differ from this footer.
 *
 * With no `opportunityFlags`: null (caller uses member funnel totals).
 */
export function getPilotPhaseWinsCount(
  team: Team,
  _phaseLabel: string,
  monthIndex: number,
  year: number,
  month: number,
  opsRows: Record<string, unknown>[],
  _assignments: ProjectTeamAssignment[],
  _salesTeams: SalesTeam[],
  phaseCalcByTeam?: Record<string, Record<number, PhaseCalcConfig>>,
): number | null {
  const cfg = resolvePhaseCalcConfig(team, monthIndex, phaseCalcByTeam ?? {});
  const flags = cfg.opportunityFlags;
  const targets = cfg.lineItemTargets;
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;

  if (flags.length === 0) return null;

  const flaggedOps = filterByProspectingNotes(filterByOpportunityFlag(opsRows, flags), cfg.prospectingNotes);
  let n = 0;
  for (const row of flaggedOps) {
    if (!isWinStage(row.opportunity_stage as string | null, row.opportunity_type as string | null)) continue;
    if (targets.length > 0 && !lineItemsMatchTargetNames(row.line_items as string | null, targets)) continue;
    const mk = monthKeyFromDateStr(effectiveWinDate(row));
    if (mk !== monthKey) continue;
    n++;
  }
  return n;
}

export function countPilotAllWinsInMonth(
  opsRows: Record<string, unknown>[],
  pilotRepNames: Set<string>,
  monthKey: string,
): number {
  let n = 0;
  for (const row of filterPilotOpsRows(opsRows, pilotRepNames)) {
    const stage = row.opportunity_stage as string | null | undefined;
    const opType = row.opportunity_type as string | null | undefined;
    if (!isWinStage(stage, opType)) continue;
    const mk = monthKeyFromDateStr(effectiveWinDate(row));
    if (mk === monthKey) n++;
  }
  return n;
}

export function getPilotAttachRate(
  opsRows: Record<string, unknown>[],
  pilotRepNames: Set<string>,
  targets: string[],
  monthKey: string,
  options?: {
    /** When attachDenomMode is all_wins, count denominator wins from this pool (unfiltered ops). */
    denomOpsRows?: Record<string, unknown>[];
    attachDenomMode?: AttachRateDenomMode;
  },
): number | null {
  const withTarget = getPilotWinRowsInMonth(opsRows, pilotRepNames, targets, monthKey, {
    withTargetOnly: true,
  }).length;
  const denomPool =
    options?.attachDenomMode === "all_wins" && options.denomOpsRows != null ? options.denomOpsRows : opsRows;
  const allWins = countPilotAllWinsInMonth(denomPool, pilotRepNames, monthKey);
  if (allWins === 0) return null;
  return withTarget / allWins;
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function getPilotAvgMrr(
  opsRows: Record<string, unknown>[],
  pilotRepNames: Set<string>,
  targets: string[],
  monthKey: string,
  withProduct: boolean,
): number | null {
  const wins = getPilotWinRowsInMonth(opsRows, pilotRepNames, targets, monthKey);
  const mrrs: number[] = [];
  for (const row of wins) {
    const hasT = lineItemsMatchTargetNames(row.line_items as string | null, targets);
    if (withProduct && !hasT) continue;
    if (!withProduct && hasT) continue;
    const raw = row.opportunity_software_mrr as string | number | null | undefined;
    const v = raw === null || raw === undefined ? NaN : typeof raw === "number" ? raw : parseFloat(String(raw).replace(/,/g, ""));
    if (!Number.isFinite(v)) continue;
    mrrs.push(v);
  }
  return avg(mrrs);
}

export function getPilotAvgPrice(
  opsRows: Record<string, unknown>[],
  pilotRepNames: Set<string>,
  targets: string[],
  monthKey: string,
): number | null {
  const wins = getPilotWinRowsInMonth(opsRows, pilotRepNames, targets, monthKey, { withTargetOnly: true });
  const prices: number[] = [];
  for (const row of wins) {
    const price = parseLineItemTotal(row.line_items as string | null, targets);
    if (price > 0) prices.push(price);
  }
  return avg(prices);
}

/** Average target line-item price across all pilot wins (any month). */
export function getPilotAvgPriceAllTime(
  opsRows: Record<string, unknown>[],
  pilotRepNames: Set<string>,
  targets: string[],
): number | null {
  const prices: number[] = [];
  for (const row of filterPilotOpsRows(opsRows, pilotRepNames)) {
    const stage = row.opportunity_stage as string | null | undefined;
    const opType = row.opportunity_type as string | null | undefined;
    if (!isWinStage(stage, opType)) continue;
    const price = parseLineItemTotal(row.line_items as string | null, targets);
    if (price > 0) prices.push(price);
  }
  return avg(prices);
}

export function countPilotLossesInMonth(
  opsRows: Record<string, unknown>[],
  pilotRepNames: Set<string>,
  targets: string[],
  monthKey: string,
): number {
  let n = 0;
  for (const row of filterPilotOpsRows(opsRows, pilotRepNames)) {
    const stage = String(row.opportunity_stage ?? "");
    if (!stage.toLowerCase().includes("lost")) continue;
    if (!lineItemsMatchTargetNames(row.line_items as string | null, targets)) continue;
    const mk = monthKeyFromDateStr((row.op_date as string | null) ?? (row.op_created_date as string | null));
    if (mk === monthKey) n++;
  }
  return n;
}

export function pilotRepBreakdownLossesInMonth(
  opsRows: Record<string, unknown>[],
  pilotRepNames: Set<string>,
  targets: string[],
  monthKey: string,
): Array<{ repKey: string; displayName: string; losses: number }> {
  const byRep = new Map<string, { displayName: string; losses: number }>();
  for (const rk of pilotRepNames) {
    byRep.set(rk, { displayName: rk, losses: 0 });
  }
  for (const row of filterPilotOpsRows(opsRows, pilotRepNames)) {
    const stage = String(row.opportunity_stage ?? "");
    if (!stage.toLowerCase().includes("lost")) continue;
    if (!lineItemsMatchTargetNames(row.line_items as string | null, targets)) continue;
    const mk = monthKeyFromDateStr((row.op_date as string | null) ?? (row.op_created_date as string | null));
    if (mk !== monthKey) continue;
    const raw = (row.rep_name as string) ?? "";
    const rk = repKey(raw);
    if (!byRep.has(rk)) continue;
    const cur = byRep.get(rk)!;
    cur.displayName = raw.trim() || rk;
    cur.losses += 1;
  }
  return Array.from(byRep.entries())
    .map(([repKey, v]) => ({ repKey, displayName: v.displayName, losses: v.losses }))
    .sort((a, b) => b.losses - a.losses || a.displayName.localeCompare(b.displayName));
}

export type PilotKpiSnapshot = {
  avgMrrWithout: number | null;
  avgMrrWith: number | null;
  avgPrice: number | null;
  attachRate: number | null;
};

export function getPilotKpiSnapshot(
  opsRows: Record<string, unknown>[],
  pilotRepNames: Set<string>,
  targets: string[],
  monthKey: string,
  opsRowsWithout?: Record<string, unknown>[],
  attachOpts?: { denomOpsRows?: Record<string, unknown>[]; attachDenomMode?: AttachRateDenomMode },
): PilotKpiSnapshot {
  return {
    avgMrrWithout: getPilotAvgMrr(opsRowsWithout ?? opsRows, pilotRepNames, targets, monthKey, false),
    avgMrrWith: getPilotAvgMrr(opsRows, pilotRepNames, targets, monthKey, true),
    avgPrice: getPilotAvgPrice(opsRows, pilotRepNames, targets, monthKey),
    attachRate: getPilotAttachRate(opsRows, pilotRepNames, targets, monthKey, {
      denomOpsRows: attachOpts?.denomOpsRows,
      attachDenomMode: attachOpts?.attachDenomMode,
    }),
  };
}

export type WowTrend = "up" | "down" | "flat";

export function compareWow(a: number | null, b: number | null): WowTrend {
  if (a === null || b === null) return "flat";
  if (a > b) return "up";
  if (a < b) return "down";
  return "flat";
}

/** Prior calendar month key YYYY-MM */
export function previousMonthKey(monthKey: string): string | null {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return null;
  const d = new Date(y, m - 2, 1);
  return toMonthKey(d);
}

export type PilotMetricAccounts = {
  avgMrrWithout: string[];
  avgMrrWith: string[];
  avgPrice: string[];
  attachWithTarget: string[];
  attachAllWins: string[];
};

export function getPilotAccountNamesForTeam(
  opsRows: Record<string, unknown>[],
  teamRepKeys: Set<string>,
  targets: string[],
  monthKey: string,
  attachOpts?: { denomOpsRows?: Record<string, unknown>[]; attachDenomMode?: AttachRateDenomMode },
): PilotMetricAccounts {
  const wins = getPilotWinRowsInMonth(opsRows, teamRepKeys, targets, monthKey);
  const avgMrrWithout: string[] = [];
  const avgMrrWith: string[] = [];
  const avgPrice: string[] = [];
  const attachWithTarget: string[] = [];

  for (const row of wins) {
    const name = (row.opportunity_name as string | null)?.trim() || "(unnamed)";
    const hasT = lineItemsMatchTargetNames(row.line_items as string | null, targets);
    if (!hasT) avgMrrWithout.push(name);
    else {
      avgMrrWith.push(name);
      attachWithTarget.push(name);
      if (parseLineItemTotal(row.line_items as string | null, targets) > 0) {
        avgPrice.push(name);
      }
    }
  }

  const denomPool =
    attachOpts?.attachDenomMode === "all_wins" && attachOpts.denomOpsRows
      ? attachOpts.denomOpsRows
      : opsRows;
  const attachAllWins: string[] = [];
  for (const row of filterPilotOpsRows(denomPool, teamRepKeys)) {
    const stage = row.opportunity_stage as string | null | undefined;
    const opType = row.opportunity_type as string | null | undefined;
    if (!isWinStage(stage, opType)) continue;
    const mk = monthKeyFromDateStr(effectiveWinDate(row));
    if (mk !== monthKey) continue;
    const n = (row.opportunity_name as string | null)?.trim() || "(unnamed)";
    attachAllWins.push(n);
  }

  const uniq = (a: string[]) => [...new Set(a)].sort();

  return {
    avgMrrWithout: uniq(avgMrrWithout),
    avgMrrWith: uniq(avgMrrWith),
    avgPrice: uniq(avgPrice),
    attachWithTarget: uniq(attachWithTarget),
    attachAllWins: uniq(attachAllWins),
  };
}

function winRowsInWeekForReps(
  opsRows: Record<string, unknown>[],
  pilotRepNames: Set<string>,
  targets: string[],
  weekKey: string,
  withTargetOnly?: boolean,
): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const row of filterPilotOpsRows(opsRows, pilotRepNames)) {
    const stage = row.opportunity_stage as string | null | undefined;
    const opType = row.opportunity_type as string | null | undefined;
    if (!isWinStage(stage, opType)) continue;
    const ed = effectiveWinDate(row);
    if (!ed) continue;
    if (dateToWeekKey(ed) !== weekKey) continue;
    const hasT = lineItemsMatchTargetNames(row.line_items as string | null, targets);
    if (withTargetOnly && !hasT) continue;
    rows.push(row);
  }
  return rows;
}

/** KPI snapshot for wins closed in ISO week `weekKey` (Monday). */
export function getPilotKpiSnapshotForWeek(
  opsRows: Record<string, unknown>[],
  pilotRepNames: Set<string>,
  targets: string[],
  weekKey: string,
  opsRowsWithout?: Record<string, unknown>[],
  attachOpts?: { denomOpsRows?: Record<string, unknown>[]; attachDenomMode?: AttachRateDenomMode },
): PilotKpiSnapshot {
  const denomPool =
    attachOpts?.attachDenomMode === "all_wins" && attachOpts.denomOpsRows
      ? attachOpts.denomOpsRows
      : (opsRowsWithout ?? opsRows);
  const allWins = winRowsInWeekForReps(denomPool, pilotRepNames, targets, weekKey, false);
  const withTarget = winRowsInWeekForReps(opsRows, pilotRepNames, targets, weekKey, true);

  const mrrWithout: number[] = [];
  const mrrWith: number[] = [];
  const prices: number[] = [];
  for (const row of allWins) {
    const hasT = lineItemsMatchTargetNames(row.line_items as string | null, targets);
    const raw = row.opportunity_software_mrr as string | number | null | undefined;
    const v =
      raw === null || raw === undefined ? NaN : typeof raw === "number" ? raw : parseFloat(String(raw).replace(/,/g, ""));
    if (!Number.isFinite(v)) continue;
    if (hasT) mrrWith.push(v);
    else mrrWithout.push(v);
  }
  for (const row of withTarget) {
    const price = parseLineItemTotal(row.line_items as string | null, targets);
    if (price > 0) prices.push(price);
  }

  const attachRate = allWins.length === 0 ? null : withTarget.length / allWins.length;

  return {
    avgMrrWithout: avg(mrrWithout),
    avgMrrWith: avg(mrrWith),
    avgPrice: avg(prices),
    attachRate,
  };
}

export function sumMetricForRepsInWeek(
  bundle: MetricsByWeekBundle,
  metric: keyof MetricsByWeekBundle,
  repKeys: Iterable<string>,
  weekKey: string,
): number {
  let s = 0;
  for (const rk of repKeys) {
    s += bundle[metric].get(rk)?.get(weekKey) ?? 0;
  }
  return s;
}

export function tamSumForReps(tamRows: Record<string, unknown>[], repKeys: Set<string>): number {
  let s = 0;
  for (const row of tamRows) {
    const k = repKey(row.rep_name as string);
    if (!repKeys.has(k)) continue;
    const t = row.tam as number | string | null | undefined;
    const n = typeof t === "number" ? t : parseFloat(String(t ?? "0").replace(/,/g, ""));
    if (Number.isFinite(n)) s += n;
  }
  return s;
}
