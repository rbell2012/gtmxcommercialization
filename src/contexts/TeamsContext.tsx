import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { dbMutate } from "@/lib/supabase-helpers";
import type { DbTeam, DbMember, DbWeeklyFunnel, DbWinEntry, DbSuperhex, DbMetricsTouchedAccounts, DbMemberTeamHistory, DbTeamGoalsHistory, DbMemberGoalsHistory } from "@/lib/database.types";

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
  touchedAccounts: number;
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
    touchedAccounts: 0,
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

export function TeamsProvider({ children }: { children: ReactNode }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [unassignedMembers, setUnassignedMembers] = useState<TeamMember[]>([]);
  const [memberTeamHistory, setMemberTeamHistory] = useState<MemberTeamHistoryEntry[]>([]);
  const [teamGoalsHistory, setTeamGoalsHistory] = useState<TeamGoalsHistoryEntry[]>([]);
  const [memberGoalsHistory, setMemberGoalsHistory] = useState<MemberGoalsHistoryEntry[]>([]);
  const [allMembersById, setAllMembersById] = useState<Map<string, TeamMember>>(new Map());
  const [loading, setLoading] = useState(true);

  // ── load all data & merge superhex into funnels ──
  const loadAll = useCallback(async () => {
    const [tRes, mRes, fRes, wRes, sRes, taRes, hRes, tghRes, mghRes] = await Promise.all([
      supabase.from("teams").select("*").is("archived_at", null),
      supabase.from("members").select("*"),
      supabase.from("weekly_funnels").select("*"),
      supabase.from("win_entries").select("*"),
      supabase.from("superhex").select("*"),
      supabase.from("metrics_touched_accounts").select("*"),
      supabase.from("member_team_history").select("*"),
      supabase.from("team_goals_history").select("*"),
      supabase.from("member_goals_history").select("*"),
    ]);

    const dbMembers = (mRes.data ?? []) as DbMember[];
    const dbFunnels = (fRes.data ?? []) as DbWeeklyFunnel[];
    const superhexRows = (sRes.data ?? []) as DbSuperhex[];

    // Build name -> member_id lookup (case-insensitive, trimmed)
    const memberIdByName = new Map<string, string>();
    for (const m of dbMembers) {
      memberIdByName.set(m.name.toLowerCase().trim(), m.id);
    }

    // Merge superhex data into funnels
    const funnelKey = (memberId: string, weekKey: string) =>
      `${memberId}::${weekKey}`;
    const funnelIndex = new Map<string, number>();
    for (let i = 0; i < dbFunnels.length; i++) {
      funnelIndex.set(funnelKey(dbFunnels[i].member_id, dbFunnels[i].week_key), i);
    }

    for (const row of superhexRows) {
      const memberId = memberIdByName.get(row.rep_name.toLowerCase().trim());
      if (!memberId) {
        console.warn(`[superhex] No member match for rep_name="${row.rep_name}"`);
        continue;
      }
      const weekKey = row.activity_week;
      const key = funnelKey(memberId, weekKey);
      const existingIdx = funnelIndex.get(key);

      if (existingIdx !== undefined) {
        // Existing manual row — superhex is baseline, non-zero manual values win
        const f = dbFunnels[existingIdx];
        f.calls = f.calls > 0 ? f.calls : row.calls_count;
        f.connects = f.connects > 0 ? f.connects : row.connects_count;
        f.ops = f.ops > 0 ? f.ops : row.total_ops;
        f.demos = f.demos > 0 ? f.demos : row.total_demos;
        f.wins = f.wins > 0 ? f.wins : row.total_wins;
        f.feedback = f.feedback > 0 ? f.feedback : row.total_feedback;
        f.activity = f.activity > 0 ? f.activity : row.total_activity_count;
      } else {
        // No manual row — create synthetic funnel from superhex
        const synthetic: DbWeeklyFunnel = {
          id: `superhex-${row.id}`,
          member_id: memberId,
          week_key: weekKey,
          role: null,
          tam: 0,
          calls: row.calls_count,
          connects: row.connects_count,
          ops: row.total_ops,
          demos: row.total_demos,
          wins: row.total_wins,
          feedback: row.total_feedback,
          activity: row.total_activity_count,
          submitted: false,
          submitted_at: null,
        };
        dbFunnels.push(synthetic);
      }
    }

    const { teams: t, unassigned: u } = assembleTeams(
      (tRes.data ?? []) as DbTeam[],
      dbMembers,
      dbFunnels,
      (wRes.data ?? []) as DbWinEntry[]
    );

    const touchedRows = (taRes.data ?? []) as DbMetricsTouchedAccounts[];
    const touchByName = new Map<string, { touchedAccounts: number; touchedTam: number }>();
    for (const row of touchedRows) {
      const key = row.rep_name.toLowerCase().trim();
      const existing = touchByName.get(key) ?? { touchedAccounts: 0, touchedTam: 0 };
      existing.touchedAccounts += row.touched_accounts;
      existing.touchedTam += row.tam;
      touchByName.set(key, existing);
    }
    for (const team of t) {
      for (const member of team.members) {
        const touch = touchByName.get(member.name.toLowerCase().trim());
        if (touch) {
          member.touchedAccounts = touch.touchedAccounts;
          member.touchedTam = touch.touchedTam;
        }
      }
    }
    for (const member of u) {
      const touch = touchByName.get(member.name.toLowerCase().trim());
      if (touch) {
        member.touchedAccounts = touch.touchedAccounts;
        member.touchedTam = touch.touchedTam;
      }
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
      .on("postgres_changes", { event: "*", schema: "public", table: "superhex" }, debouncedLoadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "teams" }, debouncedLoadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "members" }, debouncedLoadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "weekly_funnels" }, debouncedLoadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "win_entries" }, debouncedLoadAll)
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
    const member: TeamMember = { id, name, level: null, goals: memberGoals, wins: [], ducksEarned: 0, funnelByWeek: {}, isActive: true, touchedAccounts: 0, touchedTam: 0 };
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
