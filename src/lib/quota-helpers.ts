import { GOAL_METRICS, type Team, type TeamMember, type GoalMetric, type AcceleratorRule } from "@/contexts/TeamsContext";

/**
 * Sum a single metric across only the weeks whose Monday falls in the
 * given calendar month (week_key format: "YYYY-MM-DD").
 * When referenceDate is omitted the current month is used.
 */
export function getMemberMetricTotal(m: TeamMember, metric: GoalMetric, referenceDate?: Date): number {
  const now = referenceDate ?? new Date();
  const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-`;
  return Object.entries(m.funnelByWeek || {}).reduce(
    (s, [weekKey, f]) => (weekKey.startsWith(prefix) ? s + ((f as any)[metric] || 0) : s),
    0
  );
}

export function getTeamMetricTotal(team: Team, metric: GoalMetric, referenceDate?: Date): number {
  return team.members
    .filter((m) => m.isActive)
    .reduce((sum, m) => sum + getMemberMetricTotal(m, metric, referenceDate), 0);
}

/**
 * Returns the "current" value for a metric, respecting goal scope.
 * Team-scoped: sum of all active members. Individual-scoped: that member only.
 */
export function getScopedMetricTotal(team: Team, member: TeamMember, metric: GoalMetric, referenceDate?: Date): number {
  const scope = team.goalScopeConfig?.[metric] ?? 'individual';
  return scope === 'team'
    ? getTeamMetricTotal(team, metric, referenceDate)
    : getMemberMetricTotal(member, metric, referenceDate);
}

export function getEffectiveGoal(team: Team, member: TeamMember, metric: GoalMetric): number {
  const scope = team.goalScopeConfig?.[metric] ?? 'individual';

  if (scope === 'team') {
    if (member.level && team.teamGoalsByLevel?.[metric]?.[member.level] != null) {
      return team.teamGoalsByLevel[metric][member.level]!;
    }
    return team.teamGoals[metric] || 0;
  }

  if (member.level && team.teamGoalsByLevel?.[metric]?.[member.level] != null) {
    const levelGoal = team.teamGoalsByLevel[metric][member.level]!;
    if (team.goalsParity) {
      const sameLevel = team.members.filter((mm) => mm.isActive && mm.level === member.level).length;
      return sameLevel > 0 ? Math.round(levelGoal / sameLevel) : 0;
    }
    return levelGoal;
  }
  if (team.goalsParity) {
    const activeCount = team.members.filter((mm) => mm.isActive).length;
    return activeCount > 0 ? Math.round((team.teamGoals[metric] || 0) / activeCount) : 0;
  }
  return member.goals[metric];
}

/**
 * Count weekday (Mon-Fri) days remaining from tomorrow through the effective
 * month-end. If the team's endDate falls within the current calendar month,
 * that date is used instead of month-end.
 * For past months (referenceDate before current month) returns 0.
 */
export function getBusinessDaysRemaining(teamEndDate: string | null, referenceDate?: Date): number {
  const realToday = new Date();
  realToday.setHours(0, 0, 0, 0);

  if (referenceDate) {
    const refEnd = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
    refEnd.setHours(0, 0, 0, 0);
    if (refEnd < realToday) return 0;
  }

  const today = new Date(realToday);
  const year = today.getFullYear();
  const month = today.getMonth();
  let end = new Date(year, month + 1, 0);

  if (teamEndDate) {
    const te = new Date(teamEndDate + "T00:00:00");
    if (te.getFullYear() === year && te.getMonth() === month && te < end) {
      end = te;
    }
  }

  let count = 0;
  const cursor = new Date(today);
  cursor.setDate(cursor.getDate() + 1);
  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

function evaluateCondition(rule: AcceleratorRule, current: number): boolean {
  switch (rule.conditionOperator) {
    case '>':
      return current > rule.conditionValue1;
    case '<':
      return current < rule.conditionValue1;
    case 'between':
      return current >= rule.conditionValue1 && current <= (rule.conditionValue2 ?? rule.conditionValue1);
    default:
      return false;
  }
}

function applyAction(rule: AcceleratorRule, quota: number): number {
  const v = rule.actionValue;
  if (rule.actionUnit === '%') {
    switch (rule.actionOperator) {
      case '+': return quota + v;
      case '-': return quota - v;
      case '*': return quota * (v / 100);
    }
  } else {
    switch (rule.actionOperator) {
      case '+': return quota + v;
      case '-': return quota - v;
      case '*': return quota * v;
    }
  }
  return quota;
}

/**
 * Compute quota %: average (current/goal) across enabled metrics,
 * then apply any active accelerator rules.
 */
export function computeQuota(team: Team, member: TeamMember, referenceDate?: Date): number {
  const enabledMetrics = GOAL_METRICS.filter((m) => team.enabledGoals[m]);
  if (enabledMetrics.length === 0) return 0;

  const ratios = enabledMetrics.map((metric) => {
    const goal = getEffectiveGoal(team, member, metric);
    const current = getScopedMetricTotal(team, member, metric, referenceDate);
    return goal > 0 ? (current / goal) * 100 : 0;
  });

  let quota = ratios.reduce((sum, r) => sum + r, 0) / ratios.length;

  for (const metric of GOAL_METRICS) {
    const rules = team.acceleratorConfig[metric];
    if (!rules || rules.length === 0) continue;
    const current = getScopedMetricTotal(team, member, metric, referenceDate);
    for (const rule of rules) {
      if (!rule.enabled) continue;
      if (evaluateCondition(rule, current)) {
        quota = applyAction(rule, quota);
      }
    }
  }

  return Math.min(quota, 200);
}

/**
 * Count how many accelerator rules were triggered for a member across all metrics.
 */
export function countTriggeredAccelerators(team: Team, member: TeamMember, referenceDate?: Date): number {
  let count = 0;
  for (const metric of GOAL_METRICS) {
    const rules = team.acceleratorConfig[metric];
    if (!rules || rules.length === 0) continue;
    const current = getScopedMetricTotal(team, member, metric, referenceDate);
    for (const rule of rules) {
      if (!rule.enabled) continue;
      if (evaluateCondition(rule, current)) count++;
    }
  }
  return count;
}

export interface QuotaMetricRatio {
  metric: GoalMetric;
  current: number;
  goal: number;
  pct: number;
}

export interface QuotaAcceleratorStep {
  metric: GoalMetric;
  rule: AcceleratorRule;
  quotaBefore: number;
  quotaAfter: number;
}

export interface QuotaBreakdown {
  metricRatios: QuotaMetricRatio[];
  baseQuota: number;
  acceleratorSteps: QuotaAcceleratorStep[];
  finalQuota: number;
}

export function computeQuotaBreakdown(team: Team, member: TeamMember, referenceDate?: Date): QuotaBreakdown {
  const enabledMetrics = GOAL_METRICS.filter((m) => team.enabledGoals[m]);
  if (enabledMetrics.length === 0) {
    return { metricRatios: [], baseQuota: 0, acceleratorSteps: [], finalQuota: 0 };
  }

  const metricRatios: QuotaMetricRatio[] = enabledMetrics.map((metric) => {
    const goal = getEffectiveGoal(team, member, metric);
    const current = getScopedMetricTotal(team, member, metric, referenceDate);
    return { metric, current, goal, pct: goal > 0 ? (current / goal) * 100 : 0 };
  });

  const baseQuota = metricRatios.reduce((sum, r) => sum + r.pct, 0) / metricRatios.length;
  let quota = baseQuota;
  const acceleratorSteps: QuotaAcceleratorStep[] = [];

  for (const metric of GOAL_METRICS) {
    const rules = team.acceleratorConfig[metric];
    if (!rules || rules.length === 0) continue;
    const current = getScopedMetricTotal(team, member, metric, referenceDate);
    for (const rule of rules) {
      if (!rule.enabled) continue;
      if (evaluateCondition(rule, current)) {
        const before = quota;
        quota = applyAction(rule, quota);
        acceleratorSteps.push({ metric, rule, quotaBefore: before, quotaAfter: quota });
      }
    }
  }

  return { metricRatios, baseQuota, acceleratorSteps, finalQuota: Math.min(quota, 200) };
}

export interface TriggeredAccelerator {
  metric: GoalMetric;
  currentValue: number;
  rule: AcceleratorRule;
}

export function getTriggeredAcceleratorDetails(team: Team, member: TeamMember, referenceDate?: Date): TriggeredAccelerator[] {
  const results: TriggeredAccelerator[] = [];
  for (const metric of GOAL_METRICS) {
    const rules = team.acceleratorConfig[metric];
    if (!rules || rules.length === 0) continue;
    const current = getScopedMetricTotal(team, member, metric, referenceDate);
    for (const rule of rules) {
      if (!rule.enabled) continue;
      if (evaluateCondition(rule, current)) {
        results.push({ metric, currentValue: current, rule });
      }
    }
  }
  return results;
}
