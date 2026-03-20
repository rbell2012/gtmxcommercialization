import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { dbMutate } from "@/lib/supabase-helpers";
import type { DbTeam, DbMember, DbWeeklyFunnel, DbWinEntry, DbSuperhex, DbMetricsTam, DbMemberTeamHistory, DbTeamGoalsHistory, DbMemberGoalsHistory, DbMetricsSalesTeam, DbMetricsProjectedBookings, DbProjectTeamAssignment } from "@/lib/database.types";
import { isWinStage } from "@/lib/metrics-helpers";

// ── Goal metrics system ──

export const GOAL_METRICS = ['calls', 'ops', 'demos', 'wins', 'feedback', 'activity'] as const;
export type GoalMetric = (typeof GOAL_METRICS)[number];

export const GOAL_METRIC_LABELS: Record<GoalMetric, string> = {
  calls: 'Calls',
  ops: 'Ops',
  demos: 'Demos',
  wins: 'Wins',
  feedback: 'Feedback',
  activity: 'Activity',
};

export type MemberGoals = Record<GoalMetric, number>;

export interface AcceleratorRule {
  enabled: boolean;
  conditionOperator: '>' | '<' | 'between';
  conditionValue1: number;
  conditionValue2?: number;
  actionOperator: '+' | '-' | '*';
  actionValue: number;
  actionUnit: '%' | '#';
  scope?: GoalScope;
}

export type AcceleratorConfig = Partial<Record<GoalMetric, AcceleratorRule[]>>;

export type AcceleratorMode = 'basic' | 'logic';

export interface BasicAcceleratorMetricConfig {
  enabled: boolean;
  minValue: number;
  minPct: number;
  maxValue: number;
  scope?: GoalScope;
  excludedMembers?: string[];
}

export type BasicAcceleratorConfig = Partial<Record<GoalMetric, BasicAcceleratorMetricConfig>>;

export const MEMBER_LEVELS = ['adr', 'bdr', 'rep', 'senior', 'principal', 'lead'] as const;
export type MemberLevel = (typeof MEMBER_LEVELS)[number];

export const MEMBER_LEVEL_LABELS: Record<MemberLevel, string> = {
  adr: 'ADR',
  bdr: 'BDR',
  rep: 'Rep',
  senior: 'Senior',
  principal: 'Principal',
  lead: 'Lead',
};

export type TeamGoalsByLevel = Record<GoalMetric, Partial<Record<MemberLevel, number>>>;

export const DEFAULT_TEAM_GOALS_BY_LEVEL: TeamGoalsByLevel = {
  calls: {},
  ops: {},
  demos: {},
  wins: {},
  feedback: {},
  activity: {},
};

export type GoalScope = 'individual' | 'team';

export type GoalScopeConfig = Record<GoalMetric, GoalScope>;

export const DEFAULT_GOAL_SCOPE_CONFIG: GoalScopeConfig = {
  calls: 'individual',
  ops: 'individual',
  demos: 'individual',
  wins: 'individual',
  feedback: 'individual',
  activity: 'individual',
};

export const DEFAULT_GOALS: MemberGoals = {
  calls: 0,
  ops: 0,
  demos: 0,
  wins: 0,
  feedback: 0,
  activity: 0,
};

export interface OverallGoalConfig {
  winsEnabled: boolean;
  wins: number;
  totalPriceEnabled: boolean;
  totalPrice: number;
  discountThresholdEnabled: boolean;
  discountThreshold: number;
  realizedPriceEnabled: boolean;
  realizedPrice: number;
  /** Exact product names from metrics_ops.line_items to sum (pilot regions) */
  lineItemTargets: string[];
}

export const DEFAULT_OVERALL_GOAL_CONFIG: OverallGoalConfig = {
  winsEnabled: false,
  wins: 0,
  totalPriceEnabled: false,
  totalPrice: 0,
  discountThresholdEnabled: false,
  discountThreshold: 0,
  realizedPriceEnabled: false,
  realizedPrice: 0,
  lineItemTargets: [],
};

