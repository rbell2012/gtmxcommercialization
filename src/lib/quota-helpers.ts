import type { Team, TeamMember, GoalMetric } from "@/contexts/TeamsContext";

export function getMemberMetricTotal(m: TeamMember, metric: GoalMetric): number {
  return Object.values(m.funnelByWeek || {}).reduce((s, f) => s + ((f as any)[metric] || 0), 0);
}

export function getEffectiveGoal(team: Team, member: TeamMember, metric: GoalMetric): number {
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
