import { dateToMonthKey, dateToWeekKey } from "@/lib/metrics-helpers";

export type MetricEditKind = "exclusion" | "inclusion";

/** Stored in team_metric_exclusions + used at aggregation time */
export interface MetricExclusionRow {
  id: string;
  teamId: string;
  metric: string;
  field: string;
  value: string;
  monthKey: string;
  kind: MetricEditKind;
  /** null = all reps on team; set = only this member */
  memberId: string | null;
}

export type MetricExclusionMetric = "activity" | "calls" | "connects" | "ops" | "demos" | "wins" | "feedback";
export type IndexedRowsByRepAndWeek = Map<string, Map<string, Record<string, unknown>[]>>;

const METRIC_DATE_FIELD: Record<MetricExclusionMetric, string> = {
  activity: "activity_date",
  calls: "call_date",
  connects: "connect_date",
  ops: "op_created_date",
  demos: "demo_date",
  wins: "_effective_date",
  feedback: "feedback_date",
};

function normalizeKind(k: string | null | undefined): MetricEditKind {
  return k === "inclusion" ? "inclusion" : "exclusion";
}

/** Pilot / team-aggregate paths: member-scoped rules do not apply (no member context). */
export function teamWideMetricRulesOnly(exclusions: MetricExclusionRow[]): MetricExclusionRow[] {
  return exclusions.filter((e) => !e.memberId);
}

/** Case-insensitive substring match (same semantics as manual exclusion rules). */
export function matchesExclusion(cellValue: string | null | undefined, pattern: string): boolean {
  if (cellValue == null || pattern === "") return false;
  const a = String(cellValue).toLowerCase().trim();
  const b = pattern.toLowerCase().trim();
  return a.includes(b);
}

/** True if this row should be excluded from counting for the given funnel metric. */
export function rowExcludedForTeamMetric(
  row: Record<string, unknown>,
  exclusions: MetricExclusionRow[],
  metric: MetricExclusionMetric,
  currentMemberId?: string | null,
): boolean {
  const dateField = METRIC_DATE_FIELD[metric];
  const rowDate = row[dateField] as string | null | undefined;
  const rowMonth = rowDate ? dateToMonthKey(rowDate) : "";
  for (const ex of exclusions) {
    if (normalizeKind(ex.kind) !== "exclusion") continue;
    if (ex.memberId != null && ex.memberId !== currentMemberId) continue;
    if (ex.metric !== metric) continue;
    if (ex.monthKey && rowMonth !== ex.monthKey) continue;
    const fieldVal = row[ex.field] as string | null | undefined;
    if (matchesExclusion(fieldVal, ex.value)) return true;
  }
  return false;
}

/** True if some data row in month matches this inclusion rule (same rep, field/value semantics). */
export function inclusionRuleMatchesAnyRow(
  rows: Record<string, unknown>[],
  repKey: string,
  monthKey: string,
  metric: MetricExclusionMetric,
  rule: MetricExclusionRow,
  currentMemberId?: string | null,
): boolean {
  if (normalizeKind(rule.kind) !== "inclusion" || rule.metric !== metric || !rule.monthKey || rule.monthKey !== monthKey) {
    return false;
  }
  if (rule.memberId != null && rule.memberId !== currentMemberId) return false;
  const dateField = METRIC_DATE_FIELD[metric];
  for (const row of rows) {
    if (String(row.rep_name ?? "").toLowerCase().trim() !== repKey) continue;
    const d = row[dateField] as string | null | undefined;
    if (!d) continue;
    if (dateToMonthKey(d) !== monthKey) continue;
    const fieldVal = row[rule.field] as string | null | undefined;
    if (matchesExclusion(fieldVal, rule.value)) return true;
  }
  return false;
}

/**
 * Extra count from manual inclusions for one rep/month/metric: +1 per inclusion rule with no matching row.
 */
export function getInclusionAdjustments(
  rows: Record<string, unknown>[],
  repKey: string,
  monthKey: string,
  rules: MetricExclusionRow[],
  metric: MetricExclusionMetric,
  currentMemberId: string | null,
): { count: number; names: string[] } {
  let count = 0;
  const nameSet = new Set<string>();
  for (const rule of rules) {
    if (normalizeKind(rule.kind) !== "inclusion" || rule.metric !== metric || rule.monthKey !== monthKey) continue;
    if (rule.memberId != null && rule.memberId !== currentMemberId) continue;
    nameSet.add(rule.value);
    if (!inclusionRuleMatchesAnyRow(rows, repKey, monthKey, metric, rule, currentMemberId)) count++;
  }
  const sortFn = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });
  return { count, names: Array.from(nameSet).sort(sortFn) };
}

