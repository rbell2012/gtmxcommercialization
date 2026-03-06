import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { ChevronDown, ChevronRight, Clock, Activity, Trophy, Timer, DollarSign, ChevronsUpDown, Download } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
  if (!row.rep_name) return null;
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
  if (!row.win_date || !row.rep_name) return null;

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

type DataTypeKey = "activity" | "calls" | "connects" | "demos" | "wins" | "ops" | "feedback";

const DATA_TYPE_CONFIG: Record<DataTypeKey, { table: string; dateCol: string; label: string }> = {
  activity: { table: "metrics_activity", dateCol: "activity_date", label: "Activity" },
  calls: { table: "metrics_calls", dateCol: "call_date", label: "Calls" },
  connects: { table: "metrics_connects", dateCol: "connect_date", label: "Connects" },
  demos: { table: "metrics_demos", dateCol: "demo_date", label: "Demos" },
  wins: { table: "metrics_wins", dateCol: "win_date", label: "Wins" },
  ops: { table: "metrics_ops", dateCol: "op_created_date", label: "Ops" },
  feedback: { table: "metrics_feedback", dateCol: "feedback_date", label: "Feedback" },
};

const ALL_DATA_TYPES: DataTypeKey[] = ["activity", "calls", "connects", "demos", "wins", "ops", "feedback"];

interface TimeOption {
  key: string;
  label: string;
  start: string;
  end: string;
}

interface NormalizedRow {
  salesforce_accountid: string | null;
  account_name: string | null;
  date: string | null;
  type: DataTypeKey;
  rep_name: string;
  detail: string;
}

function normalizeRow(row: any, type: DataTypeKey): NormalizedRow {
  const dateCol = DATA_TYPE_CONFIG[type].dateCol;
  let detail = "";
  switch (type) {
    case "activity":
      detail = [row.activity_type, row.subject, row.activity_outcome].filter(Boolean).join(" · ");
      break;
    case "calls":
      detail = [row.call_type, row.subject, row.call_outcome].filter(Boolean).join(" · ");
      break;
    case "connects":
      detail = [row.connect_type, row.subject, row.connect_outcome].filter(Boolean).join(" · ");
      break;
    case "demos":
      detail = [row.demo_source, row.subject].filter(Boolean).join(" · ");
      break;
    case "wins":
      detail = [row.opportunity_name, row.opportunity_stage].filter(Boolean).join(" · ");
      break;
    case "ops":
      detail = [row.opportunity_name, row.opportunity_stage, row.opportunity_type].filter(Boolean).join(" · ");
      break;
    case "feedback":
      detail = [row.source, row.feedback].filter(Boolean).join(" · ");
      break;
  }
  return {
    salesforce_accountid: row.salesforce_accountid ?? null,
    account_name: row.account_name ?? null,
    date: row[dateCol] ?? null,
    type,
    rep_name: row.rep_name,
    detail,
  };
}