function parseLineItemTargetsFromDb(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

// ── App types ──

export interface WinEntry {
  id: string;
  restaurant: string;
  story?: string;
  date: string;
}

export type WeeklyRole = string;

export interface FunnelData {
  tam: number;
  calls: number;
  connects: number;
  ops: number;
  demos: number;
  wins: number;
  feedback: number;
  activity: number;
}

export interface WeeklyFunnel extends FunnelData {
  role?: WeeklyRole;
  submitted?: boolean;
  submittedAt?: string;
}

export interface WinTypeCounts {
  nb: number;
  growth: number;
}

export interface WinTypeNames {
  nb: string[];
  growth: string[];
}

export interface TeamMember {
  id: string;
  name: string;
  level: MemberLevel | null;
  goals: MemberGoals;
  wins: WinEntry[];
  ducksEarned: number;
  funnelByWeek: Record<string, WeeklyFunnel>;
  monthlyMetrics: Record<string, FunnelData>;
  monthlyWinTypes: Record<string, WinTypeCounts>;
  monthlyWinTypeNames: Record<string, WinTypeNames>;
  monthlyOpsTypes: Record<string, WinTypeCounts>;
  monthlyOpsTypeNames: Record<string, WinTypeNames>;
  metricAccountNames: Record<string, Partial<Record<GoalMetric, string[]>>>;
  isActive: boolean;
  sortOrder: number;
  touchedAccountsByTeam: Record<string, number>;
  touchedTam: number;
}

export type EnabledGoals = Record<GoalMetric, boolean>;

export const DEFAULT_ENABLED_GOALS: EnabledGoals = {
  calls: false,
  ops: false,
  demos: false,
  wins: false,
  feedback: false,
  activity: false,
};

export interface Team {
  id: string;
  name: string;
  owner: string;
  leadRep: string;
  sortOrder: number;
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
  totalTam: number;
  tamSubmitted: boolean;
  missionPurpose: string;
  missionSubmitted: boolean;
  missionLastEdit: string | null;
  executiveSponsor: string;
  executiveProxy: string;
  revenueLever: string;
  businessGoal: string;
  whatWeAreTesting: string;
  topObjections: string[];
  biggestRisks: string[];
  onboardingProcess: string;
  signalsSubmitted: boolean;
  signalsLastEdit: string | null;
  goalsParity: boolean;
  teamGoals: MemberGoals;
  enabledGoals: EnabledGoals;
  overallGoal: OverallGoalConfig;
  acceleratorConfig: AcceleratorConfig;
  acceleratorMode: AcceleratorMode;
  basicAcceleratorConfig: BasicAcceleratorConfig;
  teamGoalsByLevel: TeamGoalsByLevel;
  goalScopeConfig: GoalScopeConfig;
  reliefMonthMembers: string[];
  members: TeamMember[];
}

export function pilotNameToSlug(name: string): string {
  return name.trim().replace(/\s+/g, "_");
}

export interface MemberTeamHistoryEntry {
  id: string;
  memberId: string;
  teamId: string | null;
  startedAt: string;
  endedAt: string | null;
}

export interface TeamGoalsHistoryEntry {
  id: string;
  teamId: string;
  month: string;
  goalsParity: boolean;
  teamGoals: MemberGoals;
  enabledGoals: EnabledGoals;
  acceleratorConfig: AcceleratorConfig;
  acceleratorMode: AcceleratorMode;
  basicAcceleratorConfig: BasicAcceleratorConfig;
  teamGoalsByLevel: TeamGoalsByLevel;
  goalScopeConfig: GoalScopeConfig;
  reliefMonthMembers: string[];
}

export interface MemberGoalsHistoryEntry {
  id: string;
  memberId: string;
  month: string;
  goals: MemberGoals;
  level: MemberLevel | null;
}

export interface SalesTeam {
  id: string;
  managerName: string;
  managerTitle: string;
  locationReference: string;
  teamSize: number;
  avgMonthlyWins: number;
  teamMembers: string;
  displayName: string;
}

export interface ProjectedBooking {
  id: string;
  month: string;
  teamId: string | null;
  projectedBookings: number | null;
  newBusinessAttach: number | null;
  growthWins: number | null;
}

export interface ProjectTeamAssignment {
  id: string;
  teamId: string;
  salesTeamId: string;
  monthIndex: number;
  excludedMembers: string | null;
}

export function toMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function currentMonthKey(): string {
  return toMonthKey(new Date());
}

/**
 * Overlays historical goal config onto a Team for a past month.
 * Returns the team unchanged for the current month or if no snapshot exists.
 */
export function getHistoricalTeam(
  team: Team,
  referenceDate: Date | undefined,
  teamGoalsHistory: TeamGoalsHistoryEntry[],
): Team {
  if (!referenceDate) return team;
  const now = new Date();
  if (referenceDate.getFullYear() === now.getFullYear() && referenceDate.getMonth() === now.getMonth()) {
    return team;
  }
  const month = toMonthKey(referenceDate);
  const entry = teamGoalsHistory.find((h) => h.teamId === team.id && h.month === month);
  if (!entry) return { ...team, reliefMonthMembers: [] };
  return {
    ...team,
    goalsParity: entry.goalsParity,
    teamGoals: entry.teamGoals,
    enabledGoals: entry.enabledGoals,
    acceleratorConfig: entry.acceleratorConfig,
    acceleratorMode: entry.acceleratorMode,
    basicAcceleratorConfig: entry.basicAcceleratorConfig,
    teamGoalsByLevel: entry.teamGoalsByLevel,
    goalScopeConfig: entry.goalScopeConfig,
    reliefMonthMembers: entry.reliefMonthMembers,
  };
}

/**
 * Overlays historical goals/level onto a TeamMember for a past month.
 * Returns the member unchanged for the current month or if no snapshot exists.
 */
export function getHistoricalMember(
  member: TeamMember,
  referenceDate: Date | undefined,
  memberGoalsHistory: MemberGoalsHistoryEntry[],
): TeamMember {
  if (!referenceDate) return member;
  const now = new Date();
  if (referenceDate.getFullYear() === now.getFullYear() && referenceDate.getMonth() === now.getMonth()) {
    return member;
  }
  const month = toMonthKey(referenceDate);
  const entry = memberGoalsHistory.find((h) => h.memberId === member.id && h.month === month);
  if (!entry) return member;
  return {
    ...member,
    goals: entry.goals,
    level: entry.level,
  };
}

/**
 * Returns the members who were on `teamId` during the month of `referenceDate`.
 * Falls back to the current active roster when referenceDate is undefined or the current month.
 */
export function getTeamMembersForMonth(
  team: Team,
  referenceDate: Date | undefined,
  history: MemberTeamHistoryEntry[],
  allMembersById: Map<string, TeamMember>,
): TeamMember[] {
  if (!referenceDate) return team.members.filter((m) => m.isActive);

  const now = new Date();
  if (referenceDate.getFullYear() === now.getFullYear() && referenceDate.getMonth() === now.getMonth()) {
    return team.members.filter((m) => m.isActive);
  }

  const monthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const monthEnd = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0, 23, 59, 59, 999);

  const memberIds = new Set<string>();
  for (const entry of history) {
    if (entry.teamId !== team.id) continue;
    const start = new Date(entry.startedAt);
    const end = entry.endedAt ? new Date(entry.endedAt) : new Date("9999-12-31");
    if (start <= monthEnd && end >= monthStart) {
      memberIds.add(entry.memberId);
    }
  }

  return Array.from(memberIds)
    .map((id) => allMembersById.get(id))
    .filter((m): m is TeamMember => m != null)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function getFirstActivityDate(row: { first_activity_date?: string | null; first_call_date?: string | null; first_connect_date?: string | null; first_demo_date?: string | null; last_activity_date?: string | null }): string | null {
  return row.first_activity_date || row.first_call_date || row.first_connect_date || row.first_demo_date || row.last_activity_date || null;
}

type MetricCorrectionMap = Map<string, Record<string, Partial<FunnelData>>>;

function emptyFunnel(): FunnelData {
  return { tam: 0, calls: 0, connects: 0, ops: 0, demos: 0, wins: 0, feedback: 0, activity: 0 };
}

function recomputeMonthlyMetrics(
  member: TeamMember,
  corrections: Record<string, Partial<FunnelData>> | undefined,
): Record<string, FunnelData> {
  const monthly: Record<string, FunnelData> = {};
  for (const [weekKey, funnel] of Object.entries(member.funnelByWeek)) {
    const mk = weekKey.substring(0, 7);
    if (!monthly[mk]) monthly[mk] = emptyFunnel();
    monthly[mk].tam += funnel.tam;
    monthly[mk].calls += funnel.calls;
    monthly[mk].connects += funnel.connects;
    monthly[mk].ops += funnel.ops;
    monthly[mk].demos += funnel.demos;
    monthly[mk].wins += funnel.wins;
    monthly[mk].feedback += funnel.feedback;
    monthly[mk].activity += funnel.activity;
  }
  if (corrections) {
    for (const [mk, corr] of Object.entries(corrections)) {
      if (!monthly[mk]) monthly[mk] = emptyFunnel();
      for (const [key, val] of Object.entries(corr)) {
        (monthly[mk] as any)[key] += val;
      }
    }
  }
  return monthly;
}

type AggCounts = Map<string, Map<string, number>>;
type AggNames = Map<string, Map<string, Set<string>>>;
type WinTypeAgg = Map<string, Map<string, WinTypeCounts>>;
type WinTypeNamesAgg = Map<string, Map<string, { nb: Set<string>; growth: Set<string> }>>;

interface AggregatedMetricRow {
  metric_type: string;
  rep_name: string;
  date_value: string;
  cnt: number;
  acct_name: string | null;
}

interface CachedMetrics {
  byWeek: Record<string, AggCounts>;
  byMonth: Record<string, AggCounts>;
  namesByMonth: Record<string, AggNames>;
  winTypesByMonth: WinTypeAgg;
  winTypeNamesByMonth: WinTypeNamesAgg;
  opsTypesByMonth: WinTypeAgg;
  opsTypeNamesByMonth: WinTypeNamesAgg;
  opsRows: Record<string, unknown>[];
  actRows: Record<string, unknown>[];
  shRows: Record<string, unknown>[];
  tamRows: Record<string, unknown>[];
}

// ── helpers to convert between DB rows and app shapes ──

function dbMemberToApp(
  row: DbMember,
  funnels: DbWeeklyFunnel[],
  wins: DbWinEntry[]
): TeamMember {
  const funnelByWeek: Record<string, WeeklyFunnel> = {};
  for (const f of funnels) {
    funnelByWeek[f.week_key] = {
      tam: f.tam,
      calls: f.calls,
      connects: f.connects,
      ops: f.ops ?? 0,
      demos: f.demos,
      wins: f.wins,
      feedback: f.feedback ?? 0,
      activity: f.activity ?? 0,
      role: f.role ?? undefined,
      submitted: f.submitted,
      submittedAt: f.submitted_at ?? undefined,
    };
  }
  return {
    id: row.id,
    name: row.name,
    level: (row.level as MemberLevel) ?? null,
    goals: {
      calls: row.goal_calls ?? 0,
      ops: row.goal_ops ?? 0,
      demos: row.goal_demos ?? 0,
      wins: row.goal_wins ?? 0,
      feedback: row.goal_feedback ?? 0,
      activity: row.goal_activity ?? 0,
    },
    ducksEarned: row.ducks_earned,
    isActive: row.is_active,
    sortOrder: row.sort_order ?? 0,
    wins: wins.map((w) => ({
      id: w.id,
      restaurant: w.restaurant,
      story: w.story ?? undefined,
      date: w.date,
    })),
    funnelByWeek,
    monthlyMetrics: {},
    monthlyWinTypes: {},
    monthlyWinTypeNames: {},
    monthlyOpsTypes: {},
    monthlyOpsTypeNames: {},
    metricAccountNames: {},
    touchedAccountsByTeam: {},
    touchedTam: 0,
  };
}

function assembleTeams(
  dbTeams: DbTeam[],
  dbMembers: DbMember[],
  dbFunnels: DbWeeklyFunnel[],
  dbWins: DbWinEntry[]
): { teams: Team[]; unassigned: TeamMember[] } {
  const funnelsByMember = new Map<string, DbWeeklyFunnel[]>();
  for (const f of dbFunnels) {
    const arr = funnelsByMember.get(f.member_id) ?? [];
    arr.push(f);
    funnelsByMember.set(f.member_id, arr);
  }

  const winsByMember = new Map<string, DbWinEntry[]>();
  for (const w of dbWins) {
    const arr = winsByMember.get(w.member_id) ?? [];
    arr.push(w);
    winsByMember.set(w.member_id, arr);
  }

  const sortedDbMembers = [...dbMembers].sort((a, b) => a.sort_order - b.sort_order);

  const toAppMember = (m: DbMember) =>
    dbMemberToApp(m, funnelsByMember.get(m.id) ?? [], winsByMember.get(m.id) ?? []);

  const teams: Team[] = dbTeams
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((t) => ({
      id: t.id,
      name: t.name,
      owner: t.owner,
      leadRep: t.lead_rep,
      sortOrder: t.sort_order,
      isActive: t.is_active,
      startDate: t.start_date,
      endDate: t.end_date,
      totalTam: t.total_tam ?? 0,
      tamSubmitted: t.tam_submitted ?? false,
      missionPurpose: t.mission_purpose ?? "",
      missionSubmitted: t.mission_submitted ?? false,
      missionLastEdit: t.mission_last_edit ?? null,
      executiveSponsor: t.executive_sponsor ?? "",
      executiveProxy: t.executive_proxy ?? "",
      revenueLever: t.revenue_lever ?? "",
      businessGoal: t.business_goal ?? "",
      whatWeAreTesting: t.what_we_are_testing ?? "",
      topObjections: (t.top_objections as string[] | null) ?? ["", "", ""],
      biggestRisks: (t.biggest_risks as string[] | null) ?? ["", "", ""],
      onboardingProcess: t.onboarding_process ?? "",
      signalsSubmitted: t.signals_submitted ?? false,
      signalsLastEdit: t.signals_last_edit ?? null,
      goalsParity: t.goals_parity ?? false,
      teamGoals: {
        calls: t.team_goal_calls ?? 0,
        ops: t.team_goal_ops ?? 0,
        demos: t.team_goal_demos ?? 0,
        wins: t.team_goal_wins ?? 0,
        feedback: t.team_goal_feedback ?? 0,
        activity: t.team_goal_activity ?? 0,
      },
      enabledGoals: {
        calls: t.goal_enabled_calls ?? false,
        ops: t.goal_enabled_ops ?? false,
        demos: t.goal_enabled_demos ?? false,
        wins: t.goal_enabled_wins ?? false,
        feedback: t.goal_enabled_feedback ?? false,
        activity: t.goal_enabled_activity ?? false,
      },
      overallGoal: {
        winsEnabled: t.overall_goal_wins_enabled ?? false,
        wins: t.overall_goal_wins ?? 0,
        totalPriceEnabled: t.overall_goal_total_price_enabled ?? false,
        totalPrice: t.overall_goal_total_price ?? 0,
        discountThresholdEnabled: t.overall_goal_discount_threshold_enabled ?? false,
        discountThreshold: t.overall_goal_discount_threshold ?? 0,
        realizedPriceEnabled: t.overall_goal_realized_price_enabled ?? false,
        realizedPrice: t.overall_goal_realized_price ?? 0,
        lineItemTargets: parseLineItemTargetsFromDb(t.overall_goal_line_item_targets),
      },
      acceleratorConfig: (t.accelerator_config as AcceleratorConfig) ?? {},
      acceleratorMode: (t.accelerator_mode as AcceleratorMode) ?? 'basic',
      basicAcceleratorConfig: (t.basic_accelerator_config as BasicAcceleratorConfig) ?? {},
      teamGoalsByLevel: (t.team_goals_by_level as TeamGoalsByLevel) ?? { ...DEFAULT_TEAM_GOALS_BY_LEVEL },
      goalScopeConfig: (t.goal_scope_config as GoalScopeConfig) ?? { ...DEFAULT_GOAL_SCOPE_CONFIG },
      reliefMonthMembers: (t.relief_month_members as string[]) ?? [],
      members: sortedDbMembers.filter((m) => m.team_id === t.id).map(toAppMember),
    }));

  const unassigned = sortedDbMembers.filter((m) => m.team_id === null && m.is_active).map(toAppMember);

  return { teams, unassigned };
}

// ── context ──

export interface ArchivedTeam {
  id: string;
  name: string;
  owner: string;
  archivedAt: string;
}

export interface ArchivedMember {
  id: string;
  name: string;
  level: MemberLevel | null;
  archivedAt: string;
}

interface TeamsContextType {
  teams: Team[];
  setTeams: React.Dispatch<React.SetStateAction<Team[]>>;
  unassignedMembers: TeamMember[];
  setUnassignedMembers: React.Dispatch<React.SetStateAction<TeamMember[]>>;
  memberTeamHistory: MemberTeamHistoryEntry[];
  teamGoalsHistory: TeamGoalsHistoryEntry[];
  memberGoalsHistory: MemberGoalsHistoryEntry[];
  allMembersById: Map<string, TeamMember>;
  archivedTeams: ArchivedTeam[];
  loadArchivedTeams: () => Promise<void>;
  unarchiveTeam: (teamId: string) => Promise<void>;
  archivedMembers: ArchivedMember[];
  loadArchivedMembers: () => Promise<void>;
  archiveMember: (memberId: string) => void;
  unarchiveMember: (memberId: string) => Promise<void>;
  updateTeam: (teamId: string, updater: (team: Team) => Team) => void;
  addTeam: (name: string, owner?: string, startDate?: string | null, endDate?: string | null) => void;
  removeTeam: (teamId: string) => void;
  reorderTeams: (orderedIds: string[]) => void;
  reorderMembers: (orderedIds: string[]) => void;
  toggleTeamActive: (teamId: string, isActive: boolean) => void;
  createMember: (name: string, goals?: Partial<MemberGoals>) => TeamMember;
  updateMember: (memberId: string, updates: { name?: string; goals?: Partial<MemberGoals>; level?: MemberLevel | null }) => void;
  assignMember: (memberId: string, targetTeamId: string) => void;
  unassignMember: (memberId: string, fromTeamId: string) => void;
  removeMember: (memberId: string) => void;
  upsertTeamGoalsHistory: (teamId: string, month: string, goals: {
    goalsParity: boolean;
    teamGoals: MemberGoals;
    enabledGoals: EnabledGoals;
    acceleratorConfig: AcceleratorConfig;
    acceleratorMode: AcceleratorMode;
    basicAcceleratorConfig: BasicAcceleratorConfig;
    teamGoalsByLevel: TeamGoalsByLevel;
    goalScopeConfig: GoalScopeConfig;
    reliefMonthMembers: string[];
  }) => void;
  updateHistoricalRoster: (teamId: string, referenceDate: Date, memberIds: string[]) => void;
  salesTeams: SalesTeam[];
  projectedBookings: ProjectedBooking[];
  projectTeamAssignments: ProjectTeamAssignment[];
  assignSalesTeam: (teamId: string, salesTeamId: string, monthIndex: number, excludedMembers?: string | null) => void;
  unassignSalesTeam: (teamId: string, salesTeamId: string, monthIndex: number) => void;
  updateExcludedMembers: (teamId: string, salesTeamId: string, monthIndex: number, excludedMembers: string | null) => void;
  reloadAll: () => Promise<void>;
  loading: boolean;
  /** Raw metrics_ops rows (includes line_items when loaded) */
  opsRows: Record<string, unknown>[];
}

const TeamsContext = createContext<TeamsContextType | null>(null);

export function useTeams() {
  const ctx = useContext(TeamsContext);
  if (!ctx) throw new Error("useTeams must be used within TeamsProvider");
  return ctx;
}

function memberGoalsToDbInsert(goals: MemberGoals) {
  return {
    goal_calls: goals.calls,
    goal_ops: goals.ops,
    goal_demos: goals.demos,
    goal_wins: goals.wins,
    goal_feedback: goals.feedback,
    goal_activity: goals.activity,
  };
}

async function fetchAllRows(table: string, columns: string, pageSize = 1000): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1);
    if (error || !data || data.length === 0) break;
    all.push(...(data as Record<string, unknown>[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

export function TeamsProvider({ children }: { children: ReactNode }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [unassignedMembers, setUnassignedMembers] = useState<TeamMember[]>([]);
  const [memberTeamHistory, setMemberTeamHistory] = useState<MemberTeamHistoryEntry[]>([]);
  const [teamGoalsHistory, setTeamGoalsHistory] = useState<TeamGoalsHistoryEntry[]>([]);
  const [memberGoalsHistory, setMemberGoalsHistory] = useState<MemberGoalsHistoryEntry[]>([]);
  const [allMembersById, setAllMembersById] = useState<Map<string, TeamMember>>(new Map());
  const [archivedTeams, setArchivedTeams] = useState<ArchivedTeam[]>([]);
  const [archivedMembers, setArchivedMembers] = useState<ArchivedMember[]>([]);
  const [salesTeams, setSalesTeams] = useState<SalesTeam[]>([]);
  const [projectedBookings, setProjectedBookings] = useState<ProjectedBooking[]>([]);
  const [projectTeamAssignments, setProjectTeamAssignments] = useState<ProjectTeamAssignment[]>([]);
  const [opsRows, setOpsRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  const cachedMetricsRef = useRef<CachedMetrics | null>(null);
  const metricCorrectionsRef = useRef<MetricCorrectionMap>(new Map());
  const updatedMembersRef = useRef<TeamMember[]>([]);

  // ── load metrics data (heavy, external pipeline) ──
  const loadMetrics = useCallback(async (): Promise<CachedMetrics> => {
    const [actRows, callRows, conRows, demoRows, opsRows, winsRows, fbRows, shRows, tamRows] = await Promise.all([
      fetchAllRows("metrics_activity", "rep_name, activity_date, salesforce_accountid"),
      fetchAllRows("metrics_calls", "rep_name, call_date"),
      fetchAllRows("metrics_connects", "rep_name, connect_date"),
      fetchAllRows("metrics_demos", "rep_name, demo_date, account_name"),
      fetchAllRows(
        "metrics_ops",
        "id, rep_name, op_date, op_created_date, opportunity_name, win_stage_date, opportunity_type, opportunity_software_mrr, line_items"
      ),
      fetchAllRows("metrics_wins", "id, rep_name, win_date, account_name, opportunity_stage, opportunity_type"),
      fetchAllRows("metrics_feedback", "rep_name, feedback_date"),
      fetchAllRows("superhex", "rep_name, salesforce_accountid, total_activities, first_activity_date, first_call_date, first_connect_date, first_demo_date, last_activity_date"),
      fetchAllRows("metrics_tam", "rep_name, tam"),
    ]);

    const dateToWeekKey = (dateStr: string): string => {
      const d = new Date(dateStr + "T00:00:00");
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    const dateToMonthKey = (dateStr: string): string => {
      const d = new Date(dateStr + "T00:00:00");
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    };

    const aggregateBy = (rows: Record<string, unknown>[], dateField: string, keyFn: (d: string) => string): AggCounts => {
      const result: AggCounts = new Map();
      for (const row of rows) {
        const dateVal = row[dateField] as string | null;
        if (!dateVal) continue;
        const repKey = (row.rep_name as string).toLowerCase().trim();
        const key = keyFn(dateVal);
        if (!result.has(repKey)) result.set(repKey, new Map());
        const repMap = result.get(repKey)!;
        repMap.set(key, (repMap.get(key) ?? 0) + 1);
      }
      return result;
    };

    const aggregateByWeek = (rows: Record<string, unknown>[], dateField: string) => aggregateBy(rows, dateField, dateToWeekKey);
    const aggregateByMonth = (rows: Record<string, unknown>[], dateField: string) => aggregateBy(rows, dateField, dateToMonthKey);

    const qualifiedWinsRows = winsRows.filter((r) =>
      isWinStage(r.opportunity_stage as string | null, r.opportunity_type as string | null)
    );

    const winStageDateById = new Map<string, string>();
    for (const op of opsRows) {
      const id = op.id as string | null;
      const wsd = op.win_stage_date as string | null;
      if (id && wsd) winStageDateById.set(id, wsd);
    }

    const winsWithEffectiveDate = qualifiedWinsRows.map((r) => {
      const wsd = winStageDateById.get(r.id as string);
      return wsd ? { ...r, _effective_date: wsd } : { ...r, _effective_date: r.win_date as string };
    });

    const byWeek: Record<string, AggCounts> = {
      activity: aggregateByWeek(actRows, "activity_date"),
      calls: aggregateByWeek(callRows, "call_date"),
      connects: aggregateByWeek(conRows, "connect_date"),
      demos: aggregateByWeek(demoRows, "demo_date"),
      ops: aggregateByWeek(opsRows, "op_created_date"),
      wins: aggregateByWeek(winsWithEffectiveDate, "_effective_date"),
      feedback: aggregateByWeek(fbRows, "feedback_date"),
    };

    const byMonth: Record<string, AggCounts> = {
      activity: aggregateByMonth(actRows, "activity_date"),
      calls: aggregateByMonth(callRows, "call_date"),
      connects: aggregateByMonth(conRows, "connect_date"),
      demos: aggregateByMonth(demoRows, "demo_date"),
      ops: aggregateByMonth(opsRows, "op_created_date"),
      wins: aggregateByMonth(winsWithEffectiveDate, "_effective_date"),
      feedback: aggregateByMonth(fbRows, "feedback_date"),
    };

    const aggregateNamesBy = (rows: Record<string, unknown>[], dateField: string, nameField: string, keyFn: (d: string) => string): AggNames => {
      const result: AggNames = new Map();
      for (const row of rows) {
        const dateVal = row[dateField] as string | null;
        const nameVal = row[nameField] as string | null;
        if (!dateVal || !nameVal) continue;
        const repKey = (row.rep_name as string).toLowerCase().trim();
        const key = keyFn(dateVal);
        if (!result.has(repKey)) result.set(repKey, new Map());
        const repMap = result.get(repKey)!;
        if (!repMap.has(key)) repMap.set(key, new Set());
        repMap.get(key)!.add(nameVal);
      }
      return result;
    };

    const namesByMonth: Record<string, AggNames> = {
      ops: aggregateNamesBy(opsRows, "op_created_date", "opportunity_name", dateToMonthKey),
      demos: aggregateNamesBy(demoRows, "demo_date", "account_name", dateToMonthKey),
      wins: aggregateNamesBy(winsWithEffectiveDate, "_effective_date", "account_name", dateToMonthKey),
      activity: new Map(),
      calls: new Map(),
      connects: new Map(),
      feedback: new Map(),
    };

    const winTypesByMonth: WinTypeAgg = new Map();
    const winTypeNamesByMonth: WinTypeNamesAgg = new Map();
    for (const row of winsWithEffectiveDate) {
      const dateVal = row._effective_date as string | null;
      if (!dateVal) continue;
      const repKey = (row.rep_name as string).toLowerCase().trim();
      const mk = dateToMonthKey(dateVal);
      const acctName = row.account_name as string | null;
      const opType = (row.opportunity_type as string | null) ?? "";
      const isGrowth = !opType || opType === "Existing Business (Upsell)";

      if (!winTypesByMonth.has(repKey)) winTypesByMonth.set(repKey, new Map());
      const repCounts = winTypesByMonth.get(repKey)!;
      if (!repCounts.has(mk)) repCounts.set(mk, { nb: 0, growth: 0 });
      const counts = repCounts.get(mk)!;
      if (isGrowth) counts.growth++;
      else counts.nb++;

      if (acctName) {
        if (!winTypeNamesByMonth.has(repKey)) winTypeNamesByMonth.set(repKey, new Map());
        const repNames = winTypeNamesByMonth.get(repKey)!;
        if (!repNames.has(mk)) repNames.set(mk, { nb: new Set(), growth: new Set() });
        const sets = repNames.get(mk)!;
        if (isGrowth) sets.growth.add(acctName);
        else sets.nb.add(acctName);
      }
    }

    const opsTypesByMonth: WinTypeAgg = new Map();
    const opsTypeNamesByMonth: WinTypeNamesAgg = new Map();
    for (const row of opsRows) {
      const dateVal = row.op_created_date as string | null;
      if (!dateVal) continue;
      const repKey = (row.rep_name as string).toLowerCase().trim();
      const mk = dateToMonthKey(dateVal);
      const opName = row.opportunity_name as string | null;
      const opType = (row.opportunity_type as string | null) ?? "";
      const isGrowth = !opType || opType === "Existing Business (Upsell)";

      if (!opsTypesByMonth.has(repKey)) opsTypesByMonth.set(repKey, new Map());
      const repCounts = opsTypesByMonth.get(repKey)!;
      if (!repCounts.has(mk)) repCounts.set(mk, { nb: 0, growth: 0 });
      const counts = repCounts.get(mk)!;
      if (isGrowth) counts.growth++;
      else counts.nb++;

      if (opName) {
        if (!opsTypeNamesByMonth.has(repKey)) opsTypeNamesByMonth.set(repKey, new Map());
        const repNames = opsTypeNamesByMonth.get(repKey)!;
        if (!repNames.has(mk)) repNames.set(mk, { nb: new Set(), growth: new Set() });
        const sets = repNames.get(mk)!;
        if (isGrowth) sets.growth.add(opName);
        else sets.nb.add(opName);
      }
    }

    const metrics: CachedMetrics = { byWeek, byMonth, namesByMonth, winTypesByMonth, winTypeNamesByMonth, opsTypesByMonth, opsTypeNamesByMonth, opsRows, actRows, shRows, tamRows };
    cachedMetricsRef.current = metrics;
    return metrics;
  }, []);

  // ── load core data & assemble with metrics ──
  const loadCore = useCallback(async (metrics?: CachedMetrics) => {
    const m = metrics ?? cachedMetricsRef.current;
    if (!m) return;

    const [tRes, mRes, fRes, wRes, hRes, tghRes, mghRes, stRes, pbRes, ptaRes] = await Promise.all([
      supabase.from("teams").select("*").is("archived_at", null),
      supabase.from("members").select("*").is("archived_at", null),
      supabase.from("weekly_funnels").select("*"),
      supabase.from("win_entries").select("*"),
      supabase.from("member_team_history").select("*"),
      supabase.from("team_goals_history").select("*"),
      supabase.from("member_goals_history").select("*"),
      supabase.from("metrics_sales_teams").select("*"),
      supabase.from("metrics_projected_bookings").select("*"),
      supabase.from("project_team_assignments").select("*"),
    ]);

    const {
      byWeek,
      byMonth,
      namesByMonth: cachedNames,
      winTypesByMonth,
      winTypeNamesByMonth,
      opsTypesByMonth,
      opsTypeNamesByMonth,
      opsRows: metricsOpsRows,
      actRows,
      shRows,
      tamRows: tamRows_raw,
    } = m;
    setOpsRows(metricsOpsRows);

    const dbMembers = (mRes.data ?? []) as DbMember[];
    const dbFunnels = (fRes.data ?? []) as DbWeeklyFunnel[];

    const memberIdByName = new Map<string, string>();
    for (const mem of dbMembers) {
      memberIdByName.set(mem.name.toLowerCase().trim(), mem.id);
    }

    const weekKeyToMonthKey = (weekKey: string): string => weekKey.substring(0, 7);

    const activityByWeek = byWeek.activity;
    const callsByWeek = byWeek.calls;
    const connectsByWeek = byWeek.connects;
    const demosByWeek = byWeek.demos;
    const opsByWeek = byWeek.ops;
    const winsByWeek = byWeek.wins;
    const feedbackByWeek = byWeek.feedback;

    const activityByMonth = byMonth.activity;
    const callsByMonth = byMonth.calls;
    const connectsByMonth = byMonth.connects;
    const demosByMonth = byMonth.demos;
    const opsByMonth = byMonth.ops;
    const winsByMonth = byMonth.wins;
    const feedbackByMonth = byMonth.feedback;

    const opsNamesByMonth = cachedNames.ops;
    const demosNamesByMonth = cachedNames.demos;
    const winsNamesByMonth = cachedNames.wins;

    // Collect all (rep, weekKey) pairs across all event tables
    const allRepWeeks = new Map<string, Set<string>>();
    for (const source of [activityByWeek, callsByWeek, connectsByWeek, demosByWeek, opsByWeek, winsByWeek, feedbackByWeek]) {
      for (const [rep, weeks] of source) {
        if (!allRepWeeks.has(rep)) allRepWeeks.set(rep, new Set());
        for (const wk of weeks.keys()) allRepWeeks.get(rep)!.add(wk);
      }
    }

    // Merge aggregated event data into funnels (non-zero manual values win)
    const funnelKey = (memberId: string, weekKey: string) => `${memberId}::${weekKey}`;
    const funnelIndex = new Map<string, number>();
    for (let i = 0; i < dbFunnels.length; i++) {
      funnelIndex.set(funnelKey(dbFunnels[i].member_id, dbFunnels[i].week_key), i);
    }

    for (const [repKey, weekKeys] of allRepWeeks) {
      const memberId = memberIdByName.get(repKey);
      if (!memberId) continue;

      for (const weekKey of weekKeys) {
        const activity = activityByWeek.get(repKey)?.get(weekKey) ?? 0;
        const calls = callsByWeek.get(repKey)?.get(weekKey) ?? 0;
        const connects = connectsByWeek.get(repKey)?.get(weekKey) ?? 0;
        const demos = demosByWeek.get(repKey)?.get(weekKey) ?? 0;
        const ops = opsByWeek.get(repKey)?.get(weekKey) ?? 0;
        const wins = winsByWeek.get(repKey)?.get(weekKey) ?? 0;
        const feedback = feedbackByWeek.get(repKey)?.get(weekKey) ?? 0;

        const key = funnelKey(memberId, weekKey);
        const existingIdx = funnelIndex.get(key);

        if (existingIdx !== undefined) {
          const f = dbFunnels[existingIdx];
          f.calls = f.calls > 0 ? f.calls : calls;
          f.connects = f.connects > 0 ? f.connects : connects;
          f.ops = f.ops > 0 ? f.ops : ops;
          f.demos = f.demos > 0 ? f.demos : demos;
          f.wins = f.wins > 0 ? f.wins : wins;
          f.feedback = f.feedback > 0 ? f.feedback : feedback;
          f.activity = f.activity > 0 ? f.activity : activity;
        } else {
          const synthetic: DbWeeklyFunnel = {
            id: `metrics-${memberId}-${weekKey}`,
            member_id: memberId,
            week_key: weekKey,
            role: null,
            tam: 0,
            calls,
            connects,
            ops,
            demos,
            wins,
            feedback,
            activity,
            submitted: false,
            submitted_at: null,
          };
          dbFunnels.push(synthetic);
        }
      }
    }

    const { teams: t, unassigned: u } = assembleTeams(
      (tRes.data ?? []) as DbTeam[],
      dbMembers,
      dbFunnels,
      (wRes.data ?? []) as DbWinEntry[]
    );

    // Build monthlyMetrics for each member using actual calendar-month attribution.
    // Start from funnelByWeek (which includes manual overrides) attributed by Monday's
    // month, then apply a correction so metrics-derived events are attributed to their
    // actual calendar month instead.
    const metricSources: { key: keyof FunnelData; monthly: AggCounts; weekly: AggCounts }[] = [
      { key: "activity", monthly: activityByMonth, weekly: activityByWeek },
      { key: "calls", monthly: callsByMonth, weekly: callsByWeek },
      { key: "connects", monthly: connectsByMonth, weekly: connectsByWeek },
      { key: "demos", monthly: demosByMonth, weekly: demosByWeek },
      { key: "ops", monthly: opsByMonth, weekly: opsByWeek },
      { key: "wins", monthly: winsByMonth, weekly: winsByWeek },
      { key: "feedback", monthly: feedbackByMonth, weekly: feedbackByWeek },
    ];

    const allMembers = [...u];
    for (const team of t) allMembers.push(...(team.members ?? []));

    const correctionsBuild: MetricCorrectionMap = new Map();

    for (const member of allMembers) {
      const monthly: Record<string, FunnelData> = {};

      for (const [weekKey, funnel] of Object.entries(member.funnelByWeek)) {
        const mk = weekKeyToMonthKey(weekKey);
        if (!monthly[mk]) monthly[mk] = emptyFunnel();
        monthly[mk].tam += funnel.tam;
        monthly[mk].calls += funnel.calls;
        monthly[mk].connects += funnel.connects;
        monthly[mk].ops += funnel.ops;
        monthly[mk].demos += funnel.demos;
        monthly[mk].wins += funnel.wins;
        monthly[mk].feedback += funnel.feedback;
        monthly[mk].activity += funnel.activity;
      }

      const repKey = member.name.toLowerCase().trim();
      const memberCorr: Record<string, Partial<FunnelData>> = {};
      for (const { key, monthly: monthlyAgg, weekly: weeklyAgg } of metricSources) {
        const byActualMonth = monthlyAgg.get(repKey) ?? new Map<string, number>();
        const byWeek = weeklyAgg.get(repKey) ?? new Map<string, number>();
        const byWeekDerivedMonth = new Map<string, number>();
        for (const [wk, count] of byWeek) {
          const mk = weekKeyToMonthKey(wk);
          byWeekDerivedMonth.set(mk, (byWeekDerivedMonth.get(mk) ?? 0) + count);
        }

        const allMonths = new Set([...byActualMonth.keys(), ...byWeekDerivedMonth.keys()]);
        for (const mk of allMonths) {
          const actual = byActualMonth.get(mk) ?? 0;
          const weekDerived = byWeekDerivedMonth.get(mk) ?? 0;
          const correction = actual - weekDerived;
          if (correction !== 0) {
            if (!monthly[mk]) monthly[mk] = emptyFunnel();
            monthly[mk][key] += correction;
            if (!memberCorr[mk]) memberCorr[mk] = {};
            (memberCorr[mk] as any)[key] = correction;
          }
        }
      }
      correctionsBuild.set(member.id, memberCorr);

      member.monthlyMetrics = monthly;

      const namesByMonth: Record<string, Partial<Record<GoalMetric, string[]>>> = {};
      const nameSources: { key: GoalMetric; agg: AggNames }[] = [
        { key: "ops", agg: opsNamesByMonth },
        { key: "demos", agg: demosNamesByMonth },
        { key: "wins", agg: winsNamesByMonth },
      ];
      for (const { key, agg } of nameSources) {
        const repNames = agg.get(repKey);
        if (!repNames) continue;
        for (const [mk, names] of repNames) {
          if (!namesByMonth[mk]) namesByMonth[mk] = {};
          namesByMonth[mk][key] = Array.from(names).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
        }
      }
      member.metricAccountNames = namesByMonth;

      const repWinTypes = winTypesByMonth.get(repKey);
      if (repWinTypes) {
        const wt: Record<string, WinTypeCounts> = {};
        for (const [mk, counts] of repWinTypes) {
          wt[mk] = { ...counts };
        }
        member.monthlyWinTypes = wt;
      } else {
        member.monthlyWinTypes = {};
      }

      const sortFn = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });

      const repWinTypeNames = winTypeNamesByMonth.get(repKey);
      if (repWinTypeNames) {
        const wtn: Record<string, WinTypeNames> = {};
        for (const [mk, sets] of repWinTypeNames) {
          wtn[mk] = { nb: Array.from(sets.nb).sort(sortFn), growth: Array.from(sets.growth).sort(sortFn) };
        }
        member.monthlyWinTypeNames = wtn;
      } else {
        member.monthlyWinTypeNames = {};
      }

      const repOpsTypes = opsTypesByMonth.get(repKey);
      if (repOpsTypes) {
        const ot: Record<string, WinTypeCounts> = {};
        for (const [mk, counts] of repOpsTypes) ot[mk] = { ...counts };
        member.monthlyOpsTypes = ot;
      } else {
        member.monthlyOpsTypes = {};
      }

      const repOpsTypeNames = opsTypeNamesByMonth.get(repKey);
      if (repOpsTypeNames) {
        const otn: Record<string, WinTypeNames> = {};
        for (const [mk, sets] of repOpsTypeNames) {
          otn[mk] = { nb: Array.from(sets.nb).sort(sortFn), growth: Array.from(sets.growth).sort(sortFn) };
        }
        member.monthlyOpsTypeNames = otn;
      } else {
        member.monthlyOpsTypeNames = {};
      }
    }

    // Derive touched accounts per rep per team from two sources:
    // 1. superhex rows where total_activities > 0 (attributed via first activity date)
    // 2. metrics_activity rows with a salesforce_accountid (attributed via activity_date)
    const superhexRows = shRows as unknown as DbSuperhex[];
    const tamRows = tamRows_raw as unknown as DbMetricsTam[];
    const historyRows = (hRes.data ?? []) as DbMemberTeamHistory[];
    const activityRows = actRows as { rep_name: string; activity_date: string | null; salesforce_accountid: string | null }[];

    const historyByMemberId = new Map<string, DbMemberTeamHistory[]>();
    for (const h of historyRows) {
      const arr = historyByMemberId.get(h.member_id) ?? [];
      arr.push(h);
      historyByMemberId.set(h.member_id, arr);
    }

    const findTeamForDate = (memberId: string, dateStr: string): string | null => {
      const ts = new Date(dateStr).getTime();
      const history = historyByMemberId.get(memberId) ?? [];
      for (const h of history) {
        const start = new Date(h.started_at).getTime();
        const end = h.ended_at ? new Date(h.ended_at).getTime() : Date.now();
        if (ts >= start && ts <= end) return h.team_id;
      }
      return null;
    };

    // memberId::teamId -> Set<salesforce_accountid>
    const accountsByMemberTeam = new Map<string, Set<string>>();

    const addTouchedAccount = (memberId: string, teamId: string, accountId: string) => {
      const key = `${memberId}::${teamId}`;
      if (!accountsByMemberTeam.has(key)) accountsByMemberTeam.set(key, new Set());
      accountsByMemberTeam.get(key)!.add(accountId);
    };

    // Source 1: superhex accounts with total_activities > 0
    for (const row of superhexRows) {
      if (!row.salesforce_accountid || row.total_activities <= 0) continue;
      const repKey = row.rep_name.toLowerCase().trim();
      const memberId = memberIdByName.get(repKey);
      if (!memberId) continue;

      const firstDate = getFirstActivityDate(row);
      if (!firstDate) continue;

      const teamId = findTeamForDate(memberId, firstDate);
      if (!teamId) continue;

      addTouchedAccount(memberId, teamId, row.salesforce_accountid);
    }

    // Source 2: metrics_activity rows with a salesforce_accountid
    for (const row of activityRows) {
      if (!row.salesforce_accountid || !row.activity_date) continue;
      const repKey = row.rep_name.toLowerCase().trim();
      const memberId = memberIdByName.get(repKey);
      if (!memberId) continue;

      const teamId = findTeamForDate(memberId, row.activity_date);
      if (!teamId) continue;

      addTouchedAccount(memberId, teamId, row.salesforce_accountid);
    }

    const tamByRep = new Map<string, number>();
    for (const row of tamRows) {
      const key = row.rep_name.toLowerCase().trim();
      tamByRep.set(key, (tamByRep.get(key) ?? 0) + row.tam);
    }

    for (const team of t) {
      for (const member of team.members) {
        const compositeKey = `${member.id}::${team.id}`;
        const accounts = accountsByMemberTeam.get(compositeKey);
        member.touchedAccountsByTeam[team.id] = accounts?.size ?? 0;
        const tamTouch = tamByRep.get(member.name.toLowerCase().trim());
        if (tamTouch) member.touchedTam = tamTouch;
      }
    }
    for (const member of u) {
      const tamTouch = tamByRep.get(member.name.toLowerCase().trim());
      if (tamTouch) member.touchedTam = tamTouch;
    }

    const membersMap = new Map<string, TeamMember>();
    for (const team of t) {
      for (const member of team.members) membersMap.set(member.id, member);
    }
    for (const member of u) membersMap.set(member.id, member);

    const historyEntries: MemberTeamHistoryEntry[] = ((hRes.data ?? []) as DbMemberTeamHistory[]).map((h) => ({
      id: h.id,
      memberId: h.member_id,
      teamId: h.team_id,
      startedAt: h.started_at,
      endedAt: h.ended_at,
    }));

    const teamGoalsHistoryEntries: TeamGoalsHistoryEntry[] = ((tghRes.data ?? []) as DbTeamGoalsHistory[]).map((h) => ({
      id: h.id,
      teamId: h.team_id,
      month: h.month,
      goalsParity: h.goals_parity,
      teamGoals: (h.team_goals as MemberGoals) ?? { ...DEFAULT_GOALS },
      enabledGoals: (h.enabled_goals as EnabledGoals) ?? { ...DEFAULT_ENABLED_GOALS },
      acceleratorConfig: (h.accelerator_config as AcceleratorConfig) ?? {},
      acceleratorMode: (h.accelerator_mode as AcceleratorMode) ?? 'basic',
      basicAcceleratorConfig: (h.basic_accelerator_config as BasicAcceleratorConfig) ?? {},
      teamGoalsByLevel: (h.team_goals_by_level as TeamGoalsByLevel) ?? { ...DEFAULT_TEAM_GOALS_BY_LEVEL },
      goalScopeConfig: (h.goal_scope_config as GoalScopeConfig) ?? { ...DEFAULT_GOAL_SCOPE_CONFIG },
      reliefMonthMembers: (h.relief_month_members as string[]) ?? [],
    }));

    const memberGoalsHistoryEntries: MemberGoalsHistoryEntry[] = ((mghRes.data ?? []) as DbMemberGoalsHistory[]).map((h) => ({
      id: h.id,
      memberId: h.member_id,
      month: h.month,
      goals: (h.goals as MemberGoals) ?? { ...DEFAULT_GOALS },
      level: (h.level as MemberLevel) ?? null,
    }));

    metricCorrectionsRef.current = correctionsBuild;

    const salesTeamEntries: SalesTeam[] = ((stRes.data ?? []) as DbMetricsSalesTeam[]).map((st) => ({
      id: st.id,
      managerName: st.manager_name,
      managerTitle: st.manager_title,
      locationReference: st.location_reference,
      teamSize: st.team_size,
      avgMonthlyWins: Number(st.avg_monthly_wins),
      teamMembers: st.team_members,
      displayName: `${st.location_reference} - ${st.manager_name}`,
    }));

    const projectedBookingEntries: ProjectedBooking[] = ((pbRes.data ?? []) as DbMetricsProjectedBookings[]).map((pb) => ({
      id: pb.id,
      month: pb.month,
      teamId: pb.team_id,
      projectedBookings: pb.projected_bookings,
      newBusinessAttach: pb.new_business_attach,
      growthWins: pb.growth_wins,
    }));

    const assignmentEntries: ProjectTeamAssignment[] = ((ptaRes.data ?? []) as DbProjectTeamAssignment[]).map((a) => ({
      id: a.id,
      teamId: a.team_id,
      salesTeamId: a.sales_team_id,
      monthIndex: a.month_index,
      excludedMembers: a.excluded_members ?? null,
    }));

    setTeams(t);
    setUnassignedMembers(u);
    setAllMembersById(membersMap);
    setMemberTeamHistory(historyEntries);
    setTeamGoalsHistory(teamGoalsHistoryEntries);
    setMemberGoalsHistory(memberGoalsHistoryEntries);
    setSalesTeams(salesTeamEntries);
    setProjectedBookings(projectedBookingEntries);
    setProjectTeamAssignments(assignmentEntries);
    setLoading(false);
  }, []);

  const loadAll = useCallback(async () => {
    const metrics = await loadMetrics();
    await loadCore(metrics);
  }, [loadMetrics, loadCore]);

  // ── initial load + realtime subscription ──
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coreDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedLoadAll = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (coreDebounceRef.current) clearTimeout(coreDebounceRef.current);
    debounceRef.current = setTimeout(() => loadAll(), 500);
  }, [loadAll]);

  const debouncedLoadCore = useCallback(() => {
    if (coreDebounceRef.current) clearTimeout(coreDebounceRef.current);
    coreDebounceRef.current = setTimeout(() => loadCore(), 500);
  }, [loadCore]);

  useEffect(() => {
    loadAll();

    const channel = supabase
      .channel("gtmx-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "teams" }, debouncedLoadCore)
      .on("postgres_changes", { event: "*", schema: "public", table: "members" }, debouncedLoadCore)
      .on("postgres_changes", { event: "*", schema: "public", table: "weekly_funnels" }, debouncedLoadCore)
      .on("postgres_changes", { event: "*", schema: "public", table: "win_entries" }, debouncedLoadCore)
      .on("postgres_changes", { event: "*", schema: "public", table: "superhex" }, debouncedLoadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "metrics_activity" }, debouncedLoadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "metrics_calls" }, debouncedLoadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "metrics_connects" }, debouncedLoadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "metrics_demos" }, debouncedLoadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "metrics_ops" }, debouncedLoadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "metrics_wins" }, debouncedLoadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "metrics_feedback" }, debouncedLoadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "metrics_sales_teams" }, debouncedLoadCore)
      .on("postgres_changes", { event: "*", schema: "public", table: "metrics_projected_bookings" }, debouncedLoadCore)
      .on("postgres_changes", { event: "*", schema: "public", table: "project_team_assignments" }, debouncedLoadCore)
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (coreDebounceRef.current) clearTimeout(coreDebounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [loadAll, debouncedLoadAll, debouncedLoadCore]);

  // ── mutations ──

  const snapshotMemberGoals = useCallback((memberId: string, goals: MemberGoals, level: MemberLevel | null) => {
    const month = currentMonthKey();
    dbMutate(
      supabase
        .from("member_goals_history")
        .upsert({
          member_id: memberId,
          month,
          goals,
          level,
        }, { onConflict: "member_id,month" }),
      "snapshot member goals history",
    );
    setMemberGoalsHistory((prev) => {
      const idx = prev.findIndex((h) => h.memberId === memberId && h.month === month);
      const entry: MemberGoalsHistoryEntry = {
        id: idx >= 0 ? prev[idx].id : crypto.randomUUID(),
        memberId,
        month,
        goals: { ...goals },
        level,
      };
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = entry;
        return next;
      }
      return [...prev, entry];
    });
  }, []);

  const upsertTeamGoalsHistory = useCallback((teamId: string, month: string, goals: {
    goalsParity: boolean;
    teamGoals: MemberGoals;
    enabledGoals: EnabledGoals;
    acceleratorConfig: AcceleratorConfig;
    acceleratorMode: AcceleratorMode;
    basicAcceleratorConfig: BasicAcceleratorConfig;
    teamGoalsByLevel: TeamGoalsByLevel;
    goalScopeConfig: GoalScopeConfig;
    reliefMonthMembers: string[];
  }) => {
    dbMutate(
      supabase
        .from("team_goals_history")
        .upsert({
          team_id: teamId,
          month,
          goals_parity: goals.goalsParity,
          team_goals: goals.teamGoals,
          enabled_goals: goals.enabledGoals,
          accelerator_config: goals.acceleratorConfig,
          accelerator_mode: goals.acceleratorMode,
          basic_accelerator_config: goals.basicAcceleratorConfig,
          team_goals_by_level: goals.teamGoalsByLevel,
          goal_scope_config: goals.goalScopeConfig,
          relief_month_members: goals.reliefMonthMembers,
        }, { onConflict: "team_id,month" }),
      "upsert team goals history",
    );
    setTeamGoalsHistory((prev) => {
      const idx = prev.findIndex((h) => h.teamId === teamId && h.month === month);
      const entry: TeamGoalsHistoryEntry = {
        id: idx >= 0 ? prev[idx].id : crypto.randomUUID(),
        teamId,
        month,
        ...goals,
      };
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = entry;
        return next;
      }
      return [...prev, entry];
    });
  }, []);

  const updateTeam = useCallback((teamId: string, updater: (team: Team) => Team) => {
    setTeams((prev) => {
      const next = prev.map((t) => (t.id === teamId ? updater(t) : t));
      const updated = next.find((t) => t.id === teamId);
      if (updated) {
        const old = prev.find((t) => t.id === teamId);

        // Recompute monthlyMetrics for members whose funnelByWeek changed
        if (old) {
          for (const member of updated.members) {
            const oldMember = old.members.find((om) => om.id === member.id);
            if (!oldMember || oldMember.funnelByWeek !== member.funnelByWeek) {
              member.monthlyMetrics = recomputeMonthlyMetrics(
                member, metricCorrectionsRef.current.get(member.id),
              );
            }
          }
          updatedMembersRef.current = updated.members;
        }

        const goalsChanged = old && (
          old.goalsParity !== updated.goalsParity ||
          JSON.stringify(old.teamGoals) !== JSON.stringify(updated.teamGoals) ||
          JSON.stringify(old.enabledGoals) !== JSON.stringify(updated.enabledGoals) ||
          JSON.stringify(old.acceleratorConfig) !== JSON.stringify(updated.acceleratorConfig) ||
          old.acceleratorMode !== updated.acceleratorMode ||
          JSON.stringify(old.basicAcceleratorConfig) !== JSON.stringify(updated.basicAcceleratorConfig) ||
          JSON.stringify(old.teamGoalsByLevel) !== JSON.stringify(updated.teamGoalsByLevel) ||
          JSON.stringify(old.goalScopeConfig) !== JSON.stringify(updated.goalScopeConfig) ||
          JSON.stringify(old.reliefMonthMembers) !== JSON.stringify(updated.reliefMonthMembers)
        );

        const overallGoalChanged = old && (
          old.overallGoal.winsEnabled !== updated.overallGoal.winsEnabled ||
          old.overallGoal.wins !== updated.overallGoal.wins ||
          old.overallGoal.totalPriceEnabled !== updated.overallGoal.totalPriceEnabled ||
          old.overallGoal.totalPrice !== updated.overallGoal.totalPrice ||
          old.overallGoal.discountThresholdEnabled !== updated.overallGoal.discountThresholdEnabled ||
          old.overallGoal.discountThreshold !== updated.overallGoal.discountThreshold ||
          old.overallGoal.realizedPriceEnabled !== updated.overallGoal.realizedPriceEnabled ||
          old.overallGoal.realizedPrice !== updated.overallGoal.realizedPrice ||
          JSON.stringify(old.overallGoal.lineItemTargets ?? []) !== JSON.stringify(updated.overallGoal.lineItemTargets ?? [])
        );

        if (
          old &&
          (old.name !== updated.name ||
            old.owner !== updated.owner ||
            old.leadRep !== updated.leadRep ||
            old.isActive !== updated.isActive ||
            old.startDate !== updated.startDate ||
            old.endDate !== updated.endDate ||
            old.totalTam !== updated.totalTam ||
            old.tamSubmitted !== updated.tamSubmitted ||
            old.missionPurpose !== updated.missionPurpose ||
            old.missionSubmitted !== updated.missionSubmitted ||
            old.missionLastEdit !== updated.missionLastEdit ||
            old.executiveSponsor !== updated.executiveSponsor ||
            old.executiveProxy !== updated.executiveProxy ||
            old.revenueLever !== updated.revenueLever ||
            old.businessGoal !== updated.businessGoal ||
            old.whatWeAreTesting !== updated.whatWeAreTesting ||
            JSON.stringify(old.topObjections) !== JSON.stringify(updated.topObjections) ||
            JSON.stringify(old.biggestRisks) !== JSON.stringify(updated.biggestRisks) ||
            old.onboardingProcess !== updated.onboardingProcess ||
            old.signalsSubmitted !== updated.signalsSubmitted ||
            old.signalsLastEdit !== updated.signalsLastEdit ||
            goalsChanged ||
            overallGoalChanged)
        ) {
          dbMutate(
            supabase
              .from("teams")
              .update({
                name: updated.name,
                owner: updated.owner,
                lead_rep: updated.leadRep,
                is_active: updated.isActive,
                start_date: updated.startDate,
                end_date: updated.endDate,
                total_tam: updated.totalTam,
                tam_submitted: updated.tamSubmitted,
                mission_purpose: updated.missionPurpose,
                mission_submitted: updated.missionSubmitted,
                mission_last_edit: updated.missionLastEdit,
                executive_sponsor: updated.executiveSponsor,
                executive_proxy: updated.executiveProxy,
                revenue_lever: updated.revenueLever,
                business_goal: updated.businessGoal,
                what_we_are_testing: updated.whatWeAreTesting,
                top_objections: updated.topObjections,
                biggest_risks: updated.biggestRisks,
                onboarding_process: updated.onboardingProcess,
                signals_submitted: updated.signalsSubmitted,
                signals_last_edit: updated.signalsLastEdit,
                goals_parity: updated.goalsParity,
                team_goal_calls: updated.teamGoals.calls,
                team_goal_ops: updated.teamGoals.ops,
                team_goal_demos: updated.teamGoals.demos,
                team_goal_wins: updated.teamGoals.wins,
                team_goal_feedback: updated.teamGoals.feedback,
                team_goal_activity: updated.teamGoals.activity,
                goal_enabled_calls: updated.enabledGoals.calls,
                goal_enabled_ops: updated.enabledGoals.ops,
                goal_enabled_demos: updated.enabledGoals.demos,
                goal_enabled_wins: updated.enabledGoals.wins,
                goal_enabled_feedback: updated.enabledGoals.feedback,
                goal_enabled_activity: updated.enabledGoals.activity,
                overall_goal_wins_enabled: updated.overallGoal.winsEnabled,
                overall_goal_wins: updated.overallGoal.wins,
                overall_goal_total_price_enabled: updated.overallGoal.totalPriceEnabled,
                overall_goal_total_price: updated.overallGoal.totalPrice,
                overall_goal_discount_threshold_enabled: updated.overallGoal.discountThresholdEnabled,
                overall_goal_discount_threshold: updated.overallGoal.discountThreshold,
                overall_goal_realized_price_enabled: updated.overallGoal.realizedPriceEnabled,
                overall_goal_realized_price: updated.overallGoal.realizedPrice,
                overall_goal_line_item_targets: JSON.stringify(updated.overallGoal.lineItemTargets ?? []),
                accelerator_config: updated.acceleratorConfig,
                accelerator_mode: updated.acceleratorMode,
                basic_accelerator_config: updated.basicAcceleratorConfig,
                team_goals_by_level: updated.teamGoalsByLevel,
                goal_scope_config: updated.goalScopeConfig,
                relief_month_members: updated.reliefMonthMembers,
              })
              .eq("id", teamId),
            "update team",
          );
        }

        if (goalsChanged) {
          const month = currentMonthKey();
          dbMutate(
            supabase
              .from("team_goals_history")
              .upsert({
                team_id: teamId,
                month,
                goals_parity: updated.goalsParity,
                team_goals: updated.teamGoals,
                enabled_goals: updated.enabledGoals,
                accelerator_config: updated.acceleratorConfig,
                accelerator_mode: updated.acceleratorMode,
                basic_accelerator_config: updated.basicAcceleratorConfig,
                team_goals_by_level: updated.teamGoalsByLevel,
                goal_scope_config: updated.goalScopeConfig,
                relief_month_members: updated.reliefMonthMembers,
              }, { onConflict: "team_id,month" }),
            "snapshot team goals history",
          );
          setTeamGoalsHistory((prev) => {
            const idx = prev.findIndex((h) => h.teamId === teamId && h.month === month);
            const entry: TeamGoalsHistoryEntry = {
              id: idx >= 0 ? prev[idx].id : crypto.randomUUID(),
              teamId,
              month,
              goalsParity: updated.goalsParity,
              teamGoals: { ...updated.teamGoals },
              enabledGoals: { ...updated.enabledGoals },
              acceleratorConfig: { ...updated.acceleratorConfig },
              acceleratorMode: updated.acceleratorMode,
              basicAcceleratorConfig: { ...updated.basicAcceleratorConfig },
              teamGoalsByLevel: { ...updated.teamGoalsByLevel },
              goalScopeConfig: { ...updated.goalScopeConfig },
              reliefMonthMembers: [...updated.reliefMonthMembers],
            };
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = entry;
              return next;
            }
            return [...prev, entry];
          });
        }
        if (old) {
          for (const member of updated.members) {
            const oldMember = old.members.find((m) => m.id === member.id);
            if (oldMember) {
              const goalUpdates: Record<string, number> = {};
              let memberGoalsChanged = false;
              for (const metric of GOAL_METRICS) {
                if (oldMember.goals[metric] !== member.goals[metric]) {
                  goalUpdates[`goal_${metric}`] = member.goals[metric];
                  memberGoalsChanged = true;
                }
              }
              if (Object.keys(goalUpdates).length > 0) {
                dbMutate(supabase.from("members").update(goalUpdates).eq("id", member.id), "update member goals");
              }
              if (memberGoalsChanged) {
                snapshotMemberGoals(member.id, member.goals, member.level);
              }
              if (oldMember.ducksEarned !== member.ducksEarned) {
                dbMutate(supabase.from("members").update({ ducks_earned: member.ducksEarned }).eq("id", member.id), "update ducks earned");
              }
            }
          }
        }
      }
      return next;
    });
    // Sync allMembersById with any member data that changed
    setAllMembersById((prev) => {
      const members = updatedMembersRef.current;
      if (members.length === 0) return prev;
      const next = new Map(prev);
      for (const m of members) next.set(m.id, m);
      return next;
    });
  }, []);

  const addTeam = useCallback(
    (name: string, owner = "", startDate: string | null = null, endDate: string | null = null) => {
      const tempId = crypto.randomUUID();
      setTeams((prev) => {
        const nextOrder = prev.length > 0 ? Math.max(...prev.map((t) => t.sortOrder)) + 1 : 0;
        const newTeam: Team = {
          id: tempId, name, owner, leadRep: "",
          sortOrder: nextOrder, isActive: true,
          startDate, endDate, totalTam: 0, tamSubmitted: false,
          missionPurpose: "", missionSubmitted: false, missionLastEdit: null,
          executiveSponsor: "", executiveProxy: "", revenueLever: "", businessGoal: "", whatWeAreTesting: "",
          topObjections: ["", "", ""],
          biggestRisks: ["", "", ""],
          onboardingProcess: "",
          signalsSubmitted: false,
          signalsLastEdit: null,
          goalsParity: false, teamGoals: { ...DEFAULT_GOALS },
          enabledGoals: { ...DEFAULT_ENABLED_GOALS },
          overallGoal: { ...DEFAULT_OVERALL_GOAL_CONFIG },
          acceleratorConfig: {},
          acceleratorMode: 'basic',
          basicAcceleratorConfig: {},
          teamGoalsByLevel: { ...DEFAULT_TEAM_GOALS_BY_LEVEL },
          goalScopeConfig: { ...DEFAULT_GOAL_SCOPE_CONFIG },
          reliefMonthMembers: [],
          members: [],
        };
        dbMutate(
          supabase
            .from("teams")
            .insert({ id: tempId, name, owner, sort_order: nextOrder, is_active: true, start_date: startDate, end_date: endDate }),
          "create team",
        );
        return [...prev, newTeam];
      });
    },
    []
  );

  const removeTeam = useCallback((teamId: string) => {
    setTeams((prev) => {
      const team = prev.find((t) => t.id === teamId);
      if (team) {
        const activeMembers = team.members.filter((m) => m.isActive);
        if (activeMembers.length > 0) {
          setUnassignedMembers((um) => [...um, ...activeMembers]);
        }
        const now = new Date().toISOString();
        for (const m of team.members) {
          dbMutate(supabase.from("members").update({ team_id: null }).eq("id", m.id), "unassign member on team remove");
          dbMutate(supabase.from("member_team_history").update({ ended_at: now }).eq("member_id", m.id).is("ended_at", null), "close member history");
          dbMutate(supabase.from("member_team_history").insert({ member_id: m.id, team_id: null }), "create unassigned history");
        }
      }
      return prev.filter((t) => t.id !== teamId);
    });
    dbMutate(supabase.from("teams").update({ archived_at: new Date().toISOString() }).eq("id", teamId), "archive team");
  }, []);

  const loadArchivedTeams = useCallback(async () => {
    const { data } = await supabase
      .from("teams")
      .select("id, name, owner, archived_at")
      .not("archived_at", "is", null)
      .order("archived_at", { ascending: false });
    if (data) {
      setArchivedTeams(
        data.map((t) => ({ id: t.id, name: t.name, owner: t.owner, archivedAt: t.archived_at! }))
      );
    }
  }, []);

  const unarchiveTeam = useCallback(async (teamId: string) => {
    await supabase.from("teams").update({ archived_at: null }).eq("id", teamId);

    const { data: dbTeam } = await supabase.from("teams").select("*").eq("id", teamId).single();
    if (!dbTeam) return;

    const t = dbTeam as DbTeam;
    const restoredTeam: Team = {
      id: t.id,
      name: t.name,
      owner: t.owner,
      leadRep: t.lead_rep,
      sortOrder: t.sort_order,
      isActive: t.is_active,
      startDate: t.start_date,
      endDate: t.end_date,
      totalTam: t.total_tam ?? 0,
      tamSubmitted: t.tam_submitted ?? false,
      missionPurpose: t.mission_purpose ?? "",
      missionSubmitted: t.mission_submitted ?? false,
      missionLastEdit: t.mission_last_edit ?? null,
      executiveSponsor: t.executive_sponsor ?? "",
      executiveProxy: t.executive_proxy ?? "",
      revenueLever: t.revenue_lever ?? "",
      businessGoal: t.business_goal ?? "",
      whatWeAreTesting: t.what_we_are_testing ?? "",
      topObjections: (t.top_objections as string[] | null) ?? ["", "", ""],
      biggestRisks: (t.biggest_risks as string[] | null) ?? ["", "", ""],
      onboardingProcess: t.onboarding_process ?? "",
      signalsSubmitted: t.signals_submitted ?? false,
      signalsLastEdit: t.signals_last_edit ?? null,
      goalsParity: t.goals_parity ?? false,
      teamGoals: {
        calls: t.team_goal_calls ?? 0,
        ops: t.team_goal_ops ?? 0,
        demos: t.team_goal_demos ?? 0,
        wins: t.team_goal_wins ?? 0,
        feedback: t.team_goal_feedback ?? 0,
        activity: t.team_goal_activity ?? 0,
      },
      enabledGoals: {
        calls: t.goal_enabled_calls ?? false,
        ops: t.goal_enabled_ops ?? false,
        demos: t.goal_enabled_demos ?? false,
        wins: t.goal_enabled_wins ?? false,
        feedback: t.goal_enabled_feedback ?? false,
        activity: t.goal_enabled_activity ?? false,
      },
      overallGoal: {
        winsEnabled: t.overall_goal_wins_enabled ?? false,
        wins: t.overall_goal_wins ?? 0,
        totalPriceEnabled: t.overall_goal_total_price_enabled ?? false,
        totalPrice: t.overall_goal_total_price ?? 0,
        discountThresholdEnabled: t.overall_goal_discount_threshold_enabled ?? false,
        discountThreshold: t.overall_goal_discount_threshold ?? 0,
        realizedPriceEnabled: t.overall_goal_realized_price_enabled ?? false,
        realizedPrice: t.overall_goal_realized_price ?? 0,
        lineItemTargets: parseLineItemTargetsFromDb(t.overall_goal_line_item_targets),
      },
      acceleratorConfig: (t.accelerator_config as AcceleratorConfig) ?? {},
      acceleratorMode: (t.accelerator_mode as AcceleratorMode) ?? 'basic',
      basicAcceleratorConfig: (t.basic_accelerator_config as BasicAcceleratorConfig) ?? {},
      teamGoalsByLevel: (t.team_goals_by_level as TeamGoalsByLevel) ?? { ...DEFAULT_TEAM_GOALS_BY_LEVEL },
      goalScopeConfig: (t.goal_scope_config as GoalScopeConfig) ?? { ...DEFAULT_GOAL_SCOPE_CONFIG },
      reliefMonthMembers: (t.relief_month_members as string[]) ?? [],
      members: [],
    };

    setTeams((prev) => [...prev, restoredTeam]);
    setArchivedTeams((prev) => prev.filter((a) => a.id !== teamId));
  }, []);

  const reorderTeams = useCallback((orderedIds: string[]) => {
    setTeams((prev) => {
      const byId = new Map(prev.map((t) => [t.id, t]));
      const reordered = orderedIds
        .map((id, i) => {
          const t = byId.get(id);
          return t ? { ...t, sortOrder: i } : null;
        })
        .filter(Boolean) as Team[];
      for (const t of reordered) {
        dbMutate(supabase.from("teams").update({ sort_order: t.sortOrder }).eq("id", t.id), "reorder team");
      }
      return reordered;
    });
  }, []);

  const reorderMembers = useCallback((orderedIds: string[]) => {
    const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
    const reorderArr = <T extends { id: string; sortOrder: number }>(arr: T[]): T[] =>
      arr.map((m) => ({ ...m, sortOrder: orderMap.get(m.id) ?? m.sortOrder }))
        .sort((a, b) => a.sortOrder - b.sortOrder);

    setTeams((prev) =>
      prev.map((t) => ({ ...t, members: reorderArr(t.members) }))
    );
    setUnassignedMembers((prev) => reorderArr(prev));
    setAllMembersById((prev) => {
      const next = new Map(prev);
      for (const [id, order] of orderMap) {
        const m = next.get(id);
        if (m) next.set(id, { ...m, sortOrder: order });
      }
      return next;
    });

    for (const [id, order] of orderMap) {
      dbMutate(supabase.from("members").update({ sort_order: order }).eq("id", id), "reorder member");
    }
  }, []);

  const toggleTeamActive = useCallback((teamId: string, isActive: boolean) => {
    setTeams((prev) =>
      prev.map((t) => (t.id === teamId ? { ...t, isActive } : t))
    );
    dbMutate(supabase.from("teams").update({ is_active: isActive }).eq("id", teamId), "toggle team active");
  }, []);

  const createMember = useCallback((name: string, goals?: Partial<MemberGoals>): TeamMember => {
    const id = crypto.randomUUID();
    const memberGoals: MemberGoals = { ...DEFAULT_GOALS, ...goals };
    const allExisting = [...teams.flatMap((t) => t.members), ...unassignedMembers];
    const nextOrder = allExisting.length > 0 ? Math.max(...allExisting.map((m) => m.sortOrder)) + 1 : 0;
    const member: TeamMember = { id, name, level: null, goals: memberGoals, wins: [], ducksEarned: 0, funnelByWeek: {}, monthlyMetrics: {}, monthlyWinTypes: {}, monthlyWinTypeNames: {}, monthlyOpsTypes: {}, monthlyOpsTypeNames: {}, metricAccountNames: {}, isActive: true, sortOrder: nextOrder, touchedAccountsByTeam: {}, touchedTam: 0 };
    setUnassignedMembers((prev) => [...prev, member]);
    dbMutate(
      supabase
        .from("members")
        .insert({ id, name, ...memberGoalsToDbInsert(memberGoals), team_id: null, ducks_earned: 0, is_active: true, sort_order: nextOrder }),
      "create member",
    );
    dbMutate(supabase.from("member_team_history").insert({ member_id: id, team_id: null }), "create member history");
    return member;
  }, [teams, unassignedMembers]);

  const updateMember = useCallback((memberId: string, updates: { name?: string; goals?: Partial<MemberGoals>; level?: MemberLevel | null }) => {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.level !== undefined) dbUpdates.level = updates.level;
    if (updates.goals) {
      for (const [metric, value] of Object.entries(updates.goals)) {
        if (value !== undefined) dbUpdates[`goal_${metric}`] = value;
      }
    }

    const applyUpdates = (m: TeamMember): TeamMember => ({
      ...m,
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.level !== undefined && { level: updates.level }),
      ...(updates.goals && { goals: { ...m.goals, ...updates.goals } }),
    });

    const needsGoalSnapshot = updates.goals !== undefined || updates.level !== undefined;
    let snapshotDone = false;

    setUnassignedMembers((prev) =>
      prev.map((m) => (m.id === memberId ? applyUpdates(m) : m))
    );
    setTeams((prev) =>
      prev.map((t) => ({
        ...t,
        members: t.members.map((m) => (m.id === memberId ? applyUpdates(m) : m)),
      }))
    );

    if (needsGoalSnapshot && !snapshotDone) {
      const findMember = (): TeamMember | undefined => {
        for (const t of teams) {
          const m = t.members.find((mm) => mm.id === memberId);
          if (m) return applyUpdates(m);
        }
        const um = unassignedMembers.find((m) => m.id === memberId);
        if (um) return applyUpdates(um);
        return undefined;
      };
      const updated = findMember();
      if (updated) {
        snapshotMemberGoals(updated.id, updated.goals, updated.level);
        snapshotDone = true;
      }
    }

    if (Object.keys(dbUpdates).length > 0) {
      dbMutate(supabase.from("members").update(dbUpdates).eq("id", memberId), "update member");
    }
  }, [snapshotMemberGoals, teams, unassignedMembers]);

  const assignMember = useCallback((memberId: string, targetTeamId: string) => {
    const fromUnassigned = unassignedMembers.find((m) => m.id === memberId);
    if (fromUnassigned) {
      setUnassignedMembers((prev) => prev.filter((m) => m.id !== memberId));
      setTeams((prev) =>
        prev.map((t) =>
          t.id === targetTeamId ? { ...t, members: [...t.members, fromUnassigned] } : t
        )
      );
      dbMutate(supabase.from("members").update({ team_id: targetTeamId }).eq("id", memberId), "assign member to team");
      dbMutate(supabase.from("member_team_history").update({ ended_at: new Date().toISOString() }).eq("member_id", memberId).is("ended_at", null), "close member history");
      dbMutate(supabase.from("member_team_history").insert({ member_id: memberId, team_id: targetTeamId }), "create assigned history");
      return;
    }

    setTeams((prev) => {
      let member: TeamMember | undefined;
      const sourceTeamId = prev.find((t) => {
        member = t.members.find((m) => m.id === memberId && m.isActive);
        return !!member;
      })?.id;
      if (!member || sourceTeamId === targetTeamId) return prev;

      dbMutate(supabase.from("members").update({ team_id: targetTeamId }).eq("id", memberId), "reassign member");
      dbMutate(supabase.from("member_team_history").update({ ended_at: new Date().toISOString() }).eq("member_id", memberId).is("ended_at", null), "close member history");
      dbMutate(supabase.from("member_team_history").insert({ member_id: memberId, team_id: targetTeamId }), "create reassigned history");

      return prev.map((t) => {
        if (t.id === sourceTeamId)
          return { ...t, members: t.members.filter((m) => m.id !== memberId) };
        if (t.id === targetTeamId)
          return { ...t, members: [...t.members, member!] };
        return t;
      });
    });
  }, [unassignedMembers]);

  const unassignMember = useCallback((memberId: string, fromTeamId: string) => {
    setTeams((prev) => {
      const team = prev.find((t) => t.id === fromTeamId);
      const member = team?.members.find((m) => m.id === memberId && m.isActive);
      if (!member) return prev;

      dbMutate(supabase.from("members").update({ team_id: null }).eq("id", memberId), "unassign member");
      dbMutate(supabase.from("member_team_history").update({ ended_at: new Date().toISOString() }).eq("member_id", memberId).is("ended_at", null), "close member history");
      dbMutate(supabase.from("member_team_history").insert({ member_id: memberId, team_id: null }), "create unassigned history");

      setUnassignedMembers((um) => [...um, member]);

      return prev.map((t) =>
        t.id === fromTeamId
          ? { ...t, members: t.members.filter((m) => m.id !== memberId) }
          : t
      );
    });
  }, []);

  const archiveMember = useCallback((memberId: string) => {
    const now = new Date().toISOString();
    setUnassignedMembers((prev) => prev.filter((m) => m.id !== memberId));
    setTeams((prev) =>
      prev.map((t) => ({
        ...t,
        members: t.members.filter((m) => m.id !== memberId),
      }))
    );
    setAllMembersById((prev) => {
      const next = new Map(prev);
      next.delete(memberId);
      return next;
    });
    dbMutate(supabase.from("members").update({ archived_at: now, team_id: null }).eq("id", memberId), "archive member");
    dbMutate(supabase.from("member_team_history").update({ ended_at: now }).eq("member_id", memberId).is("ended_at", null), "close member history");
  }, []);

  const removeMember = archiveMember;

  const loadArchivedMembers = useCallback(async () => {
    const { data } = await supabase
      .from("members")
      .select("id, name, level, archived_at")
      .not("archived_at", "is", null)
      .order("archived_at", { ascending: false });
    if (data) {
      setArchivedMembers(
        data.map((m) => ({
          id: m.id,
          name: m.name,
          level: (m.level as MemberLevel) ?? null,
          archivedAt: m.archived_at!,
        }))
      );
    }
  }, []);

  const unarchiveMember = useCallback(async (memberId: string) => {
    await supabase.from("members").update({ archived_at: null }).eq("id", memberId);

    const { data: dbMember } = await supabase.from("members").select("*").eq("id", memberId).single();
    if (!dbMember) return;

    const row = dbMember as DbMember;
    const { data: funnels } = await supabase.from("weekly_funnels").select("*").eq("member_id", memberId);
    const { data: wins } = await supabase.from("win_entries").select("*").eq("member_id", memberId);

    const member = dbMemberToApp(
      row,
      (funnels ?? []) as DbWeeklyFunnel[],
      (wins ?? []) as DbWinEntry[],
    );

    setUnassignedMembers((prev) => [...prev, member]);
    setAllMembersById((prev) => {
      const next = new Map(prev);
      next.set(member.id, member);
      return next;
    });
    setArchivedMembers((prev) => prev.filter((m) => m.id !== memberId));
    dbMutate(supabase.from("member_team_history").insert({ member_id: memberId, team_id: null }), "create unassigned history for unarchived member");
  }, []);

  const updateHistoricalRoster = useCallback((teamId: string, referenceDate: Date, memberIds: string[]) => {
    const monthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
    const monthEnd = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0, 23, 59, 59, 999);
    const monthStartISO = monthStart.toISOString();
    const monthEndISO = monthEnd.toISOString();

    const currentIds = new Set<string>();
    const relevantEntries: MemberTeamHistoryEntry[] = [];
    for (const entry of memberTeamHistory) {
      if (entry.teamId !== teamId) continue;
      const start = new Date(entry.startedAt);
      const end = entry.endedAt ? new Date(entry.endedAt) : new Date("9999-12-31");
      if (start <= monthEnd && end >= monthStart) {
        currentIds.add(entry.memberId);
        relevantEntries.push(entry);
      }
    }

    const desiredIds = new Set(memberIds);
    const toAdd = memberIds.filter((id) => !currentIds.has(id));
    const toRemove = Array.from(currentIds).filter((id) => !desiredIds.has(id));

    if (toAdd.length === 0 && toRemove.length === 0) return;

    const newEntries: MemberTeamHistoryEntry[] = [];
    const removedEntryIds = new Set<string>();

    for (const memberId of toRemove) {
      const entries = relevantEntries.filter((e) => e.memberId === memberId);
      for (const entry of entries) {
        const entryStart = new Date(entry.startedAt);
        const entryEnd = entry.endedAt ? new Date(entry.endedAt) : null;
        removedEntryIds.add(entry.id);

        if (entryStart < monthStart) {
          const beforeEnd = new Date(monthStart.getTime() - 1);
          dbMutate(
            supabase.from("member_team_history").update({ ended_at: beforeEnd.toISOString() }).eq("id", entry.id),
            "trim history entry before month",
          );
          newEntries.push({ ...entry, endedAt: beforeEnd.toISOString() });

          if (!entryEnd || entryEnd > monthEnd) {
            const afterStart = new Date(monthEnd.getFullYear(), monthEnd.getMonth() + 1, 1);
            dbMutate(
              supabase.from("member_team_history").insert({
                member_id: memberId,
                team_id: teamId,
                started_at: afterStart.toISOString(),
                ended_at: entry.endedAt,
              }),
              "create continuation entry after month",
            );
            newEntries.push({
              id: crypto.randomUUID(),
              memberId,
              teamId,
              startedAt: afterStart.toISOString(),
              endedAt: entry.endedAt,
            });
          }
        } else if (!entryEnd || entryEnd > monthEnd) {
          const afterStart = new Date(monthEnd.getFullYear(), monthEnd.getMonth() + 1, 1);
          dbMutate(
            supabase.from("member_team_history").update({ started_at: afterStart.toISOString() }).eq("id", entry.id),
            "shift history entry start past month",
          );
          newEntries.push({ ...entry, startedAt: afterStart.toISOString() });
        } else {
          dbMutate(
            supabase.from("member_team_history").delete().eq("id", entry.id),
            "delete history entry within month",
          );
        }
      }
    }

    for (const memberId of toAdd) {
      const id = crypto.randomUUID();
      dbMutate(
        supabase.from("member_team_history").insert({
          id,
          member_id: memberId,
          team_id: teamId,
          started_at: monthStartISO,
          ended_at: monthEndISO,
        }),
        "add historical roster entry",
      );
      newEntries.push({ id, memberId, teamId, startedAt: monthStartISO, endedAt: monthEndISO });
    }

    setMemberTeamHistory((prev) => [
      ...prev.filter((e) => !removedEntryIds.has(e.id)),
      ...newEntries,
    ]);
  }, [memberTeamHistory]);

  const assignSalesTeam = useCallback((teamId: string, salesTeamId: string, monthIndex: number, excludedMembers: string | null = null) => {
    const tempId = crypto.randomUUID();
    setProjectTeamAssignments((prev) => {
      if (prev.some((a) => a.teamId === teamId && a.salesTeamId === salesTeamId && a.monthIndex === monthIndex)) return prev;
      return [...prev, { id: tempId, teamId, salesTeamId, monthIndex, excludedMembers }];
    });
    const row: Record<string, unknown> = { id: tempId, team_id: teamId, sales_team_id: salesTeamId, month_index: monthIndex };
    if (excludedMembers != null) row.excluded_members = excludedMembers;
    dbMutate(
      supabase.from("project_team_assignments").insert(row),
      "assign sales team",
    );
  }, []);

  const unassignSalesTeam = useCallback((teamId: string, salesTeamId: string, monthIndex: number) => {
    setProjectTeamAssignments((prev) =>
      prev.filter((a) => !(a.teamId === teamId && a.salesTeamId === salesTeamId && a.monthIndex === monthIndex))
    );
    dbMutate(
      supabase.from("project_team_assignments").delete().eq("team_id", teamId).eq("sales_team_id", salesTeamId).eq("month_index", monthIndex),
      "unassign sales team",
    );
  }, []);

  const updateExcludedMembers = useCallback((teamId: string, salesTeamId: string, monthIndex: number, excludedMembers: string | null) => {
    setProjectTeamAssignments((prev) =>
      prev.map((a) =>
        a.teamId === teamId && a.salesTeamId === salesTeamId && a.monthIndex === monthIndex
          ? { ...a, excludedMembers }
          : a
      )
    );
    dbMutate(
      supabase.from("project_team_assignments")
        .update({ excluded_members: excludedMembers })
        .eq("team_id", teamId)
        .eq("sales_team_id", salesTeamId)
        .eq("month_index", monthIndex),
      "update excluded members",
    );
  }, []);

  const contextValue = useMemo(() => ({
    teams,
    setTeams,
    unassignedMembers,
    setUnassignedMembers,
    memberTeamHistory,
    teamGoalsHistory,
    memberGoalsHistory,
    allMembersById,
    archivedTeams,
    loadArchivedTeams,
    unarchiveTeam,
    archivedMembers,
    loadArchivedMembers,
    archiveMember,
    unarchiveMember,
    updateTeam,
    addTeam,
    removeTeam,
    reorderTeams,
    reorderMembers,
    toggleTeamActive,
    createMember,
    updateMember,
    assignMember,
    unassignMember,
    removeMember,
    upsertTeamGoalsHistory,
    updateHistoricalRoster,
    salesTeams,
    projectedBookings,
    projectTeamAssignments,
    assignSalesTeam,
    unassignSalesTeam,
    updateExcludedMembers,
    reloadAll: loadAll,
    loading,
    opsRows,
  }), [
    teams, unassignedMembers, memberTeamHistory, teamGoalsHistory, memberGoalsHistory,
    allMembersById, archivedTeams, archivedMembers, loading, opsRows,
    salesTeams, projectedBookings, projectTeamAssignments,
    loadArchivedTeams, unarchiveTeam, loadArchivedMembers, archiveMember, unarchiveMember,
    updateTeam, addTeam, removeTeam, reorderTeams, reorderMembers, toggleTeamActive,
    createMember, updateMember, assignMember, unassignMember, removeMember,
    upsertTeamGoalsHistory, updateHistoricalRoster, assignSalesTeam, unassignSalesTeam, updateExcludedMembers, loadAll,
  ]);

  return (
    <TeamsContext.Provider value={contextValue}>
      {children}
    </TeamsContext.Provider>
  );
}
