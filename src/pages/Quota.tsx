import { Target, Calendar } from "lucide-react";
import {
  useTeams,
  type Team,
  type TeamMember,
  type GoalMetric,
  GOAL_METRICS,
  GOAL_METRIC_LABELS,
} from "@/contexts/TeamsContext";
import { getMemberMetricTotal, getEffectiveGoal, getBusinessDaysRemaining } from "@/lib/quota-helpers";

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
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Member
                </th>
                {GOAL_METRICS.map((metric) => (
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
                <MemberQuotaRow key={m.id} team={team} member={m} daysLeft={daysLeft} />
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
}: {
  team: Team;
  member: TeamMember;
  daysLeft: number;
}) {
  return (
    <tr className="border-b border-border/30">
      <td className="py-3 pr-3">
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
      </td>
      {GOAL_METRICS.map((metric, metricIdx) => {
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
