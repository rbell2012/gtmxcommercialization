import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Map as MapIcon,
  ChevronLeft,
  ChevronRight,
  Users,
  Calendar,
  Clock,
  UserCheck,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useTeams,
  pilotNameToSlug,
  type Team,
} from "@/contexts/TeamsContext";
import { supabase } from "@/lib/supabase";
import type { DbTeamPhaseLabel } from "@/lib/database.types";
import { generateTestPhases } from "@/lib/test-phases";
import {
  addMonths,
  startOfMonth,
  endOfMonth,
  isSameMonth,
  format,
  isBefore,
  isAfter,
} from "date-fns";

const PROJECT_COLORS = [
  { bg: "bg-primary/10", border: "border-l-primary", text: "text-primary" },
  { bg: "bg-accent/10", border: "border-l-accent", text: "text-accent" },
  { bg: "bg-chart-3/10", border: "border-l-[hsl(var(--chart-3))]", text: "text-[hsl(var(--chart-3))]" },
  { bg: "bg-chart-4/10", border: "border-l-[hsl(var(--chart-4))]", text: "text-[hsl(var(--chart-4))]" },
  { bg: "bg-chart-5/10", border: "border-l-[hsl(var(--chart-5))]", text: "text-[hsl(var(--chart-5))]" },
];

function getProjectColor(index: number) {
  return PROJECT_COLORS[index % PROJECT_COLORS.length];
}

function formatMonthHeader(date: Date): string {
  return format(date, "MMM yyyy");
}

function formatAvailability(date: string | null): string {
  if (!date) return "TBD";
  return format(new Date(date + "T00:00:00"), "MMM yyyy");
}

interface ProjectForMonth {
  team: Team;
  phaseLabel: string;
  isStart: boolean;
  isEnd: boolean;
  colorIndex: number;
}

const MONTHS_VISIBLE = 6;

