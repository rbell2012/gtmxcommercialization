import { GOAL_METRICS, type Team, type TeamMember, type GoalMetric, type AcceleratorRule, type BasicAcceleratorMetricConfig } from "@/contexts/TeamsContext";

/**
 * Sum a single metric for a calendar month using monthlyMetrics (which
 * attributes events to their actual calendar month rather than the
 * Monday-based week key). Falls back to week-derived totals if
 * monthlyMetrics is not populated. When referenceDate is omitted the
 * current month is used.
 */
export function getMemberMetricTotal(m: TeamMember, metric: GoalMetric, referenceDate?: Date): number {
  const now = referenceDate ?? new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  if (m.monthlyMetrics && m.monthlyMetrics[monthKey]) {
    return (m.monthlyMetrics[monthKey] as any)[metric] || 0;
  }
  const prefix = monthKey + "-";
  return Object.entries(m.funnelByWeek || {}).reduce(
    (s, [weekKey, f]) => (weekKey.startsWith(prefix) ? s + ((f as any)[metric] || 0) : s),
    0
  );
}

export function getMemberLifetimeMetricTotal(m: TeamMember, metric: GoalMetric): number {
  if (m.monthlyMetrics && Object.keys(m.monthlyMetrics).length > 0) {
    return Object.values(m.monthlyMetrics).reduce(
      (s, f) => s + ((f as any)[metric] || 0), 0
    );
  }
  return Object.values(m.funnelByWeek || {}).reduce(
    (s, f) => s + ((f as any)[metric] || 0), 0
  );
}

export function getTeamMetricTotal(team: Team, metric: GoalMetric, referenceDate?: Date): number {
  return (team.members ?? [])
    .filter((m) => m.isActive)
    .reduce((sum, m) => sum + getMemberMetricTotal(m, metric, referenceDate), 0);
}

