import { useState, useMemo, memo, Component, type ReactNode, type ErrorInfo } from "react";
import { Target, Calendar, LockOpen, Lock, TrendingUp } from "lucide-react";
import {
  useTeams,
  getTeamMembersForMonth,
  getHistoricalTeam,
  getHistoricalMember,
  toMonthKey,
  type Team,
  type TeamMember,
  type MemberTeamHistoryEntry,
  type TeamGoalsHistoryEntry,
  type MemberGoalsHistoryEntry,
  type GoalMetric,
  type AcceleratorRule,
  type SalesTeam,
  type ProjectedBooking,
  type ProjectTeamAssignment,
  GOAL_METRICS,
  GOAL_METRIC_LABELS,
} from "@/contexts/TeamsContext";
import { getScopedMetricTotal, getScopedAccountNames, getEffectiveGoal, getBusinessDaysRemaining, computeQuota, countTriggeredAccelerators, getTriggeredAcceleratorDetails, computeQuotaBreakdown, getPhaseWinsLabel, isMemberOnRelief, type TriggeredAccelerator, type QuotaBreakdown } from "@/lib/quota-helpers";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { generateTestPhases, splitPhases, isCurrentMonth, phaseToDate, type ComputedPhase } from "@/lib/test-phases";

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
  const { teams, memberTeamHistory, teamGoalsHistory, memberGoalsHistory, allMembersById, salesTeams, projectedBookings, projectTeamAssignments } = useTeams();
  const activeTeams = teams.filter((t) => t.isActive);
  const [selectedMonth, setSelectedMonth] = useState<Date | null>(null);
  const [previousExpanded, setPreviousExpanded] = useState(false);
  const [nextExpanded, setNextExpanded] = useState(false);
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

        {allPhases.length > 0 && (() => {
          const { previousPhases, visiblePhases, nextPhases } = splitPhases(allPhases, selectedMonth ?? undefined);
          const hasPrev = previousPhases.length > 0;
          const hasNext = nextPhases.length > 0;
          const segments: (ComputedPhase | { bucket: "previous" | "next"; count: number })[] = [];
          if (hasPrev && !previousExpanded) {
            segments.push({ bucket: "previous", count: previousPhases.length });
          } else if (hasPrev) {
            segments.push(...previousPhases);
          }
          segments.push(...visiblePhases);
          if (hasNext && !nextExpanded) {
            segments.push({ bucket: "next", count: nextPhases.length });
          } else if (hasNext) {
            segments.push(...nextPhases);
          }
          const gridTemplateCols = segments.map(s => "bucket" in s ? "auto" : "1fr").join(" ");
          return (
          <div className="mb-6 rounded-lg border border-border bg-card p-5 glow-card">
            {selectedMonth && !isCurrentMonth(selectedMonth) && (
              <div className="mb-3 flex items-center justify-between rounded-md bg-primary/10 border border-primary/30 px-3 py-1.5">
                <span className="text-xs font-medium text-primary">
                  Viewing: {selectedMonth.toLocaleString("en-US", { month: "long", year: "numeric" })}
                </span>
                <button
                  onClick={() => { setSelectedMonth(null); setPreviousExpanded(false); setNextExpanded(false); }}
                  className="text-xs font-semibold text-primary hover:text-primary/80 underline"
                >
                  Back to Current
                </button>
              </div>
            )}
            <div className="grid" style={{ gridTemplateColumns: gridTemplateCols }}>
              <div className="rounded-full bg-muted h-6" style={{ gridRow: 1, gridColumn: '1 / -1' }} />
              {segments.map((seg, i) => {
                const isFirst = i === 0;
                const isLast = i === segments.length - 1;
                if ("bucket" in seg) {
                  return (
                    <div
                      key={`bar-${seg.bucket}`}
                      className="relative h-6 z-[1] cursor-pointer overflow-hidden hover:brightness-110"
                      style={{ gridRow: 1, gridColumn: i + 1, borderRadius: isFirst ? '9999px 0 0 9999px' : isLast ? '0 9999px 9999px 0' : '0' }}
                      onClick={() => seg.bucket === "previous" ? setPreviousExpanded(true) : setNextExpanded(true)}
                    >
                      <div className="h-full w-full" style={{ backgroundColor: "hsl(var(--muted-foreground) / 0.3)" }} />
                      {!isLast && <div className="absolute right-0 top-0 h-full w-px bg-border z-[2]" />}
                    </div>
                  );
                }
                const phase = seg;
                const fillPct = phase.progress;
                const now = new Date();
                const phaseIsCurrentMonth = phase.year === now.getFullYear() && phase.month === now.getMonth();
                const phaseIsSelected = selectedMonth
                  ? phase.year === selectedMonth.getFullYear() && phase.month === selectedMonth.getMonth()
                  : phaseIsCurrentMonth;
                return (
                  <div
                    key={`bar-${phase.year}-${phase.month}`}
                    className={`relative h-6 z-[1] cursor-pointer overflow-hidden transition-all ${phaseIsSelected ? "ring-2 ring-primary ring-offset-1 ring-offset-background z-10 rounded-sm" : "hover:brightness-110"}`}
                    style={{ gridRow: 1, gridColumn: i + 1, ...(!phaseIsSelected ? { borderRadius: isFirst ? '9999px 0 0 9999px' : isLast ? '0 9999px 9999px 0' : '0' } : {}) }}
                    onClick={() => {
                      if (phaseIsCurrentMonth && !selectedMonth) return;
                      if (phaseIsCurrentMonth) { setSelectedMonth(null); setPreviousExpanded(false); setNextExpanded(false); return; }
                      setSelectedMonth(phaseToDate(phase));
                      setPreviousExpanded(false);
                      setNextExpanded(false);
                    }}
                  >
                    <div className="h-full transition-all duration-500 ease-out" style={{ width: `${fillPct}%`, backgroundColor: BAR_COLORS[phase.monthIndex % BAR_COLORS.length] }} />
                    {!isLast && <div className="absolute right-0 top-0 h-full w-px bg-border z-[2]" />}
                  </div>
                );
              })}
              {segments.map((seg, i) => {
                const colorClasses = ["text-primary", "text-accent", "text-primary", "text-accent", "text-primary", "text-accent"];
                if ("bucket" in seg) {
                  return (
                    <div
                      key={`label-${seg.bucket}`}
                      className="mt-2 text-center cursor-pointer rounded-md transition-colors py-0.5 hover:bg-muted/50 whitespace-nowrap"
                      style={{ gridRow: 2, gridColumn: i + 1 }}
                      onClick={() => seg.bucket === "previous" ? setPreviousExpanded(true) : setNextExpanded(true)}
                    >
                      <p className="text-[10px] font-semibold text-muted-foreground">{seg.bucket === "previous" ? `Prev (${seg.count})` : `Next (${seg.count})`}</p>
                    </div>
                  );
                }
                const phase = seg;
                const now = new Date();
                const phaseIsCurrentMonth = phase.year === now.getFullYear() && phase.month === now.getMonth();
                const phaseIsSelected = selectedMonth
                  ? phase.year === selectedMonth.getFullYear() && phase.month === selectedMonth.getMonth()
                  : phaseIsCurrentMonth;
                const monthName = new Date(phase.year, phase.month, 1).toLocaleString("en-US", { month: "short" });
                return (
                  <div
                    key={`label-${phase.year}-${phase.month}`}
                    className={`mt-2 text-center cursor-pointer rounded-md transition-colors px-1 py-0.5 ${phaseIsSelected ? "bg-primary/15" : "hover:bg-muted/50"}`}
                    style={{ gridRow: 2, gridColumn: i + 1 }}
                    onClick={() => {
                      if (phaseIsCurrentMonth && !selectedMonth) return;
                      if (phaseIsCurrentMonth) { setSelectedMonth(null); setPreviousExpanded(false); setNextExpanded(false); return; }
                      setSelectedMonth(phaseToDate(phase));
                      setPreviousExpanded(false);
                      setNextExpanded(false);
                    }}
                  >
                    <p className={`text-xs font-semibold ${phaseIsSelected ? "text-primary" : colorClasses[phase.monthIndex % colorClasses.length]}`}>
                      {monthName}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{getPhaseWinsLabel(activeTeams, phase.year, phase.month)}</p>
                  </div>
                );
              })}
            </div>
            {(previousExpanded || nextExpanded) && (
              <div className="mt-1 flex justify-center">
                <button
                  onClick={() => { setPreviousExpanded(false); setNextExpanded(false); }}
                  className="text-[10px] font-medium text-muted-foreground hover:text-primary underline"
                >
                  Collapse
                </button>
              </div>
            )}
          </div>
          );
        })()}

        {activeTeams.length === 0 && (
          <p className="text-sm text-muted-foreground">No active teams.</p>
        )}

        {activeTeams.map((team) => (
          <TeamQuotaCard key={team.id} team={team} referenceDate={referenceDate} memberTeamHistory={memberTeamHistory} teamGoalsHistory={teamGoalsHistory} memberGoalsHistory={memberGoalsHistory} allMembersById={allMembersById} />
        ))}

        <ForecastingSection
          teams={activeTeams}
          salesTeams={salesTeams}
          projectedBookings={projectedBookings}
          projectTeamAssignments={projectTeamAssignments}
        />
      </div>
    </div>
  );
};