const Roadmap = () => {
  const { teams, unassignedMembers, loading } = useTeams();
  const navigate = useNavigate();

  const [windowStart, setWindowStart] = useState(() => startOfMonth(new Date()));
  const [phaseLabels, setPhaseLabels] = useState<Record<string, Record<number, string>>>({});

  const allTeams = teams;

  useEffect(() => {
    if (allTeams.length === 0) return;
    const teamIds = allTeams.map((t) => t.id);
    supabase
      .from("team_phase_labels")
      .select("*")
      .in("team_id", teamIds)
      .then(({ data }) => {
        if (!data) return;
        const grouped: Record<string, Record<number, string>> = {};
        for (const row of data as DbTeamPhaseLabel[]) {
          if (!grouped[row.team_id]) grouped[row.team_id] = {};
          grouped[row.team_id][row.month_index] = row.label;
        }
        setPhaseLabels(grouped);
      });
  }, [allTeams]);

  const months = useMemo(() => {
    const result: Date[] = [];
    for (let i = 0; i < MONTHS_VISIBLE; i++) {
      result.push(addMonths(windowStart, i));
    }
    return result;
  }, [windowStart]);

  const windowLabel = `${format(months[0], "MMM yyyy")} – ${format(months[months.length - 1], "MMM yyyy")}`;

  const phaseLabelsByTeam = useMemo(() => {
    const map: Record<string, Record<string, string>> = {};
    for (const team of allTeams) {
      const labels = phaseLabels[team.id] ?? {};
      const phases = generateTestPhases(team.startDate, team.endDate, labels);
      const byMonthKey: Record<string, string> = {};
      for (const phase of phases) {
        const key = `${phase.year}-${phase.month}`;
        byMonthKey[key] = phase.label;
      }
      map[team.id] = byMonthKey;
    }
    return map;
  }, [allTeams, phaseLabels]);

  const projectsByMonth = useMemo(() => {
    const result: Record<string, ProjectForMonth[]> = {};
    for (const month of months) {
      const monthKey = format(month, "yyyy-MM");
      const mStart = startOfMonth(month);
      const mEnd = endOfMonth(month);
      const projectsThisMonth: ProjectForMonth[] = [];

      for (let ci = 0; ci < allTeams.length; ci++) {
        const team = allTeams[ci];
        if (!team.startDate || !team.endDate) continue;

        const teamStart = new Date(team.startDate + "T00:00:00");
        const teamEnd = new Date(team.endDate + "T00:00:00");

        const teamStartMonth = startOfMonth(teamStart);
        const teamEndMonth = startOfMonth(teamEnd);

        if (isAfter(mStart, endOfMonth(teamEnd)) || isBefore(mEnd, teamStartMonth)) continue;

        const phaseKey = `${month.getFullYear()}-${month.getMonth()}`;
        const phaseLabel = phaseLabelsByTeam[team.id]?.[phaseKey] ?? "";

        projectsThisMonth.push({
          team,
          phaseLabel,
          isStart: isSameMonth(mStart, teamStartMonth),
          isEnd: isSameMonth(mStart, teamEndMonth),
          colorIndex: ci,
        });
      }

      result[monthKey] = projectsThisMonth;
    }
    return result;
  }, [months, allTeams, phaseLabelsByTeam]);

  const { orderedTeamIds, projectLookup } = useMemo(() => {
    const visibleTeamIds = new Set<string>();
    for (const monthKey of Object.keys(projectsByMonth)) {
      for (const proj of projectsByMonth[monthKey]) {
        visibleTeamIds.add(proj.team.id);
      }
    }

    const orderedTeamIds = allTeams
      .filter((t) => visibleTeamIds.has(t.id))
      .map((t) => t.id);

    const projectLookup: Record<string, Record<string, ProjectForMonth>> = {};
    for (const [monthKey, projects] of Object.entries(projectsByMonth)) {
      projectLookup[monthKey] = {};
      for (const proj of projects) {
        projectLookup[monthKey][proj.team.id] = proj;
      }
    }

    return { orderedTeamIds, projectLookup };
  }, [projectsByMonth, allTeams]);

  const today = new Date();

  const { activeCount, availableMembers, totalCount, upcomingAvailability } = useMemo(() => {
    const allMembers = allTeams.flatMap((t) => t.members.filter((m) => m.isActive));
    const unassigned = unassignedMembers.filter((m) => m.isActive);
    const seenIds = new Set<string>();
    const dedupedMembers = allMembers.filter((m) => {
      if (seenIds.has(m.id)) return false;
      seenIds.add(m.id);
      return true;
    });
    const totalCount = dedupedMembers.length + unassigned.length;

    const activeMemberIds = new Set<string>();
    const availabilityMap = new Map<string, { name: string; availableDate: string | null; teamName: string }>();

    for (const team of allTeams) {
      if (!team.startDate || !team.endDate) continue;
      const teamStart = new Date(team.startDate + "T00:00:00");
      const teamEnd = new Date(team.endDate + "T00:00:00");
      const todayMidnight = new Date();
      todayMidnight.setHours(0, 0, 0, 0);

      const isCurrentlyActive =
        !isBefore(todayMidnight, teamStart) && !isAfter(todayMidnight, teamEnd);

      for (const member of team.members.filter((m) => m.isActive)) {
        if (isCurrentlyActive) {
          activeMemberIds.add(member.id);
          if (!availabilityMap.has(member.id) || (availabilityMap.get(member.id)!.availableDate && team.endDate && team.endDate > availabilityMap.get(member.id)!.availableDate!)) {
            availabilityMap.set(member.id, {
              name: member.name,
              availableDate: team.endDate,
              teamName: team.name,
            });
          }
        }
      }
    }

    const availableMembers = [
      ...dedupedMembers.filter((m) => !activeMemberIds.has(m.id)),
      ...unassigned,
    ];

    const upcoming = Array.from(availabilityMap.values())
      .filter((e) => e.availableDate)
      .sort((a, b) => (a.availableDate! > b.availableDate! ? 1 : -1));

    return {
      activeCount: activeMemberIds.size,
      availableMembers,
      totalCount,
      upcomingAvailability: upcoming,
    };
  }, [allTeams, unassignedMembers]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground animate-pulse">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8 md:px-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MapIcon className="h-8 w-8 text-primary" />
            <h1 className="font-display text-4xl font-bold tracking-tight text-foreground md:text-5xl">
              <span className="text-gradient-primary">Roadmap</span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setWindowStart((prev) => addMonths(prev, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium text-foreground min-w-[180px] text-center">
              {windowLabel}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setWindowStart((prev) => addMonths(prev, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="ml-2 text-xs"
              onClick={() => setWindowStart(startOfMonth(new Date()))}
            >
              Today
            </Button>
          </div>
        </div>

        {/* Capacity Summary */}
        <div className="mb-6 rounded-xl bg-secondary px-6 py-4 shadow-lg">
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-secondary-foreground" />
              <span className="text-sm font-semibold text-secondary-foreground">Capacity</span>
            </div>
            <div className="flex items-center gap-4 text-sm text-secondary-foreground/90">
              <span>
                <span className="font-bold text-secondary-foreground">{activeCount}</span> active
              </span>
              <span className="h-3 w-px bg-secondary-foreground/30" />
              <span>
                <span className="font-bold text-secondary-foreground">{availableMembers.length}</span> available
              </span>
              <span className="h-3 w-px bg-secondary-foreground/30" />
              <span>
                <span className="font-bold text-secondary-foreground">{totalCount}</span> total
              </span>
            </div>
          </div>
        </div>

        {/* Month Grid */}
        {allTeams.length === 0 ? (
          <div className="rounded-lg border border-border border-dashed bg-card/50 p-10 text-center glow-card">
            <Calendar className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">No projects yet.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Create teams in Settings to get started.
            </p>
          </div>
        ) : (
          <div
            className="grid gap-x-4 gap-y-2"
            style={{
              gridTemplateColumns: `repeat(${MONTHS_VISIBLE}, minmax(0, 1fr))`,
              gridTemplateRows: `auto repeat(${orderedTeamIds.length}, auto)`,
            }}
          >
            {/* Row 1: Month headers */}
            {months.map((month, colIdx) => {
              const monthKey = format(month, "yyyy-MM");
              const isCurrentMonth = isSameMonth(month, today);
              return (
                <div
                  key={monthKey}
                  className={`rounded-lg px-3 py-2 text-center text-sm font-semibold transition-colors mb-1 ${
                    isCurrentMonth
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                  style={{ gridColumn: colIdx + 1, gridRow: 1 }}
                >
                  {formatMonthHeader(month)}
                </div>
              );
            })}

            {/* Project cells: one per (team, month) */}
            {orderedTeamIds.map((teamId, rowIdx) =>
              months.map((month, colIdx) => {
                const monthKey = format(month, "yyyy-MM");
                const proj = projectLookup[monthKey]?.[teamId];

                if (!proj) {
                  return (
                    <div
                      key={`${teamId}-${monthKey}`}
                      style={{ gridColumn: colIdx + 1, gridRow: rowIdx + 2 }}
                    />
                  );
                }

                const color = getProjectColor(proj.colorIndex);
                const activeMembers = proj.team.members.filter((m) => m.isActive);
                const slug = pilotNameToSlug(proj.team.name);
                const path = proj.colorIndex === 0 ? "/Pilots" : `/Pilots/${slug}`;
                const isInactive = !proj.team.isActive;

                return (
                  <Card
                    key={`${teamId}-${monthKey}`}
                    className={`border-l-4 ${color.border} ${color.bg} cursor-pointer transition-all hover:shadow-md ${isInactive ? "opacity-60" : ""}`}
                    style={{ gridColumn: colIdx + 1, gridRow: rowIdx + 2 }}
                    onClick={() => navigate(path)}
                  >
                    <CardContent className="p-2.5 space-y-1">
                      <div className="flex items-center flex-wrap gap-x-1 gap-y-0.5">
                        <span className={`text-sm font-bold leading-tight ${color.text}`}>
                          {proj.team.name}
                        </span>
                        <div className="flex items-center gap-1 ml-auto">
                          {proj.isStart && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-green-500/50 text-green-600 dark:text-green-400">
                              Starts
                            </Badge>
                          )}
                          {proj.isEnd && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-amber-500/50 text-amber-600 dark:text-amber-400">
                              Ends
                            </Badge>
                          )}
                          {activeMembers.slice(0, 3).map((m) => (
                            <Tooltip key={m.id}>
                              <TooltipTrigger asChild>
                                <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-muted text-[9px] font-medium text-muted-foreground ring-1 ring-border">
                                  {m.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="text-xs">
                                {m.name}
                              </TooltipContent>
                            </Tooltip>
                          ))}
                          {activeMembers.length > 3 && (
                            <span className="inline-flex items-center justify-center h-5 px-1.5 rounded-full bg-muted text-[9px] font-medium text-muted-foreground ring-1 ring-border">
                              +{activeMembers.length - 3}
                            </span>
                          )}
                        </div>
                      </div>

                      {proj.phaseLabel && (
                        <p className="text-xs text-muted-foreground leading-tight">
                          {proj.phaseLabel}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        )}

        {/* Availability Section */}
        {(upcomingAvailability.length > 0 || availableMembers.length > 0) && (
          <div className="mt-8 space-y-4">
            <div className="mb-4 rounded-xl bg-secondary px-6 py-4 shadow-lg">
              <h2 className="font-display text-xl font-bold tracking-tight text-primary">
                Team Availability
              </h2>
              <p className="text-sm text-white mt-0.5">
                When team members become available for the next project
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Currently Available */}
              {availableMembers.length > 0 && (
                <Card className="border-green-500/30 bg-green-50/50 dark:bg-green-950/20">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <UserCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
                      <span className="text-sm font-semibold text-green-700 dark:text-green-300">
                        Available Now
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {availableMembers.map((m) => (
                        <Badge key={m.id} variant="secondary" className="text-xs">
                          {m.name}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Upcoming Availability grouped by month */}
              {(() => {
                const grouped = new Map<string, { names: string[]; teamName: string }>();
                for (const entry of upcomingAvailability) {
                  const monthKey = formatAvailability(entry.availableDate);
                  if (!grouped.has(monthKey)) {
                    grouped.set(monthKey, { names: [], teamName: entry.teamName });
                  }
                  grouped.get(monthKey)!.names.push(entry.name);
                }

                return Array.from(grouped.entries()).map(([monthLabel, { names, teamName }]) => (
                  <Card key={monthLabel} className="border-border">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-semibold text-foreground">
                          {monthLabel}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">
                        Finishing <span className="font-medium text-foreground">{teamName}</span>
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {names.map((name) => (
                          <Badge key={name} variant="outline" className="text-xs">
                            {name}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ));
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Roadmap;