function downloadCsv(headers: string[], rows: string[][], filename: string) {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [headers.map(escape).join(",")];
  for (const row of rows) lines.push(row.map(escape).join(","));
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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

  const [testTimeMode, setTestTimeMode] = useState<"month" | "week">("month");
  const [testTimeValue, setTestTimeValue] = useState<string>("");
  const [testDataTypes, setTestDataTypes] = useState<Set<DataTypeKey>>(new Set(ALL_DATA_TYPES));
  const [testDetailMode, setTestDetailMode] = useState<"summary" | "detailed">("summary");
  const [testTeamOnly, setTestTeamOnly] = useState(false);
  const [testData, setTestData] = useState<Record<string, any[]>>({});
  const [testDataLoading, setTestDataLoading] = useState(false);

  const toggleSection = (key: string) =>
    setCollapsedSections((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem("data-collapsed-sections", JSON.stringify(next)); } catch {}
      return next;
    });

  useEffect(() => {
    async function load() {
      const [metricsRes, membersRes, historyRes, teamsRes, revxRes] = await Promise.all([
        supabase.from("superhex").select("*").limit(50000),
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

  const availableMonths = useMemo((): TimeOption[] => {
    if (teams.length === 0) return [];
    let minDate: Date | null = null;
    let maxDate: Date | null = null;
    for (const t of teams) {
      if (t.start_date) {
        const d = new Date(t.start_date + "T00:00:00");
        if (!minDate || d < minDate) minDate = d;
      }
      if (t.end_date) {
        const d = new Date(t.end_date + "T00:00:00");
        if (!maxDate || d > maxDate) maxDate = d;
      }
    }
    if (!minDate || !maxDate) return [];
    const months: TimeOption[] = [];
    const cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    const endMonth = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
    while (cursor <= endMonth) {
      const y = cursor.getFullYear();
      const m = cursor.getMonth();
      const key = `${y}-${String(m + 1).padStart(2, "0")}`;
      const label = cursor.toLocaleString("en-US", { month: "long", year: "numeric" });
      const lastDay = new Date(y, m + 1, 0).getDate();
      const start = `${y}-${String(m + 1).padStart(2, "0")}-01`;
      const end = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      months.push({ key, label, start, end });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return months;
  }, [teams]);

  const availableWeeks = useMemo((): TimeOption[] => {
    if (teams.length === 0) return [];
    let minDate: Date | null = null;
    let maxDate: Date | null = null;
    for (const t of teams) {
      if (t.start_date) {
        const d = new Date(t.start_date + "T00:00:00");
        if (!minDate || d < minDate) minDate = d;
      }
      if (t.end_date) {
        const d = new Date(t.end_date + "T00:00:00");
        if (!maxDate || d > maxDate) maxDate = d;
      }
    }
    if (!minDate || !maxDate) return [];
    const fmtISO = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const fmtShort = (d: Date) =>
      d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const start = new Date(minDate);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const weeks: TimeOption[] = [];
    const cursor = new Date(start);
    while (cursor <= maxDate) {
      const weekStart = new Date(cursor);
      const weekEnd = new Date(cursor);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weeks.push({
        key: fmtISO(weekStart),
        label: `${fmtShort(weekStart)} – ${fmtShort(weekEnd)}`,
        start: fmtISO(weekStart),
        end: fmtISO(weekEnd),
      });
      cursor.setDate(cursor.getDate() + 7);
    }
    return weeks;
  }, [teams]);

  useEffect(() => {
    if (testTimeValue) return;
    const now = new Date();
    if (testTimeMode === "month" && availableMonths.length > 0) {
      const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const match = availableMonths.find((m) => m.key === key);
      setTestTimeValue(match ? match.key : availableMonths[availableMonths.length - 1].key);
    } else if (testTimeMode === "week" && availableWeeks.length > 0) {
      const fmtISO = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const todayStr = fmtISO(now);
      const match = availableWeeks.find((w) => w.start <= todayStr && w.end >= todayStr);
      setTestTimeValue(match ? match.key : availableWeeks[availableWeeks.length - 1].key);
    }
  }, [testTimeMode, availableMonths, availableWeeks, testTimeValue]);

  const activeTimeOption = useMemo(() => {
    const options = testTimeMode === "month" ? availableMonths : availableWeeks;
    return options.find((o) => o.key === testTimeValue) ?? null;
  }, [testTimeMode, testTimeValue, availableMonths, availableWeeks]);

  const testDataTypesKey = useMemo(
    () => Array.from(testDataTypes).sort().join(","),
    [testDataTypes],
  );

  useEffect(() => {
    const types = testDataTypesKey.split(",").filter(Boolean) as DataTypeKey[];
    if (!activeTimeOption || types.length === 0) {
      setTestData({});
      return;
    }
    let cancelled = false;
    async function fetchTestData() {
      setTestDataLoading(true);
      const queries = types.map(async (type) => {
        const cfg = DATA_TYPE_CONFIG[type];
        const { data } = await supabase
          .from(cfg.table)
          .select("*")
          .gte(cfg.dateCol, activeTimeOption!.start)
          .lte(cfg.dateCol, activeTimeOption!.end)
          .limit(50000);
        return [type, data ?? []] as [string, any[]];
      });
      const results = await Promise.all(queries);
      if (!cancelled) {
        const newData: Record<string, any[]> = {};
        for (const [type, rows] of results) {
          newData[type] = rows;
        }
        setTestData(newData);
        setTestDataLoading(false);
      }
    }
    fetchTestData();
    return () => { cancelled = true; };
  }, [activeTimeOption, testDataTypesKey]);

  const activeTypes = useMemo(
    () => ALL_DATA_TYPES.filter((t) => testDataTypes.has(t)),
    [testDataTypes],
  );

  const memberNameSet = useMemo(() => {
    const s = new Set<string>();
    for (const m of members) s.add(m.name.toLowerCase().trim());
    return s;
  }, [members]);

  const filteredTestData = useMemo(() => {
    if (!testTeamOnly) return testData;
    const out: Record<string, any[]> = {};
    for (const [type, rows] of Object.entries(testData)) {
      out[type] = rows.filter((r) => memberNameSet.has((r.rep_name as string ?? "").toLowerCase().trim()));
    }
    return out;
  }, [testData, testTeamOnly, memberNameSet]);

  const testSummaryRows = useMemo(() => {
    if (activeTypes.length === 0) return [];
    const repMap = new Map<string, { counts: Record<DataTypeKey, number> }>();
    for (const type of activeTypes) {
      const rows = filteredTestData[type] ?? [];
      for (const row of rows) {
        const rep = (row.rep_name as string) ?? "Unknown";
        if (!repMap.has(rep)) {
          repMap.set(rep, {
            counts: Object.fromEntries(ALL_DATA_TYPES.map((t) => [t, 0])) as Record<DataTypeKey, number>,
          });
        }
        repMap.get(rep)!.counts[type]++;
      }
    }
    return Array.from(repMap.entries())
      .map(([rep, { counts }]) => ({ id: rep, name: rep, counts }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredTestData, activeTypes]);

  const testDetailedRows = useMemo(() => {
    if (activeTypes.length === 0) return [];
    const rows: NormalizedRow[] = [];
    for (const type of activeTypes) {
      for (const row of (filteredTestData[type] ?? [])) {
        rows.push(normalizeRow(row, type));
      }
    }
    return rows.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return b.date.localeCompare(a.date);
    });
  }, [filteredTestData, activeTypes]);

  const handleTestDataDownload = () => {
    if (testDetailMode === "summary") {
      const headers = ["Rep Name", ...activeTypes.map((t) => DATA_TYPE_CONFIG[t].label)];
      const rows = testSummaryRows.map((r) => [
        r.name,
        ...activeTypes.map((t) => String(r.counts[t])),
      ]);
      downloadCsv(headers, rows, "test-data-summary.csv");
    } else {
      const headers = ["Account Name", "Date", "Type", "Rep", "Details"];
      const rows = testDetailedRows.map((r) => [
        r.account_name ?? r.salesforce_accountid ?? "",
        r.date ?? "",
        DATA_TYPE_CONFIG[r.type].label,
        r.rep_name,
        r.detail,
      ]);
      downloadCsv(headers, rows, "test-data-detailed.csv");
    }
  };

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

        {/* ===== TEST DATA SELECTIONS ===== */}
        <div id="test-data" className="scroll-mt-16">
          <div
            className="mb-5 rounded-xl bg-secondary px-6 py-4 shadow-lg cursor-pointer select-none"
            onClick={() => toggleSection("test-data")}
          >
            <div className="flex items-center gap-2">
              {collapsedSections["test-data"] ? (
                <ChevronRight className="h-5 w-5 text-primary shrink-0" />
              ) : (
                <ChevronDown className="h-5 w-5 text-primary shrink-0" />
              )}
              <h2 className="font-display text-2xl font-bold tracking-tight text-primary flex-1">
                📊 Test Data Selections
              </h2>
              {!collapsedSections["test-data"] && (
                <button
                  title="Download CSV"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTestDataDownload();
                  }}
                  className="p-1.5 rounded-md hover:bg-primary/10 transition-colors"
                >
                  <Download className="h-5 w-5 text-primary" />
                </button>
              )}
            </div>
          </div>

          {!collapsedSections["test-data"] && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-4">
                {/* Time selection */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground">Time:</span>
                  <Select
                    value={testTimeMode}
                    onValueChange={(v) => {
                      setTestTimeMode(v as "month" | "week");
                      setTestTimeValue("");
                    }}
                  >
                    <SelectTrigger className="w-28 h-9 bg-card border-border text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="month">Month</SelectItem>
                      <SelectItem value="week">Week</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={testTimeValue} onValueChange={setTestTimeValue}>
                    <SelectTrigger className="w-60 h-9 bg-card border-border text-foreground">
                      <SelectValue placeholder={testTimeMode === "month" ? "Select month…" : "Select week…"} />
                    </SelectTrigger>
                    <SelectContent>
                      {(testTimeMode === "month" ? availableMonths : availableWeeks).map((o) => (
                        <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Data selection (multi-select) */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground">Data:</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-60 h-9 justify-between bg-card border-border text-foreground font-normal"
                      >
                        <span className="truncate">
                          {testDataTypes.size === ALL_DATA_TYPES.length
                            ? "All"
                            : testDataTypes.size === 0
                            ? "None selected"
                            : activeTypes.map((t) => DATA_TYPE_CONFIG[t].label).join(", ")}
                        </span>
                        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-2" align="start">
                      {ALL_DATA_TYPES.map((type) => (
                        <label
                          key={type}
                          className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-accent"
                        >
                          <Checkbox
                            checked={testDataTypes.has(type)}
                            onCheckedChange={(checked) => {
                              setTestDataTypes((prev) => {
                                const next = new Set(prev);
                                if (checked) next.add(type);
                                else next.delete(type);
                                return next;
                              });
                            }}
                          />
                          {DATA_TYPE_CONFIG[type].label}
                        </label>
                      ))}
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Detail mode */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground">Detail:</span>
                  <Select
                    value={testDetailMode}
                    onValueChange={(v) => setTestDetailMode(v as "summary" | "detailed")}
                  >
                    <SelectTrigger className="w-32 h-9 bg-card border-border text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="summary">Summary</SelectItem>
                      <SelectItem value="detailed">Detailed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Team only toggle */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground">Team Only:</span>
                  <Switch checked={testTeamOnly} onCheckedChange={setTestTeamOnly} />
                </div>
              </div>

              {testDataLoading ? (
                <p className="text-muted-foreground py-4">Loading test data…</p>
              ) : testDataTypes.size === 0 ? (
                <p className="text-muted-foreground py-4">Select at least one data type to view results.</p>
              ) : testDetailMode === "summary" ? (
                testSummaryRows.length === 0 ? (
                  <p className="text-muted-foreground py-4">No data found for the selected time range.</p>
                ) : (
                  <div className="rounded-lg border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-semibold">Rep Name</TableHead>
                          {activeTypes.map((type) => (
                            <TableHead key={type} className="font-semibold text-center">
                              {DATA_TYPE_CONFIG[type].label}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {testSummaryRows.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell className="font-medium">{row.name}</TableCell>
                            {activeTypes.map((type) => (
                              <TableCell key={type} className="text-center">
                                {row.counts[type]}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )
              ) : (
                testDetailedRows.length === 0 ? (
                  <p className="text-muted-foreground py-4">No data found for the selected time range.</p>
                ) : (
                  <div className="rounded-lg border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-semibold">Account Name</TableHead>
                          <TableHead className="font-semibold">Date</TableHead>
                          <TableHead className="font-semibold">Type</TableHead>
                          <TableHead className="font-semibold">Rep</TableHead>
                          <TableHead className="font-semibold">Details</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {testDetailedRows.map((row, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium">
                              {row.account_name ?? row.salesforce_accountid ?? "—"}
                            </TableCell>
                            <TableCell>{row.date ?? "—"}</TableCell>
                            <TableCell>
                              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                {DATA_TYPE_CONFIG[row.type].label}
                              </span>
                            </TableCell>
                            <TableCell>{row.rep_name}</TableCell>
                            <TableCell className="max-w-xs truncate text-muted-foreground">
                              {row.detail || "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )
              )}

              {!testDataLoading && testDataTypes.size > 0 && (
                <span className="text-xs text-muted-foreground">
                  {testDetailMode === "summary"
                    ? `${testSummaryRows.length.toLocaleString()} reps`
                    : `${testDetailedRows.length.toLocaleString()} records`}
                </span>
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
