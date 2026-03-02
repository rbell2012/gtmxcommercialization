import { useState, useMemo } from "react";
import { Target, Calendar, LockOpen, Lock } from "lucide-react";
import {
  useTeams,
  type Team,
  type TeamMember,
  type GoalMetric,
  type AcceleratorRule,
  GOAL_METRICS,
  GOAL_METRIC_LABELS,
} from "@/contexts/TeamsContext";
import { getMemberMetricTotal, getScopedMetricTotal, getEffectiveGoal, getBusinessDaysRemaining, computeQuota, countTriggeredAccelerators, computeQuotaBreakdown, type QuotaBreakdown } from "@/lib/quota-helpers";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { generateTestPhases, isCurrentMonth, phaseToDate, type ComputedPhase } from "@/lib/test-phases";

const METRIC_BAR_COLORS: string[] = [
  "progress-bar-orange",
  "progress-bar-blue",
  "progress-bar-orange",
  "progress-bar-blue",
  "progress-bar-orange",
  "progress-bar-blue",
];

const BAR_COLORS = ["hsl(24, 80%, 53%)", "hsl(210, 65%, 50%)", "hsl(30, 80%, 50%)", "hsl(160, 50%, 48%)", "hsl(280, 50%, 55%)", "hsl(45, 70%, 52%)"];

function formatPerDay(needed: number, days: number): string {
  if (days <= 0) return "--";
  const val = needed / days;
  return val % 1 === 0 ? String(val) : val.toFixed(1);
}

function mergePhases(teams: Team[]): ComputedPhase[] {
  const seen = new Map<string, ComputedPhase>();
  for (const team of teams) {
    const phases = generateTestPhases(team.startDate, team.endDate, {});
    for (const p of phases) {
      const key = `${p.year}-${p.month}`;
      if (!seen.has(key)) seen.set(key, p);
    }
  }
  return Array.from(seen.values()).sort(
    (a, b) => a.year - b.year || a.month - b.month
  ).map((p, i) => ({ ...p, monthIndex: i }));
}

