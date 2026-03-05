import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { ChevronDown, ChevronRight, Clock, Activity, Trophy, Timer, DollarSign } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import type { DbSuperhex, DbMemberTeamHistory, DbRevxImpactValue } from "@/lib/database.types";

interface TeamBasic {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
}

interface MemberBasic {
  id: string;
  name: string;
}

interface DealCycleStats {
  avgDealCycle: number | null;
  avgCallToConnect: number | null;
  avgConnectToDemo: number | null;
  avgDemoToWin: number | null;
  avgActivitiesForDemo: number | null;
  avgActivitiesForWin: number | null;
  sampleSizeDealCycle: number;
  sampleSizeCallToConnect: number;
  sampleSizeConnectToDemo: number;
  sampleSizeDemoToWin: number;
  sampleSizeActivitiesForDemo: number;
  sampleSizeActivitiesForWin: number;
}

function daysBetween(a: string, b: string): number {
  return Math.abs(new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24);
}

function avg(arr: number[]): number | null {
  return arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
}

function computeDealCycleStats(rows: DbSuperhex[]): DealCycleStats {
  const dealCycleDays: number[] = [];
  const callToConnectDays: number[] = [];
  const connectToDemoDays: number[] = [];
  const demoToWinDays: number[] = [];
  const activitiesForDemo: number[] = [];
  const activitiesForWin: number[] = [];

  for (const row of rows) {
    if (row.first_call_date && row.win_date) {
      dealCycleDays.push(daysBetween(row.first_call_date, row.win_date));
    }
    if (row.first_call_date && row.first_connect_date) {
      callToConnectDays.push(daysBetween(row.first_call_date, row.first_connect_date));
    }
    if (row.first_connect_date && row.first_demo_date) {
      connectToDemoDays.push(daysBetween(row.first_connect_date, row.first_demo_date));
    }
    if (row.first_demo_date && row.win_date) {
      demoToWinDays.push(daysBetween(row.first_demo_date, row.win_date));
    }
    if (row.first_demo_date) {
      activitiesForDemo.push(row.total_activities ?? 0);
    }
    if (row.win_date) {
      activitiesForWin.push(row.total_activities ?? 0);
    }
  }

  return {
    avgDealCycle: avg(dealCycleDays),
    avgCallToConnect: avg(callToConnectDays),
    avgConnectToDemo: avg(connectToDemoDays),
    avgDemoToWin: avg(demoToWinDays),
    avgActivitiesForDemo: avg(activitiesForDemo),
    avgActivitiesForWin: avg(activitiesForWin),
    sampleSizeDealCycle: dealCycleDays.length,
    sampleSizeCallToConnect: callToConnectDays.length,
    sampleSizeConnectToDemo: connectToDemoDays.length,
    sampleSizeDemoToWin: demoToWinDays.length,
    sampleSizeActivitiesForDemo: activitiesForDemo.length,
    sampleSizeActivitiesForWin: activitiesForWin.length,
  };
}

function getFirstActivityDate(row: DbSuperhex): string | null {
  return row.first_activity_date || row.first_call_date || row.first_connect_date || row.first_demo_date || row.last_activity_date;
}

function mapRowToTeam(
  row: DbSuperhex,
  membersByName: Map<string, MemberBasic>,
  historyByMember: Map<string, DbMemberTeamHistory[]>,
): string | null {
  const member = membersByName.get(row.rep_name.toLowerCase().trim());
  if (!member) return null;

  const firstDate = getFirstActivityDate(row);
  if (!firstDate) return null;

  const activityTime = new Date(firstDate).getTime();
  const history = historyByMember.get(member.id) ?? [];

  for (const h of history) {
    const start = new Date(h.started_at).getTime();
    const end = h.ended_at ? new Date(h.ended_at).getTime() : Date.now();
    if (activityTime >= start && activityTime <= end) {
      return h.team_id;
    }
  }
  return null;
}