export function getPhaseWinsLabel(teams: Team[], year: number, month: number): string {
  const phaseDate = new Date(year, month, 15);
  let totalWins = 0;
  let totalGoal = 0;
  for (const team of teams) {
    totalWins += (team.members ?? []).reduce((s, m) => s + getMemberMetricTotal(m, 'wins', phaseDate), 0);
    if (team.enabledGoals?.wins) {
      totalGoal += (team.members ?? [])
        .filter((m) => m.isActive)
        .reduce((s, m) => s + getEffectiveGoal(team, m, 'wins'), 0);
    }
  }
  return totalGoal > 0 ? `${totalWins} / ${totalGoal} wins` : `${totalWins} wins`;
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

function getMemberAccountNames(m: TeamMember, metric: GoalMetric, referenceDate?: Date): string[] {
  const now = referenceDate ?? new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return m.metricAccountNames?.[monthKey]?.[metric] ?? [];
}

export function getScopedAccountNames(team: Team, member: TeamMember, metric: GoalMetric, referenceDate?: Date): string[] {
  const scope = team.goalScopeConfig?.[metric] ?? 'individual';
  if (scope !== 'team') return getMemberAccountNames(member, metric, referenceDate);
  const merged = new Set<string>();
  for (const m of (team.members ?? []).filter((mm) => mm.isActive)) {
    for (const name of getMemberAccountNames(m, metric, referenceDate)) {
      merged.add(name);
    }
  }
  return Array.from(merged).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export function isMemberOnRelief(team: Team, member: TeamMember): boolean {
  return (team.reliefMonthMembers ?? []).includes(member.id);
}

export function getEffectiveGoal(team: Team, member: TeamMember, metric: GoalMetric): number {
  const scope = team.goalScopeConfig?.[metric] ?? 'individual';

  if (scope === 'team') {
    return team.teamGoals?.[metric] || 0;
  }

  if (member.level && team.teamGoalsByLevel?.[metric]?.[member.level] != null) {
    const levelGoal = team.teamGoalsByLevel[metric][member.level]!;
    if (team.goalsParity) {
      const sameLevel = (team.members ?? []).filter((mm) => mm.isActive && mm.level === member.level).length;
      return sameLevel > 0 ? Math.round(levelGoal / sameLevel) : 0;
    }
    return levelGoal;
  }
  if (team.goalsParity) {
    const activeCount = (team.members ?? []).filter((mm) => mm.isActive).length;
    return activeCount > 0 ? Math.round((team.teamGoals?.[metric] || 0) / activeCount) : 0;
  }
  return member.goals?.[metric] ?? 0;
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

function getAccelMetricTotal(team: Team, member: TeamMember, metric: GoalMetric, rule: AcceleratorRule, referenceDate?: Date): number {
  const scope = rule.scope ?? 'individual';
  return scope === 'team'
    ? getTeamMetricTotal(team, metric, referenceDate)
    : getMemberMetricTotal(member, metric, referenceDate);
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

function getBasicAccelMetricTotal(team: Team, member: TeamMember, metric: GoalMetric, config: BasicAcceleratorMetricConfig, referenceDate?: Date): number {
  const scope = config.scope ?? 'individual';
  return scope === 'team'
    ? getTeamMetricTotal(team, metric, referenceDate)
    : getMemberMetricTotal(member, metric, referenceDate);
}

/**
 * Linear interpolation between minPct at minValue and 200% at maxValue.
 * Below minValue: 0. At or above maxValue: 200.
 */
function computeBasicBonus(config: BasicAcceleratorMetricConfig, current: number): number {
  if (current < config.minValue) return 0;
  if (current >= config.maxValue) return 200;
  const range = config.maxValue - config.minValue;
  if (range <= 0) return config.minPct;
  return config.minPct + ((current - config.minValue) / range) * (200 - config.minPct);
}

/**
 * Compute quota %: average (current/goal) across enabled metrics,
 * then apply any active accelerator rules.
 */
export function computeQuota(team: Team, member: TeamMember, referenceDate?: Date): number {
  const onRelief = isMemberOnRelief(team, member);
  const enabledMetrics = GOAL_METRICS.filter((m) => team.enabledGoals?.[m]);
  if (!onRelief && enabledMetrics.length === 0) return 0;

  let quota: number;
  if (onRelief) {
    quota = 100;
  } else {
    const ratios = enabledMetrics.map((metric) => {
      const goal = getEffectiveGoal(team, member, metric);
      const current = getScopedMetricTotal(team, member, metric, referenceDate);
      return goal > 0 ? (current / goal) * 100 : 0;
    });
    quota = ratios.reduce((sum, r) => sum + r, 0) / ratios.length;
  }

  const mode = team.acceleratorMode ?? 'basic';
  if (mode === 'basic') {
    const basicConfig = team.basicAcceleratorConfig ?? {};
    for (const metric of GOAL_METRICS) {
      const cfg = basicConfig[metric];
      if (!cfg?.enabled) continue;
      const current = getBasicAccelMetricTotal(team, member, metric, cfg, referenceDate);
      quota += computeBasicBonus(cfg, current);
    }
  } else {
    const accelConfig = team.acceleratorConfig ?? {};
    for (const metric of GOAL_METRICS) {
      const rules = accelConfig[metric];
      if (!rules || !Array.isArray(rules) || rules.length === 0) continue;
      for (const rule of rules) {
        if (!rule?.enabled) continue;
        const current = getAccelMetricTotal(team, member, metric, rule, referenceDate);
        if (evaluateCondition(rule, current)) {
          quota = applyAction(rule, quota);
        }
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
  const mode = team.acceleratorMode ?? 'basic';
  if (mode === 'basic') {
    const basicConfig = team.basicAcceleratorConfig ?? {};
    for (const metric of GOAL_METRICS) {
      const cfg = basicConfig[metric];
      if (!cfg?.enabled) continue;
      const current = getBasicAccelMetricTotal(team, member, metric, cfg, referenceDate);
      if (current >= cfg.minValue) count++;
    }
  } else {
    const accelConfig = team.acceleratorConfig ?? {};
    for (const metric of GOAL_METRICS) {
      const rules = accelConfig[metric];
      if (!rules || !Array.isArray(rules) || rules.length === 0) continue;
      for (const rule of rules) {
        if (!rule?.enabled) continue;
        const current = getAccelMetricTotal(team, member, metric, rule, referenceDate);
        if (evaluateCondition(rule, current)) count++;
      }
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
  rule?: AcceleratorRule;
  basicConfig?: BasicAcceleratorMetricConfig;
  bonusPct?: number;
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
  const onRelief = isMemberOnRelief(team, member);
  const enabledMetrics = GOAL_METRICS.filter((m) => team.enabledGoals?.[m]);
  if (!onRelief && enabledMetrics.length === 0) {
    return { metricRatios: [], baseQuota: 0, acceleratorSteps: [], finalQuota: 0 };
  }

  let metricRatios: QuotaMetricRatio[];
  let baseQuota: number;
  if (onRelief) {
    metricRatios = [];
    baseQuota = 100;
  } else {
    metricRatios = enabledMetrics.map((metric) => {
      const goal = getEffectiveGoal(team, member, metric);
      const current = getScopedMetricTotal(team, member, metric, referenceDate);
      return { metric, current, goal, pct: goal > 0 ? (current / goal) * 100 : 0 };
    });
    baseQuota = metricRatios.reduce((sum, r) => sum + r.pct, 0) / metricRatios.length;
  }

  let quota = baseQuota;
  const acceleratorSteps: QuotaAcceleratorStep[] = [];

  const mode = team.acceleratorMode ?? 'basic';
  if (mode === 'basic') {
    const basicConfig = team.basicAcceleratorConfig ?? {};
    for (const metric of GOAL_METRICS) {
      const cfg = basicConfig[metric];
      if (!cfg?.enabled) continue;
      const current = getBasicAccelMetricTotal(team, member, metric, cfg, referenceDate);
      const bonus = computeBasicBonus(cfg, current);
      if (bonus > 0) {
        const before = quota;
        quota += bonus;
        acceleratorSteps.push({ metric, basicConfig: cfg, bonusPct: bonus, quotaBefore: before, quotaAfter: quota });
      }
    }
  } else {
    const accelConfig = team.acceleratorConfig ?? {};
    for (const metric of GOAL_METRICS) {
      const rules = accelConfig[metric];
      if (!rules || !Array.isArray(rules) || rules.length === 0) continue;
      for (const rule of rules) {
        if (!rule?.enabled) continue;
        const current = getAccelMetricTotal(team, member, metric, rule, referenceDate);
        if (evaluateCondition(rule, current)) {
          const before = quota;
          quota = applyAction(rule, quota);
          acceleratorSteps.push({ metric, rule, quotaBefore: before, quotaAfter: quota });
        }
      }
    }
  }

  return { metricRatios, baseQuota, acceleratorSteps, finalQuota: Math.min(quota, 200) };
}

export interface TriggeredAccelerator {
  metric: GoalMetric;
  currentValue: number;
  rule?: AcceleratorRule;
  basicConfig?: BasicAcceleratorMetricConfig;
  bonusPct?: number;
}

export function getTriggeredAcceleratorDetails(team: Team, member: TeamMember, referenceDate?: Date): TriggeredAccelerator[] {
  const results: TriggeredAccelerator[] = [];
  const mode = team.acceleratorMode ?? 'basic';
  if (mode === 'basic') {
    const basicConfig = team.basicAcceleratorConfig ?? {};
    for (const metric of GOAL_METRICS) {
      const cfg = basicConfig[metric];
      if (!cfg?.enabled) continue;
      const current = getBasicAccelMetricTotal(team, member, metric, cfg, referenceDate);
      if (current >= cfg.minValue) {
        const bonus = computeBasicBonus(cfg, current);
        results.push({ metric, currentValue: current, basicConfig: cfg, bonusPct: bonus });
      }
    }
  } else {
    const accelConfig = team.acceleratorConfig ?? {};
    for (const metric of GOAL_METRICS) {
      const rules = accelConfig[metric];
      if (!rules || !Array.isArray(rules) || rules.length === 0) continue;
      for (const rule of rules) {
        if (!rule?.enabled) continue;
        const current = getAccelMetricTotal(team, member, metric, rule, referenceDate);
        if (evaluateCondition(rule, current)) {
          results.push({ metric, currentValue: current, rule });
        }
      }
    }
  }
  return results;
}

export interface AcceleratorProgress {
  metric: GoalMetric;
  currentValue: number;
  triggeredRules: TriggeredAccelerator[];
  nextRule: AcceleratorRule | null;
  needed: number;
  totalRules: number;
}

/**
 * For a single metric, return progress through its accelerator tiers:
 * which rules are triggered, which is next, and how far away it is.
 * Returns null if the metric has no enabled accelerator rules.
 */
export function getAcceleratorProgress(
  team: Team, member: TeamMember, metric: GoalMetric, referenceDate?: Date,
): AcceleratorProgress | null {
  const rules = (team.acceleratorConfig ?? {})[metric];
  if (!rules || !Array.isArray(rules) || rules.length === 0) return null;

  const enabledRules = rules.filter((r) => r?.enabled);
  if (enabledRules.length === 0) return null;

  const triggered: TriggeredAccelerator[] = [];
  let nextRule: AcceleratorRule | null = null;

  for (const rule of enabledRules) {
    const current = getAccelMetricTotal(team, member, metric, rule, referenceDate);
    if (evaluateCondition(rule, current)) {
      triggered.push({ metric, currentValue: current, rule });
    } else if (!nextRule) {
      nextRule = rule;
    }
  }

  const firstRule = enabledRules[0];
  const currentValue = getAccelMetricTotal(team, member, metric, firstRule, referenceDate);

  let needed = 0;
  if (nextRule) {
    switch (nextRule.conditionOperator) {
      case '>':
        needed = Math.max(0, nextRule.conditionValue1 + 1 - currentValue);
        break;
      case '<':
        needed = Math.max(0, currentValue - nextRule.conditionValue1 + 1);
        break;
      case 'between':
        needed = Math.max(0, nextRule.conditionValue1 - currentValue);
        break;
    }
  }

  return {
    metric,
    currentValue,
    triggeredRules: triggered,
    nextRule,
    needed,
    totalRules: enabledRules.length,
  };
}