const Quota = () => {
  const { teams } = useTeams();
  const activeTeams = teams.filter((t) => t.isActive);
  const [selectedMonth, setSelectedMonth] = useState<Date | null>(null);
  const referenceDate = selectedMonth ?? undefined;

  const allPhases = useMemo(() => mergePhases(activeTeams), [activeTeams]);

  return (
    <div className="min-h-screen bg-background px-4 py-8 md:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center gap-3">
          <Target className="h-8 w-8 text-primary" />
          <h1 className="font-display text-4xl font-bold tracking-tight text-foreground md:text-5xl">
            Quota
          </h1>
        </div>

        {allPhases.length > 0 && (
          <div className="mb-6 rounded-lg border border-border bg-card p-5 glow-card">
            {selectedMonth && !isCurrentMonth(selectedMonth) && (
              <div className="mb-3 flex items-center justify-between rounded-md bg-primary/10 border border-primary/30 px-3 py-1.5">
                <span className="text-xs font-medium text-primary">
                  Viewing: {selectedMonth.toLocaleString("en-US", { month: "long", year: "numeric" })}
                </span>
                <button
                  onClick={() => setSelectedMonth(null)}
                  className="text-xs font-semibold text-primary hover:text-primary/80 underline"
                >
                  Back to Current
                </button>
              </div>
            )}
            <div className="flex h-6 w-full overflow-hidden rounded-full bg-muted">
              {allPhases.map((phase, i) => {
                const widthPct = 100 / allPhases.length;
                const fillPct = phase.progress;
                const now = new Date();
                const phaseIsCurrentMonth = phase.year === now.getFullYear() && phase.month === now.getMonth();
                const phaseIsSelected = selectedMonth
                  ? phase.year === selectedMonth.getFullYear() && phase.month === selectedMonth.getMonth()
                  : phaseIsCurrentMonth;
                return (
                  <div
                    key={`${phase.year}-${phase.month}`}
                    className={`relative h-full cursor-pointer transition-all ${phaseIsSelected ? "ring-2 ring-primary ring-offset-1 ring-offset-background z-10 rounded-sm" : "hover:brightness-110"}`}
                    style={{ width: `${widthPct}%` }}
                    onClick={() => {
                      if (phaseIsCurrentMonth && !selectedMonth) return;
                      if (phaseIsCurrentMonth) { setSelectedMonth(null); return; }
                      setSelectedMonth(phaseToDate(phase));
                    }}
                  >
                    <div
                      className="h-full transition-all duration-500 ease-out"
                      style={{
                        width: `${fillPct}%`,
                        backgroundColor: BAR_COLORS[i % BAR_COLORS.length],
                        borderRadius: i === 0 && fillPct > 0 ? "9999px 0 0 9999px" : i === allPhases.length - 1 && fillPct >= 100 ? "0 9999px 9999px 0" : "0",
                      }}
                    />
                    {i < allPhases.length - 1 && <div className="absolute right-0 top-0 h-full w-px bg-border" />}
                  </div>
                );
              })}
            </div>
            <div className="mt-2 grid gap-1" style={{ gridTemplateColumns: `repeat(${allPhases.length}, minmax(0, 1fr))` }}>
              {allPhases.map((phase, i) => {
                const colors = ["text-primary", "text-accent", "text-primary", "text-accent", "text-primary", "text-accent"];
                const now = new Date();
                const phaseIsCurrentMonth = phase.year === now.getFullYear() && phase.month === now.getMonth();
                const phaseIsSelected = selectedMonth
                  ? phase.year === selectedMonth.getFullYear() && phase.month === selectedMonth.getMonth()
                  : phaseIsCurrentMonth;
                const monthName = new Date(phase.year, phase.month, 1).toLocaleString("en-US", { month: "short" });
                return (
                  <div
                    key={`${phase.year}-${phase.month}`}
                    className={`text-center cursor-pointer rounded-md transition-colors px-1 py-0.5 ${phaseIsSelected ? "bg-primary/15" : "hover:bg-muted/50"}`}
                    onClick={() => {
                      if (phaseIsCurrentMonth && !selectedMonth) return;
                      if (phaseIsCurrentMonth) { setSelectedMonth(null); return; }
                      setSelectedMonth(phaseToDate(phase));
                    }}
                  >
                    <p className={`text-xs font-semibold ${phaseIsSelected ? "text-primary" : colors[i % colors.length]}`}>
                      {monthName}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{phase.progress}%</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTeams.length === 0 && (
          <p className="text-sm text-muted-foreground">No active teams.</p>
        )}

        {activeTeams.map((team) => (
          <TeamQuotaCard key={team.id} team={team} referenceDate={referenceDate} />
        ))}
      </div>
    </div>
  );
};

function TeamQuotaCard({
  team,
  referenceDate,
}: {
  team: Team;
  referenceDate?: Date;
}) {
  const activeMembers = team.members.filter((m) => m.isActive);
  const daysLeft = getBusinessDaysRemaining(team.endDate, referenceDate);
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
                {visibleMetrics.map((metric) => {
                  const isTeamScope = (team.goalScopeConfig?.[metric] ?? 'individual') === 'team';
                  return (
                    <th
                      key={metric}
                      className="text-center py-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[90px]"
                    >
                      {GOAL_METRIC_LABELS[metric]}
                      {isTeamScope && (
                        <span className="block text-[8px] font-bold text-primary/60 normal-case tracking-normal">(team)</span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {activeMembers.map((m) => (
                <MemberQuotaRow key={m.id} team={team} member={m} daysLeft={daysLeft} visibleMetrics={visibleMetrics} referenceDate={referenceDate} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatAction(rule: AcceleratorRule): string {
  const unit = rule.actionUnit === "%" ? "%" : "";
  return `${rule.actionOperator}${rule.actionValue}${unit} to quota`;
}

function QuotaBreakdownTooltip({ breakdown }: { breakdown: QuotaBreakdown }) {
  return (
    <div className="text-xs leading-relaxed">
      <p className="font-semibold mb-1.5">Quota Breakdown</p>
      <div className="space-y-0.5">
        {breakdown.metricRatios.map((r) => (
          <div key={r.metric} className="flex justify-between gap-4 text-muted-foreground">
            <span>{GOAL_METRIC_LABELS[r.metric]}</span>
            <span>
              <span className="font-semibold text-foreground">{r.current}</span>
              {" / "}
              <span className="font-semibold text-foreground">{r.goal}</span>
              {" = "}
              <span className="font-semibold text-foreground">{r.pct.toFixed(1)}%</span>
            </span>
          </div>
        ))}
      </div>
      <div className="my-1.5 border-t border-border" />
      <div className="flex justify-between gap-4 text-muted-foreground">
        <span>Base avg</span>
        <span className="font-semibold text-foreground">{breakdown.baseQuota.toFixed(1)}%</span>
      </div>
      {breakdown.acceleratorSteps.length > 0 && (
        <>
          {breakdown.acceleratorSteps.map((step, i) => (
            <div key={i} className="flex justify-between gap-4 text-muted-foreground mt-0.5">
              <span>{GOAL_METRIC_LABELS[step.metric]} accel</span>
              <span>
                <span className="font-semibold text-foreground">{formatAction(step.rule)}</span>
                {" \u2192 "}
                <span className="font-semibold text-foreground">{step.quotaAfter.toFixed(1)}%</span>
              </span>
            </div>
          ))}
        </>
      )}
      <div className="my-1.5 border-t border-border" />
      <div className="flex justify-between gap-4 font-semibold text-foreground">
        <span>Final</span>
        <span>{Math.min(breakdown.finalQuota, 200).toFixed(1)}%</span>
      </div>
    </div>
  );
}

function MemberQuotaRow({
  team,
  member,
  daysLeft,
  visibleMetrics,
  referenceDate,
}: {
  team: Team;
  member: TeamMember;
  daysLeft: number;
  visibleMetrics: GoalMetric[];
  referenceDate?: Date;
}) {
  const quotaPct = computeQuota(team, member, referenceDate);
  const quotaBreakdown = computeQuotaBreakdown(team, member, referenceDate);
  const triggeredCount = countTriggeredAccelerators(team, member, referenceDate);
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
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={`text-xs font-bold tabular-nums mt-0.5 cursor-help ${quotaColorClass}`}
                style={quotaColor ? { color: quotaColor } : undefined}
              >
                {Math.min(quotaPct, 200).toFixed(0)}% Quota
              </span>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-[280px]">
              <QuotaBreakdownTooltip breakdown={quotaBreakdown} />
            </TooltipContent>
          </Tooltip>
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
        const current = getScopedMetricTotal(team, member, metric, referenceDate);
        const isTeamScope = (team.goalScopeConfig?.[metric] ?? 'individual') === 'team';
        const needed = Math.max(0, goal - current);
        const pct = goal > 0 ? Math.min((current / goal) * 100, 100) : 0;

        return (
          <td key={metric} className="py-3 px-2">
            <div className="flex flex-col items-center gap-1">
              <span className="text-xs font-semibold text-foreground tabular-nums">
                {current} <span className="text-muted-foreground font-normal">/</span> {goal}
              </span>
              {isTeamScope && (
                <span className="text-[8px] font-bold uppercase tracking-wider text-primary/70">Team</span>
              )}
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
