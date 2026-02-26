import { Target, Calendar, LockOpen, Lock } from "lucide-react";
import {
  useTeams,
  type Team,
  type TeamMember,
  type GoalMetric,
  GOAL_METRICS,
  GOAL_METRIC_LABELS,
} from "@/contexts/TeamsContext";
import { getMemberMetricTotal, getEffectiveGoal, getBusinessDaysRemaining, computeQuota, countTriggeredAccelerators } from "@/lib/quota-helpers";

const METRIC_BAR_COLORS: string[] = [
  "progress-bar-orange",
  "progress-bar-blue",
  "progress-bar-orange",
  "progress-bar-blue",
  "progress-bar-orange",
  "progress-bar-blue",
];

function formatPerDay(needed: number, days: number): string {
  if (days <= 0) return "--";
  const val = needed / days;
  return val % 1 === 0 ? String(val) : val.toFixed(1);
}

const Quota = () => {
  const { teams } = useTeams();
  const activeTeams = teams.filter((t) => t.isActive);

  return (
    <div className="min-h-screen bg-background px-4 py-8 md:px-8">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <Target className="h-8 w-8 text-primary" />
          <h1 className="font-display text-4xl font-bold tracking-tight text-foreground md:text-5xl">
            Quota
          </h1>
        </div>

        {activeTeams.length === 0 && (
          <p className="text-sm text-muted-foreground">No active teams.</p>
        )}

        {activeTeams.map((team) => (
          <TeamQuotaCard key={team.id} team={team} />
        ))}
      </div>
    </div>
  );
};

function TeamQuotaCard({ team }: { team: Team }) {
  const activeMembers = team.members.filter((m) => m.isActive);
  const daysLeft = getBusinessDaysRemaining(team.endDate);
  const visibleMetrics = GOAL_METRICS.filter((m) => team.enabledGoals[m]);

  return (
    <div className="mb-6 rounded-lg border border-border bg-card p-5 glow-card">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold text-foreground">{team.name}</h3>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          <span className="tabular-nums">{daysLeft}</span> business day{daysLeft !== 1 ? "s" : ""} left
        </div>
      </div>

      {activeMembers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active members.</p>
      ) : visibleMetrics.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          No goals configured. Enable goals in Settings.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Member
                </th>
                {visibleMetrics.map((metric) => (
                  <th
                    key={metric}
                    className="text-center py-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[90px]"
                  >
                    {GOAL_METRIC_LABELS[metric]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeMembers.map((m) => (
                <MemberQuotaRow key={m.id} team={team} member={m} daysLeft={daysLeft} visibleMetrics={visibleMetrics} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MemberQuotaRow({
  team,
  member,
  daysLeft,
  visibleMetrics,
}: {
  team: Team;
  member: TeamMember;
  daysLeft: number;
  visibleMetrics: GoalMetric[];
}) {
  const quotaPct = computeQuota(team, member);
  const triggeredCount = countTriggeredAccelerators(team, member);
  const quotaColor = quotaPct > 100 ? '#006400' : undefined;
  const quotaColorClass = quotaPct > 100 ? '' : 'text-primary';

  return (
    <tr className="border-b border-border/30">
      <td className="py-3 pr-3">
        <div className="flex flex-col items-start">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground whitespace-nowrap">{member.name}</span>
            {member.ducksEarned > 0 && (
              <span className="flex items-center">
                {[...Array(member.ducksEarned)].map((_, j) => (
                  <span key={j} className="text-xs">🦆</span>
                ))}
              </span>
            )}
          </div>
          <span
            className={`text-xs font-bold tabular-nums mt-0.5 ${quotaColorClass}`}
            style={quotaColor ? { color: quotaColor } : undefined}
          >
            {Math.min(quotaPct, 200).toFixed(0)}% Quota
          </span>
          {triggeredCount > 0 && (
            <div className="flex items-center gap-1 mt-0.5">
              {Array.from({ length: Math.min(triggeredCount, 3) }, (_, i) => {
                const tier = i + 1;
                const isMax = tier === 3;
                return (
                  <span
                    key={tier}
                    className={`inline-flex items-center gap-px text-xs font-bold ${quotaColorClass}`}
                    style={quotaColor ? { color: quotaColor } : undefined}
                  >
                    {isMax ? (
                      <><Lock className="h-3 w-3" /><span className="text-[8px]">MAX</span></>
                    ) : (
                      <><LockOpen className="h-3 w-3" /><span className="text-[8px]">{tier}</span></>
                    )}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </td>
      {visibleMetrics.map((metric, metricIdx) => {
        const goal = getEffectiveGoal(team, member, metric);
        const current = getMemberMetricTotal(member, metric);
        const needed = Math.max(0, goal - current);
        const pct = goal > 0 ? Math.min((current / goal) * 100, 100) : 0;

        return (
          <td key={metric} className="py-3 px-2">
            <div className="flex flex-col items-center gap-1">
              <span className="text-xs font-semibold text-foreground tabular-nums">
                {current} <span className="text-muted-foreground font-normal">/</span> {goal}
              </span>
              <div className="h-1.5 w-full max-w-[64px] overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all duration-500 ease-out ${METRIC_BAR_COLORS[metricIdx % METRIC_BAR_COLORS.length]}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  need <span className="font-semibold text-foreground">{needed}</span>
                </span>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  <span className="font-semibold text-foreground">{formatPerDay(needed, daysLeft)}</span>/day
                </span>
              </div>
            </div>
          </td>
        );
      })}
    </tr>
  );
}

export default Quota;