/** Drop rows that match any manual exclusion for this metric (pilot KPI / raw pipelines). Team-wide rules only. */
export function filterRowsForTeamMetric(
  rows: Record<string, unknown>[],
  exclusions: MetricExclusionRow[],
  metric: MetricExclusionMetric,
): Record<string, unknown>[] {
  const ex = teamWideMetricRulesOnly(exclusions);
  if (!ex.length) return rows;
  return rows.filter((r) => !rowExcludedForTeamMetric(r, ex, metric));
}

export function countMetricRowsInWeek(
  rows: Record<string, unknown>[],
  repKey: string,
  weekKey: string,
  metric: MetricExclusionMetric,
  exclusions: MetricExclusionRow[],
): number {
  const ex = teamWideMetricRulesOnly(exclusions);
  const dateField = METRIC_DATE_FIELD[metric];
  let n = 0;
  for (const row of rows) {
    const rk = String(row.rep_name ?? "").toLowerCase().trim();
    if (rk !== repKey) continue;
    const d = row[dateField] as string | null;
    if (!d) continue;
    if (dateToWeekKey(d) !== weekKey) continue;
    if (rowExcludedForTeamMetric(row, ex, metric)) continue;
    n++;
  }
  return n;
}

export function countMetricRowsInMonth(
  rows: Record<string, unknown>[],
  repKey: string,
  monthKey: string,
  metric: MetricExclusionMetric,
  exclusions: MetricExclusionRow[],
): number {
  const ex = teamWideMetricRulesOnly(exclusions);
  const dateField = METRIC_DATE_FIELD[metric];
  let n = 0;
  for (const row of rows) {
    const rk = String(row.rep_name ?? "").toLowerCase().trim();
    if (rk !== repKey) continue;
    const d = row[dateField] as string | null;
    if (!d) continue;
    if (dateToMonthKey(d) !== monthKey) continue;
    if (rowExcludedForTeamMetric(row, ex, metric)) continue;
    n++;
  }
  return n;
}

export function sumMetricForRepsInWeekWithExclusions(
  metric: MetricExclusionMetric,
  repKeys: Iterable<string>,
  weekKey: string,
  rows: Record<string, unknown>[],
  exclusions: MetricExclusionRow[],
): number {
  const ex = teamWideMetricRulesOnly(exclusions);
  let s = 0;
  for (const rk of repKeys) {
    s += countMetricRowsInWeek(rows, rk, weekKey, metric, ex);
  }
  return s;
}

export function indexRowsByRepAndWeek(
  rows: Record<string, unknown>[],
  metric: MetricExclusionMetric,
): IndexedRowsByRepAndWeek {
  const dateField = METRIC_DATE_FIELD[metric];
  const out: IndexedRowsByRepAndWeek = new Map();
  for (const row of rows) {
    const repKey = String(row.rep_name ?? "").toLowerCase().trim();
    if (!repKey) continue;
    const dateVal = row[dateField] as string | null;
    if (!dateVal) continue;
    const weekKey = dateToWeekKey(dateVal);
    if (!out.has(repKey)) out.set(repKey, new Map());
    const byWeek = out.get(repKey)!;
    if (!byWeek.has(weekKey)) byWeek.set(weekKey, []);
    byWeek.get(weekKey)!.push(row);
  }
  return out;
}

export function sumMetricForRepsInWeekWithExclusionsIndexed(
  metric: MetricExclusionMetric,
  repKeys: Iterable<string>,
  weekKey: string,
  indexedRows: IndexedRowsByRepAndWeek,
  exclusions: MetricExclusionRow[],
): number {
  const ex = teamWideMetricRulesOnly(exclusions);
  let total = 0;
  for (const repKey of repKeys) {
    const bucket = indexedRows.get(repKey)?.get(weekKey);
    if (!bucket || bucket.length === 0) continue;
    for (const row of bucket) {
      if (rowExcludedForTeamMetric(row, ex, metric)) continue;
      total++;
    }
  }
  return total;
}

/** Parse DB rows into MetricExclusionRow */
export function parseMetricExclusionsFromDb(
  rows: {
    id: string;
    team_id: string;
    metric: string;
    field: string;
    value: string;
    month_key?: string | null;
    kind?: string | null;
    member_id?: string | null;
  }[],
): MetricExclusionRow[] {
  return rows.map((r) => ({
    id: r.id,
    teamId: r.team_id,
    metric: r.metric,
    field: r.field,
    value: r.value,
    monthKey: r.month_key ?? "",
    kind: normalizeKind(r.kind),
    memberId: r.member_id ?? null,
  }));
}