// For win attribution, use win_date (not first activity date) to find which
// team the rep was on when the win actually occurred.
function mapWinToTeam(
  row: DbSuperhex,
  membersByName: Map<string, MemberBasic>,
  historyByMember: Map<string, DbMemberTeamHistory[]>,
): string | null {
  if (!row.win_date) return null;

  const member = membersByName.get(row.rep_name.toLowerCase().trim());
  if (!member) return null;

  const winTime = new Date(row.win_date).getTime();
  const history = historyByMember.get(member.id) ?? [];

  for (const h of history) {
    const start = new Date(h.started_at).getTime();
    const end = h.ended_at ? new Date(h.ended_at).getTime() : Date.now();
    if (winTime >= start && winTime <= end) {
      return h.team_id;
    }
  }
  return null;
}

function fmtStat(v: number | null, suffix = ""): string {
  if (v === null) return "—";
  return v % 1 === 0 ? `${v.toLocaleString()}${suffix}` : `${v.toFixed(1)}${suffix}`;
}

export default function Data() {
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem("data-collapsed-sections");
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  });

  const [revxValues, setRevxValues] = useState<Record<string, string>>(() => {
    try {
      const stored = localStorage.getItem("data-revx-values");
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  });
  const [editingRevxTeam, setEditingRevxTeam] = useState<string | null>(null);
  const [revxSaving, setRevxSaving] = useState<Set<string>>(new Set());

  const [metricsData, setMetricsData] = useState<DbSuperhex[]>([]);
  const [members, setMembers] = useState<MemberBasic[]>([]);
  const [teamHistory, setTeamHistory] = useState<DbMemberTeamHistory[]>([]);
  const [teams, setTeams] = useState<TeamBasic[]>([]);
  const [selectedTeam, setSelectedTeam] = useState("all");
  const [loading, setLoading] = useState(true);

  const toggleSection = (key: string) =>
    setCollapsedSections((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem("data-collapsed-sections", JSON.stringify(next)); } catch {}
      return next;
    });

  useEffect(() => {
    async function load() {
      const [metricsRes, membersRes, historyRes, teamsRes, revxRes] = await Promise.all([
        supabase.from("superhex").select("*"),
        supabase.from("members").select("id, name"),
        supabase.from("member_team_history").select("*"),
        supabase.from("teams").select("id, name, start_date, end_date").is("archived_at", null).order("sort_order"),
        supabase.from("revx_impact_values").select("*"),
      ]);
      setMetricsData((metricsRes.data ?? []) as DbSuperhex[]);
      setMembers((membersRes.data ?? []) as MemberBasic[]);
      setTeamHistory((historyRes.data ?? []) as DbMemberTeamHistory[]);
      setTeams((teamsRes.data ?? []) as TeamBasic[]);

      // Seed revx values from Supabase, overriding any stale localStorage data
      const dbRevx = (revxRes.data ?? []) as DbRevxImpactValue[];
      if (dbRevx.length > 0) {
        const fromDb: Record<string, string> = {};
        for (const row of dbRevx) {
          fromDb[row.team_id] = row.value_per_win > 0 ? String(row.value_per_win) : "";
        }
        setRevxValues((prev) => {
          const merged = { ...prev, ...fromDb };
          try { localStorage.setItem("data-revx-values", JSON.stringify(merged)); } catch {}
          return merged;
        });
      }

      setLoading(false);
    }
    load();
  }, []);

  const membersByName = new Map<string, MemberBasic>();
  for (const m of members) {
    membersByName.set(m.name.toLowerCase().trim(), m);
  }

  const historyByMember = new Map<string, DbMemberTeamHistory[]>();
  for (const h of teamHistory) {
    const existing = historyByMember.get(h.member_id) ?? [];
    existing.push(h);
    historyByMember.set(h.member_id, existing);
  }

  const rowTeamMap = new Map<string, string | null>();
  for (const row of metricsData) {
    rowTeamMap.set(row.id, mapRowToTeam(row, membersByName, historyByMember));
  }

  const filteredRows = selectedTeam === "all"
    ? metricsData
    : metricsData.filter((row) => rowTeamMap.get(row.id) === selectedTeam);

  const stats = computeDealCycleStats(filteredRows);

  const winsByTeam = new Map<string, number>();
  for (const row of metricsData) {
    if (row.win_date) {
      const teamId = mapWinToTeam(row, membersByName, historyByMember);
      if (teamId) {
        winsByTeam.set(teamId, (winsByTeam.get(teamId) ?? 0) + 1);
      }
    }
  }
  const projectsWithWins = teams
    .map((t) => ({ team: t, wins: winsByTeam.get(t.id) ?? 0 }))
    .filter(({ wins }) => wins > 0);

  const updateRevxValue = (teamId: string, value: string) => {
    // Optimistic local update
    setRevxValues((prev) => {
      const next = { ...prev, [teamId]: value };
      try { localStorage.setItem("data-revx-values", JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const saveRevxValue = async (teamId: string, value: string) => {
    const numVal = parseFloat(value.replace(/,/g, ""));
    const valuePerWin = !isNaN(numVal) && numVal > 0 ? numVal : 0;
    setRevxSaving((s) => new Set(s).add(teamId));
    await supabase.from("revx_impact_values").upsert(
      { team_id: teamId, value_per_win: valuePerWin, updated_at: new Date().toISOString() },
      { onConflict: "team_id" }
    );
    setRevxSaving((s) => { const n = new Set(s); n.delete(teamId); return n; });
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8 md:px-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
            Data &amp; Findings
          </h1>
        </div>

        {/* ===== DEAL CYCLE ===== */}
        <div id="deal-cycle" className="scroll-mt-16">
          <div
            className="mb-5 rounded-xl bg-secondary px-6 py-4 shadow-lg cursor-pointer select-none"
            onClick={() => toggleSection("deal-cycle")}
          >
            <div className="flex items-center gap-2">
              {collapsedSections["deal-cycle"] ? (
                <ChevronRight className="h-5 w-5 text-primary shrink-0" />
              ) : (
                <ChevronDown className="h-5 w-5 text-primary shrink-0" />
              )}
              <h2 className="font-display text-2xl font-bold tracking-tight text-primary">
                ⏱️ Deal Averages
              </h2>
            </div>
          </div>

          {!collapsedSections["deal-cycle"] && (
            <div className="space-y-4">
              {/* Project filter */}
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-muted-foreground">Project:</span>
                <Select value={selectedTeam} onValueChange={setSelectedTeam}>
                  <SelectTrigger className="w-48 h-9 bg-card border-border text-foreground">
                    <SelectValue placeholder="All Projects" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Projects</SelectItem>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!loading && (
                  <span className="text-xs text-muted-foreground">
                    {filteredRows.length.toLocaleString()} records
                  </span>
                )}
              </div>

              {loading ? (
                <p className="text-muted-foreground py-4">Loading deal cycle data…</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <DealCycleCard
                    icon={<Timer className="h-5 w-5 text-primary" />}
                    label="Deal Cycle Avg"
                    value={fmtStat(stats.avgDealCycle)}
                    unit="days"
                    sample={stats.sampleSizeDealCycle}
                  />
                  <DealCycleCard
                    icon={<Clock className="h-5 w-5 text-primary" />}
                    label="Avg Call→Connect"
                    value={fmtStat(stats.avgCallToConnect)}
                    unit="days"
                    sample={stats.sampleSizeCallToConnect}
                  />
                  <DealCycleCard
                    icon={<Clock className="h-5 w-5 text-accent" />}
                    label="Avg Connect→Demo"
                    value={fmtStat(stats.avgConnectToDemo)}
                    unit="days"
                    sample={stats.sampleSizeConnectToDemo}
                  />
                  <DealCycleCard
                    icon={<Trophy className="h-5 w-5 text-primary" />}
                    label="Avg Demo→Win"
                    value={fmtStat(stats.avgDemoToWin)}
                    unit="days"
                    sample={stats.sampleSizeDemoToWin}
                  />
                  <DealCycleCard
                    icon={<Activity className="h-5 w-5 text-accent" />}
                    label="Avg Activities/Demo"
                    value={fmtStat(stats.avgActivitiesForDemo)}
                    unit=""
                    sample={stats.sampleSizeActivitiesForDemo}
                  />
                  <DealCycleCard
                    icon={<Activity className="h-5 w-5 text-primary" />}
                    label="Avg Activities/Win"
                    value={fmtStat(stats.avgActivitiesForWin)}
                    unit=""
                    sample={stats.sampleSizeActivitiesForWin}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* ===== REVX IMPACT ===== */}
        <div id="revx-impact" className="scroll-mt-16">
          <div
            className="mb-5 rounded-xl bg-secondary px-6 py-4 shadow-lg cursor-pointer select-none"
            onClick={() => toggleSection("revx-impact")}
          >
            <div className="flex items-center gap-2">
              {collapsedSections["revx-impact"] ? (
                <ChevronRight className="h-5 w-5 text-primary shrink-0" />
              ) : (
                <ChevronDown className="h-5 w-5 text-primary shrink-0" />
              )}
              <h2 className="font-display text-2xl font-bold tracking-tight text-primary">
                💰 RevX Impact (WIP)
              </h2>
            </div>
          </div>

          {!collapsedSections["revx-impact"] && (
            <div className="space-y-4">
              {loading ? (
                <p className="text-muted-foreground py-4">Loading impact data…</p>
              ) : projectsWithWins.length === 0 ? (
                <p className="text-muted-foreground py-4">No projects with wins yet.</p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Enter a deal value per win for each project to calculate total revenue impact.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {projectsWithWins.map(({ team, wins }) => {
                      const rawVal = revxValues[team.id] ?? "";
                      const numVal = parseFloat(rawVal.replace(/,/g, ""));
                      const total = !isNaN(numVal) && numVal > 0 ? wins * numVal : null;
                      const isEditing = editingRevxTeam === team.id;
                      return (
                        <div
                          key={team.id}
                          className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5 glow-card"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-display text-base font-bold text-foreground leading-tight">
                              {team.name}
                            </p>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {revxSaving.has(team.id) && (
                                <span className="text-[10px] text-muted-foreground animate-pulse">saving…</span>
                              )}
                              <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-sm font-bold text-primary">
                                {wins.toLocaleString()} {wins === 1 ? "win" : "wins"}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <DollarSign className="h-3.5 w-3.5 shrink-0" />
                            {isEditing ? (
                              <Input
                                autoFocus
                                type="text"
                                inputMode="numeric"
                                value={rawVal}
                                onChange={(e) => updateRevxValue(team.id, e.target.value)}
                                onBlur={() => { setEditingRevxTeam(null); saveRevxValue(team.id, rawVal); }}
                                onKeyDown={(e) => { if (e.key === "Enter") { setEditingRevxTeam(null); saveRevxValue(team.id, rawVal); } }}
                                placeholder="value per win"
                                className="h-5 w-28 text-xs bg-transparent border-none shadow-none p-0 focus-visible:ring-1 focus-visible:ring-primary/50"
                              />
                            ) : (
                              <span
                                className="cursor-pointer hover:underline text-xs min-w-[60px]"
                                onClick={() => setEditingRevxTeam(team.id)}
                              >
                                {rawVal ? `$${parseFloat(rawVal.replace(/,/g, "")).toLocaleString()} / win` : "click to set value / win"}
                              </span>
                            )}
                          </div>

                          {total !== null && (
                            <div className="mt-1 rounded-md bg-primary/10 px-3 py-2 text-center">
                              <p className="text-xs text-muted-foreground mb-0.5">Total Impact</p>
                              <p className="font-display text-xl font-bold text-primary">
                                ${total.toLocaleString()}
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {projectsWithWins.some(({ team }) => {
                    const v = parseFloat((revxValues[team.id] ?? "").replace(/,/g, ""));
                    return !isNaN(v) && v > 0;
                  }) && (
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex items-center justify-between">
                      <p className="font-display text-sm font-semibold text-foreground">Total RevX Impact</p>
                      <p className="font-display text-2xl font-bold text-primary">
                        ${projectsWithWins.reduce((sum, { team, wins }) => {
                          const v = parseFloat((revxValues[team.id] ?? "").replace(/,/g, ""));
                          return sum + (!isNaN(v) && v > 0 ? wins * v : 0);
                        }, 0).toLocaleString()}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

function DealCycleCard({
  icon,
  label,
  value,
  unit,
  sample,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  sample: number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 glow-card">
      {icon}
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-display text-lg font-bold text-foreground">
          {value}
          {unit && <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>}
        </p>
        <p className="text-[10px] text-muted-foreground">n={sample.toLocaleString()}</p>
      </div>
    </div>
  );
}
