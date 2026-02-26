import { GOAL_METRICS, type Team, type TeamMember, type GoalMetric, type AcceleratorRule } from "@/contexts/TeamsContext";

export function getMemberMetricTotal(m: TeamMember, metric: GoalMetric): number {
  return Object.values(m.funnelByWeek || {}).reduce((s, f) => s + ((f as any)[metric] || 0), 0);
}

export function getEffectiveGoal(team: Team, member: TeamMember, metric: GoalMetric): number {
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
 */
export function getBusinessDaysRemaining(teamEndDate: string | null): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const year = today.getFullYear();
  const month = today.getMonth();
  let end = new Date(year, month + 1, 0); // last day of current month

  if (teamEndDate) {
    const te = new Date(teamEndDate + "T00:00:00");
    if (te.getFullYear() === year && te.getMonth() === month && te < end) {
      end = te;
    }
  }

  let count = 0;
  const cursor = new Date(today);
  cursor.setDate(cursor.getDate() + 1); // start from tomorrow
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
export function computeQuota(team: Team, member: TeamMember): number {
  const enabledMetrics = GOAL_METRICS.filter((m) => team.enabledGoals[m]);
  if (enabledMetrics.length === 0) return 0;

  const ratios = enabledMetrics.map((metric) => {
    const goal = getEffectiveGoal(team, member, metric);
    const current = getMemberMetricTotal(member, metric);
    return goal > 0 ? (current / goal) * 100 : 0;
  });

  let quota = ratios.reduce((sum, r) => sum + r, 0) / ratios.length;

  for (const metric of enabledMetrics) {
    const rules = team.acceleratorConfig[metric];
    if (!rules || rules.length === 0) continue;
    const current = getMemberMetricTotal(member, metric);
    for (const rule of rules) {
      if (!rule.enabled) continue;
      if (evaluateCondition(rule, current)) {
        quota = applyAction(rule, quota);
      }
    }
  }

  return quota;
}

/**
 * Count how many accelerator rules were triggered for a member across all metrics.
 */
export function countTriggeredAccelerators(team: Team, member: TeamMember): number {
  let count = 0;
  for (const metric of GOAL_METRICS) {
    const rules = team.acceleratorConfig[metric];
    if (!rules || rules.length === 0) continue;
    const current = getMemberMetricTotal(member, metric);
    for (const rule of rules) {
      if (!rule.enabled) continue;
      if (evaluateCondition(rule, current)) count++;
    }
  }
  return count;
}