export function groupExclusionsByTeam(exclusions: MetricExclusionRow[]): Record<string, MetricExclusionRow[]> {
  const out: Record<string, MetricExclusionRow[]> = {};
  for (const ex of exclusions) {
    if (!out[ex.teamId]) out[ex.teamId] = [];
    out[ex.teamId].push(ex);
  }
  return out;
}

/** Per-month sorted name lists for hover tooltips (ops / demos / wins). */
export function buildMetricNamesByMonthForRep(
  rows: Record<string, unknown>[],
  repKey: string,
  dateField: string,
  nameField: string,
  metric: MetricExclusionMetric,
  exclusions: MetricExclusionRow[],
  currentMemberId: string | null,
): Record<string, string[]> {
  const acc = new Map<string, Set<string>>();
  for (const row of rows) {
    if (String(row.rep_name ?? "").toLowerCase().trim() !== repKey) continue;
    if (rowExcludedForTeamMetric(row, exclusions, metric, currentMemberId)) continue;
    const dateVal = row[dateField] as string | null;
    const nameVal = row[nameField] as string | null;
    if (!dateVal || !nameVal) continue;
    const mk = dateToMonthKey(dateVal);
    if (!acc.has(mk)) acc.set(mk, new Set());
    acc.get(mk)!.add(nameVal);
  }
  for (const rule of exclusions) {
    if (normalizeKind(rule.kind) !== "inclusion" || rule.metric !== metric || !rule.monthKey) continue;
    if (rule.memberId != null && rule.memberId !== currentMemberId) continue;
    const mk = rule.monthKey;
    if (!acc.has(mk)) acc.set(mk, new Set());
    acc.get(mk)!.add(rule.value);
  }
  const out: Record<string, string[]> = {};
  const sortFn = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });
  for (const [mk, set] of acc) {
    out[mk] = Array.from(set).sort(sortFn);
  }
  return out;
}

export interface WinTypeCountsSlice {
  nb: number;
  growth: number;
}

/** NB vs Growth win counts/names per month for one rep, honoring exclusions; inclusions add to NB when unmatched. */
export function buildWinTypesByMonthForRep(
  winsRows: Record<string, unknown>[],
  repKey: string,
  exclusions: MetricExclusionRow[],
  currentMemberId: string | null,
): {
  counts: Record<string, WinTypeCountsSlice>;
  names: Record<string, { nb: string[]; growth: string[]; noAccountRecord: string[] }>;
} {
  const winTypesByMonth = new Map<string, WinTypeCountsSlice>();
  const winTypeNamesByMonth = new Map<string, { nb: Set<string>; growth: Set<string>; noAccountRecord: Set<string> }>();
  for (const row of winsRows) {
    if (String(row.rep_name ?? "").toLowerCase().trim() !== repKey) continue;
    if (rowExcludedForTeamMetric(row, exclusions, "wins", currentMemberId)) continue;
    const dateVal = row._effective_date as string | null;
    if (!dateVal) continue;
    const mk = dateToMonthKey(dateVal);
    const accountName = (row.account_name as string | null) || null;
    const opportunityName = (row.opportunity_name as string | null) || null;
    const opType = (row.opportunity_type as string | null) ?? "";
    const isGrowth = !opType || opType === "Existing Business (Upsell)";

    if (!winTypesByMonth.has(mk)) winTypesByMonth.set(mk, { nb: 0, growth: 0 });
    const counts = winTypesByMonth.get(mk)!;
    if (isGrowth) counts.growth++;
    else counts.nb++;

    const hasAccountRecord = !!accountName?.trim();
    const fallbackName = opportunityName?.trim() ?? "";
    if (hasAccountRecord) {
      if (!winTypeNamesByMonth.has(mk)) winTypeNamesByMonth.set(mk, { nb: new Set(), growth: new Set(), noAccountRecord: new Set() });
      const sets = winTypeNamesByMonth.get(mk)!;
      if (isGrowth) sets.growth.add(accountName!.trim());
      else sets.nb.add(accountName!.trim());
    } else if (fallbackName) {
      if (!winTypeNamesByMonth.has(mk)) winTypeNamesByMonth.set(mk, { nb: new Set(), growth: new Set(), noAccountRecord: new Set() });
      const sets = winTypeNamesByMonth.get(mk)!;
      sets.noAccountRecord.add(fallbackName);
    }
  }
  for (const rule of exclusions) {
    if (normalizeKind(rule.kind) !== "inclusion" || rule.metric !== "wins" || !rule.monthKey) continue;
    if (rule.memberId != null && rule.memberId !== currentMemberId) continue;
    const mk = rule.monthKey;
    if (inclusionRuleMatchesAnyRow(winsRows, repKey, mk, "wins", rule, currentMemberId)) continue;
    if (!winTypesByMonth.has(mk)) winTypesByMonth.set(mk, { nb: 0, growth: 0 });
    winTypesByMonth.get(mk)!.nb++;
    if (!winTypeNamesByMonth.has(mk)) winTypeNamesByMonth.set(mk, { nb: new Set(), growth: new Set(), noAccountRecord: new Set() });
    winTypeNamesByMonth.get(mk)!.nb.add(rule.value);
  }
  const countsOut: Record<string, WinTypeCountsSlice> = {};
  for (const [mk, c] of winTypesByMonth) countsOut[mk] = { ...c };
  const sortFn = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });
  const namesOut: Record<string, { nb: string[]; growth: string[]; noAccountRecord: string[] }> = {};
  for (const [mk, sets] of winTypeNamesByMonth) {
    namesOut[mk] = {
      nb: Array.from(sets.nb).sort(sortFn),
      growth: Array.from(sets.growth).sort(sortFn),
      noAccountRecord: Array.from(sets.noAccountRecord).sort(sortFn),
    };
  }
  return { counts: countsOut, names: namesOut };
}

