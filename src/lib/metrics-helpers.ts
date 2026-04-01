/**
 * Determines whether a row qualifies as a "win" based on opportunity_stage
 * and opportunity_type.
 *
 * Rules:
 *  - Both null  → win (legacy/untyped data)
 *  - "Existing Business (Upsell)" → stage 14+
 *  - Everything else              → stage 16+
 *
 * Stage values are formatted as "N. Label" (e.g. "16. Closed - Onboarded").
 */
export function isWinStage(
  stage: string | null | undefined,
  opportunityType: string | null | undefined,
): boolean {
  if (!stage && !opportunityType) return true;
  if (!stage) return false;
  const num = parseInt(stage, 10);
  if (isNaN(num)) return false;
  const threshold = opportunityType === 'Existing Business (Upsell)' ? 14 : 16;
  return num >= threshold;
}

/**
 * Permissive win check for superhex rows which lack opportunity_type.
 * If `isWon` is explicitly true, the row is a win regardless of stage.
 * Otherwise: null stage → win (benefit of the doubt). Numbered stage →
 * 14+ (most permissive threshold). Non-numeric stage → not a win.
 */
export function isSuperhexWinStage(opStage: string | null | undefined, isWon?: boolean): boolean {
  if (isWon) return true;
  if (!opStage) return true;
  const num = parseInt(opStage, 10);
  if (isNaN(num)) return false;
  return num >= 14;
}

/** Monday-based week key; must match funnel aggregation in TeamsContext.loadMetrics */
export function dateToWeekKey(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function dateToMonthKey(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Mirrors Hex cell [36] filters on all_gtmx_activity (calls). */
export function isDerivedCallActivityRow(row: Record<string, unknown>): boolean {
  const activityType = String(row.activity_type ?? "");
  const subject = String(row.subject ?? "");
  return (
    /call/i.test(activityType) &&
    !/email|text/i.test(activityType) &&
    !/other|chorus/i.test(subject)
  );
}

/** Mirrors Hex cell [37] filters on all_gtmx_activity (connects). */
export function isDerivedConnectActivityRow(row: Record<string, unknown>): boolean {
  const outcome = String(row.activity_outcome ?? "");
  return /connect/i.test(outcome) && !/gatekeeper/i.test(outcome);
}

/** Derive metrics_calls-shaped rows from metrics_activity (call_date = activity_date). */
export function deriveCallRowsFromActivity(actRows: Record<string, unknown>[]): Record<string, unknown>[] {
  return actRows.filter(isDerivedCallActivityRow).map((r) => ({
    ...r,
    call_date: r.activity_date,
    call_type: r.activity_type,
    call_outcome: r.activity_outcome,
  }));
}

/** Derive metrics_connects-shaped rows (connect_date = activity_date). */
export function deriveConnectRowsFromActivity(actRows: Record<string, unknown>[]): Record<string, unknown>[] {
  return actRows.filter(isDerivedConnectActivityRow).map((r) => ({
    ...r,
    connect_date: r.activity_date,
    connect_type: r.activity_type,
    connect_outcome: r.activity_outcome,
  }));
}