const FORECAST_RANGE_OPTIONS = [
  { value: "1", label: "1 Month" },
  { value: "3", label: "3 Months" },
  { value: "6", label: "6 Months" },
  { value: "12", label: "12 Months" },
] as const;

function getFutureMonths(count: number): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return result;
}

function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleString("en-US", { month: "short", year: "2-digit" });
}

function ForecastingSection({
  teams,
  salesTeams,
  projectedBookings,
  projectTeamAssignments,
}: {
  teams: Team[];
  salesTeams: SalesTeam[];
  projectedBookings: ProjectedBooking[];
  projectTeamAssignments: ProjectTeamAssignment[];
}) {
  const [range, setRange] = useState("3");
  const months = useMemo(() => getFutureMonths(Number(range)), [range]);

  const globalBookings = useMemo(() => {
    const map = new Map<string, number>();
    for (const pb of projectedBookings) {
      if (pb.teamId === null && pb.projectedBookings != null) {
        map.set(pb.month, pb.projectedBookings);
      }
    }
    return map;
  }, [projectedBookings]);

  const prevMonthKey = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return toMonthKey(d);
  }, []);

  return (
    <div className="mt-8">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TrendingUp className="h-6 w-6 text-primary" />
          <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Forecasting &amp; Goals
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Range:</span>
          <select
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground"
          >
            {FORECAST_RANGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {teams.length === 0 && (
        <p className="text-sm text-muted-foreground">No active projects.</p>
      )}

      {teams.map((team) => {
        const teamBookings = projectedBookings.filter(
          (pb) => pb.teamId === team.id
        );
        const teamBookingsMap = new Map(
          teamBookings.map((pb) => [pb.month, pb])
        );

        const teamPhases = generateTestPhases(team.startDate, team.endDate, {});
        const monthKeyToPhaseIndex = new Map<string, number>();
        for (const p of teamPhases) {
          const mk = `${p.year}-${String(p.month + 1).padStart(2, "0")}`;
          monthKeyToPhaseIndex.set(mk, p.monthIndex);
        }

        const getExcludedCount = (a: ProjectTeamAssignment) => {
          if (!a.excludedMembers) return 0;
          return a.excludedMembers.split(",").map((s) => s.trim()).filter(Boolean).length;
        };

        const getEffectiveReps = (st: SalesTeam, a: ProjectTeamAssignment) =>
          Math.max(0, st.teamSize - getExcludedCount(a));

        const getAssignmentsForMonth = (mk: string) => {
          const phaseIdx = monthKeyToPhaseIndex.get(mk);
          if (phaseIdx === undefined) return [];
          return projectTeamAssignments
            .filter((a) => a.teamId === team.id && a.monthIndex === phaseIdx);
        };

        const getAssignedTeamsForMonth = (mk: string) => {
          return getAssignmentsForMonth(mk)
            .map((a) => salesTeams.find((st) => st.id === a.salesTeamId))
            .filter((st): st is SalesTeam => st != null);
        };

        const getEffectiveRepsForMonth = (mk: string) => {
          const assignments = getAssignmentsForMonth(mk);
          return assignments.reduce((sum, a) => {
            const st = salesTeams.find((s) => s.id === a.salesTeamId);
            return st ? sum + getEffectiveReps(st, a) : sum;
          }, 0);
        };

        const allAssignments = projectTeamAssignments.filter((a) => a.teamId === team.id);
        const distinctAssignmentMap = new Map<string, typeof allAssignments[number]>();
        for (const a of allAssignments) {
          const prev = distinctAssignmentMap.get(a.salesTeamId);
          if (!prev || getExcludedCount(a) > getExcludedCount(prev)) {
            distinctAssignmentMap.set(a.salesTeamId, a);
          }
        }
        const distinctAssignments = Array.from(distinctAssignmentMap.values());
        const allAssignedTeams = distinctAssignments
          .map((a) => salesTeams.find((st) => st.id === a.salesTeamId))
          .filter((st): st is SalesTeam => st != null);
        const allAssignedReps = distinctAssignments.reduce((sum, a) => {
          const st = salesTeams.find((s) => s.id === a.salesTeamId);
          return st ? sum + getEffectiveReps(st, a) : sum;
        }, 0);

        const lastMonthNB = team.members.reduce((sum, m) => {
          const wt = m.monthlyWinTypes[prevMonthKey];
          return sum + (wt?.nb ?? 0);
        }, 0);

        const lastMonthGrowth = team.members.reduce((sum, m) => {
          const wt = m.monthlyWinTypes[prevMonthKey];
          return sum + (wt?.growth ?? 0);
        }, 0);

        const lastMonthTotal = lastMonthNB + lastMonthGrowth;
        const activeMembers = team.members.filter((m) => m.isActive).length;

        const computeRegionImpact = (mk: string) => {
          const reps = getEffectiveRepsForMonth(mk);
          const headcount = activeMembers + reps;
          const wpm = headcount > 0 ? lastMonthTotal / headcount : 0;
          return Math.round(wpm * reps);
        };

        return (
          <div key={team.id} className="mb-6 rounded-lg border border-border bg-card p-5 glow-card">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold text-foreground">{team.name}</h3>
              {allAssignedTeams.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {allAssignedTeams.length} region{allAssignedTeams.length !== 1 ? "s" : ""} assigned across phases ({allAssignedReps} total reps)
                </span>
              )}
            </div>

            <div className="mb-3 flex items-center gap-6 text-xs text-muted-foreground">
              <span>Last month: <span className="font-semibold text-foreground">{lastMonthTotal} wins</span> (NB: {lastMonthNB}, Growth: {lastMonthGrowth})</span>
              <span>{activeMembers} active members</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-2 px-3 text-left font-semibold text-muted-foreground">Month</th>
                    <th className="py-2 px-3 text-right font-semibold text-muted-foreground">Projected Bookings</th>
                    <th className="py-2 px-3 text-right font-semibold text-muted-foreground">NB Attach Goal</th>
                    <th className="py-2 px-3 text-right font-semibold text-muted-foreground">NB Attach %</th>
                    <th className="py-2 px-3 text-right font-semibold text-muted-foreground">Growth Wins Goal</th>
                    <th className="py-2 px-3 text-right font-semibold text-muted-foreground">Region Impact</th>
                    <th className="py-2 px-3 text-right font-semibold text-muted-foreground">Goal Total</th>
                    <th className="py-2 px-3 text-right font-semibold text-muted-foreground">Delta</th>
                    <th className="py-2 px-3 text-right font-semibold text-muted-foreground">Reps Needed</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((mk) => {
                    const global = globalBookings.get(mk) ?? null;
                    const teamPb = teamBookingsMap.get(mk);
                    const nbAttach = teamPb?.newBusinessAttach ?? null;
                    const growthGoal = teamPb?.growthWins ?? null;
                    const attachPct = (global && global > 0 && nbAttach != null)
                      ? ((nbAttach / global) * 100).toFixed(2)
                      : "—";
                    const monthAssigned = getAssignedTeamsForMonth(mk);
                    const regionImpact = computeRegionImpact(mk);
                    const currentReps = getEffectiveRepsForMonth(mk);
                    const baseWins = (nbAttach ?? 0) + (growthGoal ?? 0);
                    const delta = regionImpact - baseWins;
                    const winsPerPerson = activeMembers > 0 ? lastMonthTotal / activeMembers : 0;
                    const repsNeeded = baseWins > 0 && winsPerPerson > 0
                      ? Math.max(0, Math.ceil(baseWins / winsPerPerson) - activeMembers - currentReps)
                      : null;

                    return (
                      <tr key={mk} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="py-2 px-3 font-medium text-foreground">{formatMonthLabel(mk)}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-foreground">{global != null ? global.toLocaleString() : "—"}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-foreground">{nbAttach != null ? nbAttach.toLocaleString() : "—"}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-foreground">{attachPct}{attachPct !== "—" ? "%" : ""}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-foreground">{growthGoal != null ? growthGoal.toLocaleString() : "—"}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-primary font-semibold">{regionImpact > 0 ? `+${regionImpact}` : "—"}</td>
                        <td className="py-2 px-3 text-right tabular-nums font-semibold text-foreground">{baseWins > 0 ? baseWins.toLocaleString() : "—"}</td>
                        <td className={`py-2 px-3 text-right tabular-nums font-semibold ${baseWins === 0 && regionImpact === 0 ? "text-muted-foreground" : delta >= 0 ? "text-green-500" : "text-destructive"}`}>
                          {baseWins === 0 && regionImpact === 0 ? "—" : delta > 0 ? `+${delta}` : delta.toLocaleString()}
                        </td>
                        <td className={`py-2 px-3 text-right tabular-nums font-semibold ${repsNeeded === null ? "text-muted-foreground" : repsNeeded === 0 ? "text-green-500" : "text-destructive"}`}>
                          {repsNeeded === null ? "—" : repsNeeded === 0 ? "✓" : `+${repsNeeded}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {allAssignedTeams.length > 0 && (() => {
              return (
              <div className="mt-4 border-t border-border pt-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Assigned Regions</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {allAssignedTeams.map((st) => {
                    const stAssignment = distinctAssignmentMap.get(st.id);
                    const effReps = stAssignment ? getEffectiveReps(st, stAssignment) : st.teamSize;
                    const hasOverride = effReps < st.teamSize;
                    return (
                    <div key={st.id} className={`rounded-md border bg-muted/20 px-3 py-2 ${hasOverride ? "border-orange-500/50" : "border-border/50"}`}>
                      <p className="text-xs font-semibold text-foreground">{st.displayName}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {hasOverride ? `${effReps} of ${st.teamSize} reps` : `${st.teamSize} reps`}
                      </p>
                    </div>
                    );
                  })}
                </div>
              </div>
              );
            })()}
          </div>
        );
      })}
    </div>
  );
}

function TeamQuotaCard({
  team: rawTeam,
  referenceDate,
  memberTeamHistory,
  teamGoalsHistory,
  memberGoalsHistory,
  allMembersById,
}: {
  team: Team;
  referenceDate?: Date;
  memberTeamHistory: MemberTeamHistoryEntry[];
  teamGoalsHistory: TeamGoalsHistoryEntry[];
  memberGoalsHistory: MemberGoalsHistoryEntry[];
  allMembersById: Map<string, TeamMember>;
}) {
  const team = getHistoricalTeam(rawTeam, referenceDate, teamGoalsHistory);
  const activeMembers = getTeamMembersForMonth(rawTeam, referenceDate, memberTeamHistory, allMembersById)
    .map((m) => getHistoricalMember(m, referenceDate, memberGoalsHistory));
  const daysLeft = getBusinessDaysRemaining(team.endDate, referenceDate);
  const baseMetrics = GOAL_METRICS.filter((m) => team.enabledGoals[m] && m !== 'wins' && m !== 'feedback');
  const visibleMetrics: GoalMetric[] = [
    ...baseMetrics,
    'wins',
    ...(team.enabledGoals.feedback ? ['feedback' as GoalMetric] : []),
  ];

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
          <table className="table-fixed text-sm" style={{ width: `${160 + visibleMetrics.length * 140}px` }}>
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[160px] sticky left-0 z-10 bg-card">
                  Member
                </th>
                {visibleMetrics.map((metric) => {
                  const isTeamScope = (team.goalScopeConfig?.[metric] ?? 'individual') === 'team';
                  return (
                    <th
                      key={metric}
                      className="text-center py-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[140px]"
                    >
                      {GOAL_METRIC_LABELS[metric]}
                      {isTeamScope && (
                        <span className="block text-[8px] font-bold uppercase tracking-wider text-primary/70">Team</span>
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

function formatCondition(rule: AcceleratorRule): string {
  if (rule.conditionOperator === "between") {
    return `between ${rule.conditionValue1} and ${rule.conditionValue2 ?? rule.conditionValue1}`;
  }
  return `${rule.conditionOperator} ${rule.conditionValue1}`;
}

function formatAction(rule: AcceleratorRule): string {
  const unit = rule.actionUnit === "%" ? "%" : "";
  return `${rule.actionOperator}${rule.actionValue}${unit} to quota`;
}

function AcceleratorTooltip({ detail }: { detail: TriggeredAccelerator }) {
  const label = GOAL_METRIC_LABELS[detail.metric];

  if (detail.basicConfig) {
    const scope = detail.basicConfig.scope ?? 'individual';
    return (
      <div className="text-xs leading-relaxed">
        <div className="flex items-center gap-1.5 mb-1">
          <p className="font-semibold">{label} Accelerator</p>
          <span
            className={`text-[8px] font-bold uppercase tracking-wider rounded px-1 py-px border ${
              scope === 'team'
                ? 'bg-primary/15 border-primary/40 text-primary'
                : 'bg-muted/50 border-border/50 text-muted-foreground'
            }`}
          >
            {scope === 'team' ? 'TEAM' : 'SELF'}
          </span>
        </div>
        <p className="text-muted-foreground">
          {label} is <span className="font-semibold text-foreground">{detail.currentValue}</span>
          {" "}(range {detail.basicConfig.minValue} – {detail.basicConfig.maxValue})
        </p>
        <p className="text-muted-foreground mt-0.5">
          Effect: <span className="font-semibold text-foreground">+{detail.bonusPct?.toFixed(1)}% to quota</span>
        </p>
      </div>
    );
  }

  const scope = detail.rule?.scope ?? 'individual';
  return (
    <div className="text-xs leading-relaxed">
      <div className="flex items-center gap-1.5 mb-1">
        <p className="font-semibold">{label} Accelerator</p>
        <span
          className={`text-[8px] font-bold uppercase tracking-wider rounded px-1 py-px border ${
            scope === 'team'
              ? 'bg-primary/15 border-primary/40 text-primary'
              : 'bg-muted/50 border-border/50 text-muted-foreground'
          }`}
        >
          {scope === 'team' ? 'TEAM' : 'SELF'}
        </span>
      </div>
      <p className="text-muted-foreground">
        {label} is <span className="font-semibold text-foreground">{detail.currentValue}</span>
        {detail.rule && <>{" "}({formatCondition(detail.rule)})</>}
      </p>
      {detail.rule && (
        <p className="text-muted-foreground mt-0.5">
          Effect: <span className="font-semibold text-foreground">{formatAction(detail.rule)}</span>
        </p>
      )}
    </div>
  );
}

function QuotaBreakdownTooltip({ breakdown, isRelief }: { breakdown: QuotaBreakdown; isRelief?: boolean }) {
  return (
    <div className="text-xs leading-relaxed">
      <p className="font-semibold mb-1.5">Quota Breakdown</p>
      {isRelief ? (
        <div className="flex justify-between gap-4 text-muted-foreground">
          <span>Relief month</span>
          <span className="font-semibold text-green-500">100.0%</span>
        </div>
      ) : (
        <>
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
        </>
      )}
      {breakdown.acceleratorSteps.length > 0 && (
        <>
          {breakdown.acceleratorSteps.map((step, i) => {
            const scope = step.basicConfig?.scope ?? step.rule?.scope ?? 'individual';
            return (
              <div key={i} className="flex justify-between gap-4 text-muted-foreground mt-0.5">
                <span className="flex items-center gap-1">
                  {GOAL_METRIC_LABELS[step.metric]} accel
                  <span
                    className={`text-[7px] font-bold uppercase rounded px-0.5 border leading-tight ${
                      scope === 'team'
                        ? 'bg-primary/15 border-primary/40 text-primary'
                        : 'bg-muted/50 border-border/50 text-muted-foreground'
                    }`}
                  >
                    {scope === 'team' ? 'TM' : 'SF'}
                  </span>
                </span>
                <span>
                  <span className="font-semibold text-foreground">
                    {step.rule ? formatAction(step.rule) : `+${step.bonusPct?.toFixed(1)}% to quota`}
                  </span>
                  {" \u2192 "}
                  <span className="font-semibold text-foreground">{step.quotaAfter.toFixed(1)}%</span>
                </span>
              </div>
            );
          })}
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

const MemberQuotaRow = memo(function MemberQuotaRow({
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
  const [copiedMetric, setCopiedMetric] = useState<string | null>(null);
  const [forceOpenMetric, setForceOpenMetric] = useState<string | null>(null);
  const onRelief = isMemberOnRelief(team, member);
  const quotaPct = computeQuota(team, member, referenceDate);
  const quotaBreakdown = computeQuotaBreakdown(team, member, referenceDate);
  const triggeredCount = countTriggeredAccelerators(team, member, referenceDate);
  const triggeredDetails = getTriggeredAcceleratorDetails(team, member, referenceDate);
  const quotaColor = quotaPct > 100 ? '#006400' : undefined;
  const quotaColorClass = quotaPct > 100 ? '' : 'text-primary';

  return (
    <tr className="border-b border-border/30">
      <td className="py-3 pr-3 w-[160px] sticky left-0 z-10 bg-card">
        <div className="flex flex-col items-start">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground whitespace-nowrap">{member.name}</span>
            {onRelief && (
              <span className="text-[9px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 bg-green-500/15 border border-green-500/40 text-green-500">Relief</span>
            )}
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
                className={`text-xs font-bold tabular-nums mt-0.5 cursor-help ${onRelief ? 'text-green-500' : quotaColorClass}`}
                style={!onRelief && quotaColor ? { color: quotaColor } : undefined}
              >
                {Math.min(quotaPct, 200).toFixed(0)}% Quota
              </span>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-[340px]">
              <QuotaBreakdownTooltip breakdown={quotaBreakdown} isRelief={onRelief} />
            </TooltipContent>
          </Tooltip>
          {triggeredCount > 0 && (
            <div className="flex items-center gap-1 mt-0.5">
              {Array.from({ length: Math.min(triggeredCount, 3) }, (_, i) => {
                const tier = i + 1;
                const isMax = tier === 3;
                const detail = triggeredDetails[i];
                return (
                  <Tooltip key={tier}>
                    <TooltipTrigger asChild>
                      <span
                        className={`inline-flex items-center gap-px text-xs font-bold cursor-help ${quotaColorClass}`}
                        style={quotaColor ? { color: quotaColor } : undefined}
                      >
                        {isMax ? (
                          <><Lock className="h-3 w-3" /><span className="text-[8px]">MAX</span></>
                        ) : (
                          <><LockOpen className="h-3 w-3" /><span className="text-[8px]">{tier}</span></>
                        )}
                      </span>
                    </TooltipTrigger>
                    {detail && (
                      <TooltipContent side="top" className="max-w-[240px]">
                        <AcceleratorTooltip detail={detail} />
                      </TooltipContent>
                    )}
                  </Tooltip>
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
        const needed = onRelief ? 0 : Math.max(0, goal - current);
        const pct = onRelief ? 100 : (goal > 0 ? Math.min((current / goal) * 100, 100) : 0);
        const hasAccountNames = metric === 'ops' || metric === 'demos' || metric === 'wins';
        const accountNames = hasAccountNames ? getScopedAccountNames(team, member, metric, referenceDate) : [];

        const hasGoal = (metric !== 'wins' || team.enabledGoals.wins) && goal > 0;

        const cellContent = hasGoal ? (
          <div className="flex flex-col items-center gap-1">
            <span className="text-xs font-semibold text-foreground tabular-nums">
              {current} <span className="text-muted-foreground font-normal">/</span> {goal}
            </span>
            {isTeamScope && (
              <span className="text-[8px] font-bold uppercase tracking-wider text-primary/70">Team</span>
            )}
            <div className="h-1.5 w-full max-w-[64px] overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${onRelief ? 'bg-green-500' : METRIC_BAR_COLORS[metricIdx % METRIC_BAR_COLORS.length]}`}
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
        ) : (
          <div className="flex flex-col items-center gap-1">
            <span className="text-xs font-semibold text-foreground tabular-nums">{current}</span>
          </div>
        );

        return (
          <td key={metric} className="py-3 px-2 w-[140px]">
            {hasAccountNames && accountNames.length > 0 ? (
              <Tooltip
                open={forceOpenMetric === metric ? true : undefined}
                onOpenChange={(open) => { if (!open && forceOpenMetric === metric && copiedMetric !== metric) setForceOpenMetric(null); }}
              >
                <TooltipTrigger asChild>
                  <div
                    className="cursor-pointer"
                    onClick={() => {
                      navigator.clipboard.writeText(accountNames.join(", "));
                      setCopiedMetric(metric);
                      setForceOpenMetric(metric);
                      setTimeout(() => setCopiedMetric(null), 1000);
                    }}
                  >
                    {cellContent}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[480px] p-3">
                  {copiedMetric === metric ? (
                    <p className="text-xs font-semibold text-green-500">Copied!</p>
                  ) : (
                    <>
                      <p className="text-xs font-semibold mb-1.5">{GOAL_METRIC_LABELS[metric]}</p>
                      <div className={`${accountNames.length > 6 ? "columns-3" : accountNames.length > 3 ? "columns-2" : ""} gap-x-4 text-xs text-muted-foreground`}>
                        {accountNames.map((name) => (
                          <p key={name} className="break-inside-avoid truncate leading-relaxed">{name}</p>
                        ))}
                      </div>
                    </>
                  )}
                </TooltipContent>
              </Tooltip>
            ) : cellContent}
          </td>
        );
      })}
    </tr>
  );
});

class QuotaErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[QuotaErrorBoundary]", error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-background px-4 py-8 md:px-8">
          <div className="mx-auto max-w-3xl">
            <h1 className="font-display text-2xl font-bold text-destructive mb-4">Quota page crashed</h1>
            <pre className="whitespace-pre-wrap text-sm text-foreground bg-muted rounded-lg p-4 border border-border overflow-x-auto">
              {this.state.error.message}{"\n\n"}{this.state.error.stack}
            </pre>
            <button className="mt-4 text-sm text-primary underline" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function QuotaWithBoundary() {
  return (
    <QuotaErrorBoundary>
      <Quota />
    </QuotaErrorBoundary>
  );
}

export default QuotaWithBoundary;