/** NB vs Growth op counts/names per month for one rep, honoring exclusions; inclusions add to NB when unmatched. */
export function buildOpsTypesByMonthForRep(
  opsRows: Record<string, unknown>[],
  repKey: string,
  exclusions: MetricExclusionRow[],
  currentMemberId: string | null,
): {
  counts: Record<string, WinTypeCountsSlice>;
  names: Record<string, { nb: string[]; growth: string[]; noAccountRecord: string[] }>;
} {
  const opsTypesByMonth = new Map<string, WinTypeCountsSlice>();
  const opsTypeNamesByMonth = new Map<string, { nb: Set<string>; growth: Set<string>; noAccountRecord: Set<string> }>();
  for (const row of opsRows) {
    if (String(row.rep_name ?? "").toLowerCase().trim() !== repKey) continue;
    if (rowExcludedForTeamMetric(row, exclusions, "ops", currentMemberId)) continue;
    const dateVal = row.op_created_date as string | null;
    if (!dateVal) continue;
    const mk = dateToMonthKey(dateVal);
    const opName = row.opportunity_name as string | null;
    const opType = (row.opportunity_type as string | null) ?? "";
    const isGrowth = !opType || opType === "Existing Business (Upsell)";

    if (!opsTypesByMonth.has(mk)) opsTypesByMonth.set(mk, { nb: 0, growth: 0 });
    const counts = opsTypesByMonth.get(mk)!;
    if (isGrowth) counts.growth++;
    else counts.nb++;

    if (opName) {
      if (!opsTypeNamesByMonth.has(mk)) opsTypeNamesByMonth.set(mk, { nb: new Set(), growth: new Set(), noAccountRecord: new Set() });
      const sets = opsTypeNamesByMonth.get(mk)!;
      if (isGrowth) sets.growth.add(opName);
      else sets.nb.add(opName);
    }
  }
  for (const rule of exclusions) {
    if (normalizeKind(rule.kind) !== "inclusion" || rule.metric !== "ops" || !rule.monthKey) continue;
    if (rule.memberId != null && rule.memberId !== currentMemberId) continue;
    const mk = rule.monthKey;
    if (inclusionRuleMatchesAnyRow(opsRows, repKey, mk, "ops", rule, currentMemberId)) continue;
    if (!opsTypesByMonth.has(mk)) opsTypesByMonth.set(mk, { nb: 0, growth: 0 });
    opsTypesByMonth.get(mk)!.nb++;
    if (!opsTypeNamesByMonth.has(mk)) opsTypeNamesByMonth.set(mk, { nb: new Set(), growth: new Set(), noAccountRecord: new Set() });
    opsTypeNamesByMonth.get(mk)!.nb.add(rule.value);
  }
  const countsOut: Record<string, WinTypeCountsSlice> = {};
  for (const [mk, c] of opsTypesByMonth) countsOut[mk] = { ...c };
  const sortFn = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });
  const namesOut: Record<string, { nb: string[]; growth: string[]; noAccountRecord: string[] }> = {};
  for (const [mk, sets] of opsTypeNamesByMonth) {
    namesOut[mk] = {
      nb: Array.from(sets.nb).sort(sortFn),
      growth: Array.from(sets.growth).sort(sortFn),
      noAccountRecord: Array.from(sets.noAccountRecord).sort(sortFn),
    };
  }
  return { counts: countsOut, names: namesOut };
}
