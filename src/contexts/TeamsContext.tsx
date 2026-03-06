import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { dbMutate } from "@/lib/supabase-helpers";
import type { DbTeam, DbMember, DbWeeklyFunnel, DbWinEntry, DbSuperhex, DbMetricsTam, DbMemberTeamHistory, DbTeamGoalsHistory, DbMemberGoalsHistory } from "@/lib/database.types";

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

export interface TeamMember {
  id: string;
  name: string;
  level: MemberLevel | null;
  goals: MemberGoals;
  wins: WinEntry[];
  ducksEarned: number;
  funnelByWeek: Record<string, WeeklyFunnel>;
  isActive: boolean;
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
  goalsParity: boolean;
  teamGoals: MemberGoals;
  enabledGoals: EnabledGoals;
  acceleratorConfig: AcceleratorConfig;
  teamGoalsByLevel: TeamGoalsByLevel;
  goalScopeConfig: GoalScopeConfig;
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
  teamGoalsByLevel: TeamGoalsByLevel;
  goalScopeConfig: GoalScopeConfig;
}

export interface MemberGoalsHistoryEntry {
  id: string;
  memberId: string;
  month: string;
  goals: MemberGoals;
  level: MemberLevel | null;
}

function toMonthKey(d: Date): string {
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
  if (!entry) return team;
  return {
    ...team,
    goalsParity: entry.goalsParity,
    teamGoals: entry.teamGoals,
    enabledGoals: entry.enabledGoals,
    acceleratorConfig: entry.acceleratorConfig,
    teamGoalsByLevel: entry.teamGoalsByLevel,
    goalScopeConfig: entry.goalScopeConfig,
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
    .filter((m): m is TeamMember => m != null);
}

function getFirstActivityDate(row: { first_activity_date?: string | null; first_call_date?: string | null; first_connect_date?: string | null; first_demo_date?: string | null; last_activity_date?: string | null }): string | null {
  return row.first_activity_date || row.first_call_date || row.first_connect_date || row.first_demo_date || row.last_activity_date || null;
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
    wins: wins.map((w) => ({
      id: w.id,
      restaurant: w.restaurant,
      story: w.story ?? undefined,
      date: w.date,
    })),
    funnelByWeek,
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
      acceleratorConfig: (t.accelerator_config as AcceleratorConfig) ?? {},
      teamGoalsByLevel: (t.team_goals_by_level as TeamGoalsByLevel) ?? { ...DEFAULT_TEAM_GOALS_BY_LEVEL },
      goalScopeConfig: (t.goal_scope_config as GoalScopeConfig) ?? { ...DEFAULT_GOAL_SCOPE_CONFIG },
      members: dbMembers.filter((m) => m.team_id === t.id).map(toAppMember),
    }));

  const unassigned = dbMembers.filter((m) => m.team_id === null && m.is_active).map(toAppMember);

  return { teams, unassigned };
}

// ── context ──

interface TeamsContextType {
  teams: Team[];
  setTeams: React.Dispatch<React.SetStateAction<Team[]>>;
  unassignedMembers: TeamMember[];
  setUnassignedMembers: React.Dispatch<React.SetStateAction<TeamMember[]>>;
  memberTeamHistory: MemberTeamHistoryEntry[];
  teamGoalsHistory: TeamGoalsHistoryEntry[];
  memberGoalsHistory: MemberGoalsHistoryEntry[];
  allMembersById: Map<string, TeamMember>;
  updateTeam: (teamId: string, updater: (team: Team) => Team) => void;
  addTeam: (name: string, owner?: string, startDate?: string | null, endDate?: string | null) => void;
  removeTeam: (teamId: string) => void;
  reorderTeams: (orderedIds: string[]) => void;
  toggleTeamActive: (teamId: string, isActive: boolean) => void;
  createMember: (name: string, goals?: Partial<MemberGoals>) => TeamMember;
  updateMember: (memberId: string, updates: { name?: string; goals?: Partial<MemberGoals>; level?: MemberLevel | null }) => void;
  assignMember: (memberId: string, targetTeamId: string) => void;
  unassignMember: (memberId: string, fromTeamId: string) => void;
  removeMember: (memberId: string) => void;
  loading: boolean;
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
  const [loading, setLoading] = useState(true);

