import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo, memo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Trophy, Plus, Users, TrendingUp, TrendingDown, MessageCircle, Calendar, Handshake, Video, Activity, ChevronDown, ChevronRight, Scale, LockOpen, Lock, Zap, X, ChevronsUpDown, Check, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { useTeams, getTeamMembersForMonth, getHistoricalTeam, getHistoricalMember, type Team, type TeamMember, type MemberTeamHistoryEntry, type TeamGoalsHistoryEntry, type MemberGoalsHistoryEntry, type WinEntry, type FunnelData, type WeeklyFunnel, type WeeklyRole, type GoalMetric, type MemberGoals, GOAL_METRICS, GOAL_METRIC_LABELS, DEFAULT_GOALS, pilotNameToSlug, type SalesTeam, type ProjectTeamAssignment, type MetricsByWeekBundle, type PhaseCalcConfig } from "@/contexts/TeamsContext";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useChartColors } from "@/hooks/useChartColors";
import { useManagerInputs } from "@/hooks/useManagerInputs";
import { supabase } from "@/lib/supabase";
import { dbMutate } from "@/lib/supabase-helpers";
import { getMemberMetricTotal, getMemberLifetimeMetricTotal, getMemberAssignedMonths, getMemberLifetimeWins, getMemberLifetimeFunnelTotal, getScopedMetricTotal, getScopedAccountNames, getScopedTypeCounts, getScopedTypeNames, getEffectiveGoal, getPhaseWinsLabel, isMemberOnRelief, isMemberExcludedFromAccelerator, computeQuota, countTriggeredAccelerators, getTriggeredAcceleratorDetails, getAcceleratorProgress } from "@/lib/quota-helpers";
import { Tooltip as UiTooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { generateTestPhases, splitPhases, isCurrentMonth, phaseToDate, PHASE_LABEL_OPTIONS, isAllowedPhaseLabel, type ComputedPhase } from "@/lib/test-phases";
import { resolvePhaseCalcConfig, monthIndexForCalendarMonthKey, teamQualifiesForAttributedOpsWinsPath } from "@/lib/phase-calc-config";
import type { IndexedRowsByRepAndWeek, MetricExclusionMetric, MetricExclusionRow } from "@/lib/metric-exclusions";
import {
  filterRowsForTeamMetric,
  indexRowsByRepAndWeek,
  sumMetricForRepsInWeekWithExclusionsIndexed,
  sumMetricForRepsInWeekWithExclusions,
  teamWideMetricRulesOnly,
} from "@/lib/metric-exclusions";
import RichTextEditor, { RichTextDisplay } from "@/components/RichTextEditor";
import { AcceleratorConfigTooltip } from "@/components/AcceleratorConfigTooltip";
import {
  isPilotRegionPhaseLabel,
  resolvePilotAssignments,
  repsForSalesTeam,
  toMonthKey as pilotToMonthKey,
  getPilotWinsWithTargetBreakdown,
  countPilotOpsInMonth,
  countPilotDemosInMonth,
  countPilotLossesInMonth,
  getPilotKpiSnapshot,
  getPilotKpiSnapshotForWeek,
  getPilotAccountNamesForTeam,
  compareWow,
  sumMetricForRepsInWeek,
  tamSumForReps,
  pilotRepBreakdownWinsWithTarget,
  pilotRepBreakdownLossesInMonth,
  pilotSalesTeamShortLabel,
  filterByOpportunityFlag,
  filterByOpportunityFlagInverse,
  buildProspectingNotesAccountSets,
  sumWinsInWeekForReps,
  getPilotAvgPriceAllTime,
  countOpsWinsSplitForLifetimeStats,
  filterOpsRowsForLifetimeAttributedPath,
  countLifetimeOpsAdjustedSplit,
  countLifetimeDemosAdjustedSplit,
  type PilotKpiSnapshot,
  type WowTrend,
} from "@/lib/pilot-helpers";

const DEFAULT_ROLES = ["TOFU", "Closing", "No Funnel Activity"];

/** Stable empty array for GA phase (skip opportunity-name flag filtering). */
const NO_OPPORTUNITY_FLAGS: string[] = [];

function pilotWinsInWeek(
  metricsByWeek: MetricsByWeekBundle,
  winsDetailRows: Record<string, unknown>[] | undefined,
  team: Team,
  phaseLabels: Record<number, string>,
  phaseCalcByTeam: Record<string, Record<number, PhaseCalcConfig>>,
  isGAPhase: boolean,
  repKeys: Set<string>,
  weekKey: string,
  metricExclusions: MetricExclusionRow[],
): number {
  const weekMonthKey = weekKey.slice(0, 7);
  const monthIdx = monthIndexForCalendarMonthKey(team, phaseLabels, weekMonthKey);
  const base = resolvePhaseCalcConfig(team, monthIdx ?? undefined, phaseCalcByTeam);
  const flags = isGAPhase ? NO_OPPORTUNITY_FLAGS : base.opportunityFlags;
  const notes = base.prospectingNotes;
  if ((flags.length > 0 || notes.length > 0) && winsDetailRows && winsDetailRows.length > 0) {
    return sumWinsInWeekForReps(winsDetailRows, repKeys, weekKey, flags, notes, metricExclusions);
  }
  if (winsDetailRows && winsDetailRows.length > 0) {
    return sumMetricForRepsInWeekWithExclusions("wins", repKeys, weekKey, winsDetailRows, metricExclusions);
  }
  return sumMetricForRepsInWeek(metricsByWeek, "wins", repKeys, weekKey);
}

function sumFunnelMetricWithExclusions(
  metKey: keyof FunnelData,
  repKeys: Set<string>,
  weekKey: string,
  metricsByWeek: MetricsByWeekBundle,
  rawByMetric: Record<MetricExclusionMetric, Record<string, unknown>[] | undefined>,
  indexedByMetric: Record<MetricExclusionMetric, IndexedRowsByRepAndWeek | undefined>,
  metricExclusions: MetricExclusionRow[],
  options?: {
    team: Team;
    phaseLabels: Record<number, string>;
    phaseCalcByTeam: Record<string, Record<number, PhaseCalcConfig>>;
    prospectingLookupByKey?: Map<string, { accountIds: Set<string>; accountNames: Set<string> }>;
  },
): number {
  if (metKey === "tam") return 0;
  let rows = rawByMetric[metKey as MetricExclusionMetric];
  if (!rows) return sumMetricForRepsInWeek(metricsByWeek, metKey, repKeys, weekKey);
  let indexedRows = indexedByMetric[metKey as MetricExclusionMetric];
  if (options) {
    const monthKey = weekKey.slice(0, 7);
    const monthIdx = monthIndexForCalendarMonthKey(options.team, options.phaseLabels, monthKey);
    const phaseCfg = resolvePhaseCalcConfig(options.team, monthIdx ?? undefined, options.phaseCalcByTeam);
    const notes = phaseCfg.prospectingNotes;
    if (notes.length > 0 && options.prospectingLookupByKey) {
      const notesKey = notes.map((n) => n.toLowerCase().trim()).sort().join("||");
      const lookup = options.prospectingLookupByKey.get(notesKey);
      if (!lookup) {
        return sumMetricForRepsInWeekWithExclusions(metKey as MetricExclusionMetric, repKeys, weekKey, rows, metricExclusions);
      }
      if (metKey === "activity" || metKey === "calls" || metKey === "connects") {
        rows = rows.filter((r) => {
          const accountId = r.salesforce_accountid;
          return typeof accountId === "string" && lookup.accountIds.has(accountId);
        });
      } else if (metKey === "demos" || metKey === "feedback") {
        rows = rows.filter((r) => {
          const accountName = r.account_name;
          return typeof accountName === "string" && lookup.accountNames.has(accountName.toLowerCase());
        });
      }
      indexedRows = indexRowsByRepAndWeek(rows, metKey as MetricExclusionMetric);
    }
  }
  if (indexedRows) {
    return sumMetricForRepsInWeekWithExclusionsIndexed(
      metKey as MetricExclusionMetric,
      repKeys,
      weekKey,
      indexedRows,
      metricExclusions,
    );
  }
  return sumMetricForRepsInWeekWithExclusions(metKey as MetricExclusionMetric, repKeys, weekKey, rows, metricExclusions);
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}


function computeOverallProgress(startDate: string | null, endDate: string | null): number {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate + "T00:00:00").getTime();
  const end = new Date(endDate + "T00:00:00").getTime();
  const today = new Date().setHours(0, 0, 0, 0);
  if (today <= start) return 0;
  if (today >= end) return 100;
  return Math.round(((today - start) / (end - start)) * 100);
}

function formatDateRange(startDate: string | null, endDate: string | null): string | null {
  if (!startDate) return null;
  const fmt = (iso: string) => {
    const d = new Date(iso + "T00:00:00");
    const mon = d.toLocaleString("en-US", { month: "short" });
    const yr = String(d.getFullYear()).slice(2);
    return `${mon} '${yr}`;
  };
  const start = fmt(startDate);
  const end = endDate ? fmt(endDate) : null;
  return end ? `${start} – ${end}` : start;
}

const emptyFunnel: WeeklyFunnel = { tam: 0, calls: 0, connects: 0, ops: 0, demos: 0, wins: 0, feedback: 0, activity: 0 };

function getWeekKeys(count = 8): { key: string; label: string }[] {
  const weeks: { key: string; label: string }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i * 7);
    const mon = new Date(d);
    mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const key = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, "0")}-${String(mon.getDate()).padStart(2, "0")}`;
    const label = `${mon.getMonth() + 1}/${mon.getDate()}`;
    weeks.push({ key, label });
  }
  return weeks;
}

function getCurrentWeekKey(): string {
  return getWeekKeys(1)[0].key;
}

function getTeamWeekKeys(startDate: string | null, endDate: string | null): { key: string; label: string }[] {
  const toMonday = (d: Date): Date => {
    const m = new Date(d);
    m.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    m.setHours(0, 0, 0, 0);
    return m;
  };

  const currentMonday = toMonday(new Date());

  let startMon: Date;
  if (startDate) {
    startMon = toMonday(new Date(startDate + "T00:00:00"));
  } else {
    startMon = new Date(currentMonday);
    startMon.setDate(startMon.getDate() - 7 * 7);
  }

  let endMon = new Date(currentMonday);
  if (endDate) {
    const edMon = toMonday(new Date(endDate + "T00:00:00"));
    if (edMon < currentMonday) {
      endMon = edMon;
    }
  }

  const weeks: { key: string; label: string }[] = [];
  const cursor = new Date(startMon);
  while (cursor <= endMon) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    const label = `${cursor.getMonth() + 1}/${cursor.getDate()}`;
    weeks.push({ key, label });
    cursor.setDate(cursor.getDate() + 7);
  }

  return weeks;
}

const CHART_RANGE_OPTIONS = [
  { value: "4w", label: "4 Weeks" },
  { value: "8w", label: "8 Weeks" },
  { value: "12w", label: "12 Weeks" },
  { value: "26w", label: "6 Months" },
  { value: "all", label: "All" },
] as const;

type ChartRange = (typeof CHART_RANGE_OPTIONS)[number]["value"];

const CHART_RANGE_STORAGE_KEY = "funnel-chart-range";
const METRIC_COLORS: Record<string, string> = {
  TAM: "hsl(340, 55%, 55%)",
  Call: "hsl(215, 55%, 55%)",
  Connect: "hsl(140, 50%, 45%)",
  Ops: "hsl(30, 65%, 50%)",
  Demo: "hsl(280, 50%, 58%)",
  Win: "hsl(24, 85%, 55%)",
  Feedback: "hsl(190, 55%, 50%)",
  Activity: "hsl(60, 60%, 45%)",
};
const METRIC_KEYS: { key: keyof FunnelData; label: string }[] = [
  { key: "tam", label: "TAM" },
  { key: "activity", label: "Activity" },
  { key: "calls", label: "Call" },
  { key: "connects", label: "Connect" },
  { key: "ops", label: "Ops" },
  { key: "demos", label: "Demo" },
  { key: "wins", label: "Win" },
  { key: "feedback", label: "Feedback" },
];
const PLAYER_COLORS = [
  "hsl(350, 60%, 58%)",
  "hsl(180, 45%, 48%)",
  "hsl(45, 70%, 55%)",
  "hsl(300, 45%, 55%)",
  "hsl(160, 50%, 42%)",
];

function FunnelTooltipContent({ active, payload, label, chartColors }: any) {
  if (!active || !payload?.length) return null;
  const roles: Record<string, string> = payload[0]?.payload?._roles || {};
  return (
    <div style={{ backgroundColor: chartColors.tooltipBg, border: `1px solid ${chartColors.tooltipBorder}`, borderRadius: "8px", color: chartColors.tooltipText, padding: "10px 14px", fontSize: 12 }}>
      <p style={{ fontWeight: 600, marginBottom: 6 }}>{label}</p>
      {payload.filter((e: any) => !e.dataKey?.startsWith("_")).map((entry: any, i: number) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, margin: "2px 0" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: entry.color, display: "inline-block", flexShrink: 0 }} />
          <span>{entry.name}: <strong>{entry.value}</strong></span>
        </div>
      ))}
      {Object.keys(roles).length > 0 && (
        <div style={{ borderTop: `1px solid ${chartColors.tooltipBorder}`, marginTop: 6, paddingTop: 6 }}>
          <p style={{ fontSize: 10, opacity: 0.6, marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.05em" }}>Roles this week</p>
          {Object.entries(roles).map(([name, role]) => (
            <p key={name} style={{ margin: "2px 0" }}>{name}: <strong>{role as string}</strong></p>
          ))}
        </div>
      )}
    </div>
  );
}

function readChartRange(): ChartRange {
  try {
    const v = localStorage.getItem(CHART_RANGE_STORAGE_KEY);
    if (v && CHART_RANGE_OPTIONS.some((o) => o.value === v)) return v as ChartRange;
  } catch { /* SSR / private browsing */ }
  return "all";
}

function saveChartRange(v: ChartRange) {
  try { localStorage.setItem(CHART_RANGE_STORAGE_KEY, v); } catch { /* noop */ }
}

function fmtPilotMoney(n: number | null): string {
  if (n === null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function fmtPilotAttach(n: number | null): string {
  if (n === null || Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(0)}%`;
}

/** Rep name display: sentence-style words — first letter of each word capitalized, rest lowercase (e.g. ALL CAPS from CRM). */
function repNameToSentenceCase(name: string): string {
  const t = name.trim();
  if (!t) return name;
  return t
    .split(/\s+/)
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : ""))
    .join(" ");
}

/** Pilot Monthly Stats tooltips: "TOP" header then contributors with value > 0, sorted highest first, max 20. */
function top20PilotMonthlyStatBreakdown(arr: Array<{ label: string; value: number }>) {
  const rows = [...arr].filter((r) => r.value > 0).sort((a, b) => b.value - a.value).slice(0, 20);
  if (rows.length === 0) return undefined;
  return [{ label: "TOP", value: 0, isSectionLabel: true }, ...rows];
}

function WowArrow({ trend }: { trend: WowTrend }) {
  if (trend === "up") return <ArrowUp className="h-3.5 w-3.5 text-green-500 shrink-0 inline" aria-label="Up" />;
  if (trend === "down") return <ArrowDown className="h-3.5 w-3.5 text-red-400 shrink-0 inline" aria-label="Down" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground shrink-0 inline" aria-label="Flat" />;
}

function getMemberFunnel(m: TeamMember, weekKey: string): WeeklyFunnel {
  return m.funnelByWeek?.[weekKey] ?? { ...emptyFunnel };
}

function getCarriedTam(member: TeamMember, weekKey: string, orderedWeekKeys: string[]): number {
  const idx = orderedWeekKeys.indexOf(weekKey);
  if (idx === -1) return getMemberFunnel(member, weekKey).tam;
  for (let i = idx; i >= 0; i--) {
    const tam = getMemberFunnel(member, orderedWeekKeys[i]).tam;
    if (tam > 0) return tam;
  }
  return 0;
}