  // ── load all data & merge event-table metrics into funnels ──
  const loadAll = useCallback(async () => {
    const [tRes, mRes, fRes, wRes, actRows, callRows, conRows, demoRows, opsRows, winsRows, fbRows, shRows, tamRows_raw, hRes, tghRes, mghRes] = await Promise.all([
      supabase.from("teams").select("*").is("archived_at", null),
      supabase.from("members").select("*"),
      supabase.from("weekly_funnels").select("*"),
      supabase.from("win_entries").select("*"),
      fetchAllRows("metrics_activity", "rep_name, activity_date, salesforce_accountid"),
      fetchAllRows("metrics_calls", "rep_name, call_date"),
      fetchAllRows("metrics_connects", "rep_name, connect_date"),
      fetchAllRows("metrics_demos", "rep_name, demo_date"),
      fetchAllRows("metrics_ops", "rep_name, op_date, created_date"),
      fetchAllRows("metrics_wins", "rep_name, win_date"),
      fetchAllRows("metrics_feedback", "rep_name, feedback_date"),
      fetchAllRows("superhex", "rep_name, salesforce_accountid, total_activities, first_activity_date, first_call_date, first_connect_date, first_demo_date, last_activity_date"),
      fetchAllRows("metrics_tam", "rep_name, tam"),
      supabase.from("member_team_history").select("*"),
      supabase.from("team_goals_history").select("*"),
      supabase.from("member_goals_history").select("*"),
    ]);

    const dbMembers = (mRes.data ?? []) as DbMember[];
    const dbFunnels = (fRes.data ?? []) as DbWeeklyFunnel[];

    const memberIdByName = new Map<string, string>();
    for (const m of dbMembers) {
      memberIdByName.set(m.name.toLowerCase().trim(), m.id);
    }

    // Convert a date string (YYYY-MM-DD) to the Monday week key used by weekly_funnels
    const dateToWeekKey = (dateStr: string): string => {
      const d = new Date(dateStr + "T00:00:00");
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };

    // Aggregate event rows into weekly counts keyed by (rep_name_lower, weekKey)
    type WeeklyCounts = Map<string, Map<string, number>>;
    const aggregateByWeek = (rows: Record<string, unknown>[], dateField: string): WeeklyCounts => {
      const result: WeeklyCounts = new Map();
      for (const row of rows) {
        const dateVal = row[dateField] as string | null;
        if (!dateVal) continue;
        const repKey = (row.rep_name as string).toLowerCase().trim();
        const weekKey = dateToWeekKey(dateVal);
        if (!result.has(repKey)) result.set(repKey, new Map());
        const repMap = result.get(repKey)!;
        repMap.set(weekKey, (repMap.get(weekKey) ?? 0) + 1);
      }
      return result;
    };

    const activityByWeek = aggregateByWeek(actRows, "activity_date");
    const callsByWeek = aggregateByWeek(callRows, "call_date");
    const connectsByWeek = aggregateByWeek(conRows, "connect_date");
    const demosByWeek = aggregateByWeek(demoRows, "demo_date");
    const opsByWeek = aggregateByWeek(opsRows, "op_date");
    const winsByWeek = aggregateByWeek(winsRows, "win_date");
    const feedbackByWeek = aggregateByWeek(fbRows, "feedback_date");

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
      teamGoalsByLevel: (h.team_goals_by_level as TeamGoalsByLevel) ?? { ...DEFAULT_TEAM_GOALS_BY_LEVEL },
      goalScopeConfig: (h.goal_scope_config as GoalScopeConfig) ?? { ...DEFAULT_GOAL_SCOPE_CONFIG },
    }));

    const memberGoalsHistoryEntries: MemberGoalsHistoryEntry[] = ((mghRes.data ?? []) as DbMemberGoalsHistory[]).map((h) => ({
      id: h.id,
      memberId: h.member_id,
      month: h.month,
      goals: (h.goals as MemberGoals) ?? { ...DEFAULT_GOALS },
      level: (h.level as MemberLevel) ?? null,
    }));

    setTeams(t);
    setUnassignedMembers(u);
    setAllMembersById(membersMap);
    setMemberTeamHistory(historyEntries);
    setTeamGoalsHistory(teamGoalsHistoryEntries);
    setMemberGoalsHistory(memberGoalsHistoryEntries);
    setLoading(false);
  }, []);

  // ── initial load + realtime subscription ──
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedLoadAll = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadAll(), 500);
  }, [loadAll]);

  useEffect(() => {
    loadAll();

    const channel = supabase
      .channel("gtmx-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "teams" }, debouncedLoadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "members" }, debouncedLoadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "weekly_funnels" }, debouncedLoadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "win_entries" }, debouncedLoadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "superhex" }, debouncedLoadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "metrics_activity" }, debouncedLoadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "metrics_calls" }, debouncedLoadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "metrics_connects" }, debouncedLoadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "metrics_demos" }, debouncedLoadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "metrics_ops" }, debouncedLoadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "metrics_wins" }, debouncedLoadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "metrics_feedback" }, debouncedLoadAll)
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [loadAll, debouncedLoadAll]);

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

  const updateTeam = useCallback((teamId: string, updater: (team: Team) => Team) => {
    setTeams((prev) => {
      const next = prev.map((t) => (t.id === teamId ? updater(t) : t));
      const updated = next.find((t) => t.id === teamId);
      if (updated) {
        const old = prev.find((t) => t.id === teamId);
        const goalsChanged = old && (
          old.goalsParity !== updated.goalsParity ||
          JSON.stringify(old.teamGoals) !== JSON.stringify(updated.teamGoals) ||
          JSON.stringify(old.enabledGoals) !== JSON.stringify(updated.enabledGoals) ||
          JSON.stringify(old.acceleratorConfig) !== JSON.stringify(updated.acceleratorConfig) ||
          JSON.stringify(old.teamGoalsByLevel) !== JSON.stringify(updated.teamGoalsByLevel) ||
          JSON.stringify(old.goalScopeConfig) !== JSON.stringify(updated.goalScopeConfig)
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
            goalsChanged)
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
                accelerator_config: updated.acceleratorConfig,
                team_goals_by_level: updated.teamGoalsByLevel,
                goal_scope_config: updated.goalScopeConfig,
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
                team_goals_by_level: updated.teamGoalsByLevel,
                goal_scope_config: updated.goalScopeConfig,
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
              teamGoalsByLevel: { ...updated.teamGoalsByLevel },
              goalScopeConfig: { ...updated.goalScopeConfig },
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
          missionPurpose: "", missionSubmitted: false,
          goalsParity: false, teamGoals: { ...DEFAULT_GOALS },
          enabledGoals: { ...DEFAULT_ENABLED_GOALS },
          acceleratorConfig: {},
          teamGoalsByLevel: { ...DEFAULT_TEAM_GOALS_BY_LEVEL },
          goalScopeConfig: { ...DEFAULT_GOAL_SCOPE_CONFIG },
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

  const toggleTeamActive = useCallback((teamId: string, isActive: boolean) => {
    setTeams((prev) =>
      prev.map((t) => (t.id === teamId ? { ...t, isActive } : t))
    );
    dbMutate(supabase.from("teams").update({ is_active: isActive }).eq("id", teamId), "toggle team active");
  }, []);

  const createMember = useCallback((name: string, goals?: Partial<MemberGoals>): TeamMember => {
    const id = crypto.randomUUID();
    const memberGoals: MemberGoals = { ...DEFAULT_GOALS, ...goals };
    const member: TeamMember = { id, name, level: null, goals: memberGoals, wins: [], ducksEarned: 0, funnelByWeek: {}, isActive: true, touchedAccountsByTeam: {}, touchedTam: 0 };
    setUnassignedMembers((prev) => [...prev, member]);
    dbMutate(
      supabase
        .from("members")
        .insert({ id, name, ...memberGoalsToDbInsert(memberGoals), team_id: null, ducks_earned: 0, is_active: true }),
      "create member",
    );
    dbMutate(supabase.from("member_team_history").insert({ member_id: id, team_id: null }), "create member history");
    return member;
  }, []);

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

  const removeMember = useCallback((memberId: string) => {
    setUnassignedMembers((prev) => prev.filter((m) => m.id !== memberId));
    setTeams((prev) =>
      prev.map((t) => ({
        ...t,
        members: t.members.map((m) =>
          m.id === memberId ? { ...m, isActive: false } : m
        ),
      }))
    );
    dbMutate(supabase.from("members").update({ is_active: false }).eq("id", memberId), "deactivate member");
    dbMutate(supabase.from("member_team_history").update({ ended_at: new Date().toISOString() }).eq("member_id", memberId).is("ended_at", null), "close member history");
  }, []);

  return (
    <TeamsContext.Provider
      value={{
        teams,
        setTeams,
        unassignedMembers,
        setUnassignedMembers,
        memberTeamHistory,
        teamGoalsHistory,
        memberGoalsHistory,
        allMembersById,
        updateTeam,
        addTeam,
        removeTeam,
        reorderTeams,
        toggleTeamActive,
        createMember,
        updateMember,
        assignMember,
        unassignMember,
        removeMember,
        loading,
      }}
    >
      {children}
    </TeamsContext.Provider>
  );
}