function getMemberTotalWins(m: TeamMember, referenceDate?: Date): number {
  const now = referenceDate ?? new Date();
  const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-`;
  return Object.entries(m.funnelByWeek || {}).reduce(
    (s, [weekKey, f]) => (weekKey.startsWith(prefix) ? s + f.wins : s),
    0
  );
}

function getTeamMonthKeys(teamWeeks: { key: string; label: string }[]): { key: string; label: string; weekKeys: string[]; colSpan: number }[] {
  const monthMap = new Map<string, { key: string; label: string; weekKeys: string[] }>();
  for (const w of teamWeeks) {
    const d = new Date(w.key + "T00:00:00");
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const monthLabel = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, { key: monthKey, label: monthLabel, weekKeys: [] });
    }
    monthMap.get(monthKey)!.weekKeys.push(w.key);
  }
  return Array.from(monthMap.values()).map((m) => ({ ...m, colSpan: m.weekKeys.length + 1 }));
}

type TableCol =
  | { type: "week"; key: string; label: string }
  | { type: "month"; key: string; label: string; weekKeys: string[] };

function buildInterleavedColumns(teamWeeks: { key: string; label: string }[]): TableCol[] {
  const cols: TableCol[] = [];
  let currentMonthKey = "";
  let currentMonthWeeks: string[] = [];
  let currentMonthLabel = "";

  for (let i = 0; i < teamWeeks.length; i++) {
    const w = teamWeeks[i];
    const d = new Date(w.key + "T00:00:00");
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

    if (currentMonthKey && monthKey !== currentMonthKey) {
      cols.push({ type: "month", key: currentMonthKey, label: currentMonthLabel, weekKeys: [...currentMonthWeeks] });
      currentMonthWeeks = [];
    }

    currentMonthKey = monthKey;
    currentMonthLabel = d.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
    cols.push({ type: "week", key: w.key, label: w.label });
    currentMonthWeeks.push(w.key);
  }

  if (currentMonthWeeks.length > 0) {
    cols.push({ type: "month", key: currentMonthKey, label: currentMonthLabel, weekKeys: [...currentMonthWeeks] });
  }

  return cols;
}

const Duck = ({ size = 24 }: { size?: number }) => (
  <span style={{ fontSize: size }} role="img" aria-label="duck">
    🦆
  </span>
);

const DuckCelebration = ({ memberName, onDone }: { memberName: string; onDone: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(onDone, 3000);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      <div className="animate-bounce text-center pointer-events-none">
        <div className="text-6xl mb-2">🦆</div>
        <p className="font-display text-2xl font-bold text-primary drop-shadow-lg">
          Great ducking job, {memberName}!
        </p>
        <div className="flex justify-center gap-2 mt-3">
          {[...Array(5)].map((_, i) => (
            <span
              key={i}
              className="text-3xl animate-pulse"
              style={{ animationDelay: `${i * 0.15}s` }}
            >
              🦆
            </span>
          ))}
        </div>
      </div>
      {[...Array(12)].map((_, i) => (
        <span
          key={`float-${i}`}
          className="absolute text-2xl pointer-events-none"
          style={{
            left: `${Math.random() * 90 + 5}%`,
            top: `${Math.random() * 90 + 5}%`,
            animation: `floatDuck ${1.5 + Math.random() * 2}s ease-in-out ${Math.random() * 0.5}s forwards`,
            opacity: 0,
          }}
        >
          🦆
        </span>
      ))}
    </div>
  );
};

const METRIC_BAR_COLORS: string[] = [
  "progress-bar-orange",
  "progress-bar-blue",
  "progress-bar-orange",
  "progress-bar-blue",
  "progress-bar-orange",
  "progress-bar-blue",
];

function PilotRegionsPicker({
  teamId,
  monthIndex,
  phaseLabel,
  isFirstGAMonth,
  isGAPhase,
  salesTeams,
  projectTeamAssignments,
  assignSalesTeam,
  unassignSalesTeam,
  updateExcludedMembers,
}: {
  teamId: string;
  monthIndex: number;
  phaseLabel: string;
  isFirstGAMonth: boolean;
  isGAPhase: boolean;
  salesTeams: SalesTeam[];
  projectTeamAssignments: ProjectTeamAssignment[];
  assignSalesTeam: (teamId: string, salesTeamId: string, monthIndex: number, excludedMembers?: string | null) => void;
  unassignSalesTeam: (teamId: string, salesTeamId: string, monthIndex: number) => void;
  updateExcludedMembers: (teamId: string, salesTeamId: string, monthIndex: number, excludedMembers: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [repDialogTeamId, setRepDialogTeamId] = useState<string | null>(null);
  const [pendingExcluded, setPendingExcluded] = useState<Set<string>>(new Set());
  const [excludedExpanded, setExcludedExpanded] = useState(false);
  const hasAutoAssigned = useRef(false);

  useEffect(() => {
    hasAutoAssigned.current = false;
    setExcludedExpanded(false);
  }, [teamId, monthIndex]);

  const assignmentsForMonth = projectTeamAssignments.filter(
    (a) => a.teamId === teamId && a.monthIndex === monthIndex
  );
  const assigned = assignmentsForMonth
    .map((a) => salesTeams.find((st) => st.id === a.salesTeamId))
    .filter((st): st is SalesTeam => st != null);
  const unassigned = salesTeams.filter(
    (st) => !assigned.some((a) => a.id === st.id)
  );

  useEffect(() => {
    if (!isGAPhase || salesTeams.length === 0) {
      hasAutoAssigned.current = false;
      return;
    }
    if (assignmentsForMonth.length > 0 || hasAutoAssigned.current) return;
    hasAutoAssigned.current = true;
    const nonRetail = salesTeams.filter(
      (st) => !st.displayName.toLowerCase().includes("retail"),
    );
    for (const st of nonRetail) {
      assignSalesTeam(teamId, st.id, monthIndex);
    }
  }, [isGAPhase, salesTeams, assignmentsForMonth.length, teamId, monthIndex, assignSalesTeam]);

  const previouslyAssigned = useMemo(() => {
    const ids = new Set<string>();
    for (const a of projectTeamAssignments) {
      if (a.teamId === teamId && a.monthIndex < monthIndex) ids.add(a.salesTeamId);
    }
    return ids;
  }, [projectTeamAssignments, teamId, monthIndex]);

  const lastMonthRegions = useMemo(() => {
    if (monthIndex <= 0) return [];
    const currentIds = new Set(assigned.map((st) => st.id));
    return projectTeamAssignments
      .filter((a) => a.teamId === teamId && a.monthIndex === monthIndex - 1 && !currentIds.has(a.salesTeamId))
      .map((a) => ({ salesTeamId: a.salesTeamId, excludedMembers: a.excludedMembers }));
  }, [projectTeamAssignments, teamId, monthIndex, assigned]);

  const addLastMonth = () => {
    for (const { salesTeamId, excludedMembers } of lastMonthRegions) {
      assignSalesTeam(teamId, salesTeamId, monthIndex, excludedMembers);
    }
  };

  const getAssignment = (salesTeamId: string) =>
    assignmentsForMonth.find((a) => a.salesTeamId === salesTeamId);

  const getExcludedSet = (assignment: ProjectTeamAssignment | undefined): Set<string> => {
    if (!assignment?.excludedMembers) return new Set();
    return new Set(assignment.excludedMembers.split(",").map((s) => s.trim()).filter(Boolean));
  };

  const openRepDialog = (st: SalesTeam) => {
    const assignment = getAssignment(st.id);
    setPendingExcluded(getExcludedSet(assignment));
    setRepDialogTeamId(st.id);
  };

  const repDialogTeam = repDialogTeamId ? salesTeams.find((st) => st.id === repDialogTeamId) : null;
  const repDialogMembers = repDialogTeam
    ? repDialogTeam.teamMembers.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const toggleMember = (name: string) => {
    setPendingExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const saveExcluded = () => {
    if (!repDialogTeamId) return;
    const excluded = pendingExcluded.size > 0 ? Array.from(pendingExcluded).join(", ") : null;
    updateExcludedMembers(teamId, repDialogTeamId, monthIndex, excluded);
    setRepDialogTeamId(null);
  };

  return (
    <div className="mb-4 rounded-lg border border-border bg-card p-4 glow-card">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-primary" />
          <h3 className="font-display text-sm font-semibold text-foreground">Pilot Regions</h3>
          <span className="text-[10px] text-muted-foreground">— {phaseLabel}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {monthIndex > 0 && (!isGAPhase || !isFirstGAMonth) && (
            <button
              onClick={addLastMonth}
              disabled={lastMonthRegions.length === 0}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-card disabled:hover:text-muted-foreground"
            >
              + last month
            </button>
          )}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              className="inline-flex items-center justify-between gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-[10px] text-muted-foreground hover:bg-muted/50 transition-colors w-[220px] disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={
                salesTeams.length === 0 ||
                (isGAPhase ? assigned.length === 0 : unassigned.length === 0)
              }
            >
              {salesTeams.length === 0
                ? "No regions available"
                : isGAPhase
                  ? assigned.length === 0
                    ? "No regions to exclude"
                    : "Exclude regions..."
                  : unassigned.length === 0
                    ? "All regions assigned"
                    : "Search regions..."}
              <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[220px] p-0" align="end">
            <Command>
              <CommandInput
                placeholder={isGAPhase ? "Search regions to exclude..." : "Search regions..."}
                className="h-8 text-[10px]"
              />
              <CommandList>
                <CommandEmpty className="py-2 text-center text-[10px]">No regions found.</CommandEmpty>
                <CommandGroup>
                  {(isGAPhase ? assigned : unassigned).map((st) => (
                    <CommandItem
                      key={st.id}
                      value={st.displayName}
                      onSelect={() => {
                        if (isGAPhase) {
                          unassignSalesTeam(teamId, st.id, monthIndex);
                        } else {
                          assignSalesTeam(teamId, st.id, monthIndex);
                        }
                        setOpen(false);
                      }}
                      className="text-[10px] cursor-pointer"
                    >
                      {st.displayName}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        </div>
      </div>
      <div className="flex items-center gap-3 mb-2">
        {!isGAPhase ? (
          <>
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="inline-block h-2 w-2 rounded-full border-2 border-emerald-500/50" /> New region
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="inline-block h-2 w-2 rounded-full border-2 border-orange-500/70" /> Partial team
            </span>
          </>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="inline-block h-2 w-2 rounded-full border-2 border-destructive/50" /> Excluded — click × to include again
          </span>
        )}
        {!isGAPhase && assigned.length > 0 && (
          <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">
            {assigned.reduce((sum, st) => sum + st.teamSize - getExcludedSet(getAssignment(st.id)).size, 0)} reps
          </span>
        )}
        {isGAPhase && unassigned.length > 0 && (
          <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">
            {unassigned.reduce((sum, st) => sum + st.teamSize, 0)} reps excluded
          </span>
        )}
      </div>
      {isGAPhase ? (
        unassigned.length === 0 ? (
          <p className="text-[10px] text-muted-foreground">No excluded regions</p>
        ) : (
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Excluded regions</span>
              <span className="text-[10px] text-muted-foreground">({unassigned.length})</span>
            </div>
            <div
              className={`flex flex-wrap gap-1.5 overflow-hidden transition-all ${excludedExpanded ? "" : "max-h-30"}`}
            >
              {unassigned.map((st) => (
                <span
                  key={st.id}
                  className="inline-flex items-center gap-1 rounded-full bg-muted/60 border border-destructive/40 px-2.5 py-0.5 text-xs font-medium text-foreground"
                >
                  <span className="text-xs font-medium text-foreground">{st.displayName}</span>
                  <button
                    type="button"
                    onClick={() => assignSalesTeam(teamId, st.id, monthIndex)}
                    className="rounded-full p-0.5 text-muted-foreground hover:bg-muted transition-colors"
                    aria-label={`Include ${st.displayName}`}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
            {unassigned.length > 10 && (
              <button
                type="button"
                onClick={() => setExcludedExpanded((v) => !v)}
                className="mt-2 w-full text-center text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                {excludedExpanded ? "Show less" : `Show more (${unassigned.length - 10} more)`}
              </button>
            )}
          </div>
        )
      ) : assigned.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">None</p>
      ) : (() => {
        const nbAssigned = assigned.filter((st) => !st.displayName.toLowerCase().includes("growth"));
        const growthAssigned = assigned.filter((st) => st.displayName.toLowerCase().includes("growth"));

        const renderChip = (st: SalesTeam) => {
          const isNew = !previouslyAssigned.has(st.id);
          const assignment = getAssignment(st.id);
          const excluded = getExcludedSet(assignment);
          const hasOverride = excluded.size > 0;
          const effectiveReps = st.teamSize - excluded.size;
          const borderClass = hasOverride
            ? "border-orange-500/70"
            : isNew
              ? "border-emerald-500/50"
              : "border-border";
          return (
            <span
              key={st.id}
              className={`inline-flex items-center gap-1 rounded-full bg-muted/60 border px-2.5 py-0.5 text-xs font-medium text-foreground ${borderClass}`}
            >
              <button
                type="button"
                onClick={() => openRepDialog(st)}
                className="hover:underline cursor-pointer bg-transparent border-none p-0 text-xs font-medium text-foreground"
              >
                {st.displayName}{hasOverride ? ` (${effectiveReps})` : ""}
              </button>
              <button
                onClick={() => unassignSalesTeam(teamId, st.id, monthIndex)}
                className={`rounded-full p-0.5 transition-colors ${isNew && !hasOverride ? "text-emerald-500 hover:bg-emerald-500/10" : hasOverride ? "text-orange-500 hover:bg-orange-500/10" : "text-muted-foreground hover:bg-muted"}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          );
        };

        const repsFor = (list: SalesTeam[]) =>
          list.reduce((sum, st) => sum + st.teamSize - getExcludedSet(getAssignment(st.id)).size, 0);

        return (
          <div className="space-y-3">
            {nbAssigned.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">New Business</span>
                  <span className="text-[10px] text-muted-foreground">({repsFor(nbAssigned)} reps)</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {nbAssigned.map(renderChip)}
                </div>
              </div>
            )}
            {growthAssigned.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Growth</span>
                  <span className="text-[10px] text-muted-foreground">({repsFor(growthAssigned)} reps)</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {growthAssigned.map(renderChip)}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      <Dialog open={repDialogTeamId !== null} onOpenChange={(v) => { if (!v) setRepDialogTeamId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">{repDialogTeam?.displayName}</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Select reps included in pilot
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2 py-2">
            {repDialogMembers.map((name) => {
              const isIncluded = !pendingExcluded.has(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggleMember(name)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                    isIncluded
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-muted/30 text-muted-foreground line-through"
                  }`}
                >
                  {name}
                </button>
              );
            })}
            {repDialogMembers.length === 0 && (
              <p className="text-xs text-muted-foreground">No team members listed for this region.</p>
            )}
          </div>
          <DialogFooter className="flex items-center justify-between sm:justify-between">
            <span className="text-xs text-muted-foreground">
              {repDialogMembers.length - pendingExcluded.size} of {repDialogMembers.length} reps selected
            </span>
            <Button size="sm" onClick={saveExcluded}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const Index = () => {
  const { pilotId } = useParams<{ pilotId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const {
    teams: allTeams,
    updateTeam,
    memberTeamHistory,
    teamGoalsHistory,
    memberGoalsHistory,
    allMembersById,
    reloadAll,
    loading: teamsLoading,
    salesTeams,
    projectTeamAssignments,
    assignSalesTeam,
    unassignSalesTeam,
    updateExcludedMembers,
    phaseLabels,
    phasePriorities,
    phaseCalcConfigs,
    updatePhaseLabel,
    updatePhasePriority,
    opsRows,
    demoRows,
    activityRows,
    callRows,
    connectRows,
    feedbackRows,
    superhexRows,
    tamRows,
    metricsByWeek,
    winsDetailRows,
    metricExclusionsByTeam,
  } = useTeams();
  const teams = allTeams.filter((t) => t.isActive);
  const {
    customRoles,
    addCustomRole,
  } = useManagerInputs();
  const [editingField, setEditingField] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem("collapsed-sections");
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  });
  const toggleSection = useCallback((key: string) =>
    setCollapsedSections((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem("collapsed-sections", JSON.stringify(next)); } catch {}
      return next;
    }), []);

  const resolvedTeam = pilotId
    ? teams.find((t) => pilotNameToSlug(t.name) === pilotId) ?? teams[0]
    : teams[0];
  const activeTab = resolvedTeam?.id ?? "";
  const [selectedMember, setSelectedMember] = useState("");
  const [restaurantName, setRestaurantName] = useState("");
  const [storyText, setStoryText] = useState("");
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [detailMember, setDetailMember] = useState<TeamMember | null>(null);
  const [celebration, setCelebration] = useState<string | null>(null);
  const [addRoleOpen, setAddRoleOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");

  const [selectedMonth, setSelectedMonth] = useState<Date | null>(null);
  const [previousExpanded, setPreviousExpanded] = useState(false);
  const [nextExpanded, setNextExpanded] = useState(false);
  const referenceDate = selectedMonth ?? undefined;

  useEffect(() => {
    if (teamsLoading) return;
    if (pilotId && !teams.find((t) => pilotNameToSlug(t.name) === pilotId)) {
      const firstSlug = teams[0] ? pilotNameToSlug(teams[0].name) : "home";
      navigate(`/${firstSlug}`, { replace: true });
    }
  }, [pilotId, teams, teamsLoading, navigate]);

  useEffect(() => {
    if (location.hash) {
      requestAnimationFrame(() => {
        const el = document.getElementById(location.hash.slice(1));
        el?.scrollIntoView({ behavior: "smooth" });
      });
    }
  }, [location.hash, activeTab]);

  const { toast } = useToast();

  const allRoles = [...DEFAULT_ROLES, ...customRoles];

  const activeTeam = teams.find((t) => t.id === activeTab);

  const teamLabels = phaseLabels[activeTeam?.id ?? ""] ?? {};
  const teamPriorities = phasePriorities[activeTeam?.id ?? ""] ?? {};
  const computedPhases = activeTeam
    ? generateTestPhases(activeTeam.startDate, activeTeam.endDate, teamLabels, teamPriorities)
    : [];
  const overallProgress = activeTeam
    ? computeOverallProgress(activeTeam.startDate, activeTeam.endDate)
    : 0;

  const activePhase = useMemo(() => {
    if (computedPhases.length === 0) return null;
    const anchor = selectedMonth ?? new Date();
    return computedPhases.find(
      (p) => p.year === anchor.getFullYear() && p.month === anchor.getMonth()
    ) ?? computedPhases[0];
  }, [computedPhases, selectedMonth]);

  const firstGAMonthIndex = useMemo(() => {
    const gaPhases = computedPhases.filter((p) => p.label === "GA / Commercial Lead");
    if (gaPhases.length === 0) return null;
    return Math.min(...gaPhases.map((p) => p.monthIndex));
  }, [computedPhases]);

  const isFirstGAMonth =
    activePhase?.label === "GA / Commercial Lead" &&
    activePhase?.monthIndex === firstGAMonthIndex;

  const isGAPhase = activePhase?.label === "GA / Commercial Lead";

  const extendTest = () => {
    if (!activeTeam?.endDate) return;
    const newEnd = addMonths(activeTeam.endDate, 1);
    updateTeam(activeTeam.id, (t) => ({ ...t, endDate: newEnd }));
  };

  const addRole = useCallback(() => {
    if (!newRoleName.trim() || allRoles.includes(newRoleName.trim())) return;
    addCustomRole(newRoleName.trim());
    setNewRoleName("");
    setAddRoleOpen(false);
  }, [newRoleName, allRoles, addCustomRole]);

  const addWin = () => {
    if (!selectedMember || !restaurantName.trim()) return;

    const member = activeTeam?.members.find((m) => m.id === selectedMember);
    if (!member) return;

    const winId = crypto.randomUUID();
    const entry: WinEntry = {
      id: winId,
      restaurant: restaurantName.trim(),
      story: storyText.trim() || undefined,
      date: new Date().toLocaleDateString(),
    };

    dbMutate(
      supabase
        .from("win_entries")
        .insert({
          id: winId,
          member_id: selectedMember,
          restaurant: entry.restaurant,
          story: entry.story ?? null,
        }),
      "add win entry",
    );

    const newWinCount = member.wins.length + 1;
    const prevMilestone = Math.floor(member.wins.length / 3);
    const newMilestone = Math.floor(newWinCount / 3);
    const earnedNewDuck = newMilestone > prevMilestone;

    updateTeam(activeTab, (team) => ({
      ...team,
      members: team.members.map((m) =>
        m.id === selectedMember
          ? {
              ...m,
              wins: [...m.wins, entry],
              ducksEarned: earnedNewDuck ? m.ducksEarned + (newMilestone - prevMilestone) : m.ducksEarned,
            }
          : m
      ),
    }));

    if (earnedNewDuck) {
      setCelebration(member.name);
      toast({
        title: "🦆 Great ducking job!",
        description: `${member.name} just earned duck #${newMilestone}!`,
      });
    }

    setSelectedMember("");
    setRestaurantName("");
    setStoryText("");
  };

  const addMember = () => {
    if (!newName.trim()) return;
    const memberId = crypto.randomUUID();
    const goals: MemberGoals = { ...DEFAULT_GOALS };
    const allExisting = allTeams.flatMap((t) => t.members);
    const nextOrder = allExisting.length > 0 ? Math.max(...allExisting.map((m) => m.sortOrder)) + 1 : 0;
    updateTeam(activeTab, (team) => ({
      ...team,
      members: [
        ...team.members,
        { id: memberId, name: newName.trim(), level: null, goals, wins: [], ducksEarned: 0, funnelByWeek: {}, monthlyMetrics: {}, monthlyWinTypes: {}, monthlyWinTypeNames: {}, monthlyOpsTypes: {}, monthlyOpsTypeNames: {}, metricAccountNames: {}, isActive: true, sortOrder: nextOrder, touchedAccountsByTeam: {}, touchedTam: 0 },
      ],
    }));
    dbMutate(
      supabase
        .from("members")
        .insert({
          id: memberId, name: newName.trim(),
          goal_calls: goals.calls, goal_ops: goals.ops,
          goal_demos: goals.demos, goal_wins: goals.wins,
          goal_feedback: goals.feedback, goal_activity: goals.activity,
          team_id: activeTab, ducks_earned: 0, is_active: true, sort_order: nextOrder,
        }),
      "add member",
    );
    setNewName("");
    setAddMemberOpen(false);
  };

  const handleBarClick = useCallback((data: any) => {
    const member = activeTeam?.members.find((m) => m.name === data.name);
    if (member) setDetailMember(member);
  }, [activeTeam]);

  return (
    <div className="min-h-screen bg-background px-4 py-8 md:px-8">
      {celebration && (
        <DuckCelebration memberName={celebration} onDone={() => setCelebration(null)} />
      )}
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <Trophy className="h-8 w-8 text-primary" />
          <h1 className="font-display text-4xl font-bold tracking-tight text-foreground md:text-5xl">
            GTMx <span className="text-gradient-primary">Pilots</span>
          </h1>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(val) => {
          const team = teams.find((t) => t.id === val);
          if (!team) return;
          navigate(`/${pilotNameToSlug(team.name)}`);
        }}>
          <TabsList className="mb-6 grid w-full bg-muted p-1 h-auto" style={{ gridTemplateColumns: `repeat(${teams.length}, minmax(0, 1fr))` }}>
            {teams.map((team) => {
              const total = team.members.reduce((s, m) => s + getMemberTotalWins(m, referenceDate), 0);
              return (
                <TabsTrigger
                  key={team.id}
                  value={team.id}
                  className="flex flex-col gap-0.5 py-2 font-display text-sm font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <span className="flex items-center gap-1.5 text-base">
                    {team.name}
                    {total > 0 && (
                      <span className="rounded-full bg-background/20 px-2 py-0.5 text-xs">
                        {total.toLocaleString()}
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-1 text-xs font-normal opacity-70" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                    <span>Owner:</span>
                    {editingField === `${team.id}-owner` ? (
                      <Input
                        autoFocus
                        value={team.owner}
                        onChange={(e) => {
                          e.stopPropagation();
                          updateTeam(team.id, (t) => ({ ...t, owner: e.target.value }));
                        }}
                        onBlur={() => setEditingField(null)}
                        onKeyDown={(e) => e.key === "Enter" && setEditingField(null)}
                        className="h-5 w-20 text-center text-xs bg-transparent border-none shadow-none p-0 focus-visible:ring-1 focus-visible:ring-primary/50"
                      />
                    ) : (
                      <span
                        className="cursor-pointer hover:underline min-w-[20px] text-center"
                        onClick={(e) => { e.stopPropagation(); setEditingField(`${team.id}-owner`); }}
                      >
                        {team.owner || "—"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs font-normal opacity-70" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                    <span>Lead rep:</span>
                    {editingField === `${team.id}-leadRep` ? (
                      <Input
                        autoFocus
                        value={team.leadRep}
                        onChange={(e) => {
                          e.stopPropagation();
                          updateTeam(team.id, (t) => ({ ...t, leadRep: e.target.value }));
                        }}
                        onBlur={() => setEditingField(null)}
                        onKeyDown={(e) => e.key === "Enter" && setEditingField(null)}
                        className="h-5 w-20 text-center text-xs bg-transparent border-none shadow-none p-0 focus-visible:ring-1 focus-visible:ring-primary/50"
                      />
                    ) : (
                      <span
                        className="cursor-pointer hover:underline min-w-[20px] text-center"
                        onClick={(e) => { e.stopPropagation(); setEditingField(`${team.id}-leadRep`); }}
                      >
                        {team.leadRep || "—"}
                      </span>
                    )}
                  </div>
                </TabsTrigger>
              );
            })}
          </TabsList>

        {/* ===== MANAGER INPUTS ===== */}
        <div
          id="manager-inputs"
          className="mb-5 rounded-xl bg-secondary px-6 py-4 shadow-lg scroll-mt-16 cursor-pointer select-none"
          onClick={() => toggleSection("manager-inputs")}
        >
          <div className="flex items-center gap-2">
            {collapsedSections["manager-inputs"] ? (
              <ChevronRight className="h-5 w-5 text-primary shrink-0" />
            ) : (
              <ChevronDown className="h-5 w-5 text-primary shrink-0" />
            )}
            <h2 className="font-display text-2xl font-bold tracking-tight text-primary">
              📋 Summary
            </h2>
          </div>
        </div>

        {!collapsedSections["manager-inputs"] && <>

        {/* Test Phases */}
        <div className="mb-4 rounded-lg border border-border bg-card p-5 glow-card">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold text-foreground">Test Phases</h3>
            <div className="flex items-center gap-3">
              {activeTeam?.endDate && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 border-border text-foreground hover:bg-muted text-xs"
                  onClick={extendTest}
                >
                  <Plus className="h-3.5 w-3.5" /> Extend the Test
                </Button>
              )}
              {computedPhases.length > 0 && (
                <span className="text-xs font-semibold text-primary tabular-nums">
                  {overallProgress}% Complete
                </span>
              )}
            </div>
          </div>
          {computedPhases.length > 0 ? (() => {
            const { previousPhases, visiblePhases, nextPhases } = splitPhases(computedPhases, selectedMonth ?? undefined);
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
            const colors = ["hsl(24, 80%, 53%)", "hsl(210, 65%, 50%)", "hsl(30, 80%, 50%)", "hsl(160, 50%, 48%)", "hsl(280, 50%, 55%)", "hsl(45, 70%, 52%)"];
            const colorClasses = ["text-primary", "text-accent", "text-primary", "text-accent", "text-primary", "text-accent"];
            return (
            <>
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
                      key={`bar-${phase.monthIndex}`}
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
                      <div className="h-full transition-all duration-500 ease-out" style={{ width: `${fillPct}%`, backgroundColor: colors[phase.monthIndex % colors.length] }} />
                      {!isLast && <div className="absolute right-0 top-0 h-full w-px bg-border z-[2]" />}
                    </div>
                  );
                })}
                {segments.map((seg, i) => {
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
                  return (
                    <div
                      key={`label-${phase.monthIndex}`}
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
                      <p className={`text-xs font-semibold ${phaseIsSelected ? "text-primary" : colorClasses[phase.monthIndex % colorClasses.length]}`}>{phase.monthLabel}</p>
                      <Select
                        value={isAllowedPhaseLabel(phase.label) ? phase.label : "__none__"}
                        onValueChange={(v) => updatePhaseLabel(activeTeam!.id, phase.monthIndex, v === "__none__" ? "" : v)}
                      >
                        <SelectTrigger
                          onClick={(e) => e.stopPropagation()}
                          className="h-auto min-h-6 w-full border-0 bg-transparent shadow-none text-xs text-muted-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary/50 py-0 [&>span]:flex [&>span]:flex-1 [&>span]:justify-center [&>span]:min-w-0 [&>span]:text-center"
                        >
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border z-50">
                          <SelectItem value="__none__" className="text-xs text-muted-foreground">—</SelectItem>
                          {PHASE_LABEL_OPTIONS.map((opt) => (
                            <SelectItem key={opt} value={opt} className="text-xs">
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <textarea
                        value={phase.priority}
                        onChange={(e) => {
                          updatePhasePriority(activeTeam!.id, phase.monthIndex, e.target.value);
                          e.target.style.height = "auto";
                          e.target.style.height = e.target.scrollHeight + "px";
                        }}
                        ref={(el) => {
                          if (el) {
                            el.style.height = "auto";
                            el.style.height = el.scrollHeight + "px";
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="—"
                        rows={1}
                        className="w-full text-xs text-center bg-transparent border-none shadow-none p-0 text-muted-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50 resize-none overflow-hidden"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        {getPhaseWinsLabel([activeTeam!], phase.year, phase.month, {
                          opsRows,
                          projectTeamAssignments,
                          salesTeams,
                          resolveTeamPhase: () => ({ monthIndex: phase.monthIndex, label: phase.label }),
                          phaseCalcByTeam: phaseCalcConfigs,
                        })}
                      </p>
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
            </>
            );
          })() : (
            <p className="text-sm text-muted-foreground text-center py-4">
              Set start and end dates in{" "}
              <a href="/settings" className="text-primary underline hover:text-primary/80">Settings</a>
              {" "}to view test phases.
            </p>
          )}
        </div>

        {/* Mission & Purpose */}
        {activeTeam && (
        <div className={`mb-4 rounded-lg border bg-card p-5 glow-card ${activeTeam.missionSubmitted ? 'border-primary/30 bg-primary/5' : 'border-border'}`}>
          <div className="flex items-center justify-between mb-4">
            <label className="font-display text-lg font-semibold text-foreground">Mission & Purpose of Test</label>
            <div className="flex items-center gap-2">
              {activeTeam.missionLastEdit && (
                <span className="text-[10px] text-muted-foreground">
                  last edit: {new Date(activeTeam.missionLastEdit).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" })}
                </span>
              )}
              {!activeTeam.missionSubmitted ? (
                <Button size="sm" onClick={() => updateTeam(activeTeam.id, (t) => ({ ...t, missionSubmitted: true, missionLastEdit: new Date().toISOString() }))} className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs h-8 px-4">
                  Submit
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => updateTeam(activeTeam.id, (t) => ({ ...t, missionSubmitted: false }))} className="text-xs h-7 border-border text-muted-foreground hover:text-foreground">
                  Edit
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 mb-4">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Revenue Lever</label>
              {activeTeam.missionSubmitted ? (
                <p className="text-sm text-foreground min-h-[1.5rem]">{activeTeam.revenueLever || <span className="text-muted-foreground/50 italic">—</span>}</p>
              ) : (
                <Select
                  value={activeTeam.revenueLever}
                  onValueChange={(value) => updateTeam(activeTeam.id, (t) => ({ ...t, revenueLever: value }))}
                >
                  <SelectTrigger className="bg-secondary/20 border-border text-foreground text-sm h-9">
                    <SelectValue placeholder="Select revenue lever" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Opp:Win">Opp:Win</SelectItem>
                    <SelectItem value="MRR/ARPU">MRR/ARPU</SelectItem>
                    <SelectItem value="New TAM">New TAM</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Business Goal</label>
              {activeTeam.missionSubmitted ? (
                <RichTextDisplay value={activeTeam.businessGoal} />
              ) : (
                <RichTextEditor
                  value={activeTeam.businessGoal}
                  onChange={(html) => updateTeam(activeTeam.id, (t) => ({ ...t, businessGoal: html }))}
                  placeholder="Describe the business goal..."
                  minHeight="60px"
                />
              )}
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">What We Are Testing</label>
              {activeTeam.missionSubmitted ? (
                <RichTextDisplay value={activeTeam.whatWeAreTesting} />
              ) : (
                <RichTextEditor
                  value={activeTeam.whatWeAreTesting}
                  onChange={(html) => updateTeam(activeTeam.id, (t) => ({ ...t, whatWeAreTesting: html }))}
                  placeholder="Describe what is being tested..."
                  minHeight="60px"
                />
              )}
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Executive Sponsor</label>
              {activeTeam.missionSubmitted ? (
                <RichTextDisplay value={activeTeam.executiveSponsor} />
              ) : (
                <RichTextEditor
                  value={activeTeam.executiveSponsor}
                  onChange={(html) => updateTeam(activeTeam.id, (t) => ({ ...t, executiveSponsor: html }))}
                  placeholder="Executive sponsor name"
                  minHeight="40px"
                />
              )}
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Executive Proxy</label>
              {activeTeam.missionSubmitted ? (
                <RichTextDisplay value={activeTeam.executiveProxy} />
              ) : (
                <RichTextEditor
                  value={activeTeam.executiveProxy}
                  onChange={(html) => updateTeam(activeTeam.id, (t) => ({ ...t, executiveProxy: html }))}
                  placeholder="Executive proxy name"
                  minHeight="40px"
                />
              )}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Product Description</label>
            {activeTeam.missionSubmitted ? (
              <RichTextDisplay value={activeTeam.missionPurpose} />
            ) : (
              <RichTextEditor
                value={activeTeam.missionPurpose}
                onChange={(html) => updateTeam(activeTeam.id, (t) => ({ ...t, missionPurpose: html }))}
                placeholder="Describe the product..."
                minHeight="80px"
              />
            )}
          </div>
        </div>
        )}

        {/* Signals */}
        {activeTeam && (
          <div className={`mb-4 rounded-lg border bg-card p-5 glow-card ${activeTeam.signalsSubmitted ? 'border-primary/30 bg-primary/5' : 'border-border'}`}>
            <div className="flex items-center justify-between mb-4">
              <label className="font-display text-lg font-semibold text-foreground">Signals</label>
              <div className="flex items-center gap-2">
                {activeTeam.signalsLastEdit && (
                  <span className="text-[10px] text-muted-foreground">
                    last edit: {new Date(activeTeam.signalsLastEdit).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" })}
                  </span>
                )}
                {!activeTeam.signalsSubmitted ? (
                  <Button
                    size="sm"
                    onClick={() => updateTeam(activeTeam.id, (t) => ({ ...t, signalsSubmitted: true, signalsLastEdit: new Date().toISOString() }))}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs h-8 px-4"
                  >
                    Submit
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateTeam(activeTeam.id, (t) => ({ ...t, signalsSubmitted: false }))}
                    className="text-xs h-7 border-border text-muted-foreground hover:text-foreground"
                  >
                    Edit
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 mb-4">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Top 3 objections</label>
                {activeTeam.signalsSubmitted ? (
                  <ol className="list-decimal pl-5 space-y-1">
                    {(activeTeam.topObjections ?? []).slice(0, 3).map((v, i) => (
                      <li key={i} className="text-sm text-foreground min-h-[1.5rem]">
                        {v || <span className="text-muted-foreground/50 italic">—</span>}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <ol className="list-decimal pl-5 space-y-2">
                    {(activeTeam.topObjections ?? ["", "", ""]).slice(0, 3).map((v, i) => (
                      <li key={i}>
                        <Input
                          value={v}
                          onChange={(e) => {
                            updateTeam(activeTeam.id, (t) => {
                              const next = [...t.topObjections];
                              next[i] = e.target.value;
                              return { ...t, topObjections: next };
                            });
                          }}
                          placeholder={`Objection ${i + 1}`}
                          className="bg-secondary/20 border-border text-foreground text-sm h-9"
                        />
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Biggest Risks</label>
                {activeTeam.signalsSubmitted ? (
                  <ol className="list-decimal pl-5 space-y-1">
                    {(activeTeam.biggestRisks ?? []).slice(0, 3).map((v, i) => (
                      <li key={i} className="text-sm text-foreground min-h-[1.5rem]">
                        {v || <span className="text-muted-foreground/50 italic">—</span>}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <ol className="list-decimal pl-5 space-y-2">
                    {(activeTeam.biggestRisks ?? ["", "", ""]).slice(0, 3).map((v, i) => (
                      <li key={i}>
                        <Input
                          value={v}
                          onChange={(e) => {
                            updateTeam(activeTeam.id, (t) => {
                              const next = [...t.biggestRisks];
                              next[i] = e.target.value;
                              return { ...t, biggestRisks: next };
                            });
                          }}
                          placeholder={`Risk ${i + 1}`}
                          className="bg-secondary/20 border-border text-foreground text-sm h-9"
                        />
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Onboarding Process</label>
                {activeTeam.signalsSubmitted ? (
                  <RichTextDisplay value={activeTeam.onboardingProcess} />
                ) : (
                  <RichTextEditor
                    value={activeTeam.onboardingProcess}
                    onChange={(html) => updateTeam(activeTeam.id, (t) => ({ ...t, onboardingProcess: html }))}
                    placeholder="Describe the onboarding process..."
                    minHeight="80px"
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {/* Pilot Regions + line item aggregation (same phase visibility) */}
        {activeTeam &&
          activePhase &&
          isPilotRegionPhaseLabel(activePhase.label) && (
            <>
              <PilotRegionsPicker
                teamId={activeTeam.id}
                monthIndex={activePhase.monthIndex}
                phaseLabel={activePhase.monthLabel}
                isFirstGAMonth={isFirstGAMonth ?? false}
                isGAPhase={isGAPhase}
                salesTeams={salesTeams}
                projectTeamAssignments={projectTeamAssignments}
                assignSalesTeam={assignSalesTeam}
                unassignSalesTeam={unassignSalesTeam}
                updateExcludedMembers={updateExcludedMembers}
              />
            </>
          )}

        {/* ── Lifetime Stats (entire test, not adjustable) ── */}
        {activeTeam && (() => {
          const members = activeTeam.members;
          const og = activeTeam.overallGoal;
          const lifetimePhaseSlices = computedPhases.map((p) => ({
            monthIndex: p.monthIndex,
            label: p.label,
            year: p.year,
            month: p.month,
          }));
          const pilotOpsFiltered = filterOpsRowsForLifetimeAttributedPath(
            opsRows,
            activeTeam,
            lifetimePhaseSlices,
            projectTeamAssignments,
            salesTeams,
            activeTeam.id,
            phaseCalcConfigs,
          );
          const pilotOpsForLifetimeAvgPrice =
            activePhase?.label === "GA / Commercial Lead" ? opsRows : pilotOpsFiltered;
          const attributedRep = activeTeam.attributedRepMemberId
            ? activeTeam.members.find((m) => m.id === activeTeam.attributedRepMemberId) ?? null
            : null;
          const monthIndicesForPath = computedPhases.map((p) => p.monthIndex);
          const hasOppWinsPath =
            teamQualifiesForAttributedOpsWinsPath(activeTeam, monthIndicesForPath, phaseCalcConfigs) &&
            attributedRep != null;
          const hasAnyOppFlags =
            monthIndicesForPath.some(
              (mi) => resolvePhaseCalcConfig(activeTeam, mi, phaseCalcConfigs).opportunityFlags.length > 0,
            ) || (activeTeam.overallGoal?.opportunityFlags?.length ?? 0) > 0;

          const winsSplit = hasOppWinsPath
            ? countOpsWinsSplitForLifetimeStats(
                opsRows,
                activeTeam,
                lifetimePhaseSlices,
                projectTeamAssignments,
                salesTeams,
                activeTeam.id,
                phaseCalcConfigs,
              )
            : { pilotPhaseWins: 0, otherPhaseWins: 0, total: 0 };
          const allowedMonthsByMember = new Map(
            members.map((m) => [m.id, getMemberAssignedMonths(m.id, activeTeam.id, memberTeamHistory, activeTeam.startDate)])
          );
          const allowedMonthsFor = (member: TeamMember) => allowedMonthsByMember.get(member.id);

          const lifetimeWins = hasOppWinsPath
            ? winsSplit.total
            : members.reduce((s, m) => s + getMemberLifetimeWins(m, allowedMonthsFor(m)), 0);

          const memberRepKeysLifetime = new Set(members.map((m) => m.name.toLowerCase().trim()));
          const lifetimeOpsSplit = hasAnyOppFlags
            ? countLifetimeOpsAdjustedSplit(
                opsRows,
                activeTeam,
                lifetimePhaseSlices,
                projectTeamAssignments,
                salesTeams,
                activeTeam.id,
                phaseCalcConfigs,
                memberRepKeysLifetime,
              )
            : null;
          const lifetimeDemosSplit = hasAnyOppFlags
            ? countLifetimeDemosAdjustedSplit(
                demoRows,
                lifetimePhaseSlices,
                projectTeamAssignments,
                salesTeams,
                activeTeam.id,
                memberRepKeysLifetime,
              )
            : null;

          const lifetimeOps = lifetimeOpsSplit
            ? lifetimeOpsSplit.total
            : members.reduce((s, m) => s + getMemberLifetimeMetricTotal(m, 'ops', allowedMonthsFor(m)), 0);
          const lifetimeDemos = lifetimeDemosSplit
            ? lifetimeDemosSplit.total
            : members.reduce((s, m) => s + getMemberLifetimeMetricTotal(m, 'demos', allowedMonthsFor(m)), 0);
          const lifetimeFeedback = members.reduce((s, m) => s + getMemberLifetimeMetricTotal(m, 'feedback', allowedMonthsFor(m)), 0);
          const lifetimeActivity = members.reduce((s, m) => s + getMemberLifetimeMetricTotal(m, 'activity', allowedMonthsFor(m)), 0);
          const lifetimeCalls = members.reduce((s, m) => s + getMemberLifetimeFunnelTotal(m, 'calls', allowedMonthsFor(m)), 0);
          const lifetimeConnects = members.reduce((s, m) => s + getMemberLifetimeFunnelTotal(m, 'connects', allowedMonthsFor(m)), 0);
          const lifetimeDemosF = members.reduce((s, m) => s + getMemberLifetimeFunnelTotal(m, 'demos', allowedMonthsFor(m)), 0);

          // Per-metric breakdowns for the hover tooltips
          const opsBreakdown = lifetimeOpsSplit
            ? [
                { label: "Pilot phases (members + assigned reps)", value: lifetimeOpsSplit.pilotLabeledMonths },
                { label: "Other phases (members only)", value: lifetimeOpsSplit.otherMonths },
              ]
            : members.map((m) => ({ label: m.name, value: getMemberLifetimeMetricTotal(m, "ops", allowedMonthsFor(m)) }));
          const demosBreakdown = lifetimeDemosSplit
            ? [
                { label: "Pilot phases (members + assigned reps)", value: lifetimeDemosSplit.pilotLabeledMonths },
                { label: "Other phases (members only)", value: lifetimeDemosSplit.otherMonths },
              ]
            : members.map((m) => ({ label: m.name, value: getMemberLifetimeMetricTotal(m, "demos", allowedMonthsFor(m)) }));
          const winsBreakdown = hasOppWinsPath && attributedRep
            ? [
                { label: "Pilot phases (assigned reps)", value: winsSplit.pilotPhaseWins },
                { label: "Other phases", value: winsSplit.otherPhaseWins },
              ]
            : members.map((m) => ({ label: m.name, value: getMemberLifetimeWins(m, allowedMonthsFor(m)) }));
          const feedbackBreakdown = members.map((m) => ({ label: m.name, value: getMemberLifetimeMetricTotal(m, "feedback", allowedMonthsFor(m)) }));
          const activityBreakdown = members.map((m) => ({ label: m.name, value: getMemberLifetimeMetricTotal(m, "activity", allowedMonthsFor(m)) }));

          // Per-member conversion rate breakdowns (numerator / denominator + percent)
          const callToConnectRates = members.map((m) => {
            const calls = getMemberLifetimeFunnelTotal(m, "calls", allowedMonthsFor(m));
            const connects = getMemberLifetimeFunnelTotal(m, "connects", allowedMonthsFor(m));
            const pct = calls > 0 ? (connects / calls) * 100 : 0;
            return { label: m.name, calls, connects, pct };
          });
          const connectToDemoRates = members.map((m) => {
            const connects = getMemberLifetimeFunnelTotal(m, "connects", allowedMonthsFor(m));
            const demos = getMemberLifetimeFunnelTotal(m, "demos", allowedMonthsFor(m));
            const pct = connects > 0 ? (demos / connects) * 100 : 0;
            return { label: m.name, connects, demos, pct };
          });
          const demoToWinRates = hasOppWinsPath && attributedRep
            ? [
                {
                  label: "Pilot + other phases",
                  demos: lifetimeDemosF,
                  wins: lifetimeWins,
                  pct: lifetimeDemosF > 0 ? (lifetimeWins / lifetimeDemosF) * 100 : 0,
                },
              ]
            : members.map((m) => {
                const demos = getMemberLifetimeFunnelTotal(m, "demos", allowedMonthsFor(m));
                const wins = getMemberLifetimeWins(m, allowedMonthsFor(m));
                const pct = demos > 0 ? (wins / demos) * 100 : 0;
                return { label: m.name, demos, wins, pct };
              });
          const showWinsGoal = og.winsEnabled && og.wins > 0;
          const showTotalPriceGoal = og.totalPriceEnabled && og.totalPrice > 0;
          const showDiscountThresholdGoal = og.discountThresholdEnabled && og.discountThreshold > 0;
          const showRealizedPriceGoal = og.realizedPriceEnabled && og.realizedPrice > 0;
          const showOverallGoal = showWinsGoal || showTotalPriceGoal || showDiscountThresholdGoal || showRealizedPriceGoal;
          const winsProgressPct = showWinsGoal ? Math.min(100, (lifetimeWins / og.wins) * 100) : 0;
          const callToConnectTotalPct = lifetimeCalls > 0 ? (lifetimeConnects / lifetimeCalls) * 100 : 0;
          const connectToDemoTotalPct = lifetimeConnects > 0 ? (lifetimeDemosF / lifetimeConnects) * 100 : 0;
          const demoToWinTotalPct = lifetimeDemosF > 0 ? (lifetimeWins / lifetimeDemosF) * 100 : 0;

          const pilotLifetimeCtx = isPilotRegionPhaseLabel(activePhase?.label ?? null)
            ? resolvePilotAssignments(projectTeamAssignments, salesTeams, activeTeam.id, activePhase?.monthIndex ?? 0)
            : null;
          const lifetimeLineTargets = resolvePhaseCalcConfig(
            activeTeam,
            activePhase?.monthIndex ?? undefined,
            phaseCalcConfigs,
          ).lineItemTargets;
          const lifetimeAvgPrice = pilotLifetimeCtx
            ? getPilotAvgPriceAllTime(pilotOpsForLifetimeAvgPrice, pilotLifetimeCtx.pilotRepNames, lifetimeLineTargets)
            : null;
          const discountThresholdCurrent =
            og.totalPrice > 0 && lifetimeAvgPrice != null
              ? 1 - lifetimeAvgPrice / og.totalPrice
              : null;

          const winsLifetimeTooltip = hasOppWinsPath
            ? "Lifetime wins = pilot phases + other phases. Pilot phases: closes in months labeled Sales Org Pilot / Recommendations / GA, counting only reps assigned to pilot regions that month. Other phases: all other qualifying closes (other months, non-assigned pilot months, or pilot months where the closer is not on the roster), plus closes outside the test window. Same opportunity flags and line-item rules apply."
            : "Total closed wins across all weeks of the test (summed from weekly funnel data).";

          return (
            <>
            <div className="mb-4 rounded-xl border-2 border-accent/30 bg-gradient-to-br from-card via-card to-accent/5 p-5">
              <div className="mb-3 flex items-center gap-2">
                <Trophy className="h-4 w-4 text-accent" />
                <h3 className="font-display text-sm font-bold uppercase tracking-wider text-accent">
                  Lifetime Stats
                </h3>
                <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-[10px] font-semibold text-accent">
                  Entire Test
                </span>
                {computedPhases.length > 0 && (() => {
                  const today = new Date();
                  const todayPhase = computedPhases.find(
                    (p) => p.year === today.getFullYear() && p.month === today.getMonth()
                  );
                  if (!todayPhase) return null;
                  return (
                    <span className="rounded-full bg-muted/30 px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      In month {todayPhase.monthIndex + 1} of {computedPhases.length}
                    </span>
                  );
                })()}
              </div>
              <div className="mb-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-3">
                <UiTooltip>
                  <TooltipTrigger asChild>
                    <div className="rounded-md bg-accent/5 border border-accent/10 py-2">
                      <p className="font-display text-lg font-bold text-foreground">{lifetimeCalls > 0 ? ((lifetimeConnects / lifetimeCalls) * 100).toFixed(0) : 0}%</p>
                      <p className="text-[10px] text-muted-foreground">Call→Connect</p>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[240px]">
                    <div className="space-y-2">
                      <p className="text-xs leading-relaxed">
                        % of calls that resulted in a live connection with a prospect. Calculated as: Connects ÷ Calls.
                      </p>
                      <div className="text-[11px] text-muted-foreground">
                        Total: {lifetimeConnects.toLocaleString()} ÷ {lifetimeCalls.toLocaleString()} ({callToConnectTotalPct.toFixed(0)}%)
                      </div>
                      <div className="h-px bg-accent/20" />
                      <div className="space-y-1 text-xs">
                        {callToConnectRates.map((r) => (
                          <div key={r.label} className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground truncate">{r.label}</span>
                            <span className="font-medium text-foreground whitespace-nowrap">
                              {r.connects.toLocaleString()}/{r.calls.toLocaleString()} ({r.pct.toFixed(0)}%)
                            </span>
                          </div>
                        ))}
                        <div className="pt-1 flex items-center justify-between gap-3 border-t border-accent/10">
                          <span className="font-semibold text-foreground">Total</span>
                          <span className="font-semibold text-accent whitespace-nowrap">
                            {lifetimeConnects.toLocaleString()}/{lifetimeCalls.toLocaleString()} ({callToConnectTotalPct.toFixed(0)}%)
                          </span>
                        </div>
                      </div>
                    </div>
                  </TooltipContent>
                </UiTooltip>
                <UiTooltip>
                  <TooltipTrigger asChild>
                    <div className="rounded-md bg-accent/5 border border-accent/10 py-2">
                      <p className="font-display text-lg font-bold text-accent">{lifetimeConnects > 0 ? ((lifetimeDemosF / lifetimeConnects) * 100).toFixed(0) : 0}%</p>
                      <p className="text-[10px] text-muted-foreground">Connect→Demo</p>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[240px]">
                    <div className="space-y-2">
                      <p className="text-xs leading-relaxed">
                        % of live connections that converted to a demo. Calculated as: Demos ÷ Connects.
                      </p>
                      <div className="text-[11px] text-muted-foreground">
                        Total: {lifetimeDemosF.toLocaleString()} ÷ {lifetimeConnects.toLocaleString()} ({connectToDemoTotalPct.toFixed(0)}%)
                      </div>
                      <div className="h-px bg-accent/20" />
                      <div className="space-y-1 text-xs">
                        {connectToDemoRates.map((r) => (
                          <div key={r.label} className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground truncate">{r.label}</span>
                            <span className="font-medium text-foreground whitespace-nowrap">
                              {r.demos.toLocaleString()}/{r.connects.toLocaleString()} ({r.pct.toFixed(0)}%)
                            </span>
                          </div>
                        ))}
                        <div className="pt-1 flex items-center justify-between gap-3 border-t border-accent/10">
                          <span className="font-semibold text-foreground">Total</span>
                          <span className="font-semibold text-accent whitespace-nowrap">
                            {lifetimeDemosF.toLocaleString()}/{lifetimeConnects.toLocaleString()} ({connectToDemoTotalPct.toFixed(0)}%)
                          </span>
                        </div>
                      </div>
                    </div>
                  </TooltipContent>
                </UiTooltip>
                <UiTooltip>
                  <TooltipTrigger asChild>
                    <div className="rounded-md bg-accent/5 border border-accent/10 py-2">
                      <p className="font-display text-lg font-bold text-foreground">{lifetimeDemosF > 0 ? ((lifetimeWins / lifetimeDemosF) * 100).toFixed(0) : 0}%</p>
                      <p className="text-[10px] text-muted-foreground">Demo→Win</p>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[240px]">
                    <div className="space-y-2">
                      <p className="text-xs leading-relaxed">
                        % of demos that resulted in a closed win. Calculated as: Wins ÷ Demos.
                      </p>
                      <div className="text-[11px] text-muted-foreground">
                        Total: {lifetimeWins.toLocaleString()} ÷ {lifetimeDemosF.toLocaleString()} ({demoToWinTotalPct.toFixed(0)}%)
                      </div>
                      <div className="h-px bg-accent/20" />
                      <div className="space-y-1 text-xs">
                        {demoToWinRates.map((r) => (
                          <div key={r.label} className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground truncate">{r.label}</span>
                            <span className="font-medium text-foreground whitespace-nowrap">
                              {r.wins.toLocaleString()}/{r.demos.toLocaleString()} ({r.pct.toFixed(0)}%)
                            </span>
                          </div>
                        ))}
                        <div className="pt-1 flex items-center justify-between gap-3 border-t border-accent/10">
                          <span className="font-semibold text-foreground">Total</span>
                          <span className="font-semibold text-accent whitespace-nowrap">
                            {lifetimeWins.toLocaleString()}/{lifetimeDemosF.toLocaleString()} ({demoToWinTotalPct.toFixed(0)}%)
                          </span>
                        </div>
                      </div>
                    </div>
                  </TooltipContent>
                </UiTooltip>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <StatCard
                  icon={<Handshake className="h-5 w-5 text-accent" />}
                  label="Ops"
                  value={lifetimeOps}
                  tooltip="Total number of opportunities (ops) opened across all weeks of the test."
                  breakdown={opsBreakdown}
                />
                <StatCard
                  icon={<Video className="h-5 w-5 text-primary" />}
                  label="Demos"
                  value={lifetimeDemos}
                  tooltip="Total demo records logged across all weeks of the test."
                  breakdown={demosBreakdown}
                />
                <StatCard
                  icon={<TrendingUp className="h-5 w-5 text-accent" />}
                  label="Wins"
                  value={lifetimeWins}
                  tooltip={winsLifetimeTooltip}
                  breakdown={winsBreakdown}
                />
                <StatCard
                  icon={<MessageCircle className="h-5 w-5 text-primary" />}
                  label="Feedback"
                  value={lifetimeFeedback}
                  tooltip="Total feedback interactions logged in Google Sheets across all weeks of the test."
                  breakdown={feedbackBreakdown}
                />
                <StatCard
                  icon={<Activity className="h-5 w-5 text-accent" />}
                  label="Activity"
                  value={lifetimeActivity}
                  tooltip="Total activity count (calls, emails, texts) logged across all weeks of the test."
                  breakdown={activityBreakdown}
                />
              </div>
            {showOverallGoal && (
              <div className="mt-3 border-t border-accent/10 pt-3 space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Overall Goal
                </p>
                <div className="space-y-3">
                  {showWinsGoal && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-medium text-foreground">Wins</span>
                        <span className="text-[11px] font-semibold text-accent">
                          {lifetimeWins.toLocaleString()} / {og.wins.toLocaleString()} ({winsProgressPct.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="h-1.5 rounded bg-muted/40 overflow-hidden">
                        <div className="h-full bg-accent" style={{ width: `${winsProgressPct}%` }} />
                      </div>
                    </div>
                  )}

                  {(showTotalPriceGoal || showDiscountThresholdGoal || showRealizedPriceGoal) && (
                    <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-3">
                      {showTotalPriceGoal && (
                        <div className="rounded-md bg-accent/5 border border-accent/10 py-2">
                          <p className="text-[10px] text-muted-foreground">Total Price</p>
                          <p className="font-display text-lg font-bold text-foreground">
                            ${og.totalPrice.toLocaleString()}
                          </p>
                        </div>
                      )}
                      {showDiscountThresholdGoal && (
                        <div className="rounded-md bg-accent/5 border border-accent/10 py-2">
                          <p className="text-[10px] text-muted-foreground">Discount %</p>
                          <p className={`font-display text-lg font-bold ${discountThresholdCurrent != null ? "text-accent" : "text-foreground"}`}>
                            {discountThresholdCurrent != null
                              ? `${(discountThresholdCurrent * 100).toFixed(1)}%`
                              : `${og.discountThreshold.toLocaleString()}%`}
                          </p>
                          {discountThresholdCurrent != null && (
                            <p className="text-[10px] text-muted-foreground">Goal: {og.discountThreshold.toLocaleString()}%</p>
                          )}
                        </div>
                      )}
                      {showRealizedPriceGoal && (
                        <div className="rounded-md bg-accent/5 border border-accent/10 py-2">
                          <p className="text-[10px] text-muted-foreground">Realized Price</p>
                          <p className="font-display text-lg font-bold text-foreground">
                            {lifetimeAvgPrice != null
                              ? `$${lifetimeAvgPrice.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
                              : `$${og.realizedPrice.toLocaleString()}`}
                          </p>
                          {lifetimeAvgPrice != null && (
                            <p className="text-[10px] text-muted-foreground">Goal: ${og.realizedPrice.toLocaleString()}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
            </div>
            </>
          );
        })()}

        {/* Total TAM — external metrics data if available, else manual input (hidden in GA / Commercial Lead) */}
        {activeTeam && !isGAPhase && (() => {
          const activeMembers = getTeamMembersForMonth(activeTeam, referenceDate, memberTeamHistory, allMembersById);
          const allowedMonthsByMember = new Map(
            activeMembers.map((m) => [m.id, getMemberAssignedMonths(m.id, activeTeam.id, memberTeamHistory, activeTeam.startDate)])
          );
          const allowedMonthsFor = (member: TeamMember) => allowedMonthsByMember.get(member.id);
          const hasMetricsTam = activeMembers.some((m) => m.touchedTam > 0);
          if (hasMetricsTam) {
            const teamTam = activeMembers.reduce((s, m) => s + m.touchedTam, 0);
            const teamTouched = activeMembers.reduce((s, m) => s + (m.touchedAccountsByTeam[activeTeam.id] ?? 0), 0);
            const teamActivity = activeMembers.reduce((s, m) => s + getMemberLifetimeMetricTotal(m, 'activity', allowedMonthsFor(m)), 0);
            const membersWithTam = activeMembers.filter((m) => m.touchedTam > 0);
            const avgTam = membersWithTam.length > 0 ? Math.round(teamTam / membersWithTam.length) : 0;
            const pctOfTam = Math.min(100, teamTam > 0 ? (teamTouched / teamTam) * 100 : 0);
            const avgTouchesAcct = teamTouched > 0 ? (teamActivity / teamTouched).toFixed(1) : '—';
            return (
              <div className="mb-8 rounded-lg border border-primary/30 bg-primary/5 bg-card p-5 glow-card">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-3">
                    <label className="font-display text-lg font-semibold text-foreground">Total TAM</label>
                    <span className="font-display text-2xl font-bold text-primary">{teamTam.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-muted-foreground">Avg TAM</label>
                    <span className="font-display text-2xl font-bold text-foreground">{avgTam.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-muted-foreground">% of TAM</label>
                    <span className="font-display text-2xl font-bold text-primary">{pctOfTam.toFixed(0)}%</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-muted-foreground">Avg Touches/Acct</label>
                    <span className="font-display text-2xl font-bold text-foreground">{avgTouchesAcct}</span>
                  </div>
                </div>
              </div>
            );
          }
          const fbTouched = activeMembers.reduce((s, m) => s + (m.touchedAccountsByTeam[activeTeam.id] ?? 0), 0);
          const fbActivity = activeMembers.reduce((s, m) => s + getMemberLifetimeMetricTotal(m, 'activity', allowedMonthsFor(m)), 0);
          const fbAvg = activeMembers.length > 0 ? Math.round((activeTeam.totalTam || 0) / activeMembers.length) : 0;
          const totalTam = activeTeam.totalTam || 0;
          const fbPctOfTam = Math.min(100, totalTam > 0 ? (fbTouched / totalTam) * 100 : 0);
          const fbAvgTouchesAcct = fbTouched > 0 ? (fbActivity / fbTouched).toFixed(1) : '—';
          return (
            <div className={`mb-8 rounded-lg border bg-card p-5 glow-card ${activeTeam.tamSubmitted ? 'border-primary/30 bg-primary/5' : 'border-border'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-3">
                    <label className="font-display text-lg font-semibold text-foreground">Total TAM</label>
                    <Input
                      type="number"
                      min={0}
                      value={activeTeam.totalTam || ""}
                      onChange={(e) => updateTeam(activeTeam.id, (t) => ({ ...t, totalTam: Math.max(0, parseInt(e.target.value) || 0) }))}
                      className="h-9 w-36 bg-secondary/20 border-border text-foreground text-sm"
                      placeholder="0"
                      disabled={activeTeam.tamSubmitted}
                    />
                    {activeTeam.tamSubmitted && <span className="text-xs font-medium text-primary">✅ Submitted</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-muted-foreground">Avg TAM</label>
                    <span className="font-display text-2xl font-bold text-foreground">{fbAvg.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-muted-foreground">% of TAM</label>
                    <span className="font-display text-2xl font-bold text-primary">{fbPctOfTam.toFixed(0)}%</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-muted-foreground">Avg Touches/Acct</label>
                    <span className="font-display text-2xl font-bold text-foreground">{fbAvgTouchesAcct}</span>
                  </div>
                </div>
                {!activeTeam.tamSubmitted ? (
                  <Button size="sm" onClick={() => {
                    const members = activeTeam.members.filter((m) => m.isActive);
                    const tamPerMember = members.length > 0 ? Math.round(activeTeam.totalTam / members.length) : 0;
                    const weekKey = getCurrentWeekKey();
                    updateTeam(activeTeam.id, (t) => ({
                      ...t,
                      tamSubmitted: true,
                      members: t.members.map((m) => {
                        if (!m.isActive) return m;
                        const existing = getMemberFunnel(m, weekKey);
                        return {
                          ...m,
                          funnelByWeek: {
                            ...m.funnelByWeek,
                            [weekKey]: { ...existing, tam: tamPerMember },
                          },
                        };
                      }),
                    }));
                    for (const m of members) {
                      const existing = getMemberFunnel(m, weekKey);
                      dbMutate(
                        supabase
                          .from("weekly_funnels")
                          .upsert(
                            {
                              member_id: m.id,
                              week_key: weekKey,
                              tam: tamPerMember,
                              calls: existing.calls,
                              connects: existing.connects,
                              ops: existing.ops,
                              demos: existing.demos,
                              wins: existing.wins,
                              feedback: existing.feedback,
                              activity: existing.activity,
                              role: existing.role ?? null,
                              submitted: existing.submitted ?? false,
                              submitted_at: existing.submittedAt ?? null,
                            },
                            { onConflict: "member_id,week_key" }
                          ),
                        "upsert TAM funnel",
                      );
                    }
                  }} className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs h-8 px-4">
                    Submit
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => updateTeam(activeTeam.id, (t) => ({ ...t, tamSubmitted: false }))} className="text-xs h-7 border-border text-muted-foreground hover:text-foreground">
                    Edit
                  </Button>
                )}
              </div>
            </div>
          );
        })()}



        </>}

        <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="font-display text-foreground">Add to {activeTeam?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              <Input placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} className="bg-secondary/20 border-border text-foreground placeholder:text-muted-foreground" />
              <Button onClick={addMember} className="w-full bg-primary text-primary-foreground hover:bg-primary/90">Add</Button>
            </div>
          </DialogContent>
        </Dialog>

          {teams.map((team) => {
            const teamLabels = phaseLabels[team.id] ?? {};
            const teamPriorities = phasePriorities[team.id] ?? {};
            const tabPhases = generateTestPhases(team.startDate, team.endDate, teamLabels, teamPriorities);
            const anchorMonth = selectedMonth ?? new Date();
            const phaseForMonth =
              tabPhases.find(
                (p) => p.year === anchorMonth.getFullYear() && p.month === anchorMonth.getMonth(),
              ) ?? tabPhases[0];
            const isPilotView = !!phaseForMonth && isPilotRegionPhaseLabel(phaseForMonth.label);
            const pilotMonthIndex = phaseForMonth?.monthIndex ?? 0;
            const isGAPhaseTab = phaseForMonth?.label === "GA / Commercial Lead";
            return (
            <TabsContent key={team.id} value={team.id}>
              <TeamTab
                team={getHistoricalTeam(team, referenceDate, teamGoalsHistory)}
                onAddMemberClick={() => {
                  navigate(`/${pilotNameToSlug(team.name)}`);
                  setAddMemberOpen(true);
                }}
                selectedMember={selectedMember}
                setSelectedMember={setSelectedMember}
                restaurantName={restaurantName}
                setRestaurantName={setRestaurantName}
                storyText={storyText}
                setStoryText={setStoryText}
                addWin={addWin}
                handleBarClick={handleBarClick}
                setDetailMember={setDetailMember}
                updateTeam={updateTeam}
                allRoles={allRoles}
                addRoleOpen={addRoleOpen}
                setAddRoleOpen={setAddRoleOpen}
                newRoleName={newRoleName}
                setNewRoleName={setNewRoleName}
                addRole={addRole}
                referenceDate={referenceDate}
                memberTeamHistory={memberTeamHistory}
                allMembersById={allMembersById}
                memberGoalsHistory={memberGoalsHistory}
                collapsedSections={collapsedSections}
                toggleSection={toggleSection}
                reloadAll={reloadAll}
                isPilotView={isPilotView}
                isGAPhase={isGAPhaseTab}
                pilotMonthIndex={pilotMonthIndex}
                opsRows={opsRows}
                demoRows={demoRows}
                activityRows={activityRows}
                callRows={callRows}
                connectRows={connectRows}
                feedbackRows={feedbackRows}
                superhexRows={superhexRows}
                tamRows={tamRows}
                metricsByWeek={metricsByWeek}
                winsDetailRows={winsDetailRows}
                metricExclusionsByTeam={metricExclusionsByTeam}
                salesTeams={salesTeams}
                projectTeamAssignments={projectTeamAssignments}
                phaseLabels={teamLabels}
                phaseCalcConfigs={phaseCalcConfigs}
              />
            </TabsContent>
            );
          })}
        </Tabs>


        <Dialog open={!!detailMember} onOpenChange={(open) => !open && setDetailMember(null)}>
          <DialogContent className="bg-card border-border max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display text-foreground">
                {detailMember?.name}'s Wins ({detailMember?.wins.length})
                {detailMember && detailMember.ducksEarned > 0 && (
                  <span className="ml-2">
                    {[...Array(detailMember.ducksEarned)].map((_, i) => (
                      <span key={i}>🦆</span>
                    ))}
                  </span>
                )}
              </DialogTitle>
            </DialogHeader>
            {detailMember && detailMember.wins.length > 0 ? (
              <div className="space-y-2 pt-2">
                {detailMember.wins.map((w) => (
                  <div key={w.id} className="rounded-md bg-secondary/30 px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-primary">{w.restaurant}</span>
                      <span className="text-xs text-muted-foreground">{w.date}</span>
                    </div>
                    {w.story && <p className="mt-1 text-sm text-foreground/70">{w.story}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="pt-2 text-sm text-muted-foreground">No wins yet — get out there!</p>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

const TeamTab = memo(function TeamTab({
  team,
  onAddMemberClick,
  selectedMember,
  setSelectedMember,
  restaurantName,
  setRestaurantName,
  storyText,
  setStoryText,
  addWin,
  handleBarClick,
  setDetailMember,
  updateTeam,
  allRoles,
  addRoleOpen,
  setAddRoleOpen,
  newRoleName,
  setNewRoleName,
  addRole,
  referenceDate,
  memberTeamHistory,
  allMembersById,
  memberGoalsHistory,
  collapsedSections,
  toggleSection,
  reloadAll,
  isPilotView,
  isGAPhase,
  pilotMonthIndex,
  opsRows,
  demoRows,
  tamRows,
  metricsByWeek,
  winsDetailRows,
  activityRows,
  callRows,
  connectRows,
  feedbackRows,
  superhexRows,
  metricExclusionsByTeam,
  salesTeams,
  projectTeamAssignments,
  phaseLabels,
  phaseCalcConfigs,
}: {
  team: Team;
  onAddMemberClick: () => void;
  selectedMember: string;
  setSelectedMember: (v: string) => void;
  restaurantName: string;
  setRestaurantName: (v: string) => void;
  storyText: string;
  setStoryText: (v: string) => void;
  addWin: () => void;
  handleBarClick: (data: any) => void;
  setDetailMember: (m: TeamMember | null) => void;
  updateTeam: (teamId: string, updater: (team: Team) => Team) => void;
  allRoles: string[];
  addRoleOpen: boolean;
  setAddRoleOpen: (v: boolean) => void;
  newRoleName: string;
  setNewRoleName: (v: string) => void;
  addRole: () => void;
  referenceDate?: Date;
  memberTeamHistory: MemberTeamHistoryEntry[];
  allMembersById: Map<string, TeamMember>;
  memberGoalsHistory: MemberGoalsHistoryEntry[];
  collapsedSections: Record<string, boolean>;
  toggleSection: (key: string) => void;
  reloadAll: () => Promise<void>;
  isPilotView: boolean;
  isGAPhase: boolean;
  pilotMonthIndex: number;
  opsRows: Record<string, unknown>[];
  demoRows: Record<string, unknown>[];
  tamRows: Record<string, unknown>[];
  metricsByWeek: MetricsByWeekBundle;
  winsDetailRows: Record<string, unknown>[];
  activityRows: Record<string, unknown>[];
  callRows: Record<string, unknown>[];
  connectRows: Record<string, unknown>[];
  feedbackRows: Record<string, unknown>[];
  superhexRows: Record<string, unknown>[];
  metricExclusionsByTeam: Record<string, MetricExclusionRow[]>;
  salesTeams: SalesTeam[];
  projectTeamAssignments: ProjectTeamAssignment[];
  phaseLabels: Record<number, string>;
  phaseCalcConfigs: Record<string, Record<number, PhaseCalcConfig>>;
}) {

  const funnelDebounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const currentWeek = getCurrentWeekKey();
  const members = team.members;
  const activeMembers = useMemo(
    () => getTeamMembersForMonth(team, referenceDate, memberTeamHistory, allMembersById),
    [team, referenceDate, memberTeamHistory, allMembersById],
  );
  const teamTotal = useMemo(
    () => members.reduce((s, m) => s + getMemberTotalWins(m, referenceDate), 0),
    [members, referenceDate],
  );
  const teamWeeks = useMemo(() => getTeamWeekKeys(team.startDate, team.endDate), [team.startDate, team.endDate]);
  const interleavedCols = useMemo(() => buildInterleavedColumns(teamWeeks), [teamWeeks]);
  const [repOverrideWeek, setRepOverrideWeek] = useState(currentWeek);
  const isPastWeek = repOverrideWeek < currentWeek;
  const [unlockedPastEdits, setUnlockedPastEdits] = useState<Set<string>>(new Set());
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editDialogName, setEditDialogName] = useState("");
  const [editDialogTarget, setEditDialogTarget] = useState<{ memberId: string; weekKey: string } | null>(null);
  const [copiedMetricKey, setCopiedMetricKey] = useState<string | null>(null);
  const [forceOpenKey, setForceOpenKey] = useState<string | null>(null);

  type PilotTeamSortCol = "team" | "avgMrrWithout" | "avgMrrWith" | "avgPrice" | "attachRate";
  const [pilotTeamSortCol, setPilotTeamSortCol] = useState<PilotTeamSortCol>("team");
  const [pilotTeamSortDir, setPilotTeamSortDir] = useState<"asc" | "desc">("asc");
  const handlePilotTeamSort = (col: PilotTeamSortCol) => {
    if (col === pilotTeamSortCol) {
      setPilotTeamSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setPilotTeamSortCol(col);
      setPilotTeamSortDir("asc");
    }
  };

  const [gaExtraTeamIds, setGaExtraTeamIds] = useState<Set<string>>(() => new Set());
  const [gaFunnelSelectedIds, setGaFunnelSelectedIds] = useState<Set<string>>(() => new Set());
  const [gaGoalsSearchOpen, setGaGoalsSearchOpen] = useState(false);
  useEffect(() => {
    setGaExtraTeamIds(new Set());
    setGaFunnelSelectedIds(new Set());
  }, [team.id, pilotMonthIndex, isGAPhase]);

  const confirmEditSubmission = () => {
    if (!editDialogName.trim() || !editDialogTarget) return;
    const { memberId, weekKey } = editDialogTarget;
    const member = team.members.find((x) => x.id === memberId)!;
    const funnelData = getMemberFunnel(member, weekKey);
    const wasSubmitted = funnelData.submitted;

    if (wasSubmitted) {
      updateTeam(team.id, (t) => ({
        ...t,
        members: t.members.map((mem) =>
          mem.id === memberId
            ? {
                ...mem,
                funnelByWeek: {
                  ...mem.funnelByWeek,
                  [weekKey]: {
                    ...getMemberFunnel(mem, weekKey),
                    submitted: false,
                    submittedAt: undefined,
                  },
                },
              }
            : mem
        ),
      }));
      dbMutate(
        supabase
          .from("weekly_funnels")
          .upsert(
            {
              member_id: memberId,
              week_key: weekKey,
              tam: funnelData.tam,
              calls: funnelData.calls,
              connects: funnelData.connects,
              ops: funnelData.ops,
              demos: funnelData.demos,
              wins: funnelData.wins,
              feedback: funnelData.feedback,
              activity: funnelData.activity,
              role: funnelData.role ?? null,
              submitted: false,
              submitted_at: null,
            },
            { onConflict: "member_id,week_key" }
          ),
        "unlock funnel",
      );
    }

    setUnlockedPastEdits((prev) => new Set(prev).add(`${memberId}:${weekKey}`));

    dbMutate(
      supabase
        .from("funnel_edit_log")
        .insert({ member_id: memberId, week_key: weekKey, edited_by: editDialogName.trim() }),
      "log funnel edit",
    );
    setEditDialogOpen(false);
    setEditDialogTarget(null);
  };

  const weeklyScrollRef = useRef<HTMLDivElement>(null);
  const playerColRef = useRef<HTMLTableCellElement>(null);
  const [playerColW, setPlayerColW] = useState(0);

  useLayoutEffect(() => {
    if (playerColRef.current) {
      setPlayerColW(playerColRef.current.offsetWidth);
    }
  });

  useEffect(() => {
    if (weeklyScrollRef.current) {
      weeklyScrollRef.current.scrollLeft = weeklyScrollRef.current.scrollWidth;
    }
  }, [team.startDate, team.endDate]);

  const recentWeeks = useMemo(() => getWeekKeys(2), []);
  const prevWeekKey = recentWeeks[0].key;
  const currWeekKey = recentWeeks[1].key;
  const currWeekWins = members.reduce((s, m) => s + getMemberFunnel(m, currWeekKey).wins, 0);
  const prevWeekWins = members.reduce((s, m) => s + getMemberFunnel(m, prevWeekKey).wins, 0);
  const teamDucks = members.reduce((s, m) => s + m.ducksEarned, 0);
  const teamTotalFeedback = activeMembers.reduce((s, m) => s + getMemberMetricTotal(m, 'feedback', referenceDate), 0);
  const teamTotalActivity = activeMembers.reduce((s, m) => s + getMemberMetricTotal(m, 'activity', referenceDate), 0);
  const monthlyWinsBreakdown = useMemo(() => activeMembers.map((m) => ({ label: m.name, value: getMemberTotalWins(m, referenceDate) })), [activeMembers, referenceDate]);
  const monthlyFeedbackBreakdown = useMemo(() => activeMembers.map((m) => ({ label: m.name, value: getMemberMetricTotal(m, "feedback", referenceDate) })), [activeMembers, referenceDate]);
  const monthlyActivityBreakdown = useMemo(() => activeMembers.map((m) => ({ label: m.name, value: getMemberMetricTotal(m, "activity", referenceDate) })), [activeMembers, referenceDate]);

  const chartData = useMemo(() => members.map((m) => ({
    name: m.name,
    wins: getMemberTotalWins(m, referenceDate),
  })), [members, referenceDate]);

  const allStories = useMemo(
    () =>
      members
        .flatMap((m) => m.wins.filter((w) => w.story).map((w) => ({ ...w, memberName: m.name })))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [members],
  );

  const phaseCalcForPilot = resolvePhaseCalcConfig(team, pilotMonthIndex, phaseCalcConfigs);
  const lineItemTargets = phaseCalcForPilot.lineItemTargets;
  const opportunityFlags = phaseCalcForPilot.opportunityFlags;
  const effectiveOppFlags = isGAPhase ? NO_OPPORTUNITY_FLAGS : opportunityFlags;
  const funnelMetricEx = useMemo(
    () => teamWideMetricRulesOnly(metricExclusionsByTeam[team.id] ?? []),
    [metricExclusionsByTeam, team.id],
  );
  const opsRowsForExclusions = useMemo(
    () => filterRowsForTeamMetric(opsRows, funnelMetricEx, "ops"),
    [opsRows, funnelMetricEx],
  );
  const demoRowsForPilot = useMemo(
    () => filterRowsForTeamMetric(demoRows, funnelMetricEx, "demos"),
    [demoRows, funnelMetricEx],
  );
  const monthKeyPilot = pilotToMonthKey(referenceDate ?? new Date());
  const memberRepKeysMonthly = useMemo(
    () => new Set(activeMembers.map((m) => m.name.toLowerCase().trim())),
    [activeMembers],
  );
  const teamTotalOps = useMemo(() => {
    if (!isPilotView && opportunityFlags.length > 0) {
      const filtered = filterByOpportunityFlag(opsRowsForExclusions, opportunityFlags);
      return countPilotOpsInMonth(filtered, memberRepKeysMonthly, monthKeyPilot);
    }
    return activeMembers.reduce((s, m) => s + getMemberMetricTotal(m, "ops", referenceDate), 0);
  }, [
    isPilotView,
    opportunityFlags,
    opsRowsForExclusions,
    memberRepKeysMonthly,
    monthKeyPilot,
    activeMembers,
    referenceDate,
  ]);
  const teamTotalDemos = useMemo(() => {
    if (!isPilotView && opportunityFlags.length > 0) {
      return countPilotDemosInMonth(demoRowsForPilot, memberRepKeysMonthly, monthKeyPilot);
    }
    return activeMembers.reduce((s, m) => s + getMemberMetricTotal(m, "demos", referenceDate), 0);
  }, [
    isPilotView,
    opportunityFlags,
    demoRowsForPilot,
    memberRepKeysMonthly,
    monthKeyPilot,
    activeMembers,
    referenceDate,
  ]);
  const monthlyOpsBreakdown = useMemo(() => {
    if (!isPilotView && opportunityFlags.length > 0) {
      const filtered = filterByOpportunityFlag(opsRowsForExclusions, opportunityFlags);
      return activeMembers.map((m) => {
        const rk = m.name.toLowerCase().trim();
        return {
          label: m.name,
          value: countPilotOpsInMonth(filtered, new Set([rk]), monthKeyPilot),
        };
      });
    }
    return activeMembers.map((m) => ({ label: m.name, value: getMemberMetricTotal(m, "ops", referenceDate) }));
  }, [
    isPilotView,
    opportunityFlags,
    opsRowsForExclusions,
    activeMembers,
    monthKeyPilot,
    referenceDate,
  ]);
  const monthlyDemosBreakdown = useMemo(() => {
    if (!isPilotView && opportunityFlags.length > 0) {
      return activeMembers.map((m) => {
        const rk = m.name.toLowerCase().trim();
        return {
          label: m.name,
          value: countPilotDemosInMonth(demoRowsForPilot, new Set([rk]), monthKeyPilot),
        };
      });
    }
    return activeMembers.map((m) => ({ label: m.name, value: getMemberMetricTotal(m, "demos", referenceDate) }));
  }, [isPilotView, opportunityFlags, demoRowsForPilot, activeMembers, monthKeyPilot, referenceDate]);
  const pilotOpsForKpis = useMemo(
    () => filterByOpportunityFlag(opsRowsForExclusions, effectiveOppFlags),
    [opsRowsForExclusions, effectiveOppFlags],
  );
  const pilotOpsWithoutForKpis = useMemo(
    () => filterByOpportunityFlagInverse(opsRowsForExclusions, effectiveOppFlags),
    [opsRowsForExclusions, effectiveOppFlags],
  );
  const pilotAttachOpts = useMemo(
    () => ({
      denomOpsRows: phaseCalcForPilot.attachRateDenom === "all_wins" ? opsRowsForExclusions : undefined,
      attachDenomMode: phaseCalcForPilot.attachRateDenom,
    }),
    [opsRowsForExclusions, phaseCalcForPilot.attachRateDenom],
  );
  const rawRowsByFunnelMetric = useMemo(
    (): Record<MetricExclusionMetric, Record<string, unknown>[] | undefined> => ({
      activity: activityRows,
      calls: callRows,
      connects: connectRows,
      demos: demoRows,
      ops: opsRows,
      wins: winsDetailRows,
      feedback: feedbackRows,
    }),
    [activityRows, callRows, connectRows, demoRows, opsRows, winsDetailRows, feedbackRows],
  );
  const indexedRawRowsByFunnelMetric = useMemo(
    (): Record<MetricExclusionMetric, IndexedRowsByRepAndWeek | undefined> => ({
      activity: indexRowsByRepAndWeek(activityRows, "activity"),
      calls: indexRowsByRepAndWeek(callRows, "calls"),
      connects: indexRowsByRepAndWeek(connectRows, "connects"),
      demos: indexRowsByRepAndWeek(demoRows, "demos"),
      ops: indexRowsByRepAndWeek(opsRows, "ops"),
      wins: indexRowsByRepAndWeek(winsDetailRows, "wins"),
      feedback: indexRowsByRepAndWeek(feedbackRows, "feedback"),
    }),
    [activityRows, callRows, connectRows, demoRows, opsRows, winsDetailRows, feedbackRows],
  );
  const prospectingFilterOptions = useMemo(
    () => {
      const lookups = new Map<string, { accountIds: Set<string>; accountNames: Set<string> }>();
      const notesSets = new Set<string>();
      const addNotes = (notes: string[] | undefined) => {
        if (!notes || notes.length === 0) return;
        const key = notes.map((n) => n.toLowerCase().trim()).sort().join("||");
        if (!key) return;
        notesSets.add(key);
      };
      addNotes(resolvePhaseCalcConfig(team, undefined, phaseCalcConfigs).prospectingNotes);
      for (const cfg of Object.values(phaseCalcConfigs[team.id] ?? {})) addNotes(cfg.prospectingNotes);
      for (const key of notesSets) {
        const notes = key.split("||").filter(Boolean);
        lookups.set(key, buildProspectingNotesAccountSets(superhexRows, notes));
      }
      return {
        team,
        phaseLabels,
        phaseCalcByTeam: phaseCalcConfigs,
        prospectingLookupByKey: lookups,
      };
    },
    [team, phaseLabels, phaseCalcConfigs, superhexRows],
  );
  const pilotCtx = useMemo(() => {
    if (!isPilotView) return null;
    return resolvePilotAssignments(projectTeamAssignments, salesTeams, team.id, pilotMonthIndex);
  }, [isPilotView, projectTeamAssignments, salesTeams, team.id, pilotMonthIndex]);

  const pilotKpis = useMemo(() => {
    if (!isPilotView || !pilotCtx) return null;
    const { pilotRepNames } = pilotCtx;
    const memberRepKeysPilot = new Set(members.map((m) => m.name.toLowerCase().trim()));
    const allRepsForStats = new Set([...pilotRepNames, ...memberRepKeysPilot]);
    const winsBreak = getPilotWinsWithTargetBreakdown(
      pilotOpsForKpis,
      allRepsForStats,
      lineItemTargets,
      monthKeyPilot,
    );
    return {
      winsBreak,
      ops: countPilotOpsInMonth(pilotOpsForKpis, allRepsForStats, monthKeyPilot),
      demos: countPilotDemosInMonth(demoRowsForPilot, allRepsForStats, monthKeyPilot),
      losses: countPilotLossesInMonth(pilotOpsForKpis, allRepsForStats, lineItemTargets, monthKeyPilot),
      kpi: getPilotKpiSnapshot(
        pilotOpsForKpis,
        pilotRepNames,
        lineItemTargets,
        monthKeyPilot,
        pilotOpsWithoutForKpis,
        pilotAttachOpts,
      ),
      repWinRows: pilotRepBreakdownWinsWithTarget(
        pilotOpsForKpis,
        allRepsForStats,
        lineItemTargets,
        monthKeyPilot,
      ),
      repLossRows: pilotRepBreakdownLossesInMonth(
        pilotOpsForKpis,
        allRepsForStats,
        lineItemTargets,
        monthKeyPilot,
      ),
    };
  }, [
    isPilotView,
    pilotCtx,
    members,
    pilotOpsForKpis,
    pilotOpsWithoutForKpis,
    demoRowsForPilot,
    lineItemTargets,
    monthKeyPilot,
    pilotAttachOpts,
  ]);

  const pilotWowWeeks = useMemo(() => {
    const allW = getTeamWeekKeys(team.startDate, team.endDate);
    const curr = getCurrentWeekKey();
    const completed = allW.filter((w) => w.key < curr);
    const w1 = completed[completed.length - 1]?.key;
    const w0 = completed[completed.length - 2]?.key;
    return { w0: w0 ?? null, w1: w1 ?? null };
  }, [team.startDate, team.endDate]);

  const pilotRepOpsDemosMap = useMemo(() => {
    if (!isPilotView || !pilotCtx) return new Map<string, { ops: number; demos: number }>();
    const memberRepKeysPilot = new Set(members.map((m) => m.name.toLowerCase().trim()));
    const allReps = new Set([...pilotCtx.pilotRepNames, ...memberRepKeysPilot]);
    const m = new Map<string, { ops: number; demos: number }>();
    for (const rk of allReps) m.set(rk, { ops: 0, demos: 0 });
    for (const row of pilotOpsForKpis) {
      const rk = (row.rep_name as string)?.toLowerCase().trim();
      if (!allReps.has(rk)) continue;
      const d = row.op_created_date as string | null;
      if (!d || d.slice(0, 7) !== monthKeyPilot) continue;
      const cur = m.get(rk);
      if (cur) cur.ops += 1;
    }
    for (const row of demoRowsForPilot) {
      const rk = (row.rep_name as string)?.toLowerCase().trim();
      if (!allReps.has(rk)) continue;
      const d = row.demo_date as string | null;
      if (!d || d.slice(0, 7) !== monthKeyPilot) continue;
      const cur = m.get(rk);
      if (cur) cur.demos += 1;
    }
    return m;
  }, [isPilotView, pilotCtx, members, pilotOpsForKpis, demoRowsForPilot, monthKeyPilot]);

  const allRepsForPilotMonthlyStats = useMemo(() => {
    if (!pilotCtx) return new Set<string>();
    const memberRepKeysPilot = new Set(members.map((m) => m.name.toLowerCase().trim()));
    return new Set([...pilotCtx.pilotRepNames, ...memberRepKeysPilot]);
  }, [pilotCtx, members]);

  const pilotTeamRows = useMemo(() => {
    if (!pilotCtx) return [];
    const w0 = pilotWowWeeks.w0;
    const w1 = pilotWowWeeks.w1;
    const rows = pilotCtx.pilotSalesTeams.map((st) => {
      const asn = projectTeamAssignments.find(
        (a) => a.teamId === team.id && a.salesTeamId === st.id && a.monthIndex === pilotMonthIndex,
      );
      const repSet = repsForSalesTeam(st, asn);
      const snap = getPilotKpiSnapshot(
        pilotOpsForKpis,
        repSet,
        lineItemTargets,
        monthKeyPilot,
        pilotOpsWithoutForKpis,
        pilotAttachOpts,
      );
      const accts = getPilotAccountNamesForTeam(
        pilotOpsForKpis,
        repSet,
        lineItemTargets,
        monthKeyPilot,
        pilotAttachOpts,
      );
      const prevW =
        w0 && w1
          ? getPilotKpiSnapshotForWeek(pilotOpsForKpis, repSet, lineItemTargets, w0, pilotOpsWithoutForKpis, pilotAttachOpts)
          : null;
      const lastW =
        w0 && w1
          ? getPilotKpiSnapshotForWeek(pilotOpsForKpis, repSet, lineItemTargets, w1, pilotOpsWithoutForKpis, pilotAttachOpts)
          : null;
      return { st, snap, accts, prevW, lastW };
    });
    const dir = pilotTeamSortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (pilotTeamSortCol === "team") {
        return dir * pilotSalesTeamShortLabel(a.st.displayName).localeCompare(pilotSalesTeamShortLabel(b.st.displayName));
      }
      const getNum = (r: (typeof rows)[number]): number => {
        switch (pilotTeamSortCol) {
          case "avgMrrWithout":
            return r.snap.avgMrrWithout ?? -Infinity;
          case "avgMrrWith":
            return r.snap.avgMrrWith ?? -Infinity;
          case "avgPrice":
            return r.snap.avgPrice ?? -Infinity;
          case "attachRate":
            return r.snap.attachRate ?? -Infinity;
          default:
            return -Infinity;
        }
      };
      return dir * (getNum(a) - getNum(b));
    });
  }, [
    pilotCtx,
    pilotWowWeeks.w0,
    pilotWowWeeks.w1,
    projectTeamAssignments,
    team.id,
    pilotMonthIndex,
    pilotOpsForKpis,
    lineItemTargets,
    monthKeyPilot,
    pilotOpsWithoutForKpis,
    pilotAttachOpts,
    pilotTeamSortCol,
    pilotTeamSortDir,
  ]);

  const gaVisibleIds = useMemo(() => {
    if (!isGAPhase) return null;
    if (pilotTeamRows.length === 0) return new Set<string>();
    const byAttach = [...pilotTeamRows].sort((a, b) => {
      const av = a.snap.attachRate ?? -1;
      const bv = b.snap.attachRate ?? -1;
      return bv - av;
    });
    const ids = new Set<string>();
    byAttach.slice(0, 10).forEach((r) => ids.add(r.st.id));
    byAttach.slice(-10).forEach((r) => ids.add(r.st.id));
    gaExtraTeamIds.forEach((id) => ids.add(id));
    return ids;
  }, [isGAPhase, pilotTeamRows, gaExtraTeamIds]);

  const goalsTablePilotRows =
    isGAPhase && gaVisibleIds ? pilotTeamRows.filter((r) => gaVisibleIds.has(r.st.id)) : pilotTeamRows;

  const weeklyPilotSalesTeams = useMemo(() => {
    if (!pilotCtx) return [];
    if (!isGAPhase) return pilotCtx.pilotSalesTeams;
    const ids = new Set(gaVisibleIds ?? []);
    gaFunnelSelectedIds.forEach((id) => ids.add(id));
    return pilotCtx.pilotSalesTeams.filter((st) => ids.has(st.id));
  }, [pilotCtx, isGAPhase, gaVisibleIds, gaFunnelSelectedIds]);

  return (
    <div className="space-y-8">
      {/* ===== TEST SIGNALS ===== */}
      <div id="test-signals" className="scroll-mt-16">
        <div
          className="mb-5 rounded-xl bg-secondary px-6 py-4 shadow-lg cursor-pointer select-none"
          onClick={() => toggleSection("test-signals")}
        >
          <div className="flex items-center gap-2">
            {collapsedSections["test-signals"] ? (
              <ChevronRight className="h-5 w-5 text-primary shrink-0" />
            ) : (
              <ChevronDown className="h-5 w-5 text-primary shrink-0" />
            )}
            <h2 className="font-display text-2xl font-bold tracking-tight text-primary">
              📡 {isPilotView ? "Monthly Data - Pilot Regions" : "Monthly Data"}
            </h2>
          </div>
        </div>
        {!collapsedSections["test-signals"] && <div className="space-y-6">
          {!isPilotView && (
          <>
          {/* Team Total Bar */}
          <div className="relative overflow-hidden rounded-2xl border-2 border-secondary/30 bg-gradient-to-br from-secondary via-secondary/90 to-secondary/80 p-6 shadow-xl">
            <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/15 blur-2xl" />
            <div className="absolute -left-4 -bottom-4 h-24 w-24 rounded-full bg-primary/10 blur-xl" />
            <div className="relative z-10">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="font-display text-2xl font-bold text-secondary-foreground tracking-tight">
                    {team.name}
                  </h3>
                  <p className="text-sm font-medium text-secondary-foreground/70">Led by {team.owner}</p>
                  {formatDateRange(team.startDate, team.endDate) && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <Calendar className="h-3.5 w-3.5 text-secondary-foreground/50" />
                      <span className="text-xs font-medium text-secondary-foreground/50">
                        {formatDateRange(team.startDate, team.endDate)}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2 text-right">
                    <Users className="h-5 w-5 text-secondary-foreground/70" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-secondary-foreground/50">Members</p>
                      <p className="font-display text-2xl font-bold text-secondary-foreground">{activeMembers.length}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-display text-4xl font-black text-primary">
                      {teamTotal.toLocaleString()}
                    </div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-secondary-foreground/50">Wins</p>
                  </div>
                </div>
              </div>
              {teamDucks > 0 && (
                <div className="mt-3 flex items-center gap-1">
                  {[...Array(Math.min(teamDucks, 20))].map((_, i) => (
                    <span key={i} className="text-lg hover-scale inline-block">🦆</span>
                  ))}
                </div>
              )}
              {/* Monthly Conversion Rates */}
              {(() => {
                const now = referenceDate ?? new Date();
                const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-`;
                const monthSum = (field: "calls" | "connects" | "demos") =>
                  members.reduce(
                    (s, m) =>
                      Object.entries(m.funnelByWeek || {}).reduce(
                        (ws, [wk, f]) => (wk.startsWith(monthPrefix) ? ws + (f[field] || 0) : ws),
                        0
                      ) + s,
                    0
                  );
                const memberMonthRates = members.map((m) => {
                  const calls = Object.entries(m.funnelByWeek || {}).reduce(
                    (s, [wk, f]) => (wk.startsWith(monthPrefix) ? s + (f.calls || 0) : s),
                    0
                  );
                  const connects = Object.entries(m.funnelByWeek || {}).reduce(
                    (s, [wk, f]) => (wk.startsWith(monthPrefix) ? s + (f.connects || 0) : s),
                    0
                  );
                  const demos = Object.entries(m.funnelByWeek || {}).reduce(
                    (s, [wk, f]) => (wk.startsWith(monthPrefix) ? s + (f.demos || 0) : s),
                    0
                  );
                  const wins = getMemberTotalWins(m, referenceDate);
                  return { label: m.name, calls, connects, demos, wins };
                });
                const totals = {
                  calls: monthSum("calls"),
                  connects: monthSum("connects"),
                  demos: monthSum("demos"),
                  wins: teamTotal,
                };
                const monthlyCallToConnectPct = totals.calls > 0 ? (totals.connects / totals.calls) * 100 : 0;
                const monthlyConnectToDemoPct = totals.connects > 0 ? (totals.demos / totals.connects) * 100 : 0;
                const monthlyDemoToWinPct = totals.demos > 0 ? (totals.wins / totals.demos) * 100 : 0;
                return (
                  <div className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                    <div className="rounded-md bg-secondary-foreground/5 py-2">
                      {(() => {
                        const ta = members.reduce((s, m) => s + (m.touchedAccountsByTeam[team.id] ?? 0), 0);
                        const tt = members.reduce((s, m) => s + m.touchedTam, 0);
                        const hasMetrics = tt > 0;
                        if (hasMetrics) {
                          return (
                            <>
                              <p className="font-display text-lg font-bold text-primary">{Math.min(100, (ta / tt) * 100).toFixed(0)}%</p>
                              <p className="text-[10px] text-secondary-foreground/50">% TAM</p>
                            </>
                          );
                        }
                        return (
                          <>
                            <p className="font-display text-lg font-bold text-primary">{team.totalTam > 0 ? ((totals.calls / team.totalTam) * 100).toFixed(0) : 0}%</p>
                            <p className="text-[10px] text-secondary-foreground/50">TAM→Call</p>
                          </>
                        );
                      })()}
                    </div>
                    <UiTooltip>
                      <TooltipTrigger asChild>
                        <div className="cursor-help rounded-md bg-secondary-foreground/5 py-2">
                          <p className="font-display text-lg font-bold text-secondary-foreground">{monthlyCallToConnectPct.toFixed(0)}%</p>
                          <p className="text-[10px] text-secondary-foreground/50">Call→Connect</p>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[240px]">
                        <div className="space-y-2">
                          <p className="text-xs leading-relaxed">
                            % of calls that resulted in a live connection with a prospect. Calculated as: Connects ÷ Calls.
                          </p>
                          <div className="text-[11px] text-muted-foreground">
                            Total: {totals.connects.toLocaleString()} ÷ {totals.calls.toLocaleString()} ({monthlyCallToConnectPct.toFixed(0)}%)
                          </div>
                          <div className="h-px bg-accent/20" />
                          <div className="space-y-1 text-xs">
                            {memberMonthRates.map((r) => {
                              const pct = r.calls > 0 ? (r.connects / r.calls) * 100 : 0;
                              return (
                                <div key={r.label} className="flex items-center justify-between gap-3">
                                  <span className="truncate text-muted-foreground">{r.label}</span>
                                  <span className="whitespace-nowrap font-medium text-foreground">
                                    {r.connects.toLocaleString()}/{r.calls.toLocaleString()} ({pct.toFixed(0)}%)
                                  </span>
                                </div>
                              );
                            })}
                            <div className="flex items-center justify-between gap-3 border-t border-accent/10 pt-1">
                              <span className="font-semibold text-foreground">Total</span>
                              <span className="whitespace-nowrap font-semibold text-accent">
                                {totals.connects.toLocaleString()}/{totals.calls.toLocaleString()} ({monthlyCallToConnectPct.toFixed(0)}%)
                              </span>
                            </div>
                          </div>
                        </div>
                      </TooltipContent>
                    </UiTooltip>
                    <UiTooltip>
                      <TooltipTrigger asChild>
                        <div className="cursor-help rounded-md bg-secondary-foreground/5 py-2">
                          <p className="font-display text-lg font-bold text-primary">{monthlyConnectToDemoPct.toFixed(0)}%</p>
                          <p className="text-[10px] text-secondary-foreground/50">Connect→Demo</p>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[240px]">
                        <div className="space-y-2">
                          <p className="text-xs leading-relaxed">
                            % of live connections that converted to a demo. Calculated as: Demos ÷ Connects.
                          </p>
                          <div className="text-[11px] text-muted-foreground">
                            Total: {totals.demos.toLocaleString()} ÷ {totals.connects.toLocaleString()} ({monthlyConnectToDemoPct.toFixed(0)}%)
                          </div>
                          <div className="h-px bg-accent/20" />
                          <div className="space-y-1 text-xs">
                            {memberMonthRates.map((r) => {
                              const pct = r.connects > 0 ? (r.demos / r.connects) * 100 : 0;
                              return (
                                <div key={r.label} className="flex items-center justify-between gap-3">
                                  <span className="truncate text-muted-foreground">{r.label}</span>
                                  <span className="whitespace-nowrap font-medium text-foreground">
                                    {r.demos.toLocaleString()}/{r.connects.toLocaleString()} ({pct.toFixed(0)}%)
                                  </span>
                                </div>
                              );
                            })}
                            <div className="flex items-center justify-between gap-3 border-t border-accent/10 pt-1">
                              <span className="font-semibold text-foreground">Total</span>
                              <span className="whitespace-nowrap font-semibold text-accent">
                                {totals.demos.toLocaleString()}/{totals.connects.toLocaleString()} ({monthlyConnectToDemoPct.toFixed(0)}%)
                              </span>
                            </div>
                          </div>
                        </div>
                      </TooltipContent>
                    </UiTooltip>
                    <UiTooltip>
                      <TooltipTrigger asChild>
                        <div className="cursor-help rounded-md bg-secondary-foreground/5 py-2">
                          <p className="font-display text-lg font-bold text-secondary-foreground">{monthlyDemoToWinPct.toFixed(0)}%</p>
                          <p className="text-[10px] text-secondary-foreground/50">Demo→Win</p>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[240px]">
                        <div className="space-y-2">
                          <p className="text-xs leading-relaxed">
                            % of demos that resulted in a closed win. Calculated as: Wins ÷ Demos.
                          </p>
                          <div className="text-[11px] text-muted-foreground">
                            Total: {totals.wins.toLocaleString()} ÷ {totals.demos.toLocaleString()} ({monthlyDemoToWinPct.toFixed(0)}%)
                          </div>
                          <div className="h-px bg-accent/20" />
                          <div className="space-y-1 text-xs">
                            {memberMonthRates.map((r) => {
                              const pct = r.demos > 0 ? (r.wins / r.demos) * 100 : 0;
                              return (
                                <div key={r.label} className="flex items-center justify-between gap-3">
                                  <span className="truncate text-muted-foreground">{r.label}</span>
                                  <span className="whitespace-nowrap font-medium text-foreground">
                                    {r.wins.toLocaleString()}/{r.demos.toLocaleString()} ({pct.toFixed(0)}%)
                                  </span>
                                </div>
                              );
                            })}
                            <div className="flex items-center justify-between gap-3 border-t border-accent/10 pt-1">
                              <span className="font-semibold text-foreground">Total</span>
                              <span className="whitespace-nowrap font-semibold text-accent">
                                {totals.wins.toLocaleString()}/{totals.demos.toLocaleString()} ({monthlyDemoToWinPct.toFixed(0)}%)
                              </span>
                            </div>
                          </div>
                        </div>
                      </TooltipContent>
                    </UiTooltip>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* ── Monthly Stats (adjustable by phase selection) ── */}
          <div className="rounded-xl border-2 border-primary/30 bg-card p-5">
            <div className="mb-3 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              <h3 className="font-display text-sm font-bold uppercase tracking-wider text-primary">
                Monthly Stats
              </h3>
              <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[10px] font-semibold text-primary">
                {(referenceDate ?? new Date()).toLocaleString("en-US", { month: "short", year: "numeric" })}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <StatCard
                icon={<Handshake className="h-5 w-5 text-accent" />}
                label="Ops"
                value={teamTotalOps}
                tooltip="Total number of opportunities (ops) opened this month."
                breakdown={monthlyOpsBreakdown}
              />
              <StatCard
                icon={<Video className="h-5 w-5 text-primary" />}
                label="Demos"
                value={teamTotalDemos}
                tooltip="Total 'Completed' Events with subject 'Demo' logged this month."
                breakdown={monthlyDemosBreakdown}
              />
              <StatCard
                icon={<TrendingUp className="h-5 w-5 text-accent" />}
                label="Wins"
                value={teamTotal}
                tooltip="Total closed wins this month."
                breakdown={monthlyWinsBreakdown}
              />
              <StatCard
                icon={<MessageCircle className="h-5 w-5 text-primary" />}
                label="Feedback"
                value={teamTotalFeedback}
                tooltip="Total feedback interactions logged this month."
                breakdown={monthlyFeedbackBreakdown}
              />
              <StatCard
                icon={<Activity className="h-5 w-5 text-accent" />}
                label="Activity"
                value={teamTotalActivity}
                tooltip="Total activity count (calls, emails, texts) logged this month."
                breakdown={monthlyActivityBreakdown}
              />
            </div>
          </div>

          {/* ===== GOALS ===== */}
          {(() => {
            const goalMembers = activeMembers.map((m) => getHistoricalMember(m, referenceDate, memberGoalsHistory));
            const winsHasGoal = team.enabledGoals.wins;
            const hasAccel = (metric: GoalMetric): boolean => {
              if ((team.acceleratorMode ?? 'basic') === 'basic') {
                return !!(team.basicAcceleratorConfig ?? {})[metric]?.enabled;
              }
              const rules = (team.acceleratorConfig ?? {})[metric];
              return !!rules && Array.isArray(rules) && rules.some((r) => r?.enabled);
            };
            const baseMetrics = GOAL_METRICS.filter((m) => (team.enabledGoals[m] || hasAccel(m)) && m !== 'wins' && m !== 'feedback');
            const visibleMetrics: GoalMetric[] = [
              ...baseMetrics,
              'wins',
              ...(team.enabledGoals.feedback || hasAccel('feedback') ? ['feedback' as GoalMetric] : []),
            ];
            const hasReliefMembers = (team.reliefMonthMembers ?? []).length > 0;
            const noGoalsConfigured = baseMetrics.length === 0 && !winsHasGoal && !hasAccel('wins') && !team.enabledGoals.feedback && !hasAccel('feedback');
            return (
              <div className="mb-6 rounded-lg border border-border bg-card p-5 glow-card">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-display text-lg font-semibold text-foreground">Monthly Goals</h3>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 border-border text-foreground hover:bg-muted"
                    onClick={onAddMemberClick}
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Member
                  </Button>
                </div>

                {noGoalsConfigured && !hasReliefMembers ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Configure goals in{" "}
                    <a href="/settings" className="text-primary underline hover:text-primary/80">Settings</a>
                  </p>
                ) : noGoalsConfigured && hasReliefMembers ? (
                  (() => {
                    const accelMetrics = GOAL_METRICS.filter((metric) => {
                      if ((team.acceleratorMode ?? 'basic') === 'basic') {
                        return (team.basicAcceleratorConfig ?? {})[metric]?.enabled;
                      }
                      const rules = (team.acceleratorConfig ?? {})[metric];
                      return rules && Array.isArray(rules) && rules.some((r) => r?.enabled);
                    });
                    return (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="text-left py-2 pr-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Member</th>
                              {accelMetrics.map((metric) => (
                                <th key={metric} className="text-center py-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[80px]">
                                  <UiTooltip>
                                    <TooltipTrigger asChild>
                                      <span className="inline-flex items-center justify-center gap-1.5 cursor-help w-full">
                                        <span className="whitespace-nowrap">{GOAL_METRIC_LABELS[metric]}</span>
                                        <Zap className="h-3.5 w-3.5 text-primary/80" />
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom" className="max-w-[380px] p-3">
                                      <AcceleratorConfigTooltip team={team} metric={metric} rosterMembers={activeMembers} />
                                    </TooltipContent>
                                  </UiTooltip>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {goalMembers.map((m) => {
                              const onRelief = isMemberOnRelief(team, m);
                              return (
                                <tr key={m.id} className="border-b border-border/30">
                                  <td className="py-3 pr-3">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-medium text-foreground whitespace-nowrap">{m.name}</span>
                                      {onRelief && (
                                        <span className="text-[9px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 bg-green-500/15 border border-green-500/40 text-green-500">Relief</span>
                                      )}
                                      {m.ducksEarned > 0 && (
                                        <span className="flex items-center">
                                          {[...Array(m.ducksEarned)].map((_, j) => (
                                            <span key={j} className="text-xs">🦆</span>
                                          ))}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  {accelMetrics.map((metric, metricIdx) => {
                                    const progress = getAcceleratorProgress(team, m, metric, referenceDate);
                                    if (!progress) return <td key={metric} className="py-3 px-2" />;
                                    const { currentValue, triggeredRules, nextRule, needed, totalRules } = progress;
                                    const allTriggered = triggeredRules.length === totalRules;
                                    const barPct = nextRule
                                      ? Math.min((currentValue / (nextRule.conditionValue1 + 1)) * 100, 100)
                                      : 100;
                                    const accelIsTyped = metric === 'wins' || metric === 'ops';
                                    const accelTypeCounts = accelIsTyped ? getScopedTypeCounts(team, m, metric, referenceDate) : null;
                                    const accelTypeNames = accelIsTyped ? getScopedTypeNames(team, m, metric, referenceDate) : null;
                                    const accelHasTypeNames = accelTypeNames && (accelTypeNames.nb.length > 0 || accelTypeNames.growth.length > 0);
                                    const accelCopyKey = `accel::${m.id}::${metric}`;

                                    const accelCellInner = (
                                      <div className="flex flex-col items-center gap-1">
                                        <span className="text-xs font-semibold text-foreground tabular-nums">{currentValue}</span>
                                        {accelTypeCounts && currentValue > 0 && (
                                          <span className="text-[9px] text-muted-foreground tabular-nums whitespace-nowrap">
                                            {accelTypeCounts.nb > 0 && <>{accelTypeCounts.nb}<span className="font-medium">NB</span></>}
                                            {accelTypeCounts.nb > 0 && accelTypeCounts.growth > 0 && ' + '}
                                            {accelTypeCounts.growth > 0 && <>{accelTypeCounts.growth}<span className="font-medium">G</span></>}
                                          </span>
                                        )}
                                        <div className="h-1.5 w-full max-w-[64px] overflow-hidden rounded-full bg-muted">
                                          <div
                                            className={`h-full rounded-full transition-all duration-500 ease-out ${allTriggered ? "bg-green-500" : "progress-bar-orange"}`}
                                            style={{ width: `${barPct}%` }}
                                          />
                                        </div>
                                        {!allTriggered && needed > 0 && (
                                          <span className="text-[10px] text-muted-foreground tabular-nums">
                                            need <span className="font-semibold text-foreground">{needed}</span>
                                          </span>
                                        )}
                                        {triggeredRules.length > 0 && (
                                          <div className="flex items-center gap-1 mt-0.5">
                                            {triggeredRules.map((detail, i) => {
                                              const tier = i + 1;
                                              const isMax = tier === totalRules;
                                              return (
                                                <UiTooltip key={i}>
                                                  <TooltipTrigger asChild>
                                                    <span className="inline-flex items-center gap-px text-xs font-bold cursor-help text-primary">
                                                      {isMax ? (
                                                        <><Lock className="h-3 w-3" /><span className="text-[8px]">MAX</span></>
                                                      ) : (
                                                        <><LockOpen className="h-3 w-3" /><span className="text-[8px]">{tier}</span></>
                                                      )}
                                                    </span>
                                                  </TooltipTrigger>
                                                  <TooltipContent side="top" className="max-w-[240px]">
                                                    <div className="text-xs leading-relaxed">
                                                      <p className="font-semibold mb-1">{GOAL_METRIC_LABELS[detail.metric]} Accelerator</p>
                                                      <p className="text-muted-foreground">
                                                        {GOAL_METRIC_LABELS[detail.metric]} is <span className="font-semibold text-foreground">{detail.currentValue}</span>
                                                        {" "}({detail.rule.conditionOperator} {detail.rule.conditionValue1})
                                                      </p>
                                                    </div>
                                                  </TooltipContent>
                                                </UiTooltip>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    );

                                    return (
                                      <td key={metric} className="py-3 px-2">
                                        {accelHasTypeNames ? (
                                          <UiTooltip
                                            open={forceOpenKey === accelCopyKey ? true : undefined}
                                            onOpenChange={(open) => { if (!open && forceOpenKey === accelCopyKey && copiedMetricKey !== accelCopyKey) setForceOpenKey(null); }}
                                          >
                                            <TooltipTrigger asChild>
                                              <div
                                                className="cursor-pointer"
                                                onClick={() => {
                                                  const allNames = [...(accelTypeNames?.nb ?? []), ...(accelTypeNames?.growth ?? [])];
                                                  navigator.clipboard.writeText(allNames.join(", "));
                                                  setCopiedMetricKey(accelCopyKey);
                                                  setForceOpenKey(accelCopyKey);
                                                  setTimeout(() => setCopiedMetricKey(null), 1000);
                                                }}
                                              >
                                                {accelCellInner}
                                              </div>
                                            </TooltipTrigger>
                                            <TooltipContent side="top" className="max-w-[480px] p-3">
                                              {copiedMetricKey === accelCopyKey ? (
                                                <p className="text-xs font-semibold text-green-500">Copied!</p>
                                              ) : (
                                                <div className="text-xs">
                                                  {accelTypeNames!.nb.length > 0 && (
                                                    <div className="mb-2">
                                                      <p className="font-semibold mb-1">New Business {GOAL_METRIC_LABELS[metric]}</p>
                                                      <div className={`${accelTypeNames!.nb.length > 6 ? "columns-3" : accelTypeNames!.nb.length > 3 ? "columns-2" : ""} gap-x-4 text-muted-foreground`}>
                                                        {accelTypeNames!.nb.map((name) => (
                                                          <p key={name} className="break-inside-avoid truncate leading-relaxed">{name}</p>
                                                        ))}
                                                      </div>
                                                    </div>
                                                  )}
                                                  {accelTypeNames!.growth.length > 0 && (
                                                    <div>
                                                      <p className="font-semibold mb-1">Growth {GOAL_METRIC_LABELS[metric]}</p>
                                                      <div className={`${accelTypeNames!.growth.length > 6 ? "columns-3" : accelTypeNames!.growth.length > 3 ? "columns-2" : ""} gap-x-4 text-muted-foreground`}>
                                                        {accelTypeNames!.growth.map((name) => (
                                                          <p key={name} className="break-inside-avoid truncate leading-relaxed">{name}</p>
                                                        ))}
                                                      </div>
                                                    </div>
                                                  )}
                                                </div>
                                              )}
                                            </TooltipContent>
                                          </UiTooltip>
                                        ) : accelCellInner}
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left py-2 pr-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Member</th>
                            {visibleMetrics.map((metric) => {
                              const isTeamScope = (team.goalScopeConfig?.[metric] ?? 'individual') === 'team';
                              const accelEnabled = hasAccel(metric);
                              return (
                                <th key={metric} className="text-center py-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[80px]">
                                  {accelEnabled ? (
                                    <UiTooltip>
                                      <TooltipTrigger asChild>
                                        <span className="inline-flex items-center justify-center gap-1.5 cursor-help w-full">
                                          <span className="whitespace-nowrap">{GOAL_METRIC_LABELS[metric]}</span>
                                          <Zap className="h-3.5 w-3.5 text-primary/80" />
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent side="bottom" className="max-w-[380px] p-3">
                                        <AcceleratorConfigTooltip team={team} metric={metric} rosterMembers={activeMembers} />
                                      </TooltipContent>
                                    </UiTooltip>
                                  ) : (
                                    GOAL_METRIC_LABELS[metric]
                                  )}
                                  {isTeamScope && (
                                    <span className="block text-[8px] font-bold uppercase tracking-wider text-primary/70">Team</span>
                                  )}
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {goalMembers.map((m) => {
                            const onRelief = isMemberOnRelief(team, m);
                            return (
                            <tr key={m.id} className="border-b border-border/30">
                              <td className="py-3 pr-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-foreground whitespace-nowrap">{m.name}</span>
                                  {onRelief && (
                                    <span className="text-[9px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 bg-green-500/15 border border-green-500/40 text-green-500">Relief</span>
                                  )}
                                  {m.ducksEarned > 0 && (
                                    <span className="flex items-center">
                                      {[...Array(m.ducksEarned)].map((_, j) => (
                                        <span key={j} className="text-xs">🦆</span>
                                      ))}
                                    </span>
                                  )}
                                </div>
                              </td>
                              {visibleMetrics.map((metric, metricIdx) => {
                                const actual = getScopedMetricTotal(team, m, metric, referenceDate);
                                const goal = getEffectiveGoal(team, m, metric);
                                const hasGoal = !!team.enabledGoals[metric] && goal > 0;
                                const isTeamScope = (team.goalScopeConfig?.[metric] ?? 'individual') === 'team';
                                const pct = onRelief ? 100 : (hasGoal ? (actual / goal) * 100 : 0);
                                const barPct = onRelief ? 100 : Math.min(pct, 100);
                                const hasAcctNames = metric === 'ops' || metric === 'demos' || metric === 'wins' || metric === 'feedback';
                                const accountNames = hasAcctNames ? getScopedAccountNames(team, m, metric, referenceDate) : [];
                                const copyKey = `${m.id}::${metric}`;

                                const isTypedMetric = metric === 'wins' || metric === 'ops';
                                const typeCounts = isTypedMetric ? getScopedTypeCounts(team, m, metric, referenceDate) : null;
                                // Match the number shown in the cell: accelerator uses currentValue, not getScopedMetricTotal.
                                const accelProgressForHeadline =
                                  !hasGoal && hasAccel(metric) && !isMemberExcludedFromAccelerator(team, m.id, metric)
                                    ? getAcceleratorProgress(team, m, metric, referenceDate)
                                    : null;
                                const headlineMetricValue = hasGoal
                                  ? actual
                                  : accelProgressForHeadline
                                    ? accelProgressForHeadline.currentValue
                                    : actual;
                                const cellContent = (
                                  <div className="flex flex-col items-center gap-1">
                                    {hasGoal ? (
                                      <>
                                        <span className="text-xs font-semibold text-foreground tabular-nums">
                                          {actual} <span className="text-muted-foreground font-normal">/</span> {goal}
                                        </span>
                                        {typeCounts && actual > 0 && (
                                          <span className="text-[9px] text-muted-foreground tabular-nums whitespace-nowrap">
                                            {typeCounts.nb > 0 && <>{typeCounts.nb}<span className="font-medium">NB</span></>}
                                            {typeCounts.nb > 0 && typeCounts.growth > 0 && ' + '}
                                            {typeCounts.growth > 0 && <>{typeCounts.growth}<span className="font-medium">G</span></>}
                                          </span>
                                        )}
                                        {isTeamScope && (
                                          <span className="text-[8px] font-bold uppercase tracking-wider text-primary/70">Team</span>
                                        )}
                                        <div className="h-1.5 w-full max-w-[64px] overflow-hidden rounded-full bg-muted">
                                          <div
                                            className={`h-full rounded-full transition-all duration-500 ease-out ${onRelief ? 'bg-green-500' : METRIC_BAR_COLORS[metricIdx % METRIC_BAR_COLORS.length]}`}
                                            style={{ width: `${barPct}%` }}
                                          />
                                        </div>
                                        <span className={`text-[10px] tabular-nums ${pct >= 100 ? "text-green-400 font-semibold" : "text-muted-foreground"}`}>{pct.toFixed(0)}%</span>
                                      </>
                                    ) : hasAccel(metric) ? (() => {
                                      if (isMemberExcludedFromAccelerator(team, m.id, metric)) return null;
                                      const progress = getAcceleratorProgress(team, m, metric, referenceDate);
                                      if (!progress) return (
                                        <span className="text-xs font-semibold text-foreground tabular-nums">{actual}</span>
                                      );
                                      const { currentValue, triggeredRules, nextRule, needed, totalRules } = progress;
                                      const allTriggered = triggeredRules.length === totalRules;
                                      const accelBarPct = nextRule
                                        ? Math.min((currentValue / (nextRule.conditionValue1 + 1)) * 100, 100)
                                        : 100;
                                      return (
                                        <>
                                          <span className="text-xs font-semibold text-foreground tabular-nums">{currentValue}</span>
                                          {typeCounts && currentValue > 0 && (
                                            <span className="text-[9px] text-muted-foreground tabular-nums whitespace-nowrap">
                                              {typeCounts.nb > 0 && <>{typeCounts.nb}<span className="font-medium">NB</span></>}
                                              {typeCounts.nb > 0 && typeCounts.growth > 0 && ' + '}
                                              {typeCounts.growth > 0 && <>{typeCounts.growth}<span className="font-medium">G</span></>}
                                            </span>
                                          )}
                                          <div className="h-1.5 w-full max-w-[64px] overflow-hidden rounded-full bg-muted">
                                            <div
                                              className={`h-full rounded-full transition-all duration-500 ease-out ${allTriggered ? "bg-green-500" : "progress-bar-orange"}`}
                                              style={{ width: `${accelBarPct}%` }}
                                            />
                                          </div>
                                          {!allTriggered && needed > 0 && (
                                            <span className="text-[10px] text-muted-foreground tabular-nums">
                                              need <span className="font-semibold text-foreground">{needed}</span>
                                            </span>
                                          )}
                                          {triggeredRules.length > 0 && (
                                            <div className="flex items-center gap-1 mt-0.5">
                                              {triggeredRules.map((detail, i) => {
                                                const tier = i + 1;
                                                const isMax = tier === totalRules;
                                                return (
                                                  <UiTooltip key={i}>
                                                    <TooltipTrigger asChild>
                                                      <span className="inline-flex items-center gap-px text-xs font-bold cursor-help text-primary">
                                                        {isMax ? (
                                                          <><Lock className="h-3 w-3" /><span className="text-[8px]">MAX</span></>
                                                        ) : (
                                                          <><LockOpen className="h-3 w-3" /><span className="text-[8px]">{tier}</span></>
                                                        )}
                                                      </span>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="top" className="max-w-[240px]">
                                                      <div className="text-xs leading-relaxed">
                                                        <p className="font-semibold mb-1">{GOAL_METRIC_LABELS[detail.metric]} Accelerator</p>
                                                        <p className="text-muted-foreground">
                                                          {GOAL_METRIC_LABELS[detail.metric]} is <span className="font-semibold text-foreground">{detail.currentValue}</span>
                                                          {" "}({detail.rule.conditionOperator} {detail.rule.conditionValue1})
                                                        </p>
                                                      </div>
                                                    </TooltipContent>
                                                  </UiTooltip>
                                                );
                                              })}
                                            </div>
                                          )}
                                        </>
                                      );
                                    })() : (
                                      <>
                                        <span className="text-xs font-semibold text-foreground tabular-nums">{actual}</span>
                                        {typeCounts && actual > 0 && (
                                          <span className="text-[9px] text-muted-foreground tabular-nums whitespace-nowrap">
                                            {typeCounts.nb > 0 && <>{typeCounts.nb}<span className="font-medium">NB</span></>}
                                            {typeCounts.nb > 0 && typeCounts.growth > 0 && ' + '}
                                            {typeCounts.growth > 0 && <>{typeCounts.growth}<span className="font-medium">G</span></>}
                                          </span>
                                        )}
                                      </>
                                    )}
                                  </div>
                                );

                                return (
                                  <td key={metric} className="py-3 px-2">
                                    {hasAcctNames && accountNames.length > 0 ? (
                                      <UiTooltip
                                        open={forceOpenKey === copyKey ? true : undefined}
                                        onOpenChange={(open) => { if (!open && forceOpenKey === copyKey && copiedMetricKey !== copyKey) setForceOpenKey(null); }}
                                      >
                                        <TooltipTrigger asChild>
                                          <div
                                            className="cursor-pointer"
                                            onClick={() => {
                                              navigator.clipboard.writeText(accountNames.join(", "));
                                              setCopiedMetricKey(copyKey);
                                              setForceOpenKey(copyKey);
                                              setTimeout(() => setCopiedMetricKey(null), 1000);
                                            }}
                                          >
                                            {cellContent}
                                          </div>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="max-w-[480px] p-3">
                                          {copiedMetricKey === copyKey ? (
                                            <p className="text-xs font-semibold text-green-500">Copied!</p>
                                          ) : (metric === 'wins' || metric === 'ops') ? (() => {
                                            const wtn = getScopedTypeNames(team, m, metric, referenceDate);
                                            return (
                                              <div className="text-xs">
                                                {wtn.nb.length > 0 && (
                                                  <div className="mb-2">
                                                    <p className="font-semibold mb-1">New Business {GOAL_METRIC_LABELS[metric]}</p>
                                                    <div className={`${wtn.nb.length > 6 ? "columns-3" : wtn.nb.length > 3 ? "columns-2" : ""} gap-x-4 text-muted-foreground`}>
                                                      {wtn.nb.map((name) => (
                                                        <p key={name} className="break-inside-avoid truncate leading-relaxed">{name}</p>
                                                      ))}
                                                    </div>
                                                  </div>
                                                )}
                                                {wtn.growth.length > 0 && (
                                                  <div>
                                                    <p className="font-semibold mb-1">Growth {GOAL_METRIC_LABELS[metric]}</p>
                                                    <div className={`${wtn.growth.length > 6 ? "columns-3" : wtn.growth.length > 3 ? "columns-2" : ""} gap-x-4 text-muted-foreground`}>
                                                      {wtn.growth.map((name) => (
                                                        <p key={name} className="break-inside-avoid truncate leading-relaxed">{name}</p>
                                                      ))}
                                                    </div>
                                                  </div>
                                                )}
                                                {metric === "wins" && wtn.noAccountRecord.length > 0 && (
                                                  <div className="mt-2">
                                                    <p className="font-semibold mb-1 italic text-muted-foreground/80">Without account record {GOAL_METRIC_LABELS[metric]}</p>
                                                    <div
                                                      className={`${wtn.noAccountRecord.length > 6 ? "columns-3" : wtn.noAccountRecord.length > 3 ? "columns-2" : ""} gap-x-4 text-muted-foreground/80 italic`}
                                                    >
                                                      {wtn.noAccountRecord.map((name) => (
                                                        <p key={name} className="break-inside-avoid truncate leading-relaxed">{name}</p>
                                                      ))}
                                                    </div>
                                                  </div>
                                                )}
                                                {(() => {
                                                  // Reconcile the stat-card count with the unique NB/Growth names shown above.
                                                  // Any remaining delta comes from wins/ops whose names are either missing or categorized separately.
                                                  const namedCount = wtn.nb.length + wtn.growth.length;
                                                  const untracked = headlineMetricValue - namedCount;
                                                  return untracked > 0 ? (
                                                    <p className="text-muted-foreground/60 mt-1.5 italic">
                                                      + {untracked} without account records
                                                    </p>
                                                  ) : null;
                                                })()}
                                              </div>
                                            );
                                          })() : (
                                            <>
                                              <p className="text-xs font-semibold mb-1.5">{GOAL_METRIC_LABELS[metric]}</p>
                                              <div className={`${accountNames.length > 6 ? "columns-3" : accountNames.length > 3 ? "columns-2" : ""} gap-x-4 text-xs text-muted-foreground`}>
                                                {accountNames.map((name) => (
                                                  <p key={name} className="break-inside-avoid truncate leading-relaxed">{name}</p>
                                                ))}
                                              </div>
                                              {headlineMetricValue - accountNames.length > 0 && (
                                                <p className="text-xs text-muted-foreground/60 mt-1.5 italic">
                                                  + {headlineMetricValue - accountNames.length} without account records
                                                </p>
                                              )}
                                            </>
                                          )}
                                        </TooltipContent>
                                      </UiTooltip>
                                    ) : cellContent}
                                  </td>
                                );
                              })}
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {members.some((m) => !m.isActive) && (
                      <div className="mt-4 pt-4 border-t border-border/50">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Former Members</p>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm opacity-50">
                            <tbody>
                              {members.filter((m) => !m.isActive).map((rawM) => {
                                const m = getHistoricalMember(rawM, referenceDate, memberGoalsHistory);
                                return (
                                <tr key={m.id} className="border-b border-border/30">
                                  <td className="py-2 pr-3">
                                    <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">{m.name}</span>
                                  </td>
                                  {visibleMetrics.map((metric, metricIdx) => {
                                    const actual = getScopedMetricTotal(team, m, metric, referenceDate);
                                    const goal = getEffectiveGoal(team, m, metric);
                                    const hasGoal = !!team.enabledGoals[metric] && goal > 0;
                                    const pct = hasGoal ? (actual / goal) * 100 : 0;
                                    const barPct = Math.min(pct, 100);
                                    const hasAcctNames = metric === 'ops' || metric === 'demos' || metric === 'wins' || metric === 'feedback';
                                    const accountNames = hasAcctNames ? getScopedAccountNames(team, m, metric, referenceDate) : [];
                                    const copyKey = `${m.id}::${metric}`;

                                    const formerIsTyped = metric === 'wins' || metric === 'ops';
                                    const formerTypeCounts = formerIsTyped ? getScopedTypeCounts(team, m, metric, referenceDate) : null;
                                    const formerCellContent = (
                                      <div className="flex flex-col items-center gap-0.5">
                                        {hasGoal ? (
                                          <>
                                            <span className="text-xs text-muted-foreground tabular-nums">{actual} / {goal}</span>
                                            {formerTypeCounts && actual > 0 && (
                                              <span className="text-[9px] text-muted-foreground/70 tabular-nums whitespace-nowrap">
                                                {formerTypeCounts.nb > 0 && <>{formerTypeCounts.nb}<span className="font-medium">NB</span></>}
                                                {formerTypeCounts.nb > 0 && formerTypeCounts.growth > 0 && ' + '}
                                                {formerTypeCounts.growth > 0 && <>{formerTypeCounts.growth}<span className="font-medium">G</span></>}
                                              </span>
                                            )}
                                            <div className="h-1.5 w-full max-w-[64px] overflow-hidden rounded-full bg-muted">
                                              <div
                                                className={`h-full rounded-full transition-all duration-500 ease-out ${METRIC_BAR_COLORS[metricIdx % METRIC_BAR_COLORS.length]}`}
                                                style={{ width: `${barPct}%` }}
                                              />
                                            </div>
                                          </>
                                        ) : (
                                          <>
                                            <span className="text-xs text-muted-foreground tabular-nums">{actual}</span>
                                            {formerTypeCounts && actual > 0 && (
                                              <span className="text-[9px] text-muted-foreground/70 tabular-nums whitespace-nowrap">
                                                {formerTypeCounts.nb > 0 && <>{formerTypeCounts.nb}<span className="font-medium">NB</span></>}
                                                {formerTypeCounts.nb > 0 && formerTypeCounts.growth > 0 && ' + '}
                                                {formerTypeCounts.growth > 0 && <>{formerTypeCounts.growth}<span className="font-medium">G</span></>}
                                              </span>
                                            )}
                                          </>
                                        )}
                                      </div>
                                    );

                                    return (
                                      <td key={metric} className="py-2 px-2">
                                        {hasAcctNames && accountNames.length > 0 ? (
                                          <UiTooltip
                                            open={forceOpenKey === copyKey ? true : undefined}
                                            onOpenChange={(open) => { if (!open && forceOpenKey === copyKey && copiedMetricKey !== copyKey) setForceOpenKey(null); }}
                                          >
                                            <TooltipTrigger asChild>
                                              <div
                                                className="cursor-pointer"
                                                onClick={() => {
                                                  navigator.clipboard.writeText(accountNames.join(", "));
                                                  setCopiedMetricKey(copyKey);
                                                  setForceOpenKey(copyKey);
                                                  setTimeout(() => setCopiedMetricKey(null), 1000);
                                                }}
                                              >
                                                {formerCellContent}
                                              </div>
                                            </TooltipTrigger>
                                            <TooltipContent side="top" className="max-w-[480px] p-3">
                                              {copiedMetricKey === copyKey ? (
                                                <p className="text-xs font-semibold text-green-500">Copied!</p>
                                              ) : (metric === 'wins' || metric === 'ops') ? (() => {
                                                const wtn = getScopedTypeNames(team, m, metric, referenceDate);
                                                const actual = getScopedMetricTotal(team, m, metric, referenceDate);
                                                const namedCount = wtn.nb.length + wtn.growth.length;
                                                const untracked = actual - namedCount;
                                                return (
                                                  <div className="text-xs">
                                                    {wtn.nb.length > 0 && (
                                                      <div className="mb-2">
                                                        <p className="font-semibold mb-1">New Business {GOAL_METRIC_LABELS[metric]}</p>
                                                        <div className={`${wtn.nb.length > 6 ? "columns-3" : wtn.nb.length > 3 ? "columns-2" : ""} gap-x-4 text-muted-foreground`}>
                                                          {wtn.nb.map((name) => (
                                                            <p key={name} className="break-inside-avoid truncate leading-relaxed">{name}</p>
                                                          ))}
                                                        </div>
                                                      </div>
                                                    )}
                                                    {wtn.growth.length > 0 && (
                                                      <div>
                                                        <p className="font-semibold mb-1">Growth {GOAL_METRIC_LABELS[metric]}</p>
                                                        <div className={`${wtn.growth.length > 6 ? "columns-3" : wtn.growth.length > 3 ? "columns-2" : ""} gap-x-4 text-muted-foreground`}>
                                                          {wtn.growth.map((name) => (
                                                            <p key={name} className="break-inside-avoid truncate leading-relaxed">{name}</p>
                                                          ))}
                                                        </div>
                                                      </div>
                                                    )}
                                                    {metric === "wins" && wtn.noAccountRecord.length > 0 && (
                                                      <div className="mt-2">
                                                        <p className="font-semibold mb-1 italic text-muted-foreground/80">Without account record {GOAL_METRIC_LABELS[metric]}</p>
                                                        <div
                                                          className={`${wtn.noAccountRecord.length > 6 ? "columns-3" : wtn.noAccountRecord.length > 3 ? "columns-2" : ""} gap-x-4 text-muted-foreground/80 italic`}
                                                        >
                                                          {wtn.noAccountRecord.map((name) => (
                                                            <p key={name} className="break-inside-avoid truncate leading-relaxed">{name}</p>
                                                          ))}
                                                        </div>
                                                      </div>
                                                    )}
                                                    {untracked > 0 && (
                                                      <p className="text-muted-foreground/60 mt-1.5 italic">
                                                        + {untracked} without account records
                                                      </p>
                                                    )}
                                                  </div>
                                                );
                                              })() : (
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
                                          </UiTooltip>
                                        ) : formerCellContent}
                                      </td>
                                    );
                                  })}
                                </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })()}
          </>
          )}

          {isPilotView && pilotCtx && pilotKpis && (
          <>
            <div className="relative overflow-hidden rounded-2xl border-2 border-secondary/30 bg-gradient-to-br from-secondary via-secondary/90 to-secondary/80 p-6 shadow-xl">
              <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/15 blur-2xl" />
              <div className="absolute -left-4 -bottom-4 h-24 w-24 rounded-full bg-primary/10 blur-xl" />
              <div className="relative z-10">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="font-display text-2xl font-bold text-secondary-foreground tracking-tight">{team.name}</h3>
                    <p className="text-sm font-medium text-secondary-foreground/70">Led by {team.owner}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                    <UiTooltip>
                      <TooltipTrigger asChild>
                        <div className="flex cursor-help items-center gap-2 text-right">
                          <Scale className="h-5 w-5 text-secondary-foreground/70" />
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-secondary-foreground/50">Regions</p>
                            <p className="font-display text-2xl font-bold text-secondary-foreground">{pilotCtx.regionCount}</p>
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-[280px] p-3">
                        <p className="text-xs font-semibold mb-2">Pilot teams</p>
                        <ul className="text-xs space-y-1 text-muted-foreground">
                          {pilotCtx.pilotSalesTeams.map((st) => {
                            const asn = projectTeamAssignments.find(
                              (a) => a.teamId === team.id && a.salesTeamId === st.id && a.monthIndex === pilotMonthIndex,
                            );
                            const n = repsForSalesTeam(st, asn).size;
                            return (
                              <li key={st.id}>
                                <span className="text-foreground font-medium">{st.displayName}</span>: {n} reps
                              </li>
                            );
                          })}
                          {pilotCtx.pilotSalesTeams.length === 0 && <li>None assigned for this month</li>}
                        </ul>
                      </TooltipContent>
                    </UiTooltip>
                    <UiTooltip>
                      <TooltipTrigger asChild>
                        <div className="flex cursor-help items-center gap-2 text-right">
                          <Users className="h-5 w-5 text-secondary-foreground/70" />
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-secondary-foreground/50">Reps</p>
                            <p className="font-display text-2xl font-bold text-secondary-foreground">{pilotCtx.repCount}</p>
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-[320px] p-3">
                        <p className="text-xs font-semibold mb-2">Rep activity ({monthKeyPilot})</p>
                        <ul className="text-xs space-y-1 max-h-48 overflow-y-auto">
                          {Array.from(allRepsForPilotMonthlyStats).map((rk) => {
                            const od = pilotRepOpsDemosMap.get(rk) ?? { ops: 0, demos: 0 };
                            const wins = pilotKpis.repWinRows.find((r) => r.repKey === rk)?.wins ?? 0;
                            const label = repNameToSentenceCase(
                              pilotKpis.repWinRows.find((r) => r.repKey === rk)?.displayName ?? rk,
                            );
                            return (
                              <li key={rk} className="flex justify-between gap-2">
                                <span className="text-foreground truncate">{label}</span>
                                <span className="text-muted-foreground tabular-nums shrink-0">
                                  {od.ops} ops · {od.demos} demos · {wins} wins*
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                        <p className="text-[10px] text-muted-foreground mt-2">*Wins with target line items</p>
                      </TooltipContent>
                    </UiTooltip>
                    <UiTooltip>
                      <TooltipTrigger asChild>
                        <div className="cursor-help text-right">
                          <div className="font-display text-4xl font-black text-primary">{pilotKpis.winsBreak.total}</div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-secondary-foreground/50">Wins</p>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-[260px] p-3">
                        <div className="text-xs space-y-2">
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Total Growth Wins</span>
                            <span className="font-semibold tabular-nums">{pilotKpis.winsBreak.growth}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Total New Business Wins</span>
                            <span className="font-semibold tabular-nums">{pilotKpis.winsBreak.nb}</span>
                          </div>
                          <div className="text-[10px] text-muted-foreground pt-1 border-t border-border space-y-1">
                            <p>
                              Wins with configured line items only (
                              {lineItemTargets.length ? lineItemTargets.join(", ") : "no targets set"})
                            </p>
                            <p>
                              {isGAPhase ? (
                                <>GA / Commercial Lead: opportunity name flags are not applied — line-item rules only.</>
                              ) : opportunityFlags.length > 0 ? (
                                <>
                                  Opportunity flags (name must contain any):{" "}
                                  {opportunityFlags.join(", ")}
                                </>
                              ) : (
                                <>Opportunity flags: none — all opportunity names count</>
                              )}
                            </p>
                          </div>
                        </div>
                      </TooltipContent>
                    </UiTooltip>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                  {(() => {
                    const repBreak = (snap: (rep: string) => PilotKpiSnapshot) =>
                      Array.from(pilotCtx.pilotRepNames).map((rk) => {
                        const k = snap(rk);
                        const lab = repNameToSentenceCase(
                          pilotKpis.repWinRows.find((r) => r.repKey === rk)?.displayName ?? rk,
                        );
                        return { label: lab, repKey: rk, snap: k };
                      });
                    const snapForRep = (rk: string) =>
                      getPilotKpiSnapshot(
                        pilotOpsForKpis,
                        new Set([rk]),
                        lineItemTargets,
                        monthKeyPilot,
                        pilotOpsWithoutForKpis,
                        pilotAttachOpts,
                      );
                    const top10bottom10 = (
                      arr: Array<{ label: string; value: number; display?: string }>,
                    ) => {
                      const sorted = [...arr].sort((a, b) => b.value - a.value);
                      if (sorted.length <= 20) return sorted;
                      const top = sorted.slice(0, 10);
                      const bottom = sorted.slice(-10);
                      return [
                        { label: "TOP", value: 0, isSectionLabel: true },
                        ...top,
                        { label: "", value: -1, isSeparator: true },
                        { label: "BOTTOM", value: 0, isSectionLabel: true },
                        ...bottom,
                      ];
                    };
                    const b1 = repBreak(snapForRep).map(({ label, snap }) => ({
                      label,
                      value: snap.avgMrrWithout !== null ? Math.round(snap.avgMrrWithout) : 0,
                      display: fmtPilotMoney(snap.avgMrrWithout),
                    }));
                    const b2 = repBreak(snapForRep).map(({ label, snap }) => ({
                      label,
                      value: snap.avgMrrWith !== null ? Math.round(snap.avgMrrWith) : 0,
                      display: fmtPilotMoney(snap.avgMrrWith),
                    }));
                    const b3 = repBreak(snapForRep).map(({ label, snap }) => ({
                      label,
                      value: snap.avgPrice !== null ? Math.round(snap.avgPrice) : 0,
                      display: fmtPilotMoney(snap.avgPrice),
                    }));
                    const b4 = top10bottom10(
                      repBreak(snapForRep).map(({ label, snap }) => ({
                        label,
                        value: snap.attachRate ?? 0,
                        display: fmtPilotAttach(snap.attachRate),
                      })),
                    );
                    return (
                      <>
                        <StatCard
                          icon={<TrendingUp className="h-5 w-5 text-primary" />}
                          label="Avg MRR (without product)"
                          value={fmtPilotMoney(pilotKpis.kpi.avgMrrWithout)}
                          breakdown={top10bottom10(b1)}
                        />
                        <StatCard
                          icon={<TrendingUp className="h-5 w-5 text-accent" />}
                          label="Avg MRR (with product)"
                          value={fmtPilotMoney(pilotKpis.kpi.avgMrrWith)}
                          breakdown={top10bottom10(b2)}
                        />
                        <StatCard
                          icon={<Handshake className="h-5 w-5 text-primary" />}
                          label="Avg Price (of product)"
                          value={fmtPilotMoney(pilotKpis.kpi.avgPrice)}
                          breakdown={top10bottom10(b3)}
                        />
                        <StatCard
                          icon={<Scale className="h-5 w-5 text-accent" />}
                          label="Attach Rate"
                          value={fmtPilotAttach(pilotKpis.kpi.attachRate)}
                          breakdown={b4}
                        />
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>

            <div className="rounded-xl border-2 border-primary/30 bg-card p-5">
              <div className="mb-3 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                <h3 className="font-display text-sm font-bold uppercase tracking-wider text-primary">Monthly Stats</h3>
                <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[10px] font-semibold text-primary">
                  {(referenceDate ?? new Date()).toLocaleString("en-US", { month: "short", year: "numeric" })}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard
                  icon={<Handshake className="h-5 w-5 text-accent" />}
                  label="Ops"
                  value={pilotKpis.ops}
                  breakdown={top20PilotMonthlyStatBreakdown(
                    Array.from(allRepsForPilotMonthlyStats).map((rk) => ({
                      label: repNameToSentenceCase(
                        pilotKpis.repWinRows.find((r) => r.repKey === rk)?.displayName ?? rk,
                      ),
                      value: pilotRepOpsDemosMap.get(rk)?.ops ?? 0,
                    })),
                  )}
                />
                <StatCard
                  icon={<Video className="h-5 w-5 text-primary" />}
                  label="Demos"
                  value={pilotKpis.demos}
                  breakdown={top20PilotMonthlyStatBreakdown(
                    Array.from(allRepsForPilotMonthlyStats).map((rk) => ({
                      label: repNameToSentenceCase(
                        pilotKpis.repWinRows.find((r) => r.repKey === rk)?.displayName ?? rk,
                      ),
                      value: pilotRepOpsDemosMap.get(rk)?.demos ?? 0,
                    })),
                  )}
                />
                <StatCard
                  icon={<TrendingUp className="h-5 w-5 text-accent" />}
                  label="Wins"
                  value={pilotKpis.winsBreak.total}
                  breakdown={top20PilotMonthlyStatBreakdown(
                    pilotKpis.repWinRows.map((r) => ({
                      label: repNameToSentenceCase(r.displayName),
                      value: r.wins,
                    })),
                  )}
                />
                <StatCard
                  icon={<TrendingDown className="h-5 w-5 text-destructive" />}
                  label="Losses"
                  value={pilotKpis.losses}
                  breakdown={top20PilotMonthlyStatBreakdown(
                    pilotKpis.repLossRows.map((r) => ({
                      label: repNameToSentenceCase(r.displayName),
                      value: r.losses,
                    })),
                  )}
                />
              </div>
            </div>

            <div className="mb-6 rounded-lg border border-border bg-card p-5 glow-card">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="font-display text-lg font-semibold text-foreground">Monthly Goals (by team)</h3>
                  {isGAPhase && (
                    <p className="text-[10px] text-muted-foreground mt-1 max-w-md">
                      Showing top 10 and bottom 10 teams by attach rate. Use search to add teams temporarily.
                    </p>
                  )}
                </div>
                {isGAPhase && gaVisibleIds && pilotTeamRows.length > 0 && (
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {gaExtraTeamIds.size > 0 && (
                      <div className="flex flex-wrap gap-1.5 justify-end max-w-[320px]">
                        {pilotTeamRows
                          .filter((r) => gaExtraTeamIds.has(r.st.id))
                          .map((r) => (
                            <span
                              key={r.st.id}
                              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium"
                            >
                              {pilotSalesTeamShortLabel(r.st.displayName)}
                              <button
                                type="button"
                                className="rounded-full p-0.5 hover:bg-muted"
                                onClick={() =>
                                  setGaExtraTeamIds((prev) => {
                                    const next = new Set(prev);
                                    next.delete(r.st.id);
                                    return next;
                                  })
                                }
                                aria-label={`Remove ${r.st.displayName}`}
                              >
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </span>
                          ))}
                      </div>
                    )}
                    <Popover open={gaGoalsSearchOpen} onOpenChange={setGaGoalsSearchOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex items-center justify-between gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-[10px] text-muted-foreground hover:bg-muted/50 transition-colors w-[220px]"
                        >
                          Search teams to add...
                          <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[220px] p-0" align="end">
                        <Command>
                          <CommandInput placeholder="Search teams..." className="h-8 text-[10px]" />
                          <CommandList>
                            <CommandEmpty className="py-2 text-center text-[10px]">No teams found.</CommandEmpty>
                            <CommandGroup>
                              {pilotTeamRows
                                .filter((r) => !gaVisibleIds.has(r.st.id))
                                .map((r) => (
                                  <CommandItem
                                    key={r.st.id}
                                    value={r.st.displayName}
                                    onSelect={() => {
                                      setGaExtraTeamIds((prev) => new Set(prev).add(r.st.id));
                                      setGaGoalsSearchOpen(false);
                                    }}
                                    className="text-[10px] cursor-pointer"
                                  >
                                    {r.st.displayName}
                                  </CommandItem>
                                ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        <button
                          type="button"
                          onClick={() => handlePilotTeamSort("team")}
                          className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                        >
                          Team
                          {pilotTeamSortCol === "team" ? (
                            pilotTeamSortDir === "asc" ? (
                              <ArrowUp className="h-3 w-3 shrink-0" />
                            ) : (
                              <ArrowDown className="h-3 w-3 shrink-0" />
                            )
                          ) : (
                            <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-40" />
                          )}
                        </button>
                      </th>
                      <th className="text-center py-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[100px]">
                        <button
                          type="button"
                          onClick={() => handlePilotTeamSort("avgMrrWithout")}
                          className="inline-flex w-full items-center justify-center gap-1 hover:text-foreground transition-colors"
                        >
                          Avg MRR (w/o)
                          {pilotTeamSortCol === "avgMrrWithout" ? (
                            pilotTeamSortDir === "asc" ? (
                              <ArrowUp className="h-3 w-3 shrink-0" />
                            ) : (
                              <ArrowDown className="h-3 w-3 shrink-0" />
                            )
                          ) : (
                            <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-40" />
                          )}
                        </button>
                      </th>
                      <th className="text-center py-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[100px]">
                        <button
                          type="button"
                          onClick={() => handlePilotTeamSort("avgMrrWith")}
                          className="inline-flex w-full items-center justify-center gap-1 hover:text-foreground transition-colors"
                        >
                          Avg MRR (w/)
                          {pilotTeamSortCol === "avgMrrWith" ? (
                            pilotTeamSortDir === "asc" ? (
                              <ArrowUp className="h-3 w-3 shrink-0" />
                            ) : (
                              <ArrowDown className="h-3 w-3 shrink-0" />
                            )
                          ) : (
                            <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-40" />
                          )}
                        </button>
                      </th>
                      <th className="text-center py-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[100px]">
                        <button
                          type="button"
                          onClick={() => handlePilotTeamSort("avgPrice")}
                          className="inline-flex w-full items-center justify-center gap-1 hover:text-foreground transition-colors"
                        >
                          Avg Price
                          {pilotTeamSortCol === "avgPrice" ? (
                            pilotTeamSortDir === "asc" ? (
                              <ArrowUp className="h-3 w-3 shrink-0" />
                            ) : (
                              <ArrowDown className="h-3 w-3 shrink-0" />
                            )
                          ) : (
                            <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-40" />
                          )}
                        </button>
                      </th>
                      <th className="text-center py-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-[90px]">
                        <button
                          type="button"
                          onClick={() => handlePilotTeamSort("attachRate")}
                          className="inline-flex w-full items-center justify-center gap-1 hover:text-foreground transition-colors"
                        >
                          Attach Rate
                          {pilotTeamSortCol === "attachRate" ? (
                            pilotTeamSortDir === "asc" ? (
                              <ArrowUp className="h-3 w-3 shrink-0" />
                            ) : (
                              <ArrowDown className="h-3 w-3 shrink-0" />
                            )
                          ) : (
                            <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-40" />
                          )}
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {goalsTablePilotRows.map(({ st, snap, accts, prevW, lastW }) => {
                      const w0 = pilotWowWeeks.w0;
                      const w1 = pilotWowWeeks.w1;
                      return (
                        <tr key={st.id} className="border-b border-border/30">
                          <td className="py-3 pr-3 font-medium text-foreground whitespace-nowrap">{pilotSalesTeamShortLabel(st.displayName)}</td>
                          <td className="py-3 px-2 text-center">
                            <UiTooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex cursor-pointer items-center justify-center gap-0.5 tabular-nums text-xs font-semibold">
                                  {fmtPilotMoney(snap.avgMrrWithout)}
                                  <WowArrow trend={w0 && w1 ? compareWow(lastW?.avgMrrWithout ?? null, prevW?.avgMrrWithout ?? null) : "flat"} />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-md p-3">
                                <p className="text-xs font-semibold mb-1">Accounts</p>
                                <p className="text-xs text-muted-foreground">{accts.avgMrrWithout.join(", ") || "—"}</p>
                              </TooltipContent>
                            </UiTooltip>
                          </td>
                          <td className="py-3 px-2 text-center">
                            <UiTooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex cursor-pointer items-center justify-center gap-0.5 tabular-nums text-xs font-semibold">
                                  {fmtPilotMoney(snap.avgMrrWith)}
                                  <WowArrow trend={w0 && w1 ? compareWow(lastW?.avgMrrWith ?? null, prevW?.avgMrrWith ?? null) : "flat"} />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-md p-3">
                                <p className="text-xs font-semibold mb-1">Accounts</p>
                                <p className="text-xs text-muted-foreground">{accts.avgMrrWith.join(", ") || "—"}</p>
                              </TooltipContent>
                            </UiTooltip>
                          </td>
                          <td className="py-3 px-2 text-center">
                            <UiTooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex cursor-pointer items-center justify-center gap-0.5 tabular-nums text-xs font-semibold">
                                  {fmtPilotMoney(snap.avgPrice)}
                                  <WowArrow trend={w0 && w1 ? compareWow(lastW?.avgPrice ?? null, prevW?.avgPrice ?? null) : "flat"} />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-md p-3">
                                <p className="text-xs font-semibold mb-1">Accounts</p>
                                <p className="text-xs text-muted-foreground">{accts.avgPrice.join(", ") || "—"}</p>
                              </TooltipContent>
                            </UiTooltip>
                          </td>
                          <td className="py-3 px-2 text-center">
                            <UiTooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex cursor-pointer items-center justify-center gap-0.5 tabular-nums text-xs font-semibold">
                                  {fmtPilotAttach(snap.attachRate)}
                                  <WowArrow trend={w0 && w1 ? compareWow(lastW?.attachRate ?? null, prevW?.attachRate ?? null) : "flat"} />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-md p-3">
                                <p className="text-xs font-semibold mb-1">With target / All wins</p>
                                <p className="text-xs text-muted-foreground mb-1">{accts.attachWithTarget.join(", ") || "—"}</p>
                                <p className="text-xs font-semibold">All wins</p>
                                <p className="text-xs text-muted-foreground">{accts.attachAllWins.join(", ") || "—"}</p>
                              </TooltipContent>
                            </UiTooltip>
                          </td>
                        </tr>
                      );
                    })}
                    {pilotCtx.pilotSalesTeams.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                          Assign pilot regions for this month to see team goals.
                        </td>
                      </tr>
                    )}
                    {pilotCtx.pilotSalesTeams.length > 0 && isGAPhase && goalsTablePilotRows.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                          No teams match the current GA view filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {pilotWowWeeks.w0 && pilotWowWeeks.w1 && (
                <p className="text-[10px] text-muted-foreground mt-2">
                  Arrows: WoW trend ({pilotWowWeeks.w0} → {pilotWowWeeks.w1}) on KPIs derived from wins in each week.
                </p>
              )}
            </div>
          </>
          )}

          {/* Empty state */}
          {!isPilotView && activeMembers.length === 0 && (
            <div className="rounded-lg border border-border border-dashed bg-card/50 p-10 text-center glow-card">
              <Users className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="mb-4 text-muted-foreground">No members yet on {team.name}</p>
              <Button onClick={onAddMemberClick} className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="mr-2 h-4 w-4" /> Add First Member
              </Button>
            </div>
          )}

          {/* Week Over Week */}
          <WeekOverWeekView
            team={team}
            isGAPhase={isGAPhase}
            pilotSelectedIds={isGAPhase ? gaFunnelSelectedIds : undefined}
            setPilotSelectedIds={isGAPhase ? setGaFunnelSelectedIds : undefined}
            phaseLabels={phaseLabels}
            phaseCalcConfigs={phaseCalcConfigs}
            pilotFunnel={
              isPilotView && pilotCtx && pilotCtx.pilotSalesTeams.length > 0
                ? {
                    pilotSalesTeams: pilotCtx.pilotSalesTeams,
                    projectTeamAssignments,
                    teamId: team.id,
                    pilotMonthIndex,
                    metricsByWeek,
                    tamRows,
                    winsDetailRows,
                    activityRows,
                    callRows,
                    connectRows,
                    demoRows,
                    opsRows,
                    feedbackRows,
                    superhexRows,
                    metricExclusions: funnelMetricEx,
                  }
                : undefined
            }
          />
        </div>}
      </div>

      {/* ===== WEEKLY DATA GRID ===== */}
      {(members.length > 0 || (isPilotView && pilotCtx && pilotCtx.pilotSalesTeams.length > 0)) && (
        <div id="weekly-data" className="scroll-mt-16">
          <div
            className="mb-5 rounded-xl bg-secondary px-6 py-4 shadow-lg cursor-pointer select-none"
            onClick={() => toggleSection("weekly-data")}
          >
            <div className="flex items-center gap-2">
              {collapsedSections["weekly-data"] ? (
                <ChevronRight className="h-5 w-5 text-primary shrink-0" />
              ) : (
                <ChevronDown className="h-5 w-5 text-primary shrink-0" />
              )}
              <h2 className="font-display text-2xl font-bold tracking-tight text-primary">
                📊 Weekly Data
              </h2>
            </div>
          </div>
          {!collapsedSections["weekly-data"] && <div ref={weeklyScrollRef} className="rounded-lg border border-border bg-card py-5 glow-card overflow-x-auto">
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead>
                <tr className="border-b border-border">
                  <th ref={playerColRef} className="sticky left-0 z-30 bg-card text-left py-2 pl-5 pr-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                    {isPilotView && pilotCtx && pilotCtx.pilotSalesTeams.length > 0 ? "Team" : "Player"}
                  </th>
                  <th className="sticky z-20 bg-card text-left py-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap" style={{ left: playerColW }}>Metric</th>
                  {interleavedCols.map((col) =>
                    col.type === "week" ? (
                      <th key={col.key} className="text-center py-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{col.label}</th>
                    ) : (
                      <th key={`mo-${col.key}`} className="text-center py-2 px-2 text-xs font-bold text-foreground uppercase tracking-wider whitespace-nowrap bg-muted/60">{col.label}</th>
                    )
                  )}
                  <th className="sticky right-0 z-10 bg-card text-center py-2 pl-2 pr-5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const weeks = teamWeeks;
                  const weekKeyList = weeks.map((wk) => wk.key);
                  if (isPilotView && pilotCtx && pilotCtx.pilotSalesTeams.length > 0) {
                    if (isGAPhase && weeklyPilotSalesTeams.length === 0) {
                      return (
                        <tr>
                          <td
                            colSpan={2 + interleavedCols.length + 1}
                            className="py-8 text-center text-sm text-muted-foreground"
                          >
                            No teams in view — GA weekly data follows teams shown in Monthly Goals (top/bottom) or
                            highlighted in Funnel Overview.
                          </td>
                        </tr>
                      );
                    }
                    const hasMetricsTamPilot = weeklyPilotSalesTeams.some((st) => {
                      const asn = projectTeamAssignments.find(
                        (a) => a.teamId === team.id && a.salesTeamId === st.id && a.monthIndex === pilotMonthIndex,
                      );
                      return tamSumForReps(tamRows, repsForSalesTeam(st, asn)) > 0;
                    });
                    return weeklyPilotSalesTeams.map((st) => {
                      const assignment = projectTeamAssignments.find(
                        (a) => a.teamId === team.id && a.salesTeamId === st.id && a.monthIndex === pilotMonthIndex,
                      );
                      const repSet = repsForSalesTeam(st, assignment);
                      const teamTam = tamSumForReps(tamRows, repSet);
                      const pilotFunnelVal = (metKey: keyof FunnelData, wk: string) =>
                        metKey === "tam"
                          ? hasMetricsTamPilot
                            ? teamTam
                            : 0
                          : metKey === "wins"
                            ? pilotWinsInWeek(
                                metricsByWeek,
                                winsDetailRows,
                                team,
                                phaseLabels,
                                phaseCalcConfigs,
                                isGAPhase,
                                repSet,
                                wk,
                                funnelMetricEx,
                              )
                            : sumFunnelMetricWithExclusions(
                                metKey,
                                repSet,
                                wk,
                                metricsByWeek,
                                rawRowsByFunnelMetric,
                                indexedRawRowsByFunnelMetric,
                                funnelMetricEx,
                                prospectingFilterOptions,
                              );
                      const allMetricRows: { label: string; key: keyof FunnelData }[] = [
                        { label: "TAM", key: "tam" },
                        { label: "Activity", key: "activity" },
                        { label: "Call", key: "calls" },
                        { label: "Connect", key: "connects" },
                        { label: "Ops", key: "ops" },
                        { label: "Demo", key: "demos" },
                        { label: "Win", key: "wins" },
                        { label: "Feedback", key: "feedback" },
                      ];
                      const alwaysShow = new Set<string>(["tam", "connects", "wins", "activity"]);
                      const metricRows = allMetricRows.filter(
                        (r) => alwaysShow.has(r.key) || team.enabledGoals[r.key as keyof typeof team.enabledGoals],
                      );
                      const convRates: { label: string; numKey?: keyof FunnelData; denKey?: keyof FunnelData; touchRate?: boolean }[] = hasMetricsTamPilot
                        ? [
                            { label: "% TAM", touchRate: true },
                            { label: "Call→Con %", numKey: "connects", denKey: "calls" },
                            { label: "Con→Demo %", numKey: "demos", denKey: "connects" },
                            { label: "Demo→Win %", numKey: "wins", denKey: "demos" },
                          ]
                        : [
                            { label: "TAM→Call %", numKey: "calls", denKey: "tam" },
                            { label: "Call→Con %", numKey: "connects", denKey: "calls" },
                            { label: "Con→Demo %", numKey: "demos", denKey: "connects" },
                            { label: "Demo→Win %", numKey: "wins", denKey: "demos" },
                          ];
                      const allRows = [
                        ...metricRows.map((met, metIdx) => (
                          <tr key={`${st.id}-${met.key}`} className={`${metIdx === 0 ? "border-t-2 border-border" : ""}`}>
                            {metIdx === 0 && (
                              <td
                                rowSpan={metricRows.length + convRates.length}
                                className="sticky left-0 z-30 bg-card py-2 pl-5 pr-2 font-semibold align-top border-r border-border/50 whitespace-nowrap text-foreground"
                              >
                                {pilotSalesTeamShortLabel(st.displayName)}
                              </td>
                            )}
                            <td className="sticky z-20 bg-card py-1 px-2 text-xs text-muted-foreground whitespace-nowrap" style={{ left: playerColW }}>{met.label}</td>
                            {interleavedCols.map((col) => {
                              if (col.type === "week") {
                                const val = pilotFunnelVal(met.key, col.key);
                                return (
                                  <td key={col.key} className="text-center py-1 px-2 text-foreground tabular-nums">
                                    {val > 0 ? val : <span className="text-muted-foreground/40">—</span>}
                                  </td>
                                );
                              }
                              const moVal =
                                met.key === "tam"
                                  ? hasMetricsTamPilot
                                    ? teamTam
                                    : 0
                                  : col.weekKeys.reduce((s, wk) => s + pilotFunnelVal(met.key, wk), 0);
                              return (
                                <td key={`mo-${col.key}`} className="text-center py-1 px-2 font-semibold text-foreground tabular-nums bg-muted/30">
                                  {moVal > 0 ? moVal : <span className="text-muted-foreground/40">—</span>}
                                </td>
                              );
                            })}
                            <td className="sticky right-0 z-10 bg-card text-center py-1 pl-2 pr-5 font-semibold text-primary tabular-nums">
                              {met.key === "tam"
                                ? hasMetricsTamPilot
                                  ? teamTam || "—"
                                  : "—"
                                : weeks.reduce((s, w) => s + pilotFunnelVal(met.key, w.key), 0)}
                            </td>
                          </tr>
                        )),
                        ...convRates.map((cr) => (
                          <tr key={`${st.id}-${cr.label}`} className="bg-muted/30">
                            <td className="sticky z-20 bg-card py-1 px-2 text-xs font-medium text-accent whitespace-nowrap" style={{ left: playerColW }}>{cr.label}</td>
                            {cr.touchRate ? (
                              interleavedCols.map((col) => (
                                <td
                                  key={col.type === "week" ? col.key : `mo-${col.key}`}
                                  className={`text-center py-1 px-2 text-accent tabular-nums text-xs font-semibold ${col.type === "month" ? "bg-muted/30" : ""}`}
                                >
                                  <span className="text-muted-foreground/40">—</span>
                                </td>
                              ))
                            ) : (
                              interleavedCols.map((col) => {
                                if (col.type === "week") {
                                  const den =
                                    cr.denKey === "tam"
                                      ? hasMetricsTamPilot
                                        ? teamTam
                                        : 0
                                      : pilotFunnelVal(cr.denKey!, col.key);
                                  const num = pilotFunnelVal(cr.numKey!, col.key);
                                  const pct = den > 0 ? ((num / den) * 100).toFixed(0) : "—";
                                  return (
                                    <td key={col.key} className="text-center py-1 px-2 text-accent tabular-nums text-xs font-semibold">
                                      {pct === "—" ? <span className="text-muted-foreground/40">—</span> : `${pct}%`}
                                    </td>
                                  );
                                }
                                const moDen =
                                  cr.denKey === "tam"
                                    ? hasMetricsTamPilot
                                      ? teamTam * col.weekKeys.length
                                      : 0
                                    : col.weekKeys.reduce((s, wk) => s + pilotFunnelVal(cr.denKey!, wk), 0);
                                const moNum = col.weekKeys.reduce((s, wk) => s + pilotFunnelVal(cr.numKey!, wk), 0);
                                const moPct = moDen > 0 ? ((moNum / moDen) * 100).toFixed(0) : "—";
                                return (
                                  <td key={`mo-${col.key}`} className="text-center py-1 px-2 text-accent tabular-nums text-xs font-semibold bg-muted/30">
                                    {moPct === "—" ? <span className="text-muted-foreground/40">—</span> : `${moPct}%`}
                                  </td>
                                );
                              })
                            )}
                            <td className="sticky right-0 z-10 bg-card text-center py-1 pl-2 pr-5 font-semibold text-accent tabular-nums text-xs">
                              {cr.touchRate ? (
                                "—"
                              ) : (
                                (() => {
                                  const totalDen =
                                    cr.denKey === "tam"
                                      ? hasMetricsTamPilot
                                        ? teamTam * weeks.length
                                        : 0
                                      : weeks.reduce((s, w) => s + pilotFunnelVal(cr.denKey!, w.key), 0);
                                  const totalNum = weeks.reduce((s, w) => s + pilotFunnelVal(cr.numKey!, w.key), 0);
                                  return totalDen > 0 ? `${((totalNum / totalDen) * 100).toFixed(0)}%` : "—";
                                })()
                              )}
                            </td>
                          </tr>
                        )),
                      ];
                      return allRows;
                    }).flat();
                  }
                  const hasMetricsTam = members.some((m) => m.touchedTam > 0);
                  return members.map((m, mIdx) => {
                    const allMetricRows: { label: string; key: keyof FunnelData }[] = [
                      { label: "TAM", key: "tam" },
                      { label: "Activity", key: "activity" },
                      { label: "Call", key: "calls" },
                      { label: "Connect", key: "connects" },
                      { label: "Ops", key: "ops" },
                      { label: "Demo", key: "demos" },
                      { label: "Win", key: "wins" },
                      { label: "Feedback", key: "feedback" },
                    ];
                    const alwaysShow = new Set<string>(["tam", "connects", "wins", "activity"]);
                    const metricRows = allMetricRows.filter(
                      (r) => alwaysShow.has(r.key) || team.enabledGoals[r.key as keyof typeof team.enabledGoals]
                    );
                    const convRates: { label: string; numKey?: keyof FunnelData; denKey?: keyof FunnelData; touchRate?: boolean }[] = hasMetricsTam
                      ? [
                          { label: "% TAM", touchRate: true },
                          { label: "Call→Con %", numKey: "connects", denKey: "calls" },
                          { label: "Con→Demo %", numKey: "demos", denKey: "connects" },
                          { label: "Demo→Win %", numKey: "wins", denKey: "demos" },
                        ]
                      : [
                          { label: "TAM→Call %", numKey: "calls", denKey: "tam" },
                          { label: "Call→Con %", numKey: "connects", denKey: "calls" },
                          { label: "Con→Demo %", numKey: "demos", denKey: "connects" },
                          { label: "Demo→Win %", numKey: "wins", denKey: "demos" },
                        ];
                    const allRows = [
                      ...metricRows.map((met, metIdx) => (
                        <tr key={`${m.id}-${met.key}`} className={`${metIdx === 0 ? "border-t-2 border-border" : ""}`}>
                        {metIdx === 0 && (
                            <td rowSpan={metricRows.length + convRates.length} className={`sticky left-0 z-30 bg-card py-2 pl-5 pr-2 font-semibold align-top border-r border-border/50 whitespace-nowrap ${m.isActive ? 'text-foreground' : 'text-muted-foreground italic'}`}>
                              {m.name}
                              {!m.isActive && <span className="block text-[10px] font-normal not-italic text-muted-foreground/60">Former</span>}
                            </td>
                          )}
                          <td className="sticky z-20 bg-card py-1 px-2 text-xs text-muted-foreground whitespace-nowrap" style={{ left: playerColW }}>{met.label}</td>
                          {interleavedCols.map((col) => {
                            if (col.type === "week") {
                              const val = met.key === "tam"
                                ? (hasMetricsTam ? m.touchedTam : getCarriedTam(m, col.key, weekKeyList))
                                : getMemberFunnel(m, col.key)[met.key];
                              return (
                                <td key={col.key} className="text-center py-1 px-2 text-foreground tabular-nums">
                                  {val > 0 ? val : <span className="text-muted-foreground/40">—</span>}
                                </td>
                              );
                            }
                            const moVal = met.key === "tam"
                              ? (hasMetricsTam ? m.touchedTam : getCarriedTam(m, col.weekKeys[col.weekKeys.length - 1], weekKeyList))
                              : col.weekKeys.reduce((s, wk) => s + getMemberFunnel(m, wk)[met.key], 0);
                            return (
                              <td key={`mo-${col.key}`} className="text-center py-1 px-2 font-semibold text-foreground tabular-nums bg-muted/30">
                                {moVal > 0 ? moVal : <span className="text-muted-foreground/40">—</span>}
                              </td>
                            );
                          })}
                          <td className="sticky right-0 z-10 bg-card text-center py-1 pl-2 pr-5 font-semibold text-primary tabular-nums">
                            {met.key === "tam"
                              ? (hasMetricsTam ? (m.touchedTam || "—") : (getCarriedTam(m, weekKeyList[weekKeyList.length - 1] ?? "", weekKeyList) || "—"))
                              : weeks.reduce((s, w) => s + getMemberFunnel(m, w.key)[met.key], 0)}
                          </td>
                        </tr>
                      )),
                      ...convRates.map((cr) => (
                        <tr key={`${m.id}-${cr.label}`} className="bg-muted/30">
                          <td className="sticky z-20 bg-card py-1 px-2 text-xs font-medium text-accent whitespace-nowrap" style={{ left: playerColW }}>{cr.label}</td>
                          {cr.touchRate ? (
                            <>
                              {interleavedCols.map((col) => (
                                <td key={col.type === "week" ? col.key : `mo-${col.key}`} className={`text-center py-1 px-2 text-accent tabular-nums text-xs font-semibold ${col.type === "month" ? "bg-muted/30" : ""}`}>
                                  <span className="text-muted-foreground/40">—</span>
                                </td>
                              ))}
                            </>
                          ) : interleavedCols.map((col) => {
                            if (col.type === "week") {
                              const f = getMemberFunnel(m, col.key);
                              const den = cr.denKey === "tam"
                                ? getCarriedTam(m, col.key, weekKeyList)
                                : f[cr.denKey!];
                              const num = f[cr.numKey!];
                              const pct = den > 0 ? ((num / den) * 100).toFixed(0) : "—";
                              return (
                                <td key={col.key} className="text-center py-1 px-2 text-accent tabular-nums text-xs font-semibold">
                                  {pct === "—" ? <span className="text-muted-foreground/40">—</span> : `${pct}%`}
                                </td>
                              );
                            }
                            const moDen = cr.denKey === "tam"
                              ? col.weekKeys.reduce((s, wk) => s + getCarriedTam(m, wk, weekKeyList), 0)
                              : col.weekKeys.reduce((s, wk) => s + getMemberFunnel(m, wk)[cr.denKey!], 0);
                            const moNum = col.weekKeys.reduce((s, wk) => s + getMemberFunnel(m, wk)[cr.numKey!], 0);
                            const moPct = moDen > 0 ? ((moNum / moDen) * 100).toFixed(0) : "—";
                            return (
                              <td key={`mo-${col.key}`} className="text-center py-1 px-2 text-accent tabular-nums text-xs font-semibold bg-muted/30">
                                {moPct === "—" ? <span className="text-muted-foreground/40">—</span> : `${moPct}%`}
                              </td>
                            );
                          })}
                          <td className="sticky right-0 z-10 bg-card text-center py-1 pl-2 pr-5 font-semibold text-accent tabular-nums text-xs">
                            {cr.touchRate
                              ? (m.touchedTam > 0 ? `${Math.min(100, ((m.touchedAccountsByTeam[team.id] ?? 0) / m.touchedTam) * 100).toFixed(0)}%` : "—")
                              : (() => {
                                  const totalDen = cr.denKey === "tam"
                                    ? weeks.reduce((s, w) => s + getCarriedTam(m, w.key, weekKeyList), 0)
                                    : weeks.reduce((s, w) => s + getMemberFunnel(m, w.key)[cr.denKey!], 0);
                                  const totalNum = weeks.reduce((s, w) => s + getMemberFunnel(m, w.key)[cr.numKey!], 0);
                                  return totalDen > 0 ? `${((totalNum / totalDen) * 100).toFixed(0)}%` : "—";
                                })()
                            }
                          </td>
                        </tr>
                      )),
                    ];
                    return allRows;
                  });
                })()}
                {!isPilotView && (
                <>
                {/* ── Team Monthly Aggregate ── */}
                <tr>
                  <td colSpan={interleavedCols.length + 3} className="py-0">
                    <div className="border-t-4 border-primary/40" />
                  </td>
                </tr>
                {(() => {
                  const hasMetricsTam = members.some((m) => m.touchedTam > 0);
                  const teamMonths = getTeamMonthKeys(teamWeeks);
                  const weekKeyList = teamWeeks.map((wk) => wk.key);
                  const allMetricRows: { label: string; key: keyof FunnelData }[] = [
                    { label: "TAM", key: "tam" },
                    { label: "Activity", key: "activity" },
                    { label: "Call", key: "calls" },
                    { label: "Connect", key: "connects" },
                    { label: "Ops", key: "ops" },
                    { label: "Demo", key: "demos" },
                    { label: "Win", key: "wins" },
                    { label: "Feedback", key: "feedback" },
                  ];
                  const alwaysShow = new Set<string>(["tam", "connects", "wins", "activity"]);
                  const metricRows = allMetricRows.filter(
                    (r) => alwaysShow.has(r.key) || team.enabledGoals[r.key as keyof typeof team.enabledGoals]
                  );
                  const convRates: { label: string; numKey?: keyof FunnelData; denKey?: keyof FunnelData; touchRate?: boolean }[] = hasMetricsTam
                    ? [
                        { label: "% TAM", touchRate: true },
                        { label: "Call→Con %", numKey: "connects", denKey: "calls" },
                        { label: "Con→Demo %", numKey: "demos", denKey: "connects" },
                        { label: "Demo→Win %", numKey: "wins", denKey: "demos" },
                      ]
                    : [
                        { label: "TAM→Call %", numKey: "calls", denKey: "tam" },
                        { label: "Call→Con %", numKey: "connects", denKey: "calls" },
                        { label: "Con→Demo %", numKey: "demos", denKey: "connects" },
                        { label: "Demo→Win %", numKey: "wins", denKey: "demos" },
                      ];
                  const getTeamMonthlyValue = (monthWeekKeys: string[], metKey: keyof FunnelData): number => {
                    if (metKey === "tam") {
                      if (hasMetricsTam) return members.reduce((sum, m) => sum + m.touchedTam, 0);
                      return members.reduce((sum, m) => {
                        const lastWeek = monthWeekKeys[monthWeekKeys.length - 1];
                        return sum + getCarriedTam(m, lastWeek, weekKeyList);
                      }, 0);
                    }
                    return members.reduce((sum, m) =>
                      sum + monthWeekKeys.reduce((ws, wk) => ws + getMemberFunnel(m, wk)[metKey], 0), 0);
                  };
                  const teamTouchRate = (() => {
                    const ta = members.reduce((s, m) => s + (m.touchedAccountsByTeam[team.id] ?? 0), 0);
                    const tt = members.reduce((s, m) => s + m.touchedTam, 0);
                    return tt > 0 ? `${Math.min(100, (ta / tt) * 100).toFixed(0)}%` : "—";
                  })();
                  const nMonths = teamMonths.length;
                  const totalDataCols = interleavedCols.length;
                  const equalMonthSpan = Math.max(1, Math.floor(totalDataCols / nMonths));
                  const spacerSpan = totalDataCols - equalMonthSpan * nMonths;
                  return [
                    <tr key="team-month-header" className="border-t border-border bg-secondary">
                      <td className="sticky left-0 z-30 bg-secondary py-2 pl-5 pr-2 font-bold text-white align-top border-r border-border/50 whitespace-nowrap" rowSpan={metricRows.length + convRates.length + 1}>
                        Team
                      </td>
                      <td className="sticky z-20 bg-secondary py-2 px-2 text-xs font-semibold text-white uppercase tracking-wider whitespace-nowrap" style={{ left: playerColW }}></td>
                      {spacerSpan > 0 && <td colSpan={spacerSpan} className="bg-secondary" />}
                      {teamMonths.map((mo) => (
                        <td key={mo.key} colSpan={equalMonthSpan} className="text-center py-2 px-2 text-xs font-semibold text-white uppercase tracking-wider whitespace-nowrap bg-secondary">
                          {mo.label}
                        </td>
                      ))}
                      <td className="sticky right-0 z-10 bg-secondary text-center py-2 pl-2 pr-5 text-xs font-semibold text-white uppercase tracking-wider">Total</td>
                    </tr>,
                    ...metricRows.map((met) => (
                      <tr key={`team-${met.key}`}>
                        <td className="sticky z-20 bg-card py-1 px-2 text-xs text-muted-foreground whitespace-nowrap" style={{ left: playerColW }}>{met.label}</td>
                        {spacerSpan > 0 && <td colSpan={spacerSpan} />}
                        {teamMonths.map((mo) => {
                          const val = getTeamMonthlyValue(mo.weekKeys, met.key);
                          return (
                            <td key={mo.key} colSpan={equalMonthSpan} className="text-center py-1 px-2 text-foreground tabular-nums font-medium">
                              {val > 0 ? val : <span className="text-muted-foreground/40">—</span>}
                            </td>
                          );
                        })}
                        <td className="sticky right-0 z-10 bg-card text-center py-1 pl-2 pr-5 font-semibold text-primary tabular-nums">
                          {met.key === "tam"
                            ? (hasMetricsTam
                                ? (members.reduce((s, m) => s + m.touchedTam, 0) || "—")
                                : (members.reduce((s, m) => s + getCarriedTam(m, weekKeyList[weekKeyList.length - 1] ?? "", weekKeyList), 0) || "—"))
                            : teamMonths.reduce((s, mo) => s + getTeamMonthlyValue(mo.weekKeys, met.key), 0)}
                        </td>
                      </tr>
                    )),
                    ...convRates.map((cr) => (
                      <tr key={`team-${cr.label}`} className="bg-muted/30">
                        <td className="sticky z-20 bg-card py-1 px-2 text-xs font-medium text-accent whitespace-nowrap" style={{ left: playerColW }}>{cr.label}</td>
                        {spacerSpan > 0 && <td colSpan={spacerSpan} />}
                        {cr.touchRate ? (
                          <>
                            {teamMonths.map((mo) => (
                              <td key={mo.key} colSpan={equalMonthSpan} className="text-center py-1 px-2 text-accent tabular-nums text-xs font-semibold">
                                <span className="text-muted-foreground/40">—</span>
                              </td>
                            ))}
                          </>
                        ) : teamMonths.map((mo) => {
                          const num = getTeamMonthlyValue(mo.weekKeys, cr.numKey!);
                          const den = getTeamMonthlyValue(mo.weekKeys, cr.denKey!);
                          const pct = den > 0 ? ((num / den) * 100).toFixed(0) : "—";
                          return (
                            <td key={mo.key} colSpan={equalMonthSpan} className="text-center py-1 px-2 text-accent tabular-nums text-xs font-semibold">
                              {pct === "—" ? <span className="text-muted-foreground/40">—</span> : `${pct}%`}
                            </td>
                          );
                        })}
                        <td className="sticky right-0 z-10 bg-card text-center py-1 pl-2 pr-5 font-semibold text-accent tabular-nums text-xs">
                          {cr.touchRate
                            ? teamTouchRate
                            : (() => {
                                const totalNum = getTeamMonthlyValue(weekKeyList, cr.numKey!);
                                const totalDen = getTeamMonthlyValue(weekKeyList, cr.denKey!);
                                return totalDen > 0 ? `${((totalNum / totalDen) * 100).toFixed(0)}%` : "—";
                              })()
                          }
                        </td>
                      </tr>
                    )),
                  ];
                })()}
                </>
                )}
              </tbody>
            </table>
          </div>}
        </div>
      )}

      {/* ===== PLAYER'S SECTION ===== */}
      <div id="players-section" className="scroll-mt-16">
        <div
          className="mb-5 rounded-xl bg-secondary px-6 py-4 shadow-lg cursor-pointer select-none"
          onClick={() => toggleSection("players-section")}
        >
          <div className="flex items-center gap-2">
            {collapsedSections["players-section"] ? (
              <ChevronRight className="h-5 w-5 text-primary shrink-0" />
            ) : (
              <ChevronDown className="h-5 w-5 text-primary shrink-0" />
            )}
            <h2 className="font-display text-2xl font-bold tracking-tight text-primary inline-flex items-center gap-2">
              <Scale className="h-6 w-6 text-primary shrink-0" /> Rep Self-Overrides
            </h2>
          </div>
        </div>
        {!collapsedSections["players-section"] && <div className="space-y-6">

          {activeMembers.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-5 glow-card">
              <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
                <h3 className="font-display text-lg font-semibold text-foreground">Your Funnels</h3>
                <div className="flex items-center gap-3">
                  <Select value={repOverrideWeek} onValueChange={setRepOverrideWeek}>
                    <SelectTrigger className="h-8 w-40 bg-background border-border/50 text-foreground text-xs">
                      <SelectValue placeholder="Select week" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border z-50 max-h-60">
                      {teamWeeks.map((w) => (
                        <SelectItem key={w.key} value={w.key}>
                          {w.label}{w.key === currentWeek ? " (current)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground italic">Update weekly by Tuesday 12pm EST</span>
                </div>
              </div>
              <div className="space-y-4">
                {activeMembers.map((m) => {
                  const f = getMemberFunnel(m, repOverrideWeek);
                  const role = (m.funnelByWeek?.[repOverrideWeek] as WeeklyFunnel)?.role;
                  const upsertFunnelField = (updates: Record<string, unknown>) => {
                    const current = getMemberFunnel(m, repOverrideWeek);
                    dbMutate(
                      supabase
                        .from("weekly_funnels")
                        .upsert(
                          {
                            member_id: m.id,
                            week_key: repOverrideWeek,
                            tam: current.tam,
                            calls: current.calls,
                            connects: current.connects,
                            ops: current.ops,
                            demos: current.demos,
                            wins: current.wins,
                            feedback: current.feedback,
                            activity: current.activity,
                            role: current.role ?? null,
                            submitted: current.submitted ?? false,
                            submitted_at: current.submittedAt ?? null,
                            ...updates,
                          },
                          { onConflict: "member_id,week_key" }
                        ),
                      "upsert funnel",
                      reloadAll,
                    );
                  };
                  const updateFunnel = (field: keyof FunnelData, value: string) => {
                    const num = Math.max(0, parseInt(value) || 0);
                    updateTeam(team.id, (t) => ({
                      ...t,
                      members: t.members.map((mem) =>
                        mem.id === m.id ? { ...mem, funnelByWeek: { ...mem.funnelByWeek, [repOverrideWeek]: { ...getMemberFunnel(mem, repOverrideWeek), [field]: num } } } : mem
                      ),
                    }));
                    const debounceKey = `${m.id}:${field}`;
                    clearTimeout(funnelDebounceRef.current[debounceKey]);
                    funnelDebounceRef.current[debounceKey] = setTimeout(() => {
                      upsertFunnelField({ [field]: num });
                    }, 300);
                  };
                  const updateRole = (val: string) => {
                    updateTeam(team.id, (t) => ({
                      ...t,
                      members: t.members.map((mem) =>
                        mem.id === m.id ? { ...mem, funnelByWeek: { ...mem.funnelByWeek, [repOverrideWeek]: { ...getMemberFunnel(mem, repOverrideWeek), role: val as WeeklyRole } } } : mem
                      ),
                    }));
                    upsertFunnelField({ role: val });
                  };
                  const isLocked = f.submitted || (isPastWeek && !unlockedPastEdits.has(`${m.id}:${repOverrideWeek}`));
                  return (
                    <div key={m.id} className={`rounded-md p-3 ${isLocked ? 'bg-primary/10 border border-primary/30' : 'bg-secondary/20'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-semibold text-foreground">{m.name}</p>
                        {f.submitted && (
                          <span className="text-xs font-medium text-primary flex items-center gap-1">
                            ✅ Submitted {f.submittedAt ? `on ${f.submittedAt}` : ''}
                          </span>
                        )}
                      </div>
                      <div className="mb-2 flex items-center gap-2">
                        <Select value={role || ""} onValueChange={updateRole} disabled={isLocked}>
                          <SelectTrigger className="h-8 w-full sm:w-48 bg-background border-border/50 text-foreground text-xs">
                            <SelectValue placeholder="Select role this week" />
                          </SelectTrigger>
                          <SelectContent className="bg-card border-border z-50">
                            {allRoles.map((r) => (
                              <SelectItem key={r} value={r}>{r}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Dialog open={addRoleOpen} onOpenChange={setAddRoleOpen}>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground">
                              <Plus className="h-3 w-3 mr-1" /> Add Role
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="bg-card border-border">
                            <DialogHeader>
                              <DialogTitle className="font-display text-foreground">Add Custom Role</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-3 pt-2">
                              <Input placeholder="Role name" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} className="bg-secondary/20 border-border text-foreground placeholder:text-muted-foreground" />
                              <Button onClick={addRole} className="w-full bg-primary text-primary-foreground hover:bg-primary/90">Add</Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Cx Called</label>
                          <Input type="number" min={0} value={f.calls || ""} onChange={(e) => updateFunnel("calls", e.target.value)} disabled={isLocked} className="h-8 bg-background border-border/50 text-foreground text-sm disabled:opacity-60" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Connects</label>
                          <Input type="number" min={0} value={f.connects || ""} onChange={(e) => updateFunnel("connects", e.target.value)} disabled={isLocked} className="h-8 bg-background border-border/50 text-foreground text-sm disabled:opacity-60" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Ops</label>
                          <Input type="number" min={0} value={f.ops || ""} onChange={(e) => updateFunnel("ops", e.target.value)} disabled={isLocked} className="h-8 bg-background border-border/50 text-foreground text-sm disabled:opacity-60" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Demos</label>
                          <Input type="number" min={0} value={f.demos || ""} onChange={(e) => updateFunnel("demos", e.target.value)} disabled={isLocked} className="h-8 bg-background border-border/50 text-foreground text-sm disabled:opacity-60" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Wins</label>
                          <Input type="number" min={0} value={f.wins || ""} onChange={(e) => updateFunnel("wins", e.target.value)} disabled={isLocked} className="h-8 bg-background border-border/50 text-foreground text-sm disabled:opacity-60" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Feedback</label>
                          <Input type="number" min={0} value={f.feedback || ""} onChange={(e) => updateFunnel("feedback", e.target.value)} disabled={isLocked} className="h-8 bg-background border-border/50 text-foreground text-sm disabled:opacity-60" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Activity</label>
                          <Input type="number" min={0} value={f.activity || ""} onChange={(e) => updateFunnel("activity", e.target.value)} disabled={isLocked} className="h-8 bg-background border-border/50 text-foreground text-sm disabled:opacity-60" />
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span>Call→Connect: <strong className="text-primary">{f.calls > 0 ? ((f.connects / f.calls) * 100).toFixed(0) : 0}%</strong></span>
                        <span>Connect→Demo: <strong className="text-accent">{f.connects > 0 ? ((f.demos / f.connects) * 100).toFixed(0) : 0}%</strong></span>
                        <span>Demo→Win: <strong className="text-primary">{f.demos > 0 ? ((f.wins / f.demos) * 100).toFixed(0) : 0}%</strong></span>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        {!isLocked ? (
                          <>
                            <p className="text-[10px] text-muted-foreground italic">Any value entered in here will completely overwrite the value given by the report.</p>
                            <Button
                              size="sm"
                              onClick={() => {
                                const now = new Date().toLocaleDateString();
                                updateTeam(team.id, (t) => ({
                                  ...t,
                                  members: t.members.map((mem) =>
                                    mem.id === m.id
                                      ? {
                                          ...mem,
                                          funnelByWeek: {
                                            ...mem.funnelByWeek,
                                            [repOverrideWeek]: {
                                              ...getMemberFunnel(mem, repOverrideWeek),
                                              submitted: true,
                                              submittedAt: now,
                                            },
                                          },
                                        }
                                      : mem
                                  ),
                                }));
                                upsertFunnelField({ submitted: true, submitted_at: new Date().toISOString() });
                              }}
                              className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs h-8 px-4"
                            >
                              Submit Week
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditDialogTarget({ memberId: m.id, weekKey: repOverrideWeek });
                              setEditDialogName("");
                              setEditDialogOpen(true);
                            }}
                            className="ml-auto text-xs h-7 border-border text-muted-foreground hover:text-foreground"
                          >
                            Edit Submission
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle className="font-display text-foreground">Edit Past Submission</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                This week was already submitted. Please enter your name to log this edit.
              </p>
              <div className="space-y-3 pt-2">
                <Input
                  placeholder="Your name"
                  value={editDialogName}
                  onChange={(e) => setEditDialogName(e.target.value)}
                  className="bg-secondary/20 border-border text-foreground placeholder:text-muted-foreground"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmEditSubmission();
                  }}
                />
                <Button
                  onClick={confirmEditSubmission}
                  disabled={!editDialogName.trim()}
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Confirm Edit
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Stories */}
          {allStories.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-5 glow-card">
              <div className="mb-4 flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-primary" />
                <h3 className="font-display text-lg font-semibold text-foreground">Win Stories</h3>
                <span className="ml-auto text-xs text-muted-foreground">Weirdest story of the week wins a prize 🏆</span>
              </div>
              <div className="space-y-3">
                {allStories.map((s) => (
                  <div key={s.id} className="rounded-md bg-secondary/20 px-4 py-3">
                    <div className="mb-1 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-primary">{s.memberName}</span>
                        <span className="text-xs text-accent">@ {s.restaurant}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{s.date}</span>
                    </div>
                    <p className="text-sm text-foreground/80">{s.story}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>}
      </div>

      {/* ===== ACTIVATION / ADOPTION (placeholder) ===== */}
      <div id="activation-adoption" className="scroll-mt-16" />

      {/* ===== GTMx IMPACT (placeholder) ===== */}
      <div id="gtmx-impact" className="scroll-mt-16" />
    </div>
  );
});

const GOAL_METRIC_TO_CHART_LABEL: Record<GoalMetric, string> = {
  calls: "Call",
  ops: "Ops",
  demos: "Demo",
  wins: "Win",
  feedback: "Feedback",
  activity: "Activity",
};

function getDefaultMetrics(team: Team): Set<string> {
  const defaults = new Set<string>(["Win"]);
  for (const [metric, enabled] of Object.entries(team.enabledGoals)) {
    if (enabled) {
      const label = GOAL_METRIC_TO_CHART_LABEL[metric as GoalMetric];
      if (label) defaults.add(label);
    }
  }
  if ((team.acceleratorMode ?? 'basic') === 'basic') {
    for (const [metric, cfg] of Object.entries(team.basicAcceleratorConfig ?? {})) {
      if (cfg?.enabled) {
        const label = GOAL_METRIC_TO_CHART_LABEL[metric as GoalMetric];
        if (label) defaults.add(label);
      }
    }
  } else {
    for (const [metric, rules] of Object.entries(team.acceleratorConfig)) {
      if (rules?.some((r) => r.enabled)) {
        const label = GOAL_METRIC_TO_CHART_LABEL[metric as GoalMetric];
        if (label) defaults.add(label);
      }
    }
  }
  return defaults;
}

type WeekOverWeekPilotFunnel = {
  pilotSalesTeams: SalesTeam[];
  projectTeamAssignments: ProjectTeamAssignment[];
  teamId: string;
  pilotMonthIndex: number;
  metricsByWeek: MetricsByWeekBundle;
  tamRows: Record<string, unknown>[];
  winsDetailRows: Record<string, unknown>[];
  activityRows: Record<string, unknown>[];
  callRows: Record<string, unknown>[];
  connectRows: Record<string, unknown>[];
  demoRows: Record<string, unknown>[];
  opsRows: Record<string, unknown>[];
  feedbackRows: Record<string, unknown>[];
  superhexRows: Record<string, unknown>[];
  metricExclusions: MetricExclusionRow[];
};

type PilotFunnelRow = { id: string; name: string; chartName: string; repKeys: Set<string>; tamTotal: number };

function WeekOverWeekView({
  team,
  pilotFunnel,
  isGAPhase = false,
  pilotSelectedIds,
  setPilotSelectedIds,
  phaseLabels,
  phaseCalcConfigs,
}: {
  team: Team;
  pilotFunnel?: WeekOverWeekPilotFunnel;
  isGAPhase?: boolean;
  pilotSelectedIds?: Set<string>;
  setPilotSelectedIds?: React.Dispatch<React.SetStateAction<Set<string>>>;
  phaseLabels: Record<number, string>;
  phaseCalcConfigs: Record<string, Record<number, PhaseCalcConfig>>;
}) {
  const [internalPilotSelected, setInternalPilotSelected] = useState<Set<string>>(() => new Set());
  const selectedPlayers = pilotSelectedIds ?? internalPilotSelected;
  const setSelectedPlayers = setPilotSelectedIds ?? setInternalPilotSelected;
  const [selectedMetrics, setSelectedMetrics] = useState<Set<string>>(() => getDefaultMetrics(team));
  const [chartRange, setChartRange] = useState<ChartRange>(readChartRange);
  useEffect(() => { setSelectedMetrics(getDefaultMetrics(team)); }, [team.id]);
  const chartColors = useChartColors();
  const members = team.members;

  const [funnelSearchOpen, setFunnelSearchOpen] = useState(false);

  const pilotRows: PilotFunnelRow[] | null = useMemo(() => {
    if (!pilotFunnel?.pilotSalesTeams.length) return null;
    const { pilotSalesTeams, projectTeamAssignments, teamId, pilotMonthIndex, tamRows } = pilotFunnel;
    return pilotSalesTeams.map((st) => {
      const asn = projectTeamAssignments.find(
        (a) => a.teamId === teamId && a.salesTeamId === st.id && a.monthIndex === pilotMonthIndex,
      );
      const repKeys = repsForSalesTeam(st, asn);
      const name = st.displayName;
      const chartName = isGAPhase ? pilotSalesTeamShortLabel(name) : name;
      return { id: st.id, name, chartName, repKeys, tamTotal: tamSumForReps(tamRows, repKeys) };
    });
  }, [pilotFunnel, isGAPhase]);

  const isPilotChart = pilotRows !== null && pilotRows.length > 0;
  const bundle = pilotFunnel?.metricsByWeek;
  const pilotWinsDetailRows = pilotFunnel?.winsDetailRows;
  const pilotChartMetricEx = pilotFunnel?.metricExclusions ?? [];
  const pilotFunnelRawByMetric: Record<MetricExclusionMetric, Record<string, unknown>[] | undefined> | null =
    pilotFunnel
      ? {
          activity: pilotFunnel.activityRows,
          calls: pilotFunnel.callRows,
          connects: pilotFunnel.connectRows,
          demos: pilotFunnel.demoRows,
          ops: pilotFunnel.opsRows,
          wins: pilotFunnel.winsDetailRows,
          feedback: pilotFunnel.feedbackRows,
        }
      : null;
  const pilotFunnelIndexedByMetric: Record<MetricExclusionMetric, IndexedRowsByRepAndWeek | undefined> | null =
    pilotFunnel
      ? {
          activity: indexRowsByRepAndWeek(pilotFunnel.activityRows, "activity"),
          calls: indexRowsByRepAndWeek(pilotFunnel.callRows, "calls"),
          connects: indexRowsByRepAndWeek(pilotFunnel.connectRows, "connects"),
          demos: indexRowsByRepAndWeek(pilotFunnel.demoRows, "demos"),
          ops: indexRowsByRepAndWeek(pilotFunnel.opsRows, "ops"),
          wins: indexRowsByRepAndWeek(pilotFunnel.winsDetailRows, "wins"),
          feedback: indexRowsByRepAndWeek(pilotFunnel.feedbackRows, "feedback"),
        }
      : null;
  const prospectingFilterOptions = useMemo(
    () => {
      if (!pilotFunnel) return undefined;
      const lookups = new Map<string, { accountIds: Set<string>; accountNames: Set<string> }>();
      const notesSets = new Set<string>();
      const addNotes = (notes: string[] | undefined) => {
        if (!notes || notes.length === 0) return;
        const key = notes.map((n) => n.toLowerCase().trim()).sort().join("||");
        if (!key) return;
        notesSets.add(key);
      };
      addNotes(resolvePhaseCalcConfig(team, undefined, phaseCalcConfigs).prospectingNotes);
      for (const cfg of Object.values(phaseCalcConfigs[team.id] ?? {})) addNotes(cfg.prospectingNotes);
      for (const key of notesSets) {
        const notes = key.split("||").filter(Boolean);
        lookups.set(key, buildProspectingNotesAccountSets(pilotFunnel.superhexRows, notes));
      }
      return {
        team,
        phaseLabels,
        phaseCalcByTeam: phaseCalcConfigs,
        prospectingLookupByKey: lookups,
      };
    },
    [pilotFunnel, team, phaseLabels, phaseCalcConfigs],
  );

  const allWeeks = useMemo(() => getTeamWeekKeys(team.startDate, team.endDate), [team.startDate, team.endDate]);
  const maxWeeks = chartRange === "all" ? allWeeks.length : parseInt(chartRange);
  const weeks = useMemo(() => allWeeks.slice(-maxWeeks), [allWeeks, maxWeeks]);

  const handleRangeChange = (v: ChartRange) => { setChartRange(v); saveChartRange(v); };

  const currentWeek = getCurrentWeekKey();

  const weekKeyList = weeks.map((w) => w.key);
  const hasMetricsTam = isPilotChart
    ? (pilotRows ?? []).some((p) => p.tamTotal > 0)
    : members.some((m) => m.touchedTam > 0);

  const chartData = useMemo(() => weeks.map((week) => {
    const row: Record<string, unknown> = { week: week.label };
    if (isPilotChart && pilotRows && bundle) {
      METRIC_KEYS.forEach(({ key, label }) => {
        if (key === "tam") {
          row[label] = hasMetricsTam
            ? pilotRows.reduce((s, p) => s + p.tamTotal, 0)
            : 0;
        } else {
          row[label] = pilotRows.reduce(
            (s, p) =>
              s +
              (key === "wins"
                ? pilotWinsInWeek(
                    bundle,
                    pilotWinsDetailRows,
                    team,
                    phaseLabels,
                    phaseCalcConfigs,
                    isGAPhase,
                    p.repKeys,
                    week.key,
                    pilotChartMetricEx,
                  )
                : sumFunnelMetricWithExclusions(
                    key,
                    p.repKeys,
                    week.key,
                    bundle,
                    pilotFunnelRawByMetric!,
                    pilotFunnelIndexedByMetric!,
                    pilotChartMetricEx,
                    prospectingFilterOptions,
                  )),
            0,
          );
        }
      });
      pilotRows.forEach((p) => {
        if (!selectedPlayers.has(p.id)) return;
        METRIC_KEYS.forEach(({ key, label }) => {
          row[`${p.chartName} ${label}`] =
            key === "tam"
              ? (hasMetricsTam ? p.tamTotal : 0)
              : key === "wins"
                ? pilotWinsInWeek(
                    bundle,
                    pilotWinsDetailRows,
                    team,
                    phaseLabels,
                    phaseCalcConfigs,
                    isGAPhase,
                    p.repKeys,
                    week.key,
                    pilotChartMetricEx,
                  )
                : sumFunnelMetricWithExclusions(
                    key,
                    p.repKeys,
                    week.key,
                    bundle,
                    pilotFunnelRawByMetric!,
                    pilotFunnelIndexedByMetric!,
                    pilotChartMetricEx,
                    prospectingFilterOptions,
                  );
        });
      });
      row._roles = {};
      return row;
    }
    METRIC_KEYS.forEach(({ key, label }) => {
      row[label] =
        key === "tam"
          ? hasMetricsTam
            ? members.reduce((s, m) => s + m.touchedTam, 0)
            : members.reduce((s, m) => s + getCarriedTam(m, week.key, weekKeyList), 0)
          : members.reduce((s, m) => s + getMemberFunnel(m, week.key)[key], 0);
    });
    members.forEach((m) => {
      if (selectedPlayers.has(m.id)) {
        METRIC_KEYS.forEach(({ key, label }) => {
          row[`${m.name} ${label}`] =
            key === "tam"
              ? hasMetricsTam
                ? m.touchedTam
                : getCarriedTam(m, week.key, weekKeyList)
              : getMemberFunnel(m, week.key)[key];
        });
      }
    });
    const roles: Record<string, string> = {};
    members.forEach((m) => {
      const funnel = m.funnelByWeek?.[week.key] as WeeklyFunnel | undefined;
      if (funnel?.role) roles[m.name] = funnel.role;
    });
    row._roles = roles;
    return row;
  }), [weeks, isPilotChart, pilotRows, bundle, selectedPlayers, pilotWinsDetailRows, team, phaseLabels, phaseCalcConfigs, isGAPhase, pilotChartMetricEx, pilotFunnelRawByMetric, pilotFunnelIndexedByMetric, prospectingFilterOptions, hasMetricsTam, members, weekKeyList]);

  const togglePlayer = (id: string) => {
    setSelectedPlayers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleMetric = (label: string) => {
    setSelectedMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const selectedMembers = members.filter((m) => selectedPlayers.has(m.id));
  const selectedPilotRows =
    isPilotChart && pilotRows ? pilotRows.filter((p) => selectedPlayers.has(p.id)) : [];
  const tooltipRenderer = useCallback(
    (props: any) => <FunnelTooltipContent {...props} chartColors={chartColors} />,
    [chartColors],
  );

  return (
    <div className="rounded-lg border border-border bg-card p-5 glow-card">
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-foreground">
          {team.name} — Funnel Overview
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={chartRange}
            onChange={(e) => handleRangeChange(e.target.value as ChartRange)}
            className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground outline-none transition-colors hover:bg-muted/80 focus:ring-1 focus:ring-primary"
          >
            {CHART_RANGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <div className="flex flex-wrap gap-1">
          {METRIC_KEYS.map(({ label }) => {
            const isActive = selectedMetrics.has(label);
            return (
              <button
                key={label}
                onClick={() => toggleMetric(label)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  isActive
                    ? "shadow text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
                style={isActive ? { backgroundColor: METRIC_COLORS[label] } : {}}
              >
                {label}
              </button>
            );
          })}
          </div>
        </div>
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
            <XAxis dataKey="week" tick={{ fill: chartColors.axisText, fontSize: 12 }} axisLine={{ stroke: chartColors.axisLine }} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fill: chartColors.axisText, fontSize: 12 }} axisLine={{ stroke: chartColors.axisLine }} tickLine={false} />
            <Tooltip content={tooltipRenderer} />
            <Legend />
            {METRIC_KEYS.map(({ label }) =>
              selectedMetrics.has(label) ? (
                <Line key={label} type="monotone" dataKey={label} stroke={METRIC_COLORS[label]} strokeWidth={2.5} dot={{ r: 4 }} />
              ) : null
            )}
            
            {(isPilotChart && pilotRows ? pilotRows : members).map((ent, i) => {
              const id = isPilotChart ? (ent as PilotFunnelRow).id : (ent as TeamMember).id;
              const name = isPilotChart ? (ent as PilotFunnelRow).chartName : (ent as TeamMember).name;
              return selectedPlayers.has(id)
                ? METRIC_KEYS.filter(({ label }) => selectedMetrics.has(label)).map(({ label }) => (
                    <Line key={`${id}-${label}`} type="monotone" dataKey={`${name} ${label}`} stroke={PLAYER_COLORS[i % PLAYER_COLORS.length]} strokeWidth={1.5} strokeDasharray="5 3" dot={{ r: 3 }} />
                  ))
                : null;
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {(members.length > 0 || isPilotChart) && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            {isPilotChart ? (isGAPhase ? "Highlight teams (weekly chart)" : "Select teams") : "Select players"}
          </p>
          {isPilotChart && isGAPhase && pilotRows ? (
            <div className="space-y-2">
              {selectedPlayers.size > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {pilotRows
                    .filter((p) => selectedPlayers.has(p.id))
                    .map((p, i) => (
                      <span
                        key={p.id}
                        className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5 text-[10px] font-semibold"
                        style={{
                          borderColor: PLAYER_COLORS[i % PLAYER_COLORS.length],
                          color: PLAYER_COLORS[i % PLAYER_COLORS.length],
                        }}
                      >
                        {p.chartName}
                        <button
                          type="button"
                          className="rounded-full p-0.5 hover:bg-muted"
                          onClick={() => togglePlayer(p.id)}
                          aria-label={`Remove ${p.chartName}`}
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    ))}
                </div>
              )}
              <Popover open={funnelSearchOpen} onOpenChange={setFunnelSearchOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center justify-between gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-[10px] text-muted-foreground hover:bg-muted/50 transition-colors w-[220px]"
                  >
                    Search teams to highlight...
                    <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[260px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search teams..." className="h-8 text-[10px]" />
                    <CommandList>
                      <CommandEmpty className="py-2 text-center text-[10px]">No teams found.</CommandEmpty>
                      <CommandGroup>
                        {pilotRows
                          .filter((p) => !selectedPlayers.has(p.id))
                          .map((p) => (
                            <CommandItem
                              key={p.id}
                              value={p.name}
                              onSelect={() => {
                                togglePlayer(p.id);
                                setFunnelSearchOpen(false);
                              }}
                              className="text-[10px] cursor-pointer"
                            >
                              {p.chartName}
                            </CommandItem>
                          ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          ) : (
          <div className="flex flex-wrap gap-2">
            {isPilotChart && pilotRows
              ? pilotRows.map((p, i) => {
                  const isActive = selectedPlayers.has(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => togglePlayer(p.id)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all flex flex-col items-center ${
                        isActive ? "shadow" : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                      style={isActive ? { backgroundColor: PLAYER_COLORS[i % PLAYER_COLORS.length], color: "white" } : {}}
                    >
                      <span>{p.chartName}</span>
                      <span className="text-[10px] opacity-70 font-normal">Pilot region</span>
                    </button>
                  );
                })
              : members.map((m, i) => {
                  const isActive = selectedPlayers.has(m.id);
                  const weekFunnel = getMemberFunnel(m, currentWeek) as WeeklyFunnel;
                  const role = weekFunnel.role || "—";
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => togglePlayer(m.id)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all flex flex-col items-center ${
                        isActive
                          ? "shadow"
                          : `bg-muted text-muted-foreground hover:bg-muted/80 ${!m.isActive ? "opacity-50" : ""}`
                      }`}
                      style={isActive ? { backgroundColor: PLAYER_COLORS[i % PLAYER_COLORS.length], color: "white" } : {}}
                    >
                      <span>{m.name}{!m.isActive ? " (Former)" : ""}</span>
                      <span className="text-[10px] opacity-70 font-normal">{role}</span>
                    </button>
                  );
                })}
          </div>
          )}

          {!isPilotChart && selectedMembers.length > 0 && (
            <div className="mt-3 space-y-2">
              {selectedMembers.map((m) => {
                const validWeeks = weeks.filter((w) => {
                  const f = getMemberFunnel(m, w.key);
                  const tam = hasMetricsTam ? m.touchedTam : getCarriedTam(m, w.key, weekKeyList);
                  return tam > 0 || f.calls > 0 || f.connects > 0 || f.demos > 0 || f.wins > 0;
                });
                const totals = validWeeks.reduce(
                  (acc, w) => {
                    const f = getMemberFunnel(m, w.key);
                    const tam = hasMetricsTam ? 0 : getCarriedTam(m, w.key, weekKeyList);
                    return {
                      tam: acc.tam + tam,
                      calls: acc.calls + (f.calls || 0),
                      connects: acc.connects + (f.connects || 0),
                      demos: acc.demos + (f.demos || 0),
                      wins: acc.wins + (f.wins || 0),
                    };
                  },
                  { tam: 0, calls: 0, connects: 0, demos: 0, wins: 0 },
                );
                const firstConvRate = hasMetricsTam
                  ? (m.touchedTam > 0 ? Math.min(100, ((m.touchedAccountsByTeam[team.id] ?? 0) / m.touchedTam) * 100) : 0)
                  : (totals.tam > 0 ? (totals.calls / totals.tam) * 100 : 0);
                const callToConnect = totals.calls > 0 ? (totals.connects / totals.calls) * 100 : 0;
                const connectToDemo = totals.connects > 0 ? (totals.demos / totals.connects) * 100 : 0;
                const demoToWin = totals.demos > 0 ? (totals.wins / totals.demos) * 100 : 0;
                return (
                  <div key={m.id} className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="font-semibold" style={{ color: PLAYER_COLORS[members.indexOf(m) % PLAYER_COLORS.length] }}>{m.name}:</span>
                    <span>{hasMetricsTam ? "% TAM" : "TAM→Call"}: <strong className="text-foreground">{firstConvRate.toFixed(0)}%</strong></span>
                    <span>Call→Connect: <strong className="text-foreground">{callToConnect.toFixed(0)}%</strong></span>
                    <span>Connect→Demo: <strong className="text-foreground">{connectToDemo.toFixed(0)}%</strong></span>
                    <span>Demo→Win: <strong className="text-foreground">{demoToWin.toFixed(0)}%</strong></span>
                  </div>
                );
              })}
            </div>
          )}

          {isPilotChart && bundle && selectedPilotRows.length > 0 && (
            <div className="mt-3 space-y-2">
              {selectedPilotRows.map((p) => {
                const idx = pilotRows!.indexOf(p);
                const validWeeks = weeks.filter((w) => {
                  const tam = hasMetricsTam ? p.tamTotal : 0;
                  const calls = sumFunnelMetricWithExclusions(
                    "calls",
                    p.repKeys,
                    w.key,
                    bundle,
                    pilotFunnelRawByMetric!,
                    pilotFunnelIndexedByMetric!,
                    pilotChartMetricEx,
                    prospectingFilterOptions,
                  );
                  const connects = sumFunnelMetricWithExclusions(
                    "connects",
                    p.repKeys,
                    w.key,
                    bundle,
                    pilotFunnelRawByMetric!,
                    pilotFunnelIndexedByMetric!,
                    pilotChartMetricEx,
                    prospectingFilterOptions,
                  );
                  const demos = sumFunnelMetricWithExclusions(
                    "demos",
                    p.repKeys,
                    w.key,
                    bundle,
                    pilotFunnelRawByMetric!,
                    pilotFunnelIndexedByMetric!,
                    pilotChartMetricEx,
                    prospectingFilterOptions,
                  );
                  const wins = pilotWinsInWeek(
                    bundle,
                    pilotWinsDetailRows,
                    team,
                    phaseLabels,
                    phaseCalcConfigs,
                    isGAPhase,
                    p.repKeys,
                    w.key,
                    pilotChartMetricEx,
                  );
                  return tam > 0 || calls > 0 || connects > 0 || demos > 0 || wins > 0;
                });
                const totals = validWeeks.reduce(
                  (acc, w) => ({
                    tam: acc.tam,
                    calls:
                      acc.calls +
                      sumFunnelMetricWithExclusions(
                        "calls",
                        p.repKeys,
                        w.key,
                        bundle,
                        pilotFunnelRawByMetric!,
                        pilotFunnelIndexedByMetric!,
                        pilotChartMetricEx,
                        prospectingFilterOptions,
                      ),
                    connects:
                      acc.connects +
                      sumFunnelMetricWithExclusions(
                        "connects",
                        p.repKeys,
                        w.key,
                        bundle,
                        pilotFunnelRawByMetric!,
                        pilotFunnelIndexedByMetric!,
                        pilotChartMetricEx,
                        prospectingFilterOptions,
                      ),
                    demos:
                      acc.demos +
                      sumFunnelMetricWithExclusions(
                        "demos",
                        p.repKeys,
                        w.key,
                        bundle,
                        pilotFunnelRawByMetric!,
                        pilotFunnelIndexedByMetric!,
                        pilotChartMetricEx,
                        prospectingFilterOptions,
                      ),
                    wins:
                      acc.wins +
                      pilotWinsInWeek(
                        bundle,
                        pilotWinsDetailRows,
                        team,
                        phaseLabels,
                        phaseCalcConfigs,
                        isGAPhase,
                        p.repKeys,
                        w.key,
                        pilotChartMetricEx,
                      ),
                  }),
                  { tam: hasMetricsTam ? 0 : p.tamTotal, calls: 0, connects: 0, demos: 0, wins: 0 },
                );
                const firstConvRate = hasMetricsTam
                  ? (p.tamTotal > 0 ? Math.min(100, (totals.calls / p.tamTotal) * 100) : 0)
                  : (totals.tam > 0 ? (totals.calls / totals.tam) * 100 : 0);
                const callToConnect = totals.calls > 0 ? (totals.connects / totals.calls) * 100 : 0;
                const connectToDemo = totals.connects > 0 ? (totals.demos / totals.connects) * 100 : 0;
                const demoToWin = totals.demos > 0 ? (totals.wins / totals.demos) * 100 : 0;
                return (
                  <div key={p.id} className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="font-semibold" style={{ color: PLAYER_COLORS[idx % PLAYER_COLORS.length] }}>{p.chartName}:</span>
                    <span>{hasMetricsTam ? "% TAM" : "TAM→Call"}: <strong className="text-foreground">{firstConvRate.toFixed(0)}%</strong></span>
                    <span>Call→Connect: <strong className="text-foreground">{callToConnect.toFixed(0)}%</strong></span>
                    <span>Connect→Demo: <strong className="text-foreground">{connectToDemo.toFixed(0)}%</strong></span>
                    <span>Demo→Win: <strong className="text-foreground">{demoToWin.toFixed(0)}%</strong></span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function fmtNum(v: string | number): string {
  if (typeof v === "number") return v.toLocaleString();
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString() : v;
}

type StatCardBreakdownRow = {
  label: string;
  value: number;
  display?: string;
  isSeparator?: boolean;
  isSectionLabel?: boolean;
};

function StatCard({
  icon,
  label,
  value,
  tooltip,
  breakdown,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  tooltip?: string;
  breakdown?: StatCardBreakdownRow[];
}) {
  const card = (
    <div className={`flex items-center gap-3 rounded-lg border border-border bg-card p-4 glow-card ${tooltip || breakdown ? "cursor-help" : ""}`}>
      {icon}
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-display text-lg font-bold text-foreground">{fmtNum(value)}</p>
      </div>
    </div>
  );

  if (!tooltip && (!breakdown || breakdown.length === 0)) return card;

  return (
    <UiTooltip>
      <TooltipTrigger asChild>{card}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px]">
        <div className="space-y-2">
          {tooltip && <p className="text-xs leading-relaxed">{tooltip}</p>}
          {breakdown && breakdown.length > 0 && (
            <>
              <div className="h-px bg-accent/20" />
              <div className="space-y-1 text-xs">
                {breakdown.map((r, i) =>
                  r.isSeparator ? (
                    <div key={`sep-${i}`} className="border-t border-dashed border-accent/30 my-0.5" />
                  ) : r.isSectionLabel ? (
                    <div
                      key={`sec-${i}-${r.label}`}
                      className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground pt-1 first:pt-0"
                    >
                      {r.label}
                    </div>
                  ) : (
                    <div key={`${i}-${r.label}`} className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground truncate">{r.label}</span>
                      <span className="font-medium text-foreground whitespace-nowrap">
                        {r.display ?? fmtNum(r.value)}
                      </span>
                    </div>
                  ),
                )}
                <div className="pt-1 flex items-center justify-between gap-3 border-t border-accent/10">
                  <span className="font-semibold text-foreground">Total</span>
                  <span className="font-semibold text-accent whitespace-nowrap">{fmtNum(value)}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </TooltipContent>
    </UiTooltip>
  );
}

export default Index;
